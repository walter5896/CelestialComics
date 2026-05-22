// /netlify/functions/get-story-gallery-images.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

function getBearerToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

async function isAdminToken(token) {
  if (!token) return false;

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) return false;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) return false;

  return profile.role === 'admin';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, {
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const storyId = String(event.queryStringParameters?.story_id || '').trim();

    if (!storyId) {
      return jsonResponse(400, {
        success: false,
        error: 'Missing story_id'
      });
    }

    const token = getBearerToken(event);
    const adminRequest = await isAdminToken(token);

    let query = supabase
      .from('story_gallery_images')
      .select(`
        id,
        story_id,
        image_url,
        image_path,
        caption,
        alt_text,
        display_order,
        active,
        created_at,
        updated_at
      `)
      .eq('story_id', storyId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (!adminRequest) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return jsonResponse(200, {
      success: true,
      gallery_images: data || []
    });
  } catch (error) {
    console.error('get-story-gallery-images error:', error);

    return jsonResponse(500, {
      success: false,
      error: error.message || 'Failed to load story gallery images'
    });
  }
};