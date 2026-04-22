// /js/shop.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync, waitForAuthReady } from './auth.js';
import {
  getState,
  subscribe,
  setProducts,
  setOwnedStoryAccess
} from './state.js';

const productsContainer = document.getElementById('products-container');
const shopStatusMessage = document.getElementById('shop-status-message');

let unsubscribeState = null;
let shopBootstrapped = false;
let shopClickHandlerAttached = false;

function setStatus(message = '', color = '') {
  if (!shopStatusMessage) return;
  shopStatusMessage.textContent = message;
  shopStatusMessage.style.color = color;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPrice(priceCents) {
  const safeValue = Number(priceCents);
  if (!Number.isInteger(safeValue)) return 'Price unavailable';
  return `$${(safeValue / 100).toFixed(2)}`;
}

function prettyProductType(type) {
  switch (type) {
    case 'digital_comic':
      return 'Digital Comic';
    case 'paperback':
      return 'Paperback';
    case 'bundle':
      return 'Bundle';
    case 'merch':
      return 'Merch';
    default:
      return 'Product';
  }
}

function isComicProduct(productType) {
  return ['digital_comic', 'paperback', 'bundle'].includes(String(productType || ''));
}

function isDigitalAccessProduct(productType) {
  return ['digital_comic', 'bundle'].includes(String(productType || ''));
}

async function parseJsonResponseSafely(res) {
  const rawText = await res.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(rawText || 'Server returned an invalid response.');
  }
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Error getting session:', error);
    return null;
  }

  return data?.session?.access_token || null;
}

function getOwnedStoryIdSet() {
  const { ownedStoryIds = [] } = getState();
  return new Set((Array.isArray(ownedStoryIds) ? ownedStoryIds : []).map(String));
}

function getRenderedProducts() {
  const { products = [] } = getState();
  return Array.isArray(products) ? products : [];
}

function filterVisibleProducts(products) {
  const safeProducts = Array.isArray(products) ? products : [];

  return safeProducts.filter((product) => {
    if (!product?.active) return false;

    if (!isComicProduct(product.product_type)) {
      return true;
    }

    return !!(product.stories && product.stories.story_status === 'released');
  });
}

async function loadProductsToState() {
  if (!productsContainer) return;

  const { data: products, error } = await supabase
    .from('products')
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
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const visibleProducts = filterVisibleProducts(products || []);
  setProducts(visibleProducts);
}

async function loadOwnedStoryAccessToState() {
  const user = await getCurrentUserAsync();

  if (!user?.id) {
    setOwnedStoryAccess([]);
    return;
  }

  const { data, error } = await supabase
    .from('user_story_access')
    .select(`
      id,
      user_id,
      story_id,
      access_type,
      granted_at
    `)
    .eq('user_id', user.id);

  if (error) {
    throw error;
  }

  setOwnedStoryAccess(data || []);
}

