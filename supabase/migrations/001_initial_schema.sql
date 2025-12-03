-- FFXIV Market Profit Analyzer - Initial Schema
-- This migration creates the core tables for storing market data

-- Worlds and Data Centers table
CREATE TABLE IF NOT EXISTS worlds (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  data_center TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'NA',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Items master table
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY, -- Universalis item ID
  name TEXT NOT NULL,
  category TEXT,
  is_craftable BOOLEAN DEFAULT FALSE,
  icon_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recipes table for craftable items (material costs)
CREATE TABLE IF NOT EXISTS recipes (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  material_cost INTEGER DEFAULT 0, -- Total gil cost of materials
  material_list JSONB, -- Optional: detailed breakdown of materials
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Raw market sales history (from Universalis recentHistory)
CREATE TABLE IF NOT EXISTS market_sales (
  id BIGSERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  price_per_unit INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  buyer_name TEXT, -- Optional: buyer name if available
  sale_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  hq BOOLEAN DEFAULT FALSE,
  on_mannequin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Index for efficient queries
  CONSTRAINT valid_sale CHECK (price_per_unit > 0 AND quantity > 0)
);

-- Daily aggregated statistics per item per world
CREATE TABLE IF NOT EXISTS daily_item_stats (
  id BIGSERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  units_sold INTEGER NOT NULL DEFAULT 0,
  total_revenue BIGINT NOT NULL DEFAULT 0,
  avg_price INTEGER NOT NULL DEFAULT 0,
  min_price INTEGER,
  max_price INTEGER,
  active_listings INTEGER DEFAULT 0,
  total_listings_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Ensure one record per item/world/date
  UNIQUE(item_id, world_id, stat_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_market_sales_item_world ON market_sales(item_id, world_id);
CREATE INDEX IF NOT EXISTS idx_market_sales_timestamp ON market_sales(sale_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_daily_item_stats_item_world_date ON daily_item_stats(item_id, world_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_item_stats_date ON daily_item_stats(stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_craftable ON items(is_craftable);
CREATE INDEX IF NOT EXISTS idx_worlds_data_center ON worlds(data_center);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_worlds_updated_at BEFORE UPDATE ON worlds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_item_stats_updated_at BEFORE UPDATE ON daily_item_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert NA worlds and data centers
INSERT INTO worlds (name, data_center, region) VALUES
  -- Aether DC
  ('adamantoise', 'aether', 'NA'),
  ('cactuar', 'aether', 'NA'),
  ('faerie', 'aether', 'NA'),
  ('gilgamesh', 'aether', 'NA'),
  ('jenova', 'aether', 'NA'),
  ('midgardsormr', 'aether', 'NA'),
  ('sargatanas', 'aether', 'NA'),
  ('siren', 'aether', 'NA'),
  -- Primal DC
  ('behemoth', 'primal', 'NA'),
  ('excalibur', 'primal', 'NA'),
  ('exodus', 'primal', 'NA'),
  ('famfrit', 'primal', 'NA'),
  ('hyperion', 'primal', 'NA'),
  ('lamia', 'primal', 'NA'),
  ('leviathan', 'primal', 'NA'),
  ('ultros', 'primal', 'NA'),
  -- Crystal DC
  ('balmung', 'crystal', 'NA'),
  ('brynhildr', 'crystal', 'NA'),
  ('coeurl', 'crystal', 'NA'),
  ('diabolos', 'crystal', 'NA'),
  ('goblin', 'crystal', 'NA'),
  ('malboro', 'crystal', 'NA'),
  ('mateus', 'crystal', 'NA'),
  ('zalera', 'crystal', 'NA'),
  -- Dynamis DC
  ('halicarnassus', 'dynamis', 'NA'),
  ('maduin', 'dynamis', 'NA'),
  ('marilith', 'dynamis', 'NA'),
  ('seraph', 'dynamis', 'NA')
ON CONFLICT (name) DO NOTHING;

