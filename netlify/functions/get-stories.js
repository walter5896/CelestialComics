// /.netlify/functions/get-stories.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    if (profileError) {
      throw profileError;
    }

    if (!profile || profile.role !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select(`
        id,
        title,
        author,
        description,
        cover_image_url,
        cover_image_path,
        active,
        created_at,
        story_status,
        production_stage,
        production_stage_label,
        is_preview_enabled,
        preview_page_count,
        is_digital_purchase_available,
        is_paperback_available,
        bundle_purchase_available,
        release_date
      `)
      .order('created_at', { ascending: false });

    if (storiesError) {
      throw storiesError;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        stories: stories || []
      })
    };
  } catch (err) {
    console.error('get-stories error:', err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || 'Server error'
      })
    };
  }
}