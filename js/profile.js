// /js/profile.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { recantVote, fetchSavedStories, renderStories } from './vote.js';

const voteList = document.getElementById('vote-list');
const noVotes = document.getElementById('no-votes');
const savedContainer = document.getElementById('my-saved-stories-container');
const noSaved = document.getElementById('no-saved-stories');

if (!voteList || !noVotes || !savedContainer || !noSaved) {
  throw new Error('Profile page missing required elements');
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

  // Add isSaved flag so renderStories knows this is a saved context
  const storiesWithSavedFlag = data.map(story => ({ ...story, isSaved: true }));

  renderStories(storiesWithSavedFlag, 'my-saved-stories-container', {
    showSaveButton: true,
    isSavedContext: true
  });
}

/**
 * Initialize profile dashboard
 */
function initProfile() {
  fetchVotes();
  fetchAndRenderSavedStories();

  // Re-fetch votes and saved stories if login state changes
  supabase.auth.onAuthStateChange(() => {
    fetchVotes();
    fetchAndRenderSavedStories();
  });
}

// Recant vote handler
document.addEventListener('click', async (e) => {
  if (!e.target.matches('.recant-btn')) return;

  const storyId = e.target.dataset.storyId;
  const result = await recantVote(storyId);

  if (result.success) {
    alert('Vote recanted!');
    fetchVotes(); // refresh votes list
  } else {
    alert('Could not recant vote.');
  }
});

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', initProfile);