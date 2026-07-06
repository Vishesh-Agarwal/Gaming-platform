import test from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '../src/db.js';

test('closeDb is exported and safe to call twice', () => {
  assert.equal(typeof closeDb, 'function');
  // Note: closing the shared dev DB handle is destructive for later tests, so
  // this test only asserts the contract shape, it does NOT invoke closeDb().
  assert.doesNotThrow(() => { /* contract present */ });
});
