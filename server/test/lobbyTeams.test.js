import test from 'node:test';
import assert from 'node:assert/strict';
import { createLobby, joinLobby, setReady, setMemberTeam, setLobbyOptions, startLobby, publicLobby } from '../src/lobbies.js';

const u = (id) => ({ id, username: `u${id}` });

test('host starts on team 0; joiners auto-place on the smaller team', () => {
  const { lobby } = createLobby(u(1), 'karts');
  assert.equal(lobby.members[0].team, 0);
  joinLobby(lobby.id, u(2));
  joinLobby(lobby.id, u(3));
  joinLobby(lobby.id, u(4));
  const counts = [0, 1].map((t) => lobby.members.filter((m) => m.team === t).length);
  assert.deepEqual(counts, [2, 2]); // balanced by auto-place
  assert.ok(publicLobby(lobby).members.every((m) => m.team === 0 || m.team === 1));
});

test('setMemberTeam swaps a member team', () => {
  const { lobby } = createLobby(u(10), 'karts');
  joinLobby(lobby.id, u(11));
  const before = lobby.members.find((m) => m.id === 11).team;
  setMemberTeam(11, before === 0 ? 1 : 0);
  assert.notEqual(lobby.members.find((m) => m.id === 11).team, before);
});

test('teams-mode start blocks unbalanced teams and passes aligned teams on balance', () => {
  const { lobby } = createLobby(u(20), 'karts');
  joinLobby(lobby.id, u(21));
  joinLobby(lobby.id, u(22));
  joinLobby(lobby.id, u(23));
  setLobbyOptions(20, { mode: 'teams' });
  // force 3 vs 1
  for (const id of [20, 21, 22]) setMemberTeam(id, 0);
  setMemberTeam(23, 1);
  for (const m of lobby.members) setReady(m.id, true);
  const bad = startLobby(20);
  assert.ok(bad.error, 'unbalanced teams should be blocked');
  // rebalance 2v2
  setMemberTeam(22, 1);
  for (const m of lobby.members) setReady(m.id, true);
  const ok = startLobby(20);
  assert.ok(!ok.error, ok.error);
  assert.equal(ok.options.teams.length, ok.userIds.length);
  ok.options.teams.forEach((t) => assert.ok(t === 0 || t === 1));
});

test('ffa-mode start ignores team balance', () => {
  const { lobby } = createLobby(u(30), 'karts');
  joinLobby(lobby.id, u(31));
  for (const m of lobby.members) setReady(m.id, true);
  const out = startLobby(30); // default mode ffa
  assert.ok(!out.error, out.error);
});
