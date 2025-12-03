/**
 * Profitability calculation and ranking functions
 */

import type { DailyItemStats } from '../types/database';
import type { RankingMetric, Timeframe } from '../types/api';
import { getRecipe } from '../db/items';

export interface ItemMetrics {
  unitsSold: number;
  salesVelocity: number;
  totalRevenue: number;
  avgPrice: number;
  minPrice: number | null;
  maxPrice: number | null;
  profitPerUnit: number | null;
  marginPercent: number | null;
  activeListings: number;
}

/**
 * Calculate metrics from daily stats for a given timeframe
 */
export async function calculateMetrics(
  dailyStats: DailyItemStats[],
  timeframe: Timeframe,
  itemId: number
): Promise<ItemMetrics> {
  const days = timeframe === '1d' ? 1 : timeframe === '7d' ? 7 : 30;

  // Aggregate stats across all days
  const unitsSold = dailyStats.reduce((sum, stat) => sum + stat.units_sold, 0);
  const totalRevenue = dailyStats.reduce((sum, stat) => sum + stat.total_revenue, 0);
  const avgPrice = unitsSold > 0 ? Math.round(totalRevenue / unitsSold) : 0;

  // Get min/max prices across all days
  const allMinPrices = dailyStats
    .map((s) => s.min_price)
    .filter((p): p is number => p !== null);
  const allMaxPrices = dailyStats
    .map((s) => s.max_price)
    .filter((p): p is number => p !== null);

  const minPrice = allMinPrices.length > 0 ? Math.min(...allMinPrices) : null;
  const maxPrice = allMaxPrices.length > 0 ? Math.max(...allMaxPrices) : null;

  // Sales velocity (units per day)
  const salesVelocity = unitsSold / days;

  // Active listings (use the most recent day's count)
  const activeListings =
    dailyStats.length > 0 ? dailyStats[0].active_listings : 0;

  // Calculate profit if craftable
  let profitPerUnit: number | null = null;
  let marginPercent: number | null = null;

  const recipe = await getRecipe(itemId);
  if (recipe && recipe.material_cost > 0 && avgPrice > 0) {
    profitPerUnit = avgPrice - recipe.material_cost;
    marginPercent = (profitPerUnit / avgPrice) * 100;
  }

  return {
    unitsSold,
    salesVelocity,
    totalRevenue,
    avgPrice,
    minPrice,
    maxPrice,
    profitPerUnit,
    marginPercent,
    activeListings,
  };
}

/**
 * Get ranking value for an item based on the selected metric
 */
export function getRankingValue(
  metrics: ItemMetrics,
  rankingMetric: RankingMetric
): number {
  switch (rankingMetric) {
    case 'revenue':
      return metrics.totalRevenue;
    case 'volume':
      return metrics.unitsSold;
    case 'avgPrice':
      return metrics.avgPrice;
    case 'profit':
      return metrics.profitPerUnit ?? -Infinity; // Put non-craftables at the end
    case 'roi':
      return metrics.marginPercent ?? -Infinity; // Put non-craftables at the end
    default:
      return metrics.totalRevenue;
  }
}

/**
 * Rank items by the selected metric
 */
export function rankItems<T extends { metrics: ItemMetrics }>(
  items: T[],
  rankingMetric: RankingMetric
): T[] {
  return [...items].sort((a, b) => {
    const aValue = getRankingValue(a.metrics, rankingMetric);
    const bValue = getRankingValue(b.metrics, rankingMetric);
    return bValue - aValue; // Descending order
  });
}

/**
 * Filter items based on criteria
 */
export function filterItems<T extends { metrics: ItemMetrics; category?: string | null; isCraftable?: boolean }>(
  items: T[],
  filters: {
    categories?: string[];
    craftableOnly?: boolean;
    nonCraftableOnly?: boolean;
    minSalesVelocity?: number;
    minRevenue?: number;
    maxListings?: number | null;
    minPrice?: number;
  }
): T[] {
  return items.filter((item) => {
    // Category filter
    if (filters.categories && filters.categories.length > 0) {
      if (!item.category || !filters.categories.includes(item.category)) {
        return false;
      }
    }

    // Craftable filter
    if (filters.craftableOnly && !item.isCraftable) {
      return false;
    }
    if (filters.nonCraftableOnly && item.isCraftable) {
      return false;
    }

    // Threshold filters
    if (filters.minSalesVelocity && item.metrics.salesVelocity < filters.minSalesVelocity) {
      return false;
    }
    if (filters.minRevenue && item.metrics.totalRevenue < filters.minRevenue) {
      return false;
    }
    if (filters.maxListings !== null && filters.maxListings !== undefined) {
      if (item.metrics.activeListings > filters.maxListings) {
        return false;
      }
    }
    if (filters.minPrice && item.metrics.avgPrice < filters.minPrice) {
      return false;
    }

    return true;
  });
}

