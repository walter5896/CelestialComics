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

function getOrderIdFromSession(session) {
  return session?.metadata?.order_id || session?.client_reference_id || null;
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

async function getOrderItemsWithProducts(orderId) {
  const { data, error } = await supabase
    .from('order_items')
    .select(`
      id,
      order_id,
      product_id,
      quantity,
      unit_price_cents,
      votes_granted_each,
      products (
        id,
        name,
        product_type,
        story_id,
        active
      )
    `)
    .eq('order_id', orderId);

  if (error) {
    throw error;
  }

  return data || [];
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

async function addBonusVotesToUser(userId, votesToAdd) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, bonus_vote_balance')
    .eq('id', userId)
    .single();

  if (profileError) {
    throw profileError;
  }

  const currentBonusBalance = Number(profile.bonus_vote_balance) || 0;
  const nextBonusBalance = currentBonusBalance + votesToAdd;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      bonus_vote_balance: nextBonusBalance
    })
    .eq('id', userId);

  if (updateError) {
    throw updateError;
  }

  return nextBonusBalance;
}

async function grantStoryAccessForOrder(userId, orderId) {
  const orderItems = await getOrderItemsWithProducts(orderId);

  if (!orderItems.length) {
    return {
      granted_count: 0,
      granted_access: []
    };
  }

  const entitlementRows = [];

  for (const item of orderItems) {
    const product = item.products;

    if (!product) {
      continue;
    }

    if (!product.story_id) {
      continue;
    }

    let accessType = null;

    if (product.product_type === 'digital_comic') {
      accessType = 'digital';
    } else if (product.product_type === 'bundle') {
      accessType = 'bundle';
    }

    if (!accessType) {
      continue;
    }

    entitlementRows.push({
      user_id: userId,
      story_id: product.story_id,
      access_type: accessType,
      source_order_id: orderId,
      source_product_id: product.id
    });
  }

  if (!entitlementRows.length) {
    return {
      granted_count: 0,
      granted_access: []
    };
  }

  const { data, error } = await supabase
    .from('user_story_access')
    .upsert(entitlementRows, {
      onConflict: 'user_id,story_id,access_type',
      ignoreDuplicates: false
    })
    .select(`
      id,
      user_id,
      story_id,
      access_type,
      source_order_id,
      source_product_id,
      granted_at
    `);

  if (error) {
    throw error;
  }

  return {
    granted_count: data?.length || 0,
    granted_access: data || []
  };
}

// =========================
// CHECKOUT SESSION COMPLETED
// =========================
async function handleCheckoutSessionCompleted(session) {
  if (!session || session.object !== 'checkout.session') {
    throw new Error('Invalid checkout session payload');
  }

  if (session.payment_status !== 'paid') {
    return {
      ok: true,
      skipped: true,
      reason: `Session payment_status is ${session.payment_status || 'unknown'}`
    };
  }

  const orderId = getOrderIdFromSession(session);

  if (!orderId) {
    throw new Error('Missing order_id on checkout session');
  }

  const order = await getOrderById(orderId);

  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // =========================
  // IDEMPOTENCY GUARD
  // =========================
  if (order.status === 'paid') {
    return {
      ok: true,
      already_processed: true,
      order_id: orderId
    };
  }

  if (order.status !== 'pending') {
    return {
      ok: true,
      skipped: true,
      order_id: orderId,
      reason: `Order status is ${order.status}`
    };
  }

  // =========================
  // CONSISTENCY CHECKS
  // =========================
  if (
    order.user_id &&
    session.metadata?.user_id &&
    String(order.user_id) !== String(session.metadata.user_id)
  ) {
    throw new Error('Order user_id does not match session metadata user_id');
  }

  if (
    order.stripe_session_id &&
    session.id &&
    String(order.stripe_session_id) !== String(session.id)
  ) {
    throw new Error('Order stripe_session_id does not match webhook session.id');
  }

  if (
    Number.isInteger(order.total_cents) &&
    Number.isInteger(session.amount_total) &&
    order.total_cents !== session.amount_total
  ) {
    throw new Error(
      `Order total_cents (${order.total_cents}) does not match Stripe amount_total (${session.amount_total})`
    );
  }

  let votesToGrant = Number(order.total_votes_granted);

  if (!Number.isInteger(votesToGrant) || votesToGrant < 0) {
    votesToGrant = await getFallbackVotesGranted(order.id);
  }

  // =========================
  // FULFILL ORDER
  // =========================
  // First move order from pending -> paid.
  // This prevents retries from double-granting bonus votes
  // or repeatedly issuing digital access.
  const paidOrder = await markOrderPaid(order.id, session.id);

  let newBonusVoteBalance = null;

  if (votesToGrant > 0) {
    newBonusVoteBalance = await addBonusVotesToUser(order.user_id, votesToGrant);
  }

  const storyAccessResult = await grantStoryAccessForOrder(order.user_id, order.id);

  return {
    ok: true,
    order_id: paidOrder.id,
    bonus_votes_granted: votesToGrant,
    new_bonus_vote_balance: newBonusVoteBalance,
    story_access_granted_count: storyAccessResult.granted_count,
    story_access: storyAccessResult.granted_access
  };
}

// =========================
// CHECKOUT SESSION EXPIRED
// =========================
async function handleCheckoutSessionExpired(session) {
  if (!session || session.object !== 'checkout.session') {
    throw new Error('Invalid checkout session payload');
  }

  const orderId = getOrderIdFromSession(session);

  if (!orderId) {
    return {
      ok: true,
      skipped: true,
      reason: 'Missing order_id on expired checkout session'
    };
  }

  const order = await getOrderById(orderId);

  if (!order) {
    return {
      ok: true,
      skipped: true,
      reason: `Order not found for expired session: ${orderId}`
    };
  }

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

      default: {
        return jsonResponse(200, {
          received: true,
          ignored: true,
          type: stripeEvent.type
        });
      }
    }
  } catch (error) {
    console.error('stripe-webhook error:', error);

    return jsonResponse(400, {
      error: error.message || 'Webhook error'
    });
  }
};