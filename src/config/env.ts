export interface AppConfig {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  isSupabaseConfigured: boolean;
  appTitle: string;
  defaultStoreName: string;
  isDev: boolean;
  isProd: boolean;
  enableMockSync: boolean;
}

export function loadEnv(): AppConfig {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || null;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || null;

  const isValidSupabase = Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    supabaseAnonKey.length > 10
  );

  return {
    supabaseUrl: isValidSupabase ? supabaseUrl : null,
    supabaseAnonKey: isValidSupabase ? supabaseAnonKey : null,
    isSupabaseConfigured: isValidSupabase,
    appTitle: import.meta.env.VITE_APP_TITLE || 'RichiePOS Enterprise',
    defaultStoreName: import.meta.env.VITE_DEFAULT_STORE_NAME || 'RichiePOS Flagship Store',
    isDev: import.meta.env.DEV,
    isProd: import.meta.env.PROD,
    enableMockSync: import.meta.env.VITE_ENABLE_MOCK_SYNC !== 'false',
  };
}

export const env = loadEnv();
