// /.netlify/functions/update-order-status.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const ALLOWED_STATUSES = [
  'pending',
  'paid',
  'processing',
  'fulfilled',
  'canceled',
  'failed'
];

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  };
}

async function getAdminUserFromToken(token) {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new Error('Invalid user token');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  if (!profile || profile.role !== 'admin') {
    throw new Error('Admin access required');
  }

  return user;
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();

  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${ALLOWED_STATUSES.join(', ')}`);
  }

  return status;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: 'Method not allowed'
    });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return jsonResponse(401, {
      success: false,
      error: 'Missing auth token'
    });
  }

  try {
    await getAdminUserFromToken(token);

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, {
        success: false,
        error: 'Invalid JSON body'
      });
    }

    const orderId = String(body.order_id || '').trim();
    const nextStatus = normalizeStatus(body.status);

    const fulfillmentNotes =
      typeof body.fulfillment_notes === 'string'
        ? body.fulfillment_notes.trim() || null
        : null;

    if (!orderId) {
      throw new Error('order_id is required.');
    }

    const { data: existingOrder, error: existingOrderError } = await supabase
      .from('orders')
      .select('id, status, fulfilled_at')
      .eq('id', orderId)
      .single();

    if (existingOrderError || !existingOrder) {
      throw new Error('Order not found.');
    }

    const updatePayload = {
      status: nextStatus,
      fulfillment_notes: fulfillmentNotes,
      updated_at: new Date().toISOString()
    };

    if (nextStatus === 'fulfilled') {
      updatePayload.fulfilled_at =
        existingOrder.fulfilled_at || new Date().toISOString();
    } else if (existingOrder.status === 'fulfilled' && nextStatus !== 'fulfilled') {
      updatePayload.fulfilled_at = null;
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select(`
        id,
        user_id,
        stripe_session_id,
        status,
        created_at,
        total_cents,
        total_votes_granted,
        paid_at,
        updated_at,
        fulfilled_at,
        fulfillment_notes
      `)
      .single();

    if (updateError) {
      throw updateError;
    }

    return jsonResponse(200, {
      success: true,
      order: updatedOrder
    });
  } catch (error) {
    console.error('update-order-status error:', error);

    return jsonResponse(500, {
      success: false,
      error: error.message || 'Server error'
    });
  }
};