// auth.js
import { supabase } from './supabase.js';

console.log('Supabase client:', supabase);

// Track the current logged-in user
let currentUser = null;

// Listen for auth state changes (login/logout)
supabase.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user || null;
  updateUI();
});

/**
 * Returns the current logged-in user, or null if no user
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Log in an existing user
 * @param {string} email
 * @param {string} password
 */
export async function login(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

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
 * Log out the current user
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

/**
 * Update login/logout/profile links based on current user state
 */
function updateUI() {
  const loginLinks = document.querySelectorAll('.login-link');
  const logoutLinks = document.querySelectorAll('.logout-link');
  const profileLinks = document.querySelectorAll('.profile-link'); // ← new

  if (currentUser) {
    loginLinks.forEach(el => el.style.display = 'none');
    logoutLinks.forEach(el => el.style.display = 'inline-block');
    profileLinks.forEach(el => el.style.display = 'inline-block'); // ← new
  } else {
    loginLinks.forEach(el => el.style.display = 'inline-block');
    logoutLinks.forEach(el => el.style.display = 'none');
    profileLinks.forEach(el => el.style.display = 'none'); // ← new
  }
}

export { updateUI };
