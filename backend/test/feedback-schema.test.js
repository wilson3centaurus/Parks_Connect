import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFeedbackCategory, validateFeedbackPayload } from '../utils/feedbackSchema.js';

test('normalizeFeedbackCategory falls back to general', () => {
  assert.equal(normalizeFeedbackCategory('unknown'), 'general');
  assert.equal(normalizeFeedbackCategory('Facilities'), 'facilities');
});

test('validateFeedbackPayload requires park, visit date, rating, and comments', () => {
  const result = validateFeedbackPayload({});
  assert.equal(result.valid, false);
  assert.equal(result.errors.park_id, 'Select a valid park.');
  assert.equal(result.errors.visit_date, 'Visit date is required.');
  assert.equal(result.errors.rating, 'Rating must be between 1 and 5.');
  assert.equal(result.errors.comments, 'Comment is required.');
});

test('validateFeedbackPayload normalizes valid values', () => {
  const result = validateFeedbackPayload({
    park_id: '2',
    visit_date: '2026-06-03',
    rating: '4',
    category: 'Safety',
    comments: ' Rangers were very helpful. '
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.values, {
    parkId: 2,
    rating: 4,
    comments: 'Rangers were very helpful.',
    category: 'safety',
    channel: 'web',
    visitDate: '2026-06-03'
  });
});
