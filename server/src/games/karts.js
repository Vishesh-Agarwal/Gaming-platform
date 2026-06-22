// Smash Karts — server-authoritative realtime kart game (vertical slice: driving
// only, no combat). The realtime engine (server/src/realtime.js) runs a ~30Hz
// tick loop that feeds each player's latest input into step() and broadcasts
// snapshot() to all clients. Physics is arcade top-down on the XZ plane.

const ARENA_W = 80;
const ARENA_D = 80;
const COLORS = ['#ff5d6c', '#5cc8ff', '#8bd450', '#ffd24a'];

const ACCEL = 26;
const REVERSE_ACCEL = 16;
const MAX_SPEED = 28;
const REVERSE_MAX = 11;
const DRAG = 1.7;
const TURN_RATE = 2.8; // rad/s at full steer + speed
const KART_R = 2.2;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = (v) => Math.round(v * 10) / 10;

// Static config sent once in room.state (client builds the arena from this).
function createInitialState() {
  return { arena: { w: ARENA_W, d: ARENA_D }, colors: COLORS, realtime: true, maxPlayers: 4 };
}

// Dynamic simulation. players is the room's player list (index order matters).
function createSim(players) {
  const n = players.length;
  const radius = 22;
  const karts = players.map((p, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    return { x, z, heading: Math.atan2(-x, -z), vel: 0 }; // face the centre
  });
  return { karts };
}

// inputs: { [index]: { throttle: -1..1, steer: -1..1 } }. Mutates sim.
function step(sim, inputs, dt) {
  const d = clamp(dt, 0, 0.1);
  const half = ARENA_W / 2 - KART_R;
  const halfD = ARENA_D / 2 - KART_R;
  for (let i = 0; i < sim.karts.length; i++) {
    const k = sim.karts[i];
    const inp = inputs[i] || {};
    const throttle = clamp(Number(inp.throttle) || 0, -1, 1);
    const steer = clamp(Number(inp.steer) || 0, -1, 1);

    if (throttle > 0) k.vel += ACCEL * throttle * d;
    else if (throttle < 0) k.vel += REVERSE_ACCEL * throttle * d;
    k.vel -= k.vel * Math.min(1, DRAG * d); // drag toward 0
    k.vel = clamp(k.vel, -REVERSE_MAX, MAX_SPEED);

    const turnFactor = clamp(Math.abs(k.vel) / 8, 0, 1);
    k.heading += steer * TURN_RATE * d * turnFactor * Math.sign(k.vel || 1);

    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    k.x += fx * k.vel * d;
    k.z += fz * k.vel * d;

    if (k.x > half) { k.x = half; k.vel *= 0.4; }
    if (k.x < -half) { k.x = -half; k.vel *= 0.4; }
    if (k.z > halfD) { k.z = halfD; k.vel *= 0.4; }
    if (k.z < -halfD) { k.z = -halfD; k.vel *= 0.4; }
  }
}

function snapshot(sim) {
  return {
    karts: sim.karts.map((k, i) => ({ i, x: r1(k.x), z: r1(k.z), h: r1(k.heading), v: r1(k.vel) })),
  };
}

export default {
  id: 'karts',
  name: 'Smash Karts',
  type: 'realtime',
  minPlayers: 2,
  maxPlayers: 4,
  createInitialState,
  createSim,
  step,
  snapshot,
};
