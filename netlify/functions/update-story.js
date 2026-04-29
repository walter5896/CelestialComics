import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Supabase environment variables.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const VALID_STATUSES = new Set([
  'concept_bank',
  'active_vote',
  'winner_in_production',
  'released'
]);

const VALID_PRODUCTION_STAGES = new Set([
  'winner_selected',
  'story_development',
  'artwork_in_progress',
  'final_review',
  'preparing_release',
  'released'
]);

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

  if (!VALID_STATUSES.has(status)) {
    throw new Error('Invalid story_status value');
  }

  return status;
}

function normalizeProductionStage(value, storyStatus = 'concept_bank') {
  const fallbackStage = storyStatus === 'released'
    ? 'released'
    : 'winner_selected';

  const stage = String(value || fallbackStage).trim();

  if (!VALID_PRODUCTION_STAGES.has(stage)) {
    throw new Error('Invalid production_stage value');
  }

  return stage;
}

function normalizeReleaseDate(value) {
  if (!value) return null;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid release_date value');
  }

  return parsed.toISOString();
}

async function requireAdminUser(token) {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new Error('Invalid user token');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  if (!profile || profile.role !== 'admin') {
    throw new Error('Admin access required');
  }

  return user;
}

async function requireStory(storyId) {
  const { data: story, error } = await supabase
    .from('stories')
    .select('id')
    .eq('id', storyId)
    .single();

  if (error) {
    throw error;
  }

  if (!story) {
    throw new Error('Story not found');
  }

  return story;
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
    await requireAdminUser(token);

    const body = parseRequestBody(event.body);

    const story_id = String(body.story_id || '').trim();
    if (!story_id) {
      return jsonResponse(400, { error: 'story_id is required' });
    }

    const title = String(body.title || '').trim();
    if (!title) {
      return jsonResponse(400, { error: 'Title is required' });
    }

    await requireStory(story_id);

    const story_status = normalizeStoryStatus(body.story_status);
    const production_stage = normalizeProductionStage(body.production_stage, story_status);

    const updates = {
      title,
      description: normalizeNullableText(body.description),
      author: normalizeNullableText(body.author),
      cover_image_url: normalizeNullableText(body.cover_image_url),
      active: normalizeBoolean(body.active, true),
      story_status,
      production_stage,
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
      .update(updates)
      .eq('id', story_id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return jsonResponse(200, {
      success: true,
      story: data
    });
  } catch (err) {
    console.error('update-story error:', err);

    const message = err?.message || 'Server error';
    const statusCode =
      message === 'Missing auth token' ? 401 :
      message === 'Invalid user token' ? 401 :
      message === 'Admin access required' ? 403 :
      message === 'Story not found' ? 404 :
      message === 'Invalid JSON body.' ? 400 :
      message === 'story_id is required' ? 400 :
      message === 'Title is required' ? 400 :
      message === 'Invalid story_status value' ? 400 :
      message === 'Invalid production_stage value' ? 400 :
      message === 'Invalid release_date value' ? 400 :
      message === 'preview_page_count must be a whole number 0 or greater' ? 400 :
      500;

    return jsonResponse(statusCode, {
      error: message
    });
  }
}