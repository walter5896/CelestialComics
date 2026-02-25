// admin-nav.js
import { getCurrentUserAsync } from './auth.js';

async function showAdminLink() {
  const currentUser = await getCurrentUserAsync();
  const adminLink = document.querySelector('.admin-link');

  if (!adminLink) return;

  if (!currentUser) {
    adminLink.style.display = 'none';
    return;
  }

  try {
    // Fetch all users from Netlify function
    const res = await fetch('/.netlify/functions/get-users');
    const users = await res.json();
    const userProfile = users.find(u => u.id === currentUser.id);

    if (userProfile && userProfile.role === 'admin') {
      adminLink.style.display = 'inline-block';
    } else {
      adminLink.style.display = 'none';
    }
  } catch (err) {
    console.error('Error checking admin role:', err);
    adminLink.style.display = 'none';
  }
}

// Run on page load
showAdminLink();

// Optional: re-run when auth changes
window.addEventListener('user-changed', showAdminLink);