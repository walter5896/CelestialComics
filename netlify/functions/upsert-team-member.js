// /netlify/functions/upsert-team-member.js

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

function parseRequestBody(body) {
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('Invalid JSON body');
  }
}

function normalizeNullableText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeRequiredText(value, fieldName) {
  const text = String(value ?? '').trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
  }

  return fallback;
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

function buildTeamMemberPayload(body) {
  return {
    name: normalizeRequiredText(body.name, 'name'),
    role_title: normalizeNullableText(body.role_title),
    short_bio: normalizeNullableText(body.short_bio),
    full_bio: normalizeNullableText(body.full_bio),
    display_order: normalizeInteger(body.display_order, 0),
    active: normalizeBoolean(body.active, true)
  };
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
    const id = String(body.id || '').trim();
    const payload = buildTeamMemberPayload(body);

    let result;

    if (id) {
      const { data, error } = await supabase
        .from('team_members')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      result = data;
    } else {
      const { data, error } = await supabase
        .from('team_members')
        .insert([payload])
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      result = data;
    }

    return jsonResponse(200, {
      success: true,
      team_member: result
    });
  } catch (error) {
    console.error('upsert-team-member error:', error);

    return jsonResponse(500, {
      success: false,
      error: error.message || 'Failed to save team member'
    });
  }
};