// /.netlify/functions/close-voting-period.js
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

    if (profileError) {
      throw profileError;
    }

    if (!profile || profile.role !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    // Find latest unfinalized period
    const { data: periods, error: fetchError } = await supabase
      .from('voting_periods')
      .select('id, start_time, end_time, status, finalized_at, closed_at, winner_id, winning_vote_count')
      .is('finalized_at', null)
      .order('id', { ascending: false })
      .limit(1);

    if (fetchError) {
      throw fetchError;
    }

    const activePeriod = periods?.[0] || null;

    if (!activePeriod) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No unfinalized voting period found' })
      };
    }

    const nowIso = new Date().toISOString();

    // If it was already manually closed, just normalize status and return.
    if (activePeriod.closed_at) {
      const { data: alreadyClosedPeriod, error: alreadyClosedError } = await supabase
        .from('voting_periods')
        .update({
          status: 'closed'
        })
        .eq('id', activePeriod.id)
        .select()
        .single();

      if (alreadyClosedError) {
        throw alreadyClosedError;
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Voting period was already closed.',
          period: alreadyClosedPeriod
        })
      };
    }

    // If scheduled end time already passed, mark status closed but preserve original dates.
    if (new Date(activePeriod.end_time) <= new Date(nowIso)) {
      const { data: naturallyClosedPeriod, error: naturallyClosedError } = await supabase
        .from('voting_periods')
        .update({
          status: 'closed'
        })
        .eq('id', activePeriod.id)
        .select()
        .single();

      if (naturallyClosedError) {
        throw naturallyClosedError;
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Voting period was already closed by its scheduled end time.',
          period: naturallyClosedPeriod
        })
      };
    }

    // Manually close the round now, without mutating start/end times.
    const { data: updatedPeriod, error: updateError } = await supabase
      .from('voting_periods')
      .update({
        closed_at: nowIso,
        status: 'closed',
        winner_id: null,
        winning_vote_count: null
      })
      .eq('id', activePeriod.id)
      .is('finalized_at', null)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Voting period closed successfully.',
        period: updatedPeriod
      })
    };
  } catch (err) {
    console.error('close-voting-period error:', err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || 'Server error'
      })
    };
  }
}