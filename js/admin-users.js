// /js/admin-users.js
import { parseJsonResponseSafely } from './admin-shared.js';

let usersModuleInitialized = false;

function setStatus(statusEl, message = '', color = '') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = color;
}

function getOriginalVoteButtonText(type, amount) {
  if (type === 'bonus') {
    return amount > 0 ? '+1 Bonus' : '-1 Bonus';
  }

  return amount > 0 ? '+1 Round' : '-1 Round';
}

export function renderUsersTable(users, tbody) {
  if (!tbody) return;

  tbody.innerHTML = '';

  const safeUsers = Array.isArray(users) ? users : [];

  safeUsers.forEach((user) => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${user.email || 'Unknown email'}</td>
      <td class="role-cell">${user.role || 'user'}</td>
      <td class="round-vote-balance-cell">${user.vote_balance ?? 0}</td>
      <td class="bonus-vote-balance-cell">${user.bonus_vote_balance ?? 0}</td>
      <td>
        <select class="role-select">
          <option value="user" ${user.role === 'user' ? 'selected' : ''}>user</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
        <button class="role-update-btn" data-user-id="${user.id}">Update Role</button>
      </td>
      <td>
        <div class="compact-actions">
          <button class="vote-adjust-btn" data-user-id="${user.id}" data-amount="1" data-type="round">+1 Round</button>
          <button class="vote-adjust-btn danger-btn" data-user-id="${user.id}" data-amount="-1" data-type="round">-1 Round</button>
          <button class="vote-adjust-btn" data-user-id="${user.id}" data-amount="1" data-type="bonus">+1 Bonus</button>
          <button class="vote-adjust-btn danger-btn" data-user-id="${user.id}" data-amount="-1" data-type="bonus">-1 Bonus</button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

export async function loadUsersTable({
  tbody,
  statusEl,
  getAccessToken,
  setAllUsers
}) {
  if (!tbody) return [];

  try {
    setStatus(statusEl, 'Loading users...', '#374151');

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

    const users = Array.isArray(result) ? result : [];

    if (typeof setAllUsers === 'function') {
      setAllUsers(users);
    }

    renderUsersTable(users, tbody);
    setStatus(statusEl, '', '');

    return users;
  } catch (error) {
    console.error('Error loading users:', error);
    tbody.innerHTML = '<tr><td colspan="6">Failed to load users.</td></tr>';
    setStatus(statusEl, error.message || 'Failed to load users.', 'red');
    return [];
  }
}

async function handleRoleUpdate(button, ctx) {
  const {
    statusEl,
    getAccessToken,
    getCurrentUser
  } = ctx;

  const userId = button.dataset.userId;
  const row = button.closest('tr');
  const select = row?.querySelector('.role-select');
  const roleCell = row?.querySelector('.role-cell');
  const newRole = select?.value || 'user';

  const originalText = 'Update Role';

  try {
    const currentUser = typeof getCurrentUser === 'function'
      ? getCurrentUser()
      : null;

    if (!currentUser?.id) {
      throw new Error('Admin user not available.');
    }

    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    button.disabled = true;
    button.textContent = 'Updating...';

    const res = await fetch('/.netlify/functions/update-user-role', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        userId,
        role: newRole,
        requesterId: currentUser.id
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to update role');
    }

    if (roleCell) {
      roleCell.textContent = newRole;
    }

    setStatus(statusEl, 'User role updated successfully.', 'green');
    button.textContent = 'Updated!';

    setTimeout(() => {
      button.textContent = originalText;
    }, 800);
  } catch (error) {
    console.error('Error updating role:', error);
    setStatus(statusEl, error.message || 'Error updating role.', 'red');
    button.textContent = originalText;
  } finally {
    button.disabled = false;
  }
}

async function handleVoteAdjust(button, ctx) {
  const {
    statusEl,
    getAccessToken
  } = ctx;

  const userId = button.dataset.userId;
  const amount = Number(button.dataset.amount);
  const type = String(button.dataset.type || 'round');

  const row = button.closest('tr');
  const roundBalanceCell = row?.querySelector('.round-vote-balance-cell');
  const bonusBalanceCell = row?.querySelector('.bonus-vote-balance-cell');
  const originalText = getOriginalVoteButtonText(type, amount);

  try {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    button.disabled = true;
    button.textContent = 'Working...';

    const res = await fetch('/.netlify/functions/update-user-votes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        targetUserId: userId,
        amount,
        type
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to update vote balance');
    }

    if (roundBalanceCell) {
      roundBalanceCell.textContent = result.user?.vote_balance ?? 0;
    }

    if (bonusBalanceCell) {
      bonusBalanceCell.textContent = result.user?.bonus_vote_balance ?? 0;
    }

    setStatus(statusEl, 'User vote balance updated successfully.', 'green');

    button.textContent = amount > 0 ? '+1 Added' : '-1 Removed';

    setTimeout(() => {
      button.textContent = originalText;
    }, 800);
  } catch (error) {
    console.error('Error updating vote balance:', error);
    setStatus(statusEl, error.message || 'Error updating vote balance.', 'red');
    button.textContent = originalText;
  } finally {
    button.disabled = false;
  }
}

function attachUsersTableHandlers(ctx) {
  const { tbody } = ctx;
  if (!tbody || tbody.dataset.usersHandlersAttached === 'true') return;

  tbody.dataset.usersHandlersAttached = 'true';

  tbody.addEventListener('click', async (event) => {
    const roleButton = event.target.closest('.role-update-btn');
    if (roleButton) {
      await handleRoleUpdate(roleButton, ctx);
      return;
    }

    const voteButton = event.target.closest('.vote-adjust-btn');
    if (voteButton) {
      await handleVoteAdjust(voteButton, ctx);
    }
  });
}

export function initAdminUsers(ctx) {
  if (usersModuleInitialized) return;
  usersModuleInitialized = true;

  attachUsersTableHandlers(ctx);
}