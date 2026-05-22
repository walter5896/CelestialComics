// /js/admin-story-gallery.js

import {
  parseJsonResponseSafely,
  fileToBase64
} from './admin-shared.js';

let storyGalleryInitialized = false;
let galleryImagesState = [];

/* =========================
   HELPERS
========================= */

function setStatus(el, message = '', color = '') {
  if (!el) return;

  el.textContent = message;
  el.style.color = color;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function getSelectedStoryId(ctx) {
  return String(ctx.storySelect?.value || '').trim();
}

async function getAdminToken(ctx) {
  const token = await ctx.getAccessToken();

  if (!token) {
    throw new Error('No active admin session found.');
  }

  return token;
}

async function fetchJsonWithAuth(ctx, url, options = {}) {
  const token = await getAdminToken(ctx);

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  const data = await parseJsonResponseSafely(res);

  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'Request failed.');
  }

  return data;
}

function getGalleryImageFromButton(button) {
  const imageId = button?.dataset?.galleryImageId;
  if (!imageId) return null;

  return galleryImagesState.find((image) => String(image.id) === String(imageId)) || null;
}

function getCardValues(card) {
  return {
    caption: String(card?.querySelector('.story-gallery-caption-input')?.value || '').trim(),
    alt_text: String(card?.querySelector('.story-gallery-alt-input')?.value || '').trim(),
    display_order: normalizeInteger(
      card?.querySelector('.story-gallery-order-input')?.value,
      0
    ),
    active: !!card?.querySelector('.story-gallery-active-input')?.checked
  };
}

function clearGalleryUploadForm(ctx) {
  if (ctx.storyGalleryImageFile) ctx.storyGalleryImageFile.value = '';
  if (ctx.storyGalleryCaption) ctx.storyGalleryCaption.value = '';
  if (ctx.storyGalleryAltText) ctx.storyGalleryAltText.value = '';
  if (ctx.storyGalleryDisplayOrder) ctx.storyGalleryDisplayOrder.value = '0';
  if (ctx.storyGalleryActive) ctx.storyGalleryActive.checked = true;
}

/* =========================
   RENDER
========================= */

function renderStoryGalleryImages(ctx, images = []) {
  const { storyGalleryImagesPreview } = ctx;
  if (!storyGalleryImagesPreview) return;

  const safeImages = Array.isArray(images) ? images : [];

  if (!safeImages.length) {
    storyGalleryImagesPreview.innerHTML = `
      <p class="empty-orders-state">
        No gallery images uploaded yet for this story.
      </p>
    `;
    return;
  }

  storyGalleryImagesPreview.innerHTML = safeImages
    .map((image) => {
      const statusClass = image.active ? 'fulfilled' : 'canceled';
      const statusText = image.active ? 'Active' : 'Inactive';

      return `
        <article class="story-page-card story-gallery-admin-card" data-gallery-image-id="${escapeHtml(image.id)}">
          <img
            src="${escapeHtml(image.image_url || '')}"
            alt="${escapeHtml(image.alt_text || image.caption || 'Story gallery image')}"
            loading="lazy"
            decoding="async"
          />

          <span class="status-badge ${statusClass}">${statusText}</span>

          <div class="field-group">
            <label for="gallery-caption-${escapeHtml(image.id)}">Caption</label>
            <textarea
              id="gallery-caption-${escapeHtml(image.id)}"
              class="story-gallery-caption-input"
              placeholder="Optional caption..."
            >${escapeHtml(image.caption || '')}</textarea>
          </div>

          <div class="field-group">
            <label for="gallery-alt-${escapeHtml(image.id)}">Alt Text</label>
            <input
              type="text"
              id="gallery-alt-${escapeHtml(image.id)}"
              class="story-gallery-alt-input"
              value="${escapeHtml(image.alt_text || '')}"
              placeholder="Describe this image for accessibility"
            />
          </div>

          <div class="two-column-grid compact-gallery-edit-grid">
            <div class="field-group">
              <label for="gallery-order-${escapeHtml(image.id)}">Display Order</label>
              <input
                type="number"
                id="gallery-order-${escapeHtml(image.id)}"
                class="story-gallery-order-input"
                value="${escapeHtml(image.display_order ?? 0)}"
                step="1"
              />
            </div>

            <div class="field-group inline-checkbox">
              <input
                type="checkbox"
                id="gallery-active-${escapeHtml(image.id)}"
                class="story-gallery-active-input"
                ${image.active ? 'checked' : ''}
              />
              <label for="gallery-active-${escapeHtml(image.id)}" style="margin-bottom:0;">
                Active
              </label>
            </div>
          </div>

          <div class="action-row">
            <button
              type="button"
              class="secondary-btn update-story-gallery-image-btn"
              data-gallery-image-id="${escapeHtml(image.id)}"
            >
              Save Image Details
            </button>

            <button
              type="button"
              class="danger-btn delete-story-gallery-image-btn"
              data-gallery-image-id="${escapeHtml(image.id)}"
            >
              Delete Image
            </button>
          </div>
        </article>
      `;
    })
    .join('');
}

