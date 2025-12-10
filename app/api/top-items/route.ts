/**
 * API endpoint: GET /api/top-items
 * 
 * Returns the top N most profitable items based on filters and ranking criteria
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { TopItemsQueryParams, TopItemsResponse, MarketItem, Timeframe } from '@/lib/types/api';
import { calculateMetrics, rankItems, filterItems } from '@/lib/analytics/profitability';
import { getAllNAWorlds, getWorldsByDataCenter, getWorldByName } from '@/lib/db/worlds';
import { getDailyStatsForTimeframe } from '@/lib/db/market-data';
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
    let shouldAggregateByDC = false; // Aggregate across all worlds in DC
    let dataCenterName: string | null = null;
    let isSpecificWorld = false;
    
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
      isSpecificWorld = true;
      dataCenterName = world.data_center.charAt(0).toUpperCase() + world.data_center.slice(1).toLowerCase();
    }

    // Calculate days for timeframe
    const days = params.timeframe === '1d' ? 1 : params.timeframe === '7d' ? 7 : 30;

    // Get all items with stats in the timeframe
    // We'll query daily_item_stats and aggregate
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    // Query daily stats with joins to items and worlds
    const { data: statsData, error: statsError } = await supabaseAdmin
      .from('daily_item_stats')
      .select(`
        *,
        items(id, name, category, is_craftable),
        worlds(id, name, data_center)
      `)
      .in('world_id', worldIds)
      .gte('stat_date', cutoffDateStr)
      .order('stat_date', { ascending: false });

    if (statsError) {
      throw new Error(`Failed to query stats: ${statsError.message}`);
    }

    // Diagnostic logging: Database query results
    const uniqueItemIds = new Set((statsData || []).map((s: any) => s.item_id));
    console.log(`[DEBUG] Database Query Results:`);
    console.log(`  - Stats returned: ${statsData?.length || 0}`);
    console.log(`  - Unique items: ${uniqueItemIds.size}`);
    console.log(`  - World IDs queried: ${worldIds.join(', ')}`);
    console.log(`  - Timeframe: ${params.timeframe} (${days} days, cutoff: ${cutoffDateStr})`);
    console.log(`  - Aggregation mode: ${shouldAggregateByDC ? 'Data Center' : 'Per-World'}`);

    // Also fetch items separately to ensure we have all item metadata
    const { data: allItems } = await supabaseAdmin
      .from('items')
      .select('*')
      .in('id', Array.from(new Set((statsData || []).map((s: any) => s.item_id))));

    const itemsMap = new Map((allItems || []).map((item: any) => [item.id, item]));

    // Diagnostic logging: Items map and filter values
    console.log(`[DEBUG] Items Map and Filters:`);
    console.log(`  - Items in map: ${itemsMap.size}`);
    console.log(`  - Applied filters:`, {
      minRevenue: params.minRevenue,
      minSalesVelocity: params.minSalesVelocity,
      minPrice: params.minPrice,
      categories: params.categories,
      craftableOnly: params.craftableOnly,
      nonCraftableOnly: params.nonCraftableOnly,
      maxListings: params.maxListings,
      topN: params.topN,
      rankingMetric: params.rankingMetric,
    });

    // Group stats based on aggregation mode
    const itemStatsMap = new Map<string, any[]>();

    if (shouldAggregateByDC) {
      // Aggregate by item_id only - combine stats from all worlds in the DC
      for (const stat of (statsData || []) as any[]) {
        const itemId = stat.item_id;
        const key = String(itemId);
        if (!itemStatsMap.has(key)) {
          itemStatsMap.set(key, []);
        }
        itemStatsMap.get(key)!.push(stat);
      }
    } else {
      // Per-world mode: group by item_id-world_id (keep separate entries per world)
      for (const stat of (statsData || []) as any[]) {
        const key = `${stat.item_id}-${stat.world_id}`;
        if (!itemStatsMap.has(key)) {
          itemStatsMap.set(key, []);
        }
        itemStatsMap.get(key)!.push(stat);
      }
    }

    // Diagnostic logging: Aggregation grouping
    console.log(`[DEBUG] Aggregation Grouping:`);
    console.log(`  - Groups created: ${itemStatsMap.size}`);

    // Calculate metrics for each item (aggregated across worlds if shouldAggregateByDC)
    const itemsWithMetrics: Array<{
      itemId: number;
      itemName: string;
      category: string | null;
      isCraftable: boolean;
      worldName: string;
      dataCenter: string;
      metrics: Awaited<ReturnType<typeof calculateMetrics>>;
    }> = [];

    for (const [key, stats] of itemStatsMap.entries()) {
      if (stats.length === 0) continue;

      const firstStat = stats[0] as any;
      const itemId = firstStat.item_id;
      
      // Get item from map or from join
      const item = itemsMap.get(itemId) || firstStat.items;
      if (!item) continue;

      // Get world info - use first stat's world for data center info
      const world = firstStat.worlds;
      if (!world) continue;

      // Calculate metrics - this will aggregate across all stats (all worlds if aggregating)
      const metrics = await calculateMetrics(
        stats as any,
        params.timeframe,
        itemId
      );

      // Use the actual item name from database, fallback to "Item {id}" if it's just a number
      const itemName = item.name && item.name.trim() !== '' && !/^\d+$/.test(item.name.trim()) 
        ? item.name.trim() 
        : `Item ${itemId}`;

      // Determine display name based on aggregation mode
      let displayWorldName: string;
      let displayDataCenter: string;
      
      if (shouldAggregateByDC) {
        // Show data center name when aggregating
        displayWorldName = dataCenterName || 'Multiple Worlds';
        displayDataCenter = dataCenterName?.toLowerCase() || world.data_center;
      } else {
        // Show specific world name
        displayWorldName = world.name.charAt(0).toUpperCase() + world.name.slice(1);
        displayDataCenter = world.data_center;
      }

      itemsWithMetrics.push({
        itemId: itemId,
        itemName: itemName,
        category: item.category,
        isCraftable: item.is_craftable || false,
        worldName: displayWorldName,
        dataCenter: displayDataCenter,
        metrics,
      });
    }

    // Diagnostic logging: Metrics calculation
    console.log(`[DEBUG] Metrics Calculation:`);
    console.log(`  - Items with metrics calculated: ${itemsWithMetrics.length}`);

    // Apply filters
    const filtered = filterItems(itemsWithMetrics, {
      categories: params.categories,
      craftableOnly: params.craftableOnly,
      nonCraftableOnly: params.nonCraftableOnly,
      minSalesVelocity: params.minSalesVelocity,
      minRevenue: params.minRevenue,
      maxListings: params.maxListings,
      minPrice: params.minPrice,
    });

    // Diagnostic logging: Filtering results
    console.log(`[DEBUG] Filtering Results:`);
    console.log(`  - Items before filtering: ${itemsWithMetrics.length}`);
    console.log(`  - Items after filtering: ${filtered.length}`);
    console.log(`  - Items removed by filters: ${itemsWithMetrics.length - filtered.length}`);

    // Rank items
    const ranked = rankItems(filtered, params.rankingMetric);

    // Take top N
    const topItems = ranked.slice(0, params.topN);

    // Diagnostic logging: Final results
    console.log(`[DEBUG] Final Results:`);
    console.log(`  - Items after ranking: ${ranked.length}`);
    console.log(`  - Top ${params.topN} items returned: ${topItems.length}`);

    // Convert to API response format
    const marketItems: MarketItem[] = topItems.map((item) => ({
      id: item.itemId,
      name: item.itemName,
      category: item.category,
      isCraftable: item.isCraftable,
      world: item.worldName,
      dataCenter: item.dataCenter,
      unitsSold: item.metrics.unitsSold,
      salesVelocity: item.metrics.salesVelocity,
      totalRevenue: item.metrics.totalRevenue,
      avgPrice: item.metrics.avgPrice,
      minPrice: item.metrics.minPrice,
      maxPrice: item.metrics.maxPrice,
      profitPerUnit: item.metrics.profitPerUnit,
      marginPercent: item.metrics.marginPercent,
      activeListings: item.metrics.activeListings,
    }));

    // Calculate aggregate metrics
    const totalItems = filtered.length;
    const totalRevenue = filtered.reduce((sum, item) => sum + item.metrics.totalRevenue, 0);
    const itemsWithProfit = filtered.filter((item) => item.metrics.profitPerUnit !== null);
    const avgProfitMargin =
      itemsWithProfit.length > 0
        ? itemsWithProfit.reduce((sum, item) => sum + (item.metrics.marginPercent ?? 0), 0) /
          itemsWithProfit.length
        : 0;
    const avgSalesVelocity =
      filtered.length > 0
        ? filtered.reduce((sum, item) => sum + item.metrics.salesVelocity, 0) / filtered.length
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

