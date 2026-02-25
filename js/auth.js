// auth.js
import { supabase } from './supabase.js';

console.log('Supabase client:', supabase);

let currentUser = null;
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
 * Update UI based on currentUser
 */
function updateUI() {
  const loginLinks = document.querySelectorAll('.login-link');
  const logoutLinks = document.querySelectorAll('.logout-link');
  const profileLinks = document.querySelectorAll('.profile-link');

  if (currentUser) {
    loginLinks.forEach(el => (el.style.display = 'none'));
    logoutLinks.forEach(el => (el.style.display = 'inline-block'));
    profileLinks.forEach(el => (el.style.display = 'inline-block'));
  } else {
    loginLinks.forEach(el => (el.style.display = 'inline-block'));
    logoutLinks.forEach(el => (el.style.display = 'none'));
    profileLinks.forEach(el => (el.style.display = 'none'));
  }
}

// Initialize currentUser by getting the session once at load
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;
    updateUI();
  } catch (err) {
    console.error('Error getting initial auth session:', err);
  } finally {
    authReadyResolve();
  }
})();

// Listen to auth state changes (login/logout)
supabase.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user ?? null;
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
    updateUI();
    return true;
  } catch (err) {
    console.error('Unexpected logout error:', err);
    alert('Unexpected logout error. Please try again.');
    return false;
  }
}

export { updateUI };
