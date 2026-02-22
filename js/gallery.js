import { getCurrentUserAsync } from './auth.js';
import { fetchStoriesWithVotes, renderStoriesForGallery, fetchUserVotes, updateVoteButtons, submitVote } from './vote.js';

async function initGallery() {
  try {
    await getCurrentUserAsync();

    const stories = await fetchStoriesWithVotes();
    const grid = document.getElementById('story-grid');

    if (!stories || stories.length === 0) {
      grid.innerHTML = '<p>No stories found.</p>';
      return;
    }

    renderStoriesForGallery(stories, 'story-grid');  // ✅ updated function

    const userVotes = await fetchUserVotes();
    updateVoteButtons(userVotes, stories);

    grid.addEventListener('click', async (e) => {
      if (!e.target.matches('.vote-btn')) return;
      const storyId = e.target.dataset.storyId;
      const success = await submitVote(storyId);
      if (!success) return;

      const updatedStories = await fetchStoriesWithVotes();
      renderStoriesForGallery(updatedStories, 'story-grid');

      const updatedVotes = await fetchUserVotes();
      updateVoteButtons(updatedVotes, updatedStories);
    });

  } catch (err) {
    console.error('Gallery init error:', err);
    const grid = document.getElementById('story-grid');
    if (grid) grid.innerHTML = '<p class="error">Failed to load stories.</p>';
  }
}

document.addEventListener('DOMContentLoaded', initGallery);