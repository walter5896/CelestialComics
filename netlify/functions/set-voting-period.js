// /.netlify/functions/set-voting-period.js

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// STATUS DERIVATION HELPER
// =========================
function deriveStatus(startTime, endTime) {
  const now = new Date();
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'open';
  return 'closed';
}

// =========================
// MAIN HANDLER
// =========================
// Creates a brand new voting period only when no other unfinalized round exists.
// When a new round is created, each user's ROUND vote balance is reset to 5.
// Purchased bonus votes are intentionally preserved.
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // =========================
    // AUTH VALIDATION
    // =========================
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

    // =========================
    // ADMIN ROLE CHECK
    // =========================
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

    // =========================
    // REQUEST BODY VALIDATION
    // =========================
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

    // =========================
    // CHECK FOR EXISTING WORKING ROUND
    // =========================
    const { data: existingRounds, error: existingError } = await supabase
      .from('voting_periods')
      .select('id')
      .is('finalized_at', null)
      .order('id', { ascending: false })
      .limit(1);

    if (existingError) throw existingError;

    if (existingRounds && existingRounds.length > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'An unfinalized voting round already exists. Close and finalize it before creating a new round.'
        })
      };
    }

    // =========================
    // CREATE NEW ROUND
    // =========================
    const { data: savedPeriod, error: insertError } = await supabase
      .from('voting_periods')
      .insert([
        {
          start_time,
          end_time,
          status,
          closed_at: null,
          winner_id: null,
          winning_vote_count: null,
          finalized_at: null,
          finalized_by: null
        }
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    // =========================
    // RESET ROUND VOTES ONLY
    // =========================
    // Important:
    // - vote_balance = standard votes for the current round
    // - bonus_vote_balance = purchased votes that persist across rounds
    // Only reset vote_balance here.
    const { error: resetVotesError } = await supabase
      .from('profiles')
      .update({ vote_balance: 5 })
      .not('id', 'is', null);

    if (resetVotesError) {
      throw resetVotesError;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        period: savedPeriod,
        round_votes_reset_to: 5,
        bonus_votes_preserved: true
      })
    };
  } catch (err) {
    console.error('set-voting-period error:', err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || 'Server error'
      })
    };
  }
}