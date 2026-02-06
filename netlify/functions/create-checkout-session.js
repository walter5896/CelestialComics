// create-checkout-session.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const { user_id, cart } = JSON.parse(event.body);

    if (!cart || !cart.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "Cart is empty" }) };
    }

    // 1️⃣ Create Order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([{ user_id, status: "pending" }])
      .select()
      .single();

    if (orderError || !order) {
      console.error("Order creation error:", orderError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to create order", details: orderError }),
      };
    }

    // 2️⃣ Create Order Items with detailed logging
    const items = cart.map((c) => ({
      order_id: order.id,
      product_id: c.product_id,
      quantity: c.quantity,
    }));

    const { data: itemsData, error: itemsError } = await supabase.from("order_items").insert(items);

    if (itemsError) {
      console.error("Order items insertion failed:", itemsError);
      console.log("Items attempted to insert:", items);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to create order items",
          details: itemsError,
          attemptedItems: items,
        }),
      };
    }

    // 3️⃣ Create Stripe Checkout Session
    const line_items = cart.map((c) => ({
      price: c.stripe_price_id,
      quantity: c.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items,
      success_url: `${process.env.SITE_URL}/shop/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/shop/cancel.html`,
      metadata: { order_id: order.id },
    });

    // 4️⃣ Save session ID to order
    const { error: updateError } = await supabase
      .from("orders")
      .update({ stripe_session_id: session.id })
      .eq("id", order.id);

    if (updateError) {
      console.error("Failed to update order with session ID:", updateError);
    }

    // ✅ Return Stripe URL
    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };

  } catch (error) {
    console.error("Checkout function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server Error", details: error.message }),
    };
  }
};
