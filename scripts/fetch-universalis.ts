/**
 * Data ingestion script for Universalis API
 * 
 * Usage:
 *   npm run ingest
 * 
 * This script:
 * 1. Fetches market data from Universalis for configured items and worlds
 * 2. Stores raw sales history in market_sales table
 * 3. Calculates and stores daily aggregated stats
 * 4. Updates item metadata
 */

// Load environment variables from .env.local FIRST, before any other imports
// Use require() to ensure synchronous execution before ESM imports
const dotenv = require('dotenv');
const { resolve } = require('path');
const { existsSync } = require('fs');

// Load .env.local from the project root
const envPath = resolve(process.cwd(), '.env.local');
if (!existsSync(envPath)) {
  console.error(`❌ Error: .env.local file not found at ${envPath}`);
  console.error('   Please create .env.local in the project root with your Supabase credentials.');
  process.exit(1);
}

const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('❌ Error loading .env.local:', result.error);
  process.exit(1);
}

// Verify required environment variables are set
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: Missing required environment variables in .env.local');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.error(`   NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING'}`);
  console.error(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING'}`);
  process.exit(1);
}

import { fetchMarketDataBatch, getPopularItemIds, getAllMarketableItemIds } from '../lib/universalis/client';
import { upsertItem, upsertRecipe, getItem } from '../lib/db/items';
import { getAllNAWorlds, getWorldByName, getWorldsByDataCenter } from '../lib/db/worlds';
import { upsertMarketSales, upsertDailyStats } from '../lib/db/market-data';
import { fetchItemData, fetchItemDataBatch, fetchRecipeData, fetchRecipeDataBatch } from '../lib/xivapi/client';

// Configuration
const WORLDS_TO_INGEST: string = 'all-na'; // 'all-na', 'aether', 'primal', 'crystal', 'dynamis', or specific world name
const USE_ALL_ITEMS = true; // Set to true to ingest ALL marketable items, false to use getPopularItemIds()
const ITEM_BATCH_SIZE = 100; // Process items in batches to avoid overwhelming APIs

// Parse command-line arguments
function parseArgs(): { limit?: number; skipRecipes?: boolean } {
  const args = process.argv.slice(2);
  const result: { limit?: number; skipRecipes?: boolean } = {};
  
  // Parse --limit flag
  const limitIndex = args.findIndex(arg => arg === '--limit' || arg === '-l');
  if (limitIndex !== -1 && limitIndex + 1 < args.length) {
    const limitValue = parseInt(args[limitIndex + 1], 10);
    if (!isNaN(limitValue) && limitValue > 0) {
      result.limit = limitValue;
    }
  }
  
  // Parse --skip-recipes flag
  if (args.includes('--skip-recipes')) {
    result.skipRecipes = true;
  }
  
  return result;
}

