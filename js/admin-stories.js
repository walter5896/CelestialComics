// /js/admin-stories.js
import {
  parseJsonResponseSafely,
  formatForDateTimeLocal,
  updatePreviewImage,
  prettyStoryStatus,
  fileToBase64
} from './admin-shared.js';

let storiesModuleInitialized = false;
let storyPagesDeleteHandlerAttached = false;
let storySaveInFlight = false;

let allStories = [];
let editingStoryId = null;

function setStatus(el, message = '', color = '') {
  if (!el) return;
  el.textContent = message;
  el.style.color = color;
}

function setAllStoriesState(nextStories, ctx) {
  allStories = Array.isArray(nextStories) ? nextStories : [];

  if (typeof ctx.setAllStories === 'function') {
    ctx.setAllStories(allStories);
  }
}

function getCurrentSelectedStoryId(ctx) {
  return ctx.storySelect?.value || editingStoryId || '';
}

function parseReleaseDateValue(value) {
  const safeValue = String(value || '').trim();
  if (!safeValue) return null;

  const parsed = new Date(safeValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Release date is invalid.');
  }

  return parsed.toISOString();
}

function setSaveButtonState(saveStoryBtn, isBusy, isEditing) {
  if (!saveStoryBtn) return;

  saveStoryBtn.disabled = !!isBusy;

  if (isBusy) {
    saveStoryBtn.textContent = isEditing ? 'Updating...' : 'Creating...';
    return;
  }

  saveStoryBtn.textContent = isEditing ? 'Update Story' : 'Create Story';
}

export function getAllStories() {
  return allStories;
}

export function getEditingStoryId() {
  return editingStoryId;
}

export function clearStoryPagesUI(ctx) {
  const {
    storyPageFile,
    storyPageCaption,
    storyPageStatusMsg,
    storyPagesPreview
  } = ctx;

  if (storyPageFile) storyPageFile.value = '';
  if (storyPageCaption) storyPageCaption.value = '';

  setStatus(storyPageStatusMsg, '', '');

  if (storyPagesPreview) {
    storyPagesPreview.innerHTML = '<p>Select a story to manage pages.</p>';
  }
}

export function clearStoryForm(ctx) {
  const {
    storySelect,
    storyForm,
    storyActive,
    storyStatusSelect,
    productionStageLabel,
    storyPreviewEnabled,
    storyPreviewPageCount,
    storyDigitalAvailable,
    storyPaperbackAvailable,
    storyBundleAvailable,
    storyReleaseDate,
    saveStoryBtn,
    deleteStoryBtn,
    deleteCoverBtn,
    storyMsg,
    coverUploadMessage,
    storyCoverFile,
    coverPreview
  } = ctx;

  editingStoryId = null;
  storySaveInFlight = false;

  if (storySelect) storySelect.value = '';
  storyForm?.reset();

  if (storyActive) storyActive.checked = true;
  if (storyStatusSelect) storyStatusSelect.value = 'concept_bank';
  if (productionStageLabel) productionStageLabel.value = '';
  if (storyPreviewEnabled) storyPreviewEnabled.checked = false;
  if (storyPreviewPageCount) storyPreviewPageCount.value = '0';
  if (storyDigitalAvailable) storyDigitalAvailable.checked = false;
  if (storyPaperbackAvailable) storyPaperbackAvailable.checked = false;
  if (storyBundleAvailable) storyBundleAvailable.checked = false;
  if (storyReleaseDate) storyReleaseDate.value = '';

  setSaveButtonState(saveStoryBtn, false, false);

  if (deleteStoryBtn) deleteStoryBtn.style.display = 'none';
  if (deleteCoverBtn) deleteCoverBtn.style.display = 'none';

  setStatus(storyMsg, '', '');
  setStatus(coverUploadMessage, '', '');

  if (storyCoverFile) storyCoverFile.value = '';

  updatePreviewImage(coverPreview, '');
  clearStoryPagesUI(ctx);
}

