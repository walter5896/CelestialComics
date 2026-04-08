// /.netlify/functions/create-story.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_STATUSES = [
  'concept_bank',
  'active_vote',
  'winner_in_production',
  'released'
];

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeNullableText(value) {
  const str = String(value ?? '').trim();
  return str ? str : null;
}

function normalizePreviewCount(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('preview_page_count must be a whole number 0 or greater');
  }
  return parsed;
}

function normalizeStoryStatus(value) {
  const status = String(value || 'concept_bank').trim();
  if (!VALID_STATUSES.includes(status)) {
    throw new Error('Invalid story_status value');
  }
  return status;
}

function normalizeReleaseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid release_date value');
  }
  return parsed.toISOString();
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Missing auth token' })
    };
  }

  try {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid user token' })
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) throw profileError;

    if (!profile || profile.role !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const body = JSON.parse(event.body || '{}');

    const title = String(body.title || '').trim();
    if (!title) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Title is required' })
      };
    }

    const payload = {
      title,
      description: normalizeNullableText(body.description),
      author: normalizeNullableText(body.author),
      cover_image_url: normalizeNullableText(body.cover_image_url),
      active: normalizeBoolean(body.active, true),
      story_status: normalizeStoryStatus(body.story_status),
      production_stage_label: normalizeNullableText(body.production_stage_label),
      is_preview_enabled: normalizeBoolean(body.is_preview_enabled, false),
      preview_page_count: normalizePreviewCount(body.preview_page_count ?? 0),
      is_digital_purchase_available: normalizeBoolean(body.is_digital_purchase_available, false),
      is_paperback_available: normalizeBoolean(body.is_paperback_available, false),
      bundle_purchase_available: normalizeBoolean(body.bundle_purchase_available, false),
      release_date: normalizeReleaseDate(body.release_date)
    };

    const { data, error } = await supabase
      .from('stories')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        story: data
      })
    };
  } catch (err) {
    console.error('create-story error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Server error' })
    };
  }
}