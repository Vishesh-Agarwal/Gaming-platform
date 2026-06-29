import test from 'node:test';
import assert from 'node:assert/strict';
import codenames from '../src/games/codenames.js';
import { getGame, listGames } from '../src/games/registry.js';
import { createLobby, publicLobby, setLobbyOptions, setReady, startLobby } from '../src/lobbies.js';
import { createRoom, isBotTurn, makeBotMove, makeMove } from '../src/rooms.js';
import { createUser } from '../src/db.js';

test('is registered as a 4-player game', () => {
  assert.equal(getGame('codenames')?.maxPlayers, 4);
  assert.ok(listGames().some((g) => g.id === 'codenames'));
});

test('spymasters see roles and guessers do not', () => {
  const state = codenames.createInitialState(undefined, 4);
  assert.equal(typeof codenames.publicState(state, 0).cards[0].role, 'string');
  assert.equal(codenames.publicState(state, 2).cards[0].role, null);
});

test('clue moves turn to active guesser', () => {
  const state = codenames.createInitialState(undefined, 4);
  const next = codenames.applyMove(state, 0, { word: 'SKY', count: 2 }).state;
  assert.equal(next.phase, 'guess');
  assert.equal(next.turn, 2);
  assert.deepEqual(next.clue, { word: 'SKY', count: 2, by: 0 });
});

test('wrong role ends the team turn', () => {
  let state = codenames.createInitialState(undefined, 4);
  state.cards[0] = { word: 'MISS', role: 'blue', revealed: false };
  state = codenames.applyMove(state, 0, { word: 'SKY', count: 1 }).state;
  state = codenames.applyMove(state, 2, { index: 0 }).state;
  assert.equal(state.phase, 'clue');
  assert.equal(state.turnTeam, 1);
  assert.equal(state.turn, 1);
});

test('assassin gives the other team the win', () => {
  let state = codenames.createInitialState(undefined, 4);
  state.cards[0] = { word: 'BOOM', role: 'assassin', revealed: false };
  state = codenames.applyMove(state, 0, { word: 'BAD', count: 1 }).state;
  state = codenames.applyMove(state, 2, { index: 0 }).state;
  assert.deepEqual(codenames.getResult(state).winner, 1);
});

test('lobby exposes 4-seat minimum and can fill Codenames with bots', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const host = createUser(`code_host_${suffix}`, 'x');
  const { lobby, error } = createLobby(host, 'codenames');
  assert.equal(error, undefined);
  assert.equal(publicLobby(lobby).minPlayers, 4);

  setLobbyOptions(host.id, { bots: 3 });
  setReady(host.id, true);
  const started = startLobby(host.id);
  assert.equal(started.error, undefined);
  assert.equal(started.options.bots, 3);

  const created = createRoom(started.gameId, started.options, started.userIds);
  assert.equal(created.error, undefined);
  assert.equal(created.room.players.length, 4);
  assert.equal(created.room.players.filter((p) => p.bot).length, 3);

  assert.equal(makeBotMove(created.room.id), null, 'host should have the first clue turn');
  const clueMove = makeMove(created.room.id, host.id, { word: 'SKY', count: 1 });
  assert.equal(clueMove.error, undefined);
  assert.equal(isBotTurn(created.room.id), true);
  const botMove = makeBotMove(created.room.id);
  assert.ok(botMove, 'bot guesser should be able to play after a clue');
});
