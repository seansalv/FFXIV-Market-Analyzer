/**
 * API endpoint: GET /api/top-items
 * 
 * Returns the top N most profitable items based on filters and ranking criteria
 * 
 * OPTIMIZED VERSION:
 * - Single query with JOINs for items and recipes
 * - Aggregation done in a single pass
 * - No per-item database calls
 * - Pre-filtering where possible
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { TopItemsQueryParams, TopItemsResponse, MarketItem, Timeframe } from '@/lib/types/api';
import { getAllNAWorlds, getWorldsByDataCenter, getWorldByName } from '@/lib/db/worlds';
import { z } from 'zod';

// Validation schema
const querySchema = z.object({
  worldOrDc: z.string().optional().default('all-na'),
  timeframe: z.enum(['1d', '7d', '30d']).optional().default('7d'),
  categories: z.string().optional().transform((val) => (val ? val.split(',') : [])),
  craftableOnly: z.string().optional().transform((val) => val === 'true'),
  nonCraftableOnly: z.string().optional().transform((val) => val === 'true'),
  minSalesVelocity: z.string().optional().transform((val) => (val ? parseFloat(val) : undefined)),
  minRevenue: z.string().optional().transform((val) => (val ? parseInt(val, 10) : undefined)),
  maxListings: z.string().optional().transform((val) => (val ? parseInt(val, 10) : null)),
  minPrice: z.string().optional().transform((val) => (val ? parseInt(val, 10) : undefined)),
  topN: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 25)),
  rankingMetric: z.enum(['revenue', 'volume', 'avgPrice', 'profit', 'roi']).optional().default('revenue'),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Parse and validate query parameters
    const rawParams: Record<string, string | undefined> = {};
    for (const [key, value] of searchParams.entries()) {
      rawParams[key] = value;
    }

    const params = querySchema.parse(rawParams) as TopItemsQueryParams & {
      topN: number;
      rankingMetric: 'revenue' | 'volume' | 'avgPrice' | 'profit' | 'roi';
      timeframe: Timeframe;
    };

    // Get worlds to query and determine aggregation mode
    const worldOrDc = params.worldOrDc || 'all-na';
    let worldIds: number[];
    let shouldAggregateByDC = false;
    let dataCenterName: string | null = null;
    
    if (worldOrDc === 'all-na') {
      const worlds = await getAllNAWorlds();
      worldIds = worlds.map((w) => w.id);
      shouldAggregateByDC = true;
      dataCenterName = 'All NA';
    } else if (['aether', 'primal', 'crystal', 'dynamis'].includes(worldOrDc.toLowerCase())) {
      const worlds = await getWorldsByDataCenter(worldOrDc.toLowerCase());
      worldIds = worlds.map((w) => w.id);
      shouldAggregateByDC = true;
      dataCenterName = worldOrDc.charAt(0).toUpperCase() + worldOrDc.slice(1).toLowerCase();
    } else {
      const world = await getWorldByName(worldOrDc);
      if (!world) {
        return NextResponse.json(
          { error: `World not found: ${worldOrDc}` },
          { status: 400 }
        );
      }
      worldIds = [world.id];
      dataCenterName = world.data_center.charAt(0).toUpperCase() + world.data_center.slice(1).toLowerCase();
    }

    // Calculate date cutoff
    const days = params.timeframe === '1d' ? 1 : params.timeframe === '7d' ? 7 : 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    // OPTIMIZED: Single query with JOINs - fetch stats, items, and recipes together
    // This replaces multiple queries and per-item recipe lookups
    let query = supabaseAdmin
      .from('daily_item_stats')
      .select(`
        item_id,
        world_id,
        units_sold,
        total_revenue,
        avg_price,
        min_price,
        max_price,
        active_listings,
        items!inner(id, name, category, is_craftable),
        worlds!inner(id, name, data_center)
      `)
      .in('world_id', worldIds)
      .gte('stat_date', cutoffDateStr);

    // Apply category filter at DB level if specified
    if (params.categories && params.categories.length > 0) {
      query = query.in('items.category', params.categories);
    }

    // Apply craftable filter at DB level
    if (params.craftableOnly) {
      query = query.eq('items.is_craftable', true);
    } else if (params.nonCraftableOnly) {
      query = query.eq('items.is_craftable', false);
    }

    const { data: statsData, error: statsError } = await query;

    if (statsError) {
      throw new Error(`Failed to query stats: ${statsError.message}`);
    }

    if (!statsData || statsData.length === 0) {
      return NextResponse.json({
        items: [],
        totalItems: 0,
        metrics: { totalItems: 0, totalRevenue: 0, avgProfitMargin: 0, avgSalesVelocity: 0 },
      });
    }

    // Get unique item IDs for recipe lookup (single batch query instead of per-item)
    const uniqueItemIds = [...new Set(statsData.map((s: any) => s.item_id))];
    
    // OPTIMIZED: Batch fetch all recipes in ONE query
    const { data: recipesData } = await supabaseAdmin
      .from('recipes')
      .select('item_id, material_cost')
      .in('item_id', uniqueItemIds);

    const recipesMap = new Map(
      (recipesData || []).map((r: any) => [r.item_id, r.material_cost])
    );

    // Aggregate stats by item (or item-world if not aggregating by DC)
    const aggregatedItems = new Map<string, {
      itemId: number;
      itemName: string;
      category: string | null;
      isCraftable: boolean;
      worldName: string;
      dataCenter: string;
      totalUnitsSold: number;
      totalRevenue: number;
      priceSum: number;
      priceCount: number;
      minPrice: number | null;
      maxPrice: number | null;
      latestActiveListings: number;
      materialCost: number | null;
    }>();

    for (const stat of statsData as any[]) {
      const item = stat.items;
      const world = stat.worlds;
      if (!item || !world) continue;

      // Key: aggregate by item only (DC view) or item-world (specific world view)
      const key = shouldAggregateByDC ? String(stat.item_id) : `${stat.item_id}-${stat.world_id}`;

      if (!aggregatedItems.has(key)) {
        const itemName = item.name && item.name.trim() !== '' && !/^\d+$/.test(item.name.trim())
          ? item.name.trim()
          : `Item ${stat.item_id}`;

        aggregatedItems.set(key, {
          itemId: stat.item_id,
          itemName,
          category: item.category,
          isCraftable: item.is_craftable || false,
          worldName: shouldAggregateByDC ? (dataCenterName || 'Multiple Worlds') : 
            (world.name.charAt(0).toUpperCase() + world.name.slice(1)),
          dataCenter: shouldAggregateByDC ? (dataCenterName?.toLowerCase() || world.data_center) : world.data_center,
          totalUnitsSold: 0,
          totalRevenue: 0,
          priceSum: 0,
          priceCount: 0,
          minPrice: null,
          maxPrice: null,
          latestActiveListings: stat.active_listings || 0,
          materialCost: recipesMap.get(stat.item_id) || null,
        });
      }

      const agg = aggregatedItems.get(key)!;
      agg.totalUnitsSold += stat.units_sold || 0;
      agg.totalRevenue += Number(stat.total_revenue) || 0;
      
      if (stat.avg_price > 0) {
        agg.priceSum += stat.avg_price;
        agg.priceCount += 1;
      }
      
      if (stat.min_price !== null) {
        agg.minPrice = agg.minPrice === null ? stat.min_price : Math.min(agg.minPrice, stat.min_price);
      }
      if (stat.max_price !== null) {
        agg.maxPrice = agg.maxPrice === null ? stat.max_price : Math.max(agg.maxPrice, stat.max_price);
      }
      
      // Use most recent active listings count
      if (stat.active_listings > 0) {
        agg.latestActiveListings = stat.active_listings;
      }
    }

    // Calculate final metrics and apply filters
    const itemsWithMetrics: Array<{
      itemId: number;
      itemName: string;
      category: string | null;
      isCraftable: boolean;
      worldName: string;
      dataCenter: string;
      unitsSold: number;
      salesVelocity: number;
      totalRevenue: number;
      avgPrice: number;
      minPrice: number | null;
      maxPrice: number | null;
      profitPerUnit: number | null;
      marginPercent: number | null;
      activeListings: number;
    }> = [];

    for (const [, agg] of aggregatedItems) {
      const avgPrice = agg.priceCount > 0 ? Math.round(agg.priceSum / agg.priceCount) : 0;
      const salesVelocity = agg.totalUnitsSold / days;
      
      // Calculate profit metrics
      let profitPerUnit: number | null = null;
      let marginPercent: number | null = null;
      
      if (agg.materialCost && agg.materialCost > 0 && avgPrice > 0) {
        profitPerUnit = avgPrice - agg.materialCost;
        marginPercent = (profitPerUnit / avgPrice) * 100;
      }

      // Apply threshold filters
      if (params.minSalesVelocity && salesVelocity < params.minSalesVelocity) continue;
      if (params.minRevenue && agg.totalRevenue < params.minRevenue) continue;
      if (params.maxListings !== null && params.maxListings !== undefined && agg.latestActiveListings > params.maxListings) continue;
      if (params.minPrice && avgPrice < params.minPrice) continue;

      itemsWithMetrics.push({
        itemId: agg.itemId,
        itemName: agg.itemName,
        category: agg.category,
        isCraftable: agg.isCraftable,
        worldName: agg.worldName,
        dataCenter: agg.dataCenter,
        unitsSold: agg.totalUnitsSold,
        salesVelocity,
        totalRevenue: agg.totalRevenue,
        avgPrice,
        minPrice: agg.minPrice,
        maxPrice: agg.maxPrice,
        profitPerUnit,
        marginPercent,
        activeListings: agg.latestActiveListings,
      });
    }

    // Sort by ranking metric
    const getRankingValue = (item: typeof itemsWithMetrics[0]): number => {
      switch (params.rankingMetric) {
        case 'revenue': return item.totalRevenue;
        case 'volume': return item.unitsSold;
        case 'avgPrice': return item.avgPrice;
        case 'profit': return item.profitPerUnit ?? -Infinity;
        case 'roi': return item.marginPercent ?? -Infinity;
        default: return item.totalRevenue;
      }
    };

    itemsWithMetrics.sort((a, b) => getRankingValue(b) - getRankingValue(a));

    // Take top N
    const topItems = itemsWithMetrics.slice(0, params.topN);

    // Convert to API response format
    const marketItems: MarketItem[] = topItems.map((item) => ({
      id: item.itemId,
      name: item.itemName,
      category: item.category,
      isCraftable: item.isCraftable,
      world: item.worldName,
      dataCenter: item.dataCenter,
      unitsSold: item.unitsSold,
      salesVelocity: item.salesVelocity,
      totalRevenue: item.totalRevenue,
      avgPrice: item.avgPrice,
      minPrice: item.minPrice,
      maxPrice: item.maxPrice,
      profitPerUnit: item.profitPerUnit,
      marginPercent: item.marginPercent,
      activeListings: item.activeListings,
    }));

    // Calculate aggregate metrics
    const totalItems = itemsWithMetrics.length;
    const totalRevenue = itemsWithMetrics.reduce((sum, item) => sum + item.totalRevenue, 0);
    const itemsWithProfit = itemsWithMetrics.filter((item) => item.profitPerUnit !== null);
    const avgProfitMargin =
      itemsWithProfit.length > 0
        ? itemsWithProfit.reduce((sum, item) => sum + (item.marginPercent ?? 0), 0) / itemsWithProfit.length
        : 0;
    const avgSalesVelocity =
      itemsWithMetrics.length > 0
        ? itemsWithMetrics.reduce((sum, item) => sum + item.salesVelocity, 0) / itemsWithMetrics.length
        : 0;

    const response: TopItemsResponse = {
      items: marketItems,
      totalItems,
      metrics: {
        totalItems,
        totalRevenue,
        avgProfitMargin,
        avgSalesVelocity,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in /api/top-items:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
