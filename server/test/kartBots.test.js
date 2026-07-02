import test from 'node:test';
import assert from 'node:assert/strict';
import game, { botCount } from '../src/games/karts.js';

const START = 0;
const AFTER_COUNTDOWN = 3100; // matches COUNTDOWN_MS = 3000

test('botCount clamps requested bots to the free seats', () => {
  assert.equal(botCount(2, { bots: 3 }), 3);   // 2 players + 3 bots = 5 <= 8
  assert.equal(botCount(6, { bots: 5 }), 2);   // capped at 8 total
  assert.equal(botCount(1, { bots: 0 }), 0);
  assert.equal(botCount(1, {}), 0);
  assert.equal(botCount(8, { bots: 4 }), 0);   // grid already full
});

test('createSim appends bot karts after the human karts', () => {
  const sim = game.createSim([{}], START, { map: 'arena', bots: 3 });
  assert.equal(sim.karts.length, 4);
  assert.equal(sim.karts[0].bot, false);
  assert.ok(sim.karts.slice(1).every((k) => k.bot === true));
});

test('createSim uses lobby bot seats without duplicating them', () => {
  const sim = game.createSim([{ user: { id: 1 } }, { user: { id: -1, bot: true } }], START, { map: 'arena', bots: 1 });

  assert.equal(sim.karts.length, 2);
  assert.equal(sim.karts[0].bot, false);
  assert.equal(sim.karts[1].bot, true);
});

test('bots are team-balanced in teams mode', () => {
  // one human on team 0, then 3 bots should fill toward 2v2
  const sim = game.createSim([{}], START, { map: 'arena', mode: 'teams', teams: [0], bots: 3 });
  const t0 = sim.karts.filter((k) => k.team === 0).length;
  const t1 = sim.karts.filter((k) => k.team === 1).length;
  assert.equal(t0 + t1, 4);
  assert.ok(Math.abs(t0 - t1) <= 1, `teams should be balanced, got ${t0} vs ${t1}`);
});

test('a bot drives itself (moves without any input)', () => {
  const sim = game.createSim([{}, {}], START, { map: 'arena', bots: 1 });
  const bot = sim.karts[2];
  const x0 = bot.x, z0 = bot.z;
  // step well past the countdown so karts are live, several ticks
  for (let i = 0; i < 30; i++) game.step(sim, [{}, {}], 1 / 30, AFTER_COUNTDOWN + i * 33);
  const moved = Math.hypot(bot.x - x0, bot.z - z0);
  assert.ok(moved > 0.5, `bot should have driven somewhere, moved ${moved}`);
});

test('dropPlayer ignores bots — last human leaving ends the match', () => {
  const sim = game.createSim([{}], START, { map: 'arena', bots: 3 });
  const remaining = game.dropPlayer(sim, 0); // the only human leaves
  assert.equal(remaining, 0); // bots don't keep it alive
});

test('shield crate grants temporary invulnerability instead of a weapon', () => {
  const sim = game.createSim([{}, {}], START, { map: 'arena' });
  const k = sim.karts[0];
  const c = sim.crates[0];
  // place a shield on the crate, park the kart on it
  c.type = 'shield';
  c.readyAt = 0;
  k.x = c.x; k.z = c.z;
  game.step(sim, [{ queue: [], last: {} }, {}], 1 / 30, AFTER_COUNTDOWN);
  assert.equal(k.weapon, null, 'shield should not be held as a weapon');
  assert.ok(k.shieldUntil > AFTER_COUNTDOWN, 'shield timer should be set');
  assert.equal(c.type, null, 'crate should be consumed');
});
