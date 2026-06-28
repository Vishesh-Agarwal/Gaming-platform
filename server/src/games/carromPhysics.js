// server/src/games/carromPhysics.js
// Pure 2D rigid-disc physics for Carrom. No game rules live here — just Newton.
// Coordinate space: x right, y down (canvas convention). The board is a square
// with pockets at the four inset corners. Determinism: pure float math, no RNG,
// so the same input always yields the same result (used by the rules layer and
// unit tests).

export const BOARD = { W: 900, H: 900, inset: 72, coinR: 18, strikerR: 22, pocketR: 34 };

export const POCKETS = [
  { x: BOARD.inset, y: BOARD.inset },
  { x: BOARD.W - BOARD.inset, y: BOARD.inset },
  { x: BOARD.inset, y: BOARD.H - BOARD.inset },
  { x: BOARD.W - BOARD.inset, y: BOARD.H - BOARD.inset },
];

// The collision/friction/pocket solver now lives in the shared discPhysics module.
// Carrom is one geometry config for it: a square board with 4 corner pockets.
import { simulateShot as solve } from './discPhysics.js';

const TABLE = {
  bounds: { loX: BOARD.inset, hiX: BOARD.W - BOARD.inset, loY: BOARD.inset, hiY: BOARD.H - BOARD.inset },
  pockets: POCKETS.map((p) => ({ x: p.x, y: p.y, r: BOARD.pocketR })),
  friction: 0.985,
  stopV: 0.06,
  restitution: 0.92,
  wallRest: 0.7,
  maxSteps: 3000,
  frameEvery: 2,
};

// Carrom's public API is unchanged: frames and pocketed carry `color` (looked up
// by id), finalDiscs keep every input field (color/r/mass ride through the solver).
export function simulateShot(discs) {
  const colorById = new Map(discs.map((d) => [d.id, d.color]));
  const { frames, finalDiscs, pocketed } = solve(discs, TABLE);
  return {
    frames: frames.map((f) => f.map((d) => ({ id: d.id, color: colorById.get(d.id), x: d.x, y: d.y }))),
    finalDiscs,
    pocketed: pocketed.map((p) => ({ id: p.id, color: colorById.get(p.id) })),
  };
}
