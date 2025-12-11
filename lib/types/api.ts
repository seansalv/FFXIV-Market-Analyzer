/**
 * API request/response types for the frontend
 */

export type Timeframe = '1d' | '7d' | '30d';
export type RankingMetric = 'bestToSell' | 'revenue' | 'volume' | 'avgPrice' | 'profit' | 'roi';
export type StatsMode = 'auto' | 'robust' | 'raw';

export interface TopItemsQueryParams {
  worldOrDc?: string;
  timeframe?: Timeframe;
  categories?: string[];
  craftableOnly?: boolean;
  nonCraftableOnly?: boolean;
  mode?: StatsMode;
  minSalesVelocity?: number;
  minRevenue?: number;
  maxListings?: number | null;
  minPrice?: number;
  topN?: number;
  rankingMetric?: RankingMetric;
}

export interface MarketItem {
  id: number;
  name: string;
  category: string | null;
  isCraftable: boolean;
  world: string;
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
}

export interface TopItemsResponse {
  items: MarketItem[];
  totalItems: number;
  metrics: {
    totalItems: number;
    totalRevenue: number;
    avgProfitMargin: number;
    avgSalesVelocity: number;
  };
}

export interface UniversalisListing {
  listingId: string;
  pricePerUnit: number;
  quantity: number;
  worldName: string;
  worldID: number;
  hq: boolean;
  onMannequin: boolean;
  retainerName: string;
  retainerID: string;
  creatorName: string;
  creatorID: string;
  lastReviewTime: number;
  tax: number;
}

export interface UniversalisHistoryEntry {
  hq: boolean;
  pricePerUnit: number;
  quantity: number;
  timestamp: number;
  buyerName: string;
  onMannequin: boolean;
}

export interface UniversalisMarketData {
  itemID: number;
  worldID: number;
  worldName: string;
  datacenter: string;
  lastUploadTime: number;
  listings: UniversalisListing[];
  recentHistory: UniversalisHistoryEntry[];
  currentAveragePrice: number;
  currentAveragePriceNQ: number;
  currentAveragePriceHQ: number;
  regularSaleVelocity: number;
  nqSaleVelocity: number;
  hqSaleVelocity: number;
  averagePrice: number;
  averagePriceNQ: number;
  averagePriceHQ: number;
  minPrice: number;
  maxPrice: number;
  stackSizeHistogram: Record<string, number>;
  stackSizeHistogramNQ: Record<string, number>;
  stackSizeHistogramHQ: Record<string, number>;
}

