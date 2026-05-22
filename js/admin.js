// /js/admin.js
import { getCurrentUserAsync, logout } from './auth.js';
import { supabase } from './supabase.js';

import {
  getAccessToken,
  parseJsonResponseSafely
} from './admin-shared.js';

import {
  renderUsersTable,
  initAdminUsers
} from './admin-users.js';

import {
  loadOrdersPreview,
  initAdminOrders
} from './admin-orders.js';

import {
  syncProductFormRules,
  populateReleasedStoryOptions,
  clearProductForm,
  loadProductsPreview,
  initAdminProducts
} from './admin-products.js';

import {
  clearStoryForm,
  loadStoriesPreview,
  initAdminStories,
  getAllStories
} from './admin-stories.js';

import {
  initAdminStoryGallery,
  loadStoryGalleryImagesPreview
} from './admin-story-gallery.js';

import {
  clearTeamMemberForm,
  loadTeamMembersPreview,
  initAdminTeam
} from './admin-team.js';

import {
  loadVotingPeriod,
  hideWinnerPreviewUI,
  resetTieResolutionUI,
  initAdminVoting
} from './admin-voting.js';

import {
  loadHomepageContent,
  initAdminHomepage
} from './admin-homepage.js';

import {
  initAdminFeaturedWinner,
  loadFeaturedWinnerControl
} from './admin-featured-winner.js';

/* =========================
   DOM REFERENCES
========================= */
const statusEl = document.getElementById('status-message');
const table = document.getElementById('users-table');
const tbody = table?.querySelector('tbody');

const votingSection = document.getElementById('voting-section');
const determineWinnerBtn = document.getElementById('determine-winner-btn');
const closeVotingBtn = document.getElementById('close-voting-btn');
const votingForm = document.getElementById('voting-period-form');
const votingStart = document.getElementById('voting-start');
const votingEnd = document.getElementById('voting-end');
const votingMsg = document.getElementById('voting-status-message');

const currentRoundSummary = document.getElementById('current-round-summary');
const finalizedWinnerSummary = document.getElementById('finalized-winner-summary');

const featuredWinnerSelect = document.getElementById('featured-winner-select');
const saveFeaturedWinnerBtn = document.getElementById('save-featured-winner-btn');
const clearFeaturedWinnerBtn = document.getElementById('clear-featured-winner-btn');
const featuredWinnerStatusMsg = document.getElementById('featured-winner-status-message');
const featuredWinnerCurrent = document.getElementById('featured-winner-current');

const tieResolutionPanel = document.getElementById('tie-resolution-panel');
const tieResolutionMessage = document.getElementById('tie-resolution-message');
const tieWinnerSelect = document.getElementById('tie-winner-select');
const finalizeTieBtn = document.getElementById('finalize-tie-btn');

const winnerPreviewPanel = document.getElementById('winner-preview-panel');
const winnerPreviewContent = document.getElementById('winner-preview-content');
const winnerPreviewMessage = document.getElementById('winner-preview-message');
const nextRoundFields = document.getElementById('next-round-fields');
const finalizeOnlyBtn = document.getElementById('finalize-only-btn');
const finalizeAndCreateBtn = document.getElementById('finalize-and-create-btn');

const storySection = document.getElementById('story-management-section');
const storySelect = document.getElementById('story-select');
const storyForm = document.getElementById('story-form');
const saveStoryBtn = document.getElementById('save-story-btn');
const resetStoryBtn = document.getElementById('reset-story-btn');
const deleteStoryBtn = document.getElementById('delete-story-btn');
const storyMsg = document.getElementById('story-status-message');
const storiesPreview = document.getElementById('stories-preview');

const storyTitle = document.getElementById('story-title');
const storyAuthor = document.getElementById('story-author');
const storyDescription = document.getElementById('story-description');
const storyActive = document.getElementById('story-active');
const storyStatusSelect = document.getElementById('story-status-select');
const productionStageSelect = document.getElementById('production-stage-select');
const productionStageLabel = document.getElementById('production-stage-label');
const storyPreviewEnabled = document.getElementById('story-preview-enabled');
const storyPreviewPageCount = document.getElementById('story-preview-page-count');
const storyDigitalAvailable = document.getElementById('story-digital-available');
const storyPaperbackAvailable = document.getElementById('story-paperback-available');
const storyBundleAvailable = document.getElementById('story-bundle-available');
const storyReleaseDate = document.getElementById('story-release-date');

