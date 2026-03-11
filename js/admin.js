// /js/admin.js
import { getCurrentUserAsync, logout } from './auth.js';
import { supabase } from './supabase.js';

const statusEl = document.getElementById('status-message');

const table = document.getElementById('users-table');
const tbody = table?.querySelector('tbody');

const votingSection = document.getElementById('voting-section');
const determineWinnerBtn = document.getElementById('determine-winner-btn');
const votingForm = document.getElementById('voting-period-form');
const votingStart = document.getElementById('voting-start');
const votingEnd = document.getElementById('voting-end');
const votingMsg = document.getElementById('voting-status-message');

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

const storyCoverFile = document.getElementById('story-cover-file');
const uploadCoverBtn = document.getElementById('upload-cover-btn');
const coverUploadMessage = document.getElementById('cover-upload-message');
const coverPreview = document.getElementById('cover-preview');

const storyPageForm = document.getElementById('story-page-form');
const storyPageFile = document.getElementById('story-page-file');
const storyPageCaption = document.getElementById('story-page-caption');
const uploadStoryPageBtn = document.getElementById('upload-story-page-btn');
const storyPageStatusMsg = document.getElementById('story-page-status-message');
const storyPagesPreview = document.getElementById('story-pages-preview');

const productSection = document.getElementById('product-management-section');

let currentUser = null;
let currentAccessToken = null;
let allStories = [];
let allUsers = [];
let editingStoryId = null;

document.getElementById('logout-link')?.addEventListener('click', async (e) => {
  e.preventDefault();
  await logout();
  window.location.href = '/';
});

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  return data?.session?.access_token || null;
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const result = reader.result;
        const base64 = String(result).split(',')[1];
        resolve(base64);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function parseJsonResponseSafely(res) {
  const rawText = await res.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(rawText || 'Server returned an invalid response.');
  }
}

function clearStoryPagesUI() {
  if (storyPageFile) storyPageFile.value = '';
  if (storyPageCaption) storyPageCaption.value = '';

  if (storyPageStatusMsg) {
    storyPageStatusMsg.textContent = '';
    storyPageStatusMsg.style.color = '';
  }

  if (storyPagesPreview) {
    storyPagesPreview.innerHTML = '<p>Select a story to manage pages.</p>';
  }
}

function clearStoryForm() {
  editingStoryId = null;

  if (storySelect) storySelect.value = '';
  storyForm?.reset();

  if (storyActive) storyActive.checked = true;
  if (saveStoryBtn) saveStoryBtn.textContent = 'Create Story';
  if (deleteStoryBtn) deleteStoryBtn.style.display = 'none';

  if (storyMsg) {
    storyMsg.textContent = '';
    storyMsg.style.color = '';
  }

  if (coverUploadMessage) {
    coverUploadMessage.textContent = '';
    coverUploadMessage.style.color = '';
  }

  if (storyCoverFile) storyCoverFile.value = '';

  if (coverPreview) {
    coverPreview.src = '';
    coverPreview.style.display = 'none';
  }

  clearStoryPagesUI();
}

async function populateStoryForm(story) {
  editingStoryId = story.id;
  storyTitle.value = story.title || '';
  storyAuthor.value = story.author || '';
  storyDescription.value = story.description || '';
  storyActive.checked = !!story.active;

  if (story.cover_image_url) {
    coverPreview.src = story.cover_image_url;
    coverPreview.style.display = 'block';
  } else {
    coverPreview.src = '';
    coverPreview.style.display = 'none';
  }

  coverUploadMessage.textContent = '';
  coverUploadMessage.style.color = '';
  storyCoverFile.value = '';

  saveStoryBtn.textContent = 'Update Story';
  deleteStoryBtn.style.display = 'inline-block';
  storyMsg.textContent = '';
  storyMsg.style.color = '';

  await loadStoryPages(story.id);
}

