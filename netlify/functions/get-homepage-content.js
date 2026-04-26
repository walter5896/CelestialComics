// /.netlify/functions/get-homepage-content.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { data, error } = await supabase
      .from('homepage_content')
      .select(`
        id,
        hero_image_url,
        hero_image_path,
        secondary_image_url,
        secondary_image_path,
        hero_heading,
        hero_description,
        hero_cta_text,
        hero_cta_link,
        created_at,
        updated_at
      `)
      .eq('id', 1)
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        content: data
      })
    };
  } catch (err) {
    console.error('get-homepage-content error:', err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || 'Server error'
      })
    };
  }
}