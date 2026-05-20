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

const shopFilterButtons = Array.from(document.querySelectorAll('.shop-filter-btn'));
const shopStoryFilter = document.getElementById('shop-story-filter');
const shopClearFiltersBtn = document.getElementById('shop-clear-filters');

let unsubscribeState = null;
let shopBootstrapped = false;
let shopClickHandlerAttached = false;
let shopFilterHandlerAttached = false;
let shopSessionWarmupAttached = false;
let checkoutInProgress = false;

let activeProductFilter = 'all';
let activeStoryFilter = 'all';
let purchasedPhysicalProductIds = new Set();

/* =======================
   HELPERS
======================= */

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

function isPhysicalProductType(productType) {
  return ['merch', 'paperback', 'bundle'].includes(String(productType || ''));
}

async function parseJsonResponseSafely(res) {
  const rawText = await res.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(rawText || 'Server returned an invalid response.');
  }
}

async function getFreshAccessToken() {
  await waitForAuthReady();

  try {
    const { data: refreshedData, error: refreshError } =
      await supabase.auth.refreshSession();

    if (refreshError) {
      console.warn('Session refresh failed, falling back to current session:', refreshError);
    }

    if (refreshedData?.session?.access_token) {
      return refreshedData.session.access_token;
    }
  } catch (error) {
    console.warn('Session refresh threw an error, falling back to current session:', error);
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Error getting current session:', error);
    return null;
  }

  return data?.session?.access_token || null;
}

