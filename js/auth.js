// /js/auth.js
import { supabase } from './supabase.js';
import {
  getState,
  setCurrentUser,
  setProfile,
  clearAuthState
} from './state.js';

let authReadyResolve;
const authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve;
});

let authInitialized = false;

function dispatchUserChanged() {
  window.dispatchEvent(new Event('user-changed'));
}

function dispatchAuthReady() {
  window.dispatchEvent(new Event('auth-ready'));
}

function updateUI() {
  const { currentUser } = getState();

  const loginLinks = document.querySelectorAll('.login-link');
  const logoutLinks = document.querySelectorAll('.logout-link');
  const profileLinks = document.querySelectorAll('.profile-link');

  if (currentUser) {
    loginLinks.forEach((el) => {
      el.style.display = 'none';
    });

    logoutLinks.forEach((el) => {
      el.style.display = 'inline-block';
    });

    profileLinks.forEach((el) => {
      el.style.display = 'inline-block';
    });
  } else {
    loginLinks.forEach((el) => {
      el.style.display = 'inline-block';
    });

    logoutLinks.forEach((el) => {
      el.style.display = 'none';
    });

    profileLinks.forEach((el) => {
      el.style.display = 'none';
    });
  }

  dispatchUserChanged();
}

async function fetchProfile(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      username,
      role,
      vote_balance,
      bonus_vote_balance
    `)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function applyAuthState(user) {
  if (!user) {
    clearAuthState();
    updateUI();
    return null;
  }

  setCurrentUser(user);

  try {
    const profile = await fetchProfile(user.id);
    setProfile(profile);
  } catch (error) {
    console.error('Error loading profile during auth sync:', error);
    setProfile(null);
  }

  updateUI();
  return user;
}

async function initializeAuth() {
  if (authInitialized) return;
  authInitialized = true;

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    const user = data?.session?.user ?? null;
    await applyAuthState(user);
  } catch (error) {
    console.error('Error getting initial auth session:', error);
    clearAuthState();
    updateUI();
  } finally {
    authReadyResolve();
    dispatchAuthReady();
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    const user = session?.user ?? null;

    try {
      await applyAuthState(user);
    } catch (error) {
      console.error('Error handling auth state change:', error);
      if (!user) {
        clearAuthState();
        updateUI();
      }
    }
  });
}

initializeAuth();

export async function waitForAuthReady() {
  await authReadyPromise;
}

export async function getCurrentUserAsync() {
  await authReadyPromise;
  return getState().currentUser;
}

export function getCurrentUser() {
  return getState().currentUser;
}

export function getCurrentProfile() {
  return getState().profile;
}

export function isAuthenticated() {
  return !!getState().currentUser;
}

export async function refreshProfile() {
  await authReadyPromise;

  const user = getState().currentUser;
  if (!user) {
    clearAuthState();
    updateUI();
    return null;
  }

  try {
    const profile = await fetchProfile(user.id);
    setProfile(profile);
    updateUI();
    return profile;
  } catch (error) {
    console.error('Error refreshing profile:', error);
    throw error;
  }
}

export async function login(email, password) {
  try {
    const trimmedEmail = String(email || '').trim();
    const safePassword = String(password || '');

    if (!trimmedEmail || !safePassword) {
      return {
        success: false,
        error: 'Email and password are required.'
      };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: safePassword
    });

    if (error) {
      console.error('Login error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }

    await applyAuthState(data?.user ?? null);

    return {
      success: true,
      user: data?.user ?? null
    };
  } catch (error) {
    console.error('Unexpected login error:', error);
    return {
      success: false,
      error: 'Unexpected login error. Please try again.'
    };
  }
}

export async function logout() {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }

    clearAuthState();
    updateUI();

    return {
      success: true
    };
  } catch (error) {
    console.error('Unexpected logout error:', error);
    return {
      success: false,
      error: 'Unexpected logout error. Please try again.'
    };
  }
}

export { updateUI };