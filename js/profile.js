import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { recantVote } from './vote.js';

const voteList = document.getElementById('vote-list');
const noVotes = document.getElementById('no-votes');

if (!voteList || !noVotes) throw new Error('Profile page missing required elements');

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

  data.forEach(vote => {
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
 * Initialize dashboard
 */
function initProfile() {
  fetchVotes();

  // Re-fetch votes if login state changes
  supabase.auth.onAuthStateChange(() => {
    fetchVotes();
  });
}

// Recant button handler
document.addEventListener('click', async (e) => {
  if (!e.target.matches('.recant-btn')) return;

  const storyId = e.target.dataset.storyId;
  const result = await recantVote(storyId);

  if (result.success) {
    alert('Vote recanted!');
    fetchVotes(); // refresh list without full reload
  } else {
    alert('Could not recant vote.');
  }
});

// Run on load
document.addEventListener('DOMContentLoaded', initProfile);
