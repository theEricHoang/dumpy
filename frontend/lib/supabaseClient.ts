import { createClient } from '@supabase/supabase-js'

// Prefer reading from Expo public env; fallback to placeholders for local dev.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Set them in app.json or .env files.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
