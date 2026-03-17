// /.netlify/functions/delete-story-cover.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function extractPath(url) {
  if (!url) return null;
  const marker = '/storage/v1/object/public/story-covers/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length);
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const token = event.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing token' }) };
  }

  try {
    const {
      data: { user }
    } = await supabase.auth.getUser(token);

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return { statusCode: 403, body: JSON.stringify({ error: 'Admin only' }) };
    }

    const { story_id } = JSON.parse(event.body);

    const { data: story } = await supabase
      .from('stories')
      .select('cover_image_url')
      .eq('id', story_id)
      .single();

    const path = extractPath(story.cover_image_url);

    if (path) {
      await supabase.storage.from('story-covers').remove([path]);
    }

    await supabase
      .from('stories')
      .update({
        cover_image_url: null,
        cover_image_path: null
      })
      .eq('id', story_id);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}