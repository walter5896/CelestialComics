// js/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const supabase = createClient(
  'https://axkifbrakyboodtxmimb.supabase.co',        // ← your Project URL
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4a2lmYnJha3lib29kdHhtaW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODg5MTEsImV4cCI6MjA4MTY2NDkxMX0.v8pMv2VkGWUNjBDzdbfyuNYiWzkag7aYj4XOGFsjMCs' // ← your anon public key
);
