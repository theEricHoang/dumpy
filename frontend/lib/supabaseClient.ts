import { createClient, SupabaseClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'

// Environment variables must be prefixed with EXPO_PUBLIC_ to be exposed to the client.
// You can set them in a .env file (e.g. .env.development) or via app.config.(js|ts) `extra`.
// Example .env.development:
//   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
// DO NOT commit real keys; use .env.example for sharing.

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>
const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || extra.EXPO_PUBLIC_SUPABASE_URL) as string | undefined
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.EXPO_PUBLIC_SUPABASE_ANON_KEY) as string | undefined

let _client: SupabaseClient | null = null

/**
 * Lazily obtain a Supabase client. This defers construction so that route scanning
 * doesn't hard-fail if env vars are temporarily missing. We throw only when the
 * app actually tries to use Supabase, giving a clearer error.
 */
export function getSupabase(): SupabaseClient {
  if (_client) return _client
  if (!supabaseUrl || !supabaseAnonKey) {
    const msg = '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Define them in .env or app.config.ts.'
    console.warn(msg)
    throw new Error(msg)
  }
  _client = createClient(supabaseUrl, supabaseAnonKey)
  return _client
}

// (Optional) If you really need eager init uncomment below, but lazy keeps broken envs from killing bundler.
// export const supabase = getSupabase()

/** Quick check for env readiness to gate UI before creating a client. */
export function hasSupabaseEnv(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey)
}
