// /js/read.js

// =========================
// IMPORTS
// =========================
import { supabase } from './supabase.js';
import { updateUI, logout, getCurrentUserAsync } from './auth.js';
import { getQueryParam } from './story.js';
import {
  fetchReadingProgressForStory,
  upsertReadingProgress
} from './reading-progress.js';

// =========================
// DOM REFERENCES
// =========================
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
let currentStory = null;
let storyPages = [];
let currentPageIndex = 0;
let furthestPageNumberReached = 1;

let currentUser = null;
let userOwnsStoryAccess = false;
let readerAccessMode = 'full'; // 'full' | 'preview'
let previewPageLimit = 0;

// =========================
// UI STATE SETTER
// =========================
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
// HELPERS
// =========================
function getStoryBackLink(story) {
  if (!story) return '/gallery/';

  if (story.story_status === 'released') {
    return `/comics/story.html?id=${story.id}`;
  }

  return `/gallery/story.html?id=${story.id}`;
}

function getReaderMetaText() {
  if (!currentStory) return '';

  const authorText = currentStory.author ? `By ${currentStory.author}` : 'Author not listed';

  if (readerAccessMode === 'preview' && currentStory.story_status === 'released') {
    return `${authorText} • Preview Mode`;
  }

  if (userOwnsStoryAccess && currentStory.story_status === 'released') {
    return `${authorText} • Owned Digital Access`;
  }

  return authorText;
}

function getPageIndexFromPageNumber(pageNumber) {
  if (!storyPages.length) return 0;

  const numericPage = Number(pageNumber);
  if (!Number.isInteger(numericPage) || numericPage < 1) return 0;

  const matchedIndex = storyPages.findIndex(
    (page) => Number(page.page_number) === numericPage
  );

  return matchedIndex >= 0 ? matchedIndex : 0;
}

function updateReaderUrl(pageNumber) {
  if (!currentStory?.id || !Number.isInteger(pageNumber) || pageNumber < 1) return;

  const url = new URL(window.location.href);
  url.searchParams.set('id', currentStory.id);
  url.searchParams.set('page', String(pageNumber));

  window.history.replaceState({}, '', url.toString());
}

function getPreviewPagesFromAllPages(allPages, story) {
  if (!Array.isArray(allPages) || !allPages.length) return [];

  const explicitlyMarkedPreviewPages = allPages.filter((page) => page.is_preview_page);

  if (explicitlyMarkedPreviewPages.length > 0) {
    return explicitlyMarkedPreviewPages;
  }

  const count = Number(story?.preview_page_count) || 0;

  if (count <= 0) {
    return [];
  }

  return allPages.slice(0, count);
}

// =========================
// ACCESS CHECK
// =========================
async function checkUserStoryAccess(storyId) {
  if (!currentUser?.id || !storyId) {
    return false;
  }

  const { data, error } = await supabase
    .from('user_story_access')
    .select('id, access_type')
    .eq('user_id', currentUser.id)
    .eq('story_id', storyId)
    .limit(1);

  if (error) {
    throw error;
  }

  return Array.isArray(data) && data.length > 0;
}

// =========================
// STORY + PAGE LOADING
// =========================
async function loadStoryRecord(storyId) {
  const { data: story, error } = await supabase
    .from('stories')
    .select(`
      id,
      title,
      author,
      cover_image_url,
      description,
      active,
      story_status,
      is_preview_enabled,
      preview_page_count
    `)
    .eq('id', storyId)
    .single();

  if (error || !story) {
    throw new Error('Story not found.');
  }

  return story;
}

async function loadAllStoryPages(storyId) {
  const { data: pages, error } = await supabase
    .from('story_pages')
    .select('id, story_id, page_number, image_url, caption, is_preview_page')
    .eq('story_id', storyId)
    .order('page_number', { ascending: true });

  if (error) {
    throw error;
  }

  return pages || [];
}

// =========================
// READER HEADER RENDERER
// =========================
function updateReaderHeader() {
  if (!currentStory) {
    titleEl.textContent = 'Story unavailable';
    metaEl.textContent = '';
    return;
  }

  titleEl.textContent = currentStory.title || 'Untitled Story';
  metaEl.textContent = getReaderMetaText();
}

// =========================
// PROGRESS SAVER
// =========================
async function saveReadingProgressForCurrentPage() {
  if (!currentStory || !storyPages.length) return;
  if (readerAccessMode !== 'full') return;
  if (!currentUser) return;

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
// NAVIGATION
// =========================
async function goToPreviousPage() {
  if (currentPageIndex <= 0) return;

  currentPageIndex -= 1;
  await renderCurrentPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function goToNextPage() {
  if (currentPageIndex >= storyPages.length - 1) return;

  currentPageIndex += 1;
  await renderCurrentPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================
// READER DATA LOADER
// =========================
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

  try {
    setState('loading');

    currentStory = await loadStoryRecord(storyId);
    backToStoryLink.href = getStoryBackLink(currentStory);

    // =========================
    // ACCESS MODE DECISION
    // =========================
    // Released stories use paid-access logic.
    // Non-released stories keep existing readable behavior for now.
    if (currentStory.story_status === 'released') {
      userOwnsStoryAccess = await checkUserStoryAccess(storyId);

      if (userOwnsStoryAccess) {
        readerAccessMode = 'full';
      } else {
        readerAccessMode = 'preview';
      }
    } else {
      userOwnsStoryAccess = false;
      readerAccessMode = 'full';
    }

    updateReaderHeader();

    const allPages = await loadAllStoryPages(storyId);

    if (!allPages.length) {
      storyPages = [];
      currentPageIndex = 0;
      furthestPageNumberReached = 1;
      setState('empty');
      await renderCurrentPage({ shouldSaveProgress: false });
      return;
    }

    if (readerAccessMode === 'preview') {
      if (!currentStory.is_preview_enabled) {
        throw new Error('This comic preview is not currently available.');
      }

      const previewPages = getPreviewPagesFromAllPages(allPages, currentStory);
      previewPageLimit = previewPages.length;

      if (!previewPages.length) {
        throw new Error('This comic preview is not currently available.');
      }

      storyPages = previewPages;
      currentPageIndex = getPageIndexFromPageNumber(requestedPageParam);

      // If ?page requests beyond preview, snap back to the first preview page.
      if (currentPageIndex >= storyPages.length) {
        currentPageIndex = 0;
      }

      furthestPageNumberReached =
        Number(storyPages[currentPageIndex]?.page_number) || 1;

      setState('content');
      await renderCurrentPage({ shouldSaveProgress: false });
      return;
    }

    // =========================
    // FULL ACCESS READER MODE
    // =========================
    storyPages = allPages;

    const existingProgress = await fetchReadingProgressForStory(storyId);
    const savedPageNumber = Number(existingProgress?.page_number) || 1;

    const requestedPageNumber = Number(requestedPageParam);
    const hasExplicitRequestedPage =
      Number.isInteger(requestedPageNumber) && requestedPageNumber >= 1;

    const initialPageNumber = hasExplicitRequestedPage
      ? requestedPageNumber
      : savedPageNumber;

    currentPageIndex = getPageIndexFromPageNumber(initialPageNumber);

    const actualInitialPageNumber =
      Number(storyPages[currentPageIndex]?.page_number) || currentPageIndex + 1;

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
document.addEventListener('DOMContentLoaded', async () => {
  updateUI();
  currentUser = await getCurrentUserAsync();
  attachEvents();
  await loadReader();
});