const storyCoverFile = document.getElementById('story-cover-file');
const uploadCoverBtn = document.getElementById('upload-cover-btn');
const deleteCoverBtn = document.getElementById('delete-cover-btn');
const coverUploadMessage = document.getElementById('cover-upload-message');
const coverPreview = document.getElementById('cover-preview');

const storyPageForm = document.getElementById('story-page-form');
const storyPageFile = document.getElementById('story-page-file');
const storyPageCaption = document.getElementById('story-page-caption');
const uploadStoryPageBtn = document.getElementById('upload-story-page-btn');
const storyPageStatusMsg = document.getElementById('story-page-status-message');
const storyPagesPreview = document.getElementById('story-pages-preview');

const storyGalleryImageForm = document.getElementById('story-gallery-image-form');
const storyGalleryImageFile = document.getElementById('story-gallery-image-file');
const storyGalleryCaption = document.getElementById('story-gallery-caption');
const storyGalleryAltText = document.getElementById('story-gallery-alt-text');
const storyGalleryDisplayOrder = document.getElementById('story-gallery-display-order');
const storyGalleryActive = document.getElementById('story-gallery-active');
const uploadStoryGalleryImageBtn = document.getElementById('upload-story-gallery-image-btn');
const storyGalleryStatusMsg = document.getElementById('story-gallery-status-message');
const storyGalleryImagesPreview = document.getElementById('story-gallery-images-preview');

const teamSection = document.getElementById('team-management-section');
const teamMemberSelect = document.getElementById('team-member-select');
const teamMemberForm = document.getElementById('team-member-form');
const saveTeamMemberBtn = document.getElementById('save-team-member-btn');
const resetTeamMemberBtn = document.getElementById('reset-team-member-btn');
const deactivateTeamMemberBtn = document.getElementById('deactivate-team-member-btn');
const teamMemberStatusMsg = document.getElementById('team-member-status-message');
const teamMembersPreview = document.getElementById('team-members-preview');

const teamMemberName = document.getElementById('team-member-name');
const teamMemberRoleTitle = document.getElementById('team-member-role-title');
const teamMemberShortBio = document.getElementById('team-member-short-bio');
const teamMemberFullBio = document.getElementById('team-member-full-bio');
const teamMemberDisplayOrder = document.getElementById('team-member-display-order');
const teamMemberActive = document.getElementById('team-member-active');

const teamMemberImageFile = document.getElementById('team-member-image-file');
const uploadTeamMemberImageBtn = document.getElementById('upload-team-member-image-btn');
const deleteTeamMemberImageBtn = document.getElementById('delete-team-member-image-btn');
const teamMemberImageUploadMessage = document.getElementById('team-member-image-upload-message');
const teamMemberImagePreview = document.getElementById('team-member-image-preview');

const productSection = document.getElementById('product-management-section');
const productSelect = document.getElementById('product-select');
const productForm = document.getElementById('product-form');
const saveProductBtn = document.getElementById('save-product-btn');
const resetProductBtn = document.getElementById('reset-product-btn');
const deactivateProductBtn = document.getElementById('deactivate-product-btn');
const deleteProductImageBtn = document.getElementById('delete-product-image-btn');
const productStatusMsg = document.getElementById('product-status-message');
const productsPreview = document.getElementById('products-preview');

const productName = document.getElementById('product-name');
const productDescription = document.getElementById('product-description');
const productPriceCents = document.getElementById('product-price-cents');
const productVotesGranted = document.getElementById('product-votes-granted');
const productImageUrl = document.getElementById('product-image-url');
const productImagePreview = document.getElementById('product-image-preview');
const productActive = document.getElementById('product-active');
const productType = document.getElementById('product-type');
const productStoryId = document.getElementById('product-story-id');

const productImageFile = document.getElementById('product-image-file');
const uploadProductImageBtn = document.getElementById('upload-product-image-btn');
const productImageUploadMessage = document.getElementById('product-image-upload-message');

const homepageSection = document.getElementById('homepage-management-section');
const homepageContentForm = document.getElementById('homepage-content-form');
const homepageHeroHeading = document.getElementById('homepage-hero-heading');
const homepageHeroDescription = document.getElementById('homepage-hero-description');
const homepageHeroCtaText = document.getElementById('homepage-hero-cta-text');
const homepageHeroCtaLink = document.getElementById('homepage-hero-cta-link');
const saveHomepageBtn = document.getElementById('save-homepage-btn');
const resetHomepageBtn = document.getElementById('reset-homepage-btn');
const homepageStatusMsg = document.getElementById('homepage-status-message');

