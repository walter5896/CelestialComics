// /js/auth-signup.js
import { supabase } from './supabase.js';

/**
 * Sign up a new user with email and password.
 * Returns a structured result object.
 */
export async function signup(email, password) {
  try {
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const safePassword = String(password || '');

    if (!trimmedEmail || !safePassword) {
      return {
        success: false,
        error: 'Email and password are required.'
      };
    }

    if (safePassword.length < 6) {
      return {
        success: false,
        error: 'Password must be at least 6 characters long.'
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: safePassword,
      options: {
        emailRedirectTo: `${window.location.origin}/login/`
      }
    });

    if (error) {
      console.error('Signup error:', error.message);

      return {
        success: false,
        error: error.message || 'Could not create account.'
      };
    }

    const needsEmailConfirmation = !data?.session && !!data?.user;

    return {
      success: true,
      user: data?.user ?? null,
      session: data?.session ?? null,
      needsEmailConfirmation,
      message: needsEmailConfirmation
        ? 'Account created. Check your email to confirm your account, then come back and log in.'
        : 'Account created successfully.'
    };
  } catch (err) {
    console.error('Unexpected signup error:', err);

    return {
      success: false,
      error: 'Unexpected signup error. Please try again.'
    };
  }
}