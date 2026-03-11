// /js/read.js
import { supabase } from './supabase.js';
import { updateUI, logout } from './auth.js';
import { getQueryParam } from './story.js';

const titleEl = document.getElementById('reader-title');
const metaEl = document.getElementById('reader-meta');
const backToStoryLink = document.getElementById('back-to-story-link');

const loadingEl = document.getElementById('reader-loading');
const errorEl = document.getElementById('reader-error');
const emptyEl = document.getElementById('reader-empty');
const contentEl = document.getElementById('reader-content');

const imageEl = document.getElementById('reader-image');
const captionEl = document.getElementById('reader-caption');
const pageIndicatorEl = document.getElementById('reader-page-indicator');

const prevBtn = document.getElementById('prev-page-btn');
const nextBtn = document.getElementById('next-page-btn');

let currentStory = null;
let storyPages = [];
let currentPageIndex = 0;

function showState(state, message = '') {
  loadingEl.style.display = state === 'loading' ? 'block' : 'none';
  errorEl.style.display = state === 'error' ? 'block' : 'none';
  emptyEl.style.display = state === 'empty' ? 'block' : 'none';
  contentEl.style.display = state === 'content' ? 'block' : 'none';

  if (state === 'error') {
    errorEl.textContent = message || 'Failed to load story pages.';
  }
}

function renderCurrentPage() {
  if (!storyPages.length) return;

  const page = storyPages[currentPageIndex];
  const pageNumber = currentPageIndex + 1;
  const totalPages = storyPages.length;

  imageEl.src = page.image_url || '';
  imageEl.alt = `${currentStory?.title || 'Story'} - Page ${page.page_number || pageNumber}`;

  captionEl.textContent = page.caption || '';
  pageIndicatorEl.textContent = `Page ${pageNumber} of ${totalPages}`;

  prevBtn.disabled = currentPageIndex === 0;
  nextBtn.disabled = currentPageIndex === totalPages - 1;
}

async function loadReader() {
  const storyId = getQueryParam('id');

  if (!storyId) {
    titleEl.textContent = 'No story specified';
    metaEl.textContent = '';
    showState('error', 'No story ID was provided.');
    return;
  }

  backToStoryLink.href = `/gallery/story.html?id=${storyId}`;

  try {
    showState('loading');

    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('id, title, author, cover_image_url, description, active')
      .eq('id', storyId)
      .single();

    if (storyError || !story) {
      throw new Error('Story not found.');
    }

    currentStory = story;

    titleEl.textContent = story.title || 'Untitled Story';
    metaEl.textContent = story.author ? `By ${story.author}` : '';

    const { data: pages, error: pagesError } = await supabase
      .from('story_pages')
      .select('id, story_id, page_number, image_url, caption')
      .eq('story_id', storyId)
      .order('page_number', { ascending: true });

    if (pagesError) {
      throw pagesError;
    }

    storyPages = pages || [];

    if (!storyPages.length) {
      showState('empty');
      return;
    }

    currentPageIndex = 0;
    renderCurrentPage();
    showState('content');
  } catch (err) {
    console.error('Reader load error:', err);
    titleEl.textContent = 'Unable to load story';
    metaEl.textContent = '';
    showState('error', err.message || 'Failed to load story pages.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  updateUI();

  document.querySelectorAll('.logout-link').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout();
      location.reload();
    });
  });

  prevBtn.addEventListener('click', () => {
    if (currentPageIndex > 0) {
      currentPageIndex -= 1;
      renderCurrentPage();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentPageIndex < storyPages.length - 1) {
      currentPageIndex += 1;
      renderCurrentPage();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  await loadReader();
});