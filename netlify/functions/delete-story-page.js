// /.netlify/functions/delete-story-page.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) throw profileError;

    if (!profile || profile.role !== 'admin') {
      return jsonResponse(403, { error: 'Admin access required' });
    }

    // =========================
    // INPUT
    // =========================
    const { page_id } = JSON.parse(event.body || '{}');

    if (!page_id) {
      return jsonResponse(400, { error: 'page_id is required' });
    }

    // =========================
    // LOAD PAGE ROW
    // =========================
    const { data: pageRow, error: pageLookupError } = await supabase
      .from('story_pages')
      .select('id, image_url, image_path')
      .eq('id', page_id)
      .single();

    if (pageLookupError || !pageRow) {
      return jsonResponse(404, { error: 'Story page not found' });
    }

    // =========================
    // DELETE STORAGE OBJECT
    // =========================
    if (pageRow.image_path) {
      const { error: storageDeleteError } = await supabase.storage
        .from(STORY_PAGES_BUCKET)
        .remove([pageRow.image_path]);

      if (storageDeleteError) {
        throw storageDeleteError;
      }
    }

    // =========================
    // DELETE DB ROW
    // =========================
    const { error: deleteRowError } = await supabase
      .from('story_pages')
      .delete()
      .eq('id', page_id);

    if (deleteRowError) throw deleteRowError;

    return jsonResponse(200, {
      success: true,
      message: 'Story page deleted successfully.'
    });
  } catch (err) {
    console.error('delete-story-page error:', err);

    return jsonResponse(500, {
      error: err.message || 'Server error'
    });
  }
}