// /js/admin-nav.js
import { waitForAuthReady, refreshProfile } from './auth.js';
import { getState, subscribe } from './state.js';

let adminNavInitialized = false;

function setAdminLinksVisible(isVisible) {
  const adminLinks = document.querySelectorAll('.admin-link');
  if (!adminLinks.length) return;

  adminLinks.forEach((link) => {
    link.style.display = isVisible ? 'inline-block' : 'none';
  });
}

function isAdminProfile(profile) {
  return String(profile?.role || '').toLowerCase() === 'admin';
}

/**
 * Uses the loaded profile role to show or hide all admin nav links.
 */
function updateAdminLinkVisibility() {
  const { currentUser, profile } = getState();

  if (!currentUser || !profile) {
    setAdminLinksVisible(false);
    return;
  }

  setAdminLinksVisible(isAdminProfile(profile));
}

async function initAdminNav() {
  if (adminNavInitialized) return;
  adminNavInitialized = true;

  await waitForAuthReady();

  try {
    await refreshProfile();
  } catch (error) {
    console.error('Admin nav could not refresh profile:', error);
  }

  updateAdminLinkVisibility();

  subscribe(() => {
    updateAdminLinkVisibility();
  });

  window.addEventListener('user-changed', updateAdminLinkVisibility);
  window.addEventListener('auth-ready', updateAdminLinkVisibility);
}

document.addEventListener('DOMContentLoaded', initAdminNav);