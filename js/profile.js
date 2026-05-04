// /js/profile.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';
import {
  getState,
  subscribe,
  setVoteBalances as setSharedVoteBalances,
  setOwnedStoryAccess
} from './state.js';
import {
  recantVote,
  fetchSavedStories,
  renderStoriesForProfile,
  attachUnsaveListeners
} from './vote.js';

const voteList = document.getElementById('vote-list');
const noVotes = document.getElementById('no-votes');
const savedContainer = document.getElementById('my-saved-stories-container');
const noSaved = document.getElementById('no-saved-stories');

const roundVoteBalanceEl = document.getElementById('round-vote-balance');
const bonusVoteBalanceEl = document.getElementById('bonus-vote-balance');
const totalVoteBalanceEl = document.getElementById('total-vote-balance');

const ownedContainer = document.getElementById('owned-stories-container');
const noOwned = document.getElementById('no-owned-stories');

const physicalPurchasesContainer = document.getElementById('physical-purchases-container');
const noPhysicalPurchases = document.getElementById('no-physical-purchases');

if (
  !voteList ||
  !noVotes ||
  !savedContainer ||
  !noSaved ||
  !roundVoteBalanceEl ||
  !bonusVoteBalanceEl ||
  !totalVoteBalanceEl
) {
  throw new Error('Profile page missing required elements');
}

/* =======================
   HELPERS
======================= */

function setDisplay(el, value) {
  if (el) el.style.display = value;
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

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString();
}

function getStoryImage(story) {
  return story?.cover_image_url || story?.image_url || '';
}

function getProductImage(product) {
  return product?.image_url || '';
}

function formatAccessType(accessType) {
  switch (accessType) {
    case 'bundle':
      return 'Bundle Access';
    case 'digital':
      return 'Digital Access';
    default:
      return 'Owned';
  }
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

function prettyOrderStatus(status) {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'processing':
      return 'Processing';
    case 'fulfilled':
      return 'Fulfilled';
    case 'pending':
      return 'Pending';
    case 'canceled':
      return 'Canceled';
    case 'failed':
      return 'Failed';
    default:
      return status ? String(status) : 'Order';
  }
}

function isPhysicalProductType(type) {
  return ['merch', 'paperback', 'bundle'].includes(String(type || ''));
}

function formatGrantedDate(value) {
  return formatDate(value);
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

function renderVoteBalancesFromState() {
  const { voteBalance = 0, bonusVoteBalance = 0 } = getState();
  const safeRoundVotes = Number(voteBalance) || 0;
  const safeBonusVotes = Number(bonusVoteBalance) || 0;
  const totalVotes = safeRoundVotes + safeBonusVotes;

  roundVoteBalanceEl.textContent = String(safeRoundVotes);
  bonusVoteBalanceEl.textContent = String(safeBonusVotes);
  totalVoteBalanceEl.textContent = String(totalVotes);
}

function renderLoggedOutVotes() {
  voteList.innerHTML = '';
  setDisplay(noVotes, 'block');
}

function renderLoggedOutSavedStories() {
  savedContainer.innerHTML = '';
  setDisplay(savedContainer, 'none');
  setDisplay(noSaved, 'block');
}

function renderLoggedOutOwnedStories() {
  if (!ownedContainer || !noOwned) return;

  ownedContainer.innerHTML = '';
  setDisplay(ownedContainer, 'none');
  setDisplay(noOwned, 'block');
}

function renderLoggedOutPhysicalPurchases() {
  if (!physicalPurchasesContainer || !noPhysicalPurchases) return;

  physicalPurchasesContainer.innerHTML = '';
  setDisplay(physicalPurchasesContainer, 'none');
  setDisplay(noPhysicalPurchases, 'block');
}

/* =======================
   STATE SYNC
======================= */

async function syncVoteBalancesToState() {
  const user = await getCurrentUserAsync();

  if (!user) {
    setSharedVoteBalances({
      voteBalance: 0,
      bonusVoteBalance: 0
    });
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('vote_balance, bonus_vote_balance')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching vote balances:', error);
    setSharedVoteBalances({
      voteBalance: 0,
      bonusVoteBalance: 0
    });
    return;
  }

  setSharedVoteBalances({
    voteBalance: data?.vote_balance ?? 0,
    bonusVoteBalance: data?.bonus_vote_balance ?? 0
  });
}

async function fetchCurrentVotingPeriod() {
  const { data, error } = await supabase
    .from('voting_periods')
    .select('id, start_time, end_time, closed_at, finalized_at')
    .is('finalized_at', null)
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching current voting period:', error);
    return null;
  }

  return data?.[0] || null;
}

function isOpenVotingPeriod(period) {
  if (!period) return false;
  if (period.finalized_at) return false;
  if (period.closed_at) return false;

  const now = new Date();
  const start = new Date(period.start_time);
  const end = new Date(period.end_time);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }

  return now >= start && now <= end;
}

