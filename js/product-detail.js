// /js/product-detail.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync, waitForAuthReady } from './auth.js';
import { setOwnedStoryAccess } from './state.js';

const statusEl = document.getElementById('product-detail-status');
const contentEl = document.getElementById('product-detail-content');
const errorEl = document.getElementById('product-detail-error');

const imageEl = document.getElementById('product-detail-image');
const placeholderEl = document.getElementById('product-detail-placeholder');

const typeEl = document.getElementById('product-detail-type');
const ownedEl = document.getElementById('product-detail-owned');
const storyEl = document.getElementById('product-detail-story');
const titleEl = document.getElementById('product-detail-title');
const priceEl = document.getElementById('product-detail-price');
const descriptionEl = document.getElementById('product-detail-description');
const votesEl = document.getElementById('product-detail-votes');
const shippingEl = document.getElementById('product-detail-shipping');

const buyBtn = document.getElementById('product-buy-btn');
const comicLink = document.getElementById('product-comic-link');

let currentProduct = null;
let currentUser = null;
let userOwnsRelatedStory = false;
let userPurchasedThisPhysicalProduct = false;

let productDetailInitialized = false;
let productBuyHandlerAttached = false;
let productSessionWarmupAttached = false;
let checkoutInProgress = false;

/* =======================
   HELPERS
======================= */

function setStatus(message = '', color = '') {
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.style.color = color;
}

function showContent() {
  if (contentEl) contentEl.style.display = 'grid';
  if (errorEl) errorEl.style.display = 'none';
}

function showError(message = 'Product could not be loaded.') {
  if (contentEl) contentEl.style.display = 'none';

  if (errorEl) {
    errorEl.style.display = 'block';
    errorEl.textContent = message;
  }
}

