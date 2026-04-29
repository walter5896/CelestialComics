// /.netlify/functions/get-featured-winner.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SETTING_KEY = 'featured_winner';

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { data: setting, error: settingError } = await supabase
      .from('site_settings')
      .select('key, value, updated_at')
      .eq('key', SETTING_KEY)
      .maybeSingle();

    if (settingError) {
      throw settingError;
    }

    const storyId = setting?.value?.story_id || null;

    if (!storyId) {
      return jsonResponse(200, {
        success: true,
        featured_winner_story_id: null,
        story: null,
        setting: setting || null
      });
    }

    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select(`
        id,
        title,
        author,
        description,
        image_url,
        cover_image_url,
        active,
        story_status,
        production_stage,
        production_stage_label,
        created_at
      `)
      .eq('id', storyId)
      .maybeSingle();

    if (storyError) {
      throw storyError;
    }

    return jsonResponse(200, {
      success: true,
      featured_winner_story_id: storyId,
      story: story || null,
      setting: setting || null
    });
  } catch (err) {
    console.error('get-featured-winner error:', err);

    return jsonResponse(500, {
      success: false,
      error: err.message || 'Server error'
    });
  }
}