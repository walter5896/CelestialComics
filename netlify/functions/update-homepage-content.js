// /.netlify/functions/update-homepage-content.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeNullableText(value) {
  const str = String(value ?? '').trim();
  return str ? str : null;
}

function normalizeText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace('Bearer ', '').trim();

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

    if (profileError) {
      throw profileError;
    }

    if (!profile || profile.role !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON body' })
      };
    }

    const updates = {
      id: 1
    };

    if (Object.prototype.hasOwnProperty.call(body, 'hero_image_url')) {
      updates.hero_image_url = normalizeNullableText(body.hero_image_url);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'hero_image_path')) {
      updates.hero_image_path = normalizeNullableText(body.hero_image_path);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'secondary_image_url')) {
      updates.secondary_image_url = normalizeNullableText(body.secondary_image_url);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'secondary_image_path')) {
      updates.secondary_image_path = normalizeNullableText(body.secondary_image_path);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'hero_heading')) {
      updates.hero_heading = normalizeText(body.hero_heading);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'hero_description')) {
      updates.hero_description = normalizeText(body.hero_description);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'hero_cta_text')) {
      updates.hero_cta_text = normalizeText(body.hero_cta_text);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'hero_cta_link')) {
      updates.hero_cta_link = normalizeNullableText(body.hero_cta_link);
    }

    const { data, error } = await supabase
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

    if (error) {
      throw error;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        content: data
      })
    };
  } catch (err) {
    console.error('update-homepage-content error:', err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || 'Server error'
      })
    };
  }
}