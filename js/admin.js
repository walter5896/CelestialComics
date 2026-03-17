// /js/admin.js

// =========================
// IMPORTS
// =========================
import { getCurrentUserAsync, logout } from './auth.js';
import { supabase } from './supabase.js';

// =========================
// GLOBAL DOM REFERENCES
// =========================
const statusEl = document.getElementById('status-message');
const table = document.getElementById('users-table');
const tbody = table?.querySelector('tbody');

// Voting controls
const votingSection = document.getElementById('voting-section');
const determineWinnerBtn = document.getElementById('determine-winner-btn');
const closeVotingBtn = document.getElementById('close-voting-btn');
const votingForm = document.getElementById('voting-period-form');
const votingStart = document.getElementById('voting-start');
const votingEnd = document.getElementById('voting-end');
const votingMsg = document.getElementById('voting-status-message');

// Voting summary boxes
const currentRoundSummary = document.getElementById('current-round-summary');
const finalizedWinnerSummary = document.getElementById('finalized-winner-summary');

// Tie resolution UI
const tieResolutionPanel = document.getElementById('tie-resolution-panel');
const tieResolutionMessage = document.getElementById('tie-resolution-message');
const tieWinnerSelect = document.getElementById('tie-winner-select');
const finalizeTieBtn = document.getElementById('finalize-tie-btn');

// Legacy / hidden winner preview UI
const winnerPreviewPanel = document.getElementById('winner-preview-panel');
const winnerPreviewContent = document.getElementById('winner-preview-content');
const winnerPreviewMessage = document.getElementById('winner-preview-message');
const nextRoundFields = document.getElementById('next-round-fields');
const finalizeOnlyBtn = document.getElementById('finalize-only-btn');
const finalizeAndCreateBtn = document.getElementById('finalize-and-create-btn');

// Story management UI
const storySection = document.getElementById('story-management-section');
const storySelect = document.getElementById('story-select');
const storyForm = document.getElementById('story-form');
const saveStoryBtn = document.getElementById('save-story-btn');
const resetStoryBtn = document.getElementById('reset-story-btn');
const deleteStoryBtn = document.getElementById('delete-story-btn');
const storyMsg = document.getElementById('story-status-message');
const storiesPreview = document.getElementById('stories-preview');

// Story form fields
const storyTitle = document.getElementById('story-title');
const storyAuthor = document.getElementById('story-author');
const storyDescription = document.getElementById('story-description');
const storyActive = document.getElementById('story-active');

// Cover image UI
const storyCoverFile = document.getElementById('story-cover-file');
const uploadCoverBtn = document.getElementById('upload-cover-btn');
const deleteCoverBtn = document.getElementById('delete-cover-btn');
const coverUploadMessage = document.getElementById('cover-upload-message');
const coverPreview = document.getElementById('cover-preview');

// Story page upload UI
const storyPageForm = document.getElementById('story-page-form');
const storyPageFile = document.getElementById('story-page-file');
const storyPageCaption = document.getElementById('story-page-caption');
const uploadStoryPageBtn = document.getElementById('upload-story-page-btn');
const storyPageStatusMsg = document.getElementById('story-page-status-message');
const storyPagesPreview = document.getElementById('story-pages-preview');

// Product management UI
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

// Product image upload UI
const productImageFile = document.getElementById('product-image-file');
const uploadProductImageBtn = document.getElementById('upload-product-image-btn');
const productImageUploadMessage = document.getElementById('product-image-upload-message');

// =========================
// SHARED STATE
// =========================
let currentUser = null;
let currentAccessToken = null;
let allStories = [];
let allUsers = [];
let allProducts = [];
let editingStoryId = null;
let editingProductId = null;
let currentWorkingPeriod = null;
let currentTieStories = [];

// =========================
// LOGOUT HANDLER
// =========================
document.getElementById('logout-link')?.addEventListener('click', async (e) => {
  e.preventDefault();
  await logout();
  window.location.href = '/';
});

// =========================
// ACCESS TOKEN HELPER
// =========================
async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Error getting session:', error);
    return null;
  }

  return data?.session?.access_token || null;
}

// =========================
// SAFE JSON RESPONSE PARSER
// =========================
async function parseJsonResponseSafely(res) {
  const rawText = await res.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(rawText || 'Server returned an invalid response.');
  }
}

// =========================
// DATE FORMATTER
// =========================
function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
}

// =========================
// DATETIME-LOCAL FORMATTER
// =========================
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

