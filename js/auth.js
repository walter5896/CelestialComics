// auth.js
import { supabase } from './supabase.js';

console.log('Supabase client:', supabase);

// ----- STATE -----
let currentUser = null;
let currentProfile = { role: 'user' }; // default role
let authReadyResolve;
const authReadyPromise = new Promise(resolve => (authReadyResolve = resolve));

// ----- GETTERS -----
export async function getCurrentUserAsync() {
  await authReadyPromise;
  return currentUser;
}

export function getCurrentUser() {
  return currentUser;
}

export async function getCurrentProfileAsync() {
  await authReadyPromise;
  return currentProfile;
}

// ----- UI UPDATE -----
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

  updateAdminLinks();
}

function updateAdminLinks() {
  const adminLinks = document.querySelectorAll('.admin-link');
  if (!currentUser) {
    adminLinks.forEach(el => (el.style.display = 'none'));
    return;
  }
  adminLinks.forEach(el => (el.style.display = currentProfile.role === 'admin' ? 'inline-block' : 'none'));
}

// ----- PROFILE FETCH -----
async function fetchCurrentProfile() {
  if (!currentUser) return;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // ignore "no rows" code

    currentProfile = data || { role: 'user', id: currentUser.id, email: currentUser.email };
    updateAdminLinks();
  } catch (err) {
    console.error('Error fetching profile:', err.message);
    currentProfile = { role: 'user', id: currentUser.id, email: currentUser.email };
  }
}

// ----- INITIALIZE -----
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;
    updateUI();
    if (currentUser) await fetchCurrentProfile();
  } catch (err) {
    console.error('Error getting initial auth session:', err);
  } finally {
    authReadyResolve();
  }
})();

// Listen to auth changes
supabase.auth.onAuthStateChange(async (_event, session) => {
  currentUser = session?.user ?? null;
  updateUI();
  if (currentUser) await fetchCurrentProfile();
});

// ----- LOGIN / LOGOUT -----
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

// ----- EXPORT -----
export { updateUI };