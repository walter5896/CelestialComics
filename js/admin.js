// /js/admin.js
import { getCurrentUserAsync, logout } from './auth.js';
import { supabase } from './supabase.js';

const statusEl = document.getElementById('status-message');
const table = document.getElementById('users-table');
const tbody = table?.querySelector('tbody');

const votingSection = document.getElementById('voting-section');
const determineWinnerBtn = document.getElementById('determine-winner-btn');
const closeVotingBtn = document.getElementById('close-voting-btn');
const votingForm = document.getElementById('voting-period-form');
const votingStart = document.getElementById('voting-start');
const votingEnd = document.getElementById('voting-end');
const votingMsg = document.getElementById('voting-status-message');

const currentRoundSummary = document.getElementById('current-round-summary');
const finalizedWinnerSummary = document.getElementById('finalized-winner-summary');

const tieResolutionPanel = document.getElementById('tie-resolution-panel');
const tieResolutionMessage = document.getElementById('tie-resolution-message');
const tieWinnerSelect = document.getElementById('tie-winner-select');
const finalizeTieBtn = document.getElementById('finalize-tie-btn');

const winnerPreviewPanel = document.getElementById('winner-preview-panel');
const winnerPreviewContent = document.getElementById('winner-preview-content');
const winnerPreviewMessage = document.getElementById('winner-preview-message');
const nextRoundFields = document.getElementById('next-round-fields');
const finalizeOnlyBtn = document.getElementById('finalize-only-btn');
const finalizeAndCreateBtn = document.getElementById('finalize-and-create-btn');

const storySection = document.getElementById('story-management-section');
const storySelect = document.getElementById('story-select');
const storyForm = document.getElementById('story-form');
const saveStoryBtn = document.getElementById('save-story-btn');
const resetStoryBtn = document.getElementById('reset-story-btn');
const deleteStoryBtn = document.getElementById('delete-story-btn');
const storyMsg = document.getElementById('story-status-message');
const storiesPreview = document.getElementById('stories-preview');

const storyTitle = document.getElementById('story-title');
const storyAuthor = document.getElementById('story-author');
const storyDescription = document.getElementById('story-description');
const storyActive = document.getElementById('story-active');
const storyStatusSelect = document.getElementById('story-status-select');
const productionStageLabel = document.getElementById('production-stage-label');
const storyPreviewEnabled = document.getElementById('story-preview-enabled');
const storyPreviewPageCount = document.getElementById('story-preview-page-count');
const storyDigitalAvailable = document.getElementById('story-digital-available');
const storyPaperbackAvailable = document.getElementById('story-paperback-available');
const storyBundleAvailable = document.getElementById('story-bundle-available');
const storyReleaseDate = document.getElementById('story-release-date');

const storyCoverFile = document.getElementById('story-cover-file');
const uploadCoverBtn = document.getElementById('upload-cover-btn');
const deleteCoverBtn = document.getElementById('delete-cover-btn');
const coverUploadMessage = document.getElementById('cover-upload-message');
const coverPreview = document.getElementById('cover-preview');

const storyPageForm = document.getElementById('story-page-form');
const storyPageFile = document.getElementById('story-page-file');
const storyPageCaption = document.getElementById('story-page-caption');
const uploadStoryPageBtn = document.getElementById('upload-story-page-btn');
const storyPageStatusMsg = document.getElementById('story-page-status-message');
const storyPagesPreview = document.getElementById('story-pages-preview');

const productSection = document.getElementById('product-management-section');
const productSelect = document.getElementById('product-select');
const productForm = document.getElementById('product-form');
const saveProductBtn = document.getElementById('save-product-btn');
const resetProductBtn = document.getElementById('reset-product-btn');
const deactivateProductBtn = document.getElementById('deactivate-product-btn');
const deleteProductImageBtn = document.getElementById('delete-product-image-btn');
const productStatusMsg = document.getElementById('product-status-message');
const productsPreview = document.getElementById('products-preview');

const productName = document.getElementById('product-name');
const productDescription = document.getElementById('product-description');
const productPriceCents = document.getElementById('product-price-cents');
const productVotesGranted = document.getElementById('product-votes-granted');
const productImageUrl = document.getElementById('product-image-url');
const productImagePreview = document.getElementById('product-image-preview');
const productActive = document.getElementById('product-active');
const productType = document.getElementById('product-type');
const productStoryId = document.getElementById('product-story-id');

const productImageFile = document.getElementById('product-image-file');
const uploadProductImageBtn = document.getElementById('upload-product-image-btn');
const productImageUploadMessage = document.getElementById('product-image-upload-message');

const orderSection = document.getElementById('order-management-section');
const activeOrdersPreview = document.getElementById('active-orders-preview');
const orderHistoryPreview = document.getElementById('order-history-preview');
const ordersStatusMsg = document.getElementById('orders-status-message');

let currentUser = null;
let currentAccessToken = null;
let allStories = [];
let allUsers = [];
let allProducts = [];
let allOrders = [];
let editingStoryId = null;
let editingProductId = null;
let currentWorkingPeriod = null;
let currentTieStories = [];

document.getElementById('logout-link')?.addEventListener('click', async (e) => {
  e.preventDefault();
  await logout();
  window.location.href = '/';
});

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  return data?.session?.access_token || null;
}

async function parseJsonResponseSafely(res) {
  const rawText = await res.text();
  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(rawText || 'Server returned an invalid response.');
  }
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatForDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function updatePreviewImage(imgEl, url) {
  if (!imgEl) return;

  const safeUrl = String(url || '').trim();

  if (!safeUrl) {
    imgEl.src = '';
    imgEl.style.display = 'none';
    return;
  }

  imgEl.src = safeUrl;
  imgEl.style.display = 'block';

  imgEl.onerror = () => {
    imgEl.src = '';
    imgEl.style.display = 'none';
  };
}

