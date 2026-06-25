import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../src/games/karts.js';

const NOW = 5000; // > startAt (countdown), < endsAt
// Drop a mine from kart `owner` at its current position, then advance time
// past the mine's arm delay so it can trigger.
function simWithMine(ownerPos, owner, opts = {}) {
  const n = opts.n || 2;
  const sim = game.createSim(Array.from({ length: n }, () => ({})), 0,
    { map: 'arena', ...(opts.mode ? { mode: opts.mode, teams: opts.teams } : {}) });
  const k = sim.karts[owner];
  k.x = ownerPos[0]; k.z = ownerPos[1]; k.y = 0; k.grounded = true; k.vy = 0;
  k.weapon = 'mine'; k.ammo = 1; k.queue = [];
  const inputs = Array.from({ length: n }, (_, i) => (i === owner ? { last: { fire: true } } : {}));
  game.step(sim, inputs, 1 / 30, NOW); // places + arms-pending the mine
  return sim;
}

test('an enemy driving over a mine is killed', () => {
  const sim = simWithMine([20, 0], 0);
  const enemy = sim.karts[1];
  enemy.x = 20; enemy.z = 0; enemy.y = 0; enemy.grounded = true; enemy.alive = true;
  game.step(sim, [{}, {}], 1 / 30, NOW + 1000); // past arm delay
  assert.equal(enemy.alive, false, 'enemy over mine should die');
});

test('the owner driving over their own mine is unharmed', () => {
  const sim = simWithMine([20, 0], 0);
  const owner = sim.karts[0];
  owner.x = 20; owner.z = 0; // stand on own mine
  const hpBefore = owner.hp;
  game.step(sim, [{}, {}], 1 / 30, NOW + 1000);
  assert.equal(owner.alive, true, 'owner immune to own mine');
  assert.equal(owner.hp, hpBefore, 'owner takes no damage from own mine');
});

test('a teammate driving over an ally mine is unharmed (teams mode)', () => {
  const sim = simWithMine([20, 0], 0, { n: 4, mode: 'teams', teams: [0, 1, 0, 1] });
  const ally = sim.karts[2]; // same team as owner (0)
  ally.x = 20; ally.z = 0; ally.y = 0; ally.grounded = true; ally.alive = true;
  game.step(sim, [{}, {}, {}, {}], 1 / 30, NOW + 1000);
  assert.equal(ally.alive, true, 'teammate immune to ally mine');
});

test('mine snapshot entries carry their owner index', () => {
  const sim = simWithMine([20, 0], 0);
  const snap = game.snapshot(sim, NOW);
  const mine = snap.proj.find((p) => p.type === 'mine');
  assert.ok(mine, 'a mine projectile exists');
  assert.equal(mine.owner, 0);
});
