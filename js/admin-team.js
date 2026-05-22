// /js/admin-team.js

let adminTeamInitialized = false;
let allTeamMembers = [];
let selectedTeamMemberId = '';

/* =========================
   HELPERS
========================= */

function setMessage(el, message = '', color = '') {
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

async function parseJsonResponseSafely(res) {
  const rawText = await res.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(rawText || 'Server returned an invalid response.');
  }
}

function normalizeBoolean(value) {
  return !!value;
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function getSelectedTeamMember() {
  if (!selectedTeamMemberId) return null;

  return allTeamMembers.find(
    (member) => String(member.id) === String(selectedTeamMemberId)
  ) || null;
}

async function getAdminToken(ctx) {
  const token = await ctx.getAccessToken();

  if (!token) {
    throw new Error('No active admin session found.');
  }

  return token;
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided.'));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',')
        ? result.split(',').pop()
        : result;

      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read image file.'));
    };

    reader.readAsDataURL(file);
  });
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

/* =========================
   FORM STATE
========================= */

export function clearTeamMemberForm(ctx) {
  selectedTeamMemberId = '';

  if (ctx.teamMemberSelect) {
    ctx.teamMemberSelect.value = '';
  }

  if (ctx.teamMemberName) ctx.teamMemberName.value = '';
  if (ctx.teamMemberRoleTitle) ctx.teamMemberRoleTitle.value = '';
  if (ctx.teamMemberShortBio) ctx.teamMemberShortBio.value = '';
  if (ctx.teamMemberFullBio) ctx.teamMemberFullBio.value = '';
  if (ctx.teamMemberDisplayOrder) ctx.teamMemberDisplayOrder.value = '0';
  if (ctx.teamMemberActive) ctx.teamMemberActive.checked = true;
  if (ctx.teamMemberImageFile) ctx.teamMemberImageFile.value = '';

  if (ctx.teamMemberImagePreview) {
    ctx.teamMemberImagePreview.src = '';
    ctx.teamMemberImagePreview.alt = '';
    ctx.teamMemberImagePreview.style.display = 'none';
  }

  if (ctx.saveTeamMemberBtn) {
    ctx.saveTeamMemberBtn.textContent = 'Create Team Member';
  }

  if (ctx.deactivateTeamMemberBtn) {
    ctx.deactivateTeamMemberBtn.style.display = 'none';
  }

  if (ctx.deleteTeamMemberImageBtn) {
    ctx.deleteTeamMemberImageBtn.style.display = 'none';
  }

  setMessage(ctx.teamMemberStatusMsg, '');
  setMessage(ctx.teamMemberImageUploadMessage, '');
}

function populateTeamMemberForm(ctx, member) {
  if (!member) {
    clearTeamMemberForm(ctx);
    return;
  }

  selectedTeamMemberId = String(member.id);

  if (ctx.teamMemberSelect) {
    ctx.teamMemberSelect.value = selectedTeamMemberId;
  }

  if (ctx.teamMemberName) ctx.teamMemberName.value = member.name || '';
  if (ctx.teamMemberRoleTitle) ctx.teamMemberRoleTitle.value = member.role_title || '';
  if (ctx.teamMemberShortBio) ctx.teamMemberShortBio.value = member.short_bio || '';
  if (ctx.teamMemberFullBio) ctx.teamMemberFullBio.value = member.full_bio || '';
  if (ctx.teamMemberDisplayOrder) ctx.teamMemberDisplayOrder.value = String(member.display_order ?? 0);
  if (ctx.teamMemberActive) ctx.teamMemberActive.checked = !!member.active;
  if (ctx.teamMemberImageFile) ctx.teamMemberImageFile.value = '';

  if (ctx.teamMemberImagePreview) {
    if (member.image_url) {
      ctx.teamMemberImagePreview.src = member.image_url;
      ctx.teamMemberImagePreview.alt = `${member.name || 'Team member'} image preview`;
      ctx.teamMemberImagePreview.style.display = 'block';
    } else {
      ctx.teamMemberImagePreview.src = '';
      ctx.teamMemberImagePreview.alt = '';
      ctx.teamMemberImagePreview.style.display = 'none';
    }
  }

  if (ctx.saveTeamMemberBtn) {
    ctx.saveTeamMemberBtn.textContent = 'Update Team Member';
  }

  if (ctx.deactivateTeamMemberBtn) {
    ctx.deactivateTeamMemberBtn.style.display = 'inline-flex';
    ctx.deactivateTeamMemberBtn.textContent = member.active
      ? 'Deactivate Team Member'
      : 'Reactivate Team Member';
  }

  if (ctx.deleteTeamMemberImageBtn) {
    ctx.deleteTeamMemberImageBtn.style.display = member.image_path
      ? 'inline-flex'
      : 'none';
  }

  setMessage(ctx.teamMemberStatusMsg, '');
  setMessage(ctx.teamMemberImageUploadMessage, '');
}

