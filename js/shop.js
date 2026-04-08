// /js/shop.js
import { supabase } from "./supabase.js";

const productsContainer = document.getElementById("products-container");
const shopStatusMessage = document.getElementById("shop-status-message");

let activeProducts = [];
let currentAccessToken = null;

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

function prettyProductType(type) {
  switch (type) {
    case "digital_comic":
      return "Digital Comic";
    case "paperback":
      return "Paperback";
    case "bundle":
      return "Bundle";
    case "merch":
      return "Merch";
    default:
      return "Product";
  }
}

function isComicProduct(productType) {
  return ["digital_comic", "paperback", "bundle"].includes(productType);
}

async function parseJsonResponseSafely(res) {
  const rawText = await res.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(rawText || "Server returned an invalid response.");
  }
}

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
        created_at,
        product_type,
        story_id,
        stories (
          id,
          title,
          story_status
        )
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
      const productType = String(product.product_type || "merch");
      const productTypeLabel = prettyProductType(productType);
      const relatedStory = product.stories || null;

      const votesText =
        Number(product.votes_granted) > 0
          ? `<p class="shop-product-votes">Includes ${Number(product.votes_granted)} bonus vote${Number(product.votes_granted) === 1 ? "" : "s"}</p>`
          : "";

      const storyLinkText =
        relatedStory && relatedStory.title
          ? `<p class="shop-product-story-link"><strong>For:</strong> ${escapeHtml(relatedStory.title)}</p>`
          : "";

      const comicLinkButton =
        relatedStory && isComicProduct(productType)
          ? `
            <a
              class="btn btn-secondary shop-view-comic-btn"
              href="/comics/story.html?id=${relatedStory.id}"
            >
              View Comic
            </a>
          `
          : "";

      return `
        <article class="shop-product-card" data-product-id="${product.id}">
          ${
            product.image_url
              ? `<img class="shop-product-image" src="${escapeHtml(product.image_url)}" alt="${safeName}">`
              : `<div class="shop-product-image shop-product-image-placeholder">No image available</div>`
          }

          <div class="shop-product-body">
            <div class="shop-product-badge-row">
              <span class="shop-product-badge ${escapeHtml(productType)}">${escapeHtml(productTypeLabel)}</span>
            </div>

            ${storyLinkText}

            <h3 class="shop-product-title">${safeName}</h3>
            <p class="shop-product-description">${safeDescription || "No description provided."}</p>
            <p class="shop-product-price">${priceText}</p>
            ${votesText}

            <div class="shop-product-actions">
              <button
                type="button"
                class="btn btn-primary shop-buy-btn"
                data-product-id="${product.id}"
              >
                Buy Now
              </button>
              ${comicLinkButton}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  attachBuyButtonListeners();
}

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

document.addEventListener("DOMContentLoaded", async () => {
  currentAccessToken = await getAccessToken();
  await loadProducts();
});