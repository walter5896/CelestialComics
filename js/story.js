// /js/story.js
import { supabase } from './supabase.js';

/** Get URL query parameter */
export function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

/** Load and render a story (NO voting logic here) */
export async function loadStory() {
  const storyId = getQueryParam('id');

  if (!storyId) {
    document.querySelector('.story-title').textContent = 'No story specified';
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
      document.querySelector('.story-title').textContent = 'Story not found';
      return null;
    }

    // Inject into DOM using current schema
    document.querySelector('.story-title').textContent = story.title || 'Untitled Story';
    document.querySelector('.story-meta').textContent = story.author
      ? `By ${story.author}`
      : '';

    const heroImg = document.querySelector('.story-hero-img');
    heroImg.src = story.cover_image_url || story.image_url || '';
    heroImg.alt = story.title || 'Story cover';

    document.querySelector('.story-content').innerHTML =
      `<p>${story.description || 'No story description available yet.'}</p>`;

    return story;
  } catch (err) {
    console.error('Unexpected error loading story:', err);
    document.querySelector('.story-title').textContent = 'Error loading story';
    return null;
  }
}