// auth.js
import { supabase } from './supabase.js';

console.log('Supabase client:', supabase);

let currentUser = null;
let currentProfile = null; // <-- track profile including role
let authReadyResolve;
const authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve;
});

/**
 * Async getter for current user
 */
export async function getCurrentUserAsync() {
  await authReadyPromise;
  return currentUser;
}

/**
 * Synchronous getter for current user
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Async getter for current profile (includes role)
 */
export async function getCurrentProfileAsync() {
  await authReadyPromise;
  return currentProfile;
}

/**
 * Fetch the user's profile safely from Supabase
 */
async function fetchCurrentProfile() {
  try {
    if (!currentUser) return null;

    const { data: profile, error, status } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    // If no profile exists yet, return default
    if (error && status !== 406) throw error;

    return profile || { id: currentUser.id, role: 'user', email: currentUser.email };
  } catch (err) {
    console.error('Error fetching profile:', err.message);
    return { id: null, role: 'user', email: null };
  }
}

/**
 * Update UI based on current user and role
 */
export async function updateUI() {
  const loginLinks = document.querySelectorAll('.login-link');
  const logoutLinks = document.querySelectorAll('.logout-link');
  const profileLinks = document.querySelectorAll('.profile-link');
  const adminLinks = document.querySelectorAll('.admin-link');

  if (!currentUser) {
    loginLinks.forEach(el => (el.style.display = 'inline-block'));
    logoutLinks.forEach(el => (el.style.display = 'none'));
    profileLinks.forEach(el => (el.style.display = 'none'));
    adminLinks.forEach(el => (el.style.display = 'none'));
    return;
  }

  loginLinks.forEach(el => (el.style.display = 'none'));
  logoutLinks.forEach(el => (el.style.display = 'inline-block'));
  profileLinks.forEach(el => (el.style.display = 'inline-block'));

  // Fetch profile to determine role
  currentProfile = await fetchCurrentProfile();
  adminLinks.forEach(el => (el.style.display = currentProfile.role === 'admin' ? 'inline-block' : 'none'));
}

// Initialize currentUser and profile on page load
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;
    currentProfile = await fetchCurrentProfile();
    await updateUI();
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
    currentUser = data.user;
    currentProfile = await fetchCurrentProfile();
    await updateUI();
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
    await updateUI();
    return true;
  } catch (err) {
    console.error('Unexpected logout error:', err);
    alert('Unexpected logout error. Please try again.');
    return false;
  }
}