export async function populateStoryForm(story, ctx) {
  const {
    storyTitle,
    storyAuthor,
    storyDescription,
    storyActive,
    storyStatusSelect,
    productionStageLabel,
    storyPreviewEnabled,
    storyPreviewPageCount,
    storyDigitalAvailable,
    storyPaperbackAvailable,
    storyBundleAvailable,
    storyReleaseDate,
    coverPreview,
    coverUploadMessage,
    storyCoverFile,
    saveStoryBtn,
    deleteStoryBtn,
    deleteCoverBtn,
    storyMsg,
    storySelect
  } = ctx;

  if (!story) return;

  editingStoryId = story.id;

  if (storyTitle) storyTitle.value = story.title || '';
  if (storyAuthor) storyAuthor.value = story.author || '';
  if (storyDescription) storyDescription.value = story.description || '';
  if (storyActive) storyActive.checked = !!story.active;

  if (storyStatusSelect) {
    storyStatusSelect.value = story.story_status || 'concept_bank';
  }

  if (productionStageLabel) {
    productionStageLabel.value = story.production_stage_label || '';
  }

  if (storyPreviewEnabled) {
    storyPreviewEnabled.checked = !!story.is_preview_enabled;
  }

  if (storyPreviewPageCount) {
    storyPreviewPageCount.value = Number(story.preview_page_count) || 0;
  }

  if (storyDigitalAvailable) {
    storyDigitalAvailable.checked = !!story.is_digital_purchase_available;
  }

  if (storyPaperbackAvailable) {
    storyPaperbackAvailable.checked = !!story.is_paperback_available;
  }

  if (storyBundleAvailable) {
    storyBundleAvailable.checked = !!story.bundle_purchase_available;
  }

  if (storyReleaseDate) {
    storyReleaseDate.value = formatForDateTimeLocal(story.release_date);
  }

  updatePreviewImage(coverPreview, story.cover_image_url || '');
  setStatus(coverUploadMessage, '', '');

  if (storyCoverFile) storyCoverFile.value = '';

  setSaveButtonState(saveStoryBtn, false, true);

  if (deleteStoryBtn) deleteStoryBtn.style.display = 'inline-block';

  if (deleteCoverBtn) {
    deleteCoverBtn.style.display = story.cover_image_url ? 'inline-block' : 'none';
  }

  setStatus(storyMsg, 'Editing existing story.', '#2563eb');

  if (storySelect) {
    storySelect.value = story.id;
  }

  await loadStoryPages(story.id, ctx);
}

function renderStoriesPreview(ctx) {
  const { storiesPreview, storySelect } = ctx;
  if (!storiesPreview) return;

  const selectedIdToPreserve = getCurrentSelectedStoryId(ctx);

  storiesPreview.innerHTML = '';

  if (storySelect) {
    storySelect.innerHTML = '<option value="">-- Create New Story --</option>';
  }

  if (!allStories.length) {
    storiesPreview.innerHTML = '<p>No stories yet.</p>';

    if (typeof ctx.populateReleasedStoryOptions === 'function') {
      ctx.populateReleasedStoryOptions();
    }

    return;
  }

  allStories.forEach((story) => {
    if (storySelect) {
      const option = document.createElement('option');
      option.value = story.id;
      option.textContent = story.title;
      storySelect.appendChild(option);
    }

    const card = document.createElement('div');
    card.className = 'story-chip';

    card.innerHTML = `
      ${story.cover_image_url ? `<img src="${story.cover_image_url}" alt="${story.title} cover">` : ''}
      <strong>${story.title}</strong>
      <span class="status-badge">${prettyStoryStatus(story.story_status)}</span>
      <div>${story.author || 'No author set'}</div>
      <div><strong>Visible:</strong> ${story.active ? 'Yes' : 'No'}</div>
      <div><strong>Preview:</strong> ${story.is_preview_enabled ? `Enabled (${story.preview_page_count || 0} pages)` : 'Disabled'}</div>
      <div><strong>Digital:</strong> ${story.is_digital_purchase_available ? 'Yes' : 'No'}</div>
      <div><strong>Paperback:</strong> ${story.is_paperback_available ? 'Yes' : 'No'}</div>
      <div><strong>Bundle:</strong> ${story.bundle_purchase_available ? 'Yes' : 'No'}</div>
      <div><strong>Stage:</strong> ${story.production_stage_label || '—'}</div>
    `;

    storiesPreview.appendChild(card);
  });

  if (storySelect && selectedIdToPreserve) {
    const exists = allStories.some((story) => String(story.id) === String(selectedIdToPreserve));
    if (exists) {
      storySelect.value = selectedIdToPreserve;
    }
  }

  if (typeof ctx.populateReleasedStoryOptions === 'function') {
    ctx.populateReleasedStoryOptions();
  }
}

