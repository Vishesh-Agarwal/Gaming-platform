import test from 'node:test';
import assert from 'node:assert/strict';
import ludo, { applyRoll, applyTokenMove, loopCell } from '../src/games/ludo.js';

const fresh = (n = 2) => ludo.createInitialState(undefined, n);

test('leaving base on a 6 puts the token on its start cell (progress 1) and grants extra turn', () => {
  let st = fresh();
  st = applyRoll(st, 6);
  st = applyTokenMove(st, 0);
  assert.equal(st.players[0].tokens[0], 1);
  assert.equal(st.current, 0);       // 6 -> extra turn
  assert.equal(st.phase, 'roll');
});

test('normal move advances and passes the turn (no 6)', () => {
  let st = fresh();
  st.players[0].tokens[0] = 1;
  st = applyRoll(st, 3);
  st = applyTokenMove(st, 0);
  assert.equal(st.players[0].tokens[0], 4);
  assert.equal(st.current, 1);       // turn passes
});

test('capture: landing on an opponent on a non-safe cell sends it home + extra turn', () => {
  let st = fresh();                  // seats 0 (color 0) and 1 (color 2)
  // color 2 start = 26; progress 3 -> abs 28 (non-safe). color 0 reaches abs 28 at progress 29.
  st.players[1].tokens[0] = 3;       // abs 28
  st.players[0].tokens[0] = 28;      // abs 27; +1 -> abs 28
  st.current = 0; st = applyRoll(st, 1);
  st = applyTokenMove(st, 0);
  assert.equal(st.players[0].tokens[0], 29);
  assert.equal(st.players[1].tokens[0], 0, 'captured token returns to base');
  assert.equal(st.lastEvent?.type, 'capture');
  assert.equal(st.current, 0, 'capture grants an extra turn');
});

test('no capture on a safe cell', () => {
  let st = fresh();
  // color 2 start = 26 is a SAFE cell. Opponent sits on its own start (abs 26).
  st.players[1].tokens[0] = 1;       // abs 26 (safe)
  st.players[0].tokens[0] = 26;      // abs 25; +1 -> abs 26
  st.current = 0; st = applyRoll(st, 1);
  st = applyTokenMove(st, 0);
  assert.equal(st.players[1].tokens[0], 1, 'safe token not captured');
  assert.equal(st.current, 1, 'no capture -> turn passes');
});

test('finishing a token (reach 57) grants an extra turn; all 4 home records finishedOrder', () => {
  let st = fresh();
  st.players[0].tokens = [57, 57, 57, 55];
  st = applyRoll(st, 2);             // token 3: 55+2=57
  st = applyTokenMove(st, 3);
  assert.equal(st.players[0].tokens[3], 57);
  assert.ok(st.finishedOrder.includes(0));
});
