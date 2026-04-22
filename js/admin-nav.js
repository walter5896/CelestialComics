// /js/admin-nav.js
import { waitForAuthReady } from './auth.js';
import { getState, subscribe } from './state.js';

let adminNavInitialized = false;
let unsubscribeAdminNav = null;

function setAdminLinksVisible(isVisible) {
  const adminLinks = document.querySelectorAll('.admin-link');
  if (!adminLinks.length) return;

  adminLinks.forEach((link) => {
    link.style.display = isVisible ? 'inline-block' : 'none';
  });
}

/**
 * Uses shared auth/profile state to show or hide all admin nav links.
 */
function updateAdminLinkVisibility() {
  const { currentUser, profile, isAdmin } = getState();

  if (!currentUser || !profile) {
    setAdminLinksVisible(false);
    return;
  }

  setAdminLinksVisible(!!isAdmin);
}

async function initAdminNav() {
  if (adminNavInitialized) return;
  adminNavInitialized = true;

  await waitForAuthReady();
  updateAdminLinkVisibility();

  unsubscribeAdminNav = subscribe(() => {
    updateAdminLinkVisibility();
  });

  // Keep backward compatibility with older page flows that still emit this.
  window.addEventListener('user-changed', updateAdminLinkVisibility);
}

document.addEventListener('DOMContentLoaded', initAdminNav);