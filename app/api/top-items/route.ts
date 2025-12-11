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
import type { TopItemsQueryParams, TopItemsResponse, MarketItem, Timeframe, StatsMode } from '@/lib/types/api';
import { getAllNAWorlds, getWorldsByDataCenter, getWorldByName } from '@/lib/db/worlds';
import { z } from 'zod';

// Validation schema
const querySchema = z.object({
  worldOrDc: z.string().optional().default('all-na'),
  timeframe: z.enum(['1d', '7d', '30d']).optional().default('7d'),
  categories: z.string().optional().transform((val) => (val ? val.split(',') : [])),
  craftableOnly: z.string().optional().transform((val) => val === 'true'),
  nonCraftableOnly: z.string().optional().transform((val) => val === 'true'),
  mode: z.enum(['auto', 'robust', 'raw']).optional().default('auto'),
  minSalesVelocity: z.string().optional().transform((val) => (val ? parseFloat(val) : undefined)),
  minRevenue: z.string().optional().transform((val) => (val ? parseInt(val, 10) : undefined)),
  maxListings: z.string().optional().transform((val) => (val ? parseInt(val, 10) : null)),
  minPrice: z.string().optional().transform((val) => (val ? parseInt(val, 10) : undefined)),
  topN: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 25)),
  rankingMetric: z.enum(['bestToSell', 'revenue', 'volume', 'avgPrice', 'profit', 'roi']).optional().default('bestToSell'),
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
      rankingMetric: 'bestToSell' | 'revenue' | 'volume' | 'avgPrice' | 'profit' | 'roi';
      timeframe: Timeframe;
      mode: StatsMode;
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
    // NOTE: We filter for units_sold > 0 to reduce data size and only show items with sales.
    // Limits are tuned per mode to avoid timeouts but keep enough rows.
    // Allow a wider window now so more items appear in results.
    const QUERY_LIMIT = 50000;
    // Allow cheaper items into the query to avoid over-filtering (still filtered later for bestToSell)
    const MIN_PRICE_DB = 50; // apply the same low floor to all to include cheap consumables
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
        robust_avg_price,
        robust_total_revenue,
        robust_units_sold,
        robust_sample_size,
        typical_price_30d,
        price_p90_30d,
        is_low_confidence,
        items!inner(id, name, category, is_craftable),
        worlds!inner(id, name, data_center)
      `)
      .in('world_id', worldIds)
      .gte('stat_date', cutoffDateStr)
      .gt('units_sold', 0) // Only include records with actual sales
      .gt('avg_price', MIN_PRICE_DB) // Skip ultra-cheap items; lower floor for craftables
      .order('total_revenue', { ascending: false }) // Prioritize high-revenue records
      .limit(QUERY_LIMIT); // Keep query responsive; filters run before this limit

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
      rawRevenue: number;
      robustEligible: boolean;
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

      const hasRobust =
        stat.robust_sample_size !== null &&
        stat.robust_sample_size !== undefined &&
        stat.robust_sample_size >= 5 &&
        stat.robust_units_sold > 0 &&
        stat.robust_avg_price !== null;
      const useRobust =
        params.mode === 'robust'
          ? hasRobust
          : params.mode === 'raw'
          ? false
          : hasRobust;

      const anchor = stat.typical_price_30d || null;
      const guardCap = anchor ? anchor * 20 : null;

      const chosenUnits = useRobust ? stat.robust_units_sold || 0 : stat.units_sold || 0;
      let chosenRevenue = useRobust
        ? Number(stat.robust_total_revenue) || 0
        : Number(stat.total_revenue) || 0;
      let chosenAvg = useRobust
        ? stat.robust_avg_price || 0
        : stat.avg_price || 0;

      // Mild guard when falling back to raw: cap avg price against anchor*20 to reduce RMT spikes if anchor exists
      if (!useRobust && guardCap && chosenAvg > guardCap) {
        chosenAvg = guardCap;
      }
      if (!useRobust && guardCap && chosenRevenue > guardCap * chosenUnits) {
        chosenRevenue = guardCap * chosenUnits;
      }

      // If mode is robust and no robust data, skip this stat
      if (params.mode === 'robust' && !hasRobust) {
        continue;
      }

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
          rawRevenue: 0,
          robustEligible: hasRobust,
          priceSum: 0,
          priceCount: 0,
          minPrice: null,
          maxPrice: null,
          latestActiveListings: stat.active_listings || 0,
          materialCost: recipesMap.get(stat.item_id) || null,
        });
      }

      const agg = aggregatedItems.get(key)!;
      agg.totalUnitsSold += chosenUnits;
      agg.totalRevenue += chosenRevenue;
      agg.rawRevenue += Number(stat.total_revenue) || 0;
      agg.robustEligible = agg.robustEligible || hasRobust;
      
      if (chosenAvg > 0) {
        agg.priceSum += chosenAvg;
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

    // For "bestToSell" ranking, filter out items that aren't practical to sell
    // This prevents showing low-value items like crystals that need thousands of sales
    let filteredItems = itemsWithMetrics;
    if (params.rankingMetric === 'bestToSell') {
      // Filters:
      // - Minimum price: keep modest to allow food/potions/consumables
      const minPriceBestToSell = 200;
      // - Minimum velocity: relaxed to 0.2/day (~6 per month) to avoid over-pruning
      // - Must have actual sales and revenue
      filteredItems = itemsWithMetrics.filter(item => 
        item.unitsSold > 0 && 
        item.totalRevenue > 0 && 
        item.salesVelocity >= 0.2 &&
        item.avgPrice >= minPriceBestToSell // Allow cheaper items, still block shards/crystals
      );
      
      // If we filtered out everything, try without price filter
      if (filteredItems.length === 0) {
        filteredItems = itemsWithMetrics.filter(item => 
          item.unitsSold > 0 && item.totalRevenue > 0 && item.salesVelocity >= 0.5
        );
      }
      
      // If still nothing, fall back to items with any sales
      if (filteredItems.length === 0) {
        filteredItems = itemsWithMetrics.filter(item => 
          item.unitsSold > 0 && item.totalRevenue > 0
        );
      }
      
      // Last resort: all items
      if (filteredItems.length === 0) {
        filteredItems = itemsWithMetrics;
      }
    }

    // Sort by ranking metric
    const getRankingValue = (item: typeof filteredItems[0]): number => {
      switch (params.rankingMetric) {
        case 'bestToSell':
          // "Daily Gil Potential" = avgPrice × salesVelocity
          // This represents how much gil you can expect to make per day selling this item
          // Example: Item selling 10x/day at 100K = 1M gil/day potential
          // 
          // We also add a reliability bonus for faster-selling items
          const dailyGilPotential = item.avgPrice * item.salesVelocity;
          
          // Reliability multiplier: items selling faster get higher weight
          const reliabilityBonus = item.salesVelocity >= 5 ? 1.8 :
                                   item.salesVelocity >= 1 ? 1.5 :
                                   item.salesVelocity >= 0.5 ? 1.2 : 1.0;
          
          return dailyGilPotential * reliabilityBonus;
          
        case 'revenue': return item.totalRevenue;
        case 'volume': return item.unitsSold;
        case 'avgPrice': return item.avgPrice;
        case 'profit': return item.profitPerUnit ?? 0;
        case 'roi': return item.marginPercent ?? 0;
        default: return item.totalRevenue;
      }
    };

    filteredItems.sort((a, b) => getRankingValue(b) - getRankingValue(a));

    // Take top N
    const topItems = filteredItems.slice(0, params.topN);

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

    // Calculate aggregate metrics (based on filtered items that match criteria)
    const totalItems = filteredItems.length;
    const totalRevenue = filteredItems.reduce((sum, item) => sum + item.totalRevenue, 0);
    const itemsWithProfit = filteredItems.filter((item) => item.profitPerUnit !== null);
    const avgProfitMargin =
      itemsWithProfit.length > 0
        ? itemsWithProfit.reduce((sum, item) => sum + (item.marginPercent ?? 0), 0) / itemsWithProfit.length
        : 0;
    const avgSalesVelocity =
      filteredItems.length > 0
        ? filteredItems.reduce((sum, item) => sum + item.salesVelocity, 0) / filteredItems.length
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
