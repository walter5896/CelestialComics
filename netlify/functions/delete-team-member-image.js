// /netlify/functions/delete-team-member-image.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const TEAM_IMAGES_BUCKET = 'team-images';

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

function parseRequestBody(body) {
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('Invalid JSON body');
  }
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

async function getTeamMember(teamMemberId) {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, image_path')
    .eq('id', teamMemberId)
    .single();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Team member not found.');
  }

  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: 'Method not allowed'
    });
  }

  const token = getBearerToken(event);

  if (!token) {
    return jsonResponse(401, {
      success: false,
      error: 'Missing auth token'
    });
  }

  try {
    await getAdminUserFromToken(token);

    const body = parseRequestBody(event.body);
    const teamMemberId = String(body.team_member_id || body.teamMemberId || '').trim();

    if (!teamMemberId) {
      throw new Error('team_member_id is required.');
    }

    const teamMember = await getTeamMember(teamMemberId);

    if (teamMember.image_path) {
      const { error: removeError } = await supabase.storage
        .from(TEAM_IMAGES_BUCKET)
        .remove([teamMember.image_path]);

      if (removeError) {
        console.warn('Could not remove team image from storage:', removeError);
      }
    }

    const { data: updatedMember, error: updateError } = await supabase
      .from('team_members')
      .update({
        image_url: null,
        image_path: null
      })
      .eq('id', teamMemberId)
      .select('*')
      .single();

    if (updateError) {
      throw updateError;
    }

    return jsonResponse(200, {
      success: true,
      team_member: updatedMember
    });
  } catch (error) {
    console.error('delete-team-member-image error:', error);

    return jsonResponse(500, {
      success: false,
      error: error.message || 'Failed to delete team member image'
    });
  }
};