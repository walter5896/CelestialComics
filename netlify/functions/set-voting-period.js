// /.netlify/functions/set-voting-period.js

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// STATUS DERIVATION HELPER
// =========================
// Determines the initial status of a round from its start/end window.
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
// When a new round is created, every user's vote balance is reset to 5.
export async function handler(event) {
  // =========================
  // METHOD VALIDATION
  // =========================
  // Only POST requests are allowed for this admin action.
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
    // Validate the incoming bearer token and resolve the current user.
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
    // Ensure only admins can create a new voting period.
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
    // Parse and validate the requested start and end times.
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
    // Only one unfinalized round is allowed at a time.
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
    // Insert a brand new round row so this round gets its own unique
    // voting_period_id and clean historical separation.
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
    // RESET USER VOTE BALANCES
    // =========================
    // Each new voting round gives every user a fresh total of 5 votes.
    // This is a reset, not an increment, so unused votes do not stack.
    const { error: resetVotesError } = await supabase
      .from('profiles')
      .update({ vote_balance: 5 })
      .not('id', 'is', null);

    if (resetVotesError) {
      throw resetVotesError;
    }

    // =========================
    // SUCCESS RESPONSE
    // =========================
    // Return the newly created period so the admin UI can refresh.
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        period: savedPeriod,
        votes_reset_to: 5
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