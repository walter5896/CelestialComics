// /js/gallery.js
import { supabase } from './supabase.js';

/**
 * Fetch all stories from Supabase
 */
async function fetchStories() {
  const { data, error } = await supabase
    .from('stories')
    .select('id, title, image_url')
    .order('id', { ascending: true });

  if (error) {
    console.error('Failed to fetch stories:', error);
    return [];
  }

  return data;
}

/**
 * Render the gallery grid dynamically
 */
function renderGallery(stories) {
  const galleryGrid = document.querySelector('.gallery-grid');

  if (!galleryGrid) {
    console.error('No gallery grid found on page.');
    return;
  }

  // Clear any existing content
  galleryGrid.innerHTML = '';

  // Create story cards
  stories.forEach(story => {
    const card = document.createElement('article');
    card.className = 'story-card';
    card.innerHTML = `
      <img src="${story.image_url}" alt="${story.title}" />
      <h3>${story.title}</h3>
      <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">Read More</a>
    `;
    galleryGrid.appendChild(card);
  });
}

/**
 * Initialize the gallery page
 */
async function initGallery() {
  try {
    const stories = await fetchStories();

    if (!stories || stories.length === 0) {
      const galleryGrid = document.querySelector('.gallery-grid');
      if (galleryGrid) galleryGrid.innerHTML = '<p>No stories found.</p>';
      return;
    }

    renderGallery(stories);
  } catch (err) {
    console.error('Error initializing gallery:', err);
  }
}

// Run when the page loads
document.addEventListener('DOMContentLoaded', initGallery);
