// /js/story.js
import { supabase } from './supabase.js';

/** Get URL query parameter */
export function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

/** Load and render a concept/story detail page */
export async function loadStory() {
  const storyId = getQueryParam('id');

  const titleEl = document.querySelector('.story-title');
  const metaEl = document.querySelector('.story-meta');
  const heroImg = document.querySelector('.story-hero-img');
  const contentEl = document.querySelector('.story-content');

  if (!storyId) {
    if (titleEl) titleEl.textContent = 'No story concept specified';
    return null;
  }

  try {
    const { data: story, error } = await supabase
      .from('stories')
      .select('*')
      .eq('id', storyId)
      .single();

    if (error || !story) {
      console.error('Story fetch error:', error);
      if (titleEl) titleEl.textContent = 'Story concept not found';
      return null;
    }

    if (titleEl) {
      titleEl.textContent = story.title || 'Untitled Concept';
    }

    if (metaEl) {
      metaEl.textContent = story.author ? `By ${story.author}` : '';
    }

    if (heroImg) {
      heroImg.src = story.cover_image_url || story.image_url || '';
      heroImg.alt = story.title || 'Story concept cover';
    }

    if (contentEl) {
      contentEl.innerHTML = `
        <p>${story.description || 'No concept description available yet.'}</p>
      `;
    }

    return story;
  } catch (err) {
    console.error('Unexpected error loading story:', err);
    if (titleEl) titleEl.textContent = 'Error loading concept';
    return null;
  }
}