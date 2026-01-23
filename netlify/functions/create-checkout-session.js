const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { user_id, cart } = JSON.parse(event.body);

  try {
    // 1) Create Order
    const { data: order } = await supabase
      .from("orders")
      .insert([{ user_id, status: "pending" }])
      .select()
      .single();

    // 2) Create Order Items
    const items = cart.map((c) => ({
      order_id: order.id,
      product_id: c.product_id,
      quantity: c.quantity,
    }));

    await supabase.from("order_items").insert(items);

    // 3) Create Stripe Checkout Session
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

    // 4) Save session id
    await supabase
      .from("orders")
      .update({ stripe_session_id: session.id })
      .eq("id", order.id);

    return {
      statusCode: 200,
      body: JSON.stringify({ sessionId: session.id }),
    };

  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: "Server Error" };
  }
};
