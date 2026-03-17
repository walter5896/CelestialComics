// /.netlify/functions/update-user-votes.js
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

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Missing auth token' })
    };
  }

  try {
    // =========================
    // AUTH VALIDATION
    // =========================
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
    // ADMIN CHECK
    // =========================
    const { data: requesterProfile, error: requesterError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (requesterError) throw requesterError;

    if (!requesterProfile || requesterProfile.role !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    // =========================
    // INPUT VALIDATION
    // =========================
    const { targetUserId, amount, type } = JSON.parse(event.body || '{}');

    if (!targetUserId || typeof amount !== 'number') {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'targetUserId and numeric amount are required'
        })
      };
    }

    if (!['round', 'bonus'].includes(type)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'type must be either "round" or "bonus"'
        })
      };
    }

    // =========================
    // FETCH TARGET USER
    // =========================
    const { data: targetProfile, error: targetError } = await supabase
      .from('profiles')
      .select('vote_balance, bonus_vote_balance')
      .eq('id', targetUserId)
      .single();

    if (targetError || !targetProfile) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Target user not found' })
      };
    }

    let updatedFields = {};

    if (type === 'round') {
      const current = Number(targetProfile.vote_balance) || 0;
      updatedFields.vote_balance = Math.max(0, current + amount);
    }

    if (type === 'bonus') {
      const current = Number(targetProfile.bonus_vote_balance) || 0;
      updatedFields.bonus_vote_balance = Math.max(0, current + amount);
    }

    // =========================
    // UPDATE USER
    // =========================
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update(updatedFields)
      .eq('id', targetUserId)
      .select('id, vote_balance, bonus_vote_balance')
      .single();

    if (updateError) throw updateError;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        user: updatedProfile,
        updated_type: type,
        amount
      })
    };
  } catch (err) {
    console.error('update-user-votes error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || 'Server error'
      })
    };
  }
}