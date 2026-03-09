// /.netlify/functions/create-story.js
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
    // Verify logged-in user from access token
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

    // Check admin role
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
      title,
      description,
      author,
      image_url,
      active = true
    } = JSON.parse(event.body);

    if (!title || !title.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Title is required' })
      };
    }

    const { data, error } = await supabase
      .from('stories')
      .insert([
        {
          title: title.trim(),
          description: description || null,
          author: author || null,
          image_url: image_url || null,
          active
        }
      ])
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
    console.error('create-story error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Server error' })
    };
  }
}