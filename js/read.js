// /js/read.js

// =========================
// IMPORTS
// =========================
// Import shared Supabase client, auth helpers, story query helper,
// and reading-progress helpers for the reader page.
import { supabase } from './supabase.js';
import { updateUI, logout } from './auth.js';
import { getQueryParam } from './story.js';
import {
  fetchReadingProgressForStory,
  upsertReadingProgress
} from './reading-progress.js';

// =========================
// DOM REFERENCES
// =========================
// Cache all reader UI elements used throughout the page lifecycle.
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

// =========================
// SHARED READER STATE
// =========================
// Store the current story, page list, active page index,
// and the furthest page the user has reached this session.
let currentStory = null;
let storyPages = [];
let currentPageIndex = 0;
let furthestPageNumberReached = 1;

// =========================
// UI STATE SETTER
// =========================
// Controls loading/error/empty/content visibility for the reader shell.
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

// =========================
// READER HEADER RENDERER
// =========================
// Updates the reader title and author metadata at the top of the page.
function updateReaderHeader() {
  if (!currentStory) {
    titleEl.textContent = 'Story unavailable';
    metaEl.textContent = '';
    return;
  }

  titleEl.textContent = currentStory.title || 'Untitled Story';
  metaEl.textContent = currentStory.author ? `By ${currentStory.author}` : '';
}

// =========================
// URL PAGE PARAM UPDATER
// =========================
// Keeps the browser URL in sync with the page the reader is currently on.
function updateReaderUrl(pageNumber) {
  if (!currentStory?.id || !Number.isInteger(pageNumber) || pageNumber < 1) return;

  const url = new URL(window.location.href);
  url.searchParams.set('id', currentStory.id);
  url.searchParams.set('page', String(pageNumber));

  window.history.replaceState({}, '', url.toString());
}

// =========================
// PAGE INDEX FINDER
// =========================
// Returns the storyPages array index for the requested page number.
// Falls back to page 1 if the requested page is invalid or missing.
function getPageIndexFromPageNumber(pageNumber) {
  if (!storyPages.length) return 0;

  const numericPage = Number(pageNumber);
  if (!Number.isInteger(numericPage) || numericPage < 1) return 0;

  const matchedIndex = storyPages.findIndex(
    (page) => Number(page.page_number) === numericPage
  );

  return matchedIndex >= 0 ? matchedIndex : 0;
}

// =========================
// PROGRESS SAVER
// =========================
// Saves reading progress for the current story, but only if the new page
// is at or beyond the furthest page reached in this session.
async function saveReadingProgressForCurrentPage() {
  if (!currentStory || !storyPages.length) return;

  const currentPage = storyPages[currentPageIndex];
  const currentPageNumber = Number(currentPage?.page_number) || currentPageIndex + 1;

  if (currentPageNumber < furthestPageNumberReached) {
    return;
  }

  furthestPageNumberReached = currentPageNumber;
  await upsertReadingProgress(currentStory.id, currentPageNumber);
}

// =========================
// CURRENT PAGE RENDERER
// =========================
// Renders the currently selected page into the reader UI and optionally
// saves reading progress for the displayed page.
async function renderCurrentPage({ shouldSaveProgress = true } = {}) {
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
  const displayPageNumber = Number(page.page_number) || currentPageIndex + 1;

  imageEl.src = page.image_url || '';
  imageEl.alt = `${currentStory?.title || 'Story'} - Page ${displayPageNumber}`;

  captionEl.textContent = page.caption || '';
  pageIndicatorEl.textContent = `Page ${displayPageNumber} of ${totalPages}`;

  prevBtn.disabled = currentPageIndex === 0;
  nextBtn.disabled = currentPageIndex === totalPages - 1;

  updateReaderUrl(displayPageNumber);

  if (shouldSaveProgress) {
    await saveReadingProgressForCurrentPage();
  }
}

