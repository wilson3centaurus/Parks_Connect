import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRevenueDiscrepancy } from '../utils/revenue.js';

test('calculateRevenueDiscrepancy flags variances above 5 percent', () => {
  const result = calculateRevenueDiscrepancy(1000, 920);
  assert.equal(result.expected, 1000);
  assert.equal(result.collected, 920);
  assert.equal(result.difference, -80);
  assert.equal(Number(result.discrepancyRatio.toFixed(2)), 0.08);
  assert.equal(result.exceedsThreshold, true);
});

test('calculateRevenueDiscrepancy ignores invalid expected totals', () => {
  const result = calculateRevenueDiscrepancy(0, 500);
  assert.equal(result.discrepancyRatio, 0);
  assert.equal(result.exceedsThreshold, false);
});
