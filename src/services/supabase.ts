import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  if (env.isSupabaseConfigured && env.supabaseUrl && env.supabaseAnonKey) {
    try {
      supabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
      logger.info('Supabase', 'Client initialized successfully', { url: env.supabaseUrl });
    } catch (err) {
      logger.error('Supabase', 'Failed to initialize Supabase client', err);
      supabaseClient = null;
    }
  } else {
    logger.debug('Supabase', 'Running in local-first offline mode (Supabase credentials not set)');
  }

  return supabaseClient;
}

export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  const client = getSupabase();
  if (!client) {
    return { ok: false, message: 'Supabase credentials not configured. Running offline.' };
  }

  try {
    const { error } = await client.from('products').select('id').limit(1);
    if (error) {
      logger.warn('Supabase', 'Connection check returned error', error);
      return { ok: false, message: error.message };
    }
    return { ok: true, message: 'Connected to Supabase PostgreSQL database.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Supabase', 'Connection probe threw exception', err);
    return { ok: false, message: msg };
  }
}
