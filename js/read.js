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

function setState(state, message = '') {
  loadingEl.style.display = state === 'loading' ? 'block' : 'none';
  errorEl.style.display = state === 'error' ? 'block' : 'none';
  emptyEl.style.display = state === 'empty' ? 'block' : 'none';
  contentEl.style.display = state === 'content' ? 'block' : 'none';

  if (state === 'error') {
    errorEl.textContent = message || 'Failed to load story pages.';
  }

  if (state !== 'content') {
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  }
}

function updateReaderHeader() {
  if (!currentStory) {
    titleEl.textContent = 'Story unavailable';
    metaEl.textContent = '';
    return;
  }

  titleEl.textContent = currentStory.title || 'Untitled Story';
  metaEl.textContent = currentStory.author ? `By ${currentStory.author}` : '';
}

function renderCurrentPage() {
  if (!storyPages.length) {
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    imageEl.src = '';
    imageEl.alt = '';
    captionEl.textContent = '';
    pageIndicatorEl.textContent = 'Page 0 of 0';
    return;
  }

  const page = storyPages[currentPageIndex];
  const totalPages = storyPages.length;
  const displayPageNumber = currentPageIndex + 1;

  imageEl.src = page.image_url || '';
  imageEl.alt = `${currentStory?.title || 'Story'} - Page ${page.page_number || displayPageNumber}`;

  captionEl.textContent = page.caption || '';
  pageIndicatorEl.textContent = `Page ${displayPageNumber} of ${totalPages}`;

  prevBtn.disabled = currentPageIndex === 0;
  nextBtn.disabled = currentPageIndex === totalPages - 1;
}

function goToPreviousPage() {
  if (currentPageIndex <= 0) return;
  currentPageIndex -= 1;
  renderCurrentPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToNextPage() {
  if (currentPageIndex >= storyPages.length - 1) return;
  currentPageIndex += 1;
  renderCurrentPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadReader() {
  const storyId = getQueryParam('id');

  if (!storyId) {
    currentStory = null;
    storyPages = [];
    currentPageIndex = 0;
    titleEl.textContent = 'No story specified';
    metaEl.textContent = '';
    setState('error', 'No story ID was provided.');
    return;
  }

  backToStoryLink.href = `/gallery/story.html?id=${storyId}`;

  try {
    setState('loading');

    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('id, title, author, cover_image_url, description, active')
      .eq('id', storyId)
      .single();

    if (storyError || !story) {
      throw new Error('Story not found.');
    }

    currentStory = story;
    updateReaderHeader();

    const { data: pages, error: pagesError } = await supabase
      .from('story_pages')
      .select('id, story_id, page_number, image_url, caption')
      .eq('story_id', storyId)
      .order('page_number', { ascending: true });

    if (pagesError) {
      throw pagesError;
    }

    storyPages = pages || [];
    currentPageIndex = 0;

    if (!storyPages.length) {
      setState('empty');
      renderCurrentPage();
      return;
    }

    renderCurrentPage();
    setState('content');
  } catch (err) {
    console.error('Reader load error:', err);
    currentStory = null;
    storyPages = [];
    currentPageIndex = 0;
    titleEl.textContent = 'Unable to load story';
    metaEl.textContent = '';
    setState('error', err.message || 'Failed to load story pages.');
  }
}

function attachEvents() {
  document.querySelectorAll('.logout-link').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout();
      location.reload();
    });
  });

  prevBtn.addEventListener('click', goToPreviousPage);
  nextBtn.addEventListener('click', goToNextPage);

  document.addEventListener('keydown', (e) => {
    if (contentEl.style.display !== 'block') return;

    if (e.key === 'ArrowLeft') {
      goToPreviousPage();
    }

    if (e.key === 'ArrowRight') {
      goToNextPage();
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  updateUI();
  attachEvents();
  await loadReader();
});