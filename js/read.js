// /js/read.js

// =========================
// IMPORTS
// =========================
import { supabase } from './supabase.js';
import { logout, getCurrentUserAsync, waitForAuthReady } from './auth.js';
import {
  setSelectedStoryId,
  setStories,
  setOwnedStoryAccess,
  getOwnedStoryIds
} from './state.js';
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
let readerAccessMode = 'preview'; // 'full' | 'preview'
let previewPageLimit = 0;

let readerInitialized = false;
let readerEventsAttached = false;

// =========================
// UI STATE SETTER
// =========================
function setState(state, message = '') {
  if (loadingEl) loadingEl.style.display = state === 'loading' ? 'block' : 'none';
  if (errorEl) errorEl.style.display = state === 'error' ? 'block' : 'none';
  if (emptyEl) emptyEl.style.display = state === 'empty' ? 'block' : 'none';
  if (contentEl) contentEl.style.display = state === 'content' ? 'block' : 'none';

  if (state === 'error' && errorEl) {
    errorEl.textContent = message || 'Failed to load story pages.';
  }

  if (state !== 'content') {
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
  }
}

// =========================
// HELPERS
// =========================
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

function encodeId(value) {
  return encodeURIComponent(String(value ?? ''));
}

function getStoryBackLink(story) {
  if (!story) return '/gallery/';

  if (story.story_status === 'released') {
    return `/comics/story.html?id=${encodeId(story.id)}`;
  }

  return `/gallery/story.html?id=${encodeId(story.id)}`;
}

function storyHasPreviewEnabled(story) {
  return !!story?.is_preview_enabled && Number(story?.preview_page_count || 0) > 0;
}

function getReaderMetaText() {
  if (!currentStory) return '';

  const authorText = currentStory.author ? `By ${currentStory.author}` : 'Author not listed';

  if (readerAccessMode === 'preview') {
    const limitText = previewPageLimit > 0
      ? `Preview Mode • ${previewPageLimit} page${previewPageLimit === 1 ? '' : 's'} available`
      : 'Preview Mode';

    return `${authorText} • ${limitText}`;
  }

  if (userOwnsStoryAccess && currentStory.story_status === 'released') {
    return `${authorText} • Owned Digital Access`;
  }

  return `${authorText} • Full Access`;
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

  const previewCount = Number(story?.preview_page_count) || 0;

  if (!story?.is_preview_enabled || previewCount <= 0) {
    return [];
  }

  const explicitlyMarkedPreviewPages = allPages.filter((page) => page.is_preview_page);

  if (explicitlyMarkedPreviewPages.length > 0) {
    return explicitlyMarkedPreviewPages.slice(0, previewCount);
  }

  return allPages.slice(0, previewCount);
}

function decideReaderAccessMode(story, ownsAccess) {
  if (!story) {
    return 'preview';
  }

  if (story.story_status === 'released') {
    return ownsAccess ? 'full' : 'preview';
  }

  if (storyHasPreviewEnabled(story)) {
    return 'preview';
  }

  return 'preview';
}

// =========================
// ACCESS / OWNERSHIP
// =========================
async function loadOwnedStoryAccessForCurrentUser() {
  if (!currentUser?.id) {
    setOwnedStoryAccess([]);
    return [];
  }

  const { data, error } = await supabase
    .from('user_story_access')
    .select(`
      id,
      user_id,
      story_id,
      access_type,
      granted_at
    `)
    .eq('user_id', currentUser.id)
    .order('granted_at', { ascending: false });

  if (error) {
    throw error;
  }

  const safeRows = data || [];
  setOwnedStoryAccess(safeRows);
  return safeRows;
}

async function checkUserStoryAccess(storyId) {
  if (!currentUser?.id || !storyId) {
    return false;
  }

  await loadOwnedStoryAccessForCurrentUser();
  const ownedStoryIds = getOwnedStoryIds().map(String);

  return ownedStoryIds.includes(String(storyId));
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
      image_url,
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

  setStories([story]);
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
    if (titleEl) titleEl.textContent = 'Story unavailable';
    if (metaEl) metaEl.textContent = '';
    return;
  }

  if (titleEl) {
    titleEl.textContent = currentStory.title || 'Untitled Story';
  }

  if (metaEl) {
    metaEl.textContent = getReaderMetaText();
  }

  if (backToStoryLink) {
    backToStoryLink.href = getStoryBackLink(currentStory);
  }
}

// =========================
// PROGRESS SAVER
// =========================
async function saveReadingProgressForCurrentPage() {
  if (!currentStory || !storyPages.length) return;
  if (!currentUser) return;

  const currentPage = storyPages[currentPageIndex];
  const currentPageNumber = Number(currentPage?.page_number) || currentPageIndex + 1;

  if (readerAccessMode === 'full') {
    // Preserve the furthest page reached, but still refresh updated_at
    // when the user opens this owned comic again.
    const pageToSave = Math.max(currentPageNumber, furthestPageNumberReached);

    furthestPageNumberReached = pageToSave;

    const result = await upsertReadingProgress(currentStory.id, pageToSave);

    if (!result?.success) {
      console.error('Failed to save full reading progress:', result);
    }

    return;
  }

  if (readerAccessMode === 'preview') {
    const result = await upsertReadingProgress(currentStory.id, currentPageNumber);

    if (!result?.success) {
      console.error('Failed to save preview reading progress:', result);
    }
  }
}

