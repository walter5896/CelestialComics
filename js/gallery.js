// /js/gallery.js
import { updateUI, logout, getCurrentUserAsync } from './auth.js';
import { fetchStoriesWithVotes, renderStories, fetchUserVotes, updateVoteButtons, submitVote } from './vote.js';

async function initGallery() {
  // Update login/logout/profile UI
  updateUI();
  document.querySelectorAll('.logout-link').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout();
    });
  });

  const storyGrid = document.getElementById('story-grid');

  try {
    const user = await getCurrentUserAsync();
    const stories = await fetchStoriesWithVotes();

    if (!stories || stories.length === 0) {
      storyGrid.innerHTML = '<p>No stories found.</p>';
      return;
    }

    renderStories(stories, 'story-grid');

    // Update vote button states
    const userVotes = user ? await fetchUserVotes() : [];
    updateVoteButtons(userVotes, stories);

    // Event delegation for voting
    storyGrid.addEventListener('click', async (e) => {
      if (!e.target.matches('.vote-btn')) return;

      const btn = e.target;
      const storyId = btn.dataset.storyId;

      const success = await submitVote(storyId);
      if (!success) return;

      // Refresh stories and vote buttons
      const updatedStories = await fetchStoriesWithVotes();
      renderStories(updatedStories, 'story-grid');

      const updatedVotes = user ? await fetchUserVotes() : [];
      updateVoteButtons(updatedVotes, updatedStories);
    });

  } catch (err) {
    console.error('Gallery load error:', err);
    storyGrid.innerHTML = '<p class="error">Failed to load stories.</p>';
  }
}

document.addEventListener('DOMContentLoaded', initGallery);