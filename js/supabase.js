// /js/supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Use keys from the browser-exposed env.js
const supabaseUrl = window.__env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = window.__env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