function buildTeamMemberPayload(ctx, overrides = {}) {
  const name = String(ctx.teamMemberName?.value || '').trim();

  if (!name) {
    throw new Error('Team member name is required.');
  }

  return {
    id: selectedTeamMemberId || undefined,
    name,
    role_title: String(ctx.teamMemberRoleTitle?.value || '').trim(),
    short_bio: String(ctx.teamMemberShortBio?.value || '').trim(),
    full_bio: String(ctx.teamMemberFullBio?.value || '').trim(),
    display_order: normalizeInteger(ctx.teamMemberDisplayOrder?.value, 0),
    active: normalizeBoolean(ctx.teamMemberActive?.checked),
    ...overrides
  };
}

/* =========================
   RENDER
========================= */

function renderTeamMemberSelect(ctx) {
  if (!ctx.teamMemberSelect) return;

  const currentValue = ctx.teamMemberSelect.value || selectedTeamMemberId;

  ctx.teamMemberSelect.innerHTML = `
    <option value="">-- Create New Team Member --</option>
    ${allTeamMembers
      .map((member) => {
        const statusLabel = member.active ? '' : ' (Inactive)';

        return `
          <option value="${escapeHtml(member.id)}">
            ${escapeHtml(member.name || 'Unnamed Team Member')}${statusLabel}
          </option>
        `;
      })
      .join('')}
  `;

  const optionStillExists = Array.from(ctx.teamMemberSelect.options).some(
    (option) => option.value === currentValue
  );

  ctx.teamMemberSelect.value = optionStillExists ? currentValue : '';
  selectedTeamMemberId = ctx.teamMemberSelect.value || '';
}

