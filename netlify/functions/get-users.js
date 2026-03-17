// /.netlify/functions/get-users.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Missing auth token" }),
    };
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Invalid user token" }),
      };
    }

    const { data: requesterProfile, error: requesterError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (requesterError) throw requesterError;

    if (!requesterProfile || requesterProfile.role !== "admin") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Admin access required" }),
      };
    }

    const { data, error } = await supabase
      .from("profiles")
      .select(`
        id,
        email,
        role,
        vote_balance,
        bonus_vote_balance,
        created_at,
        updated_at
      `)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify(data || []),
    };
  } catch (err) {
    console.error("Error fetching users:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Server error" }),
    };
  }
}