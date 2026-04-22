// /js/auth-signup.js
import { supabase } from './supabase.js';

/**
 * Sign up a new user with email and password.
 * Returns a structured result object.
 */
export async function signup(email, password) {
  try {
    const trimmedEmail = String(email || '').trim();
    const safePassword = String(password || '');

    if (!trimmedEmail || !safePassword) {
      return {
        success: false,
        error: 'Email and password are required.'
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: safePassword
    });

    if (error) {
      console.error('Signup error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }

    const needsEmailConfirmation =
      !data?.session && !!data?.user;

    return {
      success: true,
      user: data?.user ?? null,
      session: data?.session ?? null,
      needsEmailConfirmation,
      message: needsEmailConfirmation
        ? 'Sign up successful! Please check your email to confirm your account.'
        : 'Sign up successful!'
    };
  } catch (err) {
    console.error('Unexpected signup error:', err);
    return {
      success: false,
      error: 'Unexpected signup error. Please try again.'
    };
  }
}