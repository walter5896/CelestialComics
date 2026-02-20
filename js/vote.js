// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

/**
 * Fetch stories and vote counts
 */
async function fetchStoriesWithVotes() {
  try {
    // Get all stories
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select('id, title, image_url');

    if (storiesError) {
      console.error('Failed to load stories:', storiesError);
      return { stories: null, error: storiesError };
    }

    // Get all votes for these stories
    const storyIds = stories.map(s => s.id);
    const { data: votesData, error: votesError } = await supabase
      .from('votes')
      .select('story_id')
      .in('story_id', storyIds);

    if (votesError) {
      console.error('Failed to load votes:', votesError);
      return { stories, error: votesError };
    }

    // Count votes per story
    const voteCounts = votesData.reduce((acc, v) => {
      acc[v.story_id] = (acc[v.story_id] || 0) + 1;
      return acc;
    }, {});

    // Combine vote counts with stories
    const storiesWithVotes = stories.map(story => ({
      ...story,
      vote_count: voteCounts[story.id] || 0
    }));

    return { stories: storiesWithVotes, error: null };
  } catch (err) {
    console.error('Unexpected error fetching stories:', err);
    return { stories: null, error: err };
  }
}

/**
 * Fetch current user's votes
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
 * Update vote button states
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
 * Render stories
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
      <div class="story-actions">
        <button
          class="btn btn-primary vote-btn"
          data-story-id="${story.id}"
          data-vote-count="${story.vote_count}"
        >
          Vote (${story.vote_count})
        </button>
        <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">
          Read More
        </a>
      </div>
    `;
    storyGrid.appendChild(card);
  });
}

/**
 * Submit vote
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
    if (error.code === '23505') alert('You already voted!');
    else {
      console.error('Vote error:', error);
      alert('Error submitting vote.');
    }
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

  // Delegate vote clicks
  storyGrid.addEventListener('click', async (e) => {
    if (!e.target.matches('.vote-btn')) return;

    const btn = e.target;
    const storyId = btn.dataset.storyId;

    const result = await submitVote(storyId);
    if (!result.success) return;

    const { stories: refreshedStories } = await fetchStoriesWithVotes();
    renderStories(refreshedStories);

    const userVotes = await fetchUserVotes();
    updateVoteButtons(userVotes);
  });

  supabase.auth.onAuthStateChange(() => {
    refreshUI();
  });
}

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