const homepageHeroImageFile = document.getElementById('homepage-hero-image-file');
const uploadHomepageHeroImageBtn = document.getElementById('upload-homepage-hero-image-btn');
const deleteHomepageHeroImageBtn = document.getElementById('delete-homepage-hero-image-btn');
const homepageHeroImageMessage = document.getElementById('homepage-hero-image-message');
const homepageHeroImagePreview = document.getElementById('homepage-hero-image-preview');

const homepageSecondaryImageFile = document.getElementById('homepage-secondary-image-file');
const uploadHomepageSecondaryImageBtn = document.getElementById('upload-homepage-secondary-image-btn');
const deleteHomepageSecondaryImageBtn = document.getElementById('delete-homepage-secondary-image-btn');
const homepageSecondaryImageMessage = document.getElementById('homepage-secondary-image-message');
const homepageSecondaryImagePreview = document.getElementById('homepage-secondary-image-preview');

const orderSection = document.getElementById('order-management-section');
const activeOrdersPreview = document.getElementById('active-orders-preview');
const orderHistorySelect = document.getElementById('order-history-select');
const orderHistorySummary = document.getElementById('order-history-summary');
const orderHistoryDetail = document.getElementById('order-history-detail');
const ordersStatusMsg = document.getElementById('orders-status-message');

/* =========================
   LOCAL ADMIN STATE
========================= */
let adminInitialized = false;
let logoutBound = false;
let currentUser = null;
let allUsers = [];

/* =========================
   UI HELPERS
========================= */
function setStatus(message = '', color = '') {
  if (!statusEl) return;
  statusEl.style.display = message ? 'block' : 'none';
  statusEl.textContent = message;
  statusEl.style.color = color;
}

function setUsersTableVisible(isVisible) {
  if (!table) return;
  table.style.display = isVisible ? 'table' : 'none';
}

function setAdminSectionsVisible(isVisible) {
  [
    votingSection,
    storySection,
    teamSection,
    productSection,
    homepageSection,
    orderSection
  ].forEach((section) => {
    if (!section) return;
    section.style.display = isVisible ? 'block' : 'none';
  });
}

function hideAdminUi() {
  setUsersTableVisible(false);
  setAdminSectionsVisible(false);
}

function showAdminUi() {
  setUsersTableVisible(true);
  setAdminSectionsVisible(true);
}

function setAllUsers(users) {
  allUsers = Array.isArray(users) ? users : [];
}

function getCurrentUser() {
  return currentUser;
}

/* =========================
   AUTH / ACCESS
========================= */
function bindLogout() {
  if (logoutBound) return;
  logoutBound = true;

  document.getElementById('logout-link')?.addEventListener('click', async (event) => {
    event.preventDefault();
    await logout();
    window.location.href = '/';
  });
}

async function fetchUsersForAdminCheck() {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('No active session found.');
  }

  const res = await fetch('/.netlify/functions/get-users', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const result = await parseJsonResponseSafely(res);

  if (!res.ok) {
    throw new Error(result.error || 'Failed to load users');
  }

  return Array.isArray(result) ? result : [];
}

