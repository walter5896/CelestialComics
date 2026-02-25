import { supabase } from './supabase.js';

console.log('Supabase client:', supabase);

let currentUser = null;
let currentProfile = { role: 'user' }; // default profile
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
 * Async function to get current user's profile
 */
export async function getCurrentProfileAsync() {
  await authReadyPromise;
  if (!currentUser) return currentProfile;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error) throw error;
    currentProfile = data;
    return currentProfile;
  } catch (err) {
    console.error('Error fetching profile:', err.message);
    return currentProfile;
  }
}

/**
 * Update UI based on currentUser and currentProfile
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
  } else {
    loginLinks.forEach(el => (el.style.display = 'inline-block'));
    logoutLinks.forEach(el => (el.style.display = 'none'));
    profileLinks.forEach(el => (el.style.display = 'none'));
  }

  // Show admin link only if user role is admin
  if (currentProfile.role === 'admin') {
    adminLinks.forEach(el => (el.style.display = 'inline-block'));
  } else {
    adminLinks.forEach(el => (el.style.display = 'none'));
  }
}

// Initialize currentUser and profile by getting the session once at load
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;
    if (currentUser) await getCurrentProfileAsync();
    updateUI();
  } catch (err) {
    console.error('Error getting initial auth session:', err);
  } finally {
    authReadyResolve();
  }
})();

// Listen to auth state changes (login/logout)
supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  if (currentUser) {
    await getCurrentProfileAsync();
  } else {
    currentProfile = { role: 'user' }; // reset to default
  }
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
    await getCurrentProfileAsync(); // fetch profile after login
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
    currentProfile = { role: 'user' }; // reset profile
    updateUI();
    return true;
  } catch (err) {
    console.error('Unexpected logout error:', err);
    alert('Unexpected logout error. Please try again.');
    return false;
  }
}

export { updateUI };