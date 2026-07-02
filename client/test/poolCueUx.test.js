import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pool = readFileSync(new URL('../src/games/Pool.jsx', import.meta.url), 'utf8');
const meta = readFileSync(new URL('../src/games/gameMeta.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('pool requires landscape on mobile like other full-table action games', () => {
  assert.match(meta, /'pool'/);
  assert.match(meta, /requiresLandscape\(gameId\)[\s\S]*\['karts', 'ghostrider', 'artillery', 'pool'\]/);
});

test('pool shots use a side power stick instead of a shoot button or generic power bar', () => {
  assert.match(pool, /cuePullFrom/);
  assert.match(pool, /function PoolPowerStick/);
  assert.match(pool, /className=\{`pool-power-stick/);
  assert.match(pool, /className="pool-playfield"/);
  assert.match(pool, /releasePowerStick/);
  assert.match(pool, /cancelPowerStick/);
  assert.match(pool, /onFire=\{\(pw\) => doShoot\(aim, pw\)\}/);
  assert.match(pool, /onPointerCancel=\{onUp\}/);
  assert.match(pool, /aimForViewVector/);
  assert.match(pool, /flip\s*\?\s*\{ dx: -visual\.dx, dy: -visual\.dy \}/);
  assert.match(pool, /setDragging\('aim'\)/);
  assert.doesNotMatch(pool, /className="pool-shoot"/);
  assert.doesNotMatch(pool, /pool-pull-meter/);
  assert.doesNotMatch(pool, /pool-cue-box/);
  assert.doesNotMatch(pool, /<PowerBar/);
});

test('pool prediction is short and hides illegal 8-ball target continuations', () => {
  assert.match(pool, /PREDICT_CUE_LEN\s*=\s*190/);
  assert.match(pool, /PREDICT_OBJECT_LEN\s*=\s*70/);
  assert.match(pool, /predictionAllowedForHit/);
  assert.match(pool, /drawPrediction\(ctx, pred, st\.ballR, predictionAllowedForHit\(st, youAreIndex, pred\.hit\?\.ball\)\)/);
});

test('pool landscape styles prioritize the table and keep cue tools reachable', () => {
  assert.match(css, /@media\s*\(max-width:\s*1100px\)\s*and\s*\(orientation:\s*portrait\)/);
  assert.match(css, /\.landscape-game-page\s+\.pool\s*\{[\s\S]*height:\s*100dvh/);
  assert.match(css, /\.landscape-game-page\s+\.pool-canvas\s*\{[\s\S]*max-height:\s*calc\(100dvh - 116px\)/);
  assert.match(css, /\.landscape-game-page\s+\.pool-controls\s*\{[\s\S]*position:\s*absolute/);
  assert.match(css, /\.pool-power-stick\s*\{[\s\S]*touch-action:\s*none/);
  assert.match(css, /@media\s*\(max-width:\s*1100px\)\s*and\s*\(orientation:\s*landscape\)/);
});

test('pool table art is closer to the 8-ball reference with teal rails and inlays', () => {
  assert.match(pool, /#70d7d5/);
  assert.match(pool, /drawRailInlays/);
  assert.match(pool, /drawFeltPattern/);
});
