// /.netlify/functions/upload-story-cover.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace('Bearer ', '');

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

    if (profileError) throw profileError;

    if (!profile || profile.role !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const body = JSON.parse(event.body || '{}');
    const {
      story_id,
      file_name,
      file_type,
      file_base64
    } = body;

    if (!story_id || !file_name || !file_type || !file_base64) {
      return {
        statusCode: 400,
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
        body: JSON.stringify({ error: 'Story not found' })
      };
    }

    const extension = file_name.includes('.')
      ? file_name.split('.').pop().toLowerCase()
      : 'png';

    const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'png';
    const storagePath = `${story_id}/cover.${safeExtension}`;

    const buffer = Buffer.from(file_base64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('story-covers')
      .upload(storagePath, buffer, {
        contentType: file_type,
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from('story-covers')
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl || null;

    const { data: updatedStory, error: updateError } = await supabase
      .from('stories')
      .update({ cover_image_url: publicUrl })
      .eq('id', story_id)
      .select()
      .single();

    if (updateError) throw updateError;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        cover_image_url: publicUrl,
        story: updatedStory
      })
    };
  } catch (err) {
    console.error('upload-story-cover error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Server error' })
    };
  }
}