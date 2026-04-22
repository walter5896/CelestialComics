// /.netlify/functions/update-product.js

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

const VALID_PRODUCT_TYPES = new Set(['merch', 'digital_comic', 'paperback', 'bundle']);

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
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

  if (!VALID_PRODUCT_TYPES.has(type)) {
    throw new Error(
      `Invalid product_type. Must be one of: ${Array.from(VALID_PRODUCT_TYPES).join(', ')}`
    );
  }

  return type;
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

  if (error) {
    throw error;
  }

  if (!story) {
    throw new Error('Referenced story was not found.');
  }

  if (productType !== 'merch' && story.story_status !== 'released') {
    throw new Error('Comic-format products can only be attached to released stories.');
  }

  return story;
}

function validateProductPayload(body) {
  const product_id = String(body.product_id || '').trim();
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const image_url = body.image_url ? String(body.image_url).trim() : null;
  const active = normalizeBoolean(body.active, true);
  const price_cents = normalizeInteger(body.price_cents, NaN);
  const votes_granted = normalizeInteger(body.votes_granted, 0);
  const product_type = normalizeProductType(body.product_type);
  const story_id = normalizeNullableString(body.story_id);

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

  if (product_type === 'merch' && story_id) {
    throw new Error('Merch products should not have a story_id attached.');
  }

  if (product_type !== 'merch' && votes_granted > 0) {
    throw new Error('Comic-format products should not grant bonus votes.');
  }

  return {
    product_id,
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

async function requireExistingProduct(productId) {
  const { data: existingProduct, error } = await supabase
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
      votes_granted,
      product_type,
      story_id
    `)
    .eq('id', productId)
    .single();

  if (error || !existingProduct) {
    throw new Error('Product not found.');
  }

  if (!existingProduct.stripe_product_id) {
    throw new Error('Existing product is missing stripe_product_id.');
  }

  return existingProduct;
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

  let createdStripePriceId = null;

  try {
    const adminUser = await getAdminUserFromToken(token);
    const body = parseRequestBody(event.body);

    const {
      product_id,
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
    const existingProduct = await requireExistingProduct(product_id);

    const priceChanged = Number(existingProduct.price_cents) !== Number(price_cents);
    let nextStripePriceId = existingProduct.stripe_price_id;

    await stripe.products.update(existingProduct.stripe_product_id, {
      name,
      description,
      active,
      images: image_url && /^https?:\/\//i.test(image_url) ? [image_url] : [],
      metadata: {
        product_type,
        story_id: story_id || '',
        story_title: linkedStory?.title || '',
        votes_granted: String(votes_granted),
        supabase_updated_by: adminUser.id
      }
    });

    if (priceChanged) {
      const newStripePrice = await stripe.prices.create({
        product: existingProduct.stripe_product_id,
        unit_amount: price_cents,
        currency: 'usd',
        active,
        metadata: {
          product_type,
          story_id: story_id || '',
          story_title: linkedStory?.title || '',
          votes_granted: String(votes_granted),
          supabase_updated_by: adminUser.id
        }
      });

      createdStripePriceId = newStripePrice.id;
      nextStripePriceId = newStripePrice.id;
    } else if (existingProduct.stripe_price_id) {
      try {
        await stripe.prices.update(existingProduct.stripe_price_id, {
          active
        });
      } catch (priceStateError) {
        console.error('update-product price active sync warning:', priceStateError);
      }
    }

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
        product_type,
        story_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', product_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    if (priceChanged && existingProduct.stripe_price_id) {
      try {
        await stripe.prices.update(existingProduct.stripe_price_id, {
          active: false
        });
      } catch (archivePriceError) {
        console.error('update-product old price archive warning:', archivePriceError);
      }
    }

    return jsonResponse(200, {
      success: true,
      product: updatedProduct,
      price_changed: priceChanged,
      message: priceChanged
        ? 'Product updated successfully. A new Stripe price was created.'
        : 'Product updated successfully.'
    });
  } catch (error) {
    console.error('update-product error:', error);

    if (createdStripePriceId) {
      try {
        await stripe.prices.update(createdStripePriceId, {
          active: false
        });
      } catch (rollbackError) {
        console.error('update-product price rollback warning:', rollbackError);
      }
    }

    const message = error?.message || 'Server error';
    const statusCode =
      message === 'Missing auth token' ? 401 :
      message === 'Invalid user token' ? 401 :
      message === 'Admin access required' ? 403 :
      message === 'Invalid JSON body' ? 400 :
      message === 'product_id is required.' ? 400 :
      message === 'Product name is required.' ? 400 :
      message === 'Product description is required.' ? 400 :
      message === 'price_cents must be a positive integer.' ? 400 :
      message === 'votes_granted must be a non-negative integer.' ? 400 :
      message === 'image_url must be an absolute URL or site-relative path.' ? 400 :
      message === 'Merch products should not have a story_id attached.' ? 400 :
      message === 'Comic-format products should not grant bonus votes.' ? 400 :
      message === 'story_id is required for digital_comic, paperback, and bundle products.' ? 400 :
      message === 'Referenced story was not found.' ? 404 :
      message === 'Comic-format products can only be attached to released stories.' ? 400 :
      message === 'Product not found.' ? 404 :
      message === 'Existing product is missing stripe_product_id.' ? 500 :
      message.startsWith('Invalid product_type.') ? 400 :
      500;

    return jsonResponse(statusCode, {
      error: message
    });
  }
};