/* =========================
   LOAD
========================= */

export async function loadStoryGalleryImagesPreview(ctx) {
  const storyId = getSelectedStoryId(ctx);

  if (!ctx.storyGalleryImagesPreview) return;

  if (!storyId) {
    galleryImagesState = [];
    ctx.storyGalleryImagesPreview.innerHTML = `
      <p class="empty-orders-state">
        Select or create a story first to manage gallery images.
      </p>
    `;
    setStatus(ctx.storyGalleryStatusMsg, '');
    return;
  }

  try {
    setStatus(ctx.storyGalleryStatusMsg, 'Loading story gallery images...', '#374151');

    const data = await fetchJsonWithAuth(
      ctx,
      `/.netlify/functions/get-story-gallery-images?story_id=${encodeURIComponent(storyId)}`,
      {
        method: 'GET'
      }
    );

    galleryImagesState = Array.isArray(data.gallery_images)
      ? data.gallery_images
      : [];

    renderStoryGalleryImages(ctx, galleryImagesState);
    setStatus(ctx.storyGalleryStatusMsg, '');
  } catch (error) {
    console.error('Load story gallery images error:', error);

    galleryImagesState = [];

    ctx.storyGalleryImagesPreview.innerHTML = `
      <p class="empty-orders-state">
        Failed to load gallery images.
      </p>
    `;

    setStatus(
      ctx.storyGalleryStatusMsg,
      error.message || 'Failed to load gallery images.',
      'red'
    );
  }
}

/* =========================
   ACTIONS
========================= */

async function uploadStoryGalleryImage(ctx, event) {
  event?.preventDefault();

  const storyId = getSelectedStoryId(ctx);

  try {
    if (!storyId) {
      throw new Error('Create or select a story before uploading gallery images.');
    }

    const file = ctx.storyGalleryImageFile?.files?.[0];

    if (!file) {
      throw new Error('Choose a gallery image file first.');
    }

    if (ctx.uploadStoryGalleryImageBtn) {
      ctx.uploadStoryGalleryImageBtn.disabled = true;
      ctx.uploadStoryGalleryImageBtn.textContent = 'Uploading...';
    }

    setStatus(ctx.storyGalleryStatusMsg, 'Uploading gallery image...', '#374151');

    const fileBase64 = await fileToBase64(file);

    await fetchJsonWithAuth(ctx, '/.netlify/functions/upload-story-gallery-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        story_id: storyId,
        file_name: file.name,
        file_type: file.type,
        file_base64: fileBase64,
        caption: ctx.storyGalleryCaption?.value || '',
        alt_text: ctx.storyGalleryAltText?.value || '',
        display_order: normalizeInteger(ctx.storyGalleryDisplayOrder?.value, 0),
        active: !!ctx.storyGalleryActive?.checked
      })
    });

    clearGalleryUploadForm(ctx);
    await loadStoryGalleryImagesPreview(ctx);

    setStatus(ctx.storyGalleryStatusMsg, 'Gallery image uploaded successfully.', 'green');
  } catch (error) {
    console.error('Upload story gallery image error:', error);

    setStatus(
      ctx.storyGalleryStatusMsg,
      error.message || 'Failed to upload gallery image.',
      'red'
    );
  } finally {
    if (ctx.uploadStoryGalleryImageBtn) {
      ctx.uploadStoryGalleryImageBtn.disabled = false;
      ctx.uploadStoryGalleryImageBtn.textContent = 'Upload Gallery Image';
    }
  }
}

