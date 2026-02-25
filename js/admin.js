// js/admin.js
import { supabase, getCurrentUserAsync } from './auth.js';

/**
 * Initialize Admin Panel
 */
async function initAdminPanel() {
  // Wait for auth to be ready
  const user = await getCurrentUserAsync();

  if (!user) {
    alert('Please log in to access the admin panel.');
    window.location.href = '/';
    return;
  }

  // Fetch profile for current user
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    alert('Could not verify admin access. Check console.');
    window.location.href = '/';
    return;
  }

  if (!profile || profile.role !== 'admin') {
    alert('Access denied: Admins only.');
    window.location.href = '/';
    return;
  }

  // User is an admin — load users table
  loadUsers();
}

/**
 * Load all users into the table
 */
async function loadUsers() {
  try {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, role');

    if (error) throw error;

    const tbody = document.querySelector('#users-table tbody');
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
          <button onclick="updateRole('${user.id}', this.previousElementSibling.firstElementChild.value)">
            Save
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error('Error loading users:', err);
    alert('Failed to load users. Check console for details.');
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
    loadUsers(); // reload table
  } catch (err) {
    console.error('Error updating role:', err);
    alert('Failed to update role. Check console for details.');
  }
}

// Expose globally for inline onclick buttons
window.updateRole = updateRole;

// Start admin panel after DOM is loaded
document.addEventListener('DOMContentLoaded', initAdminPanel);