/* =========================
   SHARED MODULE CONTEXT
========================= */
function buildAdminContext() {
  const ctx = {
    supabase,
    getAccessToken,
    getCurrentUser,
    setAllUsers,

    statusEl,
    tbody,

    votingSection,
    determineWinnerBtn,
    closeVotingBtn,
    votingForm,
    votingStart,
    votingEnd,
    votingMsg,
    currentRoundSummary,
    finalizedWinnerSummary,

    featuredWinnerSelect,
    saveFeaturedWinnerBtn,
    clearFeaturedWinnerBtn,
    featuredWinnerStatusMsg,
    featuredWinnerCurrent,

    tieResolutionPanel,
    tieResolutionMessage,
    tieWinnerSelect,
    finalizeTieBtn,
    winnerPreviewPanel,
    winnerPreviewContent,
    winnerPreviewMessage,
    nextRoundFields,
    finalizeOnlyBtn,
    finalizeAndCreateBtn,

    storySection,
    storySelect,
    storyForm,
    saveStoryBtn,
    resetStoryBtn,
    deleteStoryBtn,
    storyMsg,
    storiesPreview,
    storyTitle,
    storyAuthor,
    storyDescription,
    storyActive,
    storyStatusSelect,
    productionStageSelect,
    productionStageLabel,
    storyPreviewEnabled,
    storyPreviewPageCount,
    storyDigitalAvailable,
    storyPaperbackAvailable,
    storyBundleAvailable,
    storyReleaseDate,
    storyCoverFile,
    uploadCoverBtn,
    deleteCoverBtn,
    coverUploadMessage,
    coverPreview,
    storyPageForm,
    storyPageFile,
    storyPageCaption,
    uploadStoryPageBtn,
    storyPageStatusMsg,
    storyPagesPreview,

    storyGalleryImageForm,
    storyGalleryImageFile,
    storyGalleryCaption,
    storyGalleryAltText,
    storyGalleryDisplayOrder,
    storyGalleryActive,
    uploadStoryGalleryImageBtn,
    storyGalleryStatusMsg,
    storyGalleryImagesPreview,

    teamSection,
    teamMemberSelect,
    teamMemberForm,
    saveTeamMemberBtn,
    resetTeamMemberBtn,
    deactivateTeamMemberBtn,
    teamMemberStatusMsg,
    teamMembersPreview,
    teamMemberName,
    teamMemberRoleTitle,
    teamMemberShortBio,
    teamMemberFullBio,
    teamMemberDisplayOrder,
    teamMemberActive,
    teamMemberImageFile,
    uploadTeamMemberImageBtn,
    deleteTeamMemberImageBtn,
    teamMemberImageUploadMessage,
    teamMemberImagePreview,

    productSection,
    productSelect,
    productForm,
    saveProductBtn,
    resetProductBtn,
    deactivateProductBtn,
    deleteProductImageBtn,
    productStatusMsg,
    productsPreview,
    productName,
    productDescription,
    productPriceCents,
    productVotesGranted,
    productImageUrl,
    productImagePreview,
    productActive,
    productType,
    productStoryId,
    productImageFile,
    uploadProductImageBtn,
    productImageUploadMessage,

    homepageSection,
    homepageContentForm,
    homepageHeroHeading,
    homepageHeroDescription,
    homepageHeroCtaText,
    homepageHeroCtaLink,
    saveHomepageBtn,
    resetHomepageBtn,
    homepageStatusMsg,
    homepageHeroImageFile,
    uploadHomepageHeroImageBtn,
    deleteHomepageHeroImageBtn,
    homepageHeroImageMessage,
    homepageHeroImagePreview,
    homepageSecondaryImageFile,
    uploadHomepageSecondaryImageBtn,
    deleteHomepageSecondaryImageBtn,
    homepageSecondaryImageMessage,
    homepageSecondaryImagePreview,

    orderSection,
    activeOrdersPreview,
    orderHistorySelect,
    orderHistorySummary,
    orderHistoryDetail,
    ordersStatusMsg
  };

  ctx.getAllStories = () => getAllStories();
  ctx.populateReleasedStoryOptions = () => populateReleasedStoryOptions(ctx);

  return ctx;
}

/* =========================
   PAGE INITIALIZER
========================= */
async function initAdminPanel() {
  if (adminInitialized) return;
  adminInitialized = true;

  hideAdminUi();
  bindLogout();
  setStatus('Loading admin panel...', '#374151');

  try {
    currentUser = await getCurrentUserAsync();

    if (!currentUser) {
      setStatus('Please log in to access the admin panel.', 'red');
      return;
    }

    const users = await fetchUsersForAdminCheck();
    const profile = users.find((user) => String(user.id) === String(currentUser.id));

    if (!profile || profile.role !== 'admin') {
      setStatus('Access denied: Admins only.', 'red');
      return;
    }

    setAllUsers(users);
    renderUsersTable(users, tbody);
    showAdminUi();
    setStatus('', '');

    const ctx = buildAdminContext();

    initAdminUsers(ctx);
    initAdminVoting(ctx);
    initAdminStories(ctx);
    initAdminStoryGallery(ctx);
    initAdminTeam(ctx);
    initAdminProducts(ctx);
    initAdminHomepage(ctx);
    initAdminOrders(ctx);
    initAdminFeaturedWinner(ctx);

    await loadVotingPeriod(ctx);
    await loadStoriesPreview(ctx);
    await loadFeaturedWinnerControl(ctx);
    await loadTeamMembersPreview(ctx);
    await loadProductsPreview(ctx);
    await loadHomepageContent(ctx);
    await loadOrdersPreview(ctx);

    clearStoryForm(ctx);
    await loadStoryGalleryImagesPreview(ctx);

    clearTeamMemberForm(ctx);
    clearProductForm(ctx);
    hideWinnerPreviewUI(ctx);
    resetTieResolutionUI(ctx);
    syncProductFormRules(ctx);
  } catch (error) {
    console.error('Error initializing admin panel:', error);
    hideAdminUi();
    setStatus(error.message || 'Failed to load admin panel.', 'red');
  }
}

document.addEventListener('DOMContentLoaded', initAdminPanel);