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
 * Async getter for current user
 */
export async function getCurrentUserAsync() {
  await authReadyPromise;
  return currentUser;
}

/**
 * Async getter for current profile (includes role)
 */
export async function getCurrentProfileAsync() {
  await authReadyPromise;
  if (!currentProfile && currentUser) {
    currentProfile = await fetchCurrentProfile();
  }
  return currentProfile;
}

/**
 * Fetch the user's profile safely from Supabase
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

    // Return profile, default to role 'user' if missing
    return data || { id: currentUser.id, role: 'user', email: currentUser.email };
  } catch (err) {
    console.error('Error fetching profile:', err.message);
    return { id: null, role: 'user', email: null };
  }
}

/**
 * Update UI elements based on current user and role
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

  // Ensure profile is loaded
  if (!currentProfile) {
    currentProfile = await fetchCurrentProfile();
  }

  loginLinks.forEach(el => (el.style.display = 'none'));
  logoutLinks.forEach(el => (el.style.display = 'inline-block'));
  profileLinks.forEach(el => (el.style.display = 'inline-block'));

  const role = currentProfile.role ?? 'user';
  adminLinks.forEach(el => (el.style.display = role === 'admin' ? 'inline-block' : 'none'));
}

/**
 * Initialize auth session
 */
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

/**
 * Listen to auth state changes
 */
supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  currentProfile = await fetchCurrentProfile();
  await updateUI();
});

/**
 * Log in existing user
 */
export async function login(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // v2: user comes from session
    currentUser = data.session?.user ?? null;
    currentProfile = await fetchCurrentProfile();
    await updateUI();
    return true;
  } catch (err) {
    console.error('Login error:', err.message);
    alert(`Login failed: ${err.message}`);
    return false;
  }
}

/**
 * Log out current user
 */
export async function logout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    currentUser = null;
    currentProfile = null;
    await updateUI();
    return true;
  } catch (err) {
    console.error('Logout error:', err.message);
    alert(`Logout failed: ${err.message}`);
    return false;
  }
}