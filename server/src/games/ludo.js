// Ludo — 2–4 player, server-authoritative, turn-based. Token "progress" 0..57:
// 0 base, 1..51 shared loop (from own color start), 52..57 home column, 57 goal.
export const START = [0, 13, 26, 39];
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const SEAT_COLORS = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };

// Absolute loop index (0..51) of a token at `progress` for `color`; -1 if not on the loop.
export function loopCell(color, progress) {
  if (progress < 1 || progress > 51) return -1;
  return (START[color] + (progress - 1)) % 52;
}

export function createInitialState(_options, seatCount = 2) {
  const n = Math.max(2, Math.min(4, seatCount));
  const colors = SEAT_COLORS[n];
  return {
    seatCount: n,
    colors,
    players: colors.map((color) => ({ color, tokens: [0, 0, 0, 0] })),
    current: 0,
    phase: 'roll',
    dice: null,
    movable: [],
    sixesInRow: 0,
    finishedOrder: [],
    lastEvent: null,
  };
}

export function applyMove() { return { error: 'not implemented' }; }
export function getResult() { return { over: false, winner: null, draw: false }; }

export default {
  id: 'ludo', name: 'Ludo', type: 'turn-based',
  minPlayers: 2, maxPlayers: 4,
  createInitialState, applyMove, getResult,
};