// =========================
// IMAGE PREVIEW HELPER
// =========================
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

// =========================
// EFFECTIVE CLOSED CHECK
// =========================
function isEffectivelyClosed(period) {
  if (!period) return false;
  if (period.finalized_at) return true;
  if (period.closed_at) return true;

  const now = new Date();
  const end = new Date(period.end_time);

  return now > end;
}

// =========================
// ROUND STATUS DERIVER
// =========================
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

// =========================
// LEGACY WINNER PREVIEW HIDER
// =========================
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

// =========================
// TIE RESOLUTION UI RESETTER
// =========================
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

// =========================
// TIE RESOLUTION UI RENDERER
// =========================
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

// =========================
// CURRENT ROUND SUMMARY RENDERER
// =========================
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

// =========================
// FINALIZED WINNER SUMMARY RENDERER
// =========================
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

// =========================
// VOTING PERIOD LOADER
// =========================
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

// =========================
// VOTING PERIOD SUBMIT HANDLER
// =========================
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

// =========================
// CLOSE VOTING HANDLER
// =========================
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

// =========================
// DETERMINE WINNER HANDLER
// =========================
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
      alert(
        `Voting Period ${result.period_id} was finalized with no winner because no votes were cast.`
      );

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

// =========================
// TIE FINALIZATION HANDLER
// =========================
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

// =========================
// STORY PAGES UI RESETTER
// =========================
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