// =========================
// CURRENT PAGE RENDERER
// =========================
async function renderCurrentPage({ shouldSaveProgress = true } = {}) {
  if (!storyPages.length) {
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    if (imageEl) {
      imageEl.src = '';
      imageEl.alt = '';
    }

    if (captionEl) captionEl.textContent = '';
    if (pageIndicatorEl) pageIndicatorEl.textContent = 'Page 0 of 0';
    return;
  }

  const page = storyPages[currentPageIndex];
  const totalPages = storyPages.length;
  const displayPageNumber = Number(page.page_number) || currentPageIndex + 1;

  if (imageEl) {
    imageEl.src = page.image_url || '';
    imageEl.alt = `${currentStory?.title || 'Story'} - Page ${displayPageNumber}`;
  }

  if (captionEl) {
    captionEl.textContent = page.caption || '';
  }

  if (pageIndicatorEl) {
    if (readerAccessMode === 'preview') {
      pageIndicatorEl.textContent = `Preview Page ${currentPageIndex + 1} of ${totalPages}`;
    } else {
      pageIndicatorEl.textContent = `Page ${displayPageNumber} of ${totalPages}`;
    }
  }

  if (prevBtn) prevBtn.disabled = currentPageIndex === 0;
  if (nextBtn) nextBtn.disabled = currentPageIndex === totalPages - 1;

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
    currentUser = null;
    userOwnsStoryAccess = false;
    readerAccessMode = 'preview';
    previewPageLimit = 0;
    setSelectedStoryId(null);

    if (titleEl) titleEl.textContent = 'No story specified';
    if (metaEl) metaEl.textContent = '';

    setState('error', 'No story ID was provided.');
    return;
  }

  try {
    setState('loading');
    setSelectedStoryId(String(storyId));

    currentStory = await loadStoryRecord(storyId);
    currentUser = await getCurrentUserAsync();

    userOwnsStoryAccess = currentStory.story_status === 'released'
      ? await checkUserStoryAccess(storyId)
      : false;

    readerAccessMode = decideReaderAccessMode(currentStory, userOwnsStoryAccess);

    const allPages = await loadAllStoryPages(storyId);

    if (!allPages.length) {
      storyPages = [];
      currentPageIndex = 0;
      furthestPageNumberReached = 1;
      previewPageLimit = 0;

      updateReaderHeader();
      setState('empty');
      await renderCurrentPage({ shouldSaveProgress: false });
      return;
    }

    if (readerAccessMode === 'preview') {
      const previewPages = getPreviewPagesFromAllPages(allPages, currentStory);
      previewPageLimit = previewPages.length;

      if (!previewPages.length) {
        updateReaderHeader();
        throw new Error('This story preview is not currently available.');
      }

      storyPages = previewPages;
      currentPageIndex = getPageIndexFromPageNumber(requestedPageParam);

      if (currentPageIndex >= storyPages.length) {
        currentPageIndex = 0;
      }

      furthestPageNumberReached =
        Number(storyPages[currentPageIndex]?.page_number) || 1;

      updateReaderHeader();
      setState('content');
      await renderCurrentPage({ shouldSaveProgress: true });
      return;
    }

    // =========================
    // FULL ACCESS READER MODE
    // =========================
    storyPages = allPages;
    previewPageLimit = 0;

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

    updateReaderHeader();
    setState('content');
    await renderCurrentPage({ shouldSaveProgress: true });
  } catch (err) {
    console.error('Reader load error:', err);

    currentStory = null;
    storyPages = [];
    currentPageIndex = 0;
    furthestPageNumberReached = 1;
    userOwnsStoryAccess = false;
    readerAccessMode = 'preview';
    previewPageLimit = 0;

    if (titleEl) titleEl.textContent = 'Unable to load story';
    if (metaEl) metaEl.textContent = '';

    setState('error', err.message || 'Failed to load story pages.');
  }
}

// =========================
// EVENT ATTACHER
// =========================
function attachEvents() {
  if (readerEventsAttached) return;
  readerEventsAttached = true;

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

  if (prevBtn) {
    prevBtn.addEventListener('click', async () => {
      await goToPreviousPage();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
      await goToNextPage();
    });
  }

  document.addEventListener('keydown', async (event) => {
    if (!contentEl || contentEl.style.display !== 'block') return;

    if (event.key === 'ArrowLeft') {
      await goToPreviousPage();
    }

    if (event.key === 'ArrowRight') {
      await goToNextPage();
    }
  });
}

// =========================
// PAGE INITIALIZER
// =========================
document.addEventListener('DOMContentLoaded', async () => {
  if (readerInitialized) return;
  readerInitialized = true;

  await waitForAuthReady();
  currentUser = await getCurrentUserAsync();
  attachEvents();
  await loadReader();
});