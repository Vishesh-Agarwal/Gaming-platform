// Client game registry — mirrors the server registry. To add a game later:
// build its server module (rules) and a React component (+ a Thumbnail export),
// then register it here with a name, accent colour, and thumbnail.
import { lazy } from 'react';
import TicTacToe, { Thumbnail as TicTacToeThumb } from './TicTacToe.jsx';
import GhostRider, { Thumbnail as GhostRiderThumb } from './GhostRider.jsx';
import Artillery, { Thumbnail as ArtilleryThumb } from './Artillery.jsx';
import Hangman, { Thumbnail as HangmanThumb } from './Hangman.jsx';
import Ludo, { Thumbnail as LudoThumb } from './Ludo.jsx';
import { Thumbnail as KartsThumb } from './KartsThumb.jsx';

// Karts pulls in Three.js (~550 KB). Lazy-load it so that weight is a separate
// chunk fetched only when entering Smash Karts — do NOT change this to a static
// import (it would drag Three.js back into the main bundle). The thumbnail is a
// three-free module so the lobby grid stays eager.
const Karts = lazy(() => import('./Karts.jsx'));

const registry = {
  tictactoe: {
    name: 'Tic-Tac-Toe',
    Component: TicTacToe,
    thumbnail: TicTacToeThumb,
    accent: '#5b8cff',
    modes: [
      { id: 'classic', name: 'Classic', hint: 'Standard 3-in-a-row.' },
      { id: 'shifting', name: 'Shifting', hint: 'Place 3, then slide to make a line.' },
      { id: 'ultimate', name: 'Ultimate', hint: '9 boards — your move sends them to the next.' },
    ],
  },
  ghostrider: {
    name: 'Ghost Rider',
    Component: GhostRider,
    thumbnail: GhostRiderThumb,
    accent: '#ff7a3c',
  },
  artillery: {
    name: 'Tank Duel',
    Component: Artillery,
    thumbnail: ArtilleryThumb,
    accent: '#8bd450',
  },
  hangman: {
    name: 'Hangman',
    Component: Hangman,
    thumbnail: HangmanThumb,
    accent: '#b388ff',
    options: [{ key: 'rounds', label: 'Rounds', min: 1, max: 10, default: 3 }],
  },
  karts: {
    name: 'Smash Karts',
    Component: Karts,
    thumbnail: KartsThumb,
    accent: '#ff5d6c',
    maxPlayers: 4,
  },
  ludo: {
    name: 'Ludo',
    Component: Ludo,
    thumbnail: LudoThumb,
    accent: '#e4453a',
    maxPlayers: 4,
  },
};

export function getGame(id) {
  return registry[id];
}

export const availableGames = Object.entries(registry).map(([id, g]) => ({
  id,
  name: g.name,
  thumbnail: g.thumbnail,
  accent: g.accent,
  modes: g.modes || null,
  options: g.options || null,
  maxPlayers: g.maxPlayers || 2,
}));
