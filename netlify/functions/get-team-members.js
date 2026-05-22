// /netlify/functions/get-team-members.js

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
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  };
}

function getBearerToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

async function getAdminUserFromToken(token) {
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, {
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const token = getBearerToken(event);
    let isAdminRequest = false;

    if (token) {
      await getAdminUserFromToken(token);
      isAdminRequest = true;
    }

    let query = supabase
      .from('team_members')
      .select(`
        id,
        name,
        role_title,
        short_bio,
        full_bio,
        image_url,
        image_path,
        display_order,
        active,
        created_at,
        updated_at
      `)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (!isAdminRequest) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return jsonResponse(200, {
      success: true,
      team_members: data || []
    });
  } catch (error) {
    console.error('get-team-members error:', error);

    return jsonResponse(500, {
      success: false,
      error: error.message || 'Failed to load team members'
    });
  }
};