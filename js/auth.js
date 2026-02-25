// auth.js
import { supabase } from './supabase.js';

console.log('Supabase client:', supabase);

let currentUser = null;
let currentProfile = { role: 'user' }; // default
let authReadyResolve;
const authReadyPromise = new Promise(resolve => { authReadyResolve = resolve; });

/**
 * Wait until auth is ready and return current user
 */
export async function getCurrentUserAsync() {
  await authReadyPromise;
  return currentUser;
}

/**
 * Get current user synchronously (may be null if not ready)
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Wait until auth is ready and return current profile
 */
export async function getCurrentProfileAsync() {
  await authReadyPromise;
  return currentProfile;
}

/**
 * Update login/logout/profile UI links
 */
function updateUI() {
  const loginLinks = document.querySelectorAll('.login-link');
  const logoutLinks = document.querySelectorAll('.logout-link');
  const profileLinks = document.querySelectorAll('.profile-link');

  if (currentUser) {
    loginLinks.forEach(el => el.style.display = 'none');
    logoutLinks.forEach(el => el.style.display = 'inline-block');
    profileLinks.forEach(el => el.style.display = 'inline-block');
  } else {
    loginLinks.forEach(el => el.style.display = 'inline-block');
    logoutLinks.forEach(el => el.style.display = 'none');
    profileLinks.forEach(el => el.style.display = 'none');
  }

  updateAdminLinks();
}

/**
 * Update admin-specific links based on currentProfile.role
 */
export function updateAdminLinks() {
  const adminLinks = document.querySelectorAll('.admin-link');
  if (!currentUser) {
    adminLinks.forEach(el => (el.style.display = 'none'));
    return;
  }
  adminLinks.forEach(el => {
    el.style.display = currentProfile.role === 'admin' ? 'inline-block' : 'none';
  });
}

/**
 * Fetch the profile for the current user
 */
async function fetchCurrentProfile() {
  if (!currentUser) return;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // 406 = not found

    currentProfile = data || { id: currentUser.id, role: 'user', email: currentUser.email };
    updateAdminLinks();
  } catch (err) {
    console.error('Error fetching profile:', err.message);
    currentProfile = { id: currentUser.id, role: 'user', email: currentUser.email };
    updateAdminLinks();
  }
}

/**
 * INITIALIZE: get session, sync UI, fetch profile async
 */
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;
    updateUI();
    if (currentUser) await fetchCurrentProfile();
  } catch (err) {
    console.error('Error getting initial session:', err);
  } finally {
    authReadyResolve();
  }
})();

/**
 * Listen to auth state changes
 */
supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  updateUI();
  if (currentUser) await fetchCurrentProfile();
});

/**
 * Log in
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

/**
 * Log out
 */
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

export { updateUI };