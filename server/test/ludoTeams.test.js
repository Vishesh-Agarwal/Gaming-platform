import test from 'node:test';
import assert from 'node:assert/strict';
import ludo, { applyTokenMove, loopCell, START } from '../src/games/ludo.js';

const teamState = () => ludo.createInitialState({ mode: 'teams' }, 4);

test('teams: only a full 4-seat table enables team mode', () => {
  const four = ludo.createInitialState({ mode: 'teams' }, 4);
  assert.equal(four.mode, 'teams');
  assert.deepEqual(four.teams, [0, 1, 0, 1]); // partners sit opposite
  const two = ludo.createInitialState({ mode: 'teams' }, 2);
  assert.equal(two.mode, 'classic');
  assert.equal(two.teams, null);
});

test('teams: a token never captures its partner', () => {
  const st = teamState();
  // seat 0 (color 0) and seat 2 (color 2) are partners. Land seat 0 onto a cell
  // occupied by partner seat 2 and confirm the partner is NOT sent home.
  // Put seat 2's token somewhere on the loop, then move seat 0 onto that cell.
  st.current = 0;
  st.dice = 6; // from base -> progress 1
  const landCell = loopCell(0, 1); // where seat 0's token lands
  // place a partner (seat 2) token on the same absolute cell
  // progress p for color 2 with loopCell(2,p) === landCell
  let partnerProg = -1;
  for (let p = 1; p <= 51; p++) if (loopCell(2, p) === landCell) { partnerProg = p; break; }
  assert.ok(partnerProg > 0);
  st.players[2].tokens = [partnerProg, 0, 0, 0];
  const next = applyTokenMove(st, 0);
  assert.equal(next.players[2].tokens[0], partnerProg, 'partner token should be untouched');
});

test('teams: an enemy on a non-safe cell is still captured', () => {
  const st = teamState();
  st.current = 0;
  // move seat 0 from progress 2 by dice 1 -> progress 3 -> cell START[0]+2 = 2 (not safe)
  st.players[0].tokens = [2, 0, 0, 0];
  st.dice = 1;
  const landCell = loopCell(0, 3);
  // seat 1 is an opponent — find a progress that maps to the same absolute cell
  let enemyProg = -1;
  for (let p = 1; p <= 51; p++) if (loopCell(1, p) === landCell) { enemyProg = p; break; }
  assert.ok(enemyProg > 0);
  st.players[1].tokens = [enemyProg, 0, 0, 0];
  const next = applyTokenMove(st, 0);
  assert.equal(next.players[1].tokens[0], 0, 'enemy token should be captured to base');
});

test('teams: game ends when both partners finish; partners share the win', () => {
  const st = teamState();
  // team 0 = seats 0 and 2 both home
  st.finishedOrder = [0, 2];
  const r = ludo.getResult(st);
  assert.equal(r.over, true);
  assert.equal(r.winnerTeam, 0);
  assert.equal(r.winner, 0); // winner is the TEAM id, mirroring Smash Karts
  assert.equal(r.mode, 'teams');
});

test('teams: not over when only one partner has finished', () => {
  const st = teamState();
  st.finishedOrder = [0];
  assert.equal(ludo.getResult(st).over, false);
});

test('ludo exposes a teams mode descriptor', () => {
  assert.ok(ludo.modes.some((m) => m.id === 'teams'));
});
