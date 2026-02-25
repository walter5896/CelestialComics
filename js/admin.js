// /js/admin.js
import { getCurrentUserAsync } from './auth.js';
import { supabase } from './supabase.js';

// Define your admin email(s)
const ADMIN_EMAILS = ['youremail@example.com']; // <-- replace with actual admin email

// Initialize Admin Panel
async function initAdminPanel() {
  const user = await getCurrentUserAsync();

  // Redirect non-admins
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    alert('Access denied: Admins only');
    window.location.href = '/';
    return;
  }

  loadUsers();
}

// Load all users into the table
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
  } catch (error) {
    console.error('Error loading users:', error.message);
    alert('Failed to load users. Check console for details.');
  }
}

// Update a user's role
async function updateRole(userId, newRole) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) throw error;

    alert('Role updated successfully!');
    loadUsers();
  } catch (error) {
    console.error('Error updating role:', error.message);
    alert('Failed to update role. Check console for details.');
  }
}

// Expose updateRole globally for inline onclick buttons
window.updateRole = updateRole;

// Start the admin panel
initAdminPanel();