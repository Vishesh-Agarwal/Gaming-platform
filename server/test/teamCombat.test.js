import test from 'node:test';
import assert from 'node:assert/strict';
import game, { nearestTarget } from '../src/games/karts.js';

const openMap = { arena: { w: 120, d: 120 }, obstacles: [], ramps: [] };

function teamSim(positions, teams) {
  return {
    mode: 'teams',
    karts: positions.map(([x, z], i) => ({
      x, z, y: 0, alive: true, gone: false, team: teams[i], kills: 0,
    })),
  };
}

test('nearestTarget skips a teammate and locks an enemy', () => {
  // shooter 0 (team 0); kart 1 teammate at dist 3; kart 2 enemy at dist 6
  const sim = teamSim([[0, 0], [3, 0], [6, 0]], [0, 0, 1]);
  assert.equal(nearestTarget(sim, 0, openMap), 2);
});

test('nearestTarget returns null when only a teammate is in range', () => {
  const sim = teamSim([[0, 0], [3, 0]], [0, 0]);
  assert.equal(nearestTarget(sim, 0, openMap), null);
});

test('snapshot carries per-kart team and team totals; result picks the winning team', () => {
  const sim = game.createSim([{}, {}, {}, {}], 0, { map: 'coliseum', mode: 'teams', teams: [0, 1, 0, 1] });
  sim.karts[0].kills = 3; sim.karts[2].kills = 1; // team 0 total 4
  sim.karts[1].kills = 2; sim.karts[3].kills = 1; // team 1 total 3
  const snap = game.snapshot(sim, sim.startAt + 1000);
  assert.deepEqual(snap.karts.map((k) => k.team), [0, 1, 0, 1]);
  assert.deepEqual(snap.teams, [4, 3]);
  const r = game.result(sim);
  assert.equal(r.mode, 'teams');
  assert.equal(r.winner, 0);
  assert.equal(r.draw, false);
  assert.deepEqual(r.teams, [4, 3]);
});

test('FFA snapshot has null teams and result is unchanged', () => {
  const sim = game.createSim([{}, {}], 0, { map: 'coliseum' });
  const snap = game.snapshot(sim, sim.startAt + 1000);
  assert.equal(snap.teams, null);
  const r = game.result(sim);
  assert.equal(r.mode, undefined);
  assert.ok('scores' in r);
});
