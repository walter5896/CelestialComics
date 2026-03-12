// /.netlify/functions/close-voting-period.js

// =========================
// IMPORTS
// =========================
// Import Supabase client creator for secure server-side admin operations.
import { createClient } from '@supabase/supabase-js';

// =========================
// SUPABASE CLIENT
// =========================
// Create the service-role Supabase client for privileged backend access.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// MAIN HANDLER
// =========================
// Closes the latest unfinalized voting period without changing its original
// scheduled start/end times. This ensures the round can move cleanly into
// the "determine winner" state.
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
    // AUTH HEADER PARSING
    // =========================
    // Read the bearer token from the incoming request headers.
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Missing auth token' })
      };
    }

    // =========================
    // USER VALIDATION
    // =========================
    // Validate the Supabase auth token and load the authenticated user.
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
    // Confirm the authenticated user has the admin role.
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

    // =========================
    // CURRENT ROUND LOOKUP
    // =========================
    // Find the latest unfinalized round. This is the only round that should
    // ever be closable in the current one-round-at-a-time workflow.
    const { data: periods, error: fetchError } = await supabase
      .from('voting_periods')
      .select(`
        id,
        start_time,
        end_time,
        status,
        finalized_at,
        closed_at,
        winner_id,
        winning_vote_count
      `)
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

    // =========================
    // CURRENT TIME SNAPSHOT
    // =========================
    // Capture the exact close time once so the row uses a single consistent value.
    const nowIso = new Date().toISOString();

    // =========================
    // ALREADY CLOSED NORMALIZATION
    // =========================
    // If this round was already manually closed earlier, normalize its status
    // and return it without changing the original close timestamp.
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

    // =========================
    // SCHEDULED-END NORMALIZATION
    // =========================
    // If the scheduled end time has already passed, treat the round as closed
    // and stamp closed_at now so downstream logic can finalize it properly.
    if (new Date(activePeriod.end_time) <= new Date(nowIso)) {
      const { data: naturallyClosedPeriod, error: naturallyClosedError } = await supabase
        .from('voting_periods')
        .update({
          closed_at: nowIso,
          status: 'closed'
        })
        .eq('id', activePeriod.id)
        .is('finalized_at', null)
        .select()
        .single();

      if (naturallyClosedError) {
        throw naturallyClosedError;
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Voting period was closed because its scheduled end time had already passed.',
          period: naturallyClosedPeriod
        })
      };
    }

    // =========================
    // MANUAL CLOSE ACTION
    // =========================
    // Manually close the current round right now while preserving the
    // original scheduled start/end times for historical accuracy.
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

    // =========================
    // SUCCESS RESPONSE
    // =========================
    // Return the newly closed period so the admin UI can refresh cleanly.
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Voting period closed successfully.',
        period: updatedPeriod
      })
    };
  } catch (err) {
    // =========================
    // ERROR RESPONSE
    // =========================
    // Log the backend error and return a safe message to the frontend.
    console.error('close-voting-period error:', err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || 'Server error'
      })
    };
  }
}