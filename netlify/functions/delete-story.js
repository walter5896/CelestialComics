// /.netlify/functions/delete-story.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STORY_COVERS_BUCKET = 'story-covers';
const STORY_PAGES_BUCKET = 'story-pages';

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return jsonResponse(401, { error: 'Missing auth token' });
  }

  try {
    // =========================
    // AUTH
    // =========================
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse(401, { error: 'Invalid user token' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return jsonResponse(403, { error: 'Admin access required' });
    }

    // =========================
    // INPUT
    // =========================
    const { story_id } = JSON.parse(event.body || '{}');

    if (!story_id) {
      return jsonResponse(400, { error: 'story_id is required' });
    }

    // =========================
    // LOAD STORY
    // =========================
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('id, cover_image_path')
      .eq('id', story_id)
      .single();

    if (storyError || !story) {
      return jsonResponse(404, { error: 'Story not found' });
    }

    // =========================
    // DELETE COVER IMAGE
    // =========================
    if (story.cover_image_path) {
      try {
        await supabase.storage
          .from(STORY_COVERS_BUCKET)
          .remove([story.cover_image_path]);
      } catch (err) {
        console.error('Failed to delete cover image:', err);
      }
    }

    // =========================
    // LOAD STORY PAGES
    // =========================
    const { data: pages, error: pagesError } = await supabase
      .from('story_pages')
      .select('id, image_path')
      .eq('story_id', story_id);

    if (pagesError) throw pagesError;

    // =========================
    // DELETE PAGE IMAGES
    // =========================
    const pagePaths = (pages || [])
      .map(p => p.image_path)
      .filter(Boolean);

    if (pagePaths.length > 0) {
      try {
        await supabase.storage
          .from(STORY_PAGES_BUCKET)
          .remove(pagePaths);
      } catch (err) {
        console.error('Failed to delete page images:', err);
      }
    }

    // =========================
    // DELETE PAGE ROWS
    // =========================
    const { error: deletePagesError } = await supabase
      .from('story_pages')
      .delete()
      .eq('story_id', story_id);

    if (deletePagesError) throw deletePagesError;

    // =========================
    // DELETE STORY ROW
    // =========================
    const { error: deleteStoryError } = await supabase
      .from('stories')
      .delete()
      .eq('id', story_id);

    if (deleteStoryError) throw deleteStoryError;

    return jsonResponse(200, {
      success: true,
      message: 'Story and all associated images deleted successfully.'
    });

  } catch (err) {
    console.error('delete-story error:', err);

    return jsonResponse(500, {
      error: err.message || 'Server error'
    });
  }
}