async function determineWinner() {
  try {
    const token = await getAccessToken();

    const res = await fetch('/.netlify/functions/determine-winner', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok) {
      throw new Error(result.error || 'Unknown error');
    }

    if (result.success) {
      alert(`Winner determined!\n\nStory ID: ${result.winner_id}\nVotes: ${result.vote_count}`);
    } else {
      alert(result.message || 'No winner determined.');
    }
  } catch (err) {
    console.error('Error determining winner:', err);
    alert('Failed to determine winner. Check console.');
  }
}

async function loadVotingPeriod() {
  try {
    const { data: periods, error } = await supabase
      .from('voting_periods')
      .select('start_time, end_time')
      .order('start_time', { ascending: false })
      .limit(1);

    if (!error && periods && periods.length > 0) {
      votingStart.value = new Date(periods[0].start_time).toISOString().slice(0, 16);
      votingEnd.value = new Date(periods[0].end_time).toISOString().slice(0, 16);
    }
  } catch (err) {
    console.error('Error loading voting period:', err);
  }
}

async function handleVotingPeriodSubmit(e) {
  e.preventDefault();

  const start_time = votingStart.value;
  const end_time = votingEnd.value;

  try {
    const token = await getAccessToken();

    const res = await fetch('/.netlify/functions/set-voting-period', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ start_time, end_time })
    });

    const result = await parseJsonResponseSafely(res);

    if (result.success) {
      votingMsg.textContent = 'Voting period updated successfully!';
      votingMsg.style.color = 'green';
    } else {
      votingMsg.textContent = `Error: ${result.error}`;
      votingMsg.style.color = 'red';
    }
  } catch (err) {
    votingMsg.textContent = `Error: ${err.message}`;
    votingMsg.style.color = 'red';
  }
}

