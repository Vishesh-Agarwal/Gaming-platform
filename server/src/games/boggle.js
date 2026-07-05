// Boggle Race - shared 4x4 letter grid, simultaneous word submissions.

import { BOGGLE_WORDS } from './boggleWords.js';

const SIZE = 4;
const ROUND_MS = 120000;
const DICT = new Set(BOGGLE_WORDS);
const DICE = 'AAEEGNABBJOOACHOPSDEILRXDELRVYEHRTVWEIOSSTELRTTYHIMNQUHLNNRZ';
const MODES = [
  { id: 'random', name: 'Random Board' },
  { id: 'daily', name: 'Daily Board' },
];

function nextRand(n) {
  return (Math.imul(n, 1664525) + 1013904223) >>> 0;
}

function makeGrid(seed) {
  let n = seed >>> 0;
  return Array.from({ length: SIZE * SIZE }, () => {
    n = nextRand(n);
    return DICE[n % DICE.length];
  });
}

function scoreWord(word) {
  if (word.length <= 4) return 1;
  if (word.length === 5) return 2;
  if (word.length === 6) return 3;
  if (word.length === 7) return 5;
  return 11;
}

function neighbors(pos) {
  const r = Math.floor(pos / SIZE);
  const c = pos % SIZE;
  const out = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) out.push(nr * SIZE + nc);
    }
  }
  return out;
}

export function canSpell(grid, word) {
  const letters = word.toUpperCase().split('');
  function dfs(pos, i, used) {
    if (grid[pos] !== letters[i]) return false;
    if (i === letters.length - 1) return true;
    used.add(pos);
    for (const n of neighbors(pos)) {
      if (!used.has(n) && dfs(n, i + 1, used)) return true;
    }
    used.delete(pos);
    return false;
  }
  return grid.some((letter, pos) => letter === letters[0] && dfs(pos, 0, new Set()));
}

function wordsOnBoard(grid) {
  return [...DICT].filter((word) => canSpell(grid, word)).sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function dailySeed() {
  const d = new Date();
  return Number(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`);
}

export function createInitialState(options, seatCount = 2) {
  const seats = Math.max(2, Math.min(6, Number(seatCount) || 2));
  const mode = options?.mode === 'daily' ? 'daily' : 'random';
  const seed = mode === 'daily' ? dailySeed() : Math.floor(Math.random() * 0xffffffff);
  return {
    mode,
    size: SIZE,
    grid: makeGrid(seed),
    phase: 'playing',
    turn: 0,
    submissions: Array.from({ length: seats }, () => []),
    found: Array.from({ length: seats }, () => []),
    scores: Array(seats).fill(0),
    log: [],
    possibleWords: null,
    seq: 0,
  };
}

export function applyMove(state, seat, move) {
  if (state.phase === 'done') return { error: 'Round is over.' };
  const word = String(move?.word || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (word.length < 3) return { error: 'Words need at least 3 letters.' };
  if (!DICT.has(word)) return { error: 'Word is not in the list.' };
  if (!canSpell(state.grid, word)) return { error: 'Word is not on the board.' };
  if (state.found[seat]?.includes(word)) return { error: 'You already found that word.' };

  const found = state.found.map((arr) => arr.slice());
  const submissions = state.submissions.map((arr) => arr.slice());
  const scores = state.scores.slice();
  found[seat].push(word);
  submissions[seat].push({ word, points: scoreWord(word) });
  scores[seat] += scoreWord(word);
  return {
    state: {
      ...state,
      found,
      submissions,
      scores,
      log: [...state.log.slice(-20), { seat, word, points: scoreWord(word) }],
      seq: state.seq + 1,
    },
  };
}

export function onTimeout(state) {
  return { state: { ...state, phase: 'done', possibleWords: wordsOnBoard(state.grid), seq: state.seq + 1 } };
}

export function getResult(state) {
  if (state.phase !== 'done') return { over: false, winner: null, draw: false, scores: state.scores };
  const best = Math.max(...state.scores);
  const winners = state.scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  return { over: true, winner: winners.length === 1 ? winners[0] : null, draw: winners.length !== 1, scores: state.scores };
}

export default {
  id: 'boggle',
  name: 'Boggle Race',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 6,
  modes: MODES,
  turnTimeoutMs: ROUND_MS,
  createInitialState,
  applyMove,
  getResult,
  onTimeout,
};
