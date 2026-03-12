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
// Creates a new voting period or updates the latest unfinalized one.
// This preserves finalized history while letting admins reuse the main form
// for the current working round.
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
    // Validate the admin bearer token.
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
    // Ensure only admins can create or edit voting periods.
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
    // LOOK UP CURRENT WORKING ROUND
    // =========================
    // Only unfinalized rounds are candidates for update.
    // Finalized rounds remain untouched as historical records.
    const { data: periods, error: fetchError } = await supabase
      .from('voting_periods')
      .select(`
        id,
        finalized_at,
        closed_at,
        winner_id,
        winning_vote_count
      `)
      .is('finalized_at', null)
      .order('id', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    let savedPeriod = null;

    // =========================
    // UPDATE EXISTING WORKING ROUND
    // =========================
    // If an unfinalized round exists, update it in place and reset any
    // temporary close/winner state so it behaves like a fresh working round.
    if (periods && periods.length > 0) {
      const existingPeriod = periods[0];

      const { data, error } = await supabase
        .from('voting_periods')
        .update({
          start_time,
          end_time,
          status,
          closed_at: null,
          winner_id: null,
          winning_vote_count: null,
          finalized_at: null,
          finalized_by: null
        })
        .eq('id', existingPeriod.id)
        .select()
        .single();

      if (error) throw error;
      savedPeriod = data;
    } else {
      // =========================
      // CREATE NEW ROUND
      // =========================
      // If no unfinalized round exists, insert a brand new one.
      const { data, error } = await supabase
        .from('voting_periods')
        .insert([
          {
            start_time,
            end_time,
            status,
            closed_at: null,
            winner_id: null,
            winning_vote_count: null
          }
        ])
        .select()
        .single();

      if (error) throw error;
      savedPeriod = data;
    }

    // =========================
    // SUCCESS RESPONSE
    // =========================
    // Return the saved round for the admin UI to refresh against.
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
      body: JSON.stringify({
        error: err.message || 'Server error'
      })
    };
  }
}