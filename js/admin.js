// js/admin.js

// Import your Supabase client (make sure supabase.js exists and exports `supabase`)
import { supabase } from './supabase.js'; // adjust path if needed

// Safe fetchCurrentProfile from auth.js
async function fetchCurrentProfile() {
  try {
    const user = supabase.auth.user();
    if (!user) return null;

    const { data: profile, error, status } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // If profile doesn't exist, return a safe default
    if (error && status !== 406) throw error;
    return profile || { id: user.id, role: 'user', email: user.email };
  } catch (error) {
    console.error('Error fetching profile:', error.message);
    return { id: null, role: 'user', email: null };
  }
}

// Initialize Admin Panel
async function initAdminPanel() {
  const profile = await fetchCurrentProfile();

  // Redirect non-admins away
  if (!profile || profile.role !== 'admin') {
    alert('Access denied: Admins only');
    window.location.href = '/'; // Redirect to homepage
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
    // Optionally reload the table to reflect changes
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