async function loadStoriesPreview() {
  try {
    const { data: stories, error } = await supabase
      .from('stories')
      .select('id, title, author, description, cover_image_url, active, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    allStories = stories || [];
    storiesPreview.innerHTML = '';
    storySelect.innerHTML = '<option value="">-- Create New Story --</option>';

    if (!allStories.length) {
      storiesPreview.innerHTML = '<p>No stories yet.</p>';
      return;
    }

    allStories.forEach(story => {
      const option = document.createElement('option');
      option.value = story.id;
      option.textContent = story.title;
      storySelect.appendChild(option);

      const div = document.createElement('div');
      div.className = 'story-chip';
      div.innerHTML = `
        ${story.cover_image_url ? `<img src="${story.cover_image_url}" alt="${story.title} cover">` : ''}
        <strong>${story.title}</strong>
        <div>${story.author || 'No author set'}</div>
        <div>Status: ${story.active ? 'Active' : 'Inactive'}</div>
      `;
      storiesPreview.appendChild(div);
    });
  } catch (err) {
    console.error('Error loading stories preview:', err);
    storiesPreview.innerHTML = '<p>Failed to load stories.</p>';
  }
}

async function loadStoryPages(storyId) {
  if (!storyId) {
    clearStoryPagesUI();
    return;
  }

  try {
    storyPagesPreview.innerHTML = '<p>Loading story pages...</p>';

    const { data: pages, error } = await supabase
      .from('story_pages')
      .select('id, story_id, page_number, image_url, caption, created_at')
      .eq('story_id', storyId)
      .order('page_number', { ascending: true });

    if (error) throw error;

    storyPagesPreview.innerHTML = '';

    if (!pages || pages.length === 0) {
      storyPagesPreview.innerHTML = '<p>No pages uploaded yet for this story.</p>';
      return;
    }

    pages.forEach(page => {
      const card = document.createElement('div');
      card.className = 'story-page-card';
      card.innerHTML = `
        <img src="${page.image_url || ''}" alt="Story page ${page.page_number}">
        <strong>Page ${page.page_number}</strong>
        <div>${page.caption || 'No caption'}</div>
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

    attachStoryPageDeleteListeners();
  } catch (err) {
    console.error('Error loading story pages:', err);
    storyPagesPreview.innerHTML = '<p>Failed to load story pages.</p>';
  }
}

function renderUsersTable(users) {
  if (!tbody) return;

  tbody.innerHTML = '';

  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.email}</td>
      <td class="role-cell">${u.role}</td>
      <td class="vote-balance-cell">${u.vote_balance ?? 0}</td>
      <td>
        <select class="role-select">
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
        <button class="role-update-btn" data-user-id="${u.id}">Update Role</button>
      </td>
      <td>
        <div class="compact-actions">
          <button class="vote-adjust-btn" data-user-id="${u.id}" data-amount="1">+1 Vote</button>
          <button class="vote-adjust-btn danger-btn" data-user-id="${u.id}" data-amount="-1">-1 Vote</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  attachUserTableListeners();
}

async function loadUsers() {
  try {
    const headers = currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {};
    const res = await fetch('/.netlify/functions/get-users', { headers });
    const users = await parseJsonResponseSafely(res);

    if (!res.ok) {
      throw new Error(users.error || 'Failed to load users');
    }

    allUsers = users;
    renderUsersTable(users);
  } catch (err) {
    console.error('Error loading users:', err);
    statusEl.textContent = 'Error loading users.';
  }
}

function attachUserTableListeners() {
  tbody.querySelectorAll('.role-update-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const userId = button.dataset.userId;
      const row = button.closest('tr');
      const select = row.querySelector('.role-select');
      const newRole = select.value;

      try {
        button.disabled = true;
        button.textContent = 'Updating...';

        const res = await fetch('/.netlify/functions/update-user-role', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {})
          },
          body: JSON.stringify({ userId, role: newRole, requesterId: currentUser.id })
        });

        const result = await parseJsonResponseSafely(res);

        if (result.success) {
          row.querySelector('.role-cell').textContent = newRole;
          button.textContent = 'Updated!';
          setTimeout(() => {
            button.textContent = 'Update Role';
          }, 800);
        } else {
          alert(`Error: ${result.error}`);
          button.textContent = 'Update Role';
        }
      } catch (err) {
        console.error(err);
        alert('Error updating role.');
        button.textContent = 'Update Role';
      } finally {
        button.disabled = false;
      }
    });
  });

  tbody.querySelectorAll('.vote-adjust-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const userId = button.dataset.userId;
      const amount = Number(button.dataset.amount);
      const row = button.closest('tr');
      const balanceCell = row.querySelector('.vote-balance-cell');
      const originalText = amount > 0 ? '+1 Vote' : '-1 Vote';

      try {
        button.disabled = true;
        button.textContent = 'Working...';

        const res = await fetch('/.netlify/functions/update-user-votes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {})
          },
          body: JSON.stringify({
            targetUserId: userId,
            amount
          })
        });

        const result = await parseJsonResponseSafely(res);

        if (!res.ok || !result.success) {
          throw new Error(result.error || 'Failed to update vote balance');
        }

        balanceCell.textContent = result.user.vote_balance;
        button.textContent = amount > 0 ? '+1 Added' : '-1 Removed';

        setTimeout(() => {
          button.textContent = originalText;
        }, 800);
      } catch (err) {
        console.error(err);
        alert(err.message || 'Error updating vote balance.');
        button.textContent = originalText;
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function handleCoverUpload() {
  try {
    coverUploadMessage.textContent = '';
    coverUploadMessage.style.color = '';

    if (!editingStoryId) {
      throw new Error('Create or select a story before uploading a cover image.');
    }

    const file = storyCoverFile.files?.[0];
    if (!file) {
      throw new Error('Please choose an image file first.');
    }

    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    uploadCoverBtn.disabled = true;
    uploadCoverBtn.textContent = 'Uploading...';

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

    if (!res.ok) {
      throw new Error(result.error || 'Failed to upload cover image');
    }

    coverUploadMessage.textContent = 'Cover image uploaded successfully!';
    coverUploadMessage.style.color = 'green';

    if (result.cover_image_url) {
      coverPreview.src = result.cover_image_url;
      coverPreview.style.display = 'block';
    }

    storyCoverFile.value = '';
    await loadStoriesPreview();

    if (editingStoryId) {
      const refreshedStory = allStories.find(story => story.id === editingStoryId);
      if (refreshedStory) await populateStoryForm(refreshedStory);
    }
  } catch (err) {
    console.error('Error uploading cover image:', err);
    coverUploadMessage.textContent = err.message || 'Failed to upload cover image.';
    coverUploadMessage.style.color = 'red';
  } finally {
    uploadCoverBtn.disabled = false;
    uploadCoverBtn.textContent = 'Upload Cover Image';
  }
}

async function handleStoryPageUpload(e) {
  e.preventDefault();

  try {
    storyPageStatusMsg.textContent = '';
    storyPageStatusMsg.style.color = '';

    if (!editingStoryId) {
      throw new Error('Select or create a story before uploading pages.');
    }

    const file = storyPageFile.files?.[0];
    if (!file) {
      throw new Error('Please choose a page image first.');
    }

    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    uploadStoryPageBtn.disabled = true;
    uploadStoryPageBtn.textContent = 'Uploading Page...';

    const file_base64 = await fileToBase64(file);
    const caption = storyPageCaption.value.trim();

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
        caption
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok) {
      throw new Error(result.error || 'Failed to upload story page');
    }

    storyPageStatusMsg.textContent = 'Story page uploaded successfully!';
    storyPageStatusMsg.style.color = 'green';

    storyPageFile.value = '';
    storyPageCaption.value = '';

    await loadStoryPages(editingStoryId);
  } catch (err) {
    console.error('Error uploading story page:', err);
    storyPageStatusMsg.textContent = err.message || 'Failed to upload story page.';
    storyPageStatusMsg.style.color = 'red';
  } finally {
    uploadStoryPageBtn.disabled = false;
    uploadStoryPageBtn.textContent = 'Upload Story Page';
  }
}

function attachStoryPageDeleteListeners() {
  document.querySelectorAll('.delete-story-page-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const pageId = button.dataset.pageId;
      if (!pageId) return;

      const confirmed = confirm('Are you sure you want to delete this story page?');
      if (!confirmed) return;

      try {
        const token = await getAccessToken();
        if (!token) throw new Error('No active session found.');

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

        if (!res.ok) {
          throw new Error(result.error || 'Failed to delete story page');
        }

        await loadStoryPages(editingStoryId);
      } catch (err) {
        console.error('Error deleting story page:', err);
        alert(err.message || 'Failed to delete story page.');
        button.disabled = false;
        button.textContent = 'Delete Page';
      }
    });
  });
}

async function handleDeleteStory() {
  if (!editingStoryId) return;

  const confirmed = confirm('Are you sure you want to delete this story? This will also delete its story pages.');
  if (!confirmed) return;

  try {
    const token = await getAccessToken();
    if (!token) throw new Error('No active session found.');

    deleteStoryBtn.disabled = true;
    deleteStoryBtn.textContent = 'Deleting...';

    const res = await fetch('/.netlify/functions/delete-story', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ story_id: editingStoryId })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok) {
      throw new Error(result.error || 'Failed to delete story');
    }

    storyMsg.textContent = 'Story deleted successfully!';
    storyMsg.style.color = 'green';

    clearStoryForm();
    await loadStoriesPreview();
  } catch (err) {
    console.error('Error deleting story:', err);
    storyMsg.textContent = err.message || 'Failed to delete story.';
    storyMsg.style.color = 'red';
  } finally {
    deleteStoryBtn.disabled = false;
    deleteStoryBtn.textContent = 'Delete Story';
  }
}

async function handleStorySubmit(e) {
  e.preventDefault();

  storyMsg.textContent = '';
  saveStoryBtn.disabled = true;
  saveStoryBtn.textContent = editingStoryId ? 'Updating...' : 'Creating...';

  try {
    const title = storyTitle.value.trim();
    const author = storyAuthor.value.trim();
    const description = storyDescription.value.trim();
    const active = storyActive.checked;

    if (!title) {
      throw new Error('Title is required.');
    }

    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    const selectedStory = allStories.find(story => story.id === editingStoryId);
    const cover_image_url = selectedStory?.cover_image_url || null;

    let res;

    if (editingStoryId) {
      res = await fetch('/.netlify/functions/update-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          story_id: editingStoryId,
          title,
          author,
          cover_image_url,
          description,
          active
        })
      });
    } else {
      res = await fetch('/.netlify/functions/create-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          author,
          cover_image_url,
          description,
          active
        })
      });
    }

    const result = await parseJsonResponseSafely(res);

    if (!res.ok) {
      throw new Error(result.error || (editingStoryId ? 'Failed to update story' : 'Failed to create story'));
    }

    const wasEditing = !!editingStoryId;
    const returnedStoryId = result.story?.id || null;

    storyMsg.textContent = wasEditing
      ? 'Story updated successfully!'
      : 'Story created successfully!';
    storyMsg.style.color = 'green';

    clearStoryForm();
    await loadStoriesPreview();

    if (!wasEditing && returnedStoryId) {
      editingStoryId = returnedStoryId;
      storySelect.value = returnedStoryId;
      const createdStory = allStories.find(story => story.id === returnedStoryId);
      if (createdStory) await populateStoryForm(createdStory);
    }
  } catch (err) {
    console.error('Error saving story:', err);
    storyMsg.textContent = err.message || 'Failed to save story.';
    storyMsg.style.color = 'red';
  } finally {
    saveStoryBtn.disabled = false;
    saveStoryBtn.textContent = editingStoryId ? 'Update Story' : 'Create Story';
  }
}

async function handleStorySelectChange() {
  const selectedId = storySelect.value;

  if (!selectedId) {
    clearStoryForm();
    return;
  }

  const selectedStory = allStories.find(story => story.id === selectedId);
  if (selectedStory) {
    await populateStoryForm(selectedStory);
  }
}

export async function initAdminPanel() {
  currentUser = await getCurrentUserAsync();
  if (!currentUser) {
    statusEl.textContent = 'Not logged in.';
    return;
  }

  currentAccessToken = await getAccessToken();

  let users = [];
  try {
    const headers = currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {};
    const res = await fetch('/.netlify/functions/get-users', { headers });
    users = await parseJsonResponseSafely(res);

    if (!res.ok) {
      throw new Error(users.error || 'Failed to load users');
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Error loading users.';
    return;
  }

  const profile = users.find(u => u.id === currentUser.id);
  if (!profile || profile.role !== 'admin') {
    statusEl.textContent = 'Access denied: Admins only.';
    return;
  }

  statusEl.style.display = 'none';
  table.style.display = 'table';
  votingSection.style.display = 'block';
  storySection.style.display = 'block';
  productSection.style.display = 'block';

  allUsers = users;
  renderUsersTable(users);

  await loadVotingPeriod();
  await loadStoriesPreview();
  clearStoryPagesUI();

  determineWinnerBtn?.addEventListener('click', determineWinner);
  votingForm?.addEventListener('submit', handleVotingPeriodSubmit);
  storySelect?.addEventListener('change', handleStorySelectChange);
  resetStoryBtn?.addEventListener('click', clearStoryForm);
  uploadCoverBtn?.addEventListener('click', handleCoverUpload);
  deleteStoryBtn?.addEventListener('click', handleDeleteStory);
  storyForm?.addEventListener('submit', handleStorySubmit);
  storyPageForm?.addEventListener('submit', handleStoryPageUpload);
}

document.addEventListener('DOMContentLoaded', initAdminPanel);