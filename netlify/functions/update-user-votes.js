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

    const { targetUserId, amount } = JSON.parse(event.body || '{}');

    if (!targetUserId || typeof amount !== 'number') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'targetUserId and numeric amount are required' })
      };
    }

    const { data: targetProfile, error: targetError } = await supabase
      .from('profiles')
      .select('vote_balance')
      .eq('id', targetUserId)
      .single();

    if (targetError || !targetProfile) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Target user not found' })
      };
    }

    const currentBalance = Number(targetProfile.vote_balance) || 0;
    const newBalance = Math.max(0, currentBalance + amount);

    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({ vote_balance: newBalance })
      .eq('id', targetUserId)
      .select('id, vote_balance')
      .single();

    if (updateError) throw updateError;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        user: updatedProfile
      })
    };
  } catch (err) {
    console.error('update-user-votes error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Server error' })
    };
  }
}
