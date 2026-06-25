import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../src/games/karts.js';

test('weapon pool has mg/rocket/mine and no shield', () => {
  assert.ok(WEAPONS.includes('mg'));
  assert.ok(WEAPONS.includes('rocket'));
  assert.ok(WEAPONS.includes('mine'));
  assert.ok(!WEAPONS.includes('shield'), 'shield pickup removed');
});
