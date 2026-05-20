// /.netlify/functions/create-checkout-session.js

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.SITE_URL;

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY');
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

if (!siteUrl) {
  throw new Error('Missing SITE_URL');
}

const stripe = new Stripe(stripeSecretKey);

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

const PHYSICAL_PRODUCT_TYPES = new Set(['merch', 'paperback', 'bundle']);
const DIGITAL_ONLY_PRODUCT_TYPES = new Set(['digital_comic']);

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
}

function parseRequestBody(body) {
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('Invalid JSON body');
  }
}

function normalizeQuantity(value) {
  const quantity = Number(value);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Each cart item must have a positive integer quantity.');
  }

  return quantity;
}

function mergeCartItems(cart) {
  const merged = new Map();

  for (const item of cart) {
    const productId = String(item.product_id || '').trim();
    if (!productId) {
      throw new Error('Each cart item must include a product_id.');
    }

    const quantity = normalizeQuantity(item.quantity);
    const current = merged.get(productId) || 0;
    merged.set(productId, current + quantity);
  }

  return Array.from(merged.entries()).map(([product_id, quantity]) => ({
    product_id,
    quantity
  }));
}

function isPhysicalProductType(productType) {
  return PHYSICAL_PRODUCT_TYPES.has(String(productType || '').trim());
}

function isDigitalOnlyProductType(productType) {
  return DIGITAL_ONLY_PRODUCT_TYPES.has(String(productType || '').trim());
}

async function getAuthenticatedUser(token) {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error('Unauthorized');
  }

  return user;
}

async function markOrderFailed(orderId) {
  if (!orderId) return;

  const { error } = await supabase
    .from('orders')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId);

  if (error) {
    console.error('Failed to mark order as failed:', error);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return jsonResponse(401, { error: 'Missing auth token' });
  }

  let createdOrderId = null;

  try {
    const user = await getAuthenticatedUser(token);

    const body = parseRequestBody(event.body);
    const rawCart = Array.isArray(body.cart) ? body.cart : [];

    if (!rawCart.length) {
      return jsonResponse(400, { error: 'Cart is empty' });
    }

    const cart = mergeCartItems(rawCart);
    const productIds = cart.map((item) => item.product_id);

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`
        id,
        name,
        description,
        price_cents,
        stripe_product_id,
        stripe_price_id,
        active,
        votes_granted,
        product_type,
        story_id
      `)
      .in('id', productIds);

    if (productsError) {
      throw productsError;
    }

    const productMap = new Map(
      (products || []).map((product) => [String(product.id), product])
    );

    const line_items = [];
    const orderItems = [];

    let totalCents = 0;
    let totalVotesGranted = 0;
    let requiresShipping = false;

    for (const cartItem of cart) {
      const product = productMap.get(cartItem.product_id);

      if (!product) {
        throw new Error(`Invalid product: ${cartItem.product_id}`);
      }

      if (!product.active) {
        throw new Error(`Product is inactive: ${product.name}`);
      }

      if (!product.stripe_price_id) {
        throw new Error(`Product is missing Stripe price ID: ${product.name}`);
      }

      if (!Number.isInteger(product.price_cents) || product.price_cents <= 0) {
        throw new Error(`Product has invalid price_cents: ${product.name}`);
      }

      const productType = String(product.product_type || 'merch').trim();

      if (!isPhysicalProductType(productType) && !isDigitalOnlyProductType(productType)) {
        throw new Error(`Unsupported product type for checkout: ${product.name}`);
      }

      if (isPhysicalProductType(productType)) {
        requiresShipping = true;
      }

      const votesGrantedEach = Number(product.votes_granted) || 0;

      line_items.push({
        price: product.stripe_price_id,
        quantity: cartItem.quantity
      });

      orderItems.push({
        product_id: product.id,
        quantity: cartItem.quantity,
        unit_price_cents: product.price_cents,
        votes_granted_each: votesGrantedEach
      });

      totalCents += product.price_cents * cartItem.quantity;
      totalVotesGranted += votesGrantedEach * cartItem.quantity;
    }

    const nowIso = new Date().toISOString();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          user_id: user.id,
          stripe_session_id: null,
          status: 'pending',
          total_cents: totalCents,
          total_votes_granted: totalVotesGranted,
          paid_at: null,
          updated_at: nowIso,
          customer_email: user.email || null
        }
      ])
      .select()
      .single();

    if (orderError || !order) {
      console.error('Order creation error:', orderError);
      return jsonResponse(500, {
        error: 'Failed to create order',
        details: orderError?.message || null
      });
    }

    createdOrderId = order.id;

    const itemsToInsert = orderItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      votes_granted_each: item.votes_granted_each
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsToInsert);

    if (itemsError) {
      console.error('Order items insertion failed:', itemsError);
      console.error('Items attempted to insert:', itemsToInsert);

      await markOrderFailed(order.id);

      return jsonResponse(500, {
        error: 'Failed to create order items',
        details: itemsError.message || null
      });
    }

    const uniqueProductTypes = Array.from(
      new Set((products || []).map((p) => p.product_type || 'merch'))
    );

    const productTypeSummary = uniqueProductTypes.join(',');

    const storyIdsSummary = Array.from(
      new Set((products || []).map((p) => p.story_id).filter(Boolean))
    ).join(',');

    const sessionConfig = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      customer_email: user.email || undefined,
      billing_address_collection: 'auto',
      success_url: `${siteUrl}/shop/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/shop/cancel.html`,
      client_reference_id: order.id,
      metadata: {
        order_id: order.id,
        user_id: user.id,
        total_cents: String(totalCents),
        total_votes_granted: String(totalVotesGranted),
        product_types: productTypeSummary,
        story_ids: storyIdsSummary,
        requires_shipping: requiresShipping ? 'true' : 'false'
      }
    };

    if (requiresShipping) {
      sessionConfig.shipping_address_collection = {
        allowed_countries: ['US', 'CA']
      };

      sessionConfig.phone_number_collection = {
        enabled: true
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        stripe_session_id: session.id,
        updated_at: new Date().toISOString(),
        customer_email: user.email || null
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('Failed to update order with session ID:', updateError);
      await markOrderFailed(order.id);

      return jsonResponse(500, {
        error: 'Failed to save checkout session to order',
        details: updateError.message || null
      });
    }

    return jsonResponse(200, {
      success: true,
      order_id: order.id,
      url: session.url,
      requires_shipping: requiresShipping
    });
  } catch (error) {
    console.error('Checkout function error:', error);

    await markOrderFailed(createdOrderId);

    return jsonResponse(500, {
      error: error.message || 'Server error'
    });
  }
};