// /js/gallery.js
import { waitForAuthReady, logout } from './auth.js';
import { fetchConceptBankStories, renderStoriesForGallery } from './vote.js';
import { setStories, getState } from './state.js';

const storyGrid = document.getElementById('story-grid');

let galleryInitialized = false;
let logoutBound = false;

function renderGalleryMessage(message, className = '') {
  if (!storyGrid) return;

  storyGrid.innerHTML = `
    <p class="${className}">
      ${message}
    </p>
  `;
}

function renderGalleryError(message = 'Failed to load story concepts.') {
  renderGalleryMessage(message, 'error');
}

function renderGalleryEmpty() {
  renderGalleryMessage('No story concepts found yet. Check back soon for new Celestial Comics concepts.');
}

function renderGalleryLoading() {
  renderGalleryMessage('Loading story concepts...');
}

function renderGalleryFromState() {
  if (!storyGrid) return;

  const { stories = [] } = getState();
  const safeStories = Array.isArray(stories) ? stories : [];

  if (!safeStories.length) {
    renderGalleryEmpty();
    return;
  }

  renderStoriesForGallery(safeStories, 'story-grid');
}

function bindLogoutLinks() {
  if (logoutBound) return;
  logoutBound = true;

  document.querySelectorAll('.logout-link').forEach((el) => {
    el.addEventListener('click', async (event) => {
      event.preventDefault();

      const result = await logout();

      if (!result?.success) {
        alert(result?.error || 'Logout failed.');
        return;
      }

      window.location.href = '/';
    });
  });
}

async function loadGalleryStories() {
  if (!storyGrid) return;

  try {
    renderGalleryLoading();

    const stories = await fetchConceptBankStories();
    const safeStories = Array.isArray(stories) ? stories : [];

    setStories(safeStories);
    renderGalleryFromState();
  } catch (error) {
    console.error('Gallery load error:', error);
    renderGalleryError(error?.message || 'Failed to load story concepts.');
  }
}

async function initGallery() {
  if (galleryInitialized) return;
  galleryInitialized = true;

  try {
    await waitForAuthReady();
    bindLogoutLinks();
    await loadGalleryStories();
  } catch (error) {
    console.error('Gallery init error:', error);
    renderGalleryError();
  }
}

document.addEventListener('DOMContentLoaded', initGallery);