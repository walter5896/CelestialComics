// /js/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

function getRequiredEnv(name) {
  const value = window.__env?.[name];

  if (!value || typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function createSupabaseBrowserClient() {
  const supabaseUrl = getRequiredEnv('PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = getRequiredEnv('PUBLIC_SUPABASE_ANON_KEY');

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

export const supabase =
  window.__supabaseClient || createSupabaseBrowserClient();

if (!window.__supabaseClient) {
  window.__supabaseClient = supabase;
}