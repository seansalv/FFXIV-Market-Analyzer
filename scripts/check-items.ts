import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { supabaseAdmin } from '../lib/supabase/server';

async function checkItems() {
  console.log('Checking item is_craftable status...\n');

  // Count craftable items
  const { count: craftable } = await supabaseAdmin
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('is_craftable', true);

  // Count non-craftable items
  const { count: notCraftable } = await supabaseAdmin
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('is_craftable', false);

  // Count null items
  const { count: nullCraftable } = await supabaseAdmin
    .from('items')
    .select('*', { count: 'exact', head: true })
    .is('is_craftable', null);

  // Total items
  const { count: total } = await supabaseAdmin
    .from('items')
    .select('*', { count: 'exact', head: true });

  console.log('Item counts by is_craftable status:');
  console.log('  Craftable (true):', craftable);
  console.log('  Not Craftable (false):', notCraftable);
  console.log('  Unset (null):', nullCraftable);
  console.log('  Total:', total);

  // Sample items with is_craftable = true
  const { data: sampleCraftable } = await supabaseAdmin
    .from('items')
    .select('id, name, is_craftable')
    .eq('is_craftable', true)
    .limit(5);
  
  console.log('\nSample craftable items:');
  console.log(sampleCraftable);

  // Sample items with is_craftable = false
  const { data: sampleNotCraftable } = await supabaseAdmin
    .from('items')
    .select('id, name, is_craftable')
    .eq('is_craftable', false)
    .limit(5);
  
  console.log('\nSample non-craftable items:');
  console.log(sampleNotCraftable);

  // Check daily_item_stats that have data
  console.log('\n---\nChecking daily_item_stats with is_craftable join...\n');
  
  const { data: statsWithCraftable, error } = await supabaseAdmin
    .from('daily_item_stats')
    .select(`
      item_id,
      items!inner(id, name, is_craftable)
    `)
    .limit(10);

  if (error) {
    console.error('Error querying stats:', error);
  } else {
    console.log('Sample stats with item craftable status:');
    for (const stat of statsWithCraftable || []) {
      const item = (stat as any).items;
      console.log(`  Item ${stat.item_id}: ${item?.name} - is_craftable: ${item?.is_craftable}`);
    }
  }

  // Count stats where item is craftable
  const { count: craftableStats } = await supabaseAdmin
    .from('daily_item_stats')
    .select('*, items!inner(*)', { count: 'exact', head: true })
    .eq('items.is_craftable', true);

  const { count: notCraftableStats } = await supabaseAdmin
    .from('daily_item_stats')
    .select('*, items!inner(*)', { count: 'exact', head: true })
    .eq('items.is_craftable', false);

  const { count: nullCraftableStats } = await supabaseAdmin
    .from('daily_item_stats')
    .select('*, items!inner(*)', { count: 'exact', head: true })
    .is('items.is_craftable', null);

  console.log('\nDaily stats by item craftable status:');
  console.log('  Stats for craftable items:', craftableStats);
  console.log('  Stats for non-craftable items:', notCraftableStats);
  console.log('  Stats for null craftable items:', nullCraftableStats);
}

checkItems().catch(console.error);