// =========================
// PREVIOUS PAGE NAVIGATOR
// =========================
// Moves the reader backward one page and re-renders the reader.
async function goToPreviousPage() {
  if (currentPageIndex <= 0) return;

  currentPageIndex -= 1;
  await renderCurrentPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================
// NEXT PAGE NAVIGATOR
// =========================
// Moves the reader forward one page and re-renders the reader.
async function goToNextPage() {
  if (currentPageIndex >= storyPages.length - 1) return;

  currentPageIndex += 1;
  await renderCurrentPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================
// READER DATA LOADER
// =========================
// Loads story metadata, story pages, restores the correct starting page,
// and seeds the reader's progress-tracking state.
async function loadReader() {
  const storyId = getQueryParam('id');
  const requestedPageParam = getQueryParam('page');

  if (!storyId) {
    currentStory = null;
    storyPages = [];
    currentPageIndex = 0;
    furthestPageNumberReached = 1;
    titleEl.textContent = 'No story specified';
    metaEl.textContent = '';
    setState('error', 'No story ID was provided.');
    return;
  }

  backToStoryLink.href = `/gallery/story.html?id=${storyId}`;

  try {
    setState('loading');

    // =========================
    // STORY LOOKUP
    // =========================
    // Load the story record used for the reader header.
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

    // =========================
    // PAGE LOOKUP
    // =========================
    // Load all readable pages for the story in ascending page order.
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
      currentPageIndex = 0;
      furthestPageNumberReached = 1;
      setState('empty');
      await renderCurrentPage({ shouldSaveProgress: false });
      return;
    }

    // =========================
    // EXISTING PROGRESS LOOKUP
    // =========================
    // Load any previously saved reading progress for this user and story.
    const existingProgress = await fetchReadingProgressForStory(storyId);
    const savedPageNumber = Number(existingProgress?.page_number) || 1;

    // =========================
    // STARTING PAGE DECISION
    // =========================
    // Prefer the explicit ?page= param if present; otherwise fall back
    // to the user's previously saved page number.
    const requestedPageNumber = Number(requestedPageParam);
    const hasExplicitRequestedPage =
      Number.isInteger(requestedPageNumber) && requestedPageNumber >= 1;

    const initialPageNumber = hasExplicitRequestedPage
      ? requestedPageNumber
      : savedPageNumber;

    currentPageIndex = getPageIndexFromPageNumber(initialPageNumber);

    const actualInitialPageNumber =
      Number(storyPages[currentPageIndex]?.page_number) || currentPageIndex + 1;

    // =========================
    // FURTHEST PAGE SEEDING
    // =========================
    // Seed the furthest page reached to the larger of:
    // - saved database progress
    // - current initial page actually being opened
    furthestPageNumberReached = Math.max(savedPageNumber, actualInitialPageNumber);

    setState('content');
    await renderCurrentPage({ shouldSaveProgress: true });
  } catch (err) {
    console.error('Reader load error:', err);
    currentStory = null;
    storyPages = [];
    currentPageIndex = 0;
    furthestPageNumberReached = 1;
    titleEl.textContent = 'Unable to load story';
    metaEl.textContent = '';
    setState('error', err.message || 'Failed to load story pages.');
  }
}

// =========================
// EVENT ATTACHER
// =========================
// Wires logout, button navigation, and keyboard navigation events.
function attachEvents() {
  document.querySelectorAll('.logout-link').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout();
      window.location.href = '/';
    });
  });

  prevBtn.addEventListener('click', async () => {
    await goToPreviousPage();
  });

  nextBtn.addEventListener('click', async () => {
    await goToNextPage();
  });

  document.addEventListener('keydown', async (e) => {
    if (contentEl.style.display !== 'block') return;

    if (e.key === 'ArrowLeft') {
      await goToPreviousPage();
    }

    if (e.key === 'ArrowRight') {
      await goToNextPage();
    }
  });
}

// =========================
// PAGE INITIALIZER
// =========================
// Updates auth-aware UI, wires events, and loads the reader page.
document.addEventListener('DOMContentLoaded', async () => {
  updateUI();
  attachEvents();
  await loadReader();
});