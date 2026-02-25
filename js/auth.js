import { supabase } from './supabase.js';

let currentUser = null;
let currentProfile = { role: 'user' }; // default profile
let authReadyResolve;
const authReadyPromise = new Promise(resolve => authReadyResolve = resolve);

/**
 * Async getter for current user
 */
export async function getCurrentUserAsync() {
  await authReadyPromise;
  return currentUser;
}

/**
 * Async getter for current profile
 */
export async function getCurrentProfileAsync() {
  await authReadyPromise;
  return currentProfile;
}

/**
 * Synchronous getters
 */
export function getCurrentUser() { return currentUser; }
export function getCurrentProfile() { return currentProfile; }

/**
 * Update UI based on login state
 */
export function updateUI() {
  const loginLinks = document.querySelectorAll('.login-link');
  const logoutLinks = document.querySelectorAll('.logout-link');
  const profileLinks = document.querySelectorAll('.profile-link');
  const adminLinks = document.querySelectorAll('.admin-link');

  if (currentUser) {
    loginLinks.forEach(el => el.style.display = 'none');
    logoutLinks.forEach(el => el.style.display = 'inline-block');
    profileLinks.forEach(el => el.style.display = 'inline-block');
  } else {
    loginLinks.forEach(el => el.style.display = 'inline-block');
    logoutLinks.forEach(el => el.style.display = 'none');
    profileLinks.forEach(el => el.style.display = 'none');
  }

  if (currentProfile.role === 'admin') {
    adminLinks.forEach(el => el.style.display = 'inline-block');
  } else {
    adminLinks.forEach(el => el.style.display = 'none');
  }
}

/**
 * Fetch current profile from Supabase
 */
async function fetchCurrentProfile() {
  if (!currentUser) return;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();
    if (error) throw error;
    currentProfile = data || { id: currentUser.id, role: 'user', email: currentUser.email };
  } catch (err) {
    console.error('Error fetching profile:', err.message);
    currentProfile = { id: currentUser?.id ?? null, role: 'user', email: currentUser?.email ?? null };
  }
  updateUI();
}

/**
 * INITIALIZE: get session
 */
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;
    updateUI();
    if (currentUser) await fetchCurrentProfile();
  } catch (err) {
    console.error('Error getting session:', err);
  } finally {
    authReadyResolve();
  }
})();

/**
 * Auth state listener
 */
supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  updateUI();
  if (currentUser) await fetchCurrentProfile();
});

/**
 * Login / Logout
 */
export async function login(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user ?? data.session?.user ?? null;
    updateUI();
    if (currentUser) await fetchCurrentProfile();
    return true;
  } catch (err) {
    console.error('Login error:', err.message);
    alert(`Login failed: ${err.message}`);
    return false;
  }
}

export async function logout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    currentUser = null;
    currentProfile = { role: 'user' };
    updateUI();
    return true;
  } catch (err) {
    console.error('Logout error:', err.message);
    alert(`Logout failed: ${err.message}`);
    return false;
  }
}