function getOwnedStoryIdSet() {
  const { ownedStoryIds = [] } = getState();

  return new Set(
    (Array.isArray(ownedStoryIds) ? ownedStoryIds : []).map(String)
  );
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

function getFilteredProducts() {
  const products = getRenderedProducts();

  return products.filter((product) => {
    const productType = String(product.product_type || 'merch');
    const relatedStoryId = product.stories?.id ? String(product.stories.id) : '';

    const matchesProductType =
      activeProductFilter === 'all' || productType === activeProductFilter;

    const matchesStory =
      activeStoryFilter === 'all' || relatedStoryId === String(activeStoryFilter);

    return matchesProductType && matchesStory;
  });
}

/* =======================
   FILTERS
======================= */

function updateFilterButtonState() {
  shopFilterButtons.forEach((button) => {
    const isActive = button.dataset.shopFilter === activeProductFilter;

    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function populateStoryFilter(products) {
  if (!shopStoryFilter) return;

  const currentValue = shopStoryFilter.value || activeStoryFilter;
  const storyMap = new Map();

  (Array.isArray(products) ? products : []).forEach((product) => {
    const story = product?.stories;

    if (!story?.id || !story?.title) return;

    storyMap.set(String(story.id), String(story.title));
  });

  const sortedStories = Array.from(storyMap.entries()).sort((a, b) =>
    a[1].localeCompare(b[1])
  );

  shopStoryFilter.innerHTML = `
    <option value="all">All Stories</option>
    ${sortedStories
      .map(([storyId, storyTitle]) => {
        return `<option value="${escapeHtml(storyId)}">${escapeHtml(storyTitle)}</option>`;
      })
      .join('')}
  `;

  const optionStillExists = Array.from(shopStoryFilter.options).some(
    (option) => option.value === currentValue
  );

  shopStoryFilter.value = optionStillExists ? currentValue : 'all';
  activeStoryFilter = shopStoryFilter.value;
}

function resetFilters() {
  activeProductFilter = 'all';
  activeStoryFilter = 'all';

  if (shopStoryFilter) {
    shopStoryFilter.value = 'all';
  }

  updateFilterButtonState();
  renderProducts();
}

/* =======================
   DATA LOADING
======================= */

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
  populateStoryFilter(visibleProducts);
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

async function loadPhysicalPurchasesToState() {
  purchasedPhysicalProductIds = new Set();

  const user = await getCurrentUserAsync();

  if (!user?.id) {
    return;
  }

  const accessToken = await getFreshAccessToken();

  if (!accessToken) {
    return;
  }

  const res = await fetch('/.netlify/functions/get-my-purchases', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await parseJsonResponseSafely(res);

  if (!res.ok || !data?.success) {
    console.warn('Could not load previous physical purchases:', data?.error || data);
    return;
  }

  const purchases = Array.isArray(data.purchases) ? data.purchases : [];

  purchasedPhysicalProductIds = new Set(
    purchases
      .map((purchase) => String(purchase.product?.id || purchase.product_id || '').trim())
      .filter(Boolean)
  );
}

/* =======================
   RENDERING
======================= */

function renderProducts() {
  if (!productsContainer) return;

  const allProducts = getRenderedProducts();
  const products = getFilteredProducts();
  const ownedStoryIds = getOwnedStoryIdSet();

  if (!allProducts.length) {
    productsContainer.innerHTML = `
      <div class="shop-empty-state">
        No products are available right now.
      </div>
    `;

    setStatus('No products are available right now.', '#cbd5e1');
    return;
  }

  if (!products.length) {
    productsContainer.innerHTML = `
      <div class="shop-empty-state">
        No products match the current filters.
      </div>
    `;

    setStatus('Try clearing the filters or choosing another category.', '#cbd5e1');
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const safeProductId = escapeHtml(product.id);
      const encodedProductId = encodeURIComponent(product.id);
      const safeName = escapeHtml(product.name);
      const safeDescription = escapeHtml(product.description || '');
      const priceText = formatPrice(product.price_cents);
      const productType = String(product.product_type || 'merch');
      const productTypeLabel = prettyProductType(productType);
      const relatedStory = product.stories || null;
      const relatedStoryId = relatedStory?.id ? String(relatedStory.id) : '';

      const userOwnsThisStory =
        !!relatedStoryId && ownedStoryIds.has(relatedStoryId);

      const productWasPurchasedBefore =
        isPhysicalProductType(productType) &&
        purchasedPhysicalProductIds.has(String(product.id));

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
        isOwnedDigitalOption
          ? `<span class="shop-product-badge owned">Owned</span>`
          : '';

      const purchasedBadge =
        productWasPurchasedBefore
          ? `<span class="shop-product-badge purchased">Previously Purchased</span>`
          : '';

      const productDetailButton = `
        <a
          class="btn btn-secondary shop-view-product-btn"
          href="/shop/product.html?id=${encodedProductId}"
        >
          View Product
        </a>
      `;

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
              data-product-id="${safeProductId}"
            >
              ${productWasPurchasedBefore ? 'Buy Again' : 'Buy Now'}
            </button>
          `;

      const repeatPurchaseNote =
        productWasPurchasedBefore
          ? `
            <p class="shop-product-repeat-note">
              You’ve purchased this before. You can buy another if you want an additional copy.
            </p>
          `
          : '';

      return `
        <article class="shop-product-card" data-product-id="${safeProductId}">
          ${
            product.image_url
              ? `<a href="/shop/product.html?id=${encodedProductId}" class="shop-product-image-link" aria-label="View ${safeName}">
                  <img
                    class="shop-product-image"
                    src="${escapeHtml(product.image_url)}"
                    alt="${safeName}"
                    loading="lazy"
                    decoding="async"
                  >
                </a>`
              : `<a href="/shop/product.html?id=${encodedProductId}" class="shop-product-image-link" aria-label="View ${safeName}">
                  <div class="shop-product-image shop-product-image-placeholder">No image available</div>
                </a>`
          }

          <div class="shop-product-body">
            <div class="shop-product-badge-row">
              <span class="shop-product-badge ${escapeHtml(productType)}">${escapeHtml(productTypeLabel)}</span>
              ${ownedBadge}
              ${purchasedBadge}
            </div>

            ${storyLinkText}

            <h3 class="shop-product-title">${safeName}</h3>
            <p class="shop-product-description">${safeDescription || 'No description provided.'}</p>
            <p class="shop-product-price">${priceText}</p>
            ${votesText}
            ${repeatPurchaseNote}

            <div class="shop-product-actions">
              ${productDetailButton}
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

/* =======================
   CHECKOUT
======================= */

async function createCheckoutForProduct(productId, buttonEl) {
  if (checkoutInProgress) return;

  const originalButtonText = buttonEl?.textContent || 'Buy Now';

  checkoutInProgress = true;

  try {
    if (!productId) {
      throw new Error('Product could not be found.');
    }

    const accessToken = await getFreshAccessToken();

    if (!accessToken) {
      setStatus('Please log in before purchasing.', 'red');
      return;
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
        product_id: productId,
        quantity: 1
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
  } finally {
    checkoutInProgress = false;
  }
}

/* =======================
   EVENT BINDING
======================= */

function attachShopClickHandler() {
  if (!productsContainer || shopClickHandlerAttached) return;

  productsContainer.addEventListener('click', async (event) => {
    const button = event.target.closest?.('.shop-buy-btn[data-product-id]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    if (button.disabled) return;

    const productId = button.dataset.productId;
    if (!productId) return;

    await createCheckoutForProduct(productId, button);
  });

  shopClickHandlerAttached = true;
}

function attachShopFilterHandlers() {
  if (shopFilterHandlerAttached) return;

  shopFilterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeProductFilter = button.dataset.shopFilter || 'all';

      updateFilterButtonState();
      renderProducts();
    });
  });

  if (shopStoryFilter) {
    shopStoryFilter.addEventListener('change', () => {
      activeStoryFilter = shopStoryFilter.value || 'all';
      renderProducts();
    });
  }

  if (shopClearFiltersBtn) {
    shopClearFiltersBtn.addEventListener('click', resetFilters);
  }

  shopFilterHandlerAttached = true;
}

function attachShopSessionWarmup() {
  if (shopSessionWarmupAttached) return;
  shopSessionWarmupAttached = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;

    getFreshAccessToken().catch((error) => {
      console.warn('Shop session warmup after visibility return failed:', error);
    });
  });

  window.addEventListener('focus', () => {
    getFreshAccessToken().catch((error) => {
      console.warn('Shop session warmup after focus failed:', error);
    });
  });
}

/* =======================
   ORCHESTRATION
======================= */

async function refreshShopState() {
  if (!productsContainer) return;

  try {
    setStatus('Loading products...', '#cbd5e1');

    productsContainer.innerHTML = `
      <div class="shop-empty-state">
        Loading products...
      </div>
    `;

    await waitForAuthReady();
    await loadProductsToState();
    await loadOwnedStoryAccessToState();
    await loadPhysicalPurchasesToState();

    updateFilterButtonState();
    renderProducts();
  } catch (err) {
    console.error('Error loading shop products:', err);

    productsContainer.innerHTML = `
      <div class="shop-empty-state">
        Failed to load products.
      </div>
    `;

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
  attachShopFilterHandlers();
  attachShopSessionWarmup();

  unsubscribeState = subscribe(() => {
    populateStoryFilter(getRenderedProducts());
    updateFilterButtonState();
    renderProducts();
  });

  await waitForAuthReady();
  await refreshShopState();

  window.addEventListener('user-changed', async () => {
    await refreshShopState();
  });
}

document.addEventListener('DOMContentLoaded', initShop);