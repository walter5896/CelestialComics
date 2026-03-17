// /.netlify/functions/delete-product-image.js

const { createClient } = require('@supabase/supabase-js');

// =========================
// ENVIRONMENT VALIDATION
// =========================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// =========================
// CONSTANTS
// =========================
const PRODUCT_IMAGES_BUCKET = 'product-images';

// =========================
// HELPERS
// =========================
function buildJsonResponse(statusCode, payload) {
  return {
    statusCode,
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
    await getAdminUserFromToken(token);

    // =========================
    // BODY PARSE
    // =========================
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return buildJsonResponse(400, { error: 'Invalid JSON body' });
    }

    const product_id = String(body.product_id || '').trim();

    if (!product_id) {
      return buildJsonResponse(400, { error: 'product_id is required.' });
    }

    // =========================
    // LOAD PRODUCT
    // =========================
    const { data: existingProduct, error: fetchError } = await supabase
      .from('products')
      .select('id, name, image_url, image_path')
      .eq('id', product_id)
      .single();

    if (fetchError || !existingProduct) {
      return buildJsonResponse(404, { error: 'Product not found.' });
    }

    // =========================
    // REMOVE FILE FROM STORAGE
    // =========================
    if (existingProduct.image_path) {
      const { error: removeError } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .remove([existingProduct.image_path]);

      if (removeError) {
        throw removeError;
      }
    }

    // =========================
    // CLEAR PRODUCT IMAGE FIELDS
    // =========================
    const { data: updatedProduct, error: updateError } = await supabase
      .from('products')
      .update({
        image_url: null,
        image_path: null,
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
      message: 'Product image deleted successfully.',
      product: updatedProduct
    });
  } catch (error) {
    console.error('delete-product-image error:', error);

    return buildJsonResponse(500, {
      error: error.message || 'Server error'
    });
  }
};