async function updateStoryGalleryImage(ctx, button) {
  const image = getGalleryImageFromButton(button);

  if (!image) {
    setStatus(ctx.storyGalleryStatusMsg, 'Gallery image not found.', 'red');
    return;
  }

  const card = button.closest('.story-gallery-admin-card');
  const values = getCardValues(card);

  try {
    button.disabled = true;
    button.textContent = 'Saving...';

    setStatus(ctx.storyGalleryStatusMsg, 'Saving gallery image details...', '#374151');

    await fetchJsonWithAuth(ctx, '/.netlify/functions/update-story-gallery-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: image.id,
        ...values
      })
    });

    await loadStoryGalleryImagesPreview(ctx);

    setStatus(ctx.storyGalleryStatusMsg, 'Gallery image updated.', 'green');
  } catch (error) {
    console.error('Update story gallery image error:', error);

    setStatus(
      ctx.storyGalleryStatusMsg,
      error.message || 'Failed to update gallery image.',
      'red'
    );
  } finally {
    button.disabled = false;
    button.textContent = 'Save Image Details';
  }
}

async function deleteStoryGalleryImage(ctx, button) {
  const image = getGalleryImageFromButton(button);

  if (!image) {
    setStatus(ctx.storyGalleryStatusMsg, 'Gallery image not found.', 'red');
    return;
  }

  const confirmed = window.confirm('Delete this gallery image? This removes it from the story detail carousel.');

  if (!confirmed) return;

  try {
    button.disabled = true;
    button.textContent = 'Deleting...';

    setStatus(ctx.storyGalleryStatusMsg, 'Deleting gallery image...', '#374151');

    await fetchJsonWithAuth(ctx, '/.netlify/functions/delete-story-gallery-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: image.id
      })
    });

    await loadStoryGalleryImagesPreview(ctx);

    setStatus(ctx.storyGalleryStatusMsg, 'Gallery image deleted.', 'green');
  } catch (error) {
    console.error('Delete story gallery image error:', error);

    setStatus(
      ctx.storyGalleryStatusMsg,
      error.message || 'Failed to delete gallery image.',
      'red'
    );
  } finally {
    button.disabled = false;
    button.textContent = 'Delete Image';
  }
}

/* =========================
   EVENTS
========================= */

function bindStoryGalleryEvents(ctx) {
  ctx.storyGalleryImageForm?.addEventListener('submit', (event) => {
    uploadStoryGalleryImage(ctx, event);
  });

  ctx.storySelect?.addEventListener('change', () => {
    loadStoryGalleryImagesPreview(ctx);
  });

  ctx.storyGalleryImagesPreview?.addEventListener('click', (event) => {
    const updateButton = event.target.closest?.('.update-story-gallery-image-btn');
    const deleteButton = event.target.closest?.('.delete-story-gallery-image-btn');

    if (updateButton) {
      updateStoryGalleryImage(ctx, updateButton);
      return;
    }

    if (deleteButton) {
      deleteStoryGalleryImage(ctx, deleteButton);
    }
  });
}

/* =========================
   INIT
========================= */

export function initAdminStoryGallery(ctx) {
  if (storyGalleryInitialized) return;
  storyGalleryInitialized = true;

  if (!ctx.storyGalleryImageForm && !ctx.storyGalleryImagesPreview) {
    return;
  }

  bindStoryGalleryEvents(ctx);
}