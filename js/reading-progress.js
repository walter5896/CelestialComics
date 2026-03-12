// /js/reading-progress.js

// =========================
// IMPORTS
// =========================
// Import the shared Supabase client and auth helper.
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';

// =========================
// PROGRESS FETCHER
// =========================
// Fetches the user's saved reading progress for a specific story.
export async function fetchReadingProgressForStory(storyId) {
  const user = await getCurrentUserAsync();
  if (!user || !storyId) return null;

  const { data, error } = await supabase
    .from('reading_progress')
    .select('id, story_id, page_number, updated_at')
    .eq('user_id', user.id)
    .eq('story_id', storyId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching reading progress for story:', error);
    return null;
  }

  return data || null;
}

// =========================
// LATEST PROGRESS FETCHER
// =========================
// Fetches the user's most recently updated reading progress across all stories.
export async function fetchLatestReadingProgress() {
  const user = await getCurrentUserAsync();
  if (!user) return null;

  const { data, error } = await supabase
    .from('reading_progress')
    .select('id, story_id, page_number, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching latest reading progress:', error);
    return null;
  }

  return data?.[0] || null;
}

// =========================
// PROGRESS UPSERTER
// =========================
// Saves or updates reading progress for the current user and story.
export async function upsertReadingProgress(storyId, pageNumber) {
  const user = await getCurrentUserAsync();
  if (!user || !storyId || !Number.isInteger(pageNumber) || pageNumber < 1) {
    return { success: false };
  }

  const { error } = await supabase
    .from('reading_progress')
    .upsert(
      {
        user_id: user.id,
        story_id: storyId,
        page_number: pageNumber,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'user_id,story_id'
      }
    );

  if (error) {
    console.error('Error upserting reading progress:', error);
    return { success: false, error };
  }

  return { success: true };
}