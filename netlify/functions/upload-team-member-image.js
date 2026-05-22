// /netlify/functions/upload-team-member-image.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const TEAM_IMAGES_BUCKET = 'team-images';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  };
}

function getBearerToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

function parseRequestBody(body) {
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('Invalid JSON body');
  }
}

function sanitizeFileName(fileName) {
  return String(fileName || 'team-image')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, '-')
    .replace(/-+/g, '-');
}

function getFileExtension(fileName = '', fileType = '') {
  const safeName = String(fileName || '').toLowerCase();

  if (safeName.includes('.')) {
    const ext = safeName.split('.').pop()?.replace(/[^a-z0-9]/g, '');
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
    const buffer = Buffer.from(String(fileBase64 || ''), 'base64');

    if (!buffer.length) {
      throw new Error('Decoded file is empty.');
    }

    return buffer;
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

async function getTeamMember(teamMemberId) {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, name, image_path')
    .eq('id', teamMemberId)
    .single();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Team member not found.');
  }

  return data;
}

async function removeOldImageIfNeeded(imagePath) {
  if (!imagePath) return;

  const { error } = await supabase.storage
    .from(TEAM_IMAGES_BUCKET)
    .remove([imagePath]);

  if (error) {
    console.warn('Could not remove previous team image:', error);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: 'Method not allowed'
    });
  }

  const token = getBearerToken(event);

  if (!token) {
    return jsonResponse(401, {
      success: false,
      error: 'Missing auth token'
    });
  }

  try {
    await getAdminUserFromToken(token);

    const body = parseRequestBody(event.body);

    const teamMemberId = String(body.team_member_id || body.teamMemberId || '').trim();
    const fileBase64 = body.fileBase64 || body.file_base64;
    const fileName = sanitizeFileName(body.fileName || body.file_name || 'team-image');
    const fileType = String(body.fileType || body.file_type || '').trim();

    if (!teamMemberId) {
      throw new Error('team_member_id is required.');
    }

    if (!fileBase64) {
      throw new Error('fileBase64 is required.');
    }

    if (!ALLOWED_MIME_TYPES.has(fileType)) {
      throw new Error('Only JPG, PNG, WEBP, and GIF images are allowed.');
    }

    const teamMember = await getTeamMember(teamMemberId);
    const fileBuffer = decodeBase64File(fileBase64);

    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      throw new Error('Image must be 5MB or smaller.');
    }

    const extension = getFileExtension(fileName, fileType);
    const baseName = fileName.replace(/\.[a-z0-9]+$/i, '') || 'team-image';
    const storagePath = `team-members/${teamMemberId}/${Date.now()}-${baseName}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(TEAM_IMAGES_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: fileType,
        upsert: false
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from(TEAM_IMAGES_BUCKET)
      .getPublicUrl(storagePath);

    const imageUrl = publicUrlData?.publicUrl || null;

    if (!imageUrl) {
      throw new Error('Could not generate public image URL.');
    }

    const { data: updatedMember, error: updateError } = await supabase
      .from('team_members')
      .update({
        image_url: imageUrl,
        image_path: storagePath
      })
      .eq('id', teamMemberId)
      .select('*')
      .single();

    if (updateError) {
      throw updateError;
    }

    await removeOldImageIfNeeded(teamMember.image_path);

    return jsonResponse(200, {
      success: true,
      image_url: imageUrl,
      image_path: storagePath,
      team_member: updatedMember
    });
  } catch (error) {
    console.error('upload-team-member-image error:', error);

    return jsonResponse(500, {
      success: false,
      error: error.message || 'Failed to upload team member image'
    });
  }
};