function formatCurrencyFromCents(value) {
  const cents = Number(value);
  if (!Number.isFinite(cents)) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function getStatusBadgeClass(status) {
  const safeStatus = String(status || '').toLowerCase();
  return `status-badge ${safeStatus}`;
}

function prettyOrderStatus(status) {
  switch (status) {
    case 'pending': return 'Pending';
    case 'paid': return 'Paid';
    case 'processing': return 'Processing';
    case 'fulfilled': return 'Fulfilled';
    case 'canceled': return 'Canceled';
    case 'failed': return 'Failed';
    default: return status || 'Unknown';
  }
}
function isHistoryOrderStatus(status) {
  return ['fulfilled', 'canceled', 'failed'].includes(String(status || '').toLowerCase());
}

function isActiveOrderStatus(status) {
  return ['pending', 'paid', 'processing'].includes(String(status || '').toLowerCase());
}

function hasShippingDetails(order) {
  return !!(
    order?.shipping_name ||
    order?.shipping_line1 ||
    order?.shipping_line2 ||
    order?.shipping_city ||
    order?.shipping_state ||
    order?.shipping_postal_code ||
    order?.shipping_country ||
    order?.shipping_phone
  );
}

function getCustomerDisplay(order) {
  const profileEmail = order?.profiles?.email || null;
  const orderEmail = order?.customer_email || null;
  const email = profileEmail || orderEmail || 'Unknown email';

  const profileUsername = order?.profiles?.username || null;
  const customerName = order?.customer_name || null;
  const name = profileUsername || customerName || 'No name available';

  return { email, name };
}

function renderShippingBlock(order) {
  if (!hasShippingDetails(order)) {
    return '';
  }

  const addressLine1 = order.shipping_line1 || '';
  const addressLine2 = order.shipping_line2 || '';
  const city = order.shipping_city || '';
  const state = order.shipping_state || '';
  const postal = order.shipping_postal_code || '';
  const country = order.shipping_country || '';
  const cityLine = [city, state, postal].filter(Boolean).join(', ');

  return `
    <div class="order-shipping-box">
      <h4>Shipping Details</h4>
      <div class="order-meta"><strong>Name:</strong> ${order.shipping_name || '—'}</div>
      <div class="order-meta"><strong>Line 1:</strong> ${addressLine1 || '—'}</div>
      ${addressLine2 ? `<div class="order-meta"><strong>Line 2:</strong> ${addressLine2}</div>` : ''}
      <div class="order-meta"><strong>City / State / Postal:</strong> ${cityLine || '—'}</div>
      <div class="order-meta"><strong>Country:</strong> ${country || '—'}</div>
      <div class="order-meta"><strong>Phone:</strong> ${order.shipping_phone || '—'}</div>
    </div>
  `;
}

function renderOrderCard(order, { history = false } = {}) {
  const orderId = order.id;
  const { email: customerEmail, name: customerName } = getCustomerDisplay(order);
  const orderItems = Array.isArray(order.order_items) ? order.order_items : [];
  const noteValue = order.fulfillment_notes || '';
  const historyClass = history ? 'history-card' : '';

  const itemsHtml = orderItems.length
    ? `
      <ul class="order-items-list">
        ${orderItems.map((item) => {
          const product = item.products || {};
          const storyTitle = product.stories?.title || '';
          return `
            <li>
              <strong>${product.name || 'Unnamed product'}</strong>
              <div class="order-meta"><strong>Type:</strong> ${prettyProductType(product.product_type || 'merch')}</div>
              <div class="order-meta"><strong>Quantity:</strong> ${item.quantity ?? 1}</div>
              <div class="order-meta"><strong>Unit Price:</strong> ${formatCurrencyFromCents(item.unit_price_cents)}</div>
              ${storyTitle ? `<div class="order-meta"><strong>Story:</strong> ${storyTitle}</div>` : ''}
            </li>
          `;
        }).join('')}
      </ul>
    `
    : '<p class="order-meta">No order items found.</p>';

  return `
    <article class="order-card ${historyClass}" data-order-id="${orderId}">
      <div class="order-card-header">
        <div class="order-card-header-main">
          <span class="${getStatusBadgeClass(order.status)}">${prettyOrderStatus(order.status)}</span>
          <strong>Order</strong>
          <div class="order-id-text">${orderId}</div>
        </div>
      </div>

      <div class="order-meta"><strong>Customer:</strong> ${customerEmail}</div>
      <div class="order-meta"><strong>Name:</strong> ${customerName}</div>
      <div class="order-meta"><strong>Fulfillment Type:</strong> ${order.fulfillment_type || 'Unknown'}</div>
      <div class="order-meta"><strong>Total:</strong> ${formatCurrencyFromCents(order.total_cents)}</div>
      <div class="order-meta"><strong>Bonus Votes Granted:</strong> ${Number(order.total_votes_granted) || 0}</div>
      <div class="order-meta"><strong>Created:</strong> ${formatDateTime(order.created_at)}</div>
      <div class="order-meta"><strong>Paid:</strong> ${formatDateTime(order.paid_at)}</div>
      <div class="order-meta"><strong>Fulfilled:</strong> ${formatDateTime(order.fulfilled_at)}</div>

      ${itemsHtml}
      ${renderShippingBlock(order)}

      <div class="field-group" style="margin-top:0.75rem;">
        <label for="order-status-${orderId}">Order Status</label>
        <select id="order-status-${orderId}" class="order-status-select" data-order-id="${orderId}">
          <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="paid" ${order.status === 'paid' ? 'selected' : ''}>Paid</option>
          <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Processing</option>
          <option value="fulfilled" ${order.status === 'fulfilled' ? 'selected' : ''}>Fulfilled</option>
          <option value="canceled" ${order.status === 'canceled' ? 'selected' : ''}>Canceled</option>
          <option value="failed" ${order.status === 'failed' ? 'selected' : ''}>Failed</option>
        </select>
      </div>

      <div class="order-note-box">
        <label for="order-notes-${orderId}">Fulfillment Notes</label>
        <textarea id="order-notes-${orderId}" class="order-notes-input" data-order-id="${orderId}" placeholder="Add packing / fulfillment notes...">${noteValue}</textarea>
      </div>

      <div class="action-row">
        <button type="button" class="save-order-btn" data-order-id="${orderId}">
          Save Order Update
        </button>
      </div>
    </article>
  `;
}


function isEffectivelyClosed(period) {
  if (!period) return false;
  if (period.finalized_at) return true;
  if (period.closed_at) return true;

  const now = new Date();
  const end = new Date(period.end_time);

  return now > end;
}

function deriveRoundStatus(period) {
  if (!period) return 'none';
  if (period.finalized_at) return 'finalized';
  if (period.closed_at) return 'closed';

  const now = new Date();
  const start = new Date(period.start_time);
  const end = new Date(period.end_time);

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'open';
  return 'closed';
}

function prettyStoryStatus(status) {
  switch (status) {
    case 'concept_bank': return 'Concept Bank';
    case 'active_vote': return 'Active Vote';
    case 'winner_in_production': return 'Winner in Production';
    case 'released': return 'Released';
    default: return status || 'Unknown';
  }
}

function prettyProductType(type) {
  switch (type) {
    case 'digital_comic': return 'Digital Comic';
    case 'paperback': return 'Paperback';
    case 'bundle': return 'Bundle';
    case 'merch': return 'Merch';
    default: return type || 'Unknown';
  }
}

function isComicProductType(type) {
  return ['digital_comic', 'paperback', 'bundle'].includes(type);
}

function syncProductFormRules() {
  const selectedType = productType?.value || 'merch';
  const comicProduct = isComicProductType(selectedType);

  if (productStoryId) {
    productStoryId.disabled = !comicProduct;
    if (!comicProduct) {
      productStoryId.value = '';
    }
  }

  if (productVotesGranted) {
    if (comicProduct) {
      productVotesGranted.value = '0';
      productVotesGranted.disabled = true;
    } else {
      productVotesGranted.disabled = false;
    }
  }
}

function populateReleasedStoryOptions() {
  if (!productStoryId) return;

  const releasedStories = allStories.filter(
    (story) => story.story_status === 'released' && story.active
  );

  const currentValue = productStoryId.value;

  productStoryId.innerHTML = '<option value="">-- No Linked Story --</option>';

  releasedStories.forEach((story) => {
    const option = document.createElement('option');
    option.value = story.id;
    option.textContent = story.title;
    productStoryId.appendChild(option);
  });

  if (currentValue && releasedStories.some((story) => story.id === currentValue)) {
    productStoryId.value = currentValue;
  }
}

function hideWinnerPreviewUI() {
  if (winnerPreviewPanel) winnerPreviewPanel.style.display = 'none';
  if (winnerPreviewContent) winnerPreviewContent.innerHTML = '';

  if (winnerPreviewMessage) {
    winnerPreviewMessage.textContent = '';
    winnerPreviewMessage.style.color = '';
  }

  if (nextRoundFields) nextRoundFields.style.display = 'none';
  if (finalizeOnlyBtn) finalizeOnlyBtn.style.display = 'none';
  if (finalizeAndCreateBtn) finalizeAndCreateBtn.style.display = 'none';
}

function resetTieResolutionUI() {
  currentTieStories = [];

  if (tieResolutionPanel) tieResolutionPanel.style.display = 'none';

  if (tieResolutionMessage) {
    tieResolutionMessage.textContent = '';
    tieResolutionMessage.style.color = '';
  }

  if (tieWinnerSelect) {
    tieWinnerSelect.innerHTML = '<option value="">-- Select a Winner --</option>';
  }

  if (finalizeTieBtn) {
    finalizeTieBtn.disabled = false;
    finalizeTieBtn.textContent = 'Finalize Tie Winner';
  }
}

function renderTieResolutionUI(result) {
  if (!tieResolutionPanel || !tieWinnerSelect) return;

  currentTieStories = result.tied_stories || [];
  tieWinnerSelect.innerHTML = '<option value="">-- Select a Winner --</option>';

  currentTieStories.forEach((story) => {
    const option = document.createElement('option');
    option.value = story.story_id;
    option.textContent = `${story.title} (${story.total_votes} vote${story.total_votes === 1 ? '' : 's'})`;
    tieWinnerSelect.appendChild(option);
  });

  if (tieResolutionMessage) {
    tieResolutionMessage.textContent = `Tie detected in round ${result.period_id}. Choose one of the tied stories to finalize as winner.`;
    tieResolutionMessage.style.color = '#b45309';
  }

  tieResolutionPanel.style.display = 'block';
}

function renderCurrentRoundSummary(period) {
  if (!currentRoundSummary) return;

  if (!period) {
    currentRoundSummary.innerHTML = '<p>No active unfinalized voting period found.</p>';
    return;
  }

  const computedStatus = deriveRoundStatus(period);

  currentRoundSummary.innerHTML = `
    <p><strong>Current Round ID:</strong> ${period.id}</p>
    <p><strong>Status:</strong> ${computedStatus}</p>
    <p><strong>Scheduled Start:</strong> ${formatDateTime(period.start_time)}</p>
    <p><strong>Scheduled End:</strong> ${formatDateTime(period.end_time)}</p>
    <p><strong>Closed At:</strong> ${formatDateTime(period.closed_at)}</p>
  `;
}

function renderFinalizedWinnerSummary(period, winnerTitle = null) {
  if (!finalizedWinnerSummary) return;

  if (!period || !period.finalized_at) {
    finalizedWinnerSummary.innerHTML = '<p>No finalized winner yet.</p>';
    return;
  }

  const resolvedWinnerTitle =
    winnerTitle ||
    period.winner_title ||
    (period.winner_id ? 'Unknown' : 'No winner');

  finalizedWinnerSummary.innerHTML = `
    <p><strong>Last Finalized Round:</strong> ${period.id}</p>
    <p><strong>Winner:</strong> ${resolvedWinnerTitle}</p>
    <p><strong>Winning Votes:</strong> ${period.winning_vote_count ?? '—'}</p>
    <p><strong>Scheduled Start:</strong> ${formatDateTime(period.start_time)}</p>
    <p><strong>Scheduled End:</strong> ${formatDateTime(period.end_time)}</p>
    <p><strong>Closed At:</strong> ${formatDateTime(period.closed_at)}</p>
    <p><strong>Finalized At:</strong> ${formatDateTime(period.finalized_at)}</p>
  `;
}

async function loadVotingPeriod() {
  try {
    const { data: currentPeriods, error: currentError } = await supabase
      .from('voting_periods')
      .select(`
        id,
        start_time,
        end_time,
        status,
        closed_at,
        finalized_at,
        winner_id,
        winning_vote_count
      `)
      .is('finalized_at', null)
      .order('id', { ascending: false })
      .limit(1);

    if (currentError) throw currentError;

    currentWorkingPeriod = currentPeriods?.[0] || null;

    if (currentWorkingPeriod) {
      votingStart.value = formatForDateTimeLocal(currentWorkingPeriod.start_time);
      votingEnd.value = formatForDateTimeLocal(currentWorkingPeriod.end_time);
    } else {
      votingStart.value = '';
      votingEnd.value = '';
    }

    renderCurrentRoundSummary(currentWorkingPeriod);

    const { data: finalizedPeriods, error: finalizedError } = await supabase
      .from('voting_periods')
      .select(`
        id,
        start_time,
        end_time,
        status,
        closed_at,
        finalized_at,
        winner_id,
        winning_vote_count
      `)
      .not('finalized_at', 'is', null)
      .order('finalized_at', { ascending: false })
      .limit(1);

    if (finalizedError) throw finalizedError;

    const latestFinalized = finalizedPeriods?.[0] || null;

    if (latestFinalized?.winner_id) {
      const { data: winnerStory } = await supabase
        .from('stories')
        .select('title')
        .eq('id', latestFinalized.winner_id)
        .maybeSingle();

      renderFinalizedWinnerSummary(latestFinalized, winnerStory?.title || null);
    } else {
      renderFinalizedWinnerSummary(latestFinalized, null);
    }

    const currentStatus = deriveRoundStatus(currentWorkingPeriod);

    if (closeVotingBtn) {
      const closeDisabled =
        !currentWorkingPeriod ||
        currentStatus === 'closed' ||
        currentStatus === 'finalized';

      closeVotingBtn.disabled = closeDisabled;

      if (!currentWorkingPeriod) {
        closeVotingBtn.textContent = 'Close Voting Now';
      } else if (currentStatus === 'closed') {
        closeVotingBtn.textContent = 'Voting Already Closed';
      } else if (currentStatus === 'finalized') {
        closeVotingBtn.textContent = 'Round Finalized';
      } else {
        closeVotingBtn.textContent = 'Close Voting Now';
      }
    }

    if (determineWinnerBtn) {
      determineWinnerBtn.disabled =
        !currentWorkingPeriod ||
        !isEffectivelyClosed(currentWorkingPeriod) ||
        !!currentWorkingPeriod.finalized_at;
    }
  } catch (err) {
    console.error('Error loading voting period:', err);
  }
}

async function handleVotingPeriodSubmit(e) {
  e.preventDefault();

  const start_time = votingStart.value;
  const end_time = votingEnd.value;

  try {
    const token = await getAccessToken();
    if (!token) throw new Error('No active session found.');

    const res = await fetch('/.netlify/functions/set-voting-period', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ start_time, end_time })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to update voting period');
    }

    votingMsg.textContent = 'Voting period updated successfully!';
    votingMsg.style.color = 'green';

    resetTieResolutionUI();
    await loadVotingPeriod();
  } catch (err) {
    votingMsg.textContent = `Error: ${err.message}`;
    votingMsg.style.color = 'red';
  }
}

