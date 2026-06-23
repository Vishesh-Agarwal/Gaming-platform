import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLobby, joinLobby, setLobbyOptions } from '../src/lobbies.js';

test('host can set lobby options; non-host cannot', () => {
  const host = { id: 9001, username: 'host' };
  const guest = { id: 9002, username: 'guest' };
  const { lobby } = createLobby(host, 'karts', null);
  joinLobby(lobby.id, guest);

  const ok = setLobbyOptions(host.id, { map: 'pillars' });
  assert.equal(ok.error, undefined);
  assert.equal(ok.lobby.options.map, 'pillars');

  const bad = setLobbyOptions(guest.id, { map: 'gauntlet' });
  assert.ok(bad.error, 'guest should be rejected');
});
