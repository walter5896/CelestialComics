// /.netlify/functions/delete-story-page.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function extractStoragePathFromPublicUrl(publicUrl) {
  if (!publicUrl) return null;

  const marker = '/storage/v1/object/public/story-pages/';
  const idx = publicUrl.indexOf(marker);

  if (idx === -1) return null;

  return publicUrl.substring(idx + marker.length);
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Missing auth token' })
    };
  }

  try {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid user token' })
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) throw profileError;

    if (!profile || profile.role !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const { page_id } = JSON.parse(event.body || '{}');

    if (!page_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'page_id is required' })
      };
    }

    // First fetch the page so we know which storage file to delete
    const { data: pageRow, error: pageLookupError } = await supabase
      .from('story_pages')
      .select('id, image_url')
      .eq('id', page_id)
      .single();

    if (pageLookupError || !pageRow) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Story page not found' })
      };
    }

    // Delete storage object if we can derive the path
    const storagePath = extractStoragePathFromPublicUrl(pageRow.image_url);

    if (storagePath) {
      const { error: storageDeleteError } = await supabase.storage
        .from('story-pages')
        .remove([storagePath]);

      if (storageDeleteError) {
        throw storageDeleteError;
      }
    }

    // Then delete DB row
    const { error: deleteRowError } = await supabase
      .from('story_pages')
      .delete()
      .eq('id', page_id);

    if (deleteRowError) throw deleteRowError;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    console.error('delete-story-page error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Server error' })
    };
  }
}