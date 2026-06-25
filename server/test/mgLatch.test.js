import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../src/games/karts.js';

const NOW = 5000;

test('one MG press drains the whole magazine over ticks, no hold needed', () => {
  const sim = game.createSim([{}, {}], 0, { map: 'arena' });
  const k = sim.karts[0];
  k.x = 20; k.z = 0; k.y = 0; k.grounded = true;
  k.weapon = 'mg'; k.ammo = 5; k.nextShotAt = 0; k.prevFire = false;

  // Single press this tick:
  game.step(sim, [{ last: { fire: true } }, {}], 1 / 30, NOW);
  assert.equal(k.ammo, 4, 'first shot fired on press');

  // Release the button; advance time past cadence each tick. It must keep firing.
  let t = NOW;
  for (let s = 0; s < 10 && k.weapon === 'mg'; s++) {
    t += 200; // > MG.cadence (90)
    game.step(sim, [{}, {}], 1 / 30, t);
  }
  assert.equal(k.ammo, 0, 'magazine fully drained without holding fire');
  assert.equal(k.weapon, null, 'weapon clears when empty');
});
