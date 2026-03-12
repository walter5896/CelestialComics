// /.netlify/functions/set-voting-period.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function deriveStatus(startTime, endTime) {
  const now = new Date();
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'open';
  return 'closed';
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Missing auth token' })
      };
    }

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

    const { start_time, end_time } = JSON.parse(event.body || '{}');

    if (!start_time || !end_time) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing start or end time' })
      };
    }

    const start = new Date(start_time);
    const end = new Date(end_time);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid start or end time' })
      };
    }

    if (end <= start) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'End time must be after start time' })
      };
    }

    const status = deriveStatus(start_time, end_time);

    // Find latest unfinalized period only
    const { data: periods, error: fetchError } = await supabase
      .from('voting_periods')
      .select('id, finalized_at')
      .is('finalized_at', null)
      .order('start_time', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    let savedPeriod = null;

    if (periods && periods.length > 0) {
      const { data, error } = await supabase
        .from('voting_periods')
        .update({
          start_time,
          end_time,
          status,
          winner_id: null,
          winning_vote_count: null
        })
        .eq('id', periods[0].id)
        .select()
        .single();

      if (error) throw error;
      savedPeriod = data;
    } else {
      const { data, error } = await supabase
        .from('voting_periods')
        .insert([
          {
            start_time,
            end_time,
            status
          }
        ])
        .select()
        .single();

      if (error) throw error;
      savedPeriod = data;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        period: savedPeriod
      })
    };
  } catch (err) {
    console.error('set-voting-period error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Server error' })
    };
  }
}