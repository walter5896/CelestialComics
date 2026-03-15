// /.netlify/functions/stripe-webhook.js

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// =========================
// ENVIRONMENT
// =========================
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY');
}

if (!stripeWebhookSecret) {
  throw new Error('Missing STRIPE_WEBHOOK_SECRET');
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const stripe = new Stripe(stripeSecretKey);

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

// =========================
// HELPERS
// =========================
function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
}

function getRawBody(event) {
  if (!event || typeof event.body !== 'string') {
    return '';
  }

  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }

  return event.body;
}

function getStripeSignature(event) {
  return (
    event?.headers?.['stripe-signature'] ||
    event?.headers?.['Stripe-Signature'] ||
    null
  );
}

async function getOrderById(orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      user_id,
      stripe_session_id,
      status,
      total_cents,
      total_votes_granted,
      created_at,
      paid_at,
      updated_at
    `)
    .eq('id', orderId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function getFallbackVotesGranted(orderId) {
  const { data, error } = await supabase
    .from('order_items')
    .select('quantity, votes_granted_each')
    .eq('order_id', orderId);

  if (error) {
    throw error;
  }

  return (data || []).reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0;
    const votesGrantedEach = Number(item.votes_granted_each) || 0;
    return sum + (quantity * votesGrantedEach);
  }, 0);
}

async function markOrderCanceled(orderId) {
  const { error } = await supabase
    .from('orders')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .eq('status', 'pending');

  if (error) {
    throw error;
  }
}

async function markOrderPaid(orderId, stripeSessionId) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('orders')
    .update({
      status: 'paid',
      stripe_session_id: stripeSessionId,
      paid_at: nowIso,
      updated_at: nowIso
    })
    .eq('id', orderId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function addVotesToUser(userId, votesToAdd) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, vote_balance')
    .eq('id', userId)
    .single();

  if (profileError) {
    throw profileError;
  }

  const currentBalance = Number(profile.vote_balance) || 0;
  const nextBalance = currentBalance + votesToAdd;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      vote_balance: nextBalance
    })
    .eq('id', userId);

  if (updateError) {
    throw updateError;
  }

  return nextBalance;
}

// =========================
// CHECKOUT SESSION COMPLETED
// =========================
async function handleCheckoutSessionCompleted(session) {
  if (!session || session.object !== 'checkout.session') {
    throw new Error('Invalid checkout session payload');
  }

  // Only fulfill paid sessions.
  if (session.payment_status !== 'paid') {
    return {
      ok: true,
      skipped: true,
      reason: `Session payment_status is ${session.payment_status || 'unknown'}`
    };
  }

  const orderId =
    session.client_reference_id ||
    session.metadata?.order_id ||
    null;

  if (!orderId) {
    throw new Error('Missing order_id on checkout session');
  }

  const order = await getOrderById(orderId);

  // Idempotency guard:
  // If already paid, do nothing and return success.
  if (order.status === 'paid') {
    return {
      ok: true,
      already_processed: true,
      order_id: orderId
    };
  }

  // Safety check: only pending orders should be fulfilled.
  if (order.status !== 'pending') {
    return {
      ok: true,
      skipped: true,
      order_id: orderId,
      reason: `Order status is ${order.status}`
    };
  }

  // Optional consistency checks.
  if (order.user_id && session.metadata?.user_id && String(order.user_id) !== String(session.metadata.user_id)) {
    throw new Error('Order user_id does not match session metadata user_id');
  }

  // Prefer the stored total_votes_granted from the order snapshot.
  let votesToGrant = Number(order.total_votes_granted);

  if (!Number.isInteger(votesToGrant) || votesToGrant < 0) {
    votesToGrant = await getFallbackVotesGranted(order.id);
  }

  // First, atomically move the order from pending -> paid.
  // If this succeeds once, later retries will hit the idempotency guard above.
  const paidOrder = await markOrderPaid(order.id, session.id);

  // Then grant votes.
  // Because the order status has already moved to paid, retries will not re-grant votes.
  let newVoteBalance = null;

  if (votesToGrant > 0) {
    newVoteBalance = await addVotesToUser(order.user_id, votesToGrant);
  }

  return {
    ok: true,
    order_id: paidOrder.id,
    votes_granted: votesToGrant,
    new_vote_balance: newVoteBalance
  };
}

// =========================
// CHECKOUT SESSION EXPIRED
// =========================
async function handleCheckoutSessionExpired(session) {
  if (!session || session.object !== 'checkout.session') {
    throw new Error('Invalid checkout session payload');
  }

  const orderId =
    session.client_reference_id ||
    session.metadata?.order_id ||
    null;

  if (!orderId) {
    return {
      ok: true,
      skipped: true,
      reason: 'Missing order_id on expired checkout session'
    };
  }

  const order = await getOrderById(orderId);

  // Only cancel pending orders.
  if (order.status === 'pending') {
    await markOrderCanceled(orderId);
  }

  return {
    ok: true,
    order_id: orderId
  };
}

// =========================
// MAIN HANDLER
// =========================
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const rawBody = getRawBody(event);
    const signature = getStripeSignature(event);

    if (!signature) {
      return jsonResponse(400, { error: 'Missing Stripe signature header' });
    }

    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      stripeWebhookSecret
    );

    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const result = await handleCheckoutSessionCompleted(stripeEvent.data.object);
        return jsonResponse(200, {
          received: true,
          type: stripeEvent.type,
          result
        });
      }

      case 'checkout.session.expired': {
        const result = await handleCheckoutSessionExpired(stripeEvent.data.object);
        return jsonResponse(200, {
          received: true,
          type: stripeEvent.type,
          result
        });
      }

      default:
        // Acknowledge unhandled event types so Stripe does not keep retrying.
        return jsonResponse(200, {
          received: true,
          ignored: true,
          type: stripeEvent.type
        });
    }
  } catch (error) {
    console.error('stripe-webhook error:', error);

    return jsonResponse(400, {
      error: error.message || 'Webhook error'
    });
  }
};