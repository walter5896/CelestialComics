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

// Fetch profile asynchronously but **do not block UI**
async function fetchCurrentProfile() {
  if (!currentUser) return { id: null, role: 'user', email: null };
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();
    if (error) throw error;
    currentProfile = data || { id: currentUser.id, role: 'user', email: currentUser.email };
    updateUI(); // refresh UI once profile is loaded
    return currentProfile;
  } catch (err) {
    console.error('Error fetching profile:', err.message);
    currentProfile = { id: null, role: 'user', email: null };
    return currentProfile;
  }
}

/**
 * Synchronous UI update — safe to call immediately
 */
function updateUI() {
  const loginLinks = document.querySelectorAll('.login-link');
  const logoutLinks = document.querySelectorAll('.logout-link');
  const profileLinks = document.querySelectorAll('.profile-link');
  const adminLinks = document.querySelectorAll('.admin-link');

  if (currentUser) {
    loginLinks.forEach(el => (el.style.display = 'none'));
    logoutLinks.forEach(el => (el.style.display = 'inline-block'));
    profileLinks.forEach(el => (el.style.display = 'inline-block'));
    adminLinks.forEach(el => (el.style.display = currentProfile?.role === 'admin' ? 'inline-block' : 'none'));
  } else {
    loginLinks.forEach(el => (el.style.display = 'inline-block'));
    logoutLinks.forEach(el => (el.style.display = 'none'));
    profileLinks.forEach(el => (el.style.display = 'none'));
    adminLinks.forEach(el => (el.style.display = 'none'));
  }
}

// INITIALIZE: synchronous UI first, then fetch profile
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;
    updateUI(); // synchronous UI
    if (currentUser) await fetchCurrentProfile(); // async profile fetch in background
  } catch (err) {
    console.error('Error getting initial auth session:', err);
  } finally {
    authReadyResolve();
  }
})();

supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  updateUI(); // synchronous UI first
  if (currentUser) await fetchCurrentProfile(); // fetch profile async
});

export async function login(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user ?? data.session?.user ?? null;
    updateUI(); // immediate UI update
    if (currentUser) await fetchCurrentProfile(); // async profile update
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

export { updateUI };