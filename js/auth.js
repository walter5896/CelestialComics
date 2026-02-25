// /js/auth.js
import { supabase } from './supabase.js';

console.log('Supabase client:', supabase);

let currentUser = null;
let currentProfile = { role: 'user' }; // default profile
let authReadyResolve;
const authReadyPromise = new Promise((resolve) => { authReadyResolve = resolve; });

/* =======================
   USER FUNCTIONS
======================= */

/**
 * Async getter for current user (waits for auth init)
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

/* =======================
   PROFILE FUNCTIONS
======================= */

/**
 * Async getter for current user's profile
 */
export async function getCurrentProfileAsync() {
  await authReadyPromise;

  if (!currentUser) return { role: 'user', id: null, email: null };

  try {
    const { data, error, status } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error && status !== 406) throw error;

    currentProfile = data || { role: 'user', id: currentUser.id, email: currentUser.email };
    return currentProfile;
  } catch (err) {
    console.error('Error fetching profile:', err.message);
    return { role: 'user', id: currentUser.id, email: currentUser.email };
  }
}

/* =======================
   UI UPDATE
======================= */

export function updateUI() {
  const loginLinks = document.querySelectorAll('.login-link');
  const logoutLinks = document.querySelectorAll('.logout-link');
  const profileLinks = document.querySelectorAll('.profile-link');
  const adminLinks = document.querySelectorAll('.admin-link');

  if (currentUser) {
    loginLinks.forEach(el => (el.style.display = 'none'));
    logoutLinks.forEach(el => (el.style.display = 'inline-block'));
    profileLinks.forEach(el => (el.style.display = 'inline-block'));
  } else {
    loginLinks.forEach(el => (el.style.display = 'inline-block'));
    logoutLinks.forEach(el => (el.style.display = 'none'));
    profileLinks.forEach(el => (el.style.display = 'none'));
  }

  // admin links visible only if role is 'admin'
  if (currentProfile.role === 'admin') {
    adminLinks.forEach(el => (el.style.display = 'inline-block'));
  } else {
    adminLinks.forEach(el => (el.style.display = 'none'));
  }
}

/* =======================
   AUTH INITIALIZATION
======================= */

(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;

    updateUI();

    if (currentUser) {
      await getCurrentProfileAsync(); // fetch profile after session
      updateUI();
    }
  } catch (err) {
    console.error('Error getting initial auth session:', err);
  } finally {
    authReadyResolve();
  }
})();

// Listen for auth state changes
supabase.auth.onAuthStateChange(async (_event, session) => {
  currentUser = session?.user ?? null;

  if (currentUser) {
    await getCurrentProfileAsync();
  } else {
    currentProfile = { role: 'user' };
  }

  updateUI();
});

/* =======================
   LOGIN / LOGOUT
======================= */

export async function login(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('Login error:', error.message);
      alert(`Login failed: ${error.message}`);
      return false;
    }
    currentUser = data.user;
    await getCurrentProfileAsync();
    updateUI();
    return true;
  } catch (err) {
    console.error('Unexpected login error:', err);
    alert('Unexpected login error. Please try again.');
    return false;
  }
}

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