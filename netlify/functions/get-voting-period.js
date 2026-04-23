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

async function getWinnerStory(storyId) {
  if (!storyId) return null;

  const { data, error } = await supabase
    .from('stories')
    .select(`
      id,
      title,
      author,
      cover_image_url,
      active,
      story_status,
      production_stage_label,
      release_date
    `)
    .eq('id', storyId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

function attachWinnerStory(period, winnerStory) {
  if (!period) return null;

  return {
    ...period,
    winner_story: winnerStory || null
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

  try {
    const adminCheck = await requireAdmin(token);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const { data: currentPeriod, error: currentError } = await supabase
      .from('voting_periods')
      .select(`
        id,
        start_time,
        end_time,
        status,
        closed_at,
        finalized_at,
        winner_id,
        winning_vote_count
      `)
      .is('finalized_at', null)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentError) {
      throw currentError;
    }

    const { data: latestFinalizedPeriod, error: finalizedError } = await supabase
      .from('voting_periods')
      .select(`
        id,
        start_time,
        end_time,
        status,
        closed_at,
        finalized_at,
        winner_id,
        winning_vote_count
      `)
      .not('finalized_at', 'is', null)
      .order('finalized_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (finalizedError) {
      throw finalizedError;
    }

    const currentWinnerStory = await getWinnerStory(currentPeriod?.winner_id || null);
    const latestFinalizedWinnerStory = await getWinnerStory(latestFinalizedPeriod?.winner_id || null);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        current_period: attachWinnerStory(currentPeriod, currentWinnerStory),
        latest_finalized_period: attachWinnerStory(latestFinalizedPeriod, latestFinalizedWinnerStory)
      })
    };
  } catch (err) {
    console.error('get-voting-period error:', err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || 'Server error'
      })
    };
  }
}