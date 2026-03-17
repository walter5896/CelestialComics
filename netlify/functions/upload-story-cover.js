// /.netlify/functions/upload-story-cover.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STORY_COVERS_BUCKET = 'story-covers';
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// =========================
// HELPERS
// =========================
function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
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
    const ext = safeName.split('.').pop().replace(/[^a-z0-9]/g, '');
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
    return Buffer.from(fileBase64, 'base64');
  } catch {
    throw new Error('Invalid base64 file data.');
  }
}

// =========================
// MAIN HANDLER
// =========================
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return jsonResponse(401, { error: 'Missing auth token' });
  }

  let newlyUploadedPath = null;

  try {
    // =========================
    // AUTH / ADMIN CHECK
    // =========================
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse(401, { error: 'Invalid user token' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) throw profileError;

    if (!profile || profile.role !== 'admin') {
      return jsonResponse(403, { error: 'Admin access required' });
    }

    // =========================
    // BODY PARSE
    // =========================
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

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

    // =========================
    // VERIFY STORY EXISTS
    // =========================
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('id, cover_image_url, cover_image_path')
      .eq('id', story_id)
      .single();

    if (storyError || !story) {
      return jsonResponse(404, { error: 'Story not found' });
    }

    // =========================
    // DECODE / VALIDATE FILE
    // =========================
    const fileBuffer = decodeBase64File(file_base64);

    if (!fileBuffer || !fileBuffer.length) {
      return jsonResponse(400, { error: 'Decoded file is empty.' });
    }

    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      return jsonResponse(400, {
        error: 'File is too large. Maximum size is 5 MB.'
      });
    }

    // =========================
    // BUILD STORAGE PATH
    // =========================
    const safeFileName = sanitizeFileName(file_name);
    const extension = getFileExtension(safeFileName, file_type);
    const timestamp = Date.now();
    const storagePath = `${story_id}/cover-${timestamp}.${extension}`;
    newlyUploadedPath = storagePath;

    // =========================
    // UPLOAD TO STORAGE
    // =========================
    const { error: uploadError } = await supabase.storage
      .from(STORY_COVERS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file_type,
        upsert: false,
        cacheControl: '3600'
      });

    if (uploadError) throw uploadError;

    // =========================
    // GET PUBLIC URL
    // =========================
    const { data: publicUrlData } = supabase.storage
      .from(STORY_COVERS_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl || null;

    if (!publicUrl) {
      throw new Error('Failed to generate public image URL.');
    }

    // =========================
    // UPDATE STORY ROW
    // =========================
    const { data: updatedStory, error: updateError } = await supabase
      .from('stories')
      .update({
        cover_image_url: publicUrl,
        cover_image_path: storagePath
      })
      .eq('id', story_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // =========================
    // DELETE OLD COVER (BEST EFFORT)
    // =========================
    if (
      story.cover_image_path &&
      story.cover_image_path !== storagePath
    ) {
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

    // =========================
    // BEST-EFFORT ROLLBACK
    // =========================
    if (newlyUploadedPath) {
      try {
        await supabase.storage
          .from(STORY_COVERS_BUCKET)
          .remove([newlyUploadedPath]);
      } catch (rollbackError) {
        console.error('upload-story-cover rollback warning:', rollbackError);
      }
    }

    return jsonResponse(500, {
      error: err.message || 'Server error'
    });
  }
}