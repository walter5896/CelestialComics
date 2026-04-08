// /.netlify/functions/create-product.js

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

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

const VALID_PRODUCT_TYPES = ['merch', 'digital_comic', 'paperback', 'bundle'];

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

function normalizeNullableString(value) {
  const str = String(value ?? '').trim();
  return str || null;
}

function normalizeProductType(value) {
  const type = String(value || 'merch').trim();

  if (!VALID_PRODUCT_TYPES.includes(type)) {
    throw new Error(`Invalid product_type. Must be one of: ${VALID_PRODUCT_TYPES.join(', ')}`);
  }

  return type;
}

async function validateStoryReference(storyId, productType) {
  if (!storyId) {
    if (productType === 'merch') return null;
    throw new Error('story_id is required for digital_comic, paperback, and bundle products.');
  }

  const { data: story, error } = await supabase
    .from('stories')
    .select('id, title, story_status, active')
    .eq('id', storyId)
    .maybeSingle();

  if (error) throw error;
  if (!story) {
    throw new Error('Referenced story was not found.');
  }

  if (productType !== 'merch' && story.story_status !== 'released') {
    throw new Error('Comic-format products can only be attached to released stories.');
  }

  return story;
}

function validateProductPayload(body) {
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const image_url = body.image_url ? String(body.image_url).trim() : null;
  const active = normalizeBoolean(body.active, true);
  const price_cents = normalizeInteger(body.price_cents, NaN);
  const votes_granted = normalizeInteger(body.votes_granted, 0);
  const product_type = normalizeProductType(body.product_type);
  const story_id = normalizeNullableString(body.story_id);

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

  if (product_type === 'merch' && story_id) {
    throw new Error('Merch products should not have a story_id attached.');
  }

  if (product_type !== 'merch' && votes_granted > 0) {
    throw new Error('Comic-format products should not grant bonus votes.');
  }

  return {
    name,
    description,
    image_url,
    active,
    price_cents,
    votes_granted,
    product_type,
    story_id
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
    const adminUser = await getAdminUserFromToken(token);

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
      votes_granted,
      product_type,
      story_id
    } = validateProductPayload(body);

    const linkedStory = await validateStoryReference(story_id, product_type);

    const stripeProduct = await stripe.products.create({
      name,
      description,
      active,
      images: image_url && /^https?:\/\//i.test(image_url) ? [image_url] : [],
      metadata: {
        product_type,
        story_id: story_id || '',
        story_title: linkedStory?.title || '',
        votes_granted: String(votes_granted),
        supabase_created_by: adminUser.id
      }
    });

    createdStripeProductId = stripeProduct.id;

    const stripePrice = await stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: price_cents,
      currency: 'usd',
      active,
      metadata: {
        product_type,
        story_id: story_id || '',
        votes_granted: String(votes_granted),
        supabase_created_by: adminUser.id
      }
    });

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
          product_type,
          story_id,
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