function renderTeamMembersPreview(ctx) {
  if (!ctx.teamMembersPreview) return;

  if (!allTeamMembers.length) {
    ctx.teamMembersPreview.innerHTML = `
      <p class="empty-orders-state">
        No team members have been created yet.
      </p>
    `;
    return;
  }

  ctx.teamMembersPreview.innerHTML = allTeamMembers
    .map((member) => {
      const statusClass = member.active ? 'fulfilled' : 'canceled';
      const statusText = member.active ? 'Active' : 'Inactive';
      const imageMarkup = member.image_url
        ? `
          <img
            src="${escapeHtml(member.image_url)}"
            alt="${escapeHtml(member.name || 'Team member')} image"
            loading="lazy"
            decoding="async"
          />
        `
        : '';

      const bioText =
        member.short_bio ||
        member.full_bio ||
        'No description added yet.';

      return `
        <article class="story-chip team-member-admin-card" data-team-member-id="${escapeHtml(member.id)}">
          ${imageMarkup}
          <span class="status-badge ${statusClass}">${statusText}</span>
          <strong>${escapeHtml(member.name || 'Unnamed Team Member')}</strong>
          <div class="product-meta">
            <p><strong>Role:</strong> ${escapeHtml(member.role_title || 'No role/title set')}</p>
            <p><strong>Display Order:</strong> ${escapeHtml(member.display_order ?? 0)}</p>
            <p>${escapeHtml(bioText)}</p>
          </div>

          <div class="compact-actions">
            <button type="button" class="secondary-btn edit-team-member-btn" data-team-member-id="${escapeHtml(member.id)}">
              Edit
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

export async function loadTeamMembersPreview(ctx) {
  if (!ctx.teamMembersPreview && !ctx.teamMemberSelect) return;

  try {
    setMessage(ctx.teamMemberStatusMsg, 'Loading team members...', '#374151');

    const data = await fetchJsonWithAuth(ctx, '/.netlify/functions/get-team-members', {
      method: 'GET'
    });

    allTeamMembers = Array.isArray(data.team_members) ? data.team_members : [];

    renderTeamMemberSelect(ctx);
    renderTeamMembersPreview(ctx);

    setMessage(ctx.teamMemberStatusMsg, '');
  } catch (error) {
    console.error('Team members load error:', error);
    setMessage(ctx.teamMemberStatusMsg, error.message || 'Failed to load team members.', 'red');

    if (ctx.teamMembersPreview) {
      ctx.teamMembersPreview.innerHTML = `
        <p class="empty-orders-state">
          Failed to load team members.
        </p>
      `;
    }
  }
}

/* =========================
   ACTIONS
========================= */

async function saveTeamMember(ctx, event) {
  event?.preventDefault();

  try {
    const payload = buildTeamMemberPayload(ctx);

    if (ctx.saveTeamMemberBtn) {
      ctx.saveTeamMemberBtn.disabled = true;
      ctx.saveTeamMemberBtn.textContent = selectedTeamMemberId
        ? 'Updating...'
        : 'Creating...';
    }

    setMessage(ctx.teamMemberStatusMsg, 'Saving team member...', '#374151');

    const data = await fetchJsonWithAuth(ctx, '/.netlify/functions/upsert-team-member', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const savedMember = data.team_member;

    await loadTeamMembersPreview(ctx);

    if (savedMember?.id) {
      const reloadedMember = allTeamMembers.find(
        (member) => String(member.id) === String(savedMember.id)
      );

      populateTeamMemberForm(ctx, reloadedMember || savedMember);
    }

    setMessage(ctx.teamMemberStatusMsg, 'Team member saved successfully.', 'green');
  } catch (error) {
    console.error('Save team member error:', error);
    setMessage(ctx.teamMemberStatusMsg, error.message || 'Failed to save team member.', 'red');
  } finally {
    if (ctx.saveTeamMemberBtn) {
      ctx.saveTeamMemberBtn.disabled = false;
      ctx.saveTeamMemberBtn.textContent = selectedTeamMemberId
        ? 'Update Team Member'
        : 'Create Team Member';
    }
  }
}

async function toggleTeamMemberActive(ctx) {
  const member = getSelectedTeamMember();

  if (!member) {
    setMessage(ctx.teamMemberStatusMsg, 'Select a team member first.', 'red');
    return;
  }

  const nextActive = !member.active;
  const confirmMessage = nextActive
    ? `Reactivate ${member.name || 'this team member'}?`
    : `Deactivate ${member.name || 'this team member'}? They will be hidden from the public Team page.`;

  if (!window.confirm(confirmMessage)) return;

  try {
    const payload = buildTeamMemberPayload(ctx, {
      id: member.id,
      active: nextActive
    });

    if (ctx.deactivateTeamMemberBtn) {
      ctx.deactivateTeamMemberBtn.disabled = true;
      ctx.deactivateTeamMemberBtn.textContent = nextActive
        ? 'Reactivating...'
        : 'Deactivating...';
    }

    setMessage(ctx.teamMemberStatusMsg, 'Updating team member visibility...', '#374151');

    const data = await fetchJsonWithAuth(ctx, '/.netlify/functions/upsert-team-member', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    await loadTeamMembersPreview(ctx);
    populateTeamMemberForm(ctx, data.team_member);

    setMessage(ctx.teamMemberStatusMsg, 'Team member visibility updated.', 'green');
  } catch (error) {
    console.error('Toggle team member active error:', error);
    setMessage(ctx.teamMemberStatusMsg, error.message || 'Failed to update team member.', 'red');
  } finally {
    if (ctx.deactivateTeamMemberBtn) {
      const refreshedMember = getSelectedTeamMember();

      ctx.deactivateTeamMemberBtn.disabled = false;
      ctx.deactivateTeamMemberBtn.textContent = refreshedMember?.active
        ? 'Deactivate Team Member'
        : 'Reactivate Team Member';
    }
  }
}

async function uploadTeamMemberImage(ctx) {
  const member = getSelectedTeamMember();

  if (!member?.id) {
    setMessage(ctx.teamMemberImageUploadMessage, 'Create or select a team member first.', 'red');
    return;
  }

  const file = ctx.teamMemberImageFile?.files?.[0];

  if (!file) {
    setMessage(ctx.teamMemberImageUploadMessage, 'Choose an image file first.', 'red');
    return;
  }

  try {
    if (ctx.uploadTeamMemberImageBtn) {
      ctx.uploadTeamMemberImageBtn.disabled = true;
      ctx.uploadTeamMemberImageBtn.textContent = 'Uploading...';
    }

    setMessage(ctx.teamMemberImageUploadMessage, 'Uploading team image...', '#374151');

    const fileBase64 = await fileToBase64(file);

    const data = await fetchJsonWithAuth(ctx, '/.netlify/functions/upload-team-member-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        team_member_id: member.id,
        fileBase64,
        fileName: file.name,
        fileType: file.type
      })
    });

    await loadTeamMembersPreview(ctx);
    populateTeamMemberForm(ctx, data.team_member);

    setMessage(ctx.teamMemberImageUploadMessage, 'Team image uploaded successfully.', 'green');
  } catch (error) {
    console.error('Upload team member image error:', error);
    setMessage(ctx.teamMemberImageUploadMessage, error.message || 'Failed to upload team image.', 'red');
  } finally {
    if (ctx.uploadTeamMemberImageBtn) {
      ctx.uploadTeamMemberImageBtn.disabled = false;
      ctx.uploadTeamMemberImageBtn.textContent = 'Upload Team Image';
    }
  }
}

async function deleteTeamMemberImage(ctx) {
  const member = getSelectedTeamMember();

  if (!member?.id) {
    setMessage(ctx.teamMemberImageUploadMessage, 'Select a team member first.', 'red');
    return;
  }

  if (!member.image_path) {
    setMessage(ctx.teamMemberImageUploadMessage, 'This team member does not have an uploaded image.', '#374151');
    return;
  }

  if (!window.confirm(`Delete the image for ${member.name || 'this team member'}?`)) return;

  try {
    if (ctx.deleteTeamMemberImageBtn) {
      ctx.deleteTeamMemberImageBtn.disabled = true;
      ctx.deleteTeamMemberImageBtn.textContent = 'Deleting...';
    }

    setMessage(ctx.teamMemberImageUploadMessage, 'Deleting team image...', '#374151');

    const data = await fetchJsonWithAuth(ctx, '/.netlify/functions/delete-team-member-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        team_member_id: member.id
      })
    });

    await loadTeamMembersPreview(ctx);
    populateTeamMemberForm(ctx, data.team_member);

    setMessage(ctx.teamMemberImageUploadMessage, 'Team image deleted.', 'green');
  } catch (error) {
    console.error('Delete team member image error:', error);
    setMessage(ctx.teamMemberImageUploadMessage, error.message || 'Failed to delete team image.', 'red');
  } finally {
    if (ctx.deleteTeamMemberImageBtn) {
      ctx.deleteTeamMemberImageBtn.disabled = false;
      ctx.deleteTeamMemberImageBtn.textContent = 'Delete Team Image';
    }
  }
}

/* =========================
   EVENTS
========================= */

function bindTeamEvents(ctx) {
  ctx.teamMemberSelect?.addEventListener('change', () => {
    selectedTeamMemberId = ctx.teamMemberSelect.value || '';

    const selectedMember = getSelectedTeamMember();
    populateTeamMemberForm(ctx, selectedMember);
  });

  ctx.teamMemberForm?.addEventListener('submit', (event) => {
    saveTeamMember(ctx, event);
  });

  ctx.resetTeamMemberBtn?.addEventListener('click', () => {
    clearTeamMemberForm(ctx);
  });

  ctx.deactivateTeamMemberBtn?.addEventListener('click', () => {
    toggleTeamMemberActive(ctx);
  });

  ctx.uploadTeamMemberImageBtn?.addEventListener('click', () => {
    uploadTeamMemberImage(ctx);
  });

  ctx.deleteTeamMemberImageBtn?.addEventListener('click', () => {
    deleteTeamMemberImage(ctx);
  });

  ctx.teamMembersPreview?.addEventListener('click', (event) => {
    const editButton = event.target.closest?.('.edit-team-member-btn');
    if (!editButton) return;

    const memberId = editButton.dataset.teamMemberId;
    const member = allTeamMembers.find((item) => String(item.id) === String(memberId));

    if (!member) return;

    populateTeamMemberForm(ctx, member);

    ctx.teamMemberForm?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  });
}

/* =========================
   INIT
========================= */

export function initAdminTeam(ctx) {
  if (adminTeamInitialized) return;
  adminTeamInitialized = true;

  if (!ctx.teamSection) {
    return;
  }

  bindTeamEvents(ctx);
}