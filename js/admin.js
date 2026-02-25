// /js/admin.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js'; // your current auth.js

// Fetch current profile safely from the DB
async function fetchCurrentProfile() {
  const user = await getCurrentUserAsync();
  if (!user) return { id: null, role: 'user', email: null };

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data || { id: user.id, email: user.email, role: 'user' };
  } catch (err) {
    console.error('Error fetching profile:', err.message);
    return { id: user.id, email: user.email, role: 'user' };
  }
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
  } catch (err) {
    console.error('Error loading users:', err.message);
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
    await loadUsers();
  } catch (err) {
    console.error('Error updating role:', err.message);
    alert('Failed to update role. Check console for details.');
  }
}

// Expose updateRole globally for inline onclick buttons
window.updateRole = updateRole;

// **New exported function** — initialize the admin panel
export async function initAdminPanel() {
  const profile = await fetchCurrentProfile();
  if (!profile || profile.role !== 'admin') {
    alert('Access denied: Admins only');
    return;
  }
  await loadUsers();
}