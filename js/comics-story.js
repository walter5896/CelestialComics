// /js/comics-story.js
import { supabase } from './supabase.js';

/* =========================
   DOM REFERENCES
========================= */
const comicPageContent = document.getElementById('comic-page-content');
const comicStatusMessage = document.getElementById('comic-status-message');

/* =========================
   HELPERS
========================= */
function setStatus(message = '', color = '') {
  if (!comicStatusMessage) return;
  comicStatusMessage.textContent = message;
  comicStatusMessage.style.color = color;
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

function formatPrice(priceCents) {
  if (!Number.isInteger(priceCents)) return 'Price unavailable';
  return `$${(priceCents / 100).toFixed(2)}`;
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

function getStoryImage(story) {
  return story?.cover_image_url || story?.image_url || '';
}

function isDigitalAccessProduct(productType) {
  return ['digital_comic', 'bundle'].includes(productType);
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

async function getCurrentUser() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    console.error('Error loading current user:', error);
    return null;
  }

  return user || null;
}

/* =========================
   DATA LOADERS
========================= */
async function loadReleasedStory(storyId) {
  const { data, error } = await supabase
    .from('stories')
    .select(`
      id,
      title,
      author,
      description,
      image_url,
      cover_image_url,
      active,
      story_status,
      is_preview_enabled,
      preview_page_count,
      is_digital_purchase_available,
      is_paperback_available,
      bundle_purchase_available,
      production_stage_label,
      release_date
    `)
    .eq('id', storyId)
    .eq('active', true)
    .eq('story_status', 'released')
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadStoryPreviewPages(storyId, story) {
  if (!story?.is_preview_enabled) return [];

  const { data, error } = await supabase
    .from('story_pages')
    .select(`
      id,
      page_number,
      image_url,
      caption,
      is_preview_page
    `)
    .eq('story_id', storyId)
    .order('page_number', { ascending: true });

  if (error) throw error;

  const pages = data || [];
  const explicitlyMarkedPreviewPages = pages.filter((page) => page.is_preview_page);

  if (explicitlyMarkedPreviewPages.length > 0) {
    return explicitlyMarkedPreviewPages;
  }

  const previewPageCount = Number(story.preview_page_count) || 0;
  if (previewPageCount <= 0) return [];

  return pages.slice(0, previewPageCount);
}

async function loadStoryProducts(storyId) {
  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      description,
      price_cents,
      image_url,
      active,
      product_type,
      story_id,
      votes_granted
    `)
    .eq('active', true)
    .eq('story_id', storyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function checkStoryOwnership(storyId, userId) {
  if (!storyId || !userId) return false;

  const { data, error } = await supabase
    .from('user_story_access')
    .select('id, access_type')
    .eq('user_id', userId)
    .eq('story_id', storyId)
    .limit(1);

  if (error) throw error;

  return Array.isArray(data) && data.length > 0;
}

/* =========================
   CHECKOUT
========================= */
function attachBuyButtonListeners() {
  document.querySelectorAll('.comic-buy-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const productId = button.dataset.productId;
      if (!productId) return;
      await handleBuyProduct(productId, button);
    });
  });
}

async function handleBuyProduct(productId, buttonEl) {
  const originalButtonText = buttonEl?.textContent || 'Buy Now';

  try {
    const user = await getCurrentUser();

    if (!user) {
      alert('Please log in before purchasing.');
      return;
    }

    const currentAccessToken = await getAccessToken();

    if (!currentAccessToken) {
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
      throw new Error(data?.error || 'Failed to create checkout session.');
    }

    window.location.href = data.url;
  } catch (err) {
    console.error('Error during checkout:', err);
    setStatus(err.message || 'Checkout failed.', 'red');
    alert(err.message || 'Checkout failed.');
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.textContent = originalButtonText;
    }
  }
}

/* =========================
   RENDERERS
========================= */
function renderProductCards(products, ownership) {
  if (!products.length) {
    return `
      <div class="comic-empty-state">
        No purchase options are available for this comic yet.
      </div>
    `;
  }

  return `
    <div class="comic-product-grid">
      ${products
        .map((product) => {
          const safeName = escapeHtml(product.name);
          const safeDescription = escapeHtml(product.description || '');
          const priceText = formatPrice(product.price_cents);
          const isOwnedDigitalOption =
            ownership.hasAccess && isDigitalAccessProduct(product.product_type);

          return `
            <article class="comic-product-card">
              <span class="comic-product-type">${escapeHtml(prettyProductType(product.product_type))}</span>
              <h3 class="comic-product-title">${safeName}</h3>
              <p class="comic-product-description">${safeDescription || 'No description provided.'}</p>
              <p class="comic-product-price">${priceText}</p>
              ${
                isOwnedDigitalOption
                  ? `
                    <button
                      type="button"
                      class="btn btn-secondary comic-buy-btn"
                      disabled
                    >
                      Already Owned
                    </button>
                  `
                  : `
                    <button
                      type="button"
                      class="btn btn-primary comic-buy-btn"
                      data-product-id="${product.id}"
                    >
                      Buy ${safeName}
                    </button>
                  `
              }
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderPreviewPages(previewPages, story, ownership) {
  if (ownership.hasAccess) {
    return `
      <div class="comic-empty-state">
        You own this comic. Use the full reader below to access the entire story.
      </div>
    `;
  }

  if (!story?.is_preview_enabled) {
    return `
      <div class="comic-empty-state">
        Preview pages are not available for this release yet.
      </div>
    `;
  }

  if (!previewPages.length) {
    return `
      <div class="comic-empty-state">
        Preview is enabled, but no preview pages are currently available.
      </div>
    `;
  }

  return `
    <div class="comic-preview-grid">
      ${previewPages
        .map((page) => {
          return `
            <article class="comic-preview-card">
              <img src="${escapeHtml(page.image_url || '')}" alt="Preview page ${page.page_number}">
              <strong>Preview Page ${page.page_number}</strong>
              <p>${escapeHtml(page.caption || 'Preview page')}</p>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderAccessBox(story, ownership) {
  const readerHref = `/gallery/read.html?id=${story.id}`;

  if (ownership.hasAccess) {
    return `
      <div class="comic-locked-box">
        <h3>Your Access</h3>
        <p>
          You own digital access to this comic. You can open the full reader anytime from here.
        </p>
        <a href="${readerHref}" class="btn btn-primary">Read Full Comic</a>
      </div>
    `;
  }

  if (!ownership.userLoggedIn) {
    return `
      <div class="comic-locked-box">
        <h3>Full Comic Access</h3>
        <p>
          Log in and purchase digital access to unlock the full comic beyond the public preview.
        </p>
        <a href="/login/" class="btn btn-secondary">Log In</a>
      </div>
    `;
  }

  return `
    <div class="comic-locked-box">
      <h3>Full Comic Access</h3>
      <p>
        You are currently viewing the public preview only. Purchase digital access to unlock the full comic reader.
      </p>
      <a href="${readerHref}" class="btn btn-secondary">Open Preview Reader</a>
    </div>
  `;
}

function renderOwnershipBanner(ownership) {
  if (ownership.hasAccess) {
    return `
      <div class="comic-status-note comic-status-note--owned">
        You already own this comic.
      </div>
    `;
  }

  if (!ownership.userLoggedIn) {
    return `
      <div class="comic-status-note">
        Log in to purchase this comic and save ownership to your account.
      </div>
    `;
  }

  return `
    <div class="comic-status-note">
      You are viewing the public release page. Purchase digital access to unlock full reading.
    </div>
  `;
}

function renderComicPage({ story, previewPages, products, ownership }) {
  if (!comicPageContent) return;

  const safeTitle = escapeHtml(story.title || 'Untitled Comic');
  const safeAuthor = escapeHtml(story.author || '');
  const safeDescription = escapeHtml(story.description || 'No comic description available yet.');
  const safeImage = escapeHtml(getStoryImage(story));
  const stageLabel = escapeHtml(story.production_stage_label || 'Released');

  const authorLine = safeAuthor ? `By ${safeAuthor}` : 'Author not listed';
  const releaseLine = story.release_date
    ? `Released: ${new Date(story.release_date).toLocaleDateString()}`
    : 'Released comic';

  comicPageContent.innerHTML = `
    <section class="comic-hero">
      <div class="comic-cover-wrap">
        ${
          safeImage
            ? `<img class="comic-cover" src="${safeImage}" alt="${safeTitle} cover">`
            : `<div class="comic-empty-state">No cover available.</div>`
        }
      </div>

      <div class="comic-info">
        <span class="comic-status-badge">${stageLabel}</span>
        ${renderOwnershipBanner(ownership)}
        <h1 class="comic-title">${safeTitle}</h1>
        <p class="comic-meta">${authorLine} • ${releaseLine}</p>
        <div class="comic-description">
          <p>${safeDescription}</p>
        </div>
      </div>
    </section>

    <section class="comic-purchase-box">
      <h2>${ownership.hasAccess ? 'Your Formats' : 'Purchase Options'}</h2>
      <p class="comic-purchase-intro">
        ${
          ownership.hasAccess
            ? 'You already own digital access. Additional physical or bundle options are shown below if available.'
            : 'Choose how you want to experience this release. Available options for this comic are shown below.'
        }
      </p>
      ${renderProductCards(products, ownership)}
    </section>

    <section class="comic-preview-box">
      <h2>${ownership.hasAccess ? 'Full Access Ready' : 'Preview Pages'}</h2>
      <p class="comic-preview-intro">
        ${
          ownership.hasAccess
            ? 'Your account has access to the full comic. Open the reader below to continue.'
            : 'Read a preview of this comic below. Full digital access is unlocked through purchase.'
        }
      </p>

      ${renderPreviewPages(previewPages, story, ownership)}

      ${renderAccessBox(story, ownership)}
    </section>
  `;

  attachBuyButtonListeners();
}

function renderNotFoundState() {
  if (!comicPageContent) return;

  comicPageContent.innerHTML = `
    <div class="comic-empty-state">
      This released comic could not be found, or it is not publicly available yet.
    </div>
  `;
}

function renderErrorState(message) {
  if (!comicPageContent) return;

  comicPageContent.innerHTML = `
    <div class="comic-error">
      ${escapeHtml(message || 'Failed to load comic.')}
    </div>
  `;
}

/* =========================
   BOOTSTRAP
========================= */
async function initComicStoryPage() {
  const storyId = getQueryParam('id');

  if (!storyId) {
    renderErrorState('No comic ID was provided.');
    return;
  }

  try {
    setStatus('Loading comic...', '#374151');

    const story = await loadReleasedStory(storyId);

    if (!story) {
      setStatus('');
      renderNotFoundState();
      return;
    }

    const currentUser = await getCurrentUser();

    const ownership = {
      userLoggedIn: !!currentUser,
      hasAccess: currentUser ? await checkStoryOwnership(storyId, currentUser.id) : false
    };

    const [previewPages, products] = await Promise.all([
      loadStoryPreviewPages(storyId, story),
      loadStoryProducts(storyId)
    ]);

    renderComicPage({
      story,
      previewPages,
      products,
      ownership
    });

    setStatus('');
  } catch (err) {
    console.error('Error loading released comic page:', err);
    setStatus(err.message || 'Failed to load comic.', 'red');
    renderErrorState(err.message || 'Failed to load comic.');
  }
}

document.addEventListener('DOMContentLoaded', initComicStoryPage);