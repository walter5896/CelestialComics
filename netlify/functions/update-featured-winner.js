// /.netlify/functions/update-featured-winner.js
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

function parseRequestBody(body) {
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('Invalid JSON body.');
  }
}

async function requireAdmin(token) {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return {
      ok: false,
      response: jsonResponse(401, { error: 'Invalid user token' })
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  if (!profile || profile.role !== 'admin') {
    return {
      ok: false,
      response: jsonResponse(403, { error: 'Admin access required' })
    };
  }

  return {
    ok: true,
    user
  };
}

async function validateStoryId(storyId) {
  if (!storyId) return null;

  const { data: story, error } = await supabase
    .from('stories')
    .select('id, title, story_status')
    .eq('id', storyId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!story) {
    throw new Error('Selected story was not found.');
  }

  return story;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return jsonResponse(401, { error: 'Missing auth token' });
  }

  try {
    const adminCheck = await requireAdmin(token);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = parseRequestBody(event.body);
    const storyId = String(body.story_id || '').trim() || null;

    const story = await validateStoryId(storyId);

    const settingValue = storyId
      ? {
          story_id: storyId,
          updated_by: adminCheck.user.id,
          updated_via: 'admin_manual_selection'
        }
      : {
          story_id: null,
          updated_by: adminCheck.user.id,
          updated_via: 'admin_manual_clear'
        };

    const { data: setting, error: settingError } = await supabase
      .from('site_settings')
      .upsert(
        {
          key: SETTING_KEY,
          value: settingValue
        },
        { onConflict: 'key' }
      )
      .select('key, value, updated_at')
      .single();

    if (settingError) {
      throw settingError;
    }

    return jsonResponse(200, {
      success: true,
      featured_winner_story_id: storyId,
      story,
      setting
    });
  } catch (err) {
    console.error('update-featured-winner error:', err);

    const message = err.message || 'Server error';
    const statusCode =
      message === 'Invalid JSON body.' ? 400 :
      message === 'Selected story was not found.' ? 400 :
      500;

    return jsonResponse(statusCode, {
      success: false,
      error: message
    });
  }
}