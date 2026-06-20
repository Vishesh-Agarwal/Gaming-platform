// Client game registry — mirrors the server registry. To add a game later:
// build its server module (rules) and a React component, then register it here.
import TicTacToe from './TicTacToe.jsx';

const registry = {
  tictactoe: { name: 'Tic-Tac-Toe', Component: TicTacToe },
};

export function getGame(id) {
  return registry[id];
}

export const availableGames = Object.entries(registry).map(([id, g]) => ({
  id,
  name: g.name,
}));
