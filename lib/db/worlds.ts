/**
 * Database operations for worlds
 */
import { supabaseAdmin } from '../supabase/server';
import type { World } from '../types/database';

export async function getWorldByName(name: string): Promise<World | null> {
  const { data, error } = await supabaseAdmin
    .from('worlds')
    .select('*')
    .eq('name', name.toLowerCase())
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to get world ${name}: ${error.message}`);
  }

  return data;
}

export async function getWorldsByDataCenter(dataCenter: string): Promise<World[]> {
  const { data, error } = await supabaseAdmin
    .from('worlds')
    .select('*')
    .eq('data_center', dataCenter.toLowerCase());

  if (error) {
    throw new Error(`Failed to get worlds for DC ${dataCenter}: ${error.message}`);
  }

  return data || [];
}

export async function getAllNAWorlds(): Promise<World[]> {
  const { data, error } = await supabaseAdmin
    .from('worlds')
    .select('*')
    .eq('region', 'NA');

  if (error) {
    throw new Error(`Failed to get NA worlds: ${error.message}`);
  }

  return data || [];
}

