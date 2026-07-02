import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/components/LobbyModal.jsx', import.meta.url), 'utf8');

test('lobby renders console-style player slot cards up to maxPlayers', () => {
  assert.match(modal, /className={`party-slot/);
  assert.match(modal, /party-slot empty/);
  assert.match(css, /\.party-slots\s*{[^}]*grid/s);
  assert.match(css, /\.party-slot\.ready\s*{[^}]*var\(--green\)/s);
});
