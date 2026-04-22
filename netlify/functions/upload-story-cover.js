import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Supabase environment variables.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const STORY_COVERS_BUCKET = 'story-covers';
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

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

function sanitizeFileName(fileName) {
  return String(fileName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, '-')
    .replace(/-+/g, '-');
}

function getFileExtension(fileName, fileType) {
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
    .select('id, cover_image_url, cover_image_path')
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

  let uploadedPath = null;

  try {
    await requireAdminUser(token);

    const body = parseRequestBody(event.body);

    const story_id = String(body.story_id || '').trim();
    const file_name = String(body.file_name || '').trim();
    const file_type = String(body.file_type || '').trim();
    const file_base64 = String(body.file_base64 || '').trim();

    if (!story_id || !file_name || !file_type || !file_base64) {
      return jsonResponse(400, {
        error: 'Missing required fields: story_id, file_name, file_type, file_base64'
      });
    }

    if (!ALLOWED_MIME_TYPES.has(file_type)) {
      return jsonResponse(400, {
        error: 'Unsupported file type. Allowed types: JPEG, PNG, WEBP, GIF.'
      });
    }

    const story = await requireStory(story_id);
    const fileBuffer = decodeBase64File(file_base64);

    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      return jsonResponse(400, {
        error: 'File is too large. Maximum size is 5 MB.'
      });
    }

    const safeFileName = sanitizeFileName(file_name);
    const extension = getFileExtension(safeFileName, file_type);
    const storagePath = `${story_id}/cover-${Date.now()}.${extension}`;
    uploadedPath = storagePath;

    const { error: uploadError } = await supabase.storage
      .from(STORY_COVERS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file_type,
        upsert: false,
        cacheControl: '3600'
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from(STORY_COVERS_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl || null;

    if (!publicUrl) {
      throw new Error('Failed to generate public image URL.');
    }

    const { data: updatedStory, error: updateError } = await supabase
      .from('stories')
      .update({
        cover_image_url: publicUrl,
        cover_image_path: storagePath
      })
      .eq('id', story_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    if (story.cover_image_path && story.cover_image_path !== storagePath) {
      try {
        await supabase.storage
          .from(STORY_COVERS_BUCKET)
          .remove([story.cover_image_path]);
      } catch (cleanupError) {
        console.error('upload-story-cover cleanup warning:', cleanupError);
      }
    }

    return jsonResponse(200, {
      success: true,
      cover_image_url: publicUrl,
      cover_image_path: storagePath,
      story: updatedStory
    });
  } catch (err) {
    console.error('upload-story-cover error:', err);

    if (uploadedPath) {
      try {
        await supabase.storage
          .from(STORY_COVERS_BUCKET)
          .remove([uploadedPath]);
      } catch (rollbackError) {
        console.error('upload-story-cover rollback warning:', rollbackError);
      }
    }

    const message = err?.message || 'Server error';
    const statusCode =
      message === 'Invalid user token' ? 401 :
      message === 'Admin access required' ? 403 :
      message === 'Story not found' ? 404 :
      message === 'Invalid JSON body.' ? 400 :
      message === 'Invalid base64 file data.' ? 400 :
      message === 'Decoded file is empty.' ? 400 :
      500;

    return jsonResponse(statusCode, { error: message });
  }
}