// /.netlify/functions/update-story.js
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

    const {
      story_id,
      title,
      description,
      author,
      cover_image_url,
      active
    } = JSON.parse(event.body || '{}');

    if (!story_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'story_id is required' })
      };
    }

    if (!title || !title.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Title is required' })
      };
    }

    const updates = {
      title: title.trim(),
      description: description || null,
      author: author || null,
      cover_image_url: cover_image_url || null,
      active: typeof active === 'boolean' ? active : true
    };

    const { data, error } = await supabase
      .from('stories')
      .update(updates)
      .eq('id', story_id)
      .select()
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        story: data
      })
    };
  } catch (err) {
    console.error('update-story error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Server error' })
    };
  }
}