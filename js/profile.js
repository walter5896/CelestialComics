// /js/profile.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';
import {
  recantVote,
  fetchSavedStories,
  unsaveStory,
  renderStoriesForProfile,
  attachRecantListeners,
  attachUnsaveListeners
} from './vote.js';

const voteList = document.getElementById('vote-list');
const noVotes = document.getElementById('no-votes');
const savedContainer = document.getElementById('my-saved-stories-container');
const noSaved = document.getElementById('no-saved-stories');

const roundVoteBalanceEl = document.getElementById('round-vote-balance');
const bonusVoteBalanceEl = document.getElementById('bonus-vote-balance');
const totalVoteBalanceEl = document.getElementById('total-vote-balance');

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

// =========================
// PROFILE BALANCE HELPERS
// =========================
function setVoteBalances(roundVotes = 0, bonusVotes = 0) {
  const safeRoundVotes = Number(roundVotes) || 0;
  const safeBonusVotes = Number(bonusVotes) || 0;
  const totalVotes = safeRoundVotes + safeBonusVotes;

  roundVoteBalanceEl.textContent = String(safeRoundVotes);
  bonusVoteBalanceEl.textContent = String(safeBonusVotes);
  totalVoteBalanceEl.textContent = String(totalVotes);
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

/**
 * Fetch votes for the current user
 */
async function fetchVotes() {
  const user = getCurrentUser();

  if (!user) {
    voteList.innerHTML = '';
    noVotes.style.display = 'block';
    return;
  }

  const { data, error } = await supabase
    .from('votes')
    .select(`
      story_id,
      created_at,
      stories (
        id,
        title
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching votes:', error);
    voteList.innerHTML = '<li>Error loading votes. Please try again.</li>';
    noVotes.style.display = 'none';
    return;
  }

  if (!data || data.length === 0) {
    voteList.innerHTML = '';
    noVotes.style.display = 'block';
    return;
  }

  noVotes.style.display = 'none';
  voteList.innerHTML = '';

  data.forEach((vote) => {
    const li = document.createElement('li');
    const title = vote.stories?.title || `Story #${vote.story_id}`;
    const date = new Date(vote.created_at).toLocaleString();

    li.innerHTML = `
      <span>${title} (voted on ${date})</span>
      <button class="recant-btn" data-story-id="${vote.story_id}">
        Recant Vote
      </button>
    `;

    voteList.appendChild(li);
  });
}

/**
 * Fetch and render saved stories
 */
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

  // Keep container populated in a way compatible with current vote.js renderers
  renderStoriesForProfile([], storiesWithSavedFlag, null, 'my-saved-stories-container');

  attachUnsaveListeners('my-saved-stories-container');
}

/**
 * Initialize profile dashboard
 */
function initProfile() {
  fetchVoteBalances();
  fetchVotes();
  fetchAndRenderSavedStories();

  supabase.auth.onAuthStateChange(() => {
    fetchVoteBalances();
    fetchVotes();
    fetchAndRenderSavedStories();
  });
}

// =========================
// GLOBAL CLICK HANDLER
// =========================
document.addEventListener('click', async (e) => {
  if (!e.target.matches('.recant-btn')) return;

  const storyId = e.target.dataset.storyId;
  const result = await recantVote(storyId);

  if (result.success) {
    alert('Vote recanted!');
    fetchVotes();
    fetchVoteBalances();
  } else {
    alert('Could not recant vote.');
  }
});

// =========================
// INITIALIZE
// =========================
document.addEventListener('DOMContentLoaded', initProfile);