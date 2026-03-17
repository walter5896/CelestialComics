// /.netlify/functions/upload-product-image.js

const { createClient } = require('@supabase/supabase-js');

// =========================
// ENVIRONMENT VALIDATION
// =========================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// =========================
// CONSTANTS
// =========================
const PRODUCT_IMAGES_BUCKET = 'product-images';
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// =========================
// HELPERS
// =========================
function buildJsonResponse(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
}

function sanitizeFileName(fileName) {
  return String(fileName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, '-')
    .replace(/-+/g, '-');
}

function getFileExtension(fileName, fileType) {
  const safeName = String(fileName || '').toLowerCase();

  if (safeName.includes('.')) {
    const ext = safeName.split('.').pop().replace(/[^a-z0-9]/g, '');
    if (ext) return ext;
  }

  switch (fileType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'bin';
  }
}

function decodeBase64File(fileBase64) {
  try {
    return Buffer.from(fileBase64, 'base64');
  } catch {
    throw new Error('Invalid base64 file data.');
  }
}

async function getAdminUserFromToken(token) {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new Error('Invalid user token');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  if (!profile || profile.role !== 'admin') {
    throw new Error('Admin access required');
  }

  return user;
}

// =========================
// MAIN HANDLER
// =========================
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return buildJsonResponse(405, { error: 'Method not allowed' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return buildJsonResponse(401, { error: 'Missing auth token' });
  }

  let newlyUploadedPath = null;

  try {
    // =========================
    // AUTH / ADMIN CHECK
    // =========================
    await getAdminUserFromToken(token);

    // =========================
    // BODY PARSE
    // =========================
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return buildJsonResponse(400, { error: 'Invalid JSON body' });
    }

    const product_id = String(body.product_id || '').trim();
    const file_name = String(body.file_name || '').trim();
    const file_type = String(body.file_type || '').trim();
    const file_base64 = String(body.file_base64 || '').trim();

    if (!product_id) {
      return buildJsonResponse(400, { error: 'product_id is required.' });
    }

    if (!file_name) {
      return buildJsonResponse(400, { error: 'file_name is required.' });
    }

    if (!file_type) {
      return buildJsonResponse(400, { error: 'file_type is required.' });
    }

    if (!file_base64) {
      return buildJsonResponse(400, { error: 'file_base64 is required.' });
    }

    if (!ALLOWED_MIME_TYPES.has(file_type)) {
      return buildJsonResponse(400, {
        error: 'Unsupported file type. Allowed types: JPEG, PNG, WEBP, GIF.'
      });
    }

    // =========================
    // VERIFY PRODUCT EXISTS
    // =========================
    const { data: existingProduct, error: fetchError } = await supabase
      .from('products')
      .select('id, name, image_url, image_path')
      .eq('id', product_id)
      .single();

    if (fetchError || !existingProduct) {
      return buildJsonResponse(404, { error: 'Product not found.' });
    }

    // =========================
    // DECODE / VALIDATE FILE
    // =========================
    const fileBuffer = decodeBase64File(file_base64);

    if (!fileBuffer || !fileBuffer.length) {
      return buildJsonResponse(400, { error: 'Decoded file is empty.' });
    }

    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      return buildJsonResponse(400, {
        error: 'File is too large. Maximum size is 5 MB.'
      });
    }

    // =========================
    // BUILD STORAGE PATH
    // =========================
    const safeFileName = sanitizeFileName(file_name);
    const extension = getFileExtension(safeFileName, file_type);
    const timestamp = Date.now();
    const storagePath = `${product_id}/product-${timestamp}.${extension}`;
    newlyUploadedPath = storagePath;

    // =========================
    // UPLOAD TO STORAGE
    // =========================
    const { error: uploadError } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file_type,
        upsert: false,
        cacheControl: '3600'
      });

    if (uploadError) {
      throw uploadError;
    }

    // =========================
    // GET PUBLIC URL
    // =========================
    const { data: publicUrlData } = supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl;

    if (!publicUrl) {
      throw new Error('Failed to generate public image URL.');
    }

    // =========================
    // UPDATE PRODUCT ROW
    // =========================
    const { data: updatedProduct, error: updateError } = await supabase
      .from('products')
      .update({
        image_url: publicUrl,
        image_path: storagePath,
        updated_at: new Date().toISOString()
      })
      .eq('id', product_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // =========================
    // DELETE OLD IMAGE (BEST EFFORT)
    // =========================
    // Only remove after DB update succeeds, and only if the old path exists
    // and is different from the new one.
    if (
      existingProduct.image_path &&
      existingProduct.image_path !== storagePath
    ) {
      try {
        await supabase.storage
          .from(PRODUCT_IMAGES_BUCKET)
          .remove([existingProduct.image_path]);
      } catch (cleanupError) {
        console.error('upload-product-image cleanup warning:', cleanupError);
      }
    }

    return buildJsonResponse(200, {
      success: true,
      message: 'Product image uploaded successfully.',
      image_url: publicUrl,
      image_path: storagePath,
      product: updatedProduct
    });
  } catch (error) {
    console.error('upload-product-image error:', error);

    // =========================
    // BEST-EFFORT ROLLBACK
    // =========================
    // If upload succeeded but DB update failed, remove the newly uploaded file.
    if (newlyUploadedPath) {
      try {
        await supabase.storage
          .from(PRODUCT_IMAGES_BUCKET)
          .remove([newlyUploadedPath]);
      } catch (rollbackError) {
        console.error('upload-product-image rollback warning:', rollbackError);
      }
    }

    return buildJsonResponse(500, {
      error: error.message || 'Server error'
    });
  }
};