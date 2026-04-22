import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Supabase environment variables.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const STORY_PAGES_BUCKET = 'story-pages';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp'
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

function sanitizeExtension(fileName) {
  const rawExtension = String(fileName || '').includes('.')
    ? String(fileName).split('.').pop().toLowerCase()
    : 'png';

  return rawExtension.replace(/[^a-z0-9]/g, '') || 'png';
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

async function getNextPageNumber(storyId) {
  const { data: lastPageRow, error } = await supabase
    .from('story_pages')
    .select('page_number')
    .eq('story_id', storyId)
    .order('page_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return lastPageRow ? Number(lastPageRow.page_number) + 1 : 1;
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
    const {
      story_id,
      file_name,
      file_type,
      file_base64,
      caption = null
    } = body;

    if (!story_id || !file_name || !file_type || !file_base64) {
      return jsonResponse(400, { error: 'Missing required fields' });
    }

    if (!ALLOWED_MIME_TYPES.has(String(file_type))) {
      return jsonResponse(400, {
        error: 'Unsupported file type. Allowed: PNG, JPEG, WEBP.'
      });
    }

    await requireStory(story_id);

    const nextPageNumber = await getNextPageNumber(story_id);
    const buffer = decodeBase64File(file_base64);

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return jsonResponse(400, {
        error: 'File too large (max 5MB).'
      });
    }

    const safeExtension = sanitizeExtension(file_name);
    const storagePath = `${story_id}/page-${nextPageNumber}-${Date.now()}.${safeExtension}`;
    uploadedPath = storagePath;

    const { error: uploadError } = await supabase.storage
      .from(STORY_PAGES_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file_type,
        upsert: false
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from(STORY_PAGES_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl || null;

    const { data: pageRow, error: insertError } = await supabase
      .from('story_pages')
      .insert([
        {
          story_id,
          page_number: nextPageNumber,
          image_url: publicUrl,
          image_path: storagePath,
          caption: String(caption || '').trim() || null
        }
      ])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return jsonResponse(200, {
      success: true,
      page: pageRow
    });
  } catch (err) {
    console.error('upload-story-page error:', err);

    if (uploadedPath) {
      try {
        await supabase.storage
          .from(STORY_PAGES_BUCKET)
          .remove([uploadedPath]);
      } catch (rollbackError) {
        console.error('upload-story-page rollback failed:', rollbackError);
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