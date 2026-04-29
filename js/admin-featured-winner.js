// /js/admin-featured-winner.js
import { parseJsonResponseSafely } from './admin-shared.js';

let featuredWinnerInitialized = false;

function setStatus(el, message = '', color = '') {
  if (!el) return;
  el.textContent = message;
  el.style.color = color;
}

function prettyStoryStatus(status) {
  switch (status) {
    case 'concept_bank':
      return 'Concept Bank';
    case 'active_vote':
      return 'Active Vote';
    case 'winner_in_production':
      return 'Winner in Production';
    case 'released':
      return 'Released';
    default:
      return status || 'Unknown Status';
  }
}

function getStoryTitle(story) {
  return story?.title || 'Untitled Story';
}

function populateFeaturedWinnerOptions(ctx, selectedStoryId = '') {
  const { featuredWinnerSelect } = ctx;
  if (!featuredWinnerSelect) return;

  const stories = typeof ctx.getAllStories === 'function'
    ? ctx.getAllStories()
    : [];

  featuredWinnerSelect.innerHTML = `
    <option value="">-- Use Latest Finalized Winner --</option>
  `;

  stories.forEach((story) => {
    const option = document.createElement('option');
    option.value = story.id;
    option.textContent = `${getStoryTitle(story)} — ${prettyStoryStatus(story.story_status)}`;
    featuredWinnerSelect.appendChild(option);
  });

  featuredWinnerSelect.value = selectedStoryId || '';
}

function renderCurrentFeaturedWinner(ctx, result) {
  const { featuredWinnerCurrent } = ctx;
  if (!featuredWinnerCurrent) return;

  const storyId = result?.featured_winner_story_id || null;
  const story = result?.story || null;
  const updatedAt = result?.setting?.updated_at || null;

  if (!storyId) {
    featuredWinnerCurrent.innerHTML = `
      <strong>Current Mode:</strong> Automatic<br>
      The Winner page will use the latest finalized voting winner.
    `;
    return;
  }

  if (storyId && !story) {
    featuredWinnerCurrent.innerHTML = `
      <strong>Current Mode:</strong> Manual Override<br>
      <strong>Selected Story:</strong> Story ID ${storyId}<br>
      <span style="color:#b91c1c;">Warning: this story could not be found.</span>
    `;
    return;
  }

  const updatedText = updatedAt
    ? new Date(updatedAt).toLocaleString()
    : 'Unknown';

  featuredWinnerCurrent.innerHTML = `
    <strong>Current Mode:</strong> Manual Override<br>
    <strong>Displayed Winner:</strong> ${getStoryTitle(story)}<br>
    <strong>Status:</strong> ${prettyStoryStatus(story.story_status)}<br>
    <strong>Last Updated:</strong> ${updatedText}
  `;
}

async function updateFeaturedWinner(ctx, storyId) {
  const {
    featuredWinnerStatusMsg,
    saveFeaturedWinnerBtn,
    clearFeaturedWinnerBtn
  } = ctx;

  try {
    setStatus(featuredWinnerStatusMsg, '', '');

    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    if (saveFeaturedWinnerBtn) saveFeaturedWinnerBtn.disabled = true;
    if (clearFeaturedWinnerBtn) clearFeaturedWinnerBtn.disabled = true;

    const res = await fetch('/.netlify/functions/update-featured-winner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        story_id: storyId || null
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to update featured winner.');
    }

    setStatus(featuredWinnerStatusMsg, 'Featured winner setting updated successfully.', 'green');

    await loadFeaturedWinnerControl(ctx);
  } catch (err) {
    console.error('updateFeaturedWinner error:', err);
    setStatus(
      featuredWinnerStatusMsg,
      err.message || 'Failed to update featured winner.',
      'red'
    );
  } finally {
    if (saveFeaturedWinnerBtn) saveFeaturedWinnerBtn.disabled = false;
    if (clearFeaturedWinnerBtn) clearFeaturedWinnerBtn.disabled = false;
  }
}

export async function loadFeaturedWinnerControl(ctx) {
  const {
    featuredWinnerStatusMsg,
    featuredWinnerCurrent
  } = ctx;

  try {
    setStatus(featuredWinnerStatusMsg, '', '');

    if (featuredWinnerCurrent) {
      featuredWinnerCurrent.textContent = 'Loading featured winner setting...';
    }

    const res = await fetch('/.netlify/functions/get-featured-winner', {
      method: 'GET'
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to load featured winner setting.');
    }

    const selectedStoryId = result.featured_winner_story_id || '';

    populateFeaturedWinnerOptions(ctx, selectedStoryId);
    renderCurrentFeaturedWinner(ctx, result);
  } catch (err) {
    console.error('loadFeaturedWinnerControl error:', err);

    populateFeaturedWinnerOptions(ctx, '');

    if (featuredWinnerCurrent) {
      featuredWinnerCurrent.textContent = 'Failed to load featured winner setting.';
    }

    setStatus(
      featuredWinnerStatusMsg,
      err.message || 'Failed to load featured winner setting.',
      'red'
    );
  }
}

export function initAdminFeaturedWinner(ctx) {
  if (featuredWinnerInitialized) return;
  featuredWinnerInitialized = true;

  const {
    featuredWinnerSelect,
    saveFeaturedWinnerBtn,
    clearFeaturedWinnerBtn
  } = ctx;

  saveFeaturedWinnerBtn?.addEventListener('click', async () => {
    const storyId = featuredWinnerSelect?.value || '';
    await updateFeaturedWinner(ctx, storyId);
  });

  clearFeaturedWinnerBtn?.addEventListener('click', async () => {
    if (featuredWinnerSelect) {
      featuredWinnerSelect.value = '';
    }

    await updateFeaturedWinner(ctx, '');
  });
}