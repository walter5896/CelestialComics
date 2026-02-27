// /js/admin.js

import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';

/* =========================================
   AUTH / PROFILE
========================================= */

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

/* =========================================
   USER MANAGEMENT
========================================= */

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
          <button onclick="updateRole('${user.id}', this.parentElement.previousElementSibling.firstElementChild.value)">
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
    alert('Failed to update role.');
  }
}

/* =========================================
   VOTING CONTROLS
========================================= */

async function determineWinner() {
  try {
    const res = await fetch('/.netlify/functions/determine-winner', {
      method: 'POST'
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Unknown error');
    }

    if (result.success) {
      alert(
        `Winner determined!\n\nStory ID: ${result.winner_id}\nTotal Votes: ${result.vote_count}`
      );
    } else {
      alert(result.message);
    }

  } catch (err) {
    console.error('Error determining winner:', err.message);
    alert('Failed to determine winner. Check console for details.');
  }
}

/* =========================================
   INIT ADMIN PANEL
========================================= */

export async function initAdminPanel() {
  const profile = await fetchCurrentProfile();

  if (!profile || profile.role !== 'admin') {
    alert('Access denied: Admins only');
    return;
  }

  await loadUsers();
}

/* =========================================
   GLOBAL EXPOSURE (for inline onclick)
========================================= */

window.updateRole = updateRole;
window.determineWinner = determineWinner;