/* =======================
   CURRENT-ROUND VOTES ONLY
======================= */

async function fetchCurrentRoundVotes() {
  const user = await getCurrentUserAsync();
  if (!user) return [];

  const currentPeriod = await fetchCurrentVotingPeriod();
  if (!currentPeriod?.id) return [];

  const { data, error } = await supabase
    .from('votes')
    .select(`
      story_id,
      vote_count,
      voting_period_id,
      stories (
        id,
        title,
        image_url,
        cover_image_url,
        author,
        description
      )
    `)
    .eq('user_id', user.id)
    .eq('voting_period_id', currentPeriod.id)
    .order('story_id', { ascending: true });

  if (error) {
    console.error('Error fetching current-round votes:', error);
    return [];
  }

  return (data || []).map((row) => ({
    story_id: row.story_id,
    vote_count: Number(row.vote_count) || 0,
    voting_period_id: row.voting_period_id,
    story: row.stories || null
  }));
}

async function fetchAndRenderVotes() {
  const user = await getCurrentUserAsync();

  if (!user) {
    renderLoggedOutVotes();
    return;
  }

  const currentPeriod = await fetchCurrentVotingPeriod();
  const roundIsOpen = isOpenVotingPeriod(currentPeriod);
  const voteRows = await fetchCurrentRoundVotes();

  if (!voteRows.length) {
    voteList.innerHTML = '';
    setDisplay(noVotes, 'block');
    return;
  }

  setDisplay(noVotes, 'none');
  voteList.innerHTML = '';

  voteRows.forEach((voteRow) => {
    const li = document.createElement('li');

    const title = voteRow.story?.title || `Story #${voteRow.story_id}`;
    const count = Number(voteRow.vote_count) || 0;

    li.innerHTML = `
      <span>${escapeHtml(title)} — You cast ${count} vote(s) this round</span>
      ${
        roundIsOpen
          ? `<button class="recant-btn" data-story-id="${escapeHtml(voteRow.story_id)}">Recant 1 Vote</button>`
          : `<button type="button" disabled>Round Closed</button>`
      }
    `;

    voteList.appendChild(li);
  });
}

/* =======================
   SAVED STORIES
======================= */

async function fetchAndRenderSavedStories() {
  const user = await getCurrentUserAsync();

  if (!user) {
    renderLoggedOutSavedStories();
    return;
  }

  const { success, data } = await fetchSavedStories();

  if (!success || !Array.isArray(data) || data.length === 0) {
    savedContainer.innerHTML = '';
    setDisplay(savedContainer, 'none');
    setDisplay(noSaved, 'block');
    return;
  }

  setDisplay(savedContainer, 'grid');
  setDisplay(noSaved, 'none');

  const storiesWithSavedFlag = data.map((story) => ({
    ...story,
    isSaved: true
  }));

  renderStoriesForProfile([], storiesWithSavedFlag, null, 'my-saved-stories-container');
  attachUnsaveListeners('my-saved-stories-container');
}

/* =======================
   OWNED STORIES
======================= */

