// /.netlify/functions/upload-story-page.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing auth token' })
      };
    }

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid user token' })
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      throw new Error(`Profile lookup failed: ${profileError.message}`);
    }

    if (!profile || profile.role !== 'admin') {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid JSON body' })
      };
    }

    const {
      story_id,
      file_name,
      file_type,
      file_base64,
      caption = null
    } = body;

    if (!story_id || !file_name || !file_type || !file_base64) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required fields: story_id, file_name, file_type, file_base64'
        })
      };
    }

    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('id')
      .eq('id', story_id)
      .single();

    if (storyError || !story) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Story not found' })
      };
    }

    const { data: lastPageRow, error: lastPageError } = await supabase
      .from('story_pages')
      .select('page_number')
      .eq('story_id', story_id)
      .order('page_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastPageError) {
      throw new Error(`Failed to determine next page number: ${lastPageError.message}`);
    }

    const nextPageNumber = lastPageRow ? Number(lastPageRow.page_number) + 1 : 1;

    const extension = file_name.includes('.')
      ? file_name.split('.').pop().toLowerCase()
      : 'png';

    const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'png';
    const storagePath = `${story_id}/page-${nextPageNumber}.${safeExtension}`;

    let fileBuffer;
    try {
      fileBuffer = Buffer.from(file_base64, 'base64');
    } catch {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid base64 file data' })
      };
    }

    const { error: uploadError } = await supabase.storage
      .from('story-pages')
      .upload(storagePath, fileBuffer, {
        contentType: file_type,
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from('story-pages')
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl || null;

    if (!publicUrl) {
      throw new Error('Failed to generate public URL for uploaded story page');
    }

    const { data: pageRow, error: insertError } = await supabase
      .from('story_pages')
      .insert([
        {
          story_id,
          page_number: nextPageNumber,
          image_url: publicUrl,
          caption: caption?.trim() || null
        }
      ])
      .select()
      .single();

    if (insertError) {
      throw new Error(`Database insert failed: ${insertError.message}`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        page: pageRow
      })
    };
  } catch (err) {
    console.error('upload-story-page error:', err);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: err.message || 'Server error'
      })
    };
  }
}