// /.netlify/functions/submit-vote.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);

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

function createUserSupabaseClient(token) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function getUserFromToken(token) {
  const {
    data: { user },
    error
  } = await adminSupabase.auth.getUser(token);

  if (error || !user) {
    throw new Error('Invalid or expired user token.');
  }

  return user;
}

function normalizeStoryId(value) {
  const storyId = String(value || '').trim();

  if (!storyId) {
    throw new Error('story_id is required.');
  }

  return storyId;
}

function normalizeAmount(value) {
  const amount = Number(value);

  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error('Vote amount must be a positive whole number.');
  }

  return amount;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {
      success: false,
      reason: 'method_not_allowed',
      error: 'Method not allowed.'
    });
  }

  const token = getBearerToken(event);

  if (!token) {
    return jsonResponse(401, {
      success: false,
      reason: 'not_logged_in',
      error: 'Missing auth token.'
    });
  }

  try {
    await getUserFromToken(token);

    let body = {};

    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, {
        success: false,
        reason: 'invalid_json',
        error: 'Invalid JSON body.'
      });
    }

    const storyId = normalizeStoryId(body.story_id);
    const amount = normalizeAmount(body.amount || 1);

    const userSupabase = createUserSupabaseClient(token);

    const { data, error } = await userSupabase.rpc('submit_vote_secure', {
      p_story_id: storyId,
      p_amount: amount
    });

    if (error) {
      console.error('submit_vote_secure error:', error);

      return jsonResponse(400, {
        success: false,
        reason: error.code || 'rpc_error',
        error: error.message || 'Could not submit vote.'
      });
    }

    if (!data?.success) {
      return jsonResponse(400, {
        success: false,
        reason: data?.reason || 'vote_failed',
        error: data?.message || 'Could not submit vote.',
        result: data || null
      });
    }

    return jsonResponse(200, {
      success: true,
      result: data
    });
  } catch (error) {
    console.error('submit-vote function error:', error);

    return jsonResponse(500, {
      success: false,
      reason: 'server_error',
      error: error.message || 'Server error.'
    });
  }
};