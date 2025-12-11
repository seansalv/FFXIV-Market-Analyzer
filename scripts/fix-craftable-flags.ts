/**
 * Fix is_craftable flags in the items table
 * 
 * This script sets is_craftable = true for all items that have a recipe in the recipes table.
 * Run this after ingestion to ensure the flags are correctly set.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { supabaseAdmin } from '../lib/supabase/server';

async function fixCraftableFlags() {
  console.log('🔧 Fixing is_craftable flags in items table...\n');

  // Get all items that have recipes
  const { data: recipes, error: recipesError } = await supabaseAdmin
    .from('recipes')
    .select('item_id');

  if (recipesError) {
    console.error('Error fetching recipes:', recipesError);
    return;
  }

  const craftableItemIds = new Set(recipes?.map(r => r.item_id) || []);
  console.log(`Found ${craftableItemIds.size} items with recipes\n`);

  // Update all items with recipes to is_craftable = true
  const { count: updatedTrue, error: updateTrueError } = await supabaseAdmin
    .from('items')
    .update({ is_craftable: true })
    .in('id', Array.from(craftableItemIds))
    .select('id', { count: 'exact', head: true });

  if (updateTrueError) {
    console.error('Error updating craftable items:', updateTrueError);
    return;
  }

  console.log(`✅ Updated ${updatedTrue} items to is_craftable = true\n`);

  // Ensure all OTHER items are set to is_craftable = false
  const { count: updatedFalse, error: updateFalseError } = await supabaseAdmin
    .from('items')
    .update({ is_craftable: false })
    .not('id', 'in', `(${Array.from(craftableItemIds).join(',')})`)
    .select('id', { count: 'exact', head: true });

  if (updateFalseError) {
    console.error('Error updating non-craftable items:', updateFalseError);
    return;
  }

  console.log(`✅ Updated ${updatedFalse} items to is_craftable = false\n`);

  // Verify the fix
  const { count: craftable } = await supabaseAdmin
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('is_craftable', true);

  const { count: notCraftable } = await supabaseAdmin
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('is_craftable', false);

  console.log('---\n📊 Final counts:');
  console.log(`   Craftable: ${craftable}`);
  console.log(`   Not Craftable: ${notCraftable}`);
  console.log(`   Total with recipes in DB: ${craftableItemIds.size}`);
}

fixCraftableFlags().catch(console.error);

