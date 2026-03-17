// /.netlify/functions/update-product.js

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
  const product_id = String(body.product_id || '').trim();
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const image_url = body.image_url ? String(body.image_url).trim() : null;
  const active = normalizeBoolean(body.active, true);
  const price_cents = normalizeInteger(body.price_cents, NaN);
  const votes_granted = normalizeInteger(body.votes_granted, 0);

  if (!product_id) {
    throw new Error('product_id is required.');
  }

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
    product_id,
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
      product_id,
      name,
      description,
      image_url,
      active,
      price_cents,
      votes_granted
    } = validateProductPayload(body);

    // =========================
    // LOAD EXISTING PRODUCT
    // =========================
    const { data: existingProduct, error: fetchError } = await supabase
      .from('products')
      .select(`
        id,
        name,
        description,
        price_cents,
        stripe_product_id,
        stripe_price_id,
        image_url,
        active,
        votes_granted
      `)
      .eq('id', product_id)
      .single();

    if (fetchError || !existingProduct) {
      throw new Error('Product not found.');
    }

    if (!existingProduct.stripe_product_id) {
      throw new Error('Existing product is missing stripe_product_id.');
    }

    let nextStripePriceId = existingProduct.stripe_price_id;
    const priceChanged = Number(existingProduct.price_cents) !== Number(price_cents);

    // =========================
    // UPDATE STRIPE PRODUCT
    // =========================
    await stripe.products.update(existingProduct.stripe_product_id, {
      name,
      description,
      active,
      images: image_url && /^https?:\/\//i.test(image_url) ? [image_url] : [],
      metadata: {
        votes_granted: String(votes_granted),
        supabase_updated_by: adminUser.id
      }
    });

    // =========================
    // HANDLE PRICE CHANGE
    // =========================
    // Stripe prices are immutable. If the price changed, create a new one.
    if (priceChanged) {
      const newStripePrice = await stripe.prices.create({
        product: existingProduct.stripe_product_id,
        unit_amount: price_cents,
        currency: 'usd',
        active,
        metadata: {
          votes_granted: String(votes_granted),
          supabase_updated_by: adminUser.id
        }
      });

      nextStripePriceId = newStripePrice.id;

      // Best-effort archive of old Stripe price.
      if (existingProduct.stripe_price_id) {
        try {
          await stripe.prices.update(existingProduct.stripe_price_id, {
            active: false
          });
        } catch (archivePriceError) {
          console.error('update-product old price archive warning:', archivePriceError);
        }
      }
    } else if (existingProduct.stripe_price_id) {
      // If price did not change, still keep Stripe price active state aligned.
      try {
        await stripe.prices.update(existingProduct.stripe_price_id, {
          active
        });
      } catch (priceStateError) {
        console.error('update-product price active sync warning:', priceStateError);
      }
    }

    // =========================
    // UPDATE SUPABASE PRODUCT
    // =========================
    const { data: updatedProduct, error: updateError } = await supabase
      .from('products')
      .update({
        name,
        description,
        price_cents,
        stripe_price_id: nextStripePriceId,
        image_url,
        active,
        votes_granted,
        updated_at: new Date().toISOString()
      })
      .eq('id', product_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return buildJsonResponse(200, {
      success: true,
      product: updatedProduct,
      price_changed: priceChanged,
      message: priceChanged
        ? 'Product updated successfully. A new Stripe price was created.'
        : 'Product updated successfully.'
    });
  } catch (error) {
    console.error('update-product error:', error);

    return buildJsonResponse(500, {
      error: error.message || 'Server error'
    });
  }
};