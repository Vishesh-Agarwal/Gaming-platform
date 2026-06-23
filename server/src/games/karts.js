// Smash Karts — server-authoritative realtime kart deathmatch. The realtime
// engine ticks step() ~30Hz (passing `now`) and broadcasts snapshot(). Pick up
// weapons from crates, fight, die + respawn; most kills in 90s wins.

import { integrateKart, SIM_DT } from './kartPhysics.js';

const ARENA_W = 80;
const ARENA_D = 80;
const COLORS = ['#ff5d6c', '#5cc8ff', '#8bd450', '#ffd24a'];

// match
const COUNTDOWN_MS = 3000, MATCH_MS = 90000, RESPAWN_MS = 2000, HP_MAX = 100;

// weapons: ammo + behaviour
const WEAPONS = ['mg', 'rocket', 'mine', 'shield'];
const MG = { dmg: 8, speed: 70, life: 0.55, ammo: 24, cadence: 90, r: 0.8 };
const ROCKET = { dmg: 45, speed: 42, life: 2.6, ammo: 3, cadence: 150, r: 1.4 };
const MINE = { dmg: 999, ammo: 3, cadence: 220, arm: 400, trigger: 3.2, life: 12000 };
const SHIELD = { dur: 4000 };
const CRATE_R = 3, CRATE_RESPAWN = 6000, HIT_R = 2.6;

