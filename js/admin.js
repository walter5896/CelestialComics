// admin.js
import { supabase } from './supabase.js';
import { getCurrentProfileAsync } from './auth.js';

/**
 * Initialize the admin panel
 * Only accessible by admins
 */
async function initAdminPanel() {
  const profile = await getCurrentProfileAsync();

  if (!profile || profile.role !== 'admin') {
    alert('Access denied: Admins only');
    window.location.href = '/'; // redirect non-admins
    return;
  }

  await loadUsers();
}

/**
 * Load all users and render into the table
 */
async function loadUsers() {
  try {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, role');

    if (error) throw error;

    const tbody = document.querySelector('#users-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    users.forEach(user => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${user.email}</td>
        <td>
          <select data-user-id="${user.id}">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </td>
        <td>
          <button data-user-id="${user.id}" class="save-role-btn">
            Save
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });

    attachSaveRoleListeners();
  } catch (err) {
    console.error('Error loading users:', err.message);
    alert('Failed to load users. Check console.');
  }
}

/**
 * Update a user's role
 */
async function updateRole(userId, newRole) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) throw error;

    alert('Role updated successfully!');
    await loadUsers();
  } catch (err) {
    console.error('Error updating role:', err.message);
    alert('Failed to update role. Check console.');
  }
}

/**
 * Attach listeners to all Save buttons
 */
function attachSaveRoleListeners() {
  document.querySelectorAll('.save-role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const userId = btn.dataset.userId;
      const select = btn.closest('tr').querySelector('select');
      const newRole = select.value;
      updateRole(userId, newRole);
    });
  });
}

// Expose for potential inline use
window.updateRole = updateRole;

// Initialize admin panel on DOM ready
document.addEventListener('DOMContentLoaded', initAdminPanel);