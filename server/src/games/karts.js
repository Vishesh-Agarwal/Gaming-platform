// Smash Karts — server-authoritative realtime kart deathmatch. The realtime
// engine ticks step() ~30Hz (passing `now`) and broadcasts snapshot(). Pick up
// weapons from crates, fight, die + respawn; most kills in 90s wins.

import { integrateKart, SIM_DT, surfaceHeight } from './kartPhysics.js';
import { getMap } from './kartMaps.js';

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
const BARREL = 1.0, KART_CENTER = 1.0, GRAVITY_PROJ = 9, ROCKET_VY = 4;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = (v) => Math.round(v * 10) / 10;
const rand = (a) => a[Math.floor(Math.random() * a.length)];

// --- line-of-sight geometry (2D, x/z plane) -------------------------------
function pointInRect(px, pz, minX, minZ, maxX, maxZ) {
  return px >= minX && px <= maxX && pz >= minZ && pz <= maxZ;
}
function pointInCircle(px, pz, cx, cz, r) {
  const dx = px - cx, dz = pz - cz;
  return dx * dx + dz * dz <= r * r;
}
// True if segment A->B passes within r of circle center C.
function segHitsCircle(ax, az, bx, bz, cx, cz, r) {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((cx - ax) * abx + (cz - az) * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + abx * t, pz = az + abz * t;
  const dx = cx - px, dz = cz - pz;
  return dx * dx + dz * dz < r * r;
}
// Segment A->B vs axis-aligned rectangle (Liang–Barsky clip).
function segHitsRect(ax, az, bx, bz, minX, minZ, maxX, maxZ) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const edges = [[-dx, ax - minX], [dx, maxX - ax], [-dz, az - minZ], [dz, maxZ - az]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return false; continue; } // parallel & outside
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}

// True if the straight line from (x0,z0) to (x1,z1) is not blocked by any solid
// obstacle: box footprints, cylinders, and flat wedge plateaus (loY === hiY).
// Sloped wedges do not block. An obstacle whose footprint contains either
// endpoint is ignored (a kart on a mesa is reachable; a shooter isn't self-blocked).
export function lineOfSightClear(map, x0, z0, x1, z1) {
  for (const o of (map.obstacles || [])) {
    if (o.kind === 'cyl') {
      if (pointInCircle(x0, z0, o.x, o.z, o.r) || pointInCircle(x1, z1, o.x, o.z, o.r)) continue;
      if (segHitsCircle(x0, z0, x1, z1, o.x, o.z, o.r)) return false;
    } else {
      const hw = o.w / 2, hd = o.d / 2;
      const minX = o.x - hw, minZ = o.z - hd, maxX = o.x + hw, maxZ = o.z + hd;
      if (pointInRect(x0, z0, minX, minZ, maxX, maxZ) || pointInRect(x1, z1, minX, minZ, maxX, maxZ)) continue;
      if (segHitsRect(x0, z0, x1, z1, minX, minZ, maxX, maxZ)) return false;
    }
  }
  for (const r of (map.ramps || [])) {
    if (r.loY !== r.hiY) continue; // sloped ramps don't block
    const hw = r.w / 2, hd = r.d / 2;
    const minX = r.x - hw, minZ = r.z - hd, maxX = r.x + hw, maxZ = r.z + hd;
    if (pointInRect(x0, z0, minX, minZ, maxX, maxZ) || pointInRect(x1, z1, minX, minZ, maxX, maxZ)) continue;
    if (segHitsRect(x0, z0, x1, z1, minX, minZ, maxX, maxZ)) return false;
  }
  return true;
}

function createInitialState(options) {
  const map = getMap(options?.map);
  return { arena: map.arena, colors: COLORS, realtime: true, maxPlayers: 4, mapId: map.id };
}

