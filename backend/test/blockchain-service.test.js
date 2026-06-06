import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anchorRecordSafely,
  canonicalizeData,
  hashCanonicalData,
  verifyBlockchainRecordHash
} from '../services/blockchainService.js';

test('canonicalizeData sorts object keys deterministically', () => {
  const a = canonicalizeData({ b: 2, a: 1, nested: { z: 3, y: 2 } });
  const b = canonicalizeData({ nested: { y: 2, z: 3 }, a: 1, b: 2 });
  assert.equal(a, b);
});

test('verifyBlockchainRecordHash passes for unchanged canonical payloads', () => {
  const payload = { feedback_id: 8, park_id: 2, rating: 5, channel: 'mobile' };
  const hash = hashCanonicalData(payload);
  assert.equal(verifyBlockchainRecordHash(payload, hash), true);
  assert.equal(verifyBlockchainRecordHash({ ...payload, rating: 4 }, hash), false);
});

test('anchorRecordSafely returns a non-throwing result when blockchain is not configured', async () => {
  const result = await anchorRecordSafely('FEEDBACK', 'abc-123', { feedback_id: 'abc-123' }, {
    env: { BLOCKCHAIN_ENABLED: 'false', BLOCKCHAIN_MNEMONIC: '', BLOCKCHAIN_NETWORK_URL: '', CONTRACT_ADDRESS: '' },
    skipPersistence: true
  });

  assert.equal(result.success, false);
  assert.equal(result.recordType, 'FEEDBACK');
  assert.equal(result.recordId, 'abc-123');
  assert.match(result.dataHash, /^0x[a-f0-9]{64}$/);
});