async function handleCloseVoting() {
  try {
    const token = await getAccessToken();
    if (!token) throw new Error('No active session found.');

    const confirmed = confirm('Close voting for the current round now?');
    if (!confirmed) return;

    closeVotingBtn.disabled = true;
    closeVotingBtn.textContent = 'Closing...';

    const res = await fetch('/.netlify/functions/close-voting-period', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to close voting');
    }

    votingMsg.textContent = result.message || 'Voting closed successfully.';
    votingMsg.style.color = 'green';

    resetTieResolutionUI();
    await loadVotingPeriod();
  } catch (err) {
    console.error('Error closing voting:', err);
    votingMsg.textContent = `Error: ${err.message}`;
    votingMsg.style.color = 'red';
  } finally {
    if (closeVotingBtn && !closeVotingBtn.disabled) {
      closeVotingBtn.textContent = 'Close Voting Now';
    }
  }
}

async function determineWinner() {
  try {
    const token = await getAccessToken();
    if (!token) throw new Error('No active session found.');

    resetTieResolutionUI();

    determineWinnerBtn.disabled = true;
    determineWinnerBtn.textContent = 'Determining...';

    const res = await fetch('/.netlify/functions/determine-winner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok) {
      throw new Error(result.error || 'Unknown error');
    }

    if (result.success && result.no_votes) {
      alert(`Voting Period ${result.period_id} was finalized with no winner because no votes were cast.`);

      if (finalizedWinnerSummary) {
        finalizedWinnerSummary.innerHTML = `
          <p><strong>Last Finalized Round:</strong> ${result.period_id}</p>
          <p><strong>Winner:</strong> No winner</p>
          <p><strong>Winning Votes:</strong> —</p>
          <p><strong>Finalized:</strong> just now</p>
        `;
      }

      votingStart.value = '';
      votingEnd.value = '';
      votingMsg.textContent = 'Round finalized with no winner. Enter new dates above to create the next voting period.';
      votingMsg.style.color = 'green';

      await loadVotingPeriod();
      return;
    }

    if (result.success) {
      const totalsText = (result.vote_totals || [])
        .map((item) => `${item.title}: ${item.total_votes}`)
        .join('\n');

      alert(
        `Winner determined!\n\n` +
        `Voting Period: ${result.period_id}\n` +
        `Winner: ${result.winner_title}\n` +
        `Votes: ${result.vote_count}\n\n` +
        `Totals:\n${totalsText}`
      );

      if (finalizedWinnerSummary) {
        finalizedWinnerSummary.innerHTML = `
          <p><strong>Last Finalized Round:</strong> ${result.period_id}</p>
          <p><strong>Winner:</strong> ${result.winner_title}</p>
          <p><strong>Winning Votes:</strong> ${result.vote_count}</p>
          <p><strong>Finalized:</strong> just now</p>
        `;
      }

      votingStart.value = '';
      votingEnd.value = '';
      votingMsg.textContent = result.tie_resolved
        ? 'Tie resolved and winner finalized. Enter new dates above to create the next voting period.'
        : 'Winner finalized. Enter new dates above to create the next voting period.';
      votingMsg.style.color = 'green';

      await loadVotingPeriod();
      return;
    }

    if (result.reason === 'tie_detected') {
      renderTieResolutionUI(result);

      const totalsText = (result.vote_totals || [])
        .map((item) => `${item.title}: ${item.total_votes}`)
        .join('\n');

      alert(
        `Tie detected for Voting Period ${result.period_id}.\n\n` +
        `Totals:\n${totalsText}\n\n` +
        `Use the Tie Resolution panel to choose the winner.`
      );

      votingMsg.textContent = 'Tie detected. Choose one of the tied stories below and finalize manually.';
      votingMsg.style.color = '#b45309';
      return;
    }

    alert(result.message || 'No winner determined.');
  } catch (err) {
    console.error('Error determining winner:', err);
    alert(err.message || 'Failed to determine winner.');
  } finally {
    determineWinnerBtn.disabled = false;
    determineWinnerBtn.textContent = 'Determine Winner';
  }
}

