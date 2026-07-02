import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(new URL('../src/pages/Home.jsx', import.meta.url), 'utf8');

test('leaving a completed game does not emit game:leave and cancel rematch offers', () => {
  assert.match(home, /activeRoom\?\.status !== 'over'[\s\S]*emit\('game:leave'\)/);
});
