// If you're using ES Modules and have a supabase.js that exports `supabase`,
// uncomment the import line below:
//
// import { supabase } from "./supabase.js";

(async () => {
  // If you are NOT using modules, this assumes your supabase client is available
  // globally as `supabase` (from your supabase.js script).
  // If you DO use modules, make sure the import above is enabled.

  document.addEventListener("DOMContentLoaded", () => {
    const buyBtn = document.getElementById("buy-btn");

    if (!buyBtn) {
      console.error("Buy button not found. Add <button id='buy-btn'>Buy</button> to shop/index.html");
      return;
    }

    buyBtn.addEventListener("click", async () => {
      // Get the logged-in user
      const user = supabase.auth.user();

      if (!user) {
        alert("Please log in first.");
        return;
      }

      try {
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
        window.location = data.url;
      } catch (err) {
        console.error(err);
        alert("Checkout failed. Check console for details.");
      }
    });
  });
})();
