// /js/profile.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';
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

// New owned-stories section
const ownedContainer = document.getElementById('owned-stories-container');
const noOwned = document.getElementById('no-owned-stories');

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

function setVoteBalances(roundVotes = 0, bonusVotes = 0) {
  const safeRoundVotes = Number(roundVotes) || 0;
  const safeBonusVotes = Number(bonusVotes) || 0;
  const totalVotes = safeRoundVotes + safeBonusVotes;

  roundVoteBalanceEl.textContent = String(safeRoundVotes);
  bonusVoteBalanceEl.textContent = String(safeBonusVotes);
  totalVoteBalanceEl.textContent = String(totalVotes);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getStoryImage(story) {
  return story?.cover_image_url || story?.image_url || '';
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

function formatGrantedDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

async function fetchVoteBalances() {
  const user = getCurrentUser();

  if (!user) {
    setVoteBalances(0, 0);
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('vote_balance, bonus_vote_balance')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching vote balances:', error);
    setVoteBalances(0, 0);
    return;
  }

  setVoteBalances(
    data?.vote_balance ?? 0,
    data?.bonus_vote_balance ?? 0
  );
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

  return now >= start && now <= end;
}

/* =======================
   CURRENT-ROUND VOTES ONLY
======================= */

async function fetchCurrentRoundVotes() {
  const user = getCurrentUser();
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
  const currentPeriod = await fetchCurrentVotingPeriod();
  const roundIsOpen = isOpenVotingPeriod(currentPeriod);

  const voteRows = await fetchCurrentRoundVotes();

  if (!voteRows.length) {
    voteList.innerHTML = '';
    noVotes.style.display = 'block';
    return;
  }

  noVotes.style.display = 'block';
  noVotes.style.display = 'none';
  voteList.innerHTML = '';

  voteRows.forEach((voteRow) => {
    const li = document.createElement('li');

    const title = voteRow.story?.title || `Story #${voteRow.story_id}`;
    const count = Number(voteRow.vote_count) || 0;

    li.innerHTML = `
      <span>${title} — You cast ${count} vote(s) this round</span>
      ${
        roundIsOpen
          ? `<button class="recant-btn" data-story-id="${voteRow.story_id}">Recant 1 Vote</button>`
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
  const { success, data } = await fetchSavedStories();

  if (!success || data.length === 0) {
    savedContainer.style.display = 'none';
    noSaved.style.display = 'block';
    return;
  }

  savedContainer.style.display = 'grid';
  noSaved.style.display = 'none';

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

  if (!ownedStories.length) {
    ownedContainer.style.display = 'none';
    noOwned.style.display = 'block';
    return;
  }

  ownedContainer.style.display = 'grid';
  noOwned.style.display = 'none';

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

      return `
        <article class="story-card owned-story-card">
          ${
            safeImage
              ? `<img src="${safeImage}" alt="${safeTitle} cover" class="story-image" />`
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
              <a href="/comics/story.html?id=${story.id}" class="btn btn-secondary">
                View Comic
              </a>
              <a href="/gallery/read.html?id=${story.id}" class="btn btn-primary">
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
  const user = getCurrentUser();

  if (!user) return [];

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
    return [];
  }

  return (data || []).filter(
    (item) => item.stories && item.stories.story_status === 'released'
  );
}

async function fetchAndRenderOwnedStories() {
  const ownedStories = await fetchOwnedStories();
  renderOwnedStories(ownedStories);
}

/* =======================
   INIT
======================= */

function initProfile() {
  fetchVoteBalances();
  fetchAndRenderVotes();
  fetchAndRenderSavedStories();
  fetchAndRenderOwnedStories();

  supabase.auth.onAuthStateChange(() => {
    fetchVoteBalances();
    fetchAndRenderVotes();
    fetchAndRenderSavedStories();
    fetchAndRenderOwnedStories();
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
    fetchVoteBalances();
    fetchAndRenderVotes();
  } else if (result.reason === 'voting_closed') {
    alert('Voting is closed. You can no longer recant votes this round.');
    fetchAndRenderVotes();
  } else {
    alert('Could not recant vote.');
  }
});

document.addEventListener('DOMContentLoaded', initProfile);