import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFeedbackKpis } from '../utils/alertEngine.js';
import { normalizeAlertStatus } from '../utils/notifier.js';

test('calculateFeedbackKpis computes totals, average, and negative percentage', () => {
  const result = calculateFeedbackKpis([
    { rating: 5 },
    { rating: 2 },
    { rating: 1 },
    { rating: 4 }
  ]);

  assert.equal(result.totalFeedbackCount, 4);
  assert.equal(result.averageRating, 3);
  assert.equal(result.negativeFeedbackPercentage, 50);
});

test('alert API workflow status normalizer preserves required statuses', () => {
  assert.equal(normalizeAlertStatus('open'), 'open');
  assert.equal(normalizeAlertStatus('acknowledged'), 'acknowledged');
  assert.equal(normalizeAlertStatus('resolved'), 'resolved');
});
