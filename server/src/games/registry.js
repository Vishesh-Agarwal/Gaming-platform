// Game registry: the extensibility core. Register a game module here and the
// platform (invites, rooms, referee) can host it. Adding a game later = create a
// module implementing the contract below and register it — no platform changes.
//
// Game module contract:
//   id            unique string
//   name          display name
//   type          'turn-based' (v1) | 'realtime' (future)
//   minPlayers, maxPlayers
//   createInitialState()                       -> state
//   applyMove(state, playerIndex, move)        -> { state, error }
//   getResult(state)                           -> { over, winner|null, draw }
import tictactoe from './tictactoe.js';
import ghostrider from './ghostrider.js';
import artillery from './artillery.js';
import hangman from './hangman.js';
import karts from './karts.js';
import ludo from './ludo.js';

const games = new Map();

export function register(game) {
  games.set(game.id, game);
}

export function getGame(id) {
  return games.get(id);
}

export function listGames() {
  return [...games.values()].map((g) => ({
    id: g.id,
    name: g.name,
    type: g.type,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
  }));
}

register(tictactoe);
register(ghostrider);
register(artillery);
register(hangman);
register(karts);
register(ludo);
