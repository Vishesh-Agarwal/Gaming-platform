import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const ghostRider = readFileSync(new URL('../src/games/GhostRider.jsx', import.meta.url), 'utf8');

test('in-game emotes are placed near the top-right instead of bottom corners', () => {
  assert.match(css, /\.emote-bar\s*{[^}]*right:\s*18px;[^}]*top:\s*74px;/);
  assert.match(css, /\.emote-bubbles\s*{[^}]*right:\s*18px;[^}]*top:\s*132px;/);
  assert.doesNotMatch(css, /\.emote-bubbles\s*{[^}]*left:\s*18px;[^}]*bottom:\s*18px;/);
});

test('Ghost Rider has moderate aerial flip response', () => {
  const spinAccel = Number(ghostRider.match(/const SPIN_ACCEL = ([0-9.]+)/)?.[1]);
  const maxSpin = Number(ghostRider.match(/const MAX_SPIN = ([0-9.]+)/)?.[1]);

  assert.ok(spinAccel >= 0.0085 && spinAccel <= 0.0095);
  assert.ok(maxSpin >= 0.19 && maxSpin <= 0.21);
});
