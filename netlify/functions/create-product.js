// /.netlify/functions/create-product.js

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// =========================
// ENVIRONMENT VALIDATION
// =========================
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY');
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const stripe = new Stripe(stripeSecretKey);
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// =========================
// HELPERS
// =========================
function buildJsonResponse(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
  }
  return fallback;
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function validateProductPayload(body) {
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const image_url = body.image_url ? String(body.image_url).trim() : null;
  const active = normalizeBoolean(body.active, true);
  const price_cents = normalizeInteger(body.price_cents, NaN);
  const votes_granted = normalizeInteger(body.votes_granted, 0);

  if (!name) {
    throw new Error('Product name is required.');
  }

  if (!description) {
    throw new Error('Product description is required.');
  }

  if (!Number.isInteger(price_cents) || price_cents <= 0) {
    throw new Error('price_cents must be a positive integer.');
  }

  if (!Number.isInteger(votes_granted) || votes_granted < 0) {
    throw new Error('votes_granted must be a non-negative integer.');
  }

  if (image_url && !/^https?:\/\/|^\//i.test(image_url)) {
    throw new Error('image_url must be an absolute URL or site-relative path.');
  }

  return {
    name,
    description,
    image_url,
    active,
    price_cents,
    votes_granted
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

// =========================
// MAIN HANDLER
// =========================
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return buildJsonResponse(405, { error: 'Method not allowed' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return buildJsonResponse(401, { error: 'Missing auth token' });
  }

  let createdStripeProductId = null;

  try {
    // =========================
    // AUTH / ADMIN CHECK
    // =========================
    const adminUser = await getAdminUserFromToken(token);

    // =========================
    // BODY PARSE / VALIDATION
    // =========================
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return buildJsonResponse(400, { error: 'Invalid JSON body' });
    }

    const {
      name,
      description,
      image_url,
      active,
      price_cents,
      votes_granted
    } = validateProductPayload(body);

    // =========================
    // STRIPE PRODUCT CREATION
    // =========================
    const stripeProduct = await stripe.products.create({
      name,
      description,
      active,
      images: image_url && /^https?:\/\//i.test(image_url) ? [image_url] : [],
      metadata: {
        votes_granted: String(votes_granted),
        supabase_created_by: adminUser.id
      }
    });

    createdStripeProductId = stripeProduct.id;

    // =========================
    // STRIPE PRICE CREATION
    // =========================
    const stripePrice = await stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: price_cents,
      currency: 'usd',
      active,
      metadata: {
        votes_granted: String(votes_granted),
        supabase_created_by: adminUser.id
      }
    });

    // =========================
    // SUPABASE INSERT
    // =========================
    const { data: insertedProduct, error: insertError } = await supabase
      .from('products')
      .insert([
        {
          name,
          description,
          price_cents,
          stripe_product_id: stripeProduct.id,
          stripe_price_id: stripePrice.id,
          image_url,
          active,
          votes_granted,
          updated_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return buildJsonResponse(200, {
      success: true,
      product: insertedProduct,
      message: 'Product created successfully.'
    });
  } catch (error) {
    console.error('create-product error:', error);

    // =========================
    // BEST-EFFORT STRIPE CLEANUP
    // =========================
    // If Stripe product creation succeeded but DB insert failed,
    // archive the Stripe product so it does not remain active orphaned.
    if (createdStripeProductId) {
      try {
        await stripe.products.update(createdStripeProductId, {
          active: false
        });
      } catch (cleanupError) {
        console.error('create-product cleanup error:', cleanupError);
      }
    }

    return buildJsonResponse(500, {
      error: error.message || 'Server error'
    });
  }
};