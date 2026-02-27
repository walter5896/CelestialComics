import { createClient } from '@supabase/supabase-js';

// Supabase client with service role key to bypass RLS
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { userId, role, requesterId } = JSON.parse(event.body);

    // Validate input
    if (!userId || !role) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing userId or role.' }) };
    }

    // Prevent self-demotion
    if (userId === requesterId) {
      return { statusCode: 403, body: JSON.stringify({ error: "You cannot change your own role." }) };
    }

    // Only allow specific roles
    const allowedRoles = ['user', 'admin'];
    if (!allowedRoles.includes(role)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid role." }) };
    }

    // Update the user's role
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, updatedUserId: userId, newRole: role }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}