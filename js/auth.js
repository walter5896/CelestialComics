// auth.js
import { supabase } from './supabase.js';

console.log('Supabase client:', supabase);

let currentUser = null;
let currentProfile = { role: 'user' }; // default to user
let authReadyResolve;
const authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve;
});

export async function getCurrentUserAsync() {
  await authReadyPromise;
  return currentUser;
}

export function getCurrentUser() {
  return currentUser;
}

// Synchronous UI update (same as your working version)
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

// Only update admin links asynchronously after profile is fetched
function updateAdminLinks() {
  const adminLinks = document.querySelectorAll('.admin-link');
  if (!currentUser) {
    adminLinks.forEach(el => (el.style.display = 'none'));
    return;
  }
  adminLinks.forEach(el => (el.style.display = currentProfile.role === 'admin' ? 'inline-block' : 'none'));
}

// Fetch profile in the background
async function fetchCurrentProfile() {
  if (!currentUser) return;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();
    if (error) throw error;
    currentProfile = data || { role: 'user', id: currentUser.id, email: currentUser.email };
    updateAdminLinks(); // update admin links once we have the role
  } catch (err) {
    console.error('Error fetching profile:', err.message);
  }
}

// INITIALIZE: synchronous UI first, then async profile fetch
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;
    updateUI();       // sync UI
    if (currentUser) await fetchCurrentProfile(); // fetch profile in background
  } catch (err) {
    console.error('Error getting initial auth session:', err);
  } finally {
    authReadyResolve();
  }
})();

supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  updateUI();       // sync UI
  if (currentUser) await fetchCurrentProfile(); // async profile update
});

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
    updateAdminLinks();
    return true;
  } catch (err) {
    console.error('Logout error:', err.message);
    alert(`Logout failed: ${err.message}`);
    return false;
  }
}

export { updateUI };