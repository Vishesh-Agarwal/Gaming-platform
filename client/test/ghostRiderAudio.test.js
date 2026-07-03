import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../src/games/ghostRiderAudio.js', import.meta.url), 'utf8');
const game = readFileSync(new URL('../src/games/GhostRider.jsx', import.meta.url), 'utf8');

test('ghost rider audio: engine loop + event cues, mute-aware, stub-safe', async () => {
  assert.match(src, /updateEngine/);
  for (const cue of ['crash', 'land', 'pickup', 'finish']) assert.match(src, new RegExp(cue));
  assert.match(src, /gameSoundMuted/);
  assert.match(src, /setTargetAtTime/); // smooth pitch/gain ramps, no zipper noise
  const mod = await import('../src/games/ghostRiderAudio.js');
  const stub = mod.createGhostRiderAudio(); // node has no Web Audio -> no-op stub
  stub.updateEngine(0.5, true, false);
  stub.crash(); stub.land(0.8); stub.pickup(); stub.finish();
  stub.dispose();
});

test('the game loop drives the engine and fires event cues', () => {
  assert.match(game, /createGhostRiderAudio/);
  assert.match(game, /updateEngine\(/);
  assert.match(game, /audio\w*\.crash\(\)|\.crash\(\)/);
  assert.match(game, /\.pickup\(\)/);
  assert.match(game, /\.land\(/);
});
