// admin-nav.js
import { getCurrentUserAsync } from './auth.js';

/**
 * Checks if the current user is an admin and shows/hides the admin nav link.
 */
async function updateAdminLink() {
  const adminLink = document.querySelector('.admin-link');
  if (!adminLink) return; // Exit if no admin link exists

  const currentUser = await getCurrentUserAsync();

  // Hide by default if not logged in
  if (!currentUser) {
    adminLink.style.display = 'none';
    return;
  }

  try {
    // Fetch all users (or profiles) via Netlify function
    const res = await fetch('/.netlify/functions/get-users');
    const users = await res.json();

    // Find the profile for the current user
    const currentUserProfile = users.find(u => u.id === currentUser.id);

    // Show link only if role is admin
    if (currentUserProfile?.role === 'admin') {
      adminLink.style.display = 'inline-block';
    } else {
      adminLink.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to fetch user roles:', err);
    adminLink.style.display = 'none';
  }
}

// Run on initial page load
document.addEventListener('DOMContentLoaded', updateAdminLink);

// Re-run whenever auth changes (triggered in auth.js via custom event)
window.addEventListener('user-changed', updateAdminLink);