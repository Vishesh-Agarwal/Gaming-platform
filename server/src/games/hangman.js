// Hangman — 2-player word-setter duel, scored over N rounds. Pure, authoritative.
// A round = two legs: leg 0 (P0 sets / P1 guesses), leg 1 (P1 sets / P0 guesses),
// so each player guesses once per round. The setter also gives a hint (public).
// Scoring per leg: solve -> 10 - wrong, miss -> 0. Highest total after N rounds wins.
//
// The secret word lives in state.secret, which rooms.publicRoom strips before
// broadcasting; the hint is public so the guesser sees it.

import { randomWord, isCategory } from './hangmanWords.js';

const MAX_WRONG = 6;
const MIN_LEN = 3;
const MAX_LEN = 12;
const MAX_HINT = 60;
const DEFAULT_ROUNDS = 3;
const MAX_ROUNDS = 10;

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function emptyBoard() {
  return { hint: null, category: null, wordLength: 0, revealed: [], guessed: [], wrong: 0, secret: null };
}

function createInitialState(options) {
  let rounds = parseInt(options?.rounds, 10);
  if (!Number.isFinite(rounds)) rounds = DEFAULT_ROUNDS;
  rounds = clampN(rounds, 1, MAX_ROUNDS);
  return {
    totalRounds: rounds,
    round: 1,
    leg: 0,
    phase: 'setting',
    setter: 0,
    guesser: 1,
    turn: 0,
    maxWrong: MAX_WRONG,
    scores: [0, 0],
    roundPoints: [0, 0],
    legResult: null,
    history: [],
    seq: 0,
    ...emptyBoard(),
  };
}

const bump = (state, extra) => ({ ...state, ...extra, seq: (state.seq || 0) + 1 });

// move = { word, hint } (setting) | { letter } (guessing) | { next:true } (between)
function applyMove(state, playerIndex, move) {
  if (getResult(state).over) return { error: 'Game is already over.' };

  if (state.phase === 'legover' || state.phase === 'roundover') {
    if (!move?.next) return { error: 'Hold on — tap continue.' };
    return { state: advance(state) };
  }

  if (state.turn !== playerIndex) return { error: 'Not your turn.' };

  if (state.phase === 'setting') {
    // Setter can type a word, or pull a random one from the word bank (optionally
    // from a chosen category). The category is public; it doubles as a default hint.
    let word, hint, category;
    if (move?.random) {
      const r = randomWord(move?.category);
      word = r.word;
      category = r.category;
      hint = String(move?.hint || '').trim().slice(0, MAX_HINT) || r.hint;
    } else {
      word = String(move?.word || '').toUpperCase().replace(/[^A-Z]/g, '');
      hint = String(move?.hint || '').trim().slice(0, MAX_HINT);
      category = isCategory(move?.category) ? move.category : null;
    }
    if (word.length < MIN_LEN || word.length > MAX_LEN) {
      return { error: `Word must be ${MIN_LEN}–${MAX_LEN} letters (A–Z only).` };
    }
    if (!hint) return { error: 'Give your opponent a hint.' };
    return {
      state: bump(state, {
        secret: { word },
        hint,
        category,
        wordLength: word.length,
        revealed: Array(word.length).fill(null),
        guessed: [],
        wrong: 0,
        phase: 'guessing',
        turn: state.guesser,
      }),
    };
  }

  // guessing
  const letter = String(move?.letter || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (letter.length !== 1) return { error: 'Guess a single letter.' };
  if (state.guessed.includes(letter)) return { error: 'Already guessed that letter.' };

  const word = state.secret.word;
  const guessed = [...state.guessed, letter];
  let revealed = state.revealed;
  let wrong = state.wrong;
  if (word.includes(letter)) {
    revealed = word.split('').map((ch, i) => (ch === letter ? ch : state.revealed[i]));
  } else {
    wrong += 1;
  }

  const solved = revealed.every((c) => c !== null);
  const failed = wrong >= state.maxWrong;
  if (!solved && !failed) return { state: bump(state, { guessed, revealed, wrong }) };

  // leg over: score it, freeze the board, reveal the word
  const points = solved ? Math.max(0, 10 - wrong) : 0;
  const scores = state.scores.slice();
  scores[state.guesser] += points;
  const roundPoints = state.roundPoints.slice();
  roundPoints[state.guesser] = points;
  return {
    state: bump(state, {
      guessed,
      revealed,
      wrong,
      scores,
      roundPoints,
      secret: null,
      phase: 'legover',
      legResult: { guesser: state.guesser, solved, wrong, word, points },
    }),
  };
}

// Advance out of a legover / roundover pause.
function advance(state) {
  if (state.phase === 'legover') {
    if (state.leg === 0) {
      // -> leg 1: roles swap, P1 sets
      return bump(state, {
        leg: 1,
        setter: 1,
        guesser: 0,
        turn: 1,
        phase: 'setting',
        legResult: null,
        ...emptyBoard(),
      });
    }
    // leg 1 done -> close the round
    const history = [
      ...state.history,
      { round: state.round, points: state.roundPoints.slice(), totals: state.scores.slice() },
    ];
    if (state.round < state.totalRounds) {
      return bump(state, { phase: 'roundover', legResult: null, history });
    }
    return bump(state, { phase: 'done', legResult: null, history });
  }

  // roundover -> next round
  return bump(state, {
    round: state.round + 1,
    leg: 0,
    setter: 0,
    guesser: 1,
    turn: 0,
    phase: 'setting',
    roundPoints: [0, 0],
    ...emptyBoard(),
  });
}

function getResult(state) {
  if (state.phase !== 'done') return { over: false, winner: null, draw: false, scores: state.scores };
  const [a, b] = state.scores;
  const winner = a === b ? null : a > b ? 0 : 1;
  return { over: true, winner, draw: winner === null, scores: state.scores };
}

export default {
  id: 'hangman',
  name: 'Hangman',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  optionsSpec: { rounds: { type: 'int', min: 1, max: MAX_ROUNDS, default: DEFAULT_ROUNDS, label: 'Rounds' } },
  createInitialState,
  applyMove,
  getResult,
};
