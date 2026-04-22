// /js/reading-progress.js

// =========================
// IMPORTS
// =========================
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';

// =========================
// HELPERS
// =========================
function normalizeStoryId(storyId) {
  const safeStoryId = String(storyId || '').trim();
  return safeStoryId || null;
}

function normalizePageNumber(pageNumber) {
  const numericPage = Number(pageNumber);
  if (!Number.isInteger(numericPage) || numericPage < 1) {
    return null;
  }
  return numericPage;
}

// =========================
// PROGRESS FETCHER
// =========================
// Fetches the user's saved reading progress for a specific story.
export async function fetchReadingProgressForStory(storyId) {
  const user = await getCurrentUserAsync();
  const safeStoryId = normalizeStoryId(storyId);

  if (!user || !safeStoryId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('reading_progress')
      .select('id, story_id, page_number, updated_at')
      .eq('user_id', user.id)
      .eq('story_id', safeStoryId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching reading progress for story:', error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error('Unexpected error fetching reading progress for story:', error);
    return null;
  }
}

// =========================
// LATEST PROGRESS FETCHER
// =========================
// Fetches the user's most recently updated reading progress across all stories.
export async function fetchLatestReadingProgress() {
  const user = await getCurrentUserAsync();

  if (!user) {
    return null;
  }

  try {
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
  } catch (error) {
    console.error('Unexpected error fetching latest reading progress:', error);
    return null;
  }
}

// =========================
// PROGRESS UPSERTER
// =========================
// Saves or updates reading progress for the current user and story.
export async function upsertReadingProgress(storyId, pageNumber) {
  const user = await getCurrentUserAsync();
  const safeStoryId = normalizeStoryId(storyId);
  const safePageNumber = normalizePageNumber(pageNumber);

  if (!user) {
    return {
      success: false,
      reason: 'not_logged_in'
    };
  }

  if (!safeStoryId) {
    return {
      success: false,
      reason: 'invalid_story_id'
    };
  }

  if (!safePageNumber) {
    return {
      success: false,
      reason: 'invalid_page_number'
    };
  }

  try {
    const { error } = await supabase
      .from('reading_progress')
      .upsert(
        {
          user_id: user.id,
          story_id: safeStoryId,
          page_number: safePageNumber,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'user_id,story_id'
        }
      );

    if (error) {
      console.error('Error upserting reading progress:', error);
      return {
        success: false,
        reason: 'upsert_failed',
        error
      };
    }

    return {
      success: true,
      story_id: safeStoryId,
      page_number: safePageNumber
    };
  } catch (error) {
    console.error('Unexpected error upserting reading progress:', error);
    return {
      success: false,
      reason: 'unexpected_error',
      error
    };
  }
}