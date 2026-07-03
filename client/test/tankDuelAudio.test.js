import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../src/games/tankDuelAudio.js', import.meta.url), 'utf8');
const game = readFileSync(new URL('../src/games/Artillery.jsx', import.meta.url), 'utf8');

test('tank duel audio: fire/whistle, explosion, drive rumble, sting; mute-aware stub', async () => {
  for (const cue of ['fire', 'explosion', 'updateDrive', 'roundOver']) {
    assert.match(src, new RegExp(cue));
  }
  assert.match(src, /gameSoundMuted/);
  assert.match(src, /whistle/i);
  const mod = await import('../src/games/tankDuelAudio.js');
  const stub = mod.createTankDuelAudio(); // node has no Web Audio -> no-op stub
  stub.fire(0.8); stub.explosion(1); stub.updateDrive(0.4); stub.roundOver();
  stub.dispose();
});

test('the game wires audio at shot start, impact, driving, and round over', () => {
  assert.match(game, /createTankDuelAudio/);
  assert.match(game, /audio\w*\.fire\(|\.fire\(/);
  assert.match(game, /\.explosion\(/);
  assert.match(game, /updateDrive\(/);
  assert.match(game, /\.roundOver\(\)/);
});
