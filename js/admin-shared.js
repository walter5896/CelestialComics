// /js/admin-shared.js
import { supabase } from './supabase.js';

export async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Error getting session:', error);
    return null;
  }

  return data?.session?.access_token || null;
}

export async function parseJsonResponseSafely(res) {
  const rawText = await res.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(rawText || 'Server returned an invalid response.');
  }
}

export function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
}

export function formatForDateTimeLocal(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function updatePreviewImage(imgEl, url) {
  if (!imgEl) return;

  const safeUrl = String(url || '').trim();

  if (!safeUrl) {
    imgEl.src = '';
    imgEl.style.display = 'none';
    return;
  }

  imgEl.src = safeUrl;
  imgEl.style.display = 'block';

  imgEl.onerror = () => {
    imgEl.src = '';
    imgEl.style.display = 'none';
  };
}

export function formatCurrencyFromCents(value) {
  const cents = Number(value);

  if (!Number.isFinite(cents)) return '—';

  return `$${(cents / 100).toFixed(2)}`;
}

export function getStatusBadgeClass(status) {
  const safeStatus = String(status || '').toLowerCase();
  return `status-badge ${safeStatus}`;
}

export function prettyOrderStatus(status) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'paid':
      return 'Paid';
    case 'processing':
      return 'Processing';
    case 'fulfilled':
      return 'Fulfilled';
    case 'canceled':
      return 'Canceled';
    case 'failed':
      return 'Failed';
    default:
      return status || 'Unknown';
  }
}

export function isHistoryOrderStatus(status) {
  return ['fulfilled', 'canceled', 'failed'].includes(
    String(status || '').toLowerCase()
  );
}

export function isActiveOrderStatus(status) {
  return ['pending', 'paid', 'processing'].includes(
    String(status || '').toLowerCase()
  );
}

export function isEffectivelyClosed(period) {
  if (!period) return false;
  if (period.finalized_at) return true;
  if (period.closed_at) return true;

  const now = new Date();
  const end = new Date(period.end_time);

  return now > end;
}

export function deriveRoundStatus(period) {
  if (!period) return 'none';
  if (period.finalized_at) return 'finalized';
  if (period.closed_at) return 'closed';

  const now = new Date();
  const start = new Date(period.start_time);
  const end = new Date(period.end_time);

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'open';
  return 'closed';
}

export function prettyStoryStatus(status) {
  switch (status) {
    case 'concept_bank':
      return 'Concept Bank';
    case 'active_vote':
      return 'Active Vote';
    case 'winner_in_production':
      return 'Winner in Production';
    case 'released':
      return 'Released';
    default:
      return status || 'Unknown';
  }
}

export function prettyProductType(type) {
  switch (type) {
    case 'digital_comic':
      return 'Digital Comic';
    case 'paperback':
      return 'Paperback';
    case 'bundle':
      return 'Bundle';
    case 'merch':
      return 'Merch';
    default:
      return type || 'Unknown';
  }
}

export function isComicProductType(type) {
  return ['digital_comic', 'paperback', 'bundle'].includes(type);
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const result = String(reader.result || '');
        resolve(result.split(',')[1]);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}