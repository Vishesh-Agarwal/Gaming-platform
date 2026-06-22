// Client game registry — mirrors the server registry. To add a game later:
// build its server module (rules) and a React component (+ a Thumbnail export),
// then register it here with a name, accent colour, and thumbnail.
import TicTacToe, { Thumbnail as TicTacToeThumb } from './TicTacToe.jsx';
import GhostRider, { Thumbnail as GhostRiderThumb } from './GhostRider.jsx';
import Artillery, { Thumbnail as ArtilleryThumb } from './Artillery.jsx';

const registry = {
  tictactoe: {
    name: 'Tic-Tac-Toe',
    Component: TicTacToe,
    thumbnail: TicTacToeThumb,
    accent: '#5b8cff',
    modes: [
      { id: 'classic', name: 'Classic', hint: 'Standard 3-in-a-row.' },
      { id: 'shifting', name: 'Shifting', hint: 'Place 3, then slide to make a line.' },
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
}));