function renderOwnedStories(ownedStories) {
  if (!ownedContainer || !noOwned) return;

  if (!Array.isArray(ownedStories) || !ownedStories.length) {
    ownedContainer.innerHTML = '';
    setDisplay(ownedContainer, 'none');
    setDisplay(noOwned, 'block');
    return;
  }

  setDisplay(ownedContainer, 'grid');
  setDisplay(noOwned, 'none');

  ownedContainer.innerHTML = ownedStories
    .map((item) => {
      const story = item.stories || {};
      const safeTitle = escapeHtml(story.title || 'Untitled Comic');
      const safeAuthor = escapeHtml(story.author || 'Author not listed');
      const safeDescription = escapeHtml(
        story.description || 'No description available.'
      );
      const safeImage = escapeHtml(getStoryImage(story));
      const accessLabel = formatAccessType(item.access_type);
      const grantedDate = formatGrantedDate(item.granted_at);
      const safeStoryId = encodeURIComponent(story.id || '');
      const viewComicUrl = `/comics/story.html?id=${safeStoryId}`;
      const readComicUrl = `/gallery/read.html?id=${safeStoryId}&page=1`;

      return `
        <article class="story-card owned-story-card">
          ${
            safeImage
              ? `
                <a href="${readComicUrl}" class="story-card-art-link owned-story-art-link" aria-label="Read ${safeTitle}">
                  <img src="${safeImage}" alt="${safeTitle} cover" class="story-image" loading="lazy" />
                </a>
              `
              : `<div class="story-image-placeholder">No cover available</div>`
          }

          <div class="story-card-content">
            <span class="story-badge">${escapeHtml(accessLabel)}</span>
            <h3>${safeTitle}</h3>
            <p class="story-author">${safeAuthor}</p>
            <p class="story-description">${safeDescription}</p>
            ${
              grantedDate
                ? `<p class="story-meta"><strong>Added:</strong> ${escapeHtml(grantedDate)}</p>`
                : ''
            }

            <div class="story-actions">
              <a href="${viewComicUrl}" class="btn btn-secondary">
                View Comic
              </a>
              <a href="${readComicUrl}" class="btn btn-primary">
                Read Now
              </a>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

async function fetchOwnedStories() {
  const user = await getCurrentUserAsync();

  if (!user) {
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
      granted_at,
      stories (
        id,
        title,
        author,
        description,
        image_url,
        cover_image_url,
        story_status,
        active
      )
    `)
    .eq('user_id', user.id)
    .order('granted_at', { ascending: false });

  if (error) {
    console.error('Error fetching owned stories:', error);
    setOwnedStoryAccess([]);
    return [];
  }

  const safeRows = Array.isArray(data) ? data : [];
  setOwnedStoryAccess(safeRows);

  return safeRows.filter(
    (item) => item.stories && item.stories.story_status === 'released'
  );
}

async function fetchAndRenderOwnedStories() {
  const ownedStories = await fetchOwnedStories();
  renderOwnedStories(ownedStories);
}

/* =======================
   PHYSICAL PURCHASES
======================= */

function renderPhysicalPurchases(purchases) {
  if (!physicalPurchasesContainer || !noPhysicalPurchases) return;

  if (!Array.isArray(purchases) || !purchases.length) {
    physicalPurchasesContainer.innerHTML = '';
    setDisplay(physicalPurchasesContainer, 'none');
    setDisplay(noPhysicalPurchases, 'block');
    return;
  }

  setDisplay(physicalPurchasesContainer, 'grid');
  setDisplay(noPhysicalPurchases, 'none');

  physicalPurchasesContainer.innerHTML = purchases
    .map((item) => {
      const product = item.product || {};
      const order = item.order || {};

      const safeProductId = encodeURIComponent(product.id || item.product_id || '');
      const safeName = escapeHtml(product.name || 'Physical Product');
      const safeDescription = escapeHtml(product.description || 'No description provided.');
      const safeImage = escapeHtml(getProductImage(product));
      const productType = String(product.product_type || item.product_type || 'merch');
      const productTypeLabel = prettyProductType(productType);

      const quantity = Number(item.quantity) || 1;
      const unitPrice = formatPrice(item.unit_price_cents);
      const orderStatus = prettyOrderStatus(order.status);
      const purchaseDate = formatDate(order.paid_at || order.created_at);
      const orderTotal =
        Number.isInteger(Number(order.total_cents))
          ? formatPrice(Number(order.total_cents))
          : '';

      const productUrl = `/shop/product.html?id=${safeProductId}`;

      const shippingParts = [
        order.shipping_city,
        order.shipping_state,
        order.shipping_country
      ]
        .map((part) => String(part || '').trim())
        .filter(Boolean);

      const shippingSummary = shippingParts.length
        ? shippingParts.join(', ')
        : '';

      return `
        <article class="physical-purchase-card">
          <a href="${productUrl}" class="physical-purchase-image-link" aria-label="View ${safeName}">
            ${
              safeImage
                ? `<img src="${safeImage}" alt="${safeName}" class="physical-purchase-image" loading="lazy" />`
                : `<div class="physical-purchase-image physical-purchase-image-placeholder">No image available</div>`
            }
          </a>

          <div class="physical-purchase-body">
            <div class="physical-purchase-badges">
              <span class="physical-purchase-badge ${escapeHtml(productType)}">${escapeHtml(productTypeLabel)}</span>
              <span class="physical-purchase-badge status">${escapeHtml(orderStatus)}</span>
            </div>

            <h3>${safeName}</h3>
            <p class="physical-purchase-description">${safeDescription}</p>

            <dl class="physical-purchase-meta">
              <div>
                <dt>Quantity</dt>
                <dd>${escapeHtml(quantity)}</dd>
              </div>

              <div>
                <dt>Item Price</dt>
                <dd>${escapeHtml(unitPrice)}</dd>
              </div>

              ${
                orderTotal
                  ? `
                    <div>
                      <dt>Order Total</dt>
                      <dd>${escapeHtml(orderTotal)}</dd>
                    </div>
                  `
                  : ''
              }

              ${
                purchaseDate
                  ? `
                    <div>
                      <dt>Purchased</dt>
                      <dd>${escapeHtml(purchaseDate)}</dd>
                    </div>
                  `
                  : ''
              }

              ${
                shippingSummary
                  ? `
                    <div>
                      <dt>Shipping Area</dt>
                      <dd>${escapeHtml(shippingSummary)}</dd>
                    </div>
                  `
                  : ''
              }
            </dl>

            <div class="physical-purchase-actions">
              <a href="${productUrl}" class="btn btn-secondary">View Product</a>
              <a href="${productUrl}" class="btn btn-primary">Buy Again</a>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

async function fetchPhysicalPurchases() {
  const user = await getCurrentUserAsync();

  if (!user) {
    return [];
  }

  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error('No active session found.');
  }

  const res = await fetch('/.netlify/functions/get-my-purchases', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await parseJsonResponseSafely(res);

  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Failed to load physical purchases.');
  }

  return Array.isArray(data.purchases) ? data.purchases : [];
}

async function fetchAndRenderPhysicalPurchases() {
  if (!physicalPurchasesContainer || !noPhysicalPurchases) return;

  const user = await getCurrentUserAsync();

  if (!user) {
    renderLoggedOutPhysicalPurchases();
    return;
  }

  try {
    physicalPurchasesContainer.innerHTML = `
      <div class="profile-empty-state physical-purchases-loading">
        Loading physical purchases...
      </div>
    `;

    setDisplay(physicalPurchasesContainer, 'block');
    setDisplay(noPhysicalPurchases, 'none');

    const purchases = await fetchPhysicalPurchases();
    renderPhysicalPurchases(purchases);
  } catch (err) {
    console.error('Error loading physical purchases:', err);

    physicalPurchasesContainer.innerHTML = `
      <div class="profile-empty-state physical-purchases-error">
        <h3>Could Not Load Physical Purchases</h3>
        <p>${escapeHtml(err.message || 'Physical purchases could not be loaded right now.')}</p>
      </div>
    `;

    setDisplay(physicalPurchasesContainer, 'block');
    setDisplay(noPhysicalPurchases, 'none');
  }
}

/* =======================
   IMAGE CLICK FALLBACK
   Makes saved story images behave like the View Concept button
======================= */

function attachProfileImageClickFallbacks() {
  document.addEventListener('click', (e) => {
    const image = e.target.closest('#my-saved-stories-container .story-card img');
    if (!image) return;

    const card = image.closest('.story-card');
    if (!card) return;

    const viewConceptLink =
      card.querySelector('a.btn-primary[href]') ||
      card.querySelector('a[href*="/comics/story.html"]') ||
      card.querySelector('a[href*="/gallery/story.html"]') ||
      card.querySelector('a[href*="/story.html"]');

    if (!viewConceptLink) return;

    window.location.href = viewConceptLink.href;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;

    const image = e.target.closest?.('#my-saved-stories-container .story-card img');
    if (!image) return;

    e.preventDefault();

    const card = image.closest('.story-card');
    if (!card) return;

    const viewConceptLink =
      card.querySelector('a.btn-primary[href]') ||
      card.querySelector('a[href*="/comics/story.html"]') ||
      card.querySelector('a[href*="/gallery/story.html"]') ||
      card.querySelector('a[href*="/story.html"]');

    if (!viewConceptLink) return;

    window.location.href = viewConceptLink.href;
  });
}

/* =======================
   ORCHESTRATION
======================= */

async function refreshProfilePageData() {
  const user = await getCurrentUserAsync();

  if (!user) {
    setSharedVoteBalances({
      voteBalance: 0,
      bonusVoteBalance: 0
    });
    setOwnedStoryAccess([]);

    renderVoteBalancesFromState();
    renderLoggedOutVotes();
    renderLoggedOutSavedStories();
    renderLoggedOutOwnedStories();
    renderLoggedOutPhysicalPurchases();
    return;
  }

  await syncVoteBalancesToState();
  renderVoteBalancesFromState();

  await Promise.all([
    fetchAndRenderVotes(),
    fetchAndRenderSavedStories(),
    fetchAndRenderOwnedStories(),
    fetchAndRenderPhysicalPurchases()
  ]);
}

/* =======================
   INIT
======================= */

async function initProfile() {
  renderVoteBalancesFromState();

  subscribe(() => {
    renderVoteBalancesFromState();
  });

  attachProfileImageClickFallbacks();

  await refreshProfilePageData();

  window.addEventListener('user-changed', () => {
    refreshProfilePageData();
  });
}

/* =======================
   GLOBAL CLICK HANDLER
======================= */

document.addEventListener('click', async (e) => {
  if (!e.target.matches('.recant-btn')) return;

  const storyId = e.target.dataset.storyId;
  const result = await recantVote(storyId);

  if (result.success) {
    alert('Vote recanted!');
    await syncVoteBalancesToState();
    await fetchAndRenderVotes();
  } else if (result.reason === 'voting_closed') {
    alert('Voting is closed. You can no longer recant votes this round.');
    await fetchAndRenderVotes();
  } else {
    alert('Could not recant vote.');
  }
});

document.addEventListener('DOMContentLoaded', initProfile);