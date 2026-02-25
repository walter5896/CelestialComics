// auth.js
import { supabase } from './supabase.js';

console.log('Supabase client:', supabase);

let currentUser = null;
let currentProfile = null; // store profile including role
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
 * Async function to get current profile
 */
export async function getCurrentProfileAsync() {
  await authReadyPromise;
  return currentProfile;
}

/**
 * Synchronous getter (may be null if called too early)
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Fetch profile from Supabase safely
 */
async function fetchCurrentProfile() {
  if (!currentUser) return { id: null, role: 'user', email: null };
  try {
    const { data, error, status } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error && status !== 406) throw error;
    return data || { id: currentUser.id, role: 'user', email: currentUser.email };
  } catch (err) {
    console.error('Error fetching profile:', err.message);
    return { id: null, role: 'user', email: null };
  }
}

/**
 * Update UI based on currentUser and role
 */
function updateUI() {
  const loginLinks = document.querySelectorAll('.login-link');
  const logoutLinks = document.querySelectorAll('.logout-link');
  const profileLinks = document.querySelectorAll('.profile-link');
  const adminLinks = document.querySelectorAll('.admin-link');

  const role = currentProfile?.role || 'user';

  if (currentUser) {
    loginLinks.forEach(el => (el.style.display = 'none'));
    logoutLinks.forEach(el => (el.style.display = 'inline-block'));
    profileLinks.forEach(el => (el.style.display = 'inline-block'));
    adminLinks.forEach(el => (el.style.display = role === 'admin' ? 'inline-block' : 'none'));
  } else {
    loginLinks.forEach(el => (el.style.display = 'inline-block'));
    logoutLinks.forEach(el => (el.style.display = 'none'));
    profileLinks.forEach(el => (el.style.display = 'none'));
    adminLinks.forEach(el => (el.style.display = 'none'));
  }
}

// Initialize currentUser and profile on page load
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;
    currentProfile = await fetchCurrentProfile();
    updateUI();
  } catch (err) {
    console.error('Error getting initial auth session:', err);
  } finally {
    authReadyResolve();
  }
})();

// Listen to auth state changes
supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  currentProfile = await fetchCurrentProfile();
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
    currentUser = data.user ?? data.session?.user ?? null;
    currentProfile = await fetchCurrentProfile();
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

export { updateUI };