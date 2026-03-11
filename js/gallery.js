// /js/gallery.js
import { getCurrentUserAsync, updateUI, logout } from './auth.js';
import { fetchStoriesWithVotes, renderStoriesForGallery } from './vote.js';

async function initGallery() {
  try {
    await getCurrentUserAsync(); // wait for auth state
    updateUI();

    document.querySelectorAll('.logout-link').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        await logout();
        location.reload();
      });
    });

    const stories = await fetchStoriesWithVotes();

    const grid = document.getElementById('story-grid');
    if (!grid) return;

    if (!stories || stories.length === 0) {
      grid.innerHTML = '<p>No stories found.</p>';
      return;
    }

    renderStoriesForGallery(stories, 'story-grid');
  } catch (err) {
    console.error('Gallery init error:', err);
    const grid = document.getElementById('story-grid');
    if (grid) {
      grid.innerHTML = '<p class="error">Failed to load stories.</p>';
    }
  }
}

document.addEventListener('DOMContentLoaded', initGallery);
