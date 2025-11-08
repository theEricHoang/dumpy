import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://bvlhowuuvasczzvfpnxr.supabase.co'
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2bGhvd3V1dmFzY3p6dmZwbnhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1NDI4NDMsImV4cCI6MjA3ODExODg0M30.h8WQHNSWy8RO4gkeEyVeqhOpIhK-MiykcFc3jAEfedo'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)