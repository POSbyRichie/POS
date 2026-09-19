/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_APP_TITLE?: string;
  readonly VITE_DEFAULT_STORE_NAME?: string;
  readonly VITE_ENABLE_MOCK_SYNC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
