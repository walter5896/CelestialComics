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
    const res = await fetch('/.netlify/functions/determine-winner', { method: 'POST' });
    const result = await res.json();

    if (!res.ok) throw new Error(result.error || 'Unknown error');

    if (result.success) {
      alert(`Winner determined!\n\nStory ID: ${result.winner_id}\nTotal Votes: ${result.vote_count}`);
    } else {
      alert(result.message);
    }
  } catch (err) {
    console.error('Error determining winner:', err.message);
    alert('Failed to determine winner. Check console for details.');
  }
}

/* =========================================
   VOTING PERIOD MANAGEMENT
========================================= */

async function loadVotingPeriod() {
  try {
    const { data: periods, error } = await supabase
      .from('voting_periods')
      .select('start_time, end_time')
      .order('start_time', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (periods && periods.length > 0) {
      const startInput = document.getElementById('voting-start');
      const endInput = document.getElementById('voting-end');

      startInput.value = new Date(periods[0].start_time).toISOString().slice(0,16);
      endInput.value = new Date(periods[0].end_time).toISOString().slice(0,16);
    }
  } catch (err) {
    console.error('Error loading voting period:', err.message);
  }
}

async function updateVotingPeriod(event) {
  event.preventDefault();

  const start_time = document.getElementById('voting-start').value;
  const end_time = document.getElementById('voting-end').value;
  const msgEl = document.getElementById('voting-status-message');

  try {
    const res = await fetch('/.netlify/functions/set-voting-period', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_time, end_time })
    });

    const result = await res.json();

    if (result.success) {
      msgEl.textContent = 'Voting period updated successfully!';
      msgEl.style.color = 'green';
    } else {
      msgEl.textContent = `Error: ${result.error}`;
      msgEl.style.color = 'red';
    }
  } catch (err) {
    msgEl.textContent = `Error: ${err.message}`;
    msgEl.style.color = 'red';
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

  // Show user table and voting section
  document.getElementById('users-table').style.display = 'table';
  document.getElementById('voting-section').style.display = 'block';

  // Load all users
  await loadUsers();

  // Load voting period
  await loadVotingPeriod();

  // Attach voting period form handler
  const votingForm = document.getElementById('voting-period-form');
  votingForm.addEventListener('submit', updateVotingPeriod);

  // Attach Determine Winner button
  const winnerBtn = document.getElementById('determine-winner-btn');
  winnerBtn.addEventListener('click', determineWinner);
}

/* =========================================
   GLOBAL EXPOSURE (for inline onclick)
========================================= */

window.updateRole = updateRole;
window.determineWinner = determineWinner;