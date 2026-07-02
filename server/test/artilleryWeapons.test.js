import test from 'node:test';
import assert from 'node:assert/strict';
import artillery, { WEAPON_LIST } from '../src/games/artillery.js';

test('initial state seeds per-player ammo and exposes the weapon list', () => {
  const s = artillery.createInitialState();
  assert.ok(Array.isArray(s.weapons));
  assert.ok(s.weapons.some((w) => w.id === 'bigbomb'));
  assert.equal(s.ammo.length, 2);
  assert.equal(s.ammo[0].bigbomb, 2);
  assert.equal(s.ammo[0].sniper, 4);
  assert.equal(s.ammo[0].digger, 3);
});

test('WEAPON_LIST marks the standard shell as unlimited (null ammo)', () => {
  const std = WEAPON_LIST.find((w) => w.id === 'standard');
  assert.equal(std.ammo, null);
});

test('firing a limited weapon spends one ammo and tags the shot', () => {
  const s = artillery.createInitialState(); // turn = 0
  const { state, error } = artillery.applyMove(s, 0, { angle: 45, power: 60, weapon: 'bigbomb' });
  assert.equal(error, undefined);
  assert.equal(state.ammo[0].bigbomb, 1); // 2 -> 1
  assert.equal(state.lastShot.weapon, 'bigbomb');
  assert.equal(state.lastShot.blast, 150);
});

test('firing the standard shell never consumes ammo', () => {
  const s = artillery.createInitialState();
  const { state } = artillery.applyMove(s, 0, { angle: 45, power: 60, weapon: 'standard' });
  assert.deepEqual(state.ammo[0], s.ammo[0]);
  assert.equal(state.lastShot.weapon, 'standard');
});

test('a weapon with no ammo left is rejected', () => {
  const s = artillery.createInitialState();
  s.ammo[0].bigbomb = 0;
  const r = artillery.applyMove(s, 0, { angle: 45, power: 60, weapon: 'bigbomb' });
  assert.ok(r.error);
});

test('an unknown weapon id falls back to the standard shell', () => {
  const s = artillery.createInitialState();
  const { state } = artillery.applyMove(s, 0, { angle: 45, power: 60, weapon: 'nuke' });
  assert.equal(state.lastShot.weapon, 'standard');
});

test('a shell that intersects a tank detonates on the tank instead of passing through', () => {
  const s = artillery.createInitialState();
  s.wind = 0;
  s.ground = s.ground.map(() => 420);
  s.tanks = [
    { x: 80, hp: 100 },
    { x: 160, hp: 100 },
  ];

  const { state, error } = artillery.applyMove(s, 0, { angle: 1, power: 51, weapon: 'sniper' });

  assert.equal(error, undefined);
  assert.equal(state.lastShot.directHit, 1);
  assert.ok(state.lastShot.impact.x <= 176);
  assert.ok(state.tanks[1].hp < 100);
});