// =========================
// STORY FORM RESETTER
// =========================
function clearStoryForm() {
  editingStoryId = null;

  if (storySelect) storySelect.value = '';
  storyForm?.reset();

  if (storyActive) storyActive.checked = true;
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

// =========================
// STORY FORM POPULATOR
// =========================
async function populateStoryForm(story) {
  editingStoryId = story.id;
  storyTitle.value = story.title || '';
  storyAuthor.value = story.author || '';
  storyDescription.value = story.description || '';
  storyActive.checked = !!story.active;

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

// =========================
// STORIES PREVIEW LOADER
// =========================
async function loadStoriesPreview() {
  try {
    const { data: stories, error } = await supabase
      .from('stories')
      .select('id, title, author, description, cover_image_url, cover_image_path, active, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    allStories = stories || [];
    storiesPreview.innerHTML = '';
    storySelect.innerHTML = '<option value="">-- Create New Story --</option>';

    if (!allStories.length) {
      storiesPreview.innerHTML = '<p>No stories yet.</p>';
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
        <div>${story.author || 'No author set'}</div>
        <div>Status: ${story.active ? 'Active' : 'Inactive'}</div>
      `;
      storiesPreview.appendChild(div);
    });
  } catch (err) {
    console.error('Error loading stories preview:', err);
    storiesPreview.innerHTML = '<p>Failed to load stories.</p>';
  }
}

// =========================
// STORY PAGES LOADER
// =========================
async function loadStoryPages(storyId) {
  if (!storyId) {
    clearStoryPagesUI();
    return;
  }

  try {
    storyPagesPreview.innerHTML = '<p>Loading story pages...</p>';

    const { data: pages, error } = await supabase
      .from('story_pages')
      .select('id, story_id, page_number, image_url, image_path, caption, created_at')
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

// =========================
// USERS TABLE RENDERER
// =========================
function renderUsersTable(users) {
  if (!tbody) return;

  tbody.innerHTML = '';

  users.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.email}</td>
      <td class="role-cell">${u.role}</td>
      <td class="vote-balance-cell">${u.vote_balance ?? 0}</td>
      <td>
        <select class="role-select">
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
        <button class="role-update-btn" data-user-id="${u.id}">Update Role</button>
      </td>
      <td>
        <div class="compact-actions">
          <button class="vote-adjust-btn" data-user-id="${u.id}" data-amount="1">+1 Vote</button>
          <button class="vote-adjust-btn danger-btn" data-user-id="${u.id}" data-amount="-1">-1 Vote</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  attachUserTableListeners();
}

// =========================
// USERS TABLE LISTENER ATTACHER
// =========================
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
      const row = button.closest('tr');
      const balanceCell = row.querySelector('.vote-balance-cell');
      const originalText = amount > 0 ? '+1 Vote' : '-1 Vote';

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
            amount
          })
        });

        const result = await parseJsonResponseSafely(res);

        if (!res.ok || !result.success) {
          throw new Error(result.error || 'Failed to update vote balance');
        }

        balanceCell.textContent = result.user.vote_balance;
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

// =========================
// COVER IMAGE UPLOAD HANDLER
// =========================
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

// =========================
// COVER IMAGE DELETE HANDLER
// =========================
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

// =========================
// STORY PAGE UPLOAD HANDLER
// =========================
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

// =========================
// STORY PAGE DELETE LISTENER ATTACHER
// =========================
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

// =========================
// STORY DELETE HANDLER
// =========================
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

// =========================
// STORY SAVE HANDLER
// =========================
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

    if (!title) {
      throw new Error('Title is required.');
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
          active
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
          active
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

// =========================
// STORY SELECT CHANGE HANDLER
// =========================
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

// =========================
// PRODUCT FORM RESETTER
// =========================
function clearProductForm() {
  editingProductId = null;

  if (productSelect) productSelect.value = '';
  productForm?.reset();

  if (productActive) productActive.checked = true;
  if (productVotesGranted) productVotesGranted.value = '0';

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
}

// =========================
// PRODUCT FORM POPULATOR
// =========================
function populateProductForm(product) {
  editingProductId = product.id;

  productName.value = product.name || '';
  productDescription.value = product.description || '';
  productPriceCents.value = Number.isInteger(product.price_cents) ? product.price_cents : '';
  productVotesGranted.value = Number(product.votes_granted) || 0;
  productImageUrl.value = product.image_url || '';
  productActive.checked = !!product.active;

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
}

// =========================
// PRODUCTS PREVIEW RENDERER
// =========================
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

    card.innerHTML = `
      ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}">` : ''}
      <strong>${product.name}</strong>
      <div class="product-meta">${product.description || 'No description set.'}</div>
      <div class="product-meta"><strong>Price:</strong> ${priceText}</div>
      <div class="product-meta"><strong>Bonus Votes:</strong> ${product.votes_granted ?? 0}</div>
      <div class="product-meta"><strong>Status:</strong> ${product.active ? 'Active' : 'Inactive'}</div>
    `;

    productsPreview.appendChild(card);
  });
}

// =========================
// PRODUCTS LOADER
// =========================
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
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    allProducts = products || [];

    if (productSelect) {
      productSelect.innerHTML = '<option value="">-- Create New Product --</option>';

      allProducts.forEach((product) => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = product.name;
        productSelect.appendChild(option);
      });
    }

    renderProductsPreview(allProducts);
  } catch (err) {
    console.error('Error loading products preview:', err);
    if (productsPreview) {
      productsPreview.innerHTML = '<p>Failed to load products.</p>';
    }
  }
}

// =========================
// PRODUCT SELECT CHANGE HANDLER
// =========================
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

// =========================
// PRODUCT IMAGE PREVIEW HANDLER
// =========================
function handleProductImageUrlInput() {
  updatePreviewImage(productImagePreview, productImageUrl?.value || '');
}

// =========================
// PRODUCT IMAGE UPLOAD HANDLER
// =========================
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

// =========================
// PRODUCT IMAGE DELETE HANDLER
// =========================
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

// =========================
// PRODUCT SUBMIT HANDLER
// =========================
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

    if (!Number.isInteger(votes_granted) || votes_granted < 0) {
      throw new Error('Bonus votes must be 0 or greater.');
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
          votes_granted
        }
      : {
          name,
          description,
          image_url,
          active,
          price_cents,
          votes_granted
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

// =========================
// PRODUCT DEACTIVATE HANDLER
// =========================
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
        votes_granted: existingProduct.votes_granted
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

// =========================
// ADMIN PANEL INITIALIZER
// =========================
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
  votingSection.style.display = 'block';
  storySection.style.display = 'block';
  productSection.style.display = 'block';

  allUsers = users;
  renderUsersTable(users);

  await loadVotingPeriod();
  await loadStoriesPreview();
  await loadProductsPreview();

  clearStoryPagesUI();
  clearProductForm();
  hideWinnerPreviewUI();
  resetTieResolutionUI();

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
  resetProductBtn?.addEventListener('click', clearProductForm);
  deactivateProductBtn?.addEventListener('click', handleDeactivateProduct);
  uploadProductImageBtn?.addEventListener('click', handleProductImageUpload);
  deleteProductImageBtn?.addEventListener('click', handleDeleteProductImage);
  productImageUrl?.addEventListener('input', handleProductImageUrlInput);
  productForm?.addEventListener('submit', handleProductSubmit);
}

// =========================
// DOM READY BOOTSTRAP
// =========================
document.addEventListener('DOMContentLoaded', initAdminPanel);