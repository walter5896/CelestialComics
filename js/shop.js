// shop.js
import { supabase } from "./supabase.js";

document.addEventListener("DOMContentLoaded", () => {
  const buyBtn = document.getElementById("buy-btn");

  if (!buyBtn) {
    console.error("Buy button not found. Add <button id='buy-btn'>Buy</button> to shop.html");
    return;
  }

  buyBtn.addEventListener("click", async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) {
        console.error("Error fetching user:", userError);
        alert("Failed to get user info. Check console.");
        return;
      }

      if (!user) {
        alert("Please log in first.");
        return;
      }

      // Updated cart with correct product UUID
      const cart = [
        {
          product_id: "36e541a4-5f38-440a-a9aa-32e6cf3cbab3", // UUID from Supabase
          quantity: 1,
          stripe_price_id: "price_1SuiBkRaDrRA5HPraxYGj52H",
        },
      ];

      const res = await fetch("/.netlify/functions/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, cart }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Error from checkout function:", data);
        alert(`Checkout failed: ${data.error || "Unknown error"}`);
        return;
      }

      if (!data.url) {
        console.error("No URL returned from checkout session:", data);
        alert("Checkout failed. Check console for details.");
        return;
      }

      window.location.href = data.url;

    } catch (err) {
      console.error("Error during checkout:", err);
      alert("Checkout failed. See console for details.");
    }
  });
});
