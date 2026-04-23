import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAdmin(token) {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return {
      ok: false,
      response: {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid user token' })
      }
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
      response: {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      }
    };
  }

  return {
    ok: true,
    user
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace('Bearer ', '').trim();

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Missing auth token' })
    };
  }

  const storyId = String(
    event.queryStringParameters?.story_id || ''
  ).trim();

  if (!storyId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'story_id is required' })
    };
  }

  try {
    const adminCheck = await requireAdmin(token);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const { data: pages, error } = await supabase
      .from('story_pages')
      .select(`
        id,
        story_id,
        page_number,
        image_url,
        image_path,
        caption,
        created_at,
        is_preview_page
      `)
      .eq('story_id', storyId)
      .order('page_number', { ascending: true });

    if (error) {
      throw error;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        pages: pages || []
      })
    };
  } catch (err) {
    console.error('get-story-pages error:', err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || 'Server error'
      })
    };
  }
}