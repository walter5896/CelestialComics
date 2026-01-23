// /js/profile.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

const voteList = document.getElementById('vote-list');
const noVotes = document.getElementById('no-votes');

if (!voteList || !noVotes) throw new Error('Profile page missing required elements');

// Example mapping of story IDs → titles (adjust to match your real stories)
const storyTitles = {
  "1": "Story Title 1",
  "2": "Story Title 2",
  "3": "Story Title 3",
  "4": "Story Title 4",
};

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
    .select('story_id, created_at')
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
    const title = storyTitles[vote.story_id] || `Story #${vote.story_id}`;
    const date = new Date(vote.created_at).toLocaleString();
    li.textContent = `${title} (voted on ${date})`;
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

// Run on load
document.addEventListener('DOMContentLoaded', initProfile);
