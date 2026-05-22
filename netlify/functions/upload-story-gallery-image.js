// /netlify/functions/upload-story-gallery-image.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const STORY_GALLERY_BUCKET = 'story-gallery-images';
const MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

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

function sanitizeFileName(fileName) {
  return String(fileName || 'story-gallery-image')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, '-')
    .replace(/-+/g, '-');
}

function getFileExtension(fileName = '', fileType = '') {
  const safeName = String(fileName || '').toLowerCase();

  if (safeName.includes('.')) {
    const ext = safeName.split('.').pop()?.replace(/[^a-z0-9]/g, '');
    if (ext) return ext;
  }

  switch (fileType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'bin';
  }
}

function decodeBase64File(fileBase64) {
  try {
    const buffer = Buffer.from(String(fileBase64 || ''), 'base64');

    if (!buffer.length) {
      throw new Error('Decoded file is empty.');
    }

    return buffer;
  } catch {
    throw new Error('Invalid base64 file data.');
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

async function verifyStoryExists(storyId) {
  const { data, error } = await supabase
    .from('stories')
    .select('id, title')
    .eq('id', storyId)
    .single();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Story not found');
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

  let uploadedPath = null;

  try {
    const token = getBearerToken(event);
    await requireAdmin(token);

    const body = parseRequestBody(event.body);

    const storyId = String(body.story_id || body.storyId || '').trim();
    const fileBase64 = body.file_base64 || body.fileBase64;
    const fileName = sanitizeFileName(body.file_name || body.fileName || 'story-gallery-image');
    const fileType = String(body.file_type || body.fileType || '').trim();

    if (!storyId) {
      throw new Error('story_id is required');
    }

    if (!fileBase64) {
      throw new Error('file_base64 is required');
    }

    if (!ALLOWED_MIME_TYPES.has(fileType)) {
      throw new Error('Only JPG, PNG, WEBP, and GIF images are allowed.');
    }

    await verifyStoryExists(storyId);

    const fileBuffer = decodeBase64File(fileBase64);

    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      throw new Error('Image must be 6MB or smaller.');
    }

    const extension = getFileExtension(fileName, fileType);
    const baseName = fileName.replace(/\.[a-z0-9]+$/i, '') || 'story-gallery-image';
    const storagePath = `stories/${storyId}/${Date.now()}-${baseName}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(STORY_GALLERY_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: fileType,
        upsert: false
      });

    if (uploadError) {
      throw uploadError;
    }

    uploadedPath = storagePath;

    const { data: publicUrlData } = supabase.storage
      .from(STORY_GALLERY_BUCKET)
      .getPublicUrl(storagePath);

    const imageUrl = publicUrlData?.publicUrl || null;

    if (!imageUrl) {
      throw new Error('Could not generate public image URL.');
    }

    const { data: insertedImage, error: insertError } = await supabase
      .from('story_gallery_images')
      .insert([
        {
          story_id: storyId,
          image_url: imageUrl,
          image_path: storagePath,
          caption: normalizeText(body.caption),
          alt_text: normalizeText(body.alt_text || body.altText),
          display_order: normalizeInteger(body.display_order || body.displayOrder, 0),
          active: normalizeBoolean(body.active, true)
        }
      ])
      .select('*')
      .single();

    if (insertError) {
      throw insertError;
    }

    return jsonResponse(200, {
      success: true,
      gallery_image: insertedImage
    });
  } catch (error) {
    console.error('upload-story-gallery-image error:', error);

    if (uploadedPath) {
      await supabase.storage
        .from(STORY_GALLERY_BUCKET)
        .remove([uploadedPath]);
    }

    return jsonResponse(500, {
      success: false,
      error: error.message || 'Failed to upload story gallery image'
    });
  }
};