async function handleFinalizeTieWinner() {
  try {
    const selectedWinnerStoryId = tieWinnerSelect?.value || '';

    if (!selectedWinnerStoryId) {
      throw new Error('Please select one of the tied stories.');
    }

    const token = await getAccessToken();
    if (!token) throw new Error('No active session found.');

    finalizeTieBtn.disabled = true;
    finalizeTieBtn.textContent = 'Finalizing...';

    const res = await fetch('/.netlify/functions/determine-winner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        winner_story_id: selectedWinnerStoryId
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to finalize tie winner');
    }

    const totalsText = (result.vote_totals || [])
      .map((item) => `${item.title}: ${item.total_votes}`)
      .join('\n');

    alert(
      `Tie resolved!\n\n` +
      `Voting Period: ${result.period_id}\n` +
      `Winner: ${result.winner_title}\n` +
      `Votes: ${result.vote_count}\n\n` +
      `Totals:\n${totalsText}`
    );

    resetTieResolutionUI();

    votingStart.value = '';
    votingEnd.value = '';
    votingMsg.textContent = 'Tie resolved and winner finalized. Enter new dates above to create the next voting period.';
    votingMsg.style.color = 'green';

    await loadVotingPeriod();
  } catch (err) {
    console.error('Error finalizing tie winner:', err);

    if (tieResolutionMessage) {
      tieResolutionMessage.textContent = err.message || 'Failed to finalize tie winner.';
      tieResolutionMessage.style.color = 'red';
    }

    votingMsg.textContent = `Error: ${err.message}`;
    votingMsg.style.color = 'red';
  } finally {
    if (finalizeTieBtn) {
      finalizeTieBtn.disabled = false;
      finalizeTieBtn.textContent = 'Finalize Tie Winner';
    }
  }
}

function clearStoryPagesUI() {
  if (storyPageFile) storyPageFile.value = '';
  if (storyPageCaption) storyPageCaption.value = '';

  if (storyPageStatusMsg) {
    storyPageStatusMsg.textContent = '';
    storyPageStatusMsg.style.color = '';
  }

  if (storyPagesPreview) {
    storyPagesPreview.innerHTML = '<p>Select a story to manage pages.</p>';
  }
}

function clearStoryForm() {
  editingStoryId = null;

  if (storySelect) storySelect.value = '';
  storyForm?.reset();

  if (storyActive) storyActive.checked = true;
  if (storyStatusSelect) storyStatusSelect.value = 'concept_bank';
  if (productionStageLabel) productionStageLabel.value = '';
  if (storyPreviewEnabled) storyPreviewEnabled.checked = false;
  if (storyPreviewPageCount) storyPreviewPageCount.value = '0';
  if (storyDigitalAvailable) storyDigitalAvailable.checked = false;
  if (storyPaperbackAvailable) storyPaperbackAvailable.checked = false;
  if (storyBundleAvailable) storyBundleAvailable.checked = false;
  if (storyReleaseDate) storyReleaseDate.value = '';

  if (saveStoryBtn) saveStoryBtn.textContent = 'Create Story';
  if (deleteStoryBtn) deleteStoryBtn.style.display = 'none';
  if (deleteCoverBtn) deleteCoverBtn.style.display = 'none';

  if (storyMsg) {
    storyMsg.textContent = '';
    storyMsg.style.color = '';
  }

  if (coverUploadMessage) {
    coverUploadMessage.textContent = '';
    coverUploadMessage.style.color = '';
  }

  if (storyCoverFile) storyCoverFile.value = '';

  updatePreviewImage(coverPreview, '');
  clearStoryPagesUI();
}

async function populateStoryForm(story) {
  editingStoryId = story.id;

  storyTitle.value = story.title || '';
  storyAuthor.value = story.author || '';
  storyDescription.value = story.description || '';
  storyActive.checked = !!story.active;

  storyStatusSelect.value = story.story_status || 'concept_bank';
  productionStageLabel.value = story.production_stage_label || '';
  storyPreviewEnabled.checked = !!story.is_preview_enabled;
  storyPreviewPageCount.value = Number(story.preview_page_count) || 0;
  storyDigitalAvailable.checked = !!story.is_digital_purchase_available;
  storyPaperbackAvailable.checked = !!story.is_paperback_available;
  storyBundleAvailable.checked = !!story.bundle_purchase_available;
  storyReleaseDate.value = formatForDateTimeLocal(story.release_date);

  updatePreviewImage(coverPreview, story.cover_image_url || '');

  coverUploadMessage.textContent = '';
  coverUploadMessage.style.color = '';

  if (storyCoverFile) storyCoverFile.value = '';

  saveStoryBtn.textContent = 'Update Story';
  deleteStoryBtn.style.display = 'inline-block';

  if (deleteCoverBtn) {
    deleteCoverBtn.style.display = story.cover_image_url ? 'inline-block' : 'none';
  }

  storyMsg.textContent = '';
  storyMsg.style.color = '';

  await loadStoryPages(story.id);
}

