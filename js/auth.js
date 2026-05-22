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
let authLogoutHandlerAttached = false;
let logoutInProgress = false;
let lastSessionRefreshAt = 0;

const SESSION_REFRESH_THROTTLE_MS = 5000;
const SESSION_REFRESH_TIMEOUT_MS = 3500;
const LOGOUT_TIMEOUT_MS = 2500;

/* =======================
   EVENTS / TIMEOUTS
======================= */

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

/* =======================
   UI
======================= */

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

/* =======================
   PROFILE / AUTH STATE
======================= */

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
  if (logoutInProgress) {
    return null;
  }

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

/* =======================
   LOGOUT SAFETY
======================= */

function removeStoredSupabaseAuthTokens() {
  const storageBuckets = [window.localStorage, window.sessionStorage];

  storageBuckets.forEach((storage) => {
    if (!storage) return;

    try {
      Object.keys(storage).forEach((key) => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          storage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('[auth] Could not remove stored Supabase token:', error);
    }
  });
}

function forceLocalLogoutState() {
  clearAuthState();
  updateUI();
  dispatchAuthResumed();
}

function bindGlobalLogoutHandler() {
  if (authLogoutHandlerAttached) return;
  authLogoutHandlerAttached = true;

  document.addEventListener(
    'click',
    async (event) => {
      const logoutLink = event.target.closest?.('.logout-link');
      if (!logoutLink) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (logoutLink.dataset.loggingOut === 'true') return;

      const originalText = logoutLink.textContent || 'Logout';

      try {
        logoutLink.dataset.loggingOut = 'true';
        logoutLink.textContent = 'Logging out...';

        const result = await logout();

        if (!result?.success) {
          console.warn('[auth] Logout returned a non-success result:', result);
        }

        window.location.href = '/';
      } catch (error) {
        console.error('[auth] Global logout click failed:', error);

        logoutLink.dataset.loggingOut = 'false';
        logoutLink.textContent = originalText;

        alert('Logout failed. Please refresh and try again.');
      }
    },
    true
  );
}

/* =======================
   INIT / RESUME
======================= */

async function initializeAuth() {
  if (authInitialized) return;
  authInitialized = true;

  bindGlobalLogoutHandler();

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
    if (logoutInProgress) return;

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
    if (document.hidden || logoutInProgress) return;

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

/* =======================
   EXPORTED HELPERS
======================= */

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

/* =======================
   LOGIN / LOGOUT
======================= */

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
  if (logoutInProgress) {
    return {
      success: true
    };
  }

  logoutInProgress = true;

  try {
    const signOutResult = await withTimeout(
      supabase.auth.signOut(),
      LOGOUT_TIMEOUT_MS,
      { timedOut: true }
    );

    if (signOutResult?.error) {
      console.error('Logout error:', signOutResult.error.message);
    }

    if (signOutResult?.timedOut) {
      console.warn('[auth] Logout timed out. Clearing local session anyway.');
    }

    removeStoredSupabaseAuthTokens();
    forceLocalLogoutState();

    return {
      success: true,
      timedOut: !!signOutResult?.timedOut,
      error: signOutResult?.error?.message || null
    };
  } catch (error) {
    console.error('Unexpected logout error:', error);

    removeStoredSupabaseAuthTokens();
    forceLocalLogoutState();

    return {
      success: true,
      forced: true,
      error: error.message || null
    };
  } finally {
    window.setTimeout(() => {
      logoutInProgress = false;
    }, 500);
  }
}

export { updateUI };