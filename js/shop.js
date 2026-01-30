// shop.js
import { supabase } from "./supabase.js";

document.addEventListener("DOMContentLoaded", () => {
  const buyBtn = document.getElementById("buy-btn");

  if (!buyBtn) {
    console.error("Buy button not found. Add <button id='buy-btn'>Buy</button> to shop/index.html");
    return;
  }

  buyBtn.addEventListener("click", async () => {
    try {
      // Get the logged-in user (Supabase v2)
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        alert("Please log in first.");
        return;
      }

      // Call your Netlify function to create a Stripe checkout session
      const response = await fetch("/.netlify/functions/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          cart: [
            {
              product_id: 1,
              quantity: 1,
              stripe_price_id: "price_1SuiBkRaDrRA5HPraxYGj52H"
            }
          ]
        })
      });

      const data = await response.json();

      if (!data.url) {
        console.error("No URL returned from checkout session:", data);
        alert("Checkout failed. Check console for details.");
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;

    } catch (err) {
      console.error("Error during checkout:", err);
      alert("Checkout failed. Check console for details.");
    }
  });
});
