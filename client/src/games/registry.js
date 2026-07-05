// Client game registry — mirrors the server registry. To add a game later:
// build its server module (rules) and a React component (+ a Thumbnail export),
// then register it here with a name, accent colour, and thumbnail.
import { lazy } from 'react';
import TicTacToe, { Thumbnail as TicTacToeThumb } from './TicTacToe.jsx';
import GhostRider, { Thumbnail as GhostRiderThumb } from './GhostRider.jsx';
import Artillery, { Thumbnail as ArtilleryThumb } from './Artillery.jsx';
import Hangman, { Thumbnail as HangmanThumb } from './Hangman.jsx';
import Ludo, { Thumbnail as LudoThumb } from './Ludo.jsx';
import Carrom, { Thumbnail as CarromThumb } from './Carrom.jsx';
import Pool, { Thumbnail as PoolThumb } from './Pool.jsx';
import ConnectFour, { Thumbnail as ConnectFourThumb } from './ConnectFour.jsx';
import Skribble, { Thumbnail as SkribbleThumb } from './Skribble.jsx';
import WordDuel, { Thumbnail as WordDuelThumb } from './WordDuel.jsx';
import Battleship, { Thumbnail as BattleshipThumb } from './Battleship.jsx';
import Checkers, { Thumbnail as CheckersThumb } from './Checkers.jsx';
import Reversi, { Thumbnail as ReversiThumb } from './Reversi.jsx';
import DotsBoxes, { Thumbnail as DotsBoxesThumb } from './DotsBoxes.jsx';
import Boggle, { Thumbnail as BoggleThumb } from './Boggle.jsx';
import Codenames, { Thumbnail as CodenamesThumb } from './Codenames.jsx';
import Uno, { Thumbnail as UnoThumb } from './Uno.jsx';
import MicroChess, { Thumbnail as MicroChessThumb } from './MicroChess.jsx';
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
    rules: 'Place or move marks to claim a line before your opponent.',
    botCap: 1,
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
    rules: 'Race the arena in realtime, dodge trails, and survive longer than the pack.',
  },
  artillery: {
    name: 'Tank Duel',
    Component: Artillery,
    thumbnail: ArtilleryThumb,
    accent: '#8bd450',
    rules: 'Pick angle and power, fire across the terrain, and win the round by landing hits.',
  },
  hangman: {
    name: 'Hangman',
    Component: Hangman,
    thumbnail: HangmanThumb,
    accent: '#b388ff',
    rules: 'Set words, guess letters, and score over the selected number of rounds.',
    options: [{ key: 'rounds', label: 'Rounds', min: 1, max: 10, default: 3 }],
  },
  karts: {
    name: 'Smash Karts',
    Component: Karts,
    thumbnail: KartsThumb,
    accent: '#ff5d6c',
    rules: 'Drive, grab weapons, and score eliminations before the match ends.',
    maxPlayers: 8,
    botCap: 7,
    modes: [
      { id: 'ffa', name: 'Free-for-all', hint: 'Most kills wins.' },
      { id: 'teams', name: 'Teams', hint: 'Two squads — team kills decide it.' },
    ],
  },
  ludo: {
    name: 'Ludo',
    botCap: 3,
    Component: Ludo,
    thumbnail: LudoThumb,
    accent: '#e4453a',
    rules: 'Roll, race tokens home, and block or capture opponents along the track.',
    maxPlayers: 4,
    modes: [
      { id: 'classic', name: 'Classic', hint: 'Every player for themselves.' },
      { id: 'teams', name: '2v2 Teams', hint: 'Needs 4 players — partners sit opposite.' },
    ],
  },
  carrom: {
    name: 'Carrom',
    Component: Carrom,
    thumbnail: CarromThumb,
    accent: '#caa46a',
    rules: 'Aim the striker, pocket coins, and manage Queen cover or points by mode.',
    modes: [
      { id: 'classic', name: 'Classic', hint: 'Pocket all your coins, then cover the Queen.' },
      { id: 'points', name: 'Points Race', hint: 'Any coin scores — first to 7 wins. Queen = 3.' },
      { id: 'blitz', name: 'Blitz', hint: 'Classic rules with a 20s shot clock.' },
      { id: 'quick', name: 'Quick', hint: 'Fewer coins for a short game.' },
    ],
  },
  pool: {
    name: 'Pool',
    Component: Pool,
    thumbnail: PoolThumb,
    accent: '#1f7a4d',
    rules: 'Aim the cue, call the right target by mode, and avoid scratches or wrong first contact.',
    modes: [
      { id: 'eightball', name: '8-Ball', hint: 'Sink your group, then the 8.' },
      { id: 'blitz', name: 'Blitz', hint: '8-Ball with a 20s shot clock.' },
      { id: 'nineball', name: '9-Ball', hint: 'Lowest ball first; pot the 9 to win.' },
      { id: 'practice', name: 'Practice', hint: 'No rules — pot balls, most wins.' },
    ],
  },
  connect4: {
    name: 'Connect Four',
    Component: ConnectFour,
    thumbnail: ConnectFourThumb,
    accent: '#2d6fe8',
    rules: 'Drop discs into columns and connect the target line before your opponent.',
    botCap: 1,
    modes: [
      { id: 'classic', name: 'Classic', hint: 'Standard connect four.' },
      { id: 'popout', name: 'PopOut', hint: 'Drop discs or pop your own bottom disc.' },
      { id: 'five', name: 'Five-in-a-Row', hint: 'Same board, longer winning line.' },
    ],
  },
  skribble: {
    name: 'Skribble',
    Component: Skribble,
    thumbnail: SkribbleThumb,
    accent: '#3fc7ad',
    rules: 'One player draws the prompt while everyone else races to guess it.',
    maxPlayers: 6,
    modes: [
      { id: 'mixed', name: 'Mixed Pack', hint: 'Broad prompt mix.' },
      { id: 'simple', name: 'Simple Pack', hint: 'Shorter single-word prompts.' },
      { id: 'party', name: 'Party Pack', hint: 'Food, sports, and celebration prompts.' },
    ],
    options: [
      { key: 'rounds', label: 'Rounds', min: 1, max: 5, default: 2 },
      { key: 'choiceCount', label: 'Word choices', min: 2, max: 5, default: 3 },
      { key: 'wordsPerPrompt', label: 'Words per prompt', min: 1, max: 3, default: 1 },
      {
        key: 'customWords',
        type: 'textList',
        label: 'Custom prompts',
        default: '',
        placeholder: 'moon base\nlaser sword\nstreet food',
        hint: 'Optional. One prompt per line; prompts must match the selected word count.',
      },
    ],
  },
  wordduel: {
    name: 'Word Duel',
    Component: WordDuel,
    thumbnail: WordDuelThumb,
    accent: '#5fbf86',
    rules: 'Guess the hidden word faster and use letter feedback to narrow the answer.',
  },
  battleship: {
    name: 'Battleship',
    Component: Battleship,
    thumbnail: BattleshipThumb,
    accent: '#4b9bd8',
    rules: 'Place your fleet, fire at the enemy grid, and sink every ship.',
    modes: [
      { id: 'classic', name: 'Classic', hint: 'One shot per turn.' },
      { id: 'salvo', name: 'Salvo', hint: 'Fire one shot per surviving ship, resolved together.' },
    ],
  },
  checkers: {
    name: 'Checkers',
    Component: Checkers,
    thumbnail: CheckersThumb,
    accent: '#e8806a',
    rules: 'Move diagonally, take forced captures, and crown kings on the far edge.',
  },
  reversi: {
    name: 'Reversi',
    Component: Reversi,
    thumbnail: ReversiThumb,
    accent: '#2c8a57',
    rules: 'Place discs to bracket enemy pieces and own the most board space at the end.',
    botCap: 1,
  },
  dotsboxes: {
    name: 'Dots & Boxes',
    Component: DotsBoxes,
    thumbnail: DotsBoxesThumb,
    accent: '#f2b049',
    rules: 'Draw edges, complete boxes for points, and keep the turn when you score.',
    botCap: 1,
    modes: [
      { id: 'classic', name: 'Classic', hint: 'Play the full board.' },
      { id: 'race', name: 'Score Race', hint: 'First to a box majority wins.' },
      { id: 'sudden', name: 'Sudden Box', hint: 'First completed box wins instantly.' },
    ],
    options: [{ key: 'size', label: 'Board size', min: 3, max: 6, default: 4 }],
  },
  boggle: {
    name: 'Boggle Race',
    Component: Boggle,
    thumbnail: BoggleThumb,
    accent: '#3fc7ad',
    rules: 'Trace connected letters into words before the timer runs out.',
    maxPlayers: 6,
    modes: [
      { id: 'random', name: 'Random Board', hint: 'Fresh board each match.' },
      { id: 'daily', name: 'Daily Board', hint: 'Same seeded board for everyone today.' },
    ],
  },
  codenames: {
    name: 'Codenames Lite',
    Component: Codenames,
    thumbnail: CodenamesThumb,
    accent: '#5b8cff',
    rules: 'Give clues, vote on cards, and avoid the assassin while finding your team words.',
    maxPlayers: 4,
    botCap: 3,
    modes: [
      { id: 'classic', name: 'Classic Deck', hint: 'Original broad word list.' },
      { id: 'mythic', name: 'Mythic Deck', hint: 'Fantasy and adventure words.' },
      { id: 'tech', name: 'Tech Deck', hint: 'Software and sci-fi words.' },
    ],
  },
  uno: {
    name: 'Color Cards',
    Component: Uno,
    thumbnail: UnoThumb,
    accent: '#e85f70',
    rules: 'Match color or value, use action cards, and empty your hand first.',
    maxPlayers: 6,
    botCap: 5,
  },
  microchess: {
    name: 'Micro Chess',
    Component: MicroChess,
    thumbnail: MicroChessThumb,
    accent: '#3fc7ad',
    rules: 'Play a compact chess duel: capture, promote, and checkmate on a 5x5 board.',
    botCap: 1,
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
  rules: g.rules || '',
  minPlayers: g.minPlayers || 2,
  botCap: g.botCap || 0,
  maxPlayers: g.maxPlayers || 2,
}));
