import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const supabase = createClient(
  window.__env.SUPABASE_URL,
  window.__env.SUPABASE_KEY
);