const PADS = [
  [0, 0], [-24, -24], [24, -24], [-24, 24], [24, 24],
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = (v) => Math.round(v * 10) / 10;
const rand = (a) => a[Math.floor(Math.random() * a.length)];

function spawnPoint(i, n) {
  const a = (i / Math.max(1, n)) * Math.PI * 2;
  const radius = 22;
  const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
  return { x, z, heading: Math.atan2(-x, -z) };
}

function createInitialState() {
  return { arena: { w: ARENA_W, d: ARENA_D }, colors: COLORS, realtime: true, maxPlayers: 4 };
}

function createSim(players, now = Date.now()) {
  const n = players.length;
  const karts = players.map((p, i) => {
    const s = spawnPoint(i, n);
    return {
      x: s.x, z: s.z, heading: s.heading, vel: 0,
      hp: HP_MAX, alive: true, respawnAt: 0, kills: 0,
      weapon: null, ammo: 0, shieldUntil: 0,
      prevFire: false, queue: [], nextShotAt: 0, gone: false, lastSeq: 0,
    };
  });
  return {
    karts,
    crates: PADS.map(([x, z]) => ({ x, z, type: null, readyAt: now + COUNTDOWN_MS })),
    projectiles: [],
    nextPid: 1,
    startAt: now + COUNTDOWN_MS,
    endsAt: now + COUNTDOWN_MS + MATCH_MS,
    over: false,
  };
}

function giveWeapon(k, type) {
  k.weapon = type;
  k.ammo = type === 'mg' ? MG.ammo : type === 'rocket' ? ROCKET.ammo : type === 'mine' ? MINE.ammo : 1;
  k.queue = [];
}

function fireProjectile(sim, k, owner, type, now) {
  const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  if (type === 'mine') {
    sim.projectiles.push({
      id: sim.nextPid++, type: 'mine', owner, x: k.x - fx * 3, z: k.z - fz * 3,
      vx: 0, vz: 0, armAt: now + MINE.arm, dieAt: now + MINE.life,
    });
    return;
  }
  const spec = type === 'mg' ? MG : ROCKET;
  sim.projectiles.push({
    id: sim.nextPid++, type, owner, h: k.heading,
    x: k.x + fx * 3, z: k.z + fz * 3,
    vx: fx * spec.speed, vz: fz * spec.speed, life: spec.life,
  });
}

function killKart(sim, victimIdx, ownerIdx, now) {
  const v = sim.karts[victimIdx];
  v.alive = false;
  v.respawnAt = now + RESPAWN_MS;
  v.weapon = null; v.ammo = 0; v.queue = [];
  if (ownerIdx != null && ownerIdx !== victimIdx && sim.karts[ownerIdx] && !sim.karts[ownerIdx].gone) {
    sim.karts[ownerIdx].kills += 1;
  }
}

function damage(sim, victimIdx, dmg, ownerIdx, now) {
  const v = sim.karts[victimIdx];
  if (!v.alive || v.gone) return;
  if (now < v.shieldUntil) return; // shield absorbs
  v.hp -= dmg;
  if (v.hp <= 0) { v.hp = 0; killKart(sim, victimIdx, ownerIdx, now); }
}

function step(sim, inputs, dt, now = Date.now()) {
  if (sim.over || now < sim.startAt) return;
  if (now >= sim.endsAt) { sim.over = true; return; }
  const d = clamp(dt, 0, 0.1);

  // recharge crates
  for (const c of sim.crates) {
    if (c.type === null && now >= c.readyAt) c.type = rand(WEAPONS);
  }

  for (let i = 0; i < sim.karts.length; i++) {
    const k = sim.karts[i];
    if (k.gone) continue;
    if (!k.alive) {
      if (now >= k.respawnAt) {
        const s = spawnPoint(i, sim.karts.length);
        k.x = s.x; k.z = s.z; k.heading = s.heading; k.vel = 0;
        k.hp = HP_MAX; k.alive = true; k.shieldUntil = now + 1200; // brief spawn protection
      }
      continue;
    }
    const slot = inputs[i] || {};
    const q = slot.queue || [];
    let drained = null;
    while (q.length) {
      const cmd = q.shift();
      integrateKart(k, cmd, SIM_DT);
      k.lastSeq = cmd.seq || 0;
      drained = cmd;
    }
    if (drained) slot.last = drained;
    const fire = !!(drained || slot.last || {}).fire;

    // pick up a weapon when unarmed
    if (!k.weapon) {
      for (const c of sim.crates) {
        if (c.type && Math.hypot(k.x - c.x, k.z - c.z) < CRATE_R) {
          giveWeapon(k, c.type);
          c.type = null; c.readyAt = now + CRATE_RESPAWN;
          break;
        }
      }
    }

    // firing
    const rising = fire && !k.prevFire;
    if (k.weapon === 'mg') {
      if (fire && k.ammo > 0 && now >= k.nextShotAt) {
        fireProjectile(sim, k, i, 'mg', now);
        k.ammo -= 1; k.nextShotAt = now + MG.cadence;
        if (k.ammo <= 0) k.weapon = null;
      }
    } else if (k.weapon === 'rocket' || k.weapon === 'mine') {
      const spec = k.weapon === 'rocket' ? ROCKET : MINE;
      if (rising && k.queue.length === 0) {
        for (let s = 0; s < k.ammo; s++) k.queue.push(now + s * spec.cadence);
      }
      while (k.queue.length && now >= k.queue[0]) {
        k.queue.shift();
        fireProjectile(sim, k, i, k.weapon, now);
        k.ammo -= 1;
      }
      if (k.ammo <= 0 && k.queue.length === 0) k.weapon = null;
    } else if (k.weapon === 'shield') {
      if (rising) { k.shieldUntil = now + SHIELD.dur; k.weapon = null; k.ammo = 0; }
    }
    k.prevFire = fire;
  }

  // projectiles
  for (let p = sim.projectiles.length - 1; p >= 0; p--) {
    const pr = sim.projectiles[p];
    let dead = false;
    if (pr.type === 'mine') {
      if (now >= pr.dieAt) dead = true;
      else if (now >= pr.armAt) {
        for (let i = 0; i < sim.karts.length; i++) {
          const k = sim.karts[i];
          if (!k.alive || k.gone) continue;
          if (Math.hypot(k.x - pr.x, k.z - pr.z) < MINE.trigger) {
            damage(sim, i, MINE.dmg, pr.owner, now);
            dead = true; break;
          }
        }
      }
    } else {
      pr.x += pr.vx * d; pr.z += pr.vz * d; pr.life -= d;
      const spec = pr.type === 'mg' ? MG : ROCKET;
      if (pr.life <= 0) dead = true;
      else if (Math.abs(pr.x) > ARENA_W / 2 || Math.abs(pr.z) > ARENA_D / 2) dead = true;
      else {
        for (let i = 0; i < sim.karts.length; i++) {
          if (i === pr.owner) continue;
          const k = sim.karts[i];
          if (!k.alive || k.gone) continue;
          if (Math.hypot(k.x - pr.x, k.z - pr.z) < HIT_R) {
            damage(sim, i, spec.dmg, pr.owner, now);
            dead = true; break;
          }
        }
      }
    }
    if (dead) sim.projectiles.splice(p, 1);
  }
}

function snapshot(sim, now = Date.now()) {
  const phase = sim.over ? 'over' : now < sim.startAt ? 'countdown' : 'play';
  return {
    phase,
    countdown: Math.max(0, Math.ceil((sim.startAt - now) / 1000)),
    timeLeft: Math.max(0, Math.ceil((sim.endsAt - now) / 1000)),
    karts: sim.karts.map((k, i) => ({
      i, x: r1(k.x), z: r1(k.z), h: r1(k.heading), v: r1(k.vel), seq: k.lastSeq || 0,
      hp: Math.round(k.hp), alive: k.alive, kills: k.kills,
      weapon: k.weapon, ammo: k.ammo, shield: now < k.shieldUntil, gone: k.gone,
    })),
    crates: sim.crates.map((c) => ({ x: r1(c.x), z: r1(c.z), type: c.type })),
    proj: sim.projectiles.map((p) => ({ id: p.id, type: p.type, x: r1(p.x), z: r1(p.z), h: r1(p.h || 0) })),
    kills: sim.karts.map((k) => k.kills),
  };
}

function result(sim) {
  const kills = sim.karts.map((k) => k.kills);
  let best = -1, winner = null, tie = false;
  for (let i = 0; i < sim.karts.length; i++) {
    if (sim.karts[i].gone) continue;
    if (kills[i] > best) { best = kills[i]; winner = i; tie = false; }
    else if (kills[i] === best) tie = true;
  }
  return { over: true, winner: tie ? null : winner, draw: tie, scores: kills };
}

// Mark a player's kart as gone (left/disconnected). Returns count still active.
function dropPlayer(sim, index) {
  if (sim.karts[index]) { sim.karts[index].gone = true; sim.karts[index].alive = false; }
  return sim.karts.filter((k) => !k.gone).length;
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
  result,
  dropPlayer,
};
