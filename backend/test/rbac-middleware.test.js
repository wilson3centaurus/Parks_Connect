import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeRoles } from '../middleware/roles.js';

function createResponseCapture() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    }
  };
}

test('authorizeRoles allows normalized equivalent roles', () => {
  const middleware = authorizeRoles('authority_admin');
  const req = { user: { role: 'sysadmin' } };
  const res = createResponseCapture();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'authority_admin');
});

test('authorizeRoles blocks disallowed roles', () => {
  const middleware = authorizeRoles('environment_officer');
  const req = { user: { role: 'tourism_operator' } };
  const res = createResponseCapture();

  middleware(req, res, () => {});

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, { message: 'Forbidden' });
});
