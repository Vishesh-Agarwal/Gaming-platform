// Ludo board geometry on a 0-indexed 15x15 grid. Pure data + helpers (NO three,
// NO server imports) so the server node --test runner can load it.
// Colors: 0 red (top-left), 1 green (top-right), 2 yellow (bottom-right), 3 blue (bottom-left).

// 52 main-loop cells, clockwise. Start cells: red=0, green=13, yellow=26, blue=39.
export const LOOP_CELLS = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],          // 0-4   red start, left arm upper edge
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],  // 5-10  up the top arm's left edge
  [0, 7],                                          // 11    top middle
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],  // 12-17 down (green start at 13)
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], // 18-23 right arm upper edge
  [7, 14],                                         // 24    right middle
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // 25-30 right arm lower edge (yellow 26)
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], // 31-36 down the bottom arm's right edge
  [14, 7],                                         // 37    bottom middle
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // 38-43 up (blue start at 39)
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],  // 44-49 left arm lower edge
  [7, 0], [6, 0],                                  // 50-51 left middle back to start
];

// Private home columns (progress 52..57), entered from each color's loop cell at progress 51.
export const HOME_COLUMN = {
  0: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],     // red, inward from left
  1: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],     // green, inward from top
  2: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]], // yellow, inward from right
  3: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]], // blue, inward from bottom
};

// Four parking slots in each color's corner base (token index -> cell).
export const BASE_SLOTS = {
  0: [[1, 1], [1, 3], [3, 1], [3, 3]],         // red top-left
  1: [[1, 11], [1, 13], [3, 11], [3, 13]],     // green top-right
  2: [[11, 11], [11, 13], [13, 11], [13, 13]], // yellow bottom-right
  3: [[11, 1], [11, 3], [13, 1], [13, 3]],     // blue bottom-left
};

export const CENTER = [7, 7];

const START = [0, 13, 26, 39];

// Grid cell for a token of `color` at `progress`. Returns null for base (progress 0) —
// the caller renders base tokens from BASE_SLOTS[color][tokenIndex].
export function cellFor(color, progress) {
  if (progress <= 0) return null;
  if (progress <= 51) return LOOP_CELLS[(START[color] + (progress - 1)) % 52];
  return HOME_COLUMN[color][progress - 52]; // 52..57
}
