// auth-signup.js
import { supabase } from './supabase.js';
import { updateUI } from './auth.js'; // Keep UI in sync after signup

/**
 * Sign up a new user with email and password.
 * Returns true if successful, false otherwise.
 */
export async function signup(email, password) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      console.error('Signup error:', error.message);
      alert(`Sign up failed: ${error.message}`);
      return false;
    }

    alert('Sign up successful! Please check your email to confirm your account.');

    // If user is auto-logged in, update the UI
    if (data.user) {
      updateUI();
    }

    return true;
  } catch (err) {
    console.error('Unexpected signup error:', err);
    alert('Unexpected signup error. Please try again.');
    return false;
  }
}
