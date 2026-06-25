import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOP_CELLS, HOME_COLUMN, BASE_SLOTS, cellFor } from '../../client/src/games/ludo/board.js';

const inBounds = ([r, c]) => r >= 0 && r < 15 && c >= 0 && c < 15;

test('LOOP_CELLS is 52 distinct in-bounds cells', () => {
  assert.equal(LOOP_CELLS.length, 52);
  assert.ok(LOOP_CELLS.every(inBounds));
  const seen = new Set(LOOP_CELLS.map(([r, c]) => `${r},${c}`));
  assert.equal(seen.size, 52);
});

test('each color has a 6-cell home column and 4 base slots, all in bounds', () => {
  for (const c of [0, 1, 2, 3]) {
    assert.equal(HOME_COLUMN[c].length, 6);
    assert.equal(BASE_SLOTS[c].length, 4);
    assert.ok(HOME_COLUMN[c].every(inBounds));
    assert.ok(BASE_SLOTS[c].every(inBounds));
  }
});

test('cellFor: base -> null, start -> loop start, 57 -> last home cell', () => {
  assert.equal(cellFor(0, 0), null);
  assert.deepEqual(cellFor(0, 1), LOOP_CELLS[0]);
  assert.deepEqual(cellFor(1, 1), LOOP_CELLS[13]);
  assert.deepEqual(cellFor(0, 57), HOME_COLUMN[0][5]);
});
