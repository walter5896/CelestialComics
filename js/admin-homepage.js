// /js/admin-homepage.js
import {
  parseJsonResponseSafely,
  updatePreviewImage,
  fileToBase64
} from './admin-shared.js';

let homepageModuleInitialized = false;
let homepageSaveInFlight = false;
let currentHomepageContent = null;

const REQUEST_TIMEOUT_MS = 15000;

function setStatus(el, message = '', color = '') {
  if (!el) return;
  el.textContent = message;
  el.style.color = color;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function getFriendlyRequestError(err, fallbackMessage) {
  if (err?.name === 'AbortError') {
    return 'Request timed out. Refresh the page and try again.';
  }

  return err?.message || fallbackMessage;
}

function setSaveButtonState(saveHomepageBtn, isBusy) {
  if (!saveHomepageBtn) return;

  saveHomepageBtn.disabled = !!isBusy;
  saveHomepageBtn.textContent = isBusy
    ? 'Saving...'
    : 'Save Homepage Content';
}

function getSlotConfig(slot, ctx) {
  if (slot === 'hero') {
    return {
      fileInput: ctx.homepageHeroImageFile,
      uploadBtn: ctx.uploadHomepageHeroImageBtn,
      deleteBtn: ctx.deleteHomepageHeroImageBtn,
      messageEl: ctx.homepageHeroImageMessage,
      previewEl: ctx.homepageHeroImagePreview,
      uploadIdleText: 'Upload Hero Image',
      uploadBusyText: 'Uploading...',
      deleteIdleText: 'Delete Hero Image',
      deleteBusyText: 'Deleting...'
    };
  }

  return {
    fileInput: ctx.homepageSecondaryImageFile,
    uploadBtn: ctx.uploadHomepageSecondaryImageBtn,
    deleteBtn: ctx.deleteHomepageSecondaryImageBtn,
    messageEl: ctx.homepageSecondaryImageMessage,
    previewEl: ctx.homepageSecondaryImagePreview,
    uploadIdleText: 'Upload Secondary Image',
    uploadBusyText: 'Uploading...',
    deleteIdleText: 'Delete Secondary Image',
    deleteBusyText: 'Deleting...'
  };
}

export function getCurrentHomepageContent() {
  return currentHomepageContent;
}

export function applyHomepageContentToForm(content, ctx) {
  currentHomepageContent = content || null;

  const {
    homepageHeroHeading,
    homepageHeroDescription,
    homepageHeroCtaText,
    homepageHeroCtaLink,
    deleteHomepageHeroImageBtn,
    deleteHomepageSecondaryImageBtn,
    homepageHeroImagePreview,
    homepageSecondaryImagePreview
  } = ctx;

  if (homepageHeroHeading) {
    homepageHeroHeading.value = String(content?.hero_heading || '');
  }

  if (homepageHeroDescription) {
    homepageHeroDescription.value = String(content?.hero_description || '');
  }

  if (homepageHeroCtaText) {
    homepageHeroCtaText.value = String(content?.hero_cta_text || '');
  }

  if (homepageHeroCtaLink) {
    homepageHeroCtaLink.value = String(content?.hero_cta_link || '');
  }

  updatePreviewImage(homepageHeroImagePreview, content?.hero_image_url || '');
  updatePreviewImage(homepageSecondaryImagePreview, content?.secondary_image_url || '');

  if (deleteHomepageHeroImageBtn) {
    deleteHomepageHeroImageBtn.style.display = content?.hero_image_url ? 'inline-block' : 'none';
  }

  if (deleteHomepageSecondaryImageBtn) {
    deleteHomepageSecondaryImageBtn.style.display = content?.secondary_image_url ? 'inline-block' : 'none';
  }
}

export function resetHomepageForm(ctx) {
  const {
    homepageHeroImageFile,
    homepageSecondaryImageFile,
    homepageStatusMsg,
    homepageHeroImageMessage,
    homepageSecondaryImageMessage
  } = ctx;

  applyHomepageContentToForm(currentHomepageContent, ctx);

  if (homepageHeroImageFile) {
    homepageHeroImageFile.value = '';
  }

  if (homepageSecondaryImageFile) {
    homepageSecondaryImageFile.value = '';
  }

  setStatus(homepageStatusMsg, '', '');
  setStatus(homepageHeroImageMessage, '', '');
  setStatus(homepageSecondaryImageMessage, '', '');
}

export async function loadHomepageContent(ctx) {
  const { homepageStatusMsg } = ctx;

  try {
    const res = await fetchWithTimeout('/.netlify/functions/get-homepage-content', {
      method: 'GET'
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to load homepage content.');
    }

    applyHomepageContentToForm(result.content || null, ctx);
    setStatus(homepageStatusMsg, '', '');
  } catch (err) {
    console.error('Error loading homepage content:', err);
    setStatus(
      homepageStatusMsg,
      getFriendlyRequestError(err, 'Failed to load homepage content.'),
      'red'
    );
  }
}

export async function handleHomepageContentSubmit(event, ctx) {
  event.preventDefault();

  const {
    homepageHeroHeading,
    homepageHeroDescription,
    homepageHeroCtaText,
    homepageHeroCtaLink,
    saveHomepageBtn,
    homepageStatusMsg
  } = ctx;

  if (homepageSaveInFlight) return;
  homepageSaveInFlight = true;

  setStatus(homepageStatusMsg, '', '');
  setSaveButtonState(saveHomepageBtn, true);

  try {
    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    const payload = {
      hero_heading: homepageHeroHeading?.value.trim() || '',
      hero_description: homepageHeroDescription?.value.trim() || '',
      hero_cta_text: homepageHeroCtaText?.value.trim() || '',
      hero_cta_link: homepageHeroCtaLink?.value.trim() || null
    };

    const res = await fetchWithTimeout('/.netlify/functions/update-homepage-content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to save homepage content.');
    }

    applyHomepageContentToForm(result.content || null, ctx);
    setStatus(homepageStatusMsg, 'Homepage content saved successfully!', 'green');
  } catch (err) {
    console.error('Error saving homepage content:', err);
    setStatus(
      homepageStatusMsg,
      getFriendlyRequestError(err, 'Failed to save homepage content.'),
      'red'
    );
  } finally {
    homepageSaveInFlight = false;
    setSaveButtonState(saveHomepageBtn, false);
  }
}

async function handleHomepageImageUpload(slot, ctx) {
  const config = getSlotConfig(slot, ctx);

  try {
    setStatus(config.messageEl, '', '');

    const file = config.fileInput?.files?.[0];
    if (!file) {
      throw new Error('Please choose an image file first.');
    }

    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    if (config.uploadBtn) {
      config.uploadBtn.disabled = true;
      config.uploadBtn.textContent = config.uploadBusyText;
    }

    const file_base64 = await fileToBase64(file);

    const res = await fetchWithTimeout('/.netlify/functions/upload-homepage-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        image_slot: slot,
        file_name: file.name,
        file_type: file.type,
        file_base64
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to upload homepage image.');
    }

    applyHomepageContentToForm(result.content || null, ctx);

    if (config.fileInput) {
      config.fileInput.value = '';
    }

    setStatus(config.messageEl, 'Image uploaded successfully!', 'green');
  } catch (err) {
    console.error(`Error uploading homepage ${slot} image:`, err);
    setStatus(
      config.messageEl,
      getFriendlyRequestError(err, 'Failed to upload homepage image.'),
      'red'
    );
  } finally {
    if (config.uploadBtn) {
      config.uploadBtn.disabled = false;
      config.uploadBtn.textContent = config.uploadIdleText;
    }
  }
}

async function handleHomepageImageDelete(slot, ctx) {
  const config = getSlotConfig(slot, ctx);

  try {
    const hasImage =
      slot === 'hero'
        ? !!currentHomepageContent?.hero_image_url
        : !!currentHomepageContent?.secondary_image_url;

    if (!hasImage) {
      throw new Error('There is no image to delete.');
    }

    const confirmed = confirm('Delete this homepage image?');
    if (!confirmed) return;

    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    if (config.deleteBtn) {
      config.deleteBtn.disabled = true;
      config.deleteBtn.textContent = config.deleteBusyText;
    }

    const res = await fetchWithTimeout('/.netlify/functions/delete-homepage-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        image_slot: slot
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to delete homepage image.');
    }

    applyHomepageContentToForm(result.content || null, ctx);
    setStatus(config.messageEl, 'Image deleted successfully!', 'green');
  } catch (err) {
    console.error(`Error deleting homepage ${slot} image:`, err);
    setStatus(
      config.messageEl,
      getFriendlyRequestError(err, 'Failed to delete homepage image.'),
      'red'
    );
  } finally {
    if (config.deleteBtn) {
      config.deleteBtn.disabled = false;
      config.deleteBtn.textContent = config.deleteIdleText;
    }
  }
}

export function initAdminHomepage(ctx) {
  if (homepageModuleInitialized) return;
  homepageModuleInitialized = true;

  const {
    homepageContentForm,
    resetHomepageBtn,
    uploadHomepageHeroImageBtn,
    deleteHomepageHeroImageBtn,
    uploadHomepageSecondaryImageBtn,
    deleteHomepageSecondaryImageBtn
  } = ctx;

  homepageContentForm?.addEventListener('submit', async (event) => {
    await handleHomepageContentSubmit(event, ctx);
  });

  resetHomepageBtn?.addEventListener('click', () => {
    resetHomepageForm(ctx);
  });

  uploadHomepageHeroImageBtn?.addEventListener('click', async () => {
    await handleHomepageImageUpload('hero', ctx);
  });

  deleteHomepageHeroImageBtn?.addEventListener('click', async () => {
    await handleHomepageImageDelete('hero', ctx);
  });

  uploadHomepageSecondaryImageBtn?.addEventListener('click', async () => {
    await handleHomepageImageUpload('secondary', ctx);
  });

  deleteHomepageSecondaryImageBtn?.addEventListener('click', async () => {
    await handleHomepageImageDelete('secondary', ctx);
  });
}