function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function encodeId(value) {
  return encodeURIComponent(String(value ?? ''));
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

function isDigitalOnlyProduct(type) {
  return String(type || '') === 'digital_comic';
}

function isDigitalAccessProduct(type) {
  return ['digital_comic', 'bundle'].includes(String(type || ''));
}

function isPhysicalProductType(type) {
  return ['merch', 'paperback', 'bundle'].includes(String(type || ''));
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

/* =======================
   DATA LOADING
======================= */

async function fetchProduct(productId) {
  const { data, error } = await supabase
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
        story_status,
        is_preview_enabled,
        preview_page_count
      )
    `)
    .eq('id', productId)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function loadOwnedStoryAccess() {
  currentUser = await getCurrentUserAsync();

  if (!currentUser?.id) {
    setOwnedStoryAccess([]);
    return [];
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
    .eq('user_id', currentUser.id);

  if (error) {
    throw error;
  }

  const safeRows = data || [];

  setOwnedStoryAccess(safeRows);

  return safeRows;
}

async function loadPurchasedPhysicalProducts() {
  const user = await getCurrentUserAsync();

  if (!user?.id) {
    return [];
  }

  const accessToken = await getFreshAccessToken();

  if (!accessToken) {
    return [];
  }

  try {
    const res = await fetch('/.netlify/functions/get-my-purchases', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = await parseJsonResponseSafely(res);

    if (!res.ok || !data?.success) {
      console.warn('Could not load physical purchase history:', data?.error || data);
      return [];
    }

    return Array.isArray(data.purchases) ? data.purchases : [];
  } catch (err) {
    console.warn('Physical purchase history unavailable:', err);
    return [];
  }
}

/* =======================
   RENDER HELPERS
======================= */

function updateImage(product) {
  const imageUrl = product?.image_url || '';

  if (imageUrl && imageEl) {
    imageEl.src = imageUrl;
    imageEl.alt = `${product.name || 'Product'} image`;
    imageEl.loading = 'eager';
    imageEl.decoding = 'async';
    imageEl.style.display = 'block';

    if (placeholderEl) placeholderEl.style.display = 'none';
    return;
  }

  if (imageEl) {
    imageEl.src = '';
    imageEl.alt = '';
    imageEl.style.display = 'none';
  }

  if (placeholderEl) {
    placeholderEl.style.display = 'flex';
  }
}

function updateBadges(product) {
  const productType = String(product?.product_type || 'merch');
  const typeLabel = prettyProductType(productType);

  if (typeEl) {
    typeEl.textContent = typeLabel;
    typeEl.className = `shop-product-badge ${escapeHtml(productType)}`;
  }

  if (!ownedEl) return;

  const isOwnedDigitalOnlyOption =
    userOwnsRelatedStory && isDigitalOnlyProduct(productType);

  const bundleDigitalAccessOwned =
    userOwnsRelatedStory && productType === 'bundle';

  if (isOwnedDigitalOnlyOption || bundleDigitalAccessOwned) {
    ownedEl.textContent = bundleDigitalAccessOwned ? 'Digital Access Owned' : 'Owned';
    ownedEl.style.display = 'inline-flex';
    return;
  }

  if (userPurchasedThisPhysicalProduct && isPhysicalProductType(productType)) {
    ownedEl.textContent = 'Purchased Before';
    ownedEl.style.display = 'inline-flex';
    return;
  }

  ownedEl.style.display = 'none';
}

function updateStoryLink(product) {
  const story = product?.stories || null;
  const productType = String(product?.product_type || '');

  if (!story?.id || !storyEl) {
    if (storyEl) storyEl.textContent = '';
    if (comicLink) comicLink.style.display = 'none';
    return;
  }

  storyEl.innerHTML = `<strong>Related Story:</strong> ${escapeHtml(story.title || 'Untitled Story')}`;

  if (comicLink) {
    comicLink.href = `/comics/story.html?id=${encodeId(story.id)}`;
    comicLink.textContent = userOwnsRelatedStory && isDigitalAccessProduct(productType)
      ? 'Open Comic'
      : 'View Comic';
    comicLink.style.display = 'inline-flex';
  }
}

function updateNotes(product) {
  const productType = String(product?.product_type || 'merch');
  const votesGranted = Number(product?.votes_granted) || 0;

  if (votesEl) {
    if (votesGranted > 0) {
      votesEl.style.display = 'block';
      votesEl.textContent = `Includes ${votesGranted} bonus vote${votesGranted === 1 ? '' : 's'} after purchase.`;
    } else {
      votesEl.style.display = 'none';
      votesEl.textContent = '';
    }
  }

  if (shippingEl) {
    if (isPhysicalProductType(productType)) {
      shippingEl.style.display = 'block';

      if (userPurchasedThisPhysicalProduct) {
        shippingEl.textContent = 'You have purchased this physical product before. You can buy it again if you want another copy or an additional item.';
      } else {
        shippingEl.textContent = 'This is a physical product. Shipping details are collected securely during checkout when required.';
      }

      return;
    }

    shippingEl.style.display = 'none';
    shippingEl.textContent = '';
  }
}

function updateBuyButton(product) {
  if (!buyBtn) return;

  const productType = String(product?.product_type || '');

  const isOwnedDigitalOnlyOption =
    userOwnsRelatedStory && isDigitalOnlyProduct(productType);

  if (isOwnedDigitalOnlyOption) {
    buyBtn.disabled = true;
    buyBtn.textContent = 'Already Owned';
    buyBtn.classList.remove('btn-primary');
    buyBtn.classList.add('btn-secondary');
    return;
  }

  buyBtn.disabled = false;
  buyBtn.textContent =
    userPurchasedThisPhysicalProduct && isPhysicalProductType(productType)
      ? 'Buy Again'
      : 'Buy Now';

  buyBtn.classList.remove('btn-secondary');
  buyBtn.classList.add('btn-primary');
}

async function renderProduct(product) {
  currentProduct = product;

  const storyId = product?.stories?.id ? String(product.stories.id) : '';
  const productId = product?.id ? String(product.id) : '';

  const [ownedRows, physicalPurchases] = await Promise.all([
    loadOwnedStoryAccess(),
    loadPurchasedPhysicalProducts()
  ]);

  userOwnsRelatedStory = !!storyId && ownedRows.some(
    (row) => String(row.story_id) === storyId
  );

  userPurchasedThisPhysicalProduct = physicalPurchases.some((purchase) => {
    const purchasedProductId = String(purchase.product?.id || purchase.product_id || '');
    return purchasedProductId && purchasedProductId === productId;
  });

  updateImage(product);
  updateBadges(product);
  updateStoryLink(product);
  updateNotes(product);
  updateBuyButton(product);

  if (titleEl) titleEl.textContent = product.name || 'Untitled Product';
  if (priceEl) priceEl.textContent = formatPrice(product.price_cents);

  if (descriptionEl) {
    descriptionEl.textContent = product.description || 'No description provided.';
  }

  document.title = `${product.name || 'Product'} | Celestial Comics`;

  setStatus('');
  showContent();
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
    console.error('Product checkout error:', err);
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

function bindBuyButton() {
  if (!buyBtn || productBuyHandlerAttached) return;

  buyBtn.addEventListener('click', async (event) => {
    event.preventDefault();

    if (buyBtn.disabled) return;

    const productId = currentProduct?.id || getQueryParam('id');

    await createCheckoutForProduct(productId, buyBtn);
  });

  productBuyHandlerAttached = true;
}

function attachProductSessionWarmup() {
  if (productSessionWarmupAttached) return;
  productSessionWarmupAttached = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;

    getFreshAccessToken().catch((error) => {
      console.warn('Product detail session warmup after visibility return failed:', error);
    });
  });

  window.addEventListener('focus', () => {
    getFreshAccessToken().catch((error) => {
      console.warn('Product detail session warmup after focus failed:', error);
    });
  });
}

/* =======================
   INIT
======================= */

async function initProductDetail() {
  if (productDetailInitialized) return;
  productDetailInitialized = true;

  const productId = getQueryParam('id');

  if (!productId) {
    setStatus('');
    showError('No product ID was provided.');
    return;
  }

  try {
    await waitForAuthReady();

    bindBuyButton();
    attachProductSessionWarmup();

    setStatus('Loading product...', '#cbd5e1');

    const product = await fetchProduct(productId);

    if (!product) {
      setStatus('');
      showError('This product could not be found or is no longer active.');
      return;
    }

    await renderProduct(product);
  } catch (err) {
    console.error('Product detail load error:', err);
    setStatus('');
    showError(err.message || 'Failed to load product.');
  }
}

document.addEventListener('DOMContentLoaded', initProductDetail);