function createSim(players, now = Date.now(), options) {
  const map = getMap(options?.map);
  const karts = players.map((p, i) => {
    const s = map.spawns[i % map.spawns.length];
    return {
      x: s.x, z: s.z, heading: s.heading, vel: 0,
      y: surfaceHeight(map, s.x, s.z), vy: 0, grounded: true,
      hp: HP_MAX, alive: true, respawnAt: 0, kills: 0,
      weapon: null, ammo: 0, shieldUntil: 0,
      prevFire: false, queue: [], nextShotAt: 0, gone: false, lastSeq: 0,
    };
  });
  return {
    mapId: map.id,
    karts,
    crates: map.pads.map(([x, z]) => ({ x, z, type: null, readyAt: now + COUNTDOWN_MS })),
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

function fireProjectile(sim, k, owner, type, now, map) {
  const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  if (type === 'mine') {
    const mx = k.x - fx * 3, mz = k.z - fz * 3;
    sim.projectiles.push({
      id: sim.nextPid++, type: 'mine', owner, x: mx, z: mz, y: surfaceHeight(map, mx, mz),
      vx: 0, vz: 0, vy: 0, armAt: now + MINE.arm, dieAt: now + MINE.life,
    });
    return;
  }
  const spec = type === 'mg' ? MG : ROCKET;
  sim.projectiles.push({
    id: sim.nextPid++, type, owner, h: k.heading,
    x: k.x + fx * 3, z: k.z + fz * 3, y: (k.y || 0) + BARREL,
    vx: fx * spec.speed, vz: fz * spec.speed, vy: type === 'rocket' ? ROCKET_VY : 0, life: spec.life,
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
  const map = getMap(sim.mapId);

  // recharge crates
  for (const c of sim.crates) {
    if (c.type === null && now >= c.readyAt) c.type = rand(WEAPONS);
  }

  for (let i = 0; i < sim.karts.length; i++) {
    const k = sim.karts[i];
    if (k.gone) continue;
    if (!k.alive) {
      // discard inputs queued while dead so they don't replay in a burst on respawn
      const dslot = inputs[i];
      if (dslot && dslot.queue && dslot.queue.length) {
        k.lastSeq = dslot.queue[dslot.queue.length - 1].seq || k.lastSeq;
        dslot.queue.length = 0;
      }
      if (now >= k.respawnAt) {
        const s = map.spawns[i % map.spawns.length];
        k.x = s.x; k.z = s.z; k.heading = s.heading; k.vel = 0;
        k.y = surfaceHeight(map, s.x, s.z); k.vy = 0; k.grounded = true;
        k.hp = HP_MAX; k.alive = true; k.shieldUntil = now + 1200; // brief spawn protection
      }
      continue;
    }
    const slot = inputs[i] || {};
    const q = slot.queue || [];
    let drained = null;
    while (q.length) {
      const cmd = q.shift();
      integrateKart(k, cmd, SIM_DT, map);
      k.lastSeq = cmd.seq || 0;
      drained = cmd;
    }
    if (drained) slot.last = drained;
    const fire = !!(drained || slot.last || {}).fire;

    // hazard zones: server-authoritative self-damage (no kill credit; shield/spawn-protect applies via damage())
    for (const hz of map.hazards) {
      const hx = k.x - hz.x, hz2 = k.z - hz.z;
      if (hx * hx + hz2 * hz2 < hz.r * hz.r) { damage(sim, i, hz.dmg, i, now); break; }
    }
    if (!k.alive) continue; // died to a hazard this tick

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
        fireProjectile(sim, k, i, 'mg', now, map);
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
        fireProjectile(sim, k, i, k.weapon, now, map);
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
          const dx = k.x - pr.x, dz = k.z - pr.z, dy = (k.y || 0) + KART_CENTER - pr.y;
          if (dx * dx + dz * dz + dy * dy < MINE.trigger * MINE.trigger) {
            damage(sim, i, MINE.dmg, pr.owner, now);
            dead = true; break;
          }
        }
      }
    } else {
      pr.x += pr.vx * d; pr.z += pr.vz * d; pr.y += pr.vy * d; pr.vy -= GRAVITY_PROJ * d; pr.life -= d;
      const spec = pr.type === 'mg' ? MG : ROCKET;
      if (pr.life <= 0) dead = true;
      else if (Math.abs(pr.x) > map.arena.w / 2 || Math.abs(pr.z) > map.arena.d / 2) dead = true;
      else if (pr.y <= surfaceHeight(map, pr.x, pr.z)) dead = true; // hit the ground/mesa
      else {
        for (let i = 0; i < sim.karts.length; i++) {
          if (i === pr.owner) continue;
          const k = sim.karts[i];
          if (!k.alive || k.gone) continue;
          const dx = k.x - pr.x, dz = k.z - pr.z, dy = (k.y || 0) + KART_CENTER - pr.y;
          if (dx * dx + dz * dz + dy * dy < HIT_R * HIT_R) {
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
      y: r1(k.y || 0), vy: r1(k.vy || 0), g: !!k.grounded,
      hp: Math.round(k.hp), alive: k.alive, kills: k.kills,
      weapon: k.weapon, ammo: k.ammo, shield: now < k.shieldUntil, gone: k.gone,
    })),
    crates: sim.crates.map((c) => ({ x: r1(c.x), z: r1(c.z), type: c.type })),
    proj: sim.projectiles.map((p) => ({ id: p.id, type: p.type, x: r1(p.x), y: r1(p.y || 0), z: r1(p.z), h: r1(p.h || 0) })),
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
