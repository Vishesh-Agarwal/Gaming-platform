// Word Duel - 2-player race to solve the same 5-letter word.
// The answer stays in state.secret and is revealed only when the match ends.

const ANSWERS = [
  'APPLE', 'BRAVE', 'CHAIR', 'DELTA', 'EAGLE', 'FLAME', 'GRAPE', 'HOUSE',
  'INDEX', 'JELLY', 'KNIFE', 'LEMON', 'MANGO', 'NURSE', 'OCEAN', 'PIANO',
  'QUILT', 'RIVER', 'SOLAR', 'TIGER', 'ULTRA', 'VIVID', 'WATER', 'YEAST',
  'ZEBRA', 'BREAD', 'CLOUD', 'DREAM', 'EARTH', 'FROST', 'GIANT', 'HONEY',
  'LASER', 'MAGIC', 'NIGHT', 'PEARL', 'ROBOT', 'STONE', 'TRAIN', 'WHALE',
];

const WORD_LEN = 5;
const MAX_GUESSES = 6;

function nextRand(n) {
  return (Math.imul(n, 1664525) + 1013904223) >>> 0;
}

function pickAnswer(seed) {
  return ANSWERS[nextRand(seed >>> 0) % ANSWERS.length];
}

function cleanGuess(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, WORD_LEN);
}

export function scoreGuess(guess, answer) {
  const marks = Array(WORD_LEN).fill('absent');
  const remaining = new Map();

  for (let i = 0; i < WORD_LEN; i += 1) {
    if (guess[i] === answer[i]) {
      marks[i] = 'correct';
    } else {
      remaining.set(answer[i], (remaining.get(answer[i]) || 0) + 1);
    }
  }

  for (let i = 0; i < WORD_LEN; i += 1) {
    if (marks[i] === 'correct') continue;
    const left = remaining.get(guess[i]) || 0;
    if (left > 0) {
      marks[i] = 'present';
      remaining.set(guess[i], left - 1);
    }
  }

  return marks;
}

export function createInitialState(options) {
  const seed = Number.isInteger(options?.seed) ? options.seed >>> 0 : Math.floor(Math.random() * 0xffffffff);
  return {
    seed,
    wordLength: WORD_LEN,
    maxGuesses: MAX_GUESSES,
    guesses: [[], []],
    locked: [false, false],
    hints: [[], []],
    bestMatches: [0, 0],
    streaks: [0, 0],
    scores: [0, 0],
    phase: 'playing',
    winner: null,
    draw: false,
    turn: null,
    seq: 0,
    secret: { answer: pickAnswer(seed) },
  };
}

export function applyMove(state, seat, move) {
  if (state.phase === 'done') return { error: 'Game is over.' };
  if (seat !== 0 && seat !== 1) return { error: 'Invalid player.' };
  if (state.locked[seat]) return { error: 'Your board is already finished.' };

  if (move?.type === 'hint') {
    const current = state.hints?.[seat] || [];
    if (current.length >= 2) return { error: 'No hints left.' };
    const used = new Set(current.map((h) => h.index));
    const index = Array.from({ length: WORD_LEN }, (_, i) => i).find((i) => !used.has(i));
    if (index == null) return { error: 'No hints left.' };
    const hints = (state.hints || [[], []]).map((rows) => rows.slice());
    hints[seat].push({ index, letter: state.secret.answer[index] });
    return { state: { ...state, hints, seq: state.seq + 1 } };
  }

  const guess = cleanGuess(move?.guess);
  if (guess.length !== WORD_LEN) return { error: `Guess a ${WORD_LEN}-letter word.` };
  if (state.guesses[seat].some((row) => row.guess === guess)) return { error: 'You already tried that word.' };

  const answer = state.secret.answer;
  const marks = scoreGuess(guess, answer);
  const matchScore = marks.reduce((sum, mark) => sum + (mark === 'correct' ? 2 : mark === 'present' ? 1 : 0), 0);
  const guesses = state.guesses.map((rows) => rows.slice());
  const bestMatches = (state.bestMatches || [0, 0]).slice();
  const streaks = (state.streaks || [0, 0]).slice();
  const improved = matchScore > bestMatches[seat];
  const priorStreak = streaks[seat] || 0;
  bestMatches[seat] = Math.max(bestMatches[seat], matchScore);
  streaks[seat] = improved ? priorStreak + 1 : 0;
  guesses[seat].push({ guess, marks, matchScore, improved, streak: streaks[seat] });
  const locked = state.locked.slice();
  const scores = state.scores.slice();

  const solved = guess === answer;
  if (solved) {
    locked[seat] = true;
    const hintPenalty = (state.hints?.[seat]?.length || 0) * 5;
    const streakBonus = priorStreak * 5;
    scores[seat] = Math.max(10, (MAX_GUESSES - guesses[seat].length + 1) * 10 + streakBonus - hintPenalty);
    return {
      state: {
        ...state,
        guesses,
        locked,
        bestMatches,
        streaks,
        scores,
        phase: 'done',
        winner: seat,
        draw: false,
        seq: state.seq + 1,
      },
    };
  }

  if (guesses[seat].length >= MAX_GUESSES) locked[seat] = true;
  const bothLocked = locked.every(Boolean);
  return {
    state: {
      ...state,
      guesses,
      locked,
      bestMatches,
      streaks,
      scores,
      phase: bothLocked ? 'done' : 'playing',
      winner: null,
      draw: bothLocked,
      seq: state.seq + 1,
    },
  };
}

export function getResult(state) {
  if (state.phase !== 'done') return { over: false, winner: null, draw: false, scores: state.scores };
  return { over: true, winner: state.winner, draw: state.draw, scores: state.scores };
}

export function publicState(state, seat = null) {
  const { secret, ...pub } = state;
  return {
    ...pub,
    hints: seat == null ? [[], []] : (state.hints?.[seat] || []),
    hintCounts: (state.hints || [[], []]).map((rows) => rows.length),
    answer: state.phase === 'done' ? secret?.answer || null : null,
  };
}

export default {
  id: 'wordduel',
  name: 'Word Duel',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  createInitialState,
  applyMove,
  getResult,
  publicState,
};
