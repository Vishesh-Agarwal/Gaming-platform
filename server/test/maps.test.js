import { test } from 'node:test';
import assert from 'node:assert/strict';
import karts from '../src/games/karts.js';
import { getMap, MAPS, listMaps } from '../src/games/kartMaps.js';
import { integrateKart, SIM_DT, surfaceHeight } from '../src/games/kartPhysics.js';

const { createSim, createInitialState, step } = karts;

test('createInitialState carries the chosen map + arena', () => {
  const st = createInitialState({ map: 'gauntlet' });
  assert.equal(st.mapId, 'gauntlet');
  assert.deepEqual(st.arena, getMap('gauntlet').arena);
});

test('createSim seeds spawns + crate pads from the map', () => {
  const sim = createSim([{}, {}], 0, { map: 'pillars' });
  const m = getMap('pillars');
  assert.equal(sim.mapId, 'pillars');
  assert.equal(sim.crates.length, m.pads.length);
  assert.deepEqual({ x: sim.karts[0].x, z: sim.karts[0].z }, { x: m.spawns[0].x, z: m.spawns[0].z });
});

test('default map (no options) preserves the open arena', () => {
  const sim = createSim([{}, {}], 0);
  assert.equal(sim.mapId, 'arena');
  assert.equal(sim.crates.length, 5);
});

test('launchpad map exists and is listed', () => {
  assert.ok(MAPS.launchpad, 'launchpad registered');
  assert.ok(listMaps().some((m) => m.id === 'launchpad'));
});

test('every spawn and pad sits on open, drivable ground (not inside a box/cyl/ramp footprint)', () => {
  for (const id of Object.keys(MAPS)) {
    const m = MAPS[id];
    const insideBox = (x, z) => (m.obstacles || []).some((o) => {
      if (o.kind !== 'box') return false;
      const hw = o.w / 2, hd = o.d / 2;
      return x >= o.x - hw && x <= o.x + hw && z >= o.z - hd && z <= o.z + hd;
    });
    const insideCyl = (x, z) => (m.obstacles || []).some((o) =>
      o.kind === 'cyl' && Math.hypot(x - o.x, z - o.z) < o.r + 2.2);
    const insideRamp = (x, z) => (m.ramps || []).some((r) => {
      const hw = r.w / 2, hd = r.d / 2;
      return x >= r.x - hw && x <= r.x + hw && z >= r.z - hd && z <= r.z + hd;
    });
    for (const s of m.spawns) {
      assert.ok(!insideBox(s.x, s.z), `${id} spawn (${s.x},${s.z}) inside a box`);
      assert.ok(!insideCyl(s.x, s.z), `${id} spawn (${s.x},${s.z}) inside a cyl`);
      assert.ok(!insideRamp(s.x, s.z), `${id} spawn (${s.x},${s.z}) inside a ramp`);
    }
    for (const [x, z] of m.pads) {
      assert.ok(!insideBox(x, z), `${id} pad (${x},${z}) inside a box`);
      assert.ok(!insideCyl(x, z), `${id} pad (${x},${z}) inside a cyl`);
      assert.ok(!insideRamp(x, z), `${id} pad (${x},${z}) inside a ramp`);
    }
  }
});

test('elevated maps actually have ramps', () => {
  for (const id of ['gauntlet', 'launchpad']) {
    assert.ok((MAPS[id].ramps || []).length > 0, `${id} should have ramps`);
  }
});

// --- Reachability: drive-up plateaus must be climbable by a grounded kart ---
// Simulates a kart starting on open ground at a ramp's base, driving up the
// connector ramp onto the flat plateau, then braking once it detects it has
// arrived (so it settles on the plateau rather than coasting off the far
// edge). This fails against a `box` mesa (the kart gets wall-pinned below
// the box's `top` and never reaches the required height) and passes against
// a flat `wedge` plateau (no wall push-out — only surfaceHeight).
function inFootprint(r, x, z) {
  const hw = r.w / 2, hd = r.d / 2;
  return x >= r.x - hw && x <= r.x + hw && z >= r.z - hd && z <= r.z + hd;
}

function climbToPlateau(map, start, plateau, maxSteps = 200) {
  const k = {
    x: start.x, z: start.z, heading: start.heading, vel: 0,
    y: surfaceHeight(map, start.x, start.z), vy: 0, grounded: true,
  };
  const plateauY = plateau.loY; // flat plateau: loY === hiY
  for (let i = 0; i < maxSteps; i++) {
    const onPlateau = k.grounded && inFootprint(plateau, k.x, k.z) &&
      Math.abs(k.y - plateauY) < 0.15;
    const throttle = onPlateau ? (k.vel > 0.05 ? -1 : 0) : 1;
    integrateKart(k, { throttle, steer: 0 }, SIM_DT, map);
  }
  return k;
}

const REACHABILITY_CASES = [
  {
    id: 'arena', label: 'arena center mesa',
    start: { x: 0, z: -16, heading: 0 },
    plateau: () => MAPS.arena.ramps[0],
  },
  {
    id: 'pillars', label: 'pillars mesa',
    start: { x: -30, z: -8, heading: Math.PI },
    plateau: () => MAPS.pillars.ramps[0],
  },
  {
    id: 'gauntlet-west', label: 'gauntlet west mesa',
    start: { x: -41, z: -10, heading: Math.PI / 2 },
    plateau: () => MAPS.gauntlet.ramps[0],
  },
  {
    id: 'gauntlet-east', label: 'gauntlet east mesa',
    start: { x: 41, z: 10, heading: -Math.PI / 2 },
    plateau: () => MAPS.gauntlet.ramps[1],
  },
];

for (const c of REACHABILITY_CASES) {
  test(`reachability: ${c.label} is climbable by a grounded kart driving up its ramp`, () => {
    const map = MAPS[c.id.startsWith('gauntlet') ? 'gauntlet' : c.id];
    const plateau = c.plateau();
    assert.equal(plateau.loY, plateau.hiY, `${c.label} fixture must be a flat plateau wedge`);
    const k = climbToPlateau(map, c.start, plateau);
    assert.ok(k.y >= plateau.loY - 0.1, `${c.label}: expected y>=${plateau.loY - 0.1}, got ${k.y}`);
    assert.ok(k.grounded, `${c.label}: kart should have landed and be grounded`);
    assert.ok(inFootprint(plateau, k.x, k.z),
      `${c.label}: expected final (${k.x.toFixed(2)},${k.z.toFixed(2)}) inside plateau footprint`);
  });
}
