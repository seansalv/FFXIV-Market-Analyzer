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
import { fetchItemData, fetchRecipeData } from '../lib/xivapi/client';

// Configuration
const WORLDS_TO_INGEST = 'all-na'; // 'all-na', 'aether', 'primal', 'crystal', 'dynamis', or specific world name
const USE_ALL_ITEMS = true; // Set to true to ingest ALL marketable items, false to use getPopularItemIds()
const ITEM_BATCH_SIZE = 100; // Process items in batches to avoid overwhelming APIs

async function main() {
  console.log('🚀 Starting Universalis data ingestion...\n');

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
      console.log(`📦 Found ${itemIds.length} marketable items to track\n`);
    } else {
      itemIds = getPopularItemIds();
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
    for (const batch of batches) {
      console.log(`   Processing batch ${Math.floor(processed / ITEM_BATCH_SIZE) + 1}/${batches.length} (${batch.length} items)...`);
      
      for (const itemId of batch) {
        try {
          const itemData = await fetchItemData(itemId);
          if (itemData) {
            itemMetadata.set(itemId, {
              name: itemData.Name || itemId.toString(),
              category: itemData.ItemUICategory?.Name || itemData.ItemKind?.Name || null,
              isCraftable: !!itemData.Recipe?.ID,
              iconUrl: itemData.Icon ? `https://xivapi.com${itemData.Icon}` : null,
              recipeId: itemData.Recipe?.ID || null,
            });
          } else {
            // Set default metadata if fetch fails
            itemMetadata.set(itemId, {
              name: itemId.toString(),
              category: null,
              isCraftable: false,
              iconUrl: null,
              recipeId: null,
            });
          }
        } catch (error) {
          // Set default metadata on error
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
      
      console.log(`   ✓ Processed ${processed}/${itemIds.length} items`);
    }
    
    const itemsWithNames = Array.from(itemMetadata.values()).filter(m => m.name && !/^\d+$/.test(m.name));
    console.log(`\n✅ Fetched metadata for ${itemsWithNames.length} items with names, ${itemIds.length - itemsWithNames.length} items pending\n`);

    // Insert ALL items into database (regardless of market data)
    // This ensures items are available for investigation even if they have no current market activity
    console.log('💾 Inserting all items into database...\n');
    let itemsInserted = 0;
    let itemsUpdated = 0;
    
    for (const [itemId, metadata] of itemMetadata.entries()) {
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
            itemsUpdated++;
          } else {
            itemsInserted++;
          }
        }
        
        if ((itemsInserted + itemsUpdated) % 100 === 0) {
          console.log(`   ✓ Processed ${itemsInserted + itemsUpdated}/${itemMetadata.size} items (${itemsInserted} new, ${itemsUpdated} updated)...`);
        }
      } catch (error) {
        console.warn(`   ⚠ Failed to insert item ${itemId}:`, error instanceof Error ? error.message : error);
      }
    }
    console.log(`\n✅ Database updated: ${itemsInserted} new items inserted, ${itemsUpdated} items updated\n`);

    // Fetch and calculate recipe costs for craftable items (in batches)
    const craftableItems = Array.from(itemMetadata.entries()).filter(([_, m]) => m.isCraftable && m.recipeId);
    console.log(`\n🧪 Calculating recipe costs for ${craftableItems.length} craftable items...\n`);
    
    const firstWorld = worlds[0]; // Use first world's prices for cost calculation
    if (firstWorld && craftableItems.length > 0) {
      // Process craftable items in smaller batches to avoid rate limits
      const recipeBatches: Array<[number, typeof itemMetadata extends Map<number, infer V> ? V : never]>[] = [];
      for (let i = 0; i < craftableItems.length; i += 50) {
        recipeBatches.push(craftableItems.slice(i, i + 50));
      }

      let recipeProcessed = 0;
      for (const batch of recipeBatches) {
        for (const [itemId, metadata] of batch) {
          if (metadata.recipeId) {
            try {
              const recipeData = await fetchRecipeData(metadata.recipeId);
              if (recipeData && recipeData.Ingredients && recipeData.Ingredients.length > 0) {
                // Calculate material cost using first world's current prices
                const ingredientIds = recipeData.Ingredients
                  .map(ing => ing.ItemIngredient?.ID)
                  .filter((id): id is number => !!id);

                if (ingredientIds.length > 0) {
                  try {
                    const ingredientPrices = await fetchMarketDataBatch(firstWorld.name, ingredientIds);
                    let totalCost = 0;

                    for (const ingredient of recipeData.Ingredients) {
                      const ingredientId = ingredient.ItemIngredient?.ID;
                      const quantity = ingredient.AmountIngredient || 0;
                      if (ingredientId && ingredientPrices[ingredientId]) {
                        const price = ingredientPrices[ingredientId].currentAveragePrice || 0;
                        totalCost += price * quantity;
                      }
                    }

                    if (totalCost > 0) {
                      await upsertRecipe({
                        item_id: itemId,
                        material_cost: Math.round(totalCost),
                        material_list: {
                          recipeId: recipeData.ID,
                          ingredients: recipeData.Ingredients.map(ing => ({
                            itemId: ing.ItemIngredient?.ID,
                            name: ing.ItemIngredient?.Name,
                            quantity: ing.AmountIngredient,
                          })),
                        },
                      });
                    }
                  } catch (priceError) {
                    // Silently skip if price calculation fails
                  }
                }
              }
            } catch (recipeError) {
              // Silently skip if recipe fetch fails
            }
          }
          recipeProcessed++;
        }
        console.log(`   ✓ Processed ${recipeProcessed}/${craftableItems.length} recipes`);
      }
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

    for (const world of worlds) {
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
          continue;
        }
        
        console.log(`   ✓ Fetched data for ${Object.keys(marketDataMap).length} items`);

        // Process each item
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
              console.log(`   ✓ Item ${itemId}: ${inserted} sales inserted`);
            }

            // Calculate and store daily stats
            await upsertDailyStats(itemId, world.id, marketData);
            console.log(`   ✓ Item ${itemId}: Daily stats updated`);

            totalProcessed++;
          } catch (error) {
            console.error(`   ✗ Error processing item ${itemId}:`, error);
            totalErrors++;
          }
        }
      } catch (error) {
        console.error(`   ✗ Error processing world ${world.name}:`, error);
        totalErrors++;
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

