// Shared, deterministic Smash Karts map data. Keep this file byte-identical to its
// client copy (client/src/games/karts/kartMaps.js); a test asserts they match.
// Obstacles: {kind:'box',x,z,w,d,top?} (box.top = mesa height, default 3; the box is a
//            SOLID WALL below its top — KART_R push-out applies whenever the kart's
//            y < top — and only becomes a drivable floor once the kart is at/above
//            that top. A grounded kart driving toward a box can NEVER climb onto it;
//            box mesas are only reachable by landing on top from the air (see
//            launchpad). For any mesa you want to be drive-up climbable, use a flat
//            wedge plateau in `ramps` instead — see below.) |
//            {kind:'cyl',x,z,r} (solid pillar, never drivable on top, no top access).
// ramps: {kind:'wedge',x,z,w,d,axis:'x'|'z',loY,hiY} — lives in `ramps`, not
//        `obstacles`, so it has NO wall push-out; it only contributes to
//        surfaceHeight. A linear slope runs across the footprint along `axis`: the
//        low end sits at x|z minus half the footprint length, the high end at x|z
//        plus half the footprint length. Setting loY === hiY makes a FLAT PLATEAU —
//        the standard way to build a drive-up climbable mesa. Chain a sloped
//        connector wedge (loY 0 -> hiY H) into a flat plateau wedge (loY=hiY=H) by
//        making their footprints share an edge at matching height H (overlap is
//        fine; surfaceHeight takes the max), so a grounded kart drives up the slope
//        and seamlessly onto the plateau with no wall in the way.
// boosts: {x,z,r,strength}.
// spawns: {x,z,heading}. pads: [x,z] weapon-crate locations.
export const MAPS = {
  arena: {
    id: 'arena', name: 'Open Arena', arena: { w: 80, d: 80 },
    obstacles: [],
    ramps: [
      // flat plateau mesa (x:-8..8, z:-8..8), height 4 — climbable, no walls
      { kind: 'wedge', x: 0, z: 0, w: 16, d: 16, axis: 'z', loY: 4, hiY: 4 },
      // connector ramps: high edge (hiY=4) abuts the plateau edge at z=-8/z=8
      { kind: 'wedge', x: 0, z: -12, w: 10, d: 8, axis: 'z', loY: 0, hiY: 4 },
      { kind: 'wedge', x: 0, z: 12, w: 10, d: 8, axis: 'z', loY: 4, hiY: 0 },
    ],
    boosts: [],
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
    ],
    ramps: [
      // flat plateau mesa (x:-36..-24, z:-27..-17), height 3 — climbable, no walls
      { kind: 'wedge', x: -30, z: -22, w: 12, d: 10, axis: 'z', loY: 3, hiY: 3 },
      // connector ramp: high edge (loY=3 at z=-17) abuts the plateau's z=-17 edge
      { kind: 'wedge', x: -30, z: -9.5, w: 12, d: 15, axis: 'z', loY: 3, hiY: 0 },
    ],
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
    obstacles: [],
    ramps: [
      // flat plateau mesas (raised "walls" from the brief), height 4 — climbable
      { kind: 'wedge', x: -12, z: -10, w: 36, d: 5, axis: 'x', loY: 4, hiY: 4 },
      { kind: 'wedge', x: 12, z: 10, w: 36, d: 5, axis: 'x', loY: 4, hiY: 4 },
      // connector ramps: high edge abuts each plateau's outer x edge at matching height 4
      { kind: 'wedge', x: -36, z: -10, w: 12, d: 5, axis: 'x', loY: 0, hiY: 4 },
      { kind: 'wedge', x: 36, z: 10, w: 12, d: 5, axis: 'x', loY: 4, hiY: 0 },
    ],
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
    boosts: [{ x: 0, z: -28, r: 6, strength: 45 }],
    spawns: [
      { x: -34, z: -34, heading: 0.78 },
      { x: 34, z: -34, heading: -0.78 },
      { x: -34, z: 34, heading: 2.36 },
      { x: 34, z: 34, heading: -2.36 },
    ],
    pads: [[-34, 0], [34, 0], [0, -34], [0, 40]],
  },
  coliseum: {
    id: 'coliseum', name: 'Coliseum', arena: { w: 110, d: 110 },
    obstacles: [
      // pillar cover (LOS breaks for the auto-MG)
      { kind: 'cyl', x: -32, z: -16, r: 3 },
      { kind: 'cyl', x: 32, z: -16, r: 3 },
      { kind: 'cyl', x: -32, z: 16, r: 3 },
      { kind: 'cyl', x: 32, z: 16, r: 3 },
      // low box cover near each spawn zone
      { kind: 'box', x: 0, z: -34, w: 16, d: 4 },
      { kind: 'box', x: 0, z: 34, w: 16, d: 4 },
    ],
    ramps: [
      // central climbable plateau (x:-10..10, z:-10..10), height 4
      { kind: 'wedge', x: 0, z: 0, w: 20, d: 20, axis: 'z', loY: 4, hiY: 4 },
      // north connector ramp: high edge (4) abuts plateau z=-10
      { kind: 'wedge', x: 0, z: -17, w: 12, d: 14, axis: 'z', loY: 0, hiY: 4 },
      // south connector ramp: high edge (4) abuts plateau z=10
      { kind: 'wedge', x: 0, z: 17, w: 12, d: 14, axis: 'z', loY: 4, hiY: 0 },
    ],
    boosts: [
      { x: 0, z: -42, r: 5, strength: 46 },
      { x: 0, z: 42, r: 5, strength: 46 },
    ],
    spawns: [
      { x: -30, z: -46, heading: 0 },
      { x: -10, z: -46, heading: 0 },
      { x: 10, z: -46, heading: 0 },
      { x: 30, z: -46, heading: 0 },
      { x: -30, z: 46, heading: 3.1416 },
      { x: -10, z: 46, heading: 3.1416 },
      { x: 10, z: 46, heading: 3.1416 },
      { x: 30, z: 46, heading: 3.1416 },
    ],
    pads: [[-18, 0], [18, 0], [-42, 0], [42, 0], [-22, -22], [22, 22]],
  },
  carnival: {
    id: 'carnival', name: 'Desert Carnival', theme: 'carnival', arena: { w: 200, d: 200 },
    obstacles: [
      // round landmarks (tagged for the carnival renderer)
      { kind: 'cyl', x: 0, z: -62, r: 7, prop: 'ferris' },
      { kind: 'cyl', x: -62, z: 0, r: 6, prop: 'carousel' },
      { kind: 'cyl', x: 62, z: 0, r: 5, prop: 'fountain' },
      { kind: 'cyl', x: 0, z: 62, r: 6, prop: 'carousel' },
      // tent clusters (quadrants)
      { kind: 'box', x: -45, z: -45, w: 8, d: 8 },
      { kind: 'box', x: -30, z: -58, w: 7, d: 7 },
      { kind: 'box', x: 45, z: -45, w: 8, d: 8 },
      { kind: 'box', x: 30, z: -58, w: 7, d: 7 },
      { kind: 'box', x: -45, z: 45, w: 8, d: 8 },
      { kind: 'box', x: -30, z: 58, w: 7, d: 7 },
      { kind: 'box', x: 45, z: 45, w: 8, d: 8 },
      { kind: 'box', x: 30, z: 58, w: 7, d: 7 },
      // ticket booths near the side edges
      { kind: 'box', x: -82, z: -22, w: 6, d: 6 },
      { kind: 'box', x: 82, z: -22, w: 6, d: 6 },
      { kind: 'box', x: -82, z: 22, w: 6, d: 6 },
      { kind: 'box', x: 82, z: 22, w: 6, d: 6 },
    ],
    ramps: [
      // central drive-up stage plateau (x:-15..15, z:-15..15), height 5
      { kind: 'wedge', x: 0, z: 0, w: 30, d: 30, axis: 'z', loY: 5, hiY: 5 },
      // north connector ramp: high edge (5) abuts plateau z=-15
      { kind: 'wedge', x: 0, z: -23, w: 14, d: 16, axis: 'z', loY: 0, hiY: 5 },
      // south connector ramp: high edge (5) abuts plateau z=15
      { kind: 'wedge', x: 0, z: 23, w: 14, d: 16, axis: 'z', loY: 5, hiY: 0 },
    ],
    boosts: [
      { x: -22, z: -40, r: 6, strength: 46 },
      { x: 22, z: -40, r: 6, strength: 46 },
      { x: -22, z: 40, r: 6, strength: 46 },
      { x: 22, z: 40, r: 6, strength: 46 },
    ],
    spawns: [
      { x: -70, z: -85, heading: 0 },
      { x: -24, z: -85, heading: 0 },
      { x: 24, z: -85, heading: 0 },
      { x: 70, z: -85, heading: 0 },
      { x: -70, z: 85, heading: 3.1416 },
      { x: -24, z: 85, heading: 3.1416 },
      { x: 24, z: 85, heading: 3.1416 },
      { x: 70, z: 85, heading: 3.1416 },
    ],
    pads: [[0, -40], [0, 40], [-52, -18], [52, -18], [-52, 18], [52, 18], [-52, -72], [52, 72]],
    decor: [
      { kind: 'arch', x: 0, z: -92 },
      { kind: 'arch', x: 0, z: 92 },
      { kind: 'balloons', x: -88, z: -88 },
      { kind: 'balloons', x: 88, z: -88 },
      { kind: 'balloons', x: -88, z: 88 },
      { kind: 'balloons', x: 88, z: 88 },
      { kind: 'bunting', x: -40, z: -78, x2: 40, z2: -78 },
      { kind: 'bunting', x: -40, z: 78, x2: 40, z2: 78 },
    ],
  },
};

export const DEFAULT_MAP = 'arena';
export function getMap(id) { return MAPS[id] || MAPS[DEFAULT_MAP]; }
export function listMaps() { return Object.values(MAPS).map((m) => ({ id: m.id, name: m.name })); }