function renderProducts() {
  if (!productsContainer) return;

  const products = getRenderedProducts();
  const ownedStoryIds = getOwnedStoryIdSet();

  if (!products.length) {
    productsContainer.innerHTML = '<p>No products available right now.</p>';
    setStatus('No products are available right now.', '#6b7280');
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const safeName = escapeHtml(product.name);
      const safeDescription = escapeHtml(product.description || '');
      const priceText = formatPrice(product.price_cents);
      const productType = String(product.product_type || 'merch');
      const productTypeLabel = prettyProductType(productType);
      const relatedStory = product.stories || null;
      const relatedStoryId = relatedStory?.id ? String(relatedStory.id) : '';
      const userOwnsThisStory = !!relatedStoryId && ownedStoryIds.has(relatedStoryId);

      const isOwnedDigitalOption =
        userOwnsThisStory && isDigitalAccessProduct(productType);

      const votesGranted = Number(product.votes_granted) || 0;

      const votesText =
        votesGranted > 0
          ? `<p class="shop-product-votes">Includes ${votesGranted} bonus vote${votesGranted === 1 ? '' : 's'}</p>`
          : '';

      const storyLinkText =
        relatedStory?.title
          ? `<p class="shop-product-story-link"><strong>For:</strong> ${escapeHtml(relatedStory.title)}</p>`
          : '';

      const ownedBadge =
        userOwnsThisStory
          ? `<span class="shop-product-badge owned">Owned</span>`
          : '';

      const comicLinkButton =
        relatedStoryId && isComicProduct(productType)
          ? `
            <a
              class="btn btn-secondary shop-view-comic-btn"
              href="/comics/story.html?id=${encodeURIComponent(relatedStoryId)}"
            >
              ${userOwnsThisStory ? 'Open Comic' : 'View Comic'}
            </a>
          `
          : '';

      const buyButton =
        isOwnedDigitalOption
          ? `
            <button
              type="button"
              class="btn btn-secondary shop-buy-btn"
              disabled
            >
              Already Owned
            </button>
          `
          : `
            <button
              type="button"
              class="btn btn-primary shop-buy-btn"
              data-product-id="${escapeHtml(product.id)}"
            >
              Buy Now
            </button>
          `;

      return `
        <article class="shop-product-card" data-product-id="${escapeHtml(product.id)}">
          ${
            product.image_url
              ? `<img class="shop-product-image" src="${escapeHtml(product.image_url)}" alt="${safeName}">`
              : `<div class="shop-product-image shop-product-image-placeholder">No image available</div>`
          }

          <div class="shop-product-body">
            <div class="shop-product-badge-row">
              <span class="shop-product-badge ${escapeHtml(productType)}">${escapeHtml(productTypeLabel)}</span>
              ${ownedBadge}
            </div>

            ${storyLinkText}

            <h3 class="shop-product-title">${safeName}</h3>
            <p class="shop-product-description">${safeDescription || 'No description provided.'}</p>
            <p class="shop-product-price">${priceText}</p>
            ${votesText}

            <div class="shop-product-actions">
              ${buyButton}
              ${comicLinkButton}
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  setStatus('');
}

async function handleBuyProduct(productId, buttonEl) {
  const originalButtonText = buttonEl?.textContent || 'Buy Now';

  try {
    const user = await getCurrentUserAsync();

    if (!user) {
      setStatus('Please log in before purchasing.', 'red');
      return;
    }

    const products = getRenderedProducts();
    const ownedStoryIds = getOwnedStoryIdSet();

    const product = products.find((item) => String(item.id) === String(productId));
    if (!product) {
      throw new Error('Product not found.');
    }

    const relatedStoryId = product?.stories?.id ? String(product.stories.id) : '';
    const alreadyOwned =
      relatedStoryId &&
      ownedStoryIds.has(relatedStoryId) &&
      isDigitalAccessProduct(product.product_type);

    if (alreadyOwned) {
      setStatus('You already own this digital comic.', '#6b7280');
      renderProducts();
      return;
    }

    const accessToken = await getAccessToken();

    if (!accessToken) {
      throw new Error('No active session found.');
    }

    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.textContent = 'Redirecting...';
    }

    setStatus('');

    const res = await fetch('/.netlify/functions/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
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
      throw new Error(data?.error || 'Failed to create checkout session.');
    }

    window.location.href = data.url;
  } catch (err) {
    console.error('Error during checkout:', err);
    setStatus(err.message || 'Checkout failed.', 'red');

    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.textContent = originalButtonText;
    }
  }
}

function attachShopClickHandler() {
  if (!productsContainer || shopClickHandlerAttached) return;

  productsContainer.addEventListener('click', async (event) => {
    const button = event.target.closest('.shop-buy-btn[data-product-id]');
    if (!button) return;

    const productId = button.dataset.productId;
    if (!productId) return;

    await handleBuyProduct(productId, button);
  });

  shopClickHandlerAttached = true;
}

async function refreshShopState() {
  if (!productsContainer) return;

  try {
    setStatus('Loading products...', '#374151');
    productsContainer.innerHTML = '<p>Loading products...</p>';

    await loadProductsToState();
    await loadOwnedStoryAccessToState();
    renderProducts();
  } catch (err) {
    console.error('Error loading shop products:', err);
    productsContainer.innerHTML = '<p>Failed to load products.</p>';
    setStatus(err.message || 'Failed to load products.', 'red');
  }
}

async function initShop() {
  if (shopBootstrapped) return;
  shopBootstrapped = true;

  if (!productsContainer) {
    console.error('Missing #products-container in shop page.');
    return;
  }

  attachShopClickHandler();

  unsubscribeState = subscribe(() => {
    renderProducts();
  });

  await waitForAuthReady();
  await refreshShopState();

  window.addEventListener('user-changed', async () => {
    await refreshShopState();
  });
}

document.addEventListener('DOMContentLoaded', initShop);