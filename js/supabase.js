import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// PUBLIC — safe to expose in frontend
const SUPABASE_URL = "https://axkifbrakyboodtxmimb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4a2lmYnJha3lib29kdHhtaW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODg5MTEsImV4cCI6MjA4MTY2NDkxMX0.v8pMv2VkGWUNjBDzdbfyuNYiWzkag7aYj4XOGFsjMCs";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
