/**
 * TypeScript types for Supabase database tables
 * These match the SQL schema defined in migrations
 */

export interface World {
  id: number;
  name: string;
  data_center: string;
  region: string;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: number;
  name: string;
  category: string | null;
  is_craftable: boolean;
  icon_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Recipe {
  item_id: number;
  material_cost: number;
  material_list: Record<string, unknown> | null;
  last_updated: string;
  created_at: string;
}

export interface MarketSale {
  id: number;
  item_id: number;
  world_id: number;
  price_per_unit: number;
  quantity: number;
  buyer_name: string | null;
  sale_timestamp: string;
  hq: boolean;
  on_mannequin: boolean;
  created_at: string;
}

export interface DailyItemStats {
  id: number;
  item_id: number;
  world_id: number;
  stat_date: string;
  units_sold: number;
  total_revenue: number;
  avg_price: number;
  min_price: number | null;
  max_price: number | null;
  active_listings: number;
  total_listings_quantity: number;
  created_at: string;
  updated_at: string;
}

// Helper type for database queries with joins
export interface ItemWithStats extends Item {
  world_name: string;
  data_center: string;
  units_sold: number;
  sales_velocity: number;
  total_revenue: number;
  avg_price: number;
  min_price: number | null;
  max_price: number | null;
  profit_per_unit: number | null;
  margin_percent: number | null;
  active_listings: number;
}

