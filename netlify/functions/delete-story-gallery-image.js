// /netlify/functions/delete-story-gallery-image.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const STORY_GALLERY_BUCKET = 'story-gallery-images';

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

async function getGalleryImage(imageId) {
  const { data, error } = await supabase
    .from('story_gallery_images')
    .select('id, image_path')
    .eq('id', imageId)
    .single();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Gallery image not found.');
  }

  return data;
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

    const galleryImage = await getGalleryImage(imageId);

    if (galleryImage.image_path) {
      const { error: removeError } = await supabase.storage
        .from(STORY_GALLERY_BUCKET)
        .remove([galleryImage.image_path]);

      if (removeError) {
        console.warn('Could not remove gallery image from storage:', removeError);
      }
    }

    const { error: deleteError } = await supabase
      .from('story_gallery_images')
      .delete()
      .eq('id', imageId);

    if (deleteError) {
      throw deleteError;
    }

    return jsonResponse(200, {
      success: true
    });
  } catch (error) {
    console.error('delete-story-gallery-image error:', error);

    return jsonResponse(500, {
      success: false,
      error: error.message || 'Failed to delete story gallery image'
    });
  }
};