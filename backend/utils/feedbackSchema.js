const ALLOWED_CHANNELS = new Set(['web', 'mobile', 'email']);
const ALLOWED_CATEGORIES = new Set(['wildlife', 'facilities', 'safety', 'staff', 'general']);

export function normalizeFeedbackCategory(value) {
  const normalized = String(value || 'general').trim().toLowerCase();
  return ALLOWED_CATEGORIES.has(normalized) ? normalized : 'general';
}

export function normalizeFeedbackChannel(value, fallback = 'web') {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ALLOWED_CHANNELS.has(normalized) ? normalized : fallback;
}

export function normalizeVisitDate(value, fallbackDate = null) {
  const raw = String(value || '').trim();
  if (!raw) return fallbackDate;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function validateFeedbackPayload(payload, { requirePark = true } = {}) {
  const errors = {};
  const parkId = payload.park_id === undefined || payload.park_id === null || payload.park_id === ''
    ? null
    : Number(payload.park_id);
  const rating = payload.rating === undefined || payload.rating === null || payload.rating === ''
    ? null
    : Number(payload.rating);
  const comments = String(payload.comments || payload.comment || '').trim();
  const category = normalizeFeedbackCategory(payload.category);
  const channel = normalizeFeedbackChannel(payload.channel, payload.device_id ? 'mobile' : 'web');
  const visitDate = normalizeVisitDate(payload.visit_date, null);

  if (requirePark && (!Number.isInteger(parkId) || parkId < 1)) {
    errors.park_id = 'Select a valid park.';
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    errors.rating = 'Rating must be between 1 and 5.';
  }
  if (!comments) {
    errors.comments = 'Comment is required.';
  }
  if (!visitDate) {
    errors.visit_date = 'Visit date is required.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    values: {
      parkId,
      rating,
      comments,
      category,
      channel,
      visitDate
    }
  };
}

export const feedbackConstants = {
  ALLOWED_CHANNELS: [...ALLOWED_CHANNELS],
  ALLOWED_CATEGORIES: [...ALLOWED_CATEGORIES]
};
