// auth.js
import { supabase } from './supabase.js';

console.log('Supabase client:', supabase);

let currentUser = null;
let currentProfile = null;

let authReadyResolve;
const authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve;
});

/**
 * Async function to get current logged-in user
 */
export async function getCurrentUserAsync() {
  await authReadyPromise;
  return currentUser;
}

/**
 * Async function to get current profile (with role)
 */
export async function getCurrentProfileAsync() {
  await authReadyPromise;
  return currentProfile;
}

/**
 * Synchronous getters
 */
export function getCurrentUser() {
  return currentUser;
}

export function getCurrentProfile() {
  return currentProfile;
}

/**
 * Update UI based on currentUser and currentProfile
 */
export function updateUI() {
  const loginLinks = document.querySelectorAll('.login-link');
  const logoutLinks = document.querySelectorAll('.logout-link');
  const profileLinks = document.querySelectorAll('.profile-link');
  const adminLinks = document.querySelectorAll('.admin-link');

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

/**
 * Initialize currentUser and currentProfile on page load
 */
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;

    if (currentUser) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        currentProfile = { role: 'user', id: currentUser.id };
      } else {
        currentProfile = profile;
      }
    } else {
      currentProfile = { role: 'user' };
    }

    updateUI();
  } catch (err) {
    console.error('Error initializing auth:', err);
    currentProfile = { role: 'user' };
  } finally {
    authReadyResolve();
  }
})();

/**
 * Listen to auth state changes (login/logout)
 */
supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;

  if (currentUser) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    currentProfile = profile || { role: 'user', id: currentUser.id };
  } else {
    currentProfile = { role: 'user' };
  }

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

    // fetch profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    currentProfile = profile || { role: 'user', id: currentUser.id };

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
    currentProfile = { role: 'user' };
    updateUI();
    return true;
  } catch (err) {
    console.error('Unexpected logout error:', err);
    alert('Unexpected logout error. Please try again.');
    return false;
  }
}