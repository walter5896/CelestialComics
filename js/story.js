import { supabase } from './supabase.js';

/**
 * Get URL query parameter
 */
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

/**
 * Load and render the story
 */
async function loadStory() {
  const storyId = getQueryParam('id');

  if (!storyId) {
    document.querySelector('.story-title').textContent = 'No story specified';
    return;
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
      return;
    }

    // Inject data into DOM
    document.querySelector('.story-title').textContent = story.title;
    document.querySelector('.story-meta').textContent = `By ${story.author} | Published ${story.published_at}`;
    const heroImg = document.querySelector('.story-hero-img');
    heroImg.src = story.image_url;
    heroImg.alt = story.title;

    document.querySelector('.story-body .container').innerHTML = story.content;
  } catch (err) {
    console.error('Unexpected error loading story:', err);
    document.querySelector('.story-title').textContent = 'Error loading story';
  }
}

// Run on page load
document.addEventListener('DOMContentLoaded', loadStory);
