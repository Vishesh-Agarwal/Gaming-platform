import test from 'node:test';
import assert from 'node:assert/strict';
import { quickPlay, createLobby, leaveLobby } from '../src/lobbies.js';

const u = (id) => ({ id, username: `u${id}` });

test('quickPlay opens a fresh public lobby when none exist', () => {
  const { lobby, joined, error } = quickPlay(u(100), 'karts');
  assert.equal(error, undefined);
  assert.equal(joined, false);
  assert.equal(lobby.members.length, 1);
  assert.equal(lobby.gameId, 'karts');
  leaveLobby(100);
});

test('quickPlay matches a second player into the first open lobby', () => {
  const first = quickPlay(u(101), 'karts');
  const second = quickPlay(u(102), 'karts');
  assert.equal(second.joined, true);
  assert.equal(second.lobby.id, first.lobby.id);
  assert.equal(second.lobby.members.length, 2);
  leaveLobby(101); leaveLobby(102);
});

test('quickPlay never matches into a private (friend/code) lobby', () => {
  const { lobby: priv } = createLobby(u(103), 'karts'); // private by default
  const res = quickPlay(u(104), 'karts');
  assert.notEqual(res.lobby.id, priv.id); // opened its own public lobby instead
  assert.equal(res.joined, false);
  leaveLobby(103); leaveLobby(104);
});

test('quickPlay only matches lobbies for the same game', () => {
  const k = quickPlay(u(105), 'karts');
  const l = quickPlay(u(106), 'ludo');
  assert.notEqual(l.lobby.id, k.lobby.id);
  assert.equal(l.lobby.gameId, 'ludo');
  leaveLobby(105); leaveLobby(106);
});

test('quickPlay rejects an unknown game', () => {
  const res = quickPlay(u(107), 'nope');
  assert.ok(res.error);
});
