/**
 * Sync craftable item flags from XIVAPI Recipe data
 * 
 * This script fetches all recipes from XIVAPI and updates the is_craftable
 * flag in the items table based on whether an item has a recipe.
 * 
 * Run after initial item ingestion to populate is_craftable correctly.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { supabaseAdmin } from '../lib/supabase/server';

const XIVAPI_URL = 'https://v2.xivapi.com/api';

interface RecipeResult {
  row_id: number;
  fields: {
    ItemResult?: {
      value: number;
      row_id: number;
    };
  };
}

async function fetchCraftableItemIds(): Promise<Set<number>> {
  const craftableItemIds = new Set<number>();
  
  // XIVAPI v2 has a schema endpoint that can tell us how many recipes exist
  // We'll paginate through all recipes using offset
  const limit = 500;
  let offset = 0;
  let hasMore = true;
  let totalFetched = 0;
  
  console.log('📡 Fetching all recipes from XIVAPI...\n');
  
  while (hasMore) {
    try {
      // Use ItemResult (not ItemResult.ID) to ensure row_id/value are populated
      const url = `${XIVAPI_URL}/sheet/Recipe?limit=${limit}&after=${offset}&fields=ItemResult`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Failed to fetch recipes at offset ${offset}: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      const rows = data.rows || [];
      
      if (rows.length === 0) {
        hasMore = false;
        break;
      }
      
      for (const row of rows) {
        const itemId = row.fields?.ItemResult?.row_id || row.fields?.ItemResult?.value;
        if (itemId && itemId > 0) {
          craftableItemIds.add(itemId);
        }
      }
      
      totalFetched += rows.length;
      offset += limit;
      
      // Progress update every 2000 recipes
      if (totalFetched % 2000 === 0) {
        console.log(`   Fetched ${totalFetched} recipes, found ${craftableItemIds.size} unique craftable items...`);
      }
      
      // Small delay to be nice to the API
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // If we got fewer than limit, we're done
      if (rows.length < limit) {
        hasMore = false;
      }
    } catch (error) {
      console.error(`Error fetching recipes at offset ${offset}:`, error);
      break;
    }
  }
  
  console.log(`\n✅ Fetched ${totalFetched} recipes, found ${craftableItemIds.size} unique craftable items\n`);
  
  return craftableItemIds;
}

async function updateCraftableFlags(craftableItemIds: Set<number>) {
  console.log('📝 Updating is_craftable flags in database...\n');
  
  // Get all item IDs we have in the database
  // Type assertion needed due to Proxy wrapper breaking type inference
  const { data: allItems, error: itemsError } = await (supabaseAdmin as any)
    .from('items')
    .select('id');
  
  if (itemsError) {
    console.error('Error fetching items:', itemsError);
    return;
  }
  
  const allItemIds = (allItems as any[])?.map((i: any) => i.id) || [];
  console.log(`   Found ${allItemIds.length} items in database`);
  
  // Determine which items are craftable (intersection of our items and craftable items)
  const ourCraftableItems = allItemIds.filter(id => craftableItemIds.has(id));
  
  console.log(`   ${ourCraftableItems.length} items are craftable\n`);
  
  // Update craftable items in batches
  if (ourCraftableItems.length > 0) {
    const batchSize = 500;
    let updated = 0;
    
    for (let i = 0; i < ourCraftableItems.length; i += batchSize) {
      const batch = ourCraftableItems.slice(i, i + batchSize);
      // Type assertion needed due to Proxy wrapper breaking type inference
      const { error } = await (supabaseAdmin as any)
        .from('items')
        .update({ is_craftable: true })
        .in('id', batch);
      
      if (error) {
        console.error(`Error updating batch at ${i}:`, error);
      } else {
        updated += batch.length;
      }
    }
    console.log(`✅ Set is_craftable = true for ${updated} items`);
  }
}

async function verifyAndReport() {
  console.log('\n📊 Verification:');
  
  const { count: craftable } = await supabaseAdmin
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('is_craftable', true);

  const { count: notCraftable } = await supabaseAdmin
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('is_craftable', false);

  const { data: sampleCraftable } = await supabaseAdmin
    .from('items')
    .select('id, name, is_craftable')
    .eq('is_craftable', true)
    .limit(5);

  const { data: sampleNotCraftable } = await supabaseAdmin
    .from('items')
    .select('id, name, is_craftable')
    .eq('is_craftable', false)
    .limit(5);

  console.log(`   Craftable items: ${craftable}`);
  console.log(`   Non-craftable items: ${notCraftable}`);
  
  console.log('\n   Sample craftable items:');
  for (const item of (sampleCraftable || []) as any[]) {
    console.log(`     - ${item.name} (ID: ${item.id})`);
  }
  
  console.log('\n   Sample non-craftable items:');
  for (const item of (sampleNotCraftable || []) as any[]) {
    console.log(`     - ${item.name} (ID: ${item.id})`);
  }
}

async function main() {
  console.log('========================================');
  console.log('  Sync Craftable Items from XIVAPI');
  console.log('========================================\n');
  
  const craftableItemIds = await fetchCraftableItemIds();
  await updateCraftableFlags(craftableItemIds);
  await verifyAndReport();
  
  console.log('\n✅ Done!');
}

main().catch(console.error);

