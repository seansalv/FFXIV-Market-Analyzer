/**
 * Backfill typical_price_30d and price_p90_30d for recent daily_item_stats rows.
 *
 * This computes anchors per (item_id, world_id, stat_date) using the previous 30 days
 * of prices (preferring robust_avg_price, falling back to avg_price).
 *
 * Usage:
 *   npx tsx scripts/backfill-anchors.ts
 */

// Load env first (same pattern as ingest)
import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { supabaseAdmin } from '../lib/supabase/server';

const envPath = resolve(process.cwd(), '.env.local');
if (!existsSync(envPath)) {
  console.error(`❌ .env.local not found at ${envPath}`);
  process.exit(1);
}
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  console.error('❌ Error loading .env.local:', envResult.error);
  process.exit(1);
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    `❌ Missing Supabase environment variables. NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING'}, SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING'}`
  );
  process.exit(1);
}

type StatRow = {
  id: number;
  item_id: number;
  world_id: number;
  stat_date: string; // YYYY-MM-DD
  robust_avg_price: number | null;
  avg_price: number | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (upper === lower) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

async function main() {
  console.log('📈 Backfilling 30d anchors for daily_item_stats (last 60 days)...');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // Fetch recent stats to keep scope bounded
  const { data, error } = await supabaseAdmin
    .from('daily_item_stats')
    .select('id, item_id, world_id, stat_date, robust_avg_price, avg_price')
    .gte('stat_date', cutoffStr)
    .order('item_id', { ascending: true })
    .order('world_id', { ascending: true })
    .order('stat_date', { ascending: true });

  if (error) {
    console.error('❌ Failed to fetch daily_item_stats:', error.message);
    process.exit(1);
  }

  const rows = (data || []) as StatRow[];
  console.log(`   Fetched ${rows.length} rows since ${cutoffStr}`);

  // Group by item_id + world_id
  const groups = new Map<string, StatRow[]>();
  for (const row of rows) {
    const key = `${row.item_id}-${row.world_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const updates: Array<{
    id: number;
    item_id: number;
    world_id: number;
    stat_date: string;
    typical_price_30d: number | null;
    price_p90_30d: number | null;
  }> = [];

  for (const [, groupRows] of groups) {
    // groupRows already sorted by stat_date ascending
    for (let i = 0; i < groupRows.length; i++) {
      const current = groupRows[i];
      const currentDate = new Date(current.stat_date);

      // Collect prior 30-day prices (exclude current day)
      const windowPrices: number[] = [];
      for (let j = 0; j < i; j++) {
        const prev = groupRows[j];
        const prevDate = new Date(prev.stat_date);
        const diffDays = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 30) continue; // only last 30 days
        const price = prev.robust_avg_price ?? prev.avg_price;
        if (typeof price === 'number' && price > 0) {
          windowPrices.push(price);
        }
      }

      const typical = median(windowPrices);
      const p90 = percentile(windowPrices, 0.9);

      updates.push({
        id: current.id,
        item_id: current.item_id,
        world_id: current.world_id,
        stat_date: current.stat_date,
        typical_price_30d: typical,
        price_p90_30d: p90,
      });
    }
  }

  console.log(`   Computed anchors for ${updates.length} rows. Writing updates in batches...`);

  const batchSize = 500;
  let written = 0;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    // Type assertion needed due to Proxy wrapper breaking type inference
    const { error: upsertError } = await (supabaseAdmin as any)
      .from('daily_item_stats')
      .upsert(batch, { onConflict: 'id' });
    if (upsertError) {
      console.error(`❌ Upsert batch failed at index ${i}: ${upsertError.message}`);
      process.exit(1);
    }
    written += batch.length;
    if (written % 2000 === 0) {
      console.log(`   ✓ Updated ${written}/${updates.length}`);
    }
  }

  console.log(`✅ Backfill complete. Updated ${written} rows.`);
}

main().catch((err) => {
  console.error('Unhandled error during backfill:', err);
  process.exit(1);
});

