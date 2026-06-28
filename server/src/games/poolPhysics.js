// Pool table geometry config for the shared discPhysics solver. A 2:1 table with
// six pockets (four corners + two on the long-rail midpoints). No game rules here.
import { simulateShot as solve } from './discPhysics.js';

export const TABLE = { W: 1000, H: 500, inset: 46, ballR: 13, cornerR: 24, sideR: 22 };

const B = { loX: TABLE.inset, hiX: TABLE.W - TABLE.inset, loY: TABLE.inset, hiY: TABLE.H - TABLE.inset };

// Side pockets sit just outside the rail line so a ball rolling along the rail
// still falls in. Corners at the inset corners.
export const POCKETS = [
  { x: B.loX, y: B.loY, r: TABLE.cornerR },
  { x: TABLE.W / 2, y: B.loY - 4, r: TABLE.sideR },
  { x: B.hiX, y: B.loY, r: TABLE.cornerR },
  { x: B.loX, y: B.hiY, r: TABLE.cornerR },
  { x: TABLE.W / 2, y: B.hiY + 4, r: TABLE.sideR },
  { x: B.hiX, y: B.hiY, r: TABLE.cornerR },
];

const CFG = {
  bounds: B,
  pockets: POCKETS,
  friction: 0.985,
  stopV: 0.05,
  restitution: 0.94,
  wallRest: 0.75,
  maxSteps: 4000,
  frameEvery: 2,
};

export function simulateShot(discs) {
  return solve(discs, CFG);
}
