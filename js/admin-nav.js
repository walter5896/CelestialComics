// /js/admin-nav.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';

/**
 * Checks if the current user is an admin and shows/hides all admin nav links.
 */
async function updateAdminLink() {
  const adminLinks = document.querySelectorAll('.admin-link');
  if (!adminLinks.length) return;

  try {
    const currentUser = await getCurrentUserAsync();

    if (!currentUser) {
      adminLinks.forEach(link => {
        link.style.display = 'none';
      });
      return;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUser.id)
      .single();

    if (error) throw error;

    const isAdmin = profile?.role === 'admin';

    adminLinks.forEach(link => {
      link.style.display = isAdmin ? 'inline-block' : 'none';
    });
  } catch (err) {
    console.error('Failed to fetch current user role:', err);
    adminLinks.forEach(link => {
      link.style.display = 'none';
    });
  }
}

// Run on initial page load
document.addEventListener('DOMContentLoaded', updateAdminLink);

// Re-run whenever auth changes
window.addEventListener('user-changed', updateAdminLink);
