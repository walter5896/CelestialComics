// /.netlify/functions/upload-homepage-image.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET_NAME = 'site-assets';
const VALID_SLOTS = new Set(['hero', 'secondary']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml'
]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
}

function sanitizeFileName(fileName = 'image') {
  return String(fileName || 'image')
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
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
}

function decodeBase64File(fileBase64) {
  try {
    return Buffer.from(fileBase64, 'base64');
  } catch {
    throw new Error('Invalid base64 file data.');
  }
}

function buildStoragePath(slot, fileName, fileType) {
  const safeName = sanitizeFileName(fileName);
  const ext = getFileExtension(safeName, fileType);
  const baseName = safeName.replace(/\.[a-z0-9]+$/i, '') || 'image';
  const timestamp = Date.now();

  return `homepage/${slot}-${timestamp}-${baseName}.${ext}`;
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

  let newlyUploadedPath = null;

  try {
    const adminCheck = await requireAdmin(token);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = JSON.parse(event.body || '{}');

    const image_slot = String(body.image_slot || '').trim().toLowerCase();
    const file_name = String(body.file_name || '').trim();
    const file_type = String(body.file_type || '').trim();
    const file_base64 = String(body.file_base64 || '').trim();

    if (!VALID_SLOTS.has(image_slot)) {
      return jsonResponse(400, {
        error: 'image_slot must be "hero" or "secondary"'
      });
    }

    if (!file_name || !file_type || !file_base64) {
      return jsonResponse(400, {
        error: 'image_slot, file_name, file_type, and file_base64 are required'
      });
    }

    if (!ALLOWED_MIME_TYPES.has(file_type)) {
      return jsonResponse(400, {
        error: 'Unsupported image type.'
      });
    }

    const fileBuffer = decodeBase64File(file_base64);

    if (!fileBuffer.length) {
      return jsonResponse(400, {
        error: 'Image file is empty.'
      });
    }

    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      return jsonResponse(400, {
        error: 'Image exceeds 5 MB size limit.'
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
    const oldPath = existingContent?.[pathColumn] || null;

    const storagePath = buildStoragePath(image_slot, file_name, file_type);
    newlyUploadedPath = storagePath;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: file_type,
        upsert: false,
        cacheControl: '3600'
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl || null;

    if (!publicUrl) {
      throw new Error('Failed to generate public image URL.');
    }

    const updates = {
      id: 1,
      [pathColumn]: storagePath,
      [urlColumn]: publicUrl
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

    if (oldPath && oldPath !== storagePath) {
      try {
        await supabase.storage.from(BUCKET_NAME).remove([oldPath]);
      } catch (cleanupError) {
        console.error('upload-homepage-image cleanup warning:', cleanupError);
      }
    }

    return jsonResponse(200, {
      success: true,
      image_slot,
      image_url: publicUrl,
      image_path: storagePath,
      content: updatedContent
    });
  } catch (err) {
    console.error('upload-homepage-image error:', err);

    if (newlyUploadedPath) {
      try {
        await supabase.storage.from(BUCKET_NAME).remove([newlyUploadedPath]);
      } catch (rollbackError) {
        console.error('upload-homepage-image rollback warning:', rollbackError);
      }
    }

    return jsonResponse(500, {
      error: err.message || 'Server error'
    });
  }
}