// /netlify/functions/update-story-gallery-image.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

function getBearerToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

function parseRequestBody(body) {
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('Invalid JSON body');
  }
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
  }

  return fallback;
}

async function requireAdmin(token) {
  if (!token) {
    throw new Error('Missing auth token');
  }

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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const token = getBearerToken(event);
    await requireAdmin(token);

    const body = parseRequestBody(event.body);
    const imageId = String(body.id || body.image_id || body.imageId || '').trim();

    if (!imageId) {
      throw new Error('Gallery image id is required.');
    }

    const payload = {
      caption: normalizeText(body.caption),
      alt_text: normalizeText(body.alt_text || body.altText),
      display_order: normalizeInteger(body.display_order || body.displayOrder, 0),
      active: normalizeBoolean(body.active, true)
    };

    const { data, error } = await supabase
      .from('story_gallery_images')
      .update(payload)
      .eq('id', imageId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return jsonResponse(200, {
      success: true,
      gallery_image: data
    });
  } catch (error) {
    console.error('update-story-gallery-image error:', error);

    return jsonResponse(500, {
      success: false,
      error: error.message || 'Failed to update story gallery image'
    });
  }
};