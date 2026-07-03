import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const fx = readFileSync(new URL('../src/games/karts/fx.js', import.meta.url), 'utf8');
const scene = readFileSync(new URL('../src/games/karts/scene.js', import.meta.url), 'utf8');
const materials = readFileSync(new URL('../src/games/karts/materials.js', import.meta.url), 'utf8');

test('kart particle FX are daylight-friendly: no additive neon blending', () => {
  assert.doesNotMatch(fx, /AdditiveBlending/);
  assert.doesNotMatch(fx, /#3a3458/); // old neon-purple dust
  assert.match(fx, /#a89a84/); // warm road dust
});

test('explosions produce a fire core plus a gray smoke plume and dust ring', () => {
  assert.match(fx, /plume/i);
  assert.match(fx, /#8f8574/); // dust ring color
});

test('particles carry per-recipe starting opacity (fade), not fixed 1.0', () => {
  assert.match(fx, /fade/);
});

test('cylindrical obstacles get round grass aprons', () => {
  const apron = scene.slice(scene.indexOf('const addApron'), scene.indexOf('// Perimeter walls'));
  assert.match(apron, /CircleGeometry/);
  assert.match(apron, /cyl/);
});

test('boost arrow art is inset so the circular pad never clips it', () => {
  assert.match(materials, /inset|0\.72|scale\(0\.7/i);
});
