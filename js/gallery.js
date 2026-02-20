// /js/gallery.js
import { getCurrentUserAsync } from './auth.js';
import { fetchStoriesWithVotes, renderStories, fetchUserVotes, updateVoteButtons } from './vote.js';

/**
 * Initialize Gallery Page
 */
async function initGallery() {
  try {
    // Wait for auth state
    await getCurrentUserAsync();

    // Fetch stories with vote data
    const stories = await fetchStoriesWithVotes();

    if (!stories || stories.length === 0) {
      const grid = document.querySelector('.gallery-grid');
      if (grid) grid.innerHTML = '<p>No stories found.</p>';
      return;
    }

    // Render stories
    renderStories(stories, 'gallery-grid');

    // Update vote buttons
    const userVotes = await fetchUserVotes();
    updateVoteButtons(userVotes, stories);

  } catch (err) {
    console.error('Error initializing gallery:', err);
  }
}

document.addEventListener('DOMContentLoaded', initGallery);
