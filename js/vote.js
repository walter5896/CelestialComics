// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';
import {
  setVoteBalances,
  setVotingPeriod,
  clearVotingPeriod
} from './state.js';

/* =======================
   GENERIC HELPERS
======================= */

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

function getStoryImage(story) {
  return story?.cover_image_url || story?.image_url || '';
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function truncateText(value, maxLength = 180) {
  const text = String(value ?? '').trim();

  if (!text) return '';

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}...`;
}

function getStoryAuthor(story) {
  return String(story?.author || '').trim();
}

function getStoryDescription(story) {
  return String(story?.description || '').trim();
}

function isPreviewEnabled(story) {
  return (
    !!story?.is_preview_enabled ||
    !!story?.story_preview_enabled ||
    Number(story?.preview_page_count || story?.story_preview_page_count || 0) > 0
  );
}

function getStoryStatusLabel(story) {
  switch (story?.story_status) {
    case 'active_vote':
      return 'In Tournament';
    case 'winner_in_production':
      return 'In Production';
    case 'released':
      return 'Released';
    case 'concept_bank':
    default:
      return 'Concept Bank';
  }
}

function getStoryDetailUrl(story) {
  return `/gallery/story.html?id=${encodeId(story?.id)}`;
}

function getStoryReadUrl(story) {
  return `/gallery/read.html?id=${encodeId(story?.id)}&page=1`;
}

function renderContainerMessage(container, message, className = '') {
  if (!container) return;

  container.innerHTML = `
    <p class="${className}">
      ${escapeHtml(message)}
    </p>
  `;
}

function getButtonVoteCount(btn) {
  return Number(btn?.dataset?.voteCount) || 0;
}

function setButtonVoteCount(btn, count) {
  if (!btn) return;
  btn.dataset.voteCount = String(Number(count) || 0);
}

/* =======================
   VOTING PERIOD HELPERS
======================= */

function isEffectivelyOpen(period) {
  if (!period) return false;
  if (period.finalized_at) return false;
  if (period.closed_at) return false;

  const now = new Date();
  const start = new Date(period.start_time);
  const end = new Date(period.end_time);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return now >= start && now <= end;
}

function deriveVotingStatus(period) {
  if (!period) return 'closed';
  if (period.finalized_at) return 'closed';
  if (period.closed_at) return 'closed';

  const now = new Date();
  const start = new Date(period.start_time);
  const end = new Date(period.end_time);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'closed';
  }

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'open';
  return 'closed';
}

async function fetchCurrentVotingPeriod() {
  const { data, error } = await supabase
    .from('voting_periods')
    .select(`
      id,
      start_time,
      end_time,
      status,
      closed_at,
      winner_id,
      finalized_at,
      winning_vote_count
    `)
    .is('finalized_at', null)
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching current voting period:', error);
    clearVotingPeriod();
    return null;
  }

  const period = data?.[0] || null;

  if (period) {
    setVotingPeriod(period);
  } else {
    clearVotingPeriod();
  }

  return period;
}

async function fetchOpenVotingPeriod() {
  const { data, error } = await supabase
    .from('voting_periods')
    .select(`
      id,
      start_time,
      end_time,
      status,
      closed_at,
      finalized_at
    `)
    .is('finalized_at', null)
    .is('closed_at', null)
    .order('id', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching open voting period:', error);
    clearVotingPeriod();
    return null;
  }

  const periods = data || [];
  const openPeriod = periods.find(isEffectivelyOpen) || null;

  if (openPeriod) {
    setVotingPeriod(openPeriod);
  }

  return openPeriod;
}

/* =======================
   PROFILE / BALANCE HELPERS
======================= */

async function fetchUserProfileBalances() {
  const user = await getCurrentUserAsync();

  if (!user) {
    const emptyBalances = { round: 0, bonus: 0, total: 0 };

    setVoteBalances({
      voteBalance: 0,
      bonusVoteBalance: 0
    });

    return emptyBalances;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('vote_balance, bonus_vote_balance')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user balances:', error);

    const emptyBalances = { round: 0, bonus: 0, total: 0 };

    setVoteBalances({
      voteBalance: 0,
      bonusVoteBalance: 0
    });

    return emptyBalances;
  }

  const round = Number(data?.vote_balance) || 0;
  const bonus = Number(data?.bonus_vote_balance) || 0;

  setVoteBalances({
    voteBalance: round,
    bonusVoteBalance: bonus
  });

  return {
    round,
    bonus,
    total: round + bonus
  };
}

/* =======================
   FETCH FUNCTIONS
======================= */

export async function fetchConceptBankStories() {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select(`
        id,
        title,
        image_url,
        cover_image_url,
        author,
        description,
        active,
        story_status,
        is_preview_enabled,
        preview_page_count,
        created_at
      `)
      .eq('active', true)
      .eq('story_status', 'concept_bank')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((story) => ({
      ...story,
      vote_count: 0,
      voting_status: 'closed'
    }));
  } catch (err) {
    console.error('Error fetching concept bank stories:', err);
    return [];
  }
}

export async function fetchStoriesWithVotes() {
  try {
    const currentPeriod = await fetchCurrentVotingPeriod();
    const currentVotingStatus = deriveVotingStatus(currentPeriod);
    const currentVotingPeriodId = currentPeriod?.id || null;

    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select(`
        id,
        title,
        image_url,
        cover_image_url,
        author,
        description,
        active,
        story_status,
        is_preview_enabled,
        preview_page_count,
        created_at
      `)
      .eq('active', true)
      .eq('story_status', 'active_vote')
      .order('created_at', { ascending: false });

    if (storiesError) throw storiesError;

    if (!currentVotingPeriodId) {
      return (stories || []).map((story) => ({
        ...story,
        vote_count: 0,
        voting_status: 'closed'
      }));
    }

    const { data: votesData, error: votesError } = await supabase
      .from('votes')
      .select('story_id, vote_count')
      .eq('voting_period_id', currentVotingPeriodId);

    if (votesError) throw votesError;

    const voteCounts = (votesData || []).reduce((acc, vote) => {
      const storyId = String(vote.story_id);
      const count = Number(vote.vote_count) || 0;

      acc[storyId] = (acc[storyId] || 0) + count;
      return acc;
    }, {});

    return (stories || []).map((story) => ({
      ...story,
      vote_count: voteCounts[String(story.id)] || 0,
      voting_status: currentVotingStatus
    }));
  } catch (err) {
    console.error('Error fetching stories with votes:', err);
    return [];
  }
}

export async function fetchUserVotes() {
  const user = await getCurrentUserAsync();
  if (!user) return [];

  const currentPeriod = await fetchCurrentVotingPeriod();
  const currentVotingPeriodId = currentPeriod?.id || null;

  if (!currentVotingPeriodId) return [];

  try {
    const { data, error } = await supabase
      .from('votes')
      .select('story_id, vote_count, voting_period_id')
      .eq('user_id', user.id)
      .eq('voting_period_id', currentVotingPeriodId);

    if (error) {
      console.error('Error fetching user votes:', error);
      return [];
    }

    return (data || []).map((v) => ({
      story_id: String(v.story_id),
      vote_count: Number(v.vote_count) || 0,
      voting_period_id: v.voting_period_id
    }));
  } catch (err) {
    console.error('Unexpected error fetching user votes:', err);
    return [];
  }
}

export async function fetchUserVoteBalance() {
  const balances = await fetchUserProfileBalances();
  return balances.round;
}

export async function fetchUserVoteBalances() {
  return await fetchUserProfileBalances();
}

export async function fetchSavedStories() {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false, data: [] };

  const { data, error } = await supabase
    .from('saved_stories')
    .select('story_id, stories(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching saved stories:', error);
    return { success: false, data: [] };
  }

  const stories = (data || []).map((item) => item.stories).filter(Boolean);

  return {
    success: true,
    data: stories
  };
}

/* =======================
   VOTE / SAVE FUNCTIONS
======================= */

export async function submitVote(storyId, amount = 1) {
  const user = await getCurrentUserAsync();

  if (!user) {
    return {
      success: false,
      reason: 'not_logged_in',
      message: 'You must be logged in to vote.'
    };
  }

  const voteAmount = Number(amount);

  if (!isPositiveInteger(voteAmount)) {
    return {
      success: false,
      reason: 'invalid_amount',
      message: 'Invalid vote amount.'
    };
  }

  const { data, error } = await supabase.rpc('submit_vote_secure', {
    p_story_id: storyId,
    p_amount: voteAmount
  });

  if (error) {
    console.error('submit_vote_secure error:', error);

    return {
      success: false,
      reason: 'rpc_error',
      message: error.message || 'Could not submit vote.'
    };
  }

  if (data?.success) {
    setVoteBalances({
      voteBalance: data.round_balance ?? 0,
      bonusVoteBalance: data.bonus_balance ?? 0
    });

    if (data.voting_period_id) {
      await fetchCurrentVotingPeriod();
    }
  }

  return data || {
    success: false,
    reason: 'unknown',
    message: 'Unexpected vote response.'
  };
}

export async function recantVote(storyId, amount = 1) {
  const user = await getCurrentUserAsync();

  if (!user) {
    return {
      success: false,
      reason: 'not_logged_in',
      message: 'You must be logged in.'
    };
  }

  const recantAmount = Number(amount);

  if (!isPositiveInteger(recantAmount)) {
    return {
      success: false,
      reason: 'invalid_amount',
      message: 'Invalid recant amount.'
    };
  }

  const { data, error } = await supabase.rpc('recant_vote_secure', {
    p_story_id: storyId,
    p_amount: recantAmount
  });

  if (error) {
    console.error('recant_vote_secure error:', error);

    return {
      success: false,
      reason: 'rpc_error',
      message: error.message || 'Could not recant vote.'
    };
  }

  if (data?.success) {
    setVoteBalances({
      voteBalance: data.round_balance ?? 0,
      bonusVoteBalance: data.bonus_balance ?? 0
    });

    if (data.voting_period_id) {
      await fetchCurrentVotingPeriod();
    }
  }

  return data || {
    success: false,
    reason: 'unknown',
    message: 'Unexpected recant response.'
  };
}

export async function saveStory(storyId) {
  const user = await getCurrentUserAsync();

  if (!user) {
    return {
      success: false,
      reason: 'not_logged_in',
      message: 'You must be logged in.'
    };
  }

  const { error } = await supabase
    .from('saved_stories')
    .insert({
      user_id: user.id,
      story_id: storyId
    });

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        reason: 'already_saved',
        message: 'Story already saved.'
      };
    }

    console.error('Error saving story:', error);

    return {
      success: false,
      reason: 'save_failed',
      message: 'Could not save story.'
    };
  }

  return { success: true };
}

export async function unsaveStory(storyId) {
  const user = await getCurrentUserAsync();

  if (!user) {
    return {
      success: false,
      reason: 'not_logged_in',
      message: 'You must be logged in.'
    };
  }

  const { error } = await supabase
    .from('saved_stories')
    .delete()
    .eq('user_id', user.id)
    .eq('story_id', storyId);

  if (error) {
    console.error('Error unsaving story:', error);

    return {
      success: false,
      reason: 'unsave_failed',
      message: 'Could not unsave story.'
    };
  }

  return { success: true };
}

/* =======================
   RENDER HELPERS
======================= */

function renderStoryArtwork(story, safeTitle) {
  const image = getStoryImage(story);

  if (!image) {
    return `
      <div class="story-card-art story-card-art-empty" aria-label="${safeTitle} artwork placeholder">
        <span>No Artwork Yet</span>
      </div>
    `;
  }

  return `
    <div class="story-card-art">
      <img src="${escapeHtml(image)}" alt="${safeTitle}" loading="lazy" />
    </div>
  `;
}

function renderStoryCardMeta(story) {
  const author = getStoryAuthor(story);
  const description = truncateText(getStoryDescription(story), 190);

  return `
    ${author ? `<p class="story-card-author">By ${escapeHtml(author)}</p>` : ''}
    ${description ? `<p class="story-card-description">${escapeHtml(description)}</p>` : ''}
  `;
}

function renderPreviewButton(story) {
  if (!isPreviewEnabled(story)) return '';

  return `
    <a href="${getStoryReadUrl(story)}" class="btn btn-secondary">
      Read Preview
    </a>
  `;
}

/* =======================
   RENDERERS
======================= */

export function renderStoriesForHome(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  const safeStories = Array.isArray(stories) ? stories : [];

  if (!safeStories.length) {
    renderContainerMessage(container, 'No stories are available yet.');
    return;
  }

  safeStories.forEach((story) => {
    const safeTitle = escapeHtml(story.title || 'Untitled Story');

    const card = document.createElement('article');
    card.className = 'story-card';

    card.innerHTML = `
      ${renderStoryArtwork(story, safeTitle)}

      <div class="story-card-body">
        <span class="story-status">${escapeHtml(getStoryStatusLabel(story))}</span>
        <h3>${safeTitle}</h3>
        ${renderStoryCardMeta(story)}

        <div class="story-actions">
          <a href="${getStoryDetailUrl(story)}" class="btn btn-primary">Learn More</a>
          ${renderPreviewButton(story)}
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

export function renderStoriesForGallery(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  const safeStories = Array.isArray(stories) ? stories : [];

  if (!safeStories.length) {
    renderContainerMessage(container, 'No story concepts found yet.');
    return;
  }

  safeStories.forEach((story) => {
    const safeTitle = escapeHtml(story.title || 'Untitled Story');

    const card = document.createElement('article');
    card.className = 'story-card gallery-story-card';

    card.innerHTML = `
      <a href="${getStoryDetailUrl(story)}" class="story-card-art-link" aria-label="View ${safeTitle}">
        ${renderStoryArtwork(story, safeTitle)}
      </a>

      <div class="story-card-body">
        <span class="story-status">${escapeHtml(getStoryStatusLabel(story))}</span>
        <h3>${safeTitle}</h3>
        ${renderStoryCardMeta(story)}

        <div class="story-actions">
          <a href="${getStoryDetailUrl(story)}" class="btn btn-primary">View Concept</a>
          ${renderPreviewButton(story)}
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

export function renderStoriesForVote(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  const safeStories = Array.isArray(stories) ? stories : [];

  if (!safeStories.length) {
    renderContainerMessage(
      container,
      'No active voting concepts are currently available.',
      'vote-empty-state'
    );
    return;
  }

  safeStories.forEach((story) => {
    const safeTitle = escapeHtml(story.title || 'Untitled Story');
    const safeStoryId = escapeHtml(story.id);
    const voteCount = Number(story.vote_count) || 0;
    const image = getStoryImage(story);
    const detailUrl = getStoryDetailUrl(story);

    const card = document.createElement('article');
    card.className = 'vote-matchup-card';

    card.innerHTML = `
      <h3 class="vote-matchup-title">${safeTitle}</h3>

      <a href="${detailUrl}" class="vote-matchup-art-link" aria-label="View ${safeTitle}">
        ${
          image
            ? `<img src="${escapeHtml(image)}" alt="${safeTitle}" loading="lazy" />`
            : `<span class="vote-matchup-art-empty">No Artwork Yet</span>`
        }
      </a>

      <div class="vote-matchup-actions">
        <button
          type="button"
          class="btn btn-primary vote-btn"
          data-story-id="${safeStoryId}"
          data-vote-count="${voteCount}">
          Vote
        </button>

        <a href="${detailUrl}" class="btn btn-secondary">View Concept</a>
      </div>
    `;

    container.appendChild(card);
  });
}

export function renderStoriesForProfile(votedStories, savedStories, votedContainerId, savedContainerId) {
  const votedContainer = votedContainerId ? document.getElementById(votedContainerId) : null;
  const savedContainer = savedContainerId ? document.getElementById(savedContainerId) : null;

  const safeVotedStories = Array.isArray(votedStories) ? votedStories : [];
  const safeSavedStories = Array.isArray(savedStories) ? savedStories : [];

  if (votedContainer) {
    votedContainer.innerHTML = '';

    if (!safeVotedStories.length) {
      renderContainerMessage(votedContainer, 'You have not voted for any active stories yet.');
    }

    safeVotedStories.forEach((story) => {
      const safeTitle = escapeHtml(story.title || 'Untitled Story');
      const safeStoryId = escapeHtml(story.id);
      const userVoteCount = Number(story.user_vote_count) || 0;

      const card = document.createElement('article');
      card.className = 'story-card profile-story-card';

      card.innerHTML = `
        ${renderStoryArtwork(story, safeTitle)}

        <div class="story-card-body">
          <span class="story-status">${escapeHtml(getStoryStatusLabel(story))}</span>
          <h3>${safeTitle}</h3>
          ${renderStoryCardMeta(story)}

          <p class="story-card-votes">
            You cast ${userVoteCount} vote${userVoteCount === 1 ? '' : 's'}
          </p>

          <div class="story-actions">
            <button type="button" class="btn btn-primary recant-btn" data-story-id="${safeStoryId}">
              Recant 1 Vote
            </button>

            <a href="${getStoryDetailUrl(story)}" class="btn btn-secondary">View Concept</a>
            ${renderPreviewButton(story)}
          </div>
        </div>
      `;

      votedContainer.appendChild(card);
    });
  }

  if (savedContainer) {
    savedContainer.innerHTML = '';

    if (!safeSavedStories.length) {
      renderContainerMessage(savedContainer, 'You have not saved any stories yet.');
    }

    safeSavedStories.forEach((story) => {
      const safeTitle = escapeHtml(story.title || 'Untitled Story');
      const safeStoryId = escapeHtml(story.id);

      const card = document.createElement('article');
      card.className = 'story-card saved-story-card';

      card.innerHTML = `
        ${renderStoryArtwork(story, safeTitle)}

        <div class="story-card-body">
          <span class="story-status">${escapeHtml(getStoryStatusLabel(story))}</span>
          <h3>${safeTitle}</h3>
          ${renderStoryCardMeta(story)}

          <div class="story-actions">
            <button type="button" class="btn btn-secondary unsave-btn" data-story-id="${safeStoryId}">
              Unsave
            </button>

            <a href="${getStoryDetailUrl(story)}" class="btn btn-primary">View Concept</a>
            ${renderPreviewButton(story)}
          </div>
        </div>
      `;

      savedContainer.appendChild(card);
    });
  }
}

/* =======================
   BUTTON HANDLERS
======================= */

export function updateVoteButtons(userVotes, stories) {
  const safeVotes = Array.isArray(userVotes) ? userVotes : [];
  const safeStories = Array.isArray(stories) ? stories : [];

  const userVoteMap = new Map(
    safeVotes.map((v) => [String(v.story_id), Number(v.vote_count) || 0])
  );

  document.querySelectorAll('.vote-btn').forEach((btn) => {
    const storyId = String(btn.dataset.storyId);
    const story = safeStories.find((s) => String(s.id) === storyId);

    if (!story) return;

    const status = story.voting_status || 'upcoming';
    const userVoteCountForStory = userVoteMap.get(storyId) || 0;

    btn.classList.toggle('voted', userVoteCountForStory > 0);

    if (status === 'open') {
      btn.disabled = false;
      btn.textContent = userVoteCountForStory > 0 ? 'Add Vote' : 'Vote';
      return;
    }

    if (status === 'upcoming') {
      btn.disabled = true;
      btn.textContent = 'Voting Starts Soon';
      btn.classList.remove('voted');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Voting Closed';
    btn.classList.remove('voted');
  });
}

async function refreshVoteCards(containerId = 'story-grid') {
  const stories = await fetchStoriesWithVotes();
  renderStoriesForVote(stories, containerId);

  const userVotes = await fetchUserVotes();

  updateVoteButtons(userVotes, stories);
  attachVoteListeners(containerId, {
    reloadOnSuccess: false
  });

  return stories;
}

export function attachVoteListeners(containerId = 'story-grid', options = {}) {
  const {
    onSuccess = null,
    reloadOnSuccess = true
  } = options;

  document.querySelectorAll(`#${containerId} .vote-btn`).forEach((btn) => {
    if (btn.dataset.listenerAttached === 'true') return;
    btn.dataset.listenerAttached = 'true';

    btn.addEventListener('click', async () => {
      if (btn.disabled) return;

      const originalText = btn.textContent;
      const originalCount = getButtonVoteCount(btn);
      const storyId = btn.dataset.storyId;

      btn.disabled = true;
      btn.textContent = 'Submitting...';

      try {
        const result = await submitVote(storyId, 1);

        if (result.success) {
          const updatedCount = originalCount + 1;

          setButtonVoteCount(btn, updatedCount);
          btn.textContent = 'Add Vote';
          btn.classList.add('voted');
          btn.disabled = false;

          if (typeof onSuccess === 'function') {
            await onSuccess(result);
            return;
          }

          if (reloadOnSuccess) {
            window.location.reload();
            return;
          }

          await refreshVoteCards(containerId);
          return;
        }

        btn.textContent = originalText;
        btn.disabled = false;

        if (result.reason === 'not_logged_in') {
          alert(result.message || 'You must be logged in to vote.');
        } else if (result.reason === 'voting_closed') {
          alert(result.message || 'Voting is closed right now.');
          await refreshVoteCards(containerId);
        } else if (result.reason === 'insufficient_balance') {
          alert(result.message || 'You do not have enough votes.');
        } else {
          alert(result.message || 'Could not submit vote.');
        }
      } catch (err) {
        console.error('Vote click error:', err);
        btn.disabled = false;
        btn.textContent = originalText;
        alert('Could not submit vote.');
      }
    });
  });
}

export function attachSaveListeners(containerId = 'story-grid', savedStoryIds = []) {
  const safeSavedStoryIds = Array.isArray(savedStoryIds)
    ? savedStoryIds.map(String)
    : [];

  document.querySelectorAll(`#${containerId} .save-btn`).forEach((btn) => {
    if (btn.dataset.listenerAttached === 'true') return;
    btn.dataset.listenerAttached = 'true';

    btn.addEventListener('click', async () => {
      const storyId = String(btn.dataset.storyId);
      const alreadySaved = safeSavedStoryIds.includes(storyId);

      btn.disabled = true;

      if (alreadySaved) {
        const unsaveResult = await unsaveStory(storyId);

        if (!unsaveResult.success) {
          btn.disabled = false;
          alert(unsaveResult.message || 'Could not unsave story.');
          return;
        }

        btn.textContent = 'Save Story';

        const idx = safeSavedStoryIds.indexOf(storyId);
        if (idx > -1) safeSavedStoryIds.splice(idx, 1);

        btn.disabled = false;
        return;
      }

      const saveResult = await saveStory(storyId);

      if (!saveResult.success && saveResult.reason !== 'already_saved') {
        btn.disabled = false;
        alert(saveResult.message || 'Could not save story.');
        return;
      }

      btn.textContent = 'Saved';

      if (!safeSavedStoryIds.includes(storyId)) {
        safeSavedStoryIds.push(storyId);
      }

      btn.disabled = false;
    });
  });
}

export function attachRecantListeners(containerId, options = {}) {
  const {
    onSuccess = null,
    reloadOnSuccess = true
  } = options;

  document.querySelectorAll(`#${containerId} .recant-btn`).forEach((btn) => {
    if (btn.dataset.listenerAttached === 'true') return;
    btn.dataset.listenerAttached = 'true';

    btn.addEventListener('click', async () => {
      if (btn.disabled) return;

      const originalText = btn.textContent;
      const storyId = btn.dataset.storyId;

      btn.disabled = true;
      btn.textContent = 'Recanting...';

      try {
        const res = await recantVote(storyId, 1);

        if (res.success) {
          if (typeof onSuccess === 'function') {
            await onSuccess(res);
            return;
          }

          if (reloadOnSuccess) {
            window.location.reload();
            return;
          }

          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }

        btn.disabled = false;
        btn.textContent = originalText;

        if (res.reason === 'voting_closed') {
          alert(res.message || 'Voting is closed. You can no longer recant votes for this round.');
        } else {
          alert(res.message || 'Could not recant vote.');
        }
      } catch (err) {
        console.error('Recant click error:', err);
        btn.disabled = false;
        btn.textContent = originalText;
        alert('Could not recant vote.');
      }
    });
  });
}

export function attachUnsaveListeners(containerId, options = {}) {
  const {
    onSuccess = null,
    reloadOnSuccess = true
  } = options;

  document.querySelectorAll(`#${containerId} .unsave-btn`).forEach((btn) => {
    if (btn.dataset.listenerAttached === 'true') return;
    btn.dataset.listenerAttached = 'true';

    btn.addEventListener('click', async () => {
      const storyId = btn.dataset.storyId;
      const originalText = btn.textContent;

      btn.disabled = true;
      btn.textContent = 'Removing...';

      const res = await unsaveStory(storyId);

      if (!res.success) {
        btn.disabled = false;
        btn.textContent = originalText;
        alert(res.message || 'Could not unsave story.');
        return;
      }

      if (typeof onSuccess === 'function') {
        await onSuccess(res, storyId);
        return;
      }

      if (reloadOnSuccess) {
        window.location.reload();
        return;
      }

      btn.disabled = false;
      btn.textContent = originalText;
    });
  });
}

export async function initVoting(containerId = 'story-grid') {
  const user = await getCurrentUserAsync();
  if (!user) return false;

  const stories = await fetchStoriesWithVotes();
  const safeStories = Array.isArray(stories) ? stories : [];

  renderStoriesForVote(safeStories, containerId);

  const userVotes = await fetchUserVotes();

  updateVoteButtons(userVotes, safeStories);
  attachVoteListeners(containerId, {
    reloadOnSuccess: false
  });

  return safeStories;
}