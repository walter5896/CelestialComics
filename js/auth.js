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
let authSyncInProgress = null;
let lastSessionRefreshAt = 0;

const SESSION_REFRESH_THROTTLE_MS = 5000;
const SESSION_REFRESH_TIMEOUT_MS = 3500;

function dispatchUserChanged() {
  window.dispatchEvent(new Event('user-changed'));
}

function dispatchAuthReady() {
  window.dispatchEvent(new Event('auth-ready'));
}

function dispatchAuthResumed() {
  window.dispatchEvent(new Event('auth-resumed'));
}

function withTimeout(promise, timeoutMs, fallbackValue = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      window.setTimeout(() => resolve(fallbackValue), timeoutMs);
    })
  ]);
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

async function syncAuthFromSupabase({ force = false } = {}) {
  const now = Date.now();

  if (!force && now - lastSessionRefreshAt < SESSION_REFRESH_THROTTLE_MS) {
    return getState().currentUser;
  }

  if (authSyncInProgress) {
    return authSyncInProgress;
  }

  lastSessionRefreshAt = now;

  authSyncInProgress = (async () => {
    try {
      const sessionResult = await withTimeout(
        supabase.auth.getSession(),
        SESSION_REFRESH_TIMEOUT_MS,
        null
      );

      if (!sessionResult) {
        console.warn('[auth] Session refresh timed out. Keeping cached user.');
        return getState().currentUser;
      }

      const { data, error } = sessionResult;

      if (error) {
        throw error;
      }

      const user = data?.session?.user ?? null;
      await applyAuthState(user);

      return user;
    } catch (error) {
      console.error('Error syncing auth session:', error);
      return getState().currentUser;
    } finally {
      authSyncInProgress = null;
    }
  })();

  return authSyncInProgress;
}

async function initializeAuth() {
  if (authInitialized) return;
  authInitialized = true;

  try {
    const sessionResult = await withTimeout(
      supabase.auth.getSession(),
      SESSION_REFRESH_TIMEOUT_MS,
      null
    );

    if (!sessionResult) {
      console.warn('[auth] Initial session check timed out.');
      clearAuthState();
      updateUI();
    } else {
      const { data, error } = sessionResult;

      if (error) {
        throw error;
      }

      const user = data?.session?.user ?? null;
      await applyAuthState(user);
    }
  } catch (error) {
    console.error('Error getting initial auth session:', error);
    clearAuthState();
    updateUI();
  } finally {
    authReadyResolve();
    dispatchAuthReady();
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user ?? null;

    try {
      await applyAuthState(user);

      if (
        event === 'TOKEN_REFRESHED' ||
        event === 'SIGNED_IN' ||
        event === 'USER_UPDATED'
      ) {
        dispatchAuthResumed();
      }
    } catch (error) {
      console.error('Error handling auth state change:', error);

      if (!user) {
        clearAuthState();
        updateUI();
      }
    }
  });

  bindAuthResumeListeners();
}

function bindAuthResumeListeners() {
  async function refreshWhenActive() {
    if (document.hidden) return;

    await syncAuthFromSupabase({ force: true });
    dispatchAuthResumed();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshWhenActive();
    }
  });

  window.addEventListener('focus', () => {
    refreshWhenActive();
  });

  window.addEventListener('pageshow', () => {
    refreshWhenActive();
  });
}

initializeAuth();

export async function waitForAuthReady() {
  await authReadyPromise;
}

export async function getCurrentUserAsync({ refresh = false } = {}) {
  await authReadyPromise;

  if (refresh) {
    const refreshedUser = await syncAuthFromSupabase();
    return refreshedUser || getState().currentUser || null;
  }

  return getState().currentUser;
}

export async function getFreshSession() {
  await authReadyPromise;

  const sessionResult = await withTimeout(
    supabase.auth.getSession(),
    SESSION_REFRESH_TIMEOUT_MS,
    null
  );

  if (!sessionResult) {
    console.warn('[auth] Fresh session request timed out.');
    return null;
  }

  const { data, error } = sessionResult;

  if (error) {
    console.error('Error getting fresh session:', error);
    return null;
  }

  const user = data?.session?.user ?? null;
  await applyAuthState(user);

  return data?.session ?? null;
}

export async function getFreshAccessToken() {
  const session = await getFreshSession();
  return session?.access_token || null;
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

export async function refreshAuthState() {
  await authReadyPromise;
  return syncAuthFromSupabase({ force: true });
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
    dispatchAuthResumed();

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
    dispatchAuthResumed();

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