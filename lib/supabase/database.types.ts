/**
 * Auto-generated Supabase database types
 * Run: npx supabase gen types typescript --project-id <project-id> > lib/supabase/database.types.ts
 * 
 * For now, we'll define a minimal type structure that matches our schema
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      worlds: {
        Row: {
          id: number
          name: string
          data_center: string
          region: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          name: string
          data_center: string
          region?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          name?: string
          data_center?: string
          region?: string
          created_at?: string
          updated_at?: string
        }
      }
      items: {
        Row: {
          id: number
          name: string
          category: string | null
          is_craftable: boolean
          icon_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: number
          name: string
          category?: string | null
          is_craftable?: boolean
          icon_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          name?: string
          category?: string | null
          is_craftable?: boolean
          icon_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      recipes: {
        Row: {
          item_id: number
          material_cost: number
          material_list: Json | null
          last_updated: string
          created_at: string
        }
        Insert: {
          item_id: number
          material_cost?: number
          material_list?: Json | null
          last_updated?: string
          created_at?: string
        }
        Update: {
          item_id?: number
          material_cost?: number
          material_list?: Json | null
          last_updated?: string
          created_at?: string
        }
      }
      market_sales: {
        Row: {
          id: number
          item_id: number
          world_id: number
          price_per_unit: number
          quantity: number
          buyer_name: string | null
          sale_timestamp: string
          hq: boolean
          on_mannequin: boolean
          created_at: string
        }
        Insert: {
          id?: number
          item_id: number
          world_id: number
          price_per_unit: number
          quantity: number
          buyer_name?: string | null
          sale_timestamp: string
          hq?: boolean
          on_mannequin?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          item_id?: number
          world_id?: number
          price_per_unit?: number
          quantity?: number
          buyer_name?: string | null
          sale_timestamp?: string
          hq?: boolean
          on_mannequin?: boolean
          created_at?: string
        }
      }
      daily_item_stats: {
        Row: {
          id: number
          item_id: number
          world_id: number
          stat_date: string
          units_sold: number
          total_revenue: number
          avg_price: number
          min_price: number | null
          max_price: number | null
          active_listings: number
          total_listings_quantity: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          item_id: number
          world_id: number
          stat_date: string
          units_sold?: number
          total_revenue?: number
          avg_price?: number
          min_price?: number | null
          max_price?: number | null
          active_listings?: number
          total_listings_quantity?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          item_id?: number
          world_id?: number
          stat_date?: string
          units_sold?: number
          total_revenue?: number
          avg_price?: number
          min_price?: number | null
          max_price?: number | null
          active_listings?: number
          total_listings_quantity?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

