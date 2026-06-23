// Shared, deterministic Smash Karts map data. Keep this file byte-identical to its
// server copy (server/src/games/kartMaps.js); a test asserts they match.
// Obstacles: {kind:'box',x,z,w,d} (axis-aligned) | {kind:'cyl',x,z,r}.
// hazards: {x,z,r,dmg} (server-side damage; 999 = instakill). boosts: {x,z,r,strength}.
// spawns: {x,z,heading}. pads: [x,z] weapon-crate locations.
export const MAPS = {
  arena: {
    id: 'arena', name: 'Open Arena', arena: { w: 80, d: 80 },
    obstacles: [], hazards: [], boosts: [],
    spawns: [
      { x: 22, z: 0, heading: -1.5708 },
      { x: 0, z: 22, heading: 3.1416 },
      { x: -22, z: 0, heading: 1.5708 },
      { x: 0, z: -22, heading: 0 },
    ],
    pads: [[0, 0], [-24, -24], [24, -24], [-24, 24], [24, 24]],
  },
  pillars: {
    id: 'pillars', name: 'Pillars', arena: { w: 80, d: 80 },
    obstacles: [
      { kind: 'cyl', x: 0, z: 0, r: 4 },
      { kind: 'cyl', x: -18, z: -18, r: 3 },
      { kind: 'cyl', x: 18, z: -18, r: 3 },
      { kind: 'cyl', x: -18, z: 18, r: 3 },
      { kind: 'cyl', x: 18, z: 18, r: 3 },
    ],
    hazards: [],
    boosts: [
      { x: -30, z: 0, r: 5, strength: 42 },
      { x: 30, z: 0, r: 5, strength: 42 },
    ],
    spawns: [
      { x: 22, z: 0, heading: -1.5708 },
      { x: 0, z: 22, heading: 3.1416 },
      { x: -22, z: 0, heading: 1.5708 },
      { x: 0, z: -22, heading: 0 },
    ],
    pads: [[-26, -26], [26, -26], [-26, 26], [26, 26], [0, 30]],
  },
  gauntlet: {
    id: 'gauntlet', name: 'Gauntlet', arena: { w: 90, d: 70 },
    obstacles: [
      { kind: 'box', x: -12, z: -10, w: 36, d: 5 },
      { kind: 'box', x: 12, z: 10, w: 36, d: 5 },
    ],
    hazards: [{ x: 0, z: -25, r: 7, dmg: 40 }],
    boosts: [{ x: 0, z: 25, r: 6, strength: 45 }],
    spawns: [
      { x: -38, z: -30, heading: 0.9028 },
      { x: 38, z: -30, heading: -0.9028 },
      { x: -38, z: 30, heading: 2.2389 },
      { x: 38, z: 30, heading: -2.2389 },
    ],
    pads: [[0, 0], [-35, 0], [35, 0], [-15, 28], [15, -28]],
  },
};

export const DEFAULT_MAP = 'arena';
export function getMap(id) { return MAPS[id] || MAPS[DEFAULT_MAP]; }
export function listMaps() { return Object.values(MAPS).map((m) => ({ id: m.id, name: m.name })); }
