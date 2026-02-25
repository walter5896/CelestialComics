// js/supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = window.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = window.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase PUBLIC env vars missing!");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);