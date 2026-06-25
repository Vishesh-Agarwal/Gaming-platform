import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../src/games/karts.js';

test('declares ffa + teams modes and 8 maxPlayers', () => {
  assert.equal(game.maxPlayers, 8);
  assert.deepEqual(game.modes.map((m) => m.id), ['ffa', 'teams']);
});

test('createInitialState resolves mode and exposes palettes', () => {
  const ffa = game.createInitialState({ map: 'coliseum' });
  assert.equal(ffa.mode, 'ffa');
  assert.equal(ffa.maxPlayers, 8);
  assert.equal(ffa.colors.length, 8);
  assert.equal(ffa.teamColors.length, 2);
  assert.equal(ffa.teams, null);

  const teams = game.createInitialState({ map: 'coliseum', mode: 'teams', teams: [0, 1, 0, 1] });
  assert.equal(teams.mode, 'teams');
  assert.deepEqual(teams.teams, [0, 1, 0, 1]);

  const bad = game.createInitialState({ map: 'coliseum', mode: 'nonsense' });
  assert.equal(bad.mode, 'ffa'); // unknown -> ffa
});

test('createSim assigns teams from options.teams and side-split spawns', () => {
  const players = [{}, {}, {}, {}];
  const sim = game.createSim(players, 0, { map: 'coliseum', mode: 'teams', teams: [0, 1, 0, 1] });
  assert.equal(sim.mode, 'teams');
  assert.deepEqual(sim.karts.map((k) => k.team), [0, 1, 0, 1]);
  // team 0 karts spawn north (z<0), team 1 south (z>0)
  assert.ok(sim.karts[0].z < 0 && sim.karts[2].z < 0);
  assert.ok(sim.karts[1].z > 0 && sim.karts[3].z > 0);
  // distinct spawn slots within a side
  assert.notEqual(sim.karts[0].spawnIdx, sim.karts[2].spawnIdx);
});

test('FFA createSim leaves team null and uses i % spawns', () => {
  const sim = game.createSim([{}, {}], 0, { map: 'coliseum' });
  assert.equal(sim.mode, 'ffa');
  assert.deepEqual(sim.karts.map((k) => k.team), [null, null]);
  assert.equal(sim.karts[0].spawnIdx, 0);
  assert.equal(sim.karts[1].spawnIdx, 1);
});
