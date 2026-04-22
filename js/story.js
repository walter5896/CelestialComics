// /js/story.js
import { supabase } from './supabase.js';
import { setStories, setSelectedStoryId } from './state.js';

const titleEl = document.querySelector('.story-title');
const metaEl = document.querySelector('.story-meta');
const heroImg = document.querySelector('.story-hero-img');
const contentEl = document.querySelector('.story-content');

/** Get URL query parameter */
export function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setStoryTitle(text) {
  if (titleEl) {
    titleEl.textContent = text;
  }
}

function setStoryMeta(text = '') {
  if (metaEl) {
    metaEl.textContent = text;
  }
}

function setStoryHero(story) {
  if (!heroImg) return;

  const imageUrl = story?.cover_image_url || story?.image_url || '';
  const imageAlt = story?.title || 'Story concept cover';

  if (imageUrl) {
    heroImg.src = imageUrl;
    heroImg.alt = imageAlt;
    heroImg.style.display = 'block';
  } else {
    heroImg.removeAttribute('src');
    heroImg.alt = 'No story image available';
    heroImg.style.display = 'none';
  }
}

function setStoryContent(story) {
  if (!contentEl) return;

  const safeDescription = escapeHtml(
    story?.description || 'No concept description available yet.'
  );

  contentEl.innerHTML = `
    <p>${safeDescription}</p>
  `;
}

function renderMissingStoryState(message = 'Story concept not found') {
  setStoryTitle(message);
  setStoryMeta('');
  setStoryHero(null);

  if (contentEl) {
    contentEl.innerHTML = '<p>No story concept could be loaded.</p>';
  }
}

/** Load and render a concept/story detail page */
export async function loadStory() {
  const storyId = getQueryParam('id');

  if (!storyId) {
    setSelectedStoryId(null);
    renderMissingStoryState('No story concept specified');
    return null;
  }

  setSelectedStoryId(String(storyId));

  try {
    const { data: story, error } = await supabase
      .from('stories')
      .select(`
        id,
        title,
        author,
        description,
        image_url,
        cover_image_url,
        active,
        story_status,
        production_stage_label,
        release_date,
        is_preview_enabled,
        preview_page_count,
        is_digital_purchase_available,
        is_paperback_available,
        bundle_purchase_available
      `)
      .eq('id', storyId)
      .maybeSingle();

    if (error || !story) {
      console.error('Story fetch error:', error);
      renderMissingStoryState('Story concept not found');
      return null;
    }

    setStories([story]);

    setStoryTitle(story.title || 'Untitled Concept');
    setStoryMeta(story.author ? `By ${story.author}` : '');
    setStoryHero(story);
    setStoryContent(story);

    return story;
  } catch (err) {
    console.error('Unexpected error loading story:', err);
    renderMissingStoryState('Error loading concept');
    return null;
  }
}