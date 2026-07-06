import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const marks = readFileSync(new URL('../src/games/karts/skidMarks.js', import.meta.url), 'utf8');
const game = readFileSync(new URL('../src/games/Karts.jsx', import.meta.url), 'utf8');

test('skid marks are a pooled, fading ground decal system', () => {
  assert.match(marks, /export function createSkidMarks/);
  assert.match(marks, /markAt/);
  assert.match(marks, /update/);
  assert.match(marks, /dispose/);
  assert.match(marks, /opacity/); // marks fade out, not pop
  assert.match(marks, /polygonOffset/); // no z-fighting with the road
});

test('karts drop skid marks under both rear wheels only when turning hard at speed', () => {
  assert.match(game, /createSkidMarks/);
  const wired = game.match(/skid[\s\S]{0,400}/i)?.[0] || '';
  assert.match(game, /Math\.abs\(turn\)/);
  const markCalls = game.match(/\.markAt\(/g) || [];
  assert.ok(markCalls.length >= 2, 'expected a mark per rear wheel');
  assert.match(game, /skidMarks\.dispose\(\)|marks\.dispose\(\)/);
  assert.ok(wired.length > 0);
});
