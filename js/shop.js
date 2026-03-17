// /js/shop.js
import { supabase } from "./supabase.js";

// =========================
// DOM REFERENCES
// =========================
const productsContainer = document.getElementById("products-container");
const shopStatusMessage = document.getElementById("shop-status-message");

// =========================
// SHARED STATE
// =========================
let activeProducts = [];
let currentAccessToken = null;

// =========================
// HELPERS
// =========================
function setStatus(message = "", color = "") {
  if (!shopStatusMessage) return;
  shopStatusMessage.textContent = message;
  shopStatusMessage.style.color = color;
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Error getting session:", error);
    return null;
  }

  return data?.session?.access_token || null;
}

function formatPrice(priceCents) {
  if (!Number.isInteger(priceCents)) return "Price unavailable";
  return `$${(priceCents / 100).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function parseJsonResponseSafely(res) {
  const rawText = await res.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(rawText || "Server returned an invalid response.");
  }
}

// =========================
// PRODUCT LOADING
// =========================
async function loadProducts() {
  if (!productsContainer) {
    console.error("Missing #products-container in shop page.");
    return;
  }

  try {
    setStatus("Loading products...", "#374151");
    productsContainer.innerHTML = "<p>Loading products...</p>";

    const { data: products, error } = await supabase
      .from("products")
      .select(`
        id,
        name,
        description,
        price_cents,
        image_url,
        active,
        votes_granted,
        created_at
      `)
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    activeProducts = products || [];
    renderProducts(activeProducts);

    if (!activeProducts.length) {
      setStatus("No products are available right now.", "#6b7280");
    } else {
      setStatus("");
    }
  } catch (err) {
    console.error("Error loading shop products:", err);
    productsContainer.innerHTML = "<p>Failed to load products.</p>";
    setStatus(err.message || "Failed to load products.", "red");
  }
}

// =========================
// PRODUCT RENDERING
// =========================
function renderProducts(products) {
  if (!productsContainer) return;

  if (!products.length) {
    productsContainer.innerHTML = "<p>No products available right now.</p>";
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const safeName = escapeHtml(product.name);
      const safeDescription = escapeHtml(product.description || "");
      const priceText = formatPrice(product.price_cents);
      const votesText =
        Number(product.votes_granted) > 0
          ? `<p class="shop-product-votes">Includes ${Number(product.votes_granted)} bonus vote${Number(product.votes_granted) === 1 ? "" : "s"}</p>`
          : "";

      return `
        <article class="shop-product-card" data-product-id="${product.id}">
          ${
            product.image_url
              ? `<img class="shop-product-image" src="${escapeHtml(product.image_url)}" alt="${safeName}">`
              : `<div class="shop-product-image shop-product-image-placeholder">No image available</div>`
          }

          <div class="shop-product-body">
            <h3 class="shop-product-title">${safeName}</h3>
            <p class="shop-product-description">${safeDescription || "No description provided."}</p>
            <p class="shop-product-price">${priceText}</p>
            ${votesText}
            <button
              type="button"
              class="shop-buy-btn"
              data-product-id="${product.id}"
            >
              Buy Now
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  attachBuyButtonListeners();
}

// =========================
// CHECKOUT
// =========================
function attachBuyButtonListeners() {
  document.querySelectorAll(".shop-buy-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const productId = button.dataset.productId;
      if (!productId) return;

      await handleBuyProduct(productId, button);
    });
  });
}

async function handleBuyProduct(productId, buttonEl) {
  const originalButtonText = buttonEl?.textContent || "Buy Now";

  try {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user) {
      alert("Please log in before purchasing.");
      return;
    }

    currentAccessToken = await getAccessToken();

    if (!currentAccessToken) {
      throw new Error("No active session found.");
    }

    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.textContent = "Redirecting...";
    }

    setStatus("");

    const res = await fetch("/.netlify/functions/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentAccessToken}`
      },
      body: JSON.stringify({
        cart: [
          {
            product_id: productId,
            quantity: 1
          }
        ]
      })
    });

    const data = await parseJsonResponseSafely(res);

    if (!res.ok || !data?.url) {
      throw new Error(data?.error || "Failed to create checkout session.");
    }

    window.location.href = data.url;
  } catch (err) {
    console.error("Error during checkout:", err);
    setStatus(err.message || "Checkout failed.", "red");
    alert(err.message || "Checkout failed.");
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.textContent = originalButtonText;
    }
  }
}

// =========================
// BOOTSTRAP
// =========================
document.addEventListener("DOMContentLoaded", async () => {
  currentAccessToken = await getAccessToken();
  await loadProducts();
});