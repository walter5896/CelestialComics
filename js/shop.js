// /js/shop.js
import { supabase } from "./supabase.js";

document.addEventListener("DOMContentLoaded", () => {
  const buyBtn = document.getElementById("buy-btn");

  if (!buyBtn) {
    console.error("Buy button not found.");
    return;
  }

  buyBtn.addEventListener("click", async () => {
    // Supabase v2: get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("Error getting session:", sessionError);
      alert("Failed to get user session. Try logging in again.");
      return;
    }

    const user = session?.user;
    if (!user) {
      alert("Please log in first.");
      return;
    }

    // Build your cart
    const cart = [
      {
        product_id: 1,
        quantity: 1,
        stripe_price_id: "price_1SuiBkRaDrRA5HPraxYGj52H",
      },
    ];

    try {
      const response = await fetch("/.netlify/functions/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, cart }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Error during checkout:", data);
        alert(`Checkout failed: ${data.error}`);
        return;
      }

      // Redirect to Stripe Checkout
      window.location = data.url;

    } catch (err) {
      console.error("Error during checkout:", err);
      alert("Checkout failed. Check console for details.");
    }
  });
});
