/**
 * Database operations for market sales and daily stats
 */
import { supabaseAdmin } from '../supabase/server';
import type { MarketSale, DailyItemStats } from '../types/database';
import type { UniversalisMarketData, UniversalisHistoryEntry } from '../types/api';

/**
 * Insert or update market sales from Universalis history
 */
export async function upsertMarketSales(
  itemId: number,
  worldId: number,
  historyEntries: UniversalisHistoryEntry[]
): Promise<number> {
  if (historyEntries.length === 0) {
    return 0;
  }

  // Convert Universalis history to our schema
  const sales: Array<Omit<MarketSale, 'id' | 'created_at'>> = historyEntries.map((entry) => ({
    item_id: itemId,
    world_id: worldId,
    price_per_unit: entry.pricePerUnit,
    quantity: entry.quantity,
    buyer_name: entry.buyerName || null,
    sale_timestamp: new Date(entry.timestamp * 1000).toISOString(),
    hq: entry.hq || false,
    on_mannequin: entry.onMannequin || false,
  }));

  // Insert in batches to avoid query size limits
  const batchSize = 1000;
  let inserted = 0;

  for (let i = 0; i < sales.length; i += batchSize) {
    const batch = sales.slice(i, i + batchSize);
    
    // Use upsert with conflict on (item_id, world_id, sale_timestamp, price_per_unit, quantity)
    // to avoid duplicates, but since we don't have a unique constraint on that combination,
    // we'll just insert and let the database handle it
    const { error } = await supabaseAdmin
      .from('market_sales')
      .insert(batch);

    if (error) {
      console.error(`Error inserting sales batch: ${error.message}`);
      // Continue with next batch
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
}

/**
 * Calculate and upsert daily aggregated stats for an item on a world
 */
export async function upsertDailyStats(
  itemId: number,
  worldId: number,
  marketData: UniversalisMarketData
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const statDate = today.toISOString().split('T')[0];

  // Calculate stats from recent history (last 24 hours)
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentHistory = marketData.recentHistory.filter(
    (entry) => entry.timestamp * 1000 >= oneDayAgo
  );

  const unitsSold = recentHistory.reduce((sum, entry) => sum + entry.quantity, 0);
  const totalRevenue = recentHistory.reduce(
    (sum, entry) => sum + entry.pricePerUnit * entry.quantity,
    0
  );
  const avgPrice = unitsSold > 0 ? Math.round(totalRevenue / unitsSold) : 0;
  const prices = recentHistory.map((e) => e.pricePerUnit);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
  const activeListings = marketData.listings.length;
  const totalListingsQuantity = marketData.listings.reduce(
    (sum, listing) => sum + listing.quantity,
    0
  );

  const { error } = await supabaseAdmin
    .from('daily_item_stats')
    .upsert(
      {
        item_id: itemId,
        world_id: worldId,
        stat_date: statDate,
        units_sold: unitsSold,
        total_revenue: totalRevenue,
        avg_price: avgPrice,
        min_price: minPrice,
        max_price: maxPrice,
        active_listings: activeListings,
        total_listings_quantity: totalListingsQuantity,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'item_id,world_id,stat_date',
      }
    );

  if (error) {
    throw new Error(
      `Failed to upsert daily stats for item ${itemId} on world ${worldId}: ${error.message}`
    );
  }
}

/**
 * Get daily stats for multiple days (for timeframe calculations)
 */
export async function getDailyStatsForTimeframe(
  itemId: number,
  worldIds: number[],
  days: number
): Promise<DailyItemStats[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  const { data, error } = await supabaseAdmin
    .from('daily_item_stats')
    .select('*')
    .eq('item_id', itemId)
    .in('world_id', worldIds)
    .gte('stat_date', cutoffDateStr)
    .order('stat_date', { ascending: false });

  if (error) {
    throw new Error(`Failed to get daily stats: ${error.message}`);
  }

  return data || [];
}

