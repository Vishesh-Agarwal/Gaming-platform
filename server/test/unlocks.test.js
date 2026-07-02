import assert from 'node:assert/strict';
import test from 'node:test';
import { AVATARS, FRAMES, THEMES, canUseAvatar, canUseFrame, unlocksForLevel } from '../src/unlocks.js';

test('original six avatars stay available at level 1', () => {
  for (const id of ['pilot', 'bolt', 'crown', 'target', 'spark', 'shield']) {
    assert.ok(canUseAvatar(id, 1), id);
  }
});

test('gated items unlock at their level and not before', () => {
  assert.ok(!canUseAvatar('dragon', 15));
  assert.ok(canUseAvatar('dragon', 16));
  assert.ok(!canUseFrame('gold', 9));
  assert.ok(canUseFrame('gold', 10));
  assert.ok(!canUseAvatar('nonexistent', 99));
});

test('unlocksForLevel flags each item', () => {
  const u = unlocksForLevel(7);
  assert.ok(u.avatars.find((a) => a.id === 'ace').unlocked);
  assert.ok(!u.avatars.find((a) => a.id === 'rocket').unlocked);
  assert.ok(u.frames.find((f) => f.id === 'silver').unlocked);
  assert.equal(u.themes.length, THEMES.length);
});

test('catalogs are well-formed', () => {
  for (const list of [AVATARS, FRAMES, THEMES]) {
    for (const item of list) {
      assert.ok(item.id && item.label && item.minLevel >= 1, item.id);
    }
  }
});
