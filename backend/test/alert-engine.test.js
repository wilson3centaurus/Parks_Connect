import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containsDroughtKeywords,
  containsSecurityKeywords,
  detectFeedbackAlerts
} from '../utils/alertEngine.js';

test('detects drought and security keywords', () => {
  assert.equal(containsDroughtKeywords('No water near the campsite, very dry conditions.'), true);
  assert.equal(containsSecurityKeywords('We felt in danger after a robbery warning.'), true);
});

test('detectFeedbackAlerts returns the four required alert categories', () => {
  const parks = [{ id: 1, name: 'Hwange', daily_capacity_limit: 3 }];
  const rows = [
    { park_id: 1, category: 'facilities', rating: 1, comments: 'dry water shortage at lodge' },
    { park_id: 1, category: 'facilities', rating: 2, comments: 'dry taps and dust everywhere' },
    { park_id: 1, category: 'facilities', rating: 2, comments: 'no water near rooms' },
    { park_id: 1, category: 'facilities', rating: 1, comments: 'danger after dark' },
    { park_id: 1, category: 'facilities', rating: 2, comments: 'facilities need repair now' },
    { park_id: 1, category: 'safety', rating: 1, comments: 'attack risk reported' }
  ];

  const alerts = detectFeedbackAlerts(rows, parks);
  const types = alerts.map((item) => item.alertType).sort();

  assert.deepEqual(types, [
    'capacity_threshold',
    'drought_indicator',
    'infrastructure_failure',
    'security_incident'
  ]);
});
