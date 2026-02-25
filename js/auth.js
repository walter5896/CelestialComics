// auth.js
import { supabase } from './supabase.js';

console.log('Supabase client:', supabase);

// Current user and profile
let currentUser = null;
let currentProfile = null;

// Promise to ensure auth state is ready
let authReadyResolve;
const authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve;
});

/**
 * Async function to get current user,
 * waits until auth state is initialized
 */
export async function getCurrentUserAsync() {
  await authReadyPromise;
  return currentUser;
}

/**
 * Synchronous getter (may be null if called too early)
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Async function to get current profile
 */
export async function getCurrentProfileAsync() {
  await authReadyPromise;
  return currentProfile;
}

/**
 * Fetch current user's profile from Supabase
 */
async function fetchCurrentProfile() {
  if (!currentUser) {
    currentProfile = null;
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (error) {
    console.error('Failed to fetch profile:', error);
    currentProfile = null;
    return null;
  }

  currentProfile = data;
  return currentProfile;
}

/**
 * Update UI based on currentUser and currentProfile
 */
function updateUI() {
  const loginLinks = document.querySelectorAll('.login-link');
  const logoutLinks = document.querySelectorAll('.logout-link');
  const profileLinks = document.querySelectorAll('.profile-link');
  const adminLinks = document.querySelectorAll('.admin-link'); // Admin-only UI

  if (currentUser) {
    loginLinks.forEach(el => (el.style.display = 'none'));
    logoutLinks.forEach(el => (el.style.display = 'inline-block'));
    profileLinks.forEach(el => (el.style.display = 'inline-block'));

    if (currentProfile?.role === 'admin') {
      adminLinks.forEach(el => (el.style.display = 'inline-block'));
    } else {
      adminLinks.forEach(el => (el.style.display = 'none'));
    }

  } else {
    loginLinks.forEach(el => (el.style.display = 'inline-block'));
    logoutLinks.forEach(el => (el.style.display = 'none'));
    profileLinks.forEach(el => (el.style.display = 'none'));
    adminLinks.forEach(el => (el.style.display = 'none'));
  }
}

// Initialize currentUser and currentProfile on page load
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;
    await fetchCurrentProfile();
    updateUI();
  } catch (err) {
    console.error('Error getting initial auth session:', err);
  } finally {
    authReadyResolve();
  }
})();

// Listen to auth state changes (login/logout)
supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  await fetchCurrentProfile(); // Fetch profile whenever user logs in/out
  updateUI();
});

/**
 * Log in existing user
 */
export async function login(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('Login error:', error.message);
      alert(`Login failed: ${error.message}`);
      return false;
    }
    currentUser = data.user;
    await fetchCurrentProfile();
    updateUI();
    return true;
  } catch (err) {
    console.error('Unexpected login error:', err);
    alert('Unexpected login error. Please try again.');
    return false;
  }
}

/**
 * Log out current user
 */
export async function logout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error.message);
      alert(`Logout failed: ${error.message}`);
      return false;
    }
    currentUser = null;
    currentProfile = null;
    updateUI();
    return true;
  } catch (err) {
    console.error('Unexpected logout error:', err);
    alert('Unexpected logout error. Please try again.');
    return false;
  }
}

// Export updateUI in case other modules need it
export { updateUI };