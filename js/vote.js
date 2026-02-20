// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

/**
 * Fetch stories with vote counts
 */
async function fetchStoriesWithVotes() {
  const { data, error } = await supabase
    .from('stories')
    .select(`
      id,
      title,
      image_url,
      short_description,
      votes: votes!votes_story_id_fkey (id)
    `)
    .order('id', { ascending: true });

  if (error) {
    console.error('Failed to load stories:', error);
    return { stories: null, error };
  }

  const stories = data.map(story => ({
    ...story,
    vote_count: story.votes ? story.votes.length : 0
  }));

  return { stories, error: null };
}

/**
 * Fetch the current user's votes
 */
async function fetchUserVotes() {
  const user = getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('votes')
    .select('story_id')
    .eq('user_id', user.id);

  if (error) {
    console.error('Error fetching user votes:', error);
    return [];
  }

  return data.map(v => v.story_id);
}

/**
 * Disable vote buttons if user already voted
 */
function updateVoteButtons(userVotes) {
  document.querySelectorAll('.vote-btn').forEach(btn => {
    const storyId = btn.dataset.storyId;

    if (userVotes.includes(storyId)) {
      btn.disabled = true;
      btn.textContent = `Voted (${btn.dataset.voteCount || 0})`;
      btn.classList.add('voted');
    } else {
      btn.disabled = false;
      btn.textContent = `Vote (${btn.dataset.voteCount || 0})`;
      btn.classList.remove('voted');
    }
  });
}

/**
 * Render stories to the page with Vote + Read More
 */
function renderStories(stories) {
  const storyGrid = document.getElementById('story-grid');
  storyGrid.innerHTML = '';

  stories.forEach(story => {
    const card = document.createElement('article');
    card.className = 'story-card';
    card.innerHTML = `
      <img src="${story.image_url}" alt="${story.title}" />
      <h3>${story.title}</h3>
      <p>${story.short_description || ''}</p>
      <div class="story-buttons">
        <button
          class="btn btn-primary vote-btn"
          data-story-id="${story.id}"
          data-vote-count="${story.vote_count}"
        >
          Vote (${story.vote_count})
        </button>
        <a href="/gallery/story.html?id=${story.id}" class="btn btn-secondary">Read More</a>
      </div>
    `;
    storyGrid.appendChild(card);
  });
}

/**
 * Submit a vote
 */
async function submitVote(storyId) {
  const user = getCurrentUser();
  if (!user) {
    alert('You must be logged in to vote!');
    return { success: false };
  }

  const { error } = await supabase
    .from('votes')
    .insert([{ story_id: storyId, user_id: user.id }]);

  if (error) {
    if (error.code === '23505') {
      alert('You already voted!');
      return { success: false };
    }

    console.error('Vote error:', error);
    alert('Error submitting vote.');
    return { success: false };
  }

  return { success: true };
}

/**
 * Initialize voting page
 */
async function initVotingPage() {
  const votingOpen = document.getElementById('voting-open');
  const votingClosed = document.getElementById('voting-closed');
  const storyGrid = document.getElementById('story-grid');

  if (!votingOpen || !votingClosed || !storyGrid) return;

  // Force voting open for now
  votingOpen.style.display = 'block';
  votingClosed.style.display = 'none';

  // Load stories with vote counts
  const { stories, error } = await fetchStoriesWithVotes();
  if (error) {
    storyGrid.innerHTML = '<p class="error">Failed to load stories.</p>';
    return;
  }

  if (!stories || stories.length === 0) {
    storyGrid.innerHTML = '<p>No stories found.</p>';
    return;
  }

  renderStories(stories);

  // Login prompt UI
  const loginPrompt = document.getElementById('login-prompt');

  async function refreshUI() {
    const user = getCurrentUser();

    if (!user) {
      document.querySelectorAll('.vote-btn').forEach(btn => (btn.disabled = true));
      if (loginPrompt) loginPrompt.style.display = 'block';
      return;
    }

    if (loginPrompt) loginPrompt.style.display = 'none';

    const userVotes = await fetchUserVotes();
    updateVoteButtons(userVotes);
  }

  await refreshUI();

  // Vote handler (delegated)
  storyGrid.addEventListener('click', async (e) => {
    if (!e.target.matches('.vote-btn')) return;

    const btn = e.target;
    const storyId = btn.dataset.storyId;

    const result = await submitVote(storyId);
    if (!result.success) return;

    // Refresh UI after successful vote
    const { stories: refreshedStories } = await fetchStoriesWithVotes();
    renderStories(refreshedStories);

    const userVotes = await fetchUserVotes();
    updateVoteButtons(userVotes);
  });

  // Listen for auth changes
  supabase.auth.onAuthStateChange(() => {
    refreshUI();
  });
}

// Run on load
document.addEventListener('DOMContentLoaded', initVotingPage);

/**
 * Recant vote
 */
export async function recantVote(storyId) {
  const user = getCurrentUser();
  if (!user) return { success: false, error: 'Not logged in' };

  const { error } = await supabase
    .from('votes')
    .delete()
    .eq('user_id', user.id)
    .eq('story_id', storyId);

  if (error) return { success: false, error };

  return { success: true };
}
