// /.netlify/functions/delete-homepage-image.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET_NAME = 'site-assets';
const VALID_SLOTS = new Set(['hero', 'secondary']);

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
}

function getSlotColumns(slot) {
  if (slot === 'hero') {
    return {
      pathColumn: 'hero_image_path',
      urlColumn: 'hero_image_url'
    };
  }

  return {
    pathColumn: 'secondary_image_path',
    urlColumn: 'secondary_image_url'
  };
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

  return { ok: true, user };
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

    const body = JSON.parse(event.body || '{}');
    const image_slot = String(body.image_slot || '').trim().toLowerCase();

    if (!VALID_SLOTS.has(image_slot)) {
      return jsonResponse(400, {
        error: 'image_slot must be "hero" or "secondary"'
      });
    }

    const { data: existingContent, error: existingError } = await supabase
      .from('homepage_content')
      .select(`
        id,
        hero_image_url,
        hero_image_path,
        secondary_image_url,
        secondary_image_path
      `)
      .eq('id', 1)
      .single();

    if (existingError) {
      throw existingError;
    }

    const { pathColumn, urlColumn } = getSlotColumns(image_slot);
    const existingPath = existingContent?.[pathColumn] || null;

    if (existingPath) {
      try {
        await supabase.storage.from(BUCKET_NAME).remove([existingPath]);
      } catch (cleanupError) {
        console.error('delete-homepage-image cleanup warning:', cleanupError);
      }
    }

    const updates = {
      id: 1,
      [pathColumn]: null,
      [urlColumn]: null
    };

    const { data: updatedContent, error: updateError } = await supabase
      .from('homepage_content')
      .upsert(updates, { onConflict: 'id' })
      .select(`
        id,
        hero_image_url,
        hero_image_path,
        secondary_image_url,
        secondary_image_path,
        hero_heading,
        hero_description,
        hero_cta_text,
        hero_cta_link,
        created_at,
        updated_at
      `)
      .single();

    if (updateError) {
      throw updateError;
    }

    return jsonResponse(200, {
      success: true,
      image_slot,
      content: updatedContent
    });
  } catch (err) {
    console.error('delete-homepage-image error:', err);

    return jsonResponse(500, {
      error: err.message || 'Server error'
    });
  }
}