export async function loadStoriesPreview(ctx) {
  const { storiesPreview } = ctx;

  try {
    const { data: stories, error } = await ctx.supabase
      .from('stories')
      .select(`
        id,
        title,
        author,
        description,
        cover_image_url,
        cover_image_path,
        active,
        created_at,
        story_status,
        production_stage_label,
        is_preview_enabled,
        preview_page_count,
        is_digital_purchase_available,
        is_paperback_available,
        bundle_purchase_available,
        release_date
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    setAllStoriesState(stories || [], ctx);
    renderStoriesPreview(ctx);
  } catch (err) {
    console.error('Error loading stories preview:', err);

    if (storiesPreview) {
      storiesPreview.innerHTML = '<p>Failed to load stories.</p>';
    }
  }
}

export async function loadStoryPages(storyId, ctx) {
  const { storyPagesPreview } = ctx;

  if (!storyId) {
    clearStoryPagesUI(ctx);
    return;
  }

  try {
    if (storyPagesPreview) {
      storyPagesPreview.innerHTML = '<p>Loading story pages...</p>';
    }

    const { data: pages, error } = await ctx.supabase
      .from('story_pages')
      .select(`
        id,
        story_id,
        page_number,
        image_url,
        image_path,
        caption,
        created_at,
        is_preview_page
      `)
      .eq('story_id', storyId)
      .order('page_number', { ascending: true });

    if (error) throw error;

    if (!storyPagesPreview) return;

    storyPagesPreview.innerHTML = '';

    if (!pages || !pages.length) {
      storyPagesPreview.innerHTML = '<p>No pages uploaded yet for this story.</p>';
      return;
    }

    pages.forEach((page) => {
      const card = document.createElement('div');
      card.className = 'story-page-card';

      card.innerHTML = `
        <img src="${page.image_url || ''}" alt="Story page ${page.page_number}">
        <strong>Page ${page.page_number}</strong>
        <div>${page.caption || 'No caption'}</div>
        <div><strong>Preview Page:</strong> ${page.is_preview_page ? 'Yes' : 'No'}</div>
        <div class="action-row">
          <button
            type="button"
            class="danger-btn delete-story-page-btn"
            data-page-id="${page.id}">
            Delete Page
          </button>
        </div>
      `;

      storyPagesPreview.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading story pages:', err);

    if (storyPagesPreview) {
      storyPagesPreview.innerHTML = '<p>Failed to load story pages.</p>';
    }
  }
}

export async function handleCoverUpload(ctx) {
  const {
    coverUploadMessage,
    storyCoverFile,
    uploadCoverBtn,
    deleteCoverBtn,
    coverPreview,
    storySelect
  } = ctx;

  try {
    setStatus(coverUploadMessage, '', '');

    if (!editingStoryId) {
      throw new Error('Create or select a story before uploading a cover image.');
    }

    const file = storyCoverFile?.files?.[0];
    if (!file) {
      throw new Error('Please choose an image file first.');
    }

    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    if (uploadCoverBtn) {
      uploadCoverBtn.disabled = true;
      uploadCoverBtn.textContent = 'Uploading...';
    }

    const file_base64 = await fileToBase64(file);

    const res = await fetch('/.netlify/functions/upload-story-cover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        story_id: editingStoryId,
        file_name: file.name,
        file_type: file.type,
        file_base64
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to upload cover image');
    }

    setStatus(coverUploadMessage, 'Cover image uploaded successfully!', 'green');

    if (result.cover_image_url) {
      updatePreviewImage(coverPreview, result.cover_image_url);
    }

    if (deleteCoverBtn) {
      deleteCoverBtn.style.display = 'inline-block';
    }

    if (storyCoverFile) {
      storyCoverFile.value = '';
    }

    const preservedStoryId = editingStoryId;

    await loadStoriesPreview(ctx);

    const refreshedStory = allStories.find(
      (story) => String(story.id) === String(preservedStoryId)
    );

    if (refreshedStory) {
      await populateStoryForm(refreshedStory, ctx);

      if (storySelect) {
        storySelect.value = preservedStoryId;
      }
    }
  } catch (err) {
    console.error('Error uploading cover image:', err);
    setStatus(coverUploadMessage, err.message || 'Failed to upload cover image.', 'red');
  } finally {
    if (uploadCoverBtn) {
      uploadCoverBtn.disabled = false;
      uploadCoverBtn.textContent = 'Upload Cover Image';
    }
  }
}

export async function handleDeleteCoverImage(ctx) {
  const {
    deleteCoverBtn,
    coverUploadMessage,
    storyCoverFile,
    coverPreview,
    storySelect
  } = ctx;

  try {
    if (!editingStoryId) {
      throw new Error('Select a story first.');
    }

    const confirmed = confirm('Delete this cover image?');
    if (!confirmed) return;

    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    if (deleteCoverBtn) {
      deleteCoverBtn.disabled = true;
      deleteCoverBtn.textContent = 'Deleting...';
    }

    const preservedStoryId = editingStoryId;

    const res = await fetch('/.netlify/functions/delete-story-cover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        story_id: preservedStoryId
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to delete cover image');
    }

    setStatus(coverUploadMessage, 'Cover image deleted successfully.', 'green');

    updatePreviewImage(coverPreview, '');

    if (storyCoverFile) {
      storyCoverFile.value = '';
    }

    await loadStoriesPreview(ctx);

    const refreshedStory = allStories.find(
      (story) => String(story.id) === String(preservedStoryId)
    );

    if (refreshedStory) {
      await populateStoryForm(refreshedStory, ctx);

      if (storySelect) {
        storySelect.value = preservedStoryId;
      }
    } else {
      clearStoryForm(ctx);
    }
  } catch (err) {
    console.error('Error deleting cover image:', err);
    setStatus(coverUploadMessage, err.message || 'Failed to delete cover image.', 'red');
  } finally {
    if (deleteCoverBtn) {
      deleteCoverBtn.disabled = false;
      deleteCoverBtn.textContent = 'Delete Cover Image';
    }
  }
}

export async function handleStoryPageUpload(event, ctx) {
  event.preventDefault();

  const {
    storyPageStatusMsg,
    storyPageFile,
    storyPageCaption,
    uploadStoryPageBtn
  } = ctx;

  try {
    setStatus(storyPageStatusMsg, '', '');

    if (!editingStoryId) {
      throw new Error('Select or create a story before uploading pages.');
    }

    const file = storyPageFile?.files?.[0];
    if (!file) {
      throw new Error('Please choose a page image first.');
    }

    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    if (uploadStoryPageBtn) {
      uploadStoryPageBtn.disabled = true;
      uploadStoryPageBtn.textContent = 'Uploading Page...';
    }

    const file_base64 = await fileToBase64(file);

    const res = await fetch('/.netlify/functions/upload-story-page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        story_id: editingStoryId,
        file_name: file.name,
        file_type: file.type,
        file_base64,
        caption: storyPageCaption?.value.trim() || null
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to upload story page');
    }

    setStatus(storyPageStatusMsg, 'Story page uploaded successfully!', 'green');

    if (storyPageFile) {
      storyPageFile.value = '';
    }

    if (storyPageCaption) {
      storyPageCaption.value = '';
    }

    await loadStoryPages(editingStoryId, ctx);
  } catch (err) {
    console.error('Error uploading story page:', err);
    setStatus(storyPageStatusMsg, err.message || 'Failed to upload story page.', 'red');
  } finally {
    if (uploadStoryPageBtn) {
      uploadStoryPageBtn.disabled = false;
      uploadStoryPageBtn.textContent = 'Upload Story Page';
    }
  }
}

async function handleDeleteStoryPage(pageId, button, ctx) {
  if (!pageId) return;

  const confirmed = confirm('Are you sure you want to delete this story page?');
  if (!confirmed) return;

  try {
    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    button.disabled = true;
    button.textContent = 'Deleting...';

    const res = await fetch('/.netlify/functions/delete-story-page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ page_id: pageId })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to delete story page');
    }

    await loadStoryPages(editingStoryId, ctx);
  } catch (err) {
    console.error('Error deleting story page:', err);
    alert(err.message || 'Failed to delete story page.');
  } finally {
    button.disabled = false;
    button.textContent = 'Delete Page';
  }
}

export async function handleDeleteStory(ctx) {
  const {
    deleteStoryBtn,
    storyMsg
  } = ctx;

  if (!editingStoryId) return;

  const confirmed = confirm(
    'Are you sure you want to delete this story? This will also delete its story pages and cover image.'
  );
  if (!confirmed) return;

  try {
    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    if (deleteStoryBtn) {
      deleteStoryBtn.disabled = true;
      deleteStoryBtn.textContent = 'Deleting...';
    }

    const storyIdToDelete = editingStoryId;

    const res = await fetch('/.netlify/functions/delete-story', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        story_id: storyIdToDelete
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to delete story');
    }

    setStatus(storyMsg, 'Story deleted successfully!', 'green');

    clearStoryForm(ctx);
    await loadStoriesPreview(ctx);
  } catch (err) {
    console.error('Error deleting story:', err);
    setStatus(storyMsg, err.message || 'Failed to delete story.', 'red');
  } finally {
    if (deleteStoryBtn) {
      deleteStoryBtn.disabled = false;
      deleteStoryBtn.textContent = 'Delete Story';
    }
  }
}

export async function handleStorySubmit(event, ctx) {
  event.preventDefault();

  const {
    storyTitle,
    storyAuthor,
    storyDescription,
    storyActive,
    storyStatusSelect,
    productionStageLabel,
    storyPreviewEnabled,
    storyPreviewPageCount,
    storyDigitalAvailable,
    storyPaperbackAvailable,
    storyBundleAvailable,
    storyReleaseDate,
    saveStoryBtn,
    storyMsg,
    storySelect
  } = ctx;

  if (storySaveInFlight) return;
  storySaveInFlight = true;

  const storyIdBeforeSave = editingStoryId;
  const wasEditing = !!storyIdBeforeSave;

  setStatus(storyMsg, '', '');
  setSaveButtonState(saveStoryBtn, true, wasEditing);

  try {
    const title = storyTitle?.value.trim() || '';
    const author = storyAuthor?.value.trim() || '';
    const description = storyDescription?.value.trim() || '';
    const active = !!storyActive?.checked;

    const story_status = storyStatusSelect?.value || 'concept_bank';
    const production_stage_label = productionStageLabel?.value.trim() || null;
    const is_preview_enabled = !!storyPreviewEnabled?.checked;
    const preview_page_count = Number(storyPreviewPageCount?.value || 0);
    const is_digital_purchase_available = !!storyDigitalAvailable?.checked;
    const is_paperback_available = !!storyPaperbackAvailable?.checked;
    const bundle_purchase_available = !!storyBundleAvailable?.checked;
    const release_date = parseReleaseDateValue(storyReleaseDate?.value);

    if (!title) {
      throw new Error('Title is required.');
    }

    if (!['concept_bank', 'active_vote', 'winner_in_production', 'released'].includes(story_status)) {
      throw new Error('Invalid story lifecycle status.');
    }

    if (!Number.isInteger(preview_page_count) || preview_page_count < 0) {
      throw new Error('Preview page count must be 0 or greater.');
    }

    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    const selectedStory = allStories.find(
      (story) => String(story.id) === String(storyIdBeforeSave)
    );

    const cover_image_url = selectedStory?.cover_image_url || null;

    const payload = {
      title,
      author,
      cover_image_url,
      description,
      active,
      story_status,
      production_stage_label,
      is_preview_enabled,
      preview_page_count,
      is_digital_purchase_available,
      is_paperback_available,
      bundle_purchase_available,
      release_date
    };

    const endpoint = wasEditing
      ? '/.netlify/functions/update-story'
      : '/.netlify/functions/create-story';

    const requestBody = wasEditing
      ? { story_id: storyIdBeforeSave, ...payload }
      : payload;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(requestBody)
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok) {
      throw new Error(
        result.error || (wasEditing ? 'Failed to update story' : 'Failed to create story')
      );
    }

    const resultingStoryId = result.story?.id || storyIdBeforeSave || null;

    setStatus(
      storyMsg,
      wasEditing ? 'Story updated successfully!' : 'Story created successfully!',
      'green'
    );

    await loadStoriesPreview(ctx);

    if (resultingStoryId) {
      const refreshedStory = allStories.find(
        (story) => String(story.id) === String(resultingStoryId)
      );

      if (refreshedStory) {
        await populateStoryForm(refreshedStory, ctx);

        if (storySelect) {
          storySelect.value = resultingStoryId;
        }
      } else {
        clearStoryForm(ctx);
      }
    } else {
      clearStoryForm(ctx);
    }
  } catch (err) {
    console.error('Error saving story:', err);
    setStatus(storyMsg, err.message || 'Failed to save story.', 'red');
  } finally {
    storySaveInFlight = false;
    setSaveButtonState(saveStoryBtn, false, !!editingStoryId);
  }
}

export async function handleStorySelectChange(ctx) {
  const selectedId = ctx.storySelect?.value || '';

  if (!selectedId) {
    clearStoryForm(ctx);
    return;
  }

  const selectedStory = allStories.find(
    (story) => String(story.id) === String(selectedId)
  );

  if (selectedStory) {
    await populateStoryForm(selectedStory, ctx);
  }
}

function attachStoryPageDeleteDelegation(ctx) {
  const { storyPagesPreview } = ctx;
  if (!storyPagesPreview || storyPagesDeleteHandlerAttached) return;

  storyPagesDeleteHandlerAttached = true;

  storyPagesPreview.addEventListener('click', async (event) => {
    const button = event.target.closest('.delete-story-page-btn');
    if (!button) return;

    const pageId = button.dataset.pageId;
    await handleDeleteStoryPage(pageId, button, ctx);
  });
}

export function initAdminStories(ctx) {
  if (storiesModuleInitialized) return;
  storiesModuleInitialized = true;

  const {
    storySelect,
    resetStoryBtn,
    uploadCoverBtn,
    deleteCoverBtn,
    deleteStoryBtn,
    storyForm,
    storyPageForm
  } = ctx;

  attachStoryPageDeleteDelegation(ctx);

  storySelect?.addEventListener('change', async () => {
    await handleStorySelectChange(ctx);
  });

  resetStoryBtn?.addEventListener('click', () => {
    clearStoryForm(ctx);
  });

  uploadCoverBtn?.addEventListener('click', async () => {
    await handleCoverUpload(ctx);
  });

  deleteCoverBtn?.addEventListener('click', async () => {
    await handleDeleteCoverImage(ctx);
  });

  deleteStoryBtn?.addEventListener('click', async () => {
    await handleDeleteStory(ctx);
  });

  storyForm?.addEventListener('submit', async (event) => {
    await handleStorySubmit(event, ctx);
  });

  storyPageForm?.addEventListener('submit', async (event) => {
    await handleStoryPageUpload(event, ctx);
  });
}