/**
 * Database operations for market sales and daily stats
 */
import { supabaseAdmin } from '../supabase/server';
import type { MarketSale, DailyItemStats } from '../types/database';
import type { UniversalisMarketData, UniversalisHistoryEntry } from '../types/api';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function quartiles(values: number[]): { q1: number; q3: number } {
  if (values.length === 0) return { q1: 0, q3: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted.slice(0, mid);
  const upper = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
  return { q1: median(lower), q3: median(upper) };
}

function mad(values: number[], med: number): number {
  if (values.length === 0) return 0;
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

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

  // --- Robust stats (RMT-resistant) ---
  const priceMedian = median(prices);
  const { q1, q3 } = quartiles(prices);
  const iqr = q3 - q1;
  const dailyMad = mad(prices, priceMedian);
  const hasEnoughSales = recentHistory.length >= 5;

  // Anchor: until we maintain rolling anchors, use daily median as a temporary anchor
  const anchor = priceMedian > 0 ? priceMedian : null;
  const anchorUpper = anchor ? anchor * 20 : Infinity; // obvious RMT guard

  const filteredSales = recentHistory.filter((entry) => {
    const p = entry.pricePerUnit;

    // Obvious outlier vs anchor
    if (p > anchorUpper) return false;

    if (hasEnoughSales) {
      const iqrUpper = q3 + 3 * iqr;
      const madUpper = dailyMad > 0 ? priceMedian + 6 * dailyMad : Infinity;
      if (p > Math.min(iqrUpper, madUpper)) return false;
    }

    // Qty=1 guard only for cheap items
    const isLikelyCheap = anchor !== null && anchor < 1000;
    if (isLikelyCheap && entry.quantity === 1 && p > q3 * 20) return false;

    return true;
  });

  // Clamp remaining prices so a single sale cannot dominate
  const clampBase = anchor ?? priceMedian;
  const clampCap = clampBase > 0 ? clampBase * 10 : Infinity;
  const clampedSales = filteredSales.map((s) => ({
    ...s,
    pricePerUnit: clampCap !== Infinity ? Math.min(s.pricePerUnit, clampCap) : s.pricePerUnit,
  }));

  const robustSampleSize = clampedSales.length;
  const robustUnitsSold = clampedSales.reduce((sum, entry) => sum + entry.quantity, 0);
  const robustTotalRevenue = clampedSales.reduce(
    (sum, entry) => sum + entry.pricePerUnit * entry.quantity,
    0
  );
  const robustPrices = clampedSales.map((e) => e.pricePerUnit);
  const robustAvgPrice =
    robustPrices.length > 0 ? Math.round(median(robustPrices)) : null;
  const isLowConfidence = robustSampleSize < 5;

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
        robust_avg_price: robustAvgPrice,
        robust_total_revenue: robustTotalRevenue,
        robust_units_sold: robustUnitsSold,
        robust_sample_size: robustSampleSize,
        // Anchors will be populated once we maintain rolling history; using null placeholder for now
        typical_price_30d: null,
        price_p90_30d: null,
        is_low_confidence: isLowConfidence,
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

/**
 * Clean up old daily stats data beyond retention period
 * Default retention: 45 days (gives buffer beyond 30-day analytics view)
 * Returns number of rows deleted
 */
export async function cleanupOldDailyStats(retentionDays: number = 45): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  const { data, error } = await supabaseAdmin
    .from('daily_item_stats')
    .delete()
    .lt('stat_date', cutoffDateStr)
    .select('id');

  if (error) {
    console.error(`Failed to cleanup old daily stats: ${error.message}`);
    return 0;
  }

  return data?.length || 0;
}

/**
 * Clean up old market sales data beyond retention period
 * Only needed if STORE_RAW_SALES is enabled
 * Returns number of rows deleted
 */
export async function cleanupOldMarketSales(retentionDays: number = 45): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffDateStr = cutoffDate.toISOString();

  const { data, error } = await supabaseAdmin
    .from('market_sales')
    .delete()
    .lt('sale_timestamp', cutoffDateStr)
    .select('id');

  if (error) {
    console.error(`Failed to cleanup old market sales: ${error.message}`);
    return 0;
  }

  return data?.length || 0;
}

