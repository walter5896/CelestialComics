// /.netlify/functions/get-orders.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function jsonResponse(statusCode, payload) {
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
    .select('id, role, email')
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

function deriveFulfillmentType(orderItems) {
  const items = Array.isArray(orderItems) ? orderItems : [];

  let hasDigital = false;
  let hasPhysical = false;
  let hasMerch = false;

  for (const item of items) {
    const productType = item?.products?.product_type || 'merch';

    if (productType === 'digital_comic') {
      hasDigital = true;
    }

    if (productType === 'bundle') {
      hasDigital = true;
      hasPhysical = true;
    }

    if (productType === 'paperback') {
      hasPhysical = true;
    }

    if (productType === 'merch') {
      hasMerch = true;
      hasPhysical = true;
    }
  }

  if (hasDigital && hasPhysical) return 'Mixed Order';
  if (hasDigital) return 'Digital Only';
  if (hasMerch || hasPhysical) return 'Physical Fulfillment Needed';
  return 'Unknown';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return jsonResponse(401, { error: 'Missing auth token' });
  }

  try {
    await getAdminUserFromToken(token);

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
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
        fulfillment_notes,
        customer_email,
        customer_name,
        shipping_name,
        shipping_line1,
        shipping_line2,
        shipping_city,
        shipping_state,
        shipping_postal_code,
        shipping_country,
        shipping_phone,
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
            product_type,
            story_id,
            image_url,
            stories (
              id,
              title
            )
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (ordersError) {
      throw ordersError;
    }

    const userIds = [
      ...new Set(
        (orders || [])
          .map((order) => order.user_id)
          .filter(Boolean)
      )
    ];

    let profilesById = {};

    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, username')
        .in('id', userIds);

      if (profilesError) {
        throw profilesError;
      }

      profilesById = Object.fromEntries(
        (profiles || []).map((profile) => [profile.id, profile])
      );
    }

    const enrichedOrders = (orders || []).map((order) => ({
      ...order,
      profiles: order.user_id ? (profilesById[order.user_id] || null) : null,
      fulfillment_type: deriveFulfillmentType(order.order_items)
    }));

    return jsonResponse(200, {
      success: true,
      orders: enrichedOrders
    });
  } catch (error) {
    console.error('get-orders error:', error);

    return jsonResponse(500, {
      error: error.message || 'Server error'
    });
  }
};