// /netlify/functions/get-my-purchases.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const PHYSICAL_PRODUCT_TYPES = new Set(['merch', 'paperback', 'bundle']);

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  };
}

function isPhysicalProductType(productType) {
  return PHYSICAL_PRODUCT_TYPES.has(String(productType || '').trim());
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
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
    const user = await getAuthenticatedUser(token);

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        user_id,
        status,
        created_at,
        total_cents,
        paid_at,
        fulfilled_at,
        customer_email,
        customer_name,
        shipping_name,
        shipping_city,
        shipping_state,
        shipping_postal_code,
        shipping_country,
        order_items (
          id,
          order_id,
          product_id,
          quantity,
          unit_price_cents,
          votes_granted_each,
          products (
            id,
            name,
            description,
            image_url,
            product_type,
            story_id,
            active
          )
        )
      `)
      .eq('user_id', user.id)
      .in('status', ['paid', 'processing', 'fulfilled'])
      .order('created_at', { ascending: false });

    if (ordersError) {
      throw ordersError;
    }

    const purchases = [];

    for (const order of orders || []) {
      const items = Array.isArray(order.order_items) ? order.order_items : [];

      for (const item of items) {
        const product = item.products || null;
        const productType = product?.product_type || '';

        if (!product || !isPhysicalProductType(productType)) {
          continue;
        }

        purchases.push({
          id: item.id,
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
          votes_granted_each: item.votes_granted_each,
          product_type: productType,
          product: {
            id: product.id,
            name: product.name,
            description: product.description,
            image_url: product.image_url,
            product_type: product.product_type,
            story_id: product.story_id,
            active: product.active
          },
          order: {
            id: order.id,
            status: order.status,
            created_at: order.created_at,
            total_cents: order.total_cents,
            paid_at: order.paid_at,
            fulfilled_at: order.fulfilled_at,
            customer_email: order.customer_email,
            customer_name: order.customer_name,
            shipping_name: order.shipping_name,
            shipping_city: order.shipping_city,
            shipping_state: order.shipping_state,
            shipping_postal_code: order.shipping_postal_code,
            shipping_country: order.shipping_country
          }
        });
      }
    }

    return jsonResponse(200, {
      success: true,
      purchases
    });
  } catch (error) {
    console.error('get-my-purchases error:', error);

    return jsonResponse(500, {
      success: false,
      error: error.message || 'Server error'
    });
  }
};