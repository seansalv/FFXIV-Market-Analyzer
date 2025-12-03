/**
 * Database operations for items
 */
import { supabaseAdmin } from '../supabase/server';
import type { Item, Recipe } from '../types/database';

export async function upsertItem(item: {
  id: number;
  name: string;
  category?: string | null;
  is_craftable?: boolean;
  icon_url?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('items')
    .upsert(
      {
        id: item.id,
        name: item.name,
        category: item.category ?? null,
        is_craftable: item.is_craftable ?? false,
        icon_url: item.icon_url ?? null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'id',
      }
    );

  if (error) {
    throw new Error(`Failed to upsert item ${item.id}: ${error.message}`);
  }
}

export async function upsertRecipe(recipe: {
  item_id: number;
  material_cost: number;
  material_list?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('recipes')
    .upsert(
      {
        item_id: recipe.item_id,
        material_cost: recipe.material_cost,
        material_list: recipe.material_list ?? null,
        last_updated: new Date().toISOString(),
      },
      {
        onConflict: 'item_id',
      }
    );

  if (error) {
    throw new Error(`Failed to upsert recipe for item ${recipe.item_id}: ${error.message}`);
  }
}

export async function getItem(itemId: number): Promise<Item | null> {
  const { data, error } = await supabaseAdmin
    .from('items')
    .select('*')
    .eq('id', itemId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to get item ${itemId}: ${error.message}`);
  }

  return data;
}

export async function getRecipe(itemId: number): Promise<Recipe | null> {
  const { data, error } = await supabaseAdmin
    .from('recipes')
    .select('*')
    .eq('item_id', itemId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to get recipe ${itemId}: ${error.message}`);
  }

  return data;
}