async function loadStoriesPreview() {
  try {
    const { data: stories, error } = await supabase
      .from('stories')
      .select(`
        id,
        title,
        author,
        description,
        cover_image_url,
        cover_image_path,
        active,
        created_at,
        story_status,
        production_stage_label,
        is_preview_enabled,
        preview_page_count,
        is_digital_purchase_available,
        is_paperback_available,
        bundle_purchase_available,
        release_date
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    allStories = stories || [];
    storiesPreview.innerHTML = '';
    storySelect.innerHTML = '<option value="">-- Create New Story --</option>';

    if (!allStories.length) {
      storiesPreview.innerHTML = '<p>No stories yet.</p>';
      populateReleasedStoryOptions();
      return;
    }

    allStories.forEach((story) => {
      const option = document.createElement('option');
      option.value = story.id;
      option.textContent = story.title;
      storySelect.appendChild(option);

      const div = document.createElement('div');
      div.className = 'story-chip';
      div.innerHTML = `
        ${story.cover_image_url ? `<img src="${story.cover_image_url}" alt="${story.title} cover">` : ''}
        <strong>${story.title}</strong>
        <span class="status-badge">${prettyStoryStatus(story.story_status)}</span>
        <div>${story.author || 'No author set'}</div>
        <div><strong>Visible:</strong> ${story.active ? 'Yes' : 'No'}</div>
        <div><strong>Preview:</strong> ${story.is_preview_enabled ? `Enabled (${story.preview_page_count || 0} pages)` : 'Disabled'}</div>
        <div><strong>Digital:</strong> ${story.is_digital_purchase_available ? 'Yes' : 'No'}</div>
        <div><strong>Paperback:</strong> ${story.is_paperback_available ? 'Yes' : 'No'}</div>
        <div><strong>Bundle:</strong> ${story.bundle_purchase_available ? 'Yes' : 'No'}</div>
        <div><strong>Stage:</strong> ${story.production_stage_label || '—'}</div>
      `;
      storiesPreview.appendChild(div);
    });

    populateReleasedStoryOptions();
  } catch (err) {
    console.error('Error loading stories preview:', err);
    storiesPreview.innerHTML = '<p>Failed to load stories.</p>';
  }
}

async function loadStoryPages(storyId) {
  if (!storyId) {
    clearStoryPagesUI();
    return;
  }

  try {
    storyPagesPreview.innerHTML = '<p>Loading story pages...</p>';

    const { data: pages, error } = await supabase
      .from('story_pages')
      .select('id, story_id, page_number, image_url, image_path, caption, created_at, is_preview_page')
      .eq('story_id', storyId)
      .order('page_number', { ascending: true });

    if (error) throw error;

    storyPagesPreview.innerHTML = '';

    if (!pages || pages.length === 0) {
      storyPagesPreview.innerHTML = '<p>No pages uploaded yet for this story.</p>';
      return;
    }

    pages.forEach((page) => {
      const card = document.createElement('div');
      card.className = 'story-page-card';
      card.innerHTML = `
        <img src="${page.image_url || ''}" alt="Story page ${page.page_number}">
        <strong>Page ${page.page_number}</strong>
        <div>${page.caption || 'No caption'}</div>
        <div><strong>Preview Page:</strong> ${page.is_preview_page ? 'Yes' : 'No'}</div>
        <div class="action-row">
          <button
            type="button"
            class="danger-btn delete-story-page-btn"
            data-page-id="${page.id}">
            Delete Page
          </button>
        </div>
      `;
      storyPagesPreview.appendChild(card);
    });

    attachStoryPageDeleteListeners();
  } catch (err) {
    console.error('Error loading story pages:', err);
    storyPagesPreview.innerHTML = '<p>Failed to load story pages.</p>';
  }
}

function renderUsersTable(users) {
  if (!tbody) return;

  tbody.innerHTML = '';

  users.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.email}</td>
      <td class="role-cell">${u.role}</td>
      <td class="round-vote-balance-cell">${u.vote_balance ?? 0}</td>
      <td class="bonus-vote-balance-cell">${u.bonus_vote_balance ?? 0}</td>
      <td>
        <select class="role-select">
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
        <button class="role-update-btn" data-user-id="${u.id}">Update Role</button>
      </td>
      <td>
        <div class="compact-actions">
          <button class="vote-adjust-btn" data-user-id="${u.id}" data-amount="1" data-type="round">+1 Round</button>
          <button class="vote-adjust-btn danger-btn" data-user-id="${u.id}" data-amount="-1" data-type="round">-1 Round</button>
          <button class="vote-adjust-btn" data-user-id="${u.id}" data-amount="1" data-type="bonus">+1 Bonus</button>
          <button class="vote-adjust-btn danger-btn" data-user-id="${u.id}" data-amount="-1" data-type="bonus">-1 Bonus</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  attachUserTableListeners();
}

function attachUserTableListeners() {
  tbody.querySelectorAll('.role-update-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const userId = button.dataset.userId;
      const row = button.closest('tr');
      const select = row.querySelector('.role-select');
      const newRole = select.value;

      try {
        button.disabled = true;
        button.textContent = 'Updating...';

        const res = await fetch('/.netlify/functions/update-user-role', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {})
          },
          body: JSON.stringify({
            userId,
            role: newRole,
            requesterId: currentUser.id
          })
        });

        const result = await parseJsonResponseSafely(res);

        if (result.success) {
          row.querySelector('.role-cell').textContent = newRole;
          button.textContent = 'Updated!';
          setTimeout(() => {
            button.textContent = 'Update Role';
          }, 800);
        } else {
          alert(`Error: ${result.error}`);
          button.textContent = 'Update Role';
        }
      } catch (err) {
        console.error(err);
        alert('Error updating role.');
        button.textContent = 'Update Role';
      } finally {
        button.disabled = false;
      }
    });
  });

  tbody.querySelectorAll('.vote-adjust-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const userId = button.dataset.userId;
      const amount = Number(button.dataset.amount);
      const type = String(button.dataset.type || 'round');
      const row = button.closest('tr');
      const roundBalanceCell = row.querySelector('.round-vote-balance-cell');
      const bonusBalanceCell = row.querySelector('.bonus-vote-balance-cell');

      const originalText =
        type === 'bonus'
          ? (amount > 0 ? '+1 Bonus' : '-1 Bonus')
          : (amount > 0 ? '+1 Round' : '-1 Round');

      try {
        button.disabled = true;
        button.textContent = 'Working...';

        const res = await fetch('/.netlify/functions/update-user-votes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {})
          },
          body: JSON.stringify({
            targetUserId: userId,
            amount,
            type
          })
        });

        const result = await parseJsonResponseSafely(res);

        if (!res.ok || !result.success) {
          throw new Error(result.error || 'Failed to update vote balance');
        }

        if (roundBalanceCell) {
          roundBalanceCell.textContent = result.user.vote_balance ?? 0;
        }

        if (bonusBalanceCell) {
          bonusBalanceCell.textContent = result.user.bonus_vote_balance ?? 0;
        }

        button.textContent = amount > 0 ? '+1 Added' : '-1 Removed';

        setTimeout(() => {
          button.textContent = originalText;
        }, 800);
      } catch (err) {
        console.error(err);
        alert(err.message || 'Error updating vote balance.');
        button.textContent = originalText;
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function handleCoverUpload() {
  try {
    coverUploadMessage.textContent = '';
    coverUploadMessage.style.color = '';

    if (!editingStoryId) {
      throw new Error('Create or select a story before uploading a cover image.');
    }

    const file = storyCoverFile.files?.[0];
    if (!file) {
      throw new Error('Please choose an image file first.');
    }

    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    uploadCoverBtn.disabled = true;
    uploadCoverBtn.textContent = 'Uploading...';

    const file_base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        try {
          const result = String(reader.result || '');
          resolve(result.split(',')[1]);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const res = await fetch('/.netlify/functions/upload-story-cover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        story_id: editingStoryId,
        file_name: file.name,
        file_type: file.type,
        file_base64
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to upload cover image');
    }

    coverUploadMessage.textContent = 'Cover image uploaded successfully!';
    coverUploadMessage.style.color = 'green';

    if (result.cover_image_url) {
      updatePreviewImage(coverPreview, result.cover_image_url);
    }

    if (deleteCoverBtn) {
      deleteCoverBtn.style.display = 'inline-block';
    }

    storyCoverFile.value = '';
    await loadStoriesPreview();

    const refreshedStory = allStories.find((story) => String(story.id) === String(editingStoryId));
    if (refreshedStory) {
      await populateStoryForm(refreshedStory);
      if (storySelect) storySelect.value = editingStoryId;
    }
  } catch (err) {
    console.error('Error uploading cover image:', err);
    coverUploadMessage.textContent = err.message || 'Failed to upload cover image.';
    coverUploadMessage.style.color = 'red';
  } finally {
    uploadCoverBtn.disabled = false;
    uploadCoverBtn.textContent = 'Upload Cover Image';
  }
}

async function handleDeleteCoverImage() {
  try {
    if (!editingStoryId) {
      throw new Error('Select a story first.');
    }

    const confirmed = confirm('Delete this cover image?');
    if (!confirmed) return;

    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    deleteCoverBtn.disabled = true;
    deleteCoverBtn.textContent = 'Deleting...';

    const res = await fetch('/.netlify/functions/delete-story-cover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        story_id: editingStoryId
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to delete cover image');
    }

    coverUploadMessage.textContent = 'Cover image deleted successfully.';
    coverUploadMessage.style.color = 'green';

    updatePreviewImage(coverPreview, '');
    if (storyCoverFile) storyCoverFile.value = '';

    await loadStoriesPreview();

    const refreshedStory = allStories.find((story) => String(story.id) === String(editingStoryId));
    if (refreshedStory) {
      await populateStoryForm(refreshedStory);
      if (storySelect) storySelect.value = editingStoryId;
    } else {
      clearStoryForm();
    }
  } catch (err) {
    console.error('Error deleting cover image:', err);
    coverUploadMessage.textContent = err.message || 'Failed to delete cover image.';
    coverUploadMessage.style.color = 'red';
  } finally {
    deleteCoverBtn.disabled = false;
    deleteCoverBtn.textContent = 'Delete Cover Image';
  }
}

async function handleStoryPageUpload(e) {
  e.preventDefault();

  try {
    storyPageStatusMsg.textContent = '';
    storyPageStatusMsg.style.color = '';

    if (!editingStoryId) {
      throw new Error('Select or create a story before uploading pages.');
    }

    const file = storyPageFile.files?.[0];
    if (!file) {
      throw new Error('Please choose a page image first.');
    }

    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    uploadStoryPageBtn.disabled = true;
    uploadStoryPageBtn.textContent = 'Uploading Page...';

    const file_base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        try {
          const result = String(reader.result || '');
          resolve(result.split(',')[1]);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const res = await fetch('/.netlify/functions/upload-story-page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        story_id: editingStoryId,
        file_name: file.name,
        file_type: file.type,
        file_base64,
        caption: storyPageCaption.value.trim() || null
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to upload story page');
    }

    storyPageStatusMsg.textContent = 'Story page uploaded successfully!';
    storyPageStatusMsg.style.color = 'green';

    storyPageFile.value = '';
    storyPageCaption.value = '';

    await loadStoryPages(editingStoryId);
  } catch (err) {
    console.error('Error uploading story page:', err);
    storyPageStatusMsg.textContent = err.message || 'Failed to upload story page.';
    storyPageStatusMsg.style.color = 'red';
  } finally {
    uploadStoryPageBtn.disabled = false;
    uploadStoryPageBtn.textContent = 'Upload Story Page';
  }
}

function attachStoryPageDeleteListeners() {
  document.querySelectorAll('.delete-story-page-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const pageId = button.dataset.pageId;
      if (!pageId) return;

      const confirmed = confirm('Are you sure you want to delete this story page?');
      if (!confirmed) return;

      try {
        const token = await getAccessToken();
        if (!token) throw new Error('No active session found.');

        button.disabled = true;
        button.textContent = 'Deleting...';

        const res = await fetch('/.netlify/functions/delete-story-page', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ page_id: pageId })
        });

        const result = await parseJsonResponseSafely(res);

        if (!res.ok || !result.success) {
          throw new Error(result.error || 'Failed to delete story page');
        }

        await loadStoryPages(editingStoryId);
      } catch (err) {
        console.error('Error deleting story page:', err);
        alert(err.message || 'Failed to delete story page.');
        button.disabled = false;
        button.textContent = 'Delete Page';
      }
    });
  });
}

async function handleDeleteStory() {
  if (!editingStoryId) return;

  const confirmed = confirm('Are you sure you want to delete this story? This will also delete its story pages and cover image.');
  if (!confirmed) return;

  try {
    const token = await getAccessToken();
    if (!token) throw new Error('No active session found.');

    deleteStoryBtn.disabled = true;
    deleteStoryBtn.textContent = 'Deleting...';

    const res = await fetch('/.netlify/functions/delete-story', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ story_id: editingStoryId })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to delete story');
    }

    storyMsg.textContent = 'Story deleted successfully!';
    storyMsg.style.color = 'green';

    clearStoryForm();
    await loadStoriesPreview();
  } catch (err) {
    console.error('Error deleting story:', err);
    storyMsg.textContent = err.message || 'Failed to delete story.';
    storyMsg.style.color = 'red';
  } finally {
    deleteStoryBtn.disabled = false;
    deleteStoryBtn.textContent = 'Delete Story';
  }
}

async function handleStorySubmit(e) {
  e.preventDefault();

  storyMsg.textContent = '';
  saveStoryBtn.disabled = true;
  saveStoryBtn.textContent = editingStoryId ? 'Updating...' : 'Creating...';

  try {
    const title = storyTitle.value.trim();
    const author = storyAuthor.value.trim();
    const description = storyDescription.value.trim();
    const active = storyActive.checked;

    const story_status = storyStatusSelect.value;
    const production_stage_label = productionStageLabel.value.trim() || null;
    const is_preview_enabled = storyPreviewEnabled.checked;
    const preview_page_count = Number(storyPreviewPageCount.value || 0);
    const is_digital_purchase_available = storyDigitalAvailable.checked;
    const is_paperback_available = storyPaperbackAvailable.checked;
    const bundle_purchase_available = storyBundleAvailable.checked;
    const release_date = storyReleaseDate.value ? new Date(storyReleaseDate.value).toISOString() : null;

    if (!title) {
      throw new Error('Title is required.');
    }

    if (!['concept_bank', 'active_vote', 'winner_in_production', 'released'].includes(story_status)) {
      throw new Error('Invalid story lifecycle status.');
    }

    if (!Number.isInteger(preview_page_count) || preview_page_count < 0) {
      throw new Error('Preview page count must be 0 or greater.');
    }

    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    const selectedStory = allStories.find((story) => story.id === editingStoryId);
    const cover_image_url = selectedStory?.cover_image_url || null;

    let res;

    if (editingStoryId) {
      res = await fetch('/.netlify/functions/update-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          story_id: editingStoryId,
          title,
          author,
          cover_image_url,
          description,
          active,
          story_status,
          production_stage_label,
          is_preview_enabled,
          preview_page_count,
          is_digital_purchase_available,
          is_paperback_available,
          bundle_purchase_available,
          release_date
        })
      });
    } else {
      res = await fetch('/.netlify/functions/create-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          author,
          cover_image_url,
          description,
          active,
          story_status,
          production_stage_label,
          is_preview_enabled,
          preview_page_count,
          is_digital_purchase_available,
          is_paperback_available,
          bundle_purchase_available,
          release_date
        })
      });
    }

    const result = await parseJsonResponseSafely(res);

    if (!res.ok) {
      throw new Error(result.error || (editingStoryId ? 'Failed to update story' : 'Failed to create story'));
    }

    const wasEditing = !!editingStoryId;
    const returnedStoryId = result.story?.id || null;

    storyMsg.textContent = wasEditing
      ? 'Story updated successfully!'
      : 'Story created successfully!';
    storyMsg.style.color = 'green';

    clearStoryForm();
    await loadStoriesPreview();

    if (!wasEditing && returnedStoryId) {
      editingStoryId = returnedStoryId;
      storySelect.value = returnedStoryId;

      const createdStory = allStories.find((story) => story.id === returnedStoryId);
      if (createdStory) await populateStoryForm(createdStory);
    }
  } catch (err) {
    console.error('Error saving story:', err);
    storyMsg.textContent = err.message || 'Failed to save story.';
    storyMsg.style.color = 'red';
  } finally {
    saveStoryBtn.disabled = false;
    saveStoryBtn.textContent = editingStoryId ? 'Update Story' : 'Create Story';
  }
}

async function handleStorySelectChange() {
  const selectedId = storySelect.value;

  if (!selectedId) {
    clearStoryForm();
    return;
  }

  const selectedStory = allStories.find((story) => story.id === selectedId);
  if (selectedStory) {
    await populateStoryForm(selectedStory);
  }
}

function clearProductForm() {
  editingProductId = null;

  if (productSelect) productSelect.value = '';
  productForm?.reset();

  if (productActive) productActive.checked = true;
  if (productVotesGranted) productVotesGranted.value = '0';
  if (productType) productType.value = 'merch';
  if (productStoryId) productStoryId.value = '';

  if (saveProductBtn) {
    saveProductBtn.disabled = false;
    saveProductBtn.textContent = 'Create Product';
  }

  if (deactivateProductBtn) {
    deactivateProductBtn.style.display = 'none';
  }

  if (deleteProductImageBtn) {
    deleteProductImageBtn.style.display = 'none';
  }

  if (productStatusMsg) {
    productStatusMsg.textContent = '';
    productStatusMsg.style.color = '';
  }

  if (productImageUploadMessage) {
    productImageUploadMessage.textContent = '';
    productImageUploadMessage.style.color = '';
  }

  if (productImageFile) {
    productImageFile.value = '';
  }

  updatePreviewImage(productImagePreview, '');
  syncProductFormRules();
}

function populateProductForm(product) {
  editingProductId = product.id;

  productName.value = product.name || '';
  productDescription.value = product.description || '';
  productPriceCents.value = Number.isInteger(product.price_cents) ? product.price_cents : '';
  productVotesGranted.value = Number(product.votes_granted) || 0;
  productImageUrl.value = product.image_url || '';
  productActive.checked = !!product.active;

  if (productType) {
    productType.value = product.product_type || 'merch';
  }

  populateReleasedStoryOptions();

  if (productStoryId) {
    productStoryId.value = product.story_id || '';
  }

  updatePreviewImage(productImagePreview, product.image_url || '');

  if (productStatusMsg) {
    productStatusMsg.textContent = 'Editing existing product.';
    productStatusMsg.style.color = '#2563eb';
  }

  if (productImageUploadMessage) {
    productImageUploadMessage.textContent = '';
    productImageUploadMessage.style.color = '';
  }

  if (productImageFile) {
    productImageFile.value = '';
  }

  if (saveProductBtn) {
    saveProductBtn.disabled = false;
    saveProductBtn.textContent = 'Update Product';
  }

  if (deactivateProductBtn) {
    deactivateProductBtn.style.display = 'inline-block';
  }

  if (deleteProductImageBtn) {
    deleteProductImageBtn.style.display = product.image_url ? 'inline-block' : 'none';
  }

  syncProductFormRules();
}

function renderProductsPreview(products) {
  if (!productsPreview) return;

  productsPreview.innerHTML = '';

  if (!products || products.length === 0) {
    productsPreview.innerHTML = '<p>No products yet.</p>';
    return;
  }

  products.forEach((product) => {
    const card = document.createElement('div');
    card.className = 'product-card';

    const priceText = Number.isInteger(product.price_cents)
      ? `$${(product.price_cents / 100).toFixed(2)}`
      : 'Price unavailable';

    const linkedStoryTitle = product.stories?.title || 'No linked story';

    card.innerHTML = `
      ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}">` : ''}
      <strong>${product.name}</strong>
      <div class="product-meta"><strong>Type:</strong> ${prettyProductType(product.product_type)}</div>
      <div class="product-meta"><strong>Story:</strong> ${product.story_id ? linkedStoryTitle : 'None'}</div>
      <div class="product-meta">${product.description || 'No description set.'}</div>
      <div class="product-meta"><strong>Price:</strong> ${priceText}</div>
      <div class="product-meta"><strong>Bonus Votes:</strong> ${product.votes_granted ?? 0}</div>
      <div class="product-meta"><strong>Status:</strong> ${product.active ? 'Active' : 'Inactive'}</div>
    `;

    productsPreview.appendChild(card);
  });
}

async function loadProductsPreview() {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id,
        name,
        description,
        price_cents,
        stripe_product_id,
        stripe_price_id,
        image_url,
        image_path,
        active,
        votes_granted,
        product_type,
        story_id,
        created_at,
        updated_at,
        stories (
          id,
          title
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    allProducts = products || [];

    if (productSelect) {
      productSelect.innerHTML = '<option value="">-- Create New Product --</option>';

      allProducts.forEach((product) => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = `${product.name} (${prettyProductType(product.product_type || 'merch')})`;
        productSelect.appendChild(option);
      });
    }

    populateReleasedStoryOptions();
    renderProductsPreview(allProducts);
  } catch (err) {
    console.error('Error loading products preview:', err);
    if (productsPreview) {
      productsPreview.innerHTML = '<p>Failed to load products.</p>';
    }
  }
}

function handleProductSelectChange() {
  const selectedId = productSelect?.value || '';

  if (!selectedId) {
    clearProductForm();
    return;
  }

  const selectedProduct = allProducts.find((product) => String(product.id) === String(selectedId));

  if (selectedProduct) {
    populateProductForm(selectedProduct);
  }
}

function handleProductImageUrlInput() {
  updatePreviewImage(productImagePreview, productImageUrl?.value || '');
}

async function handleProductImageUpload() {
  try {
    if (productImageUploadMessage) {
      productImageUploadMessage.textContent = '';
      productImageUploadMessage.style.color = '';
    }

    if (!editingProductId) {
      throw new Error('Create or select a product before uploading an image.');
    }

    const file = productImageFile?.files?.[0];
    if (!file) {
      throw new Error('Please choose an image file first.');
    }

    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    uploadProductImageBtn.disabled = true;
    uploadProductImageBtn.textContent = 'Uploading...';

    const file_base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        try {
          const result = String(reader.result || '');
          resolve(result.split(',')[1]);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const res = await fetch('/.netlify/functions/upload-product-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        product_id: editingProductId,
        file_name: file.name,
        file_type: file.type,
        file_base64
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to upload product image');
    }

    if (productImageUploadMessage) {
      productImageUploadMessage.textContent = 'Product image uploaded successfully!';
      productImageUploadMessage.style.color = 'green';
    }

    if (result.image_url) {
      productImageUrl.value = result.image_url;
      updatePreviewImage(productImagePreview, result.image_url);
    }

    if (deleteProductImageBtn) {
      deleteProductImageBtn.style.display = 'inline-block';
    }

    productImageFile.value = '';
    await loadProductsPreview();

    const refreshedProduct = allProducts.find((product) => String(product.id) === String(editingProductId));
    if (refreshedProduct) {
      populateProductForm(refreshedProduct);
      if (productSelect) productSelect.value = editingProductId;
    }
  } catch (err) {
    console.error('Error uploading product image:', err);

    if (productImageUploadMessage) {
      productImageUploadMessage.textContent = err.message || 'Failed to upload product image.';
      productImageUploadMessage.style.color = 'red';
    }
  } finally {
    if (uploadProductImageBtn) {
      uploadProductImageBtn.disabled = false;
      uploadProductImageBtn.textContent = 'Upload Product Image';
    }
  }
}

async function handleDeleteProductImage() {
  try {
    if (!editingProductId) {
      throw new Error('Select a product first.');
    }

    const confirmed = confirm('Delete this product image?');
    if (!confirmed) return;

    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    deleteProductImageBtn.disabled = true;
    deleteProductImageBtn.textContent = 'Deleting...';

    const res = await fetch('/.netlify/functions/delete-product-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        product_id: editingProductId
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to delete product image');
    }

    if (productImageUploadMessage) {
      productImageUploadMessage.textContent = 'Product image deleted successfully.';
      productImageUploadMessage.style.color = 'green';
    }

    productImageUrl.value = '';
    updatePreviewImage(productImagePreview, '');
    if (productImageFile) productImageFile.value = '';

    await loadProductsPreview();

    const refreshedProduct = allProducts.find((product) => String(product.id) === String(editingProductId));
    if (refreshedProduct) {
      populateProductForm(refreshedProduct);
      if (productSelect) productSelect.value = editingProductId;
    } else {
      clearProductForm();
    }
  } catch (err) {
    console.error('Error deleting product image:', err);

    if (productImageUploadMessage) {
      productImageUploadMessage.textContent = err.message || 'Failed to delete product image.';
      productImageUploadMessage.style.color = 'red';
    }
  } finally {
    deleteProductImageBtn.disabled = false;
    deleteProductImageBtn.textContent = 'Delete Product Image';
  }
}

async function handleProductSubmit(e) {
  e.preventDefault();

  productStatusMsg.textContent = '';
  productStatusMsg.style.color = '';

  try {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    const name = productName.value.trim();
    const description = productDescription.value.trim();
    const image_url = productImageUrl.value.trim() || null;
    const active = productActive.checked;
    const price_cents = Number(productPriceCents.value);
    const product_type = productType.value;
    const story_id = productStoryId.value || null;
    const votes_granted = Number(productVotesGranted.value);

    if (!name) {
      throw new Error('Product name is required.');
    }

    if (!description) {
      throw new Error('Product description is required.');
    }

    if (!Number.isInteger(price_cents) || price_cents <= 0) {
      throw new Error('Price must be a positive whole number in cents.');
    }

    if (!['merch', 'digital_comic', 'paperback', 'bundle'].includes(product_type)) {
      throw new Error('Invalid product type.');
    }

    if (isComicProductType(product_type) && !story_id) {
      throw new Error('Comic products must be linked to a released story.');
    }

    if (product_type === 'merch' && story_id) {
      throw new Error('Merch products should not be linked to a story.');
    }

    if (!Number.isInteger(votes_granted) || votes_granted < 0) {
      throw new Error('Bonus votes must be 0 or greater.');
    }

    if (isComicProductType(product_type) && votes_granted > 0) {
      throw new Error('Comic products should not grant bonus votes.');
    }

    const isEditing = !!editingProductId;

    saveProductBtn.disabled = true;
    saveProductBtn.textContent = isEditing ? 'Updating...' : 'Creating...';

    const endpoint = isEditing
      ? '/.netlify/functions/update-product'
      : '/.netlify/functions/create-product';

    const payload = isEditing
      ? {
          product_id: editingProductId,
          name,
          description,
          image_url,
          active,
          price_cents,
          votes_granted,
          product_type,
          story_id
        }
      : {
          name,
          description,
          image_url,
          active,
          price_cents,
          votes_granted,
          product_type,
          story_id
        };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || (isEditing ? 'Failed to update product' : 'Failed to create product'));
    }

    productStatusMsg.textContent = isEditing
      ? 'Product updated successfully!'
      : 'Product created successfully!';
    productStatusMsg.style.color = 'green';

    const savedProductId = result.product?.id || editingProductId || null;

    await loadProductsPreview();

    if (savedProductId) {
      const refreshedProduct = allProducts.find((product) => String(product.id) === String(savedProductId));

      if (refreshedProduct) {
        populateProductForm(refreshedProduct);
        if (productSelect) productSelect.value = savedProductId;
      } else {
        clearProductForm();
      }
    } else {
      clearProductForm();
    }
  } catch (err) {
    console.error('Error saving product:', err);
    productStatusMsg.textContent = err.message || 'Failed to save product.';
    productStatusMsg.style.color = 'red';
  } finally {
    if (saveProductBtn) {
      saveProductBtn.disabled = false;
      saveProductBtn.textContent = editingProductId ? 'Update Product' : 'Create Product';
    }
  }
}

async function handleDeactivateProduct() {
  if (!editingProductId) return;

  const confirmed = confirm('Deactivate this product? It will remain in the database but no longer be available for sale.');
  if (!confirmed) return;

  try {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    const existingProduct = allProducts.find((product) => String(product.id) === String(editingProductId));
    if (!existingProduct) {
      throw new Error('Product not found in current admin state.');
    }

    deactivateProductBtn.disabled = true;
    deactivateProductBtn.textContent = 'Deactivating...';

    const res = await fetch('/.netlify/functions/update-product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        product_id: editingProductId,
        name: existingProduct.name,
        description: existingProduct.description,
        image_url: existingProduct.image_url,
        active: false,
        price_cents: existingProduct.price_cents,
        votes_granted: existingProduct.votes_granted,
        product_type: existingProduct.product_type || 'merch',
        story_id: existingProduct.story_id || null
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to deactivate product');
    }

    productStatusMsg.textContent = 'Product deactivated successfully.';
    productStatusMsg.style.color = 'green';

    await loadProductsPreview();

    const refreshedProduct = allProducts.find((product) => String(product.id) === String(editingProductId));
    if (refreshedProduct) {
      populateProductForm(refreshedProduct);
      if (productSelect) productSelect.value = editingProductId;
    } else {
      clearProductForm();
    }
  } catch (err) {
    console.error('Error deactivating product:', err);
    productStatusMsg.textContent = err.message || 'Failed to deactivate product.';
    productStatusMsg.style.color = 'red';
  } finally {
    deactivateProductBtn.disabled = false;
    deactivateProductBtn.textContent = 'Deactivate Product';
  }
}

function renderOrdersPreview(orders) {
  if (!activeOrdersPreview || !orderHistoryPreview) return;

  const safeOrders = Array.isArray(orders) ? orders : [];

  const activeOrders = safeOrders.filter((order) => isActiveOrderStatus(order.status));
  const historyOrders = safeOrders.filter((order) => isHistoryOrderStatus(order.status));

  if (!activeOrders.length) {
    activeOrdersPreview.innerHTML = '<p class="empty-orders-state">No active orders right now.</p>';
  } else {
    activeOrdersPreview.innerHTML = activeOrders
      .map((order) => renderOrderCard(order, { history: false }))
      .join('');
  }

  if (!historyOrders.length) {
    orderHistoryPreview.innerHTML = '<p class="empty-orders-state">No historical orders yet.</p>';
  } else {
    orderHistoryPreview.innerHTML = historyOrders
      .map((order) => renderOrderCard(order, { history: true }))
      .join('');
  }

  attachOrderListeners();
}

async function loadOrdersPreview() {
  try {
    if (activeOrdersPreview) {
      activeOrdersPreview.innerHTML = '<p class="empty-orders-state">Loading active orders...</p>';
    }

    if (orderHistoryPreview) {
      orderHistoryPreview.innerHTML = '<p class="empty-orders-state">Loading order history...</p>';
    }

    const res = await fetch('/.netlify/functions/get-orders', {
      method: 'GET',
      headers: {
        ...(currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {})
      }
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to load orders');
    }

    allOrders = result.orders || [];
    renderOrdersPreview(allOrders);

    if (ordersStatusMsg) {
      ordersStatusMsg.textContent = '';
      ordersStatusMsg.style.color = '';
    }
  } catch (err) {
    console.error('Error loading orders:', err);

    if (activeOrdersPreview) {
      activeOrdersPreview.innerHTML = '<p class="empty-orders-state">Failed to load active orders.</p>';
    }

    if (orderHistoryPreview) {
      orderHistoryPreview.innerHTML = '<p class="empty-orders-state">Failed to load order history.</p>';
    }

    if (ordersStatusMsg) {
      ordersStatusMsg.textContent = err.message || 'Failed to load orders.';
      ordersStatusMsg.style.color = 'red';
    }
  }
}

function attachOrderListeners() {
  document.querySelectorAll('.save-order-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const orderId = button.dataset.orderId;
      if (!orderId) return;

      const statusSelect = document.querySelector(`.order-status-select[data-order-id="${orderId}"]`);
      const notesInput = document.querySelector(`.order-notes-input[data-order-id="${orderId}"]`);

      const nextStatus = statusSelect?.value || '';
      const fulfillmentNotes = notesInput?.value || '';
      const originalText = button.textContent;

      try {
        button.disabled = true;
        button.textContent = 'Saving...';

        const res = await fetch('/.netlify/functions/update-order-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {})
          },
          body: JSON.stringify({
            order_id: orderId,
            status: nextStatus,
            fulfillment_notes: fulfillmentNotes
          })
        });

        const result = await parseJsonResponseSafely(res);

        if (!res.ok || !result.success) {
          throw new Error(result.error || 'Failed to update order');
        }

        if (ordersStatusMsg) {
          ordersStatusMsg.textContent = `Order ${orderId} updated successfully.`;
          ordersStatusMsg.style.color = 'green';
        }

        await loadOrdersPreview();
      } catch (err) {
        console.error('Error updating order:', err);

        if (ordersStatusMsg) {
          ordersStatusMsg.textContent = err.message || 'Failed to update order.';
          ordersStatusMsg.style.color = 'red';
        }
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
}

export async function initAdminPanel() {
  currentUser = await getCurrentUserAsync();

  if (!currentUser) {
    statusEl.textContent = 'Not logged in.';
    return;
  }

  currentAccessToken = await getAccessToken();

  let users = [];

  try {
    const headers = currentAccessToken
      ? { Authorization: `Bearer ${currentAccessToken}` }
      : {};

    const res = await fetch('/.netlify/functions/get-users', { headers });
    users = await parseJsonResponseSafely(res);

    if (!res.ok) {
      throw new Error(users.error || 'Failed to load users');
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Error loading users.';
    return;
  }

  const profile = users.find((u) => u.id === currentUser.id);

  if (!profile || profile.role !== 'admin') {
    statusEl.textContent = 'Access denied: Admins only.';
    return;
  }

  statusEl.style.display = 'none';
  table.style.display = 'table';

  if (votingSection) votingSection.style.display = 'block';
  if (storySection) storySection.style.display = 'block';
  if (productSection) productSection.style.display = 'block';
  if (orderSection) orderSection.style.display = 'block';

  allUsers = users;
  renderUsersTable(users);

  await loadVotingPeriod();
  await loadStoriesPreview();
  await loadProductsPreview();
  await loadOrdersPreview();

  clearStoryPagesUI();
  clearProductForm();
  hideWinnerPreviewUI();
  resetTieResolutionUI();
  syncProductFormRules();

  determineWinnerBtn?.addEventListener('click', determineWinner);
  closeVotingBtn?.addEventListener('click', handleCloseVoting);
  finalizeTieBtn?.addEventListener('click', handleFinalizeTieWinner);
  votingForm?.addEventListener('submit', handleVotingPeriodSubmit);

  storySelect?.addEventListener('change', handleStorySelectChange);
  resetStoryBtn?.addEventListener('click', clearStoryForm);
  uploadCoverBtn?.addEventListener('click', handleCoverUpload);
  deleteCoverBtn?.addEventListener('click', handleDeleteCoverImage);
  deleteStoryBtn?.addEventListener('click', handleDeleteStory);
  storyForm?.addEventListener('submit', handleStorySubmit);
  storyPageForm?.addEventListener('submit', handleStoryPageUpload);

  productSelect?.addEventListener('change', handleProductSelectChange);
  productType?.addEventListener('change', syncProductFormRules);
  resetProductBtn?.addEventListener('click', clearProductForm);
  deactivateProductBtn?.addEventListener('click', handleDeactivateProduct);
  uploadProductImageBtn?.addEventListener('click', handleProductImageUpload);
  deleteProductImageBtn?.addEventListener('click', handleDeleteProductImage);
  productImageUrl?.addEventListener('input', handleProductImageUrlInput);
  productForm?.addEventListener('submit', handleProductSubmit);
}

document.addEventListener('DOMContentLoaded', initAdminPanel);