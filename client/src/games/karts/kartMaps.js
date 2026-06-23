// Shared, deterministic Smash Karts map data. Keep this file byte-identical to its
// client copy (client/src/games/karts/kartMaps.js); a test asserts they match.
// Obstacles: {kind:'box',x,z,w,d,top?} (box.top = mesa height, default 3; the box is a
//            solid wall below its top and a drivable floor at/above it) |
//            {kind:'cyl',x,z,r} (solid pillar, never drivable on top).
// ramps: {kind:'wedge',x,z,w,d,axis:'x'|'z',loY,hiY} — a linear slope across the
//        footprint along `axis`; the low end sits at x|z minus half the footprint
//        length, the high end at x|z plus half the footprint length. Place a ramp's
//        high end abutting a mesa's footprint edge (with matching hiY === box.top)
//        so the mesa is actually climbable; otherwise the ramp just ends in a cliff
//        (fine for a launch ramp, e.g. launchpad's gap jump).
// hazards: {x,z,r,dmg} (server-side damage; 999 = instakill). boosts: {x,z,r,strength}.
// spawns: {x,z,heading}. pads: [x,z] weapon-crate locations.
export const MAPS = {
  arena: {
    id: 'arena', name: 'Open Arena', arena: { w: 80, d: 80 },
    obstacles: [{ kind: 'box', x: 0, z: 0, w: 16, d: 16, top: 4 }],
    ramps: [
      { kind: 'wedge', x: 0, z: -12, w: 10, d: 8, axis: 'z', loY: 0, hiY: 4 },
      { kind: 'wedge', x: 0, z: 12, w: 10, d: 8, axis: 'z', loY: 4, hiY: 0 },
    ],
    hazards: [], boosts: [],
    spawns: [
      { x: 22, z: 0, heading: -1.5708 },
      { x: 0, z: 22, heading: 3.1416 },
      { x: -22, z: 0, heading: 1.5708 },
      { x: 0, z: -22, heading: 0 },
    ],
    pads: [[0, 18], [-24, -24], [24, -24], [-24, 24], [24, 24]],
  },
  pillars: {
    id: 'pillars', name: 'Pillars', arena: { w: 80, d: 80 },
    obstacles: [
      { kind: 'cyl', x: 0, z: 0, r: 4 },
      { kind: 'cyl', x: -18, z: -18, r: 3 },
      { kind: 'cyl', x: 18, z: -18, r: 3 },
      { kind: 'cyl', x: -18, z: 18, r: 3 },
      { kind: 'cyl', x: 18, z: 18, r: 3 },
      { kind: 'box', x: -30, z: -22, w: 12, d: 10, top: 3 },
    ],
    ramps: [{ kind: 'wedge', x: -30, z: -9.5, w: 12, d: 15, axis: 'z', loY: 3, hiY: 0 }],
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
    pads: [[-26, -32], [26, -26], [-26, 26], [26, 26], [0, 30]],
  },
  gauntlet: {
    id: 'gauntlet', name: 'Gauntlet', arena: { w: 90, d: 70 },
    obstacles: [
      { kind: 'box', x: -12, z: -10, w: 36, d: 5, top: 4 },
      { kind: 'box', x: 12, z: 10, w: 36, d: 5, top: 4 },
    ],
    ramps: [
      { kind: 'wedge', x: -36, z: -10, w: 12, d: 5, axis: 'x', loY: 0, hiY: 4 },
      { kind: 'wedge', x: 36, z: 10, w: 12, d: 5, axis: 'x', loY: 4, hiY: 0 },
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
  launchpad: {
    id: 'launchpad', name: 'Launchpad', arena: { w: 90, d: 90 },
    obstacles: [{ kind: 'box', x: 0, z: 26, w: 24, d: 18, top: 5 }],
    ramps: [{ kind: 'wedge', x: 0, z: -6, w: 12, d: 16, axis: 'z', loY: 0, hiY: 6 }],
    hazards: [{ x: 0, z: 8, r: 8, dmg: 40 }],
    boosts: [{ x: 0, z: -28, r: 6, strength: 45 }],
    spawns: [
      { x: -34, z: -34, heading: 0.78 },
      { x: 34, z: -34, heading: -0.78 },
      { x: -34, z: 34, heading: 2.36 },
      { x: 34, z: 34, heading: -2.36 },
    ],
    pads: [[-34, 0], [34, 0], [0, -34], [0, 40]],
  },
};

export const DEFAULT_MAP = 'arena';
export function getMap(id) { return MAPS[id] || MAPS[DEFAULT_MAP]; }
export function listMaps() { return Object.values(MAPS).map((m) => ({ id: m.id, name: m.name })); }
