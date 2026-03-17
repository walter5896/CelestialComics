// /.netlify/functions/upload-story-page.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STORY_PAGES_BUCKET = 'story-pages';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
}

function decodeBase64File(fileBase64) {
  try {
    return Buffer.from(fileBase64, 'base64');
  } catch {
    throw new Error('Invalid base64 file data.');
  }
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

  let newlyUploadedPath = null;

  try {
    // =========================
    // AUTH
    // =========================
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse(401, { error: 'Invalid user token' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return jsonResponse(403, { error: 'Admin access required' });
    }

    // =========================
    // BODY
    // =========================
    const body = JSON.parse(event.body || '{}');
    const {
      story_id,
      file_name,
      file_type,
      file_base64,
      caption = null
    } = body;

    if (!story_id || !file_name || !file_type || !file_base64) {
      return jsonResponse(400, {
        error: 'Missing required fields'
      });
    }

    // =========================
    // VERIFY STORY
    // =========================
    const { data: story } = await supabase
      .from('stories')
      .select('id')
      .eq('id', story_id)
      .single();

    if (!story) {
      return jsonResponse(404, { error: 'Story not found' });
    }

    // =========================
    // NEXT PAGE NUMBER
    // =========================
    const { data: lastPageRow } = await supabase
      .from('story_pages')
      .select('page_number')
      .eq('story_id', story_id)
      .order('page_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPageNumber = lastPageRow
      ? Number(lastPageRow.page_number) + 1
      : 1;

    // =========================
    // FILE
    // =========================
    const buffer = decodeBase64File(file_base64);

    if (!buffer || !buffer.length) {
      return jsonResponse(400, { error: 'Decoded file is empty.' });
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return jsonResponse(400, { error: 'File too large (max 5MB).' });
    }

    const extension = file_name.includes('.')
      ? file_name.split('.').pop().toLowerCase()
      : 'png';

    const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'png';

    const storagePath = `${story_id}/page-${nextPageNumber}-${Date.now()}.${safeExtension}`;
    newlyUploadedPath = storagePath;

    // =========================
    // UPLOAD
    // =========================
    const { error: uploadError } = await supabase.storage
      .from(STORY_PAGES_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file_type,
        upsert: false
      });

    if (uploadError) throw uploadError;

    // =========================
    // PUBLIC URL
    // =========================
    const { data: publicUrlData } = supabase.storage
      .from(STORY_PAGES_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl || null;

    // =========================
    // INSERT ROW
    // =========================
    const { data: pageRow, error: insertError } = await supabase
      .from('story_pages')
      .insert([
        {
          story_id,
          page_number: nextPageNumber,
          image_url: publicUrl,
          image_path: storagePath, // ✅ NEW
          caption: caption?.trim() || null
        }
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    return jsonResponse(200, {
      success: true,
      page: pageRow
    });
  } catch (err) {
    console.error('upload-story-page error:', err);

    // rollback
    if (newlyUploadedPath) {
      try {
        await supabase.storage
          .from(STORY_PAGES_BUCKET)
          .remove([newlyUploadedPath]);
      } catch (e) {
        console.error('rollback failed:', e);
      }
    }

    return jsonResponse(500, {
      error: err.message || 'Server error'
    });
  }
}