async function main() {
  const { limit, skipRecipes } = parseArgs();
  
  console.log('🚀 Starting Universalis data ingestion...\n');
  if (limit) {
    console.log(`⚠️  LIMIT MODE: Processing only first ${limit} items (for testing)\n`);
  }
  if (skipRecipes) {
    console.log(`⚠️  SKIP RECIPES: Recipe cost calculation will be skipped\n`);
  }

  try {
    // Get worlds to process
    let worlds;
    if (WORLDS_TO_INGEST === 'all-na') {
      worlds = await getAllNAWorlds();
      console.log(`📍 Processing all ${worlds.length} NA worlds`);
    } else if (['aether', 'primal', 'crystal', 'dynamis'].includes(WORLDS_TO_INGEST.toLowerCase())) {
      worlds = await getWorldsByDataCenter(WORLDS_TO_INGEST.toLowerCase());
      console.log(`📍 Processing ${worlds.length} worlds in ${WORLDS_TO_INGEST} DC`);
    } else {
      const world = await getWorldByName(WORLDS_TO_INGEST);
      if (!world) {
        throw new Error(`World not found: ${WORLDS_TO_INGEST}`);
      }
      worlds = [world];
      console.log(`📍 Processing single world: ${WORLDS_TO_INGEST}`);
    }

    // Get items to track
    let itemIds: number[];
    if (USE_ALL_ITEMS) {
      console.log('📋 Fetching all marketable items from Universalis...');
      itemIds = await getAllMarketableItemIds();
      console.log(`📦 Found ${itemIds.length} marketable items to track`);
      
      // Apply limit if specified
      if (limit && limit > 0) {
        itemIds = itemIds.slice(0, limit);
        console.log(`📦 Limited to first ${itemIds.length} items (--limit ${limit})\n`);
      } else {
        console.log('\n');
      }
    } else {
      itemIds = getPopularItemIds();
      if (limit && limit > 0) {
        itemIds = itemIds.slice(0, limit);
      }
      console.log(`📦 Tracking ${itemIds.length} items (using curated list)\n`);
    }

    // Fetch item metadata from XIVAPI in batches (not per world)
    console.log('📋 Fetching item metadata from XIVAPI...\n');
    const itemMetadata = new Map<number, {
      name: string;
      category: string | null;
      isCraftable: boolean;
      iconUrl: string | null;
      recipeId: number | null;
    }>();

    // Process items in batches to avoid overwhelming XIVAPI
    const batches: number[][] = [];
    for (let i = 0; i < itemIds.length; i += ITEM_BATCH_SIZE) {
      batches.push(itemIds.slice(i, i + ITEM_BATCH_SIZE));
    }

    let processed = 0;
    let itemsInsertedInBatches = 0;
    let itemsUpdatedInBatches = 0;
    let itemsAlreadyUpToDate = 0;
    
    for (const batch of batches) {
      console.log(`   Processing batch ${Math.floor(processed / ITEM_BATCH_SIZE) + 1}/${batches.length} (${batch.length} items)...`);
      
      // Fetch all items in this batch with a single API call
      try {
        const batchResults = await fetchItemDataBatch(batch);
        
        // Process results from batch
        for (const itemId of batch) {
          const itemData = batchResults.get(itemId);
          if (itemData) {
            // v2 API: nested objects are in fields property
            const categoryName = itemData.ItemUICategory?.fields?.Name || itemData.ItemKind?.fields?.Name || null;
            const recipeId = itemData.Recipe?.row_id || itemData.Recipe?.value || null;
            
            itemMetadata.set(itemId, {
              name: itemData.Name || itemId.toString(),
              category: categoryName,
              isCraftable: !!recipeId,
              iconUrl: itemData.Icon ? `https://xivapi.com${itemData.Icon}` : null,
              recipeId: recipeId,
            });
          } else {
            // Set default metadata if item not found in batch response
            itemMetadata.set(itemId, {
              name: itemId.toString(),
              category: null,
              isCraftable: false,
              iconUrl: null,
              recipeId: null,
            });
          }
          processed++;
        }
      } catch (error) {
        // If batch fails, set default metadata for all items in batch
        console.warn(`   ⚠ Batch fetch failed, setting default metadata for ${batch.length} items`);
        for (const itemId of batch) {
          itemMetadata.set(itemId, {
            name: itemId.toString(),
            category: null,
            isCraftable: false,
            iconUrl: null,
            recipeId: null,
          });
          processed++;
        }
      }
      
      // Insert items from this batch into database immediately
      // This ensures progress is saved even if script is interrupted
      for (const itemId of batch) {
        const metadata = itemMetadata.get(itemId);
        if (metadata) {
          try {
            const existingItem = await getItem(itemId);
            const shouldUpdate = !existingItem || 
              existingItem.name === itemId.toString() || 
              !existingItem.category ||
              existingItem.name !== metadata.name;

            if (shouldUpdate) {
              await upsertItem({
                id: itemId,
                name: metadata.name,
                category: metadata.category,
                is_craftable: metadata.isCraftable,
                icon_url: metadata.iconUrl,
              });
              if (existingItem) {
                itemsUpdatedInBatches++;
              } else {
                itemsInsertedInBatches++;
              }
            } else {
              itemsAlreadyUpToDate++;
            }
          } catch (error) {
            // Continue on error, don't stop the batch
          }
        }
      }
      
      const statusParts = [];
      if (itemsInsertedInBatches > 0) statusParts.push(`${itemsInsertedInBatches} new`);
      if (itemsUpdatedInBatches > 0) statusParts.push(`${itemsUpdatedInBatches} updated`);
      if (itemsAlreadyUpToDate > 0) statusParts.push(`${itemsAlreadyUpToDate} already up-to-date`);
      const statusText = statusParts.length > 0 ? ` (${statusParts.join(', ')})` : '';
      
      console.log(`   ✓ Processed ${processed}/${itemIds.length} items${statusText}`);
    }
    
    const itemsWithNames = Array.from(itemMetadata.values()).filter(m => m.name && !/^\d+$/.test(m.name));
    console.log(`\n✅ Fetched metadata for ${itemsWithNames.length} items with names, ${itemIds.length - itemsWithNames.length} items pending`);
    const dbStatusParts = [];
    if (itemsInsertedInBatches > 0) dbStatusParts.push(`${itemsInsertedInBatches} new`);
    if (itemsUpdatedInBatches > 0) dbStatusParts.push(`${itemsUpdatedInBatches} updated`);
    if (itemsAlreadyUpToDate > 0) dbStatusParts.push(`${itemsAlreadyUpToDate} already up-to-date`);
    console.log(`✅ Database: ${dbStatusParts.length > 0 ? dbStatusParts.join(', ') : 'no changes'} items\n`);

    // Fetch and calculate recipe costs for craftable items (in batches)
    // Skip if --skip-recipes flag is set
    if (!skipRecipes) {
      const craftableItems = Array.from(itemMetadata.entries()).filter(([_, m]) => m.isCraftable && m.recipeId);
      console.log(`\n🧪 Calculating recipe costs for ${craftableItems.length} craftable items...\n`);
      
      const firstWorld = worlds[0]; // Use first world's prices for cost calculation
      if (firstWorld && craftableItems.length > 0) {
        // Batch fetch all recipe data first
        const recipeIds = craftableItems.map(([_, m]) => m.recipeId!).filter(id => id > 0);
        console.log(`   Fetching ${recipeIds.length} recipes from XIVAPI...`);
        
        // Fetch recipes in batches of 100
        const recipeDataMap = new Map<number, any>();
        const recipeBatchSize = 100;
        for (let i = 0; i < recipeIds.length; i += recipeBatchSize) {
          const batchIds = recipeIds.slice(i, i + recipeBatchSize);
          try {
            const batchResults = await fetchRecipeDataBatch(batchIds);
            batchResults.forEach((value, key) => recipeDataMap.set(key, value));
          } catch (error) {
            // Fall back to individual fetches for this batch
            for (const recipeId of batchIds) {
              try {
                const recipe = await fetchRecipeData(recipeId);
                if (recipe) recipeDataMap.set(recipeId, recipe);
              } catch (e) { /* skip */ }
            }
          }
          console.log(`   ✓ Fetched ${Math.min(i + recipeBatchSize, recipeIds.length)}/${recipeIds.length} recipes`);
        }
        
        // Collect all unique ingredient IDs across all recipes
        const allIngredientIds = new Set<number>();
        for (const [itemId, metadata] of craftableItems) {
          const recipeData = recipeDataMap.get(metadata.recipeId!);
          if (recipeData?.Ingredients) {
            for (const ing of recipeData.Ingredients) {
              const ingId = ing.ItemIngredient?.row_id || ing.ItemIngredient?.value;
              if (ingId) allIngredientIds.add(ingId);
            }
          }
        }
        
        // Batch fetch all ingredient prices at once
        console.log(`   Fetching prices for ${allIngredientIds.size} unique ingredients...`);
        const ingredientPrices = await fetchMarketDataBatch(firstWorld.name, Array.from(allIngredientIds));
        console.log(`   ✓ Got prices for ${Object.keys(ingredientPrices).length} ingredients`);
        
        // Now process each craftable item with the cached data
        let recipeProcessed = 0;
        let recipesUpdated = 0;
        for (const [itemId, metadata] of craftableItems) {
          const recipeData = recipeDataMap.get(metadata.recipeId!);
          if (recipeData?.Ingredients?.length > 0) {
            let totalCost = 0;
            
            for (const ingredient of recipeData.Ingredients) {
              const ingredientId = ingredient.ItemIngredient?.row_id || ingredient.ItemIngredient?.value;
              const quantity = ingredient.AmountIngredient || 0;
              if (ingredientId && ingredientPrices[ingredientId]) {
                const price = ingredientPrices[ingredientId].currentAveragePrice || 0;
                totalCost += price * quantity;
              }
            }
            
            if (totalCost > 0) {
              try {
                await upsertRecipe({
                  item_id: itemId,
                  material_cost: Math.round(totalCost),
                  material_list: {
                    recipeId: recipeData.ID,
                    ingredients: recipeData.Ingredients.map((ing: any) => ({
                      itemId: ing.ItemIngredient?.row_id || ing.ItemIngredient?.value,
                      name: ing.ItemIngredient?.fields?.Name,
                      quantity: ing.AmountIngredient,
                    })),
                  },
                });
                recipesUpdated++;
              } catch (e) { /* skip */ }
            }
          }
          recipeProcessed++;
          if (recipeProcessed % 500 === 0) {
            console.log(`   ✓ Processed ${recipeProcessed}/${craftableItems.length} recipes (${recipesUpdated} updated)`);
          }
        }
        console.log(`   ✅ Recipe processing complete: ${recipesUpdated}/${craftableItems.length} recipes with costs calculated`);
      } else {
        console.log(`   ℹ️  No craftable items found or no worlds available`);
      }
    } else {
      console.log(`\n⏭️  Skipping recipe cost calculation (--skip-recipes flag set)\n`);
    }

    console.log('\n📊 Processing market data for each world...\n');

    let totalProcessed = 0;
    let totalErrors = 0;

    // Process each world
    // For large item lists, process items in batches per world
    const worldItemBatches: number[][] = [];
    for (let i = 0; i < itemIds.length; i += ITEM_BATCH_SIZE) {
      worldItemBatches.push(itemIds.slice(i, i + ITEM_BATCH_SIZE));
    }

    // Process a single world (extracted for parallel processing)
    async function processWorld(world: typeof worlds[0]): Promise<{ processed: number; errors: number }> {
      let worldProcessed = 0;
      let worldErrors = 0;
      
      console.log(`\n🌍 Processing ${world.name} (${world.data_center})...`);

      try {
        // Process items in batches for this world
        let worldItemsProcessed = 0;
        const worldMarketDataMap: Record<number, any> = {};

        for (const batch of worldItemBatches) {
          try {
            const batchMarketData = await fetchMarketDataBatch(world.name, batch);
            Object.assign(worldMarketDataMap, batchMarketData);
            worldItemsProcessed += Object.keys(batchMarketData).length;
            console.log(`   ✓ Fetched data for ${worldItemsProcessed} items so far...`);
          } catch (batchError) {
            console.warn(`   ⚠ Error processing batch, continuing...`);
          }
        }

        const marketDataMap = worldMarketDataMap;
        
        if (Object.keys(marketDataMap).length === 0) {
          console.log(`   ⚠ No market data found for any items on ${world.name}`);
          return { processed: 0, errors: 0 };
        }
        
        console.log(`   ✓ Fetched data for ${Object.keys(marketDataMap).length} items`);

        // Process each item
        let itemsSaved = 0;
        let worldSalesInserted = 0;
        let worldStatsUpdated = 0;
        
        for (const [itemIdStr, marketData] of Object.entries(marketDataMap)) {
          const itemId = parseInt(itemIdStr, 10);

          try {
            // Get item metadata (already fetched from XIVAPI)
            const metadata = itemMetadata.get(itemId) || {
              name: itemId.toString(),
              category: null,
              isCraftable: false,
              iconUrl: null,
              recipeId: null,
            };

            // Item metadata is already inserted above, but ensure it's up to date
            // (in case metadata was updated or item was missing)
            const existingItem = await getItem(itemId);
            if (!existingItem || existingItem.name === itemId.toString() || existingItem.name !== metadata.name) {
              await upsertItem({
                id: itemId,
                name: metadata.name,
                category: metadata.category,
                is_craftable: metadata.isCraftable,
                icon_url: metadata.iconUrl,
              });
            }

            // Store recent sales history
            if (marketData.recentHistory && marketData.recentHistory.length > 0) {
              const inserted = await upsertMarketSales(
                itemId,
                world.id,
                marketData.recentHistory
              );
              worldSalesInserted += inserted;
            }

            // Calculate and store daily stats
            await upsertDailyStats(itemId, world.id, marketData);
            worldStatsUpdated++;
            itemsSaved++;

            // Log progress every 100 items
            if (itemsSaved % 100 === 0) {
              console.log(`   ✓ Processed ${itemsSaved}/${Object.keys(marketDataMap).length} items...`);
            }
          } catch (error) {
            console.error(`   ✗ Error processing item ${itemId}:`, error);
            worldErrors++;
          }
        }
        
        // Summary for this world
        console.log(`   ✅ ${world.name}: ${itemsSaved} items processed, ${worldSalesInserted} sales inserted, ${worldStatsUpdated} stats updated`);
        worldProcessed = itemsSaved;
      } catch (error) {
        console.error(`   ✗ Error processing world ${world.name}:`, error);
        worldErrors++;
      }
      
      return { processed: worldProcessed, errors: worldErrors };
    }

    // Process worlds in parallel batches of 8 (Universalis allows 8 simultaneous connections)
    const PARALLEL_WORLDS = 8;
    const worldBatches: typeof worlds[][] = [];
    for (let i = 0; i < worlds.length; i += PARALLEL_WORLDS) {
      worldBatches.push(worlds.slice(i, i + PARALLEL_WORLDS));
    }

    for (const worldBatch of worldBatches) {
      // Process this batch of worlds in parallel
      const results = await Promise.all(worldBatch.map(processWorld));
      
      // Aggregate results
      for (const result of results) {
        totalProcessed += result.processed;
        totalErrors += result.errors;
      }
      
      // Small delay between batches to avoid overwhelming the API
      if (worldBatches.indexOf(worldBatch) < worldBatches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n✅ Ingestion complete!`);
    console.log(`   Processed: ${totalProcessed} item-world combinations`);
    console.log(`   Errors: ${totalErrors}`);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

