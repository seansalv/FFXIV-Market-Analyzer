/**
 * Supabase client for server-side usage (API routes, server components)
 * Uses service role key for admin operations
 * Lazy-loaded to allow environment variables to be set before initialization
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

let _supabaseAdmin: ReturnType<typeof createClient<Database>> | null = null;

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Missing Supabase environment variables. ' +
        `NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? 'SET' : 'MISSING'}, ` +
        `SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? 'SET' : 'MISSING'}`
      );
    }

    _supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _supabaseAdmin;
}

// Export as a Proxy to ensure lazy initialization while maintaining the same API
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    const value = (client as any)[prop];
    // If it's a function, bind it to the client so 'this' works correctly
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

