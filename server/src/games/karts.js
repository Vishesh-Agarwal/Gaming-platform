// Smash Karts — server-authoritative realtime kart deathmatch. The realtime
// engine ticks step() ~30Hz (passing `now`) and broadcasts snapshot(). Pick up
// weapons from crates, fight, die + respawn; most kills in 90s wins.

import { integrateKart, SIM_DT, surfaceHeight, PHYS } from './kartPhysics.js';
import { getMap } from './kartMaps.js';

const COLORS = ['#ff5d6c', '#5cc8ff', '#8bd450', '#ffd24a', '#c87bff', '#ff9f43', '#2ee6c0', '#f25fbf'];
const TEAM_COLORS = ['#ff5d6c', '#5cc8ff'];

// match
const COUNTDOWN_MS = 3000, MATCH_MS = 90000, RESPAWN_MS = 2000, HP_MAX = 100;

// weapons: ammo + behaviour
export const WEAPONS = ['mg', 'rocket', 'mine'];
const MG = { dmg: 8, speed: 70, life: 0.55, ammo: 24, cadence: 90, r: 0.8 };
const ROCKET = { dmg: 45, speed: 42, life: 2.6, ammo: 3, cadence: 150, r: 1.4 };
const MINE = { dmg: 999, ammo: 3, cadence: 220, arm: 400, trigger: 3.2, life: 12000 };
const MG_RANGE = 15, MG_DMG_NEAR = 8, MG_DMG_FAR = 2.5;
const CRATE_R = 3, CRATE_RESPAWN = 6000, HIT_R = 2.6;
const KART_BOUNCE = 0.45, KART_COLLIDE_DY = 2; // kart-kart recoil + max height delta to collide
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

// Linear MG damage falloff: MG_DMG_NEAR at point-blank -> MG_DMG_FAR at MG_RANGE.
export function mgDamage(dist) {
  const t = clamp(dist / MG_RANGE, 0, 1);
  return MG_DMG_NEAR + (MG_DMG_FAR - MG_DMG_NEAR) * t;
}

// Two karts are teammates only when both carry the same non-null team.
function sameTeam(a, b) { return a && b && a.team != null && a.team === b.team; }

// Index of the nearest valid MG target for shooter `self`, or null.
// Valid = alive, not gone, not self, not a teammate, horizontal distance < MG_RANGE, clear LOS.
export function nearestTarget(sim, self, map) {
  const k = sim.karts[self];
  let best = null, bestD2 = MG_RANGE * MG_RANGE;
  for (let i = 0; i < sim.karts.length; i++) {
    if (i === self) continue;
    const t = sim.karts[i];
    if (!t.alive || t.gone) continue;
    if (sameTeam(k, t)) continue;
    const dx = t.x - k.x, dz = t.z - k.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= bestD2) continue;
    if (!lineOfSightClear(map, k.x, k.z, t.x, t.z)) continue;
    best = i; bestD2 = d2;
  }
  return best;
}

function createInitialState(options) {
  const map = getMap(options?.map);
  const mode = options?.mode === 'teams' ? 'teams' : 'ffa';
  const teams = mode === 'teams' && Array.isArray(options?.teams) ? options.teams : null;
  return { arena: map.arena, colors: COLORS, teamColors: TEAM_COLORS, mode, teams, realtime: true, maxPlayers: 8, mapId: map.id };
}

function createSim(players, now = Date.now(), options) {
  const map = getMap(options?.map);
  const mode = options?.mode === 'teams' ? 'teams' : 'ffa';
  const teams = mode === 'teams' && Array.isArray(options?.teams) ? options.teams : null;
  const h = Math.floor(map.spawns.length / 2);
  let aIdx = 0, bIdx = 0;
  const karts = players.map((p, i) => {
    const team = teams ? (teams[i] === 1 ? 1 : 0) : null;
    let spawnIdx;
    if (team === 0) { spawnIdx = aIdx % h; aIdx++; }
    else if (team === 1) { spawnIdx = h + (bIdx % (map.spawns.length - h)); bIdx++; }
    else { spawnIdx = i % map.spawns.length; }
    const s = map.spawns[spawnIdx];
    return {
      x: s.x, z: s.z, heading: s.heading, vel: 0,
      y: surfaceHeight(map, s.x, s.z), vy: 0, grounded: true,
      hp: HP_MAX, alive: true, respawnAt: 0, kills: 0,
      weapon: null, ammo: 0, shieldUntil: 0, mgAuto: false,
      prevFire: false, queue: [], nextShotAt: 0, gone: false, lastSeq: 0,
      team, spawnIdx,
    };
  });
  return {
    mapId: map.id,
    mode,
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
  k.queue = []; k.mgAuto = false;
}

function fireProjectile(sim, k, owner, type, now, map, target = null) {
  const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  if (type === 'mine') {
    const mx = k.x - fx * 3, mz = k.z - fz * 3;
    sim.projectiles.push({
      id: sim.nextPid++, type: 'mine', owner, x: mx, z: mz, y: surfaceHeight(map, mx, mz),
      vx: 0, vz: 0, vy: 0, armAt: now + MINE.arm, dieAt: now + MINE.life,
    });
    return;
  }
  if (type === 'mg') {
    // cosmetic only — damage is applied as hitscan at fire time. Aim at the
    // target if there is one, otherwise straight ahead (idle fire).
    let dx = fx, dz = fz, dy = 0;
    if (target) {
      const tx = target.x - k.x, tz = target.z - k.z;
      const ty = ((target.y || 0) + KART_CENTER) - ((k.y || 0) + BARREL);
      const len = Math.hypot(tx, tz) || 1;
      dx = tx / len; dz = tz / len; dy = ty / len;
    }
    sim.projectiles.push({
      id: sim.nextPid++, type: 'mg', owner, h: Math.atan2(dx, dz),
      x: k.x + dx * 3, z: k.z + dz * 3, y: (k.y || 0) + BARREL,
      vx: dx * MG.speed, vz: dz * MG.speed, vy: dy * MG.speed, life: MG.life,
      cosmetic: true,
    });
    return;
  }
  // rocket — real, forward
  sim.projectiles.push({
    id: sim.nextPid++, type, owner, h: k.heading,
    x: k.x + fx * 3, z: k.z + fz * 3, y: (k.y || 0) + BARREL,
    vx: fx * ROCKET.speed, vz: fz * ROCKET.speed, vy: ROCKET_VY, life: ROCKET.life,
  });
}

// Spawn index farthest from the nearest living other kart (so a respawn lands
// away from a fight). Falls back to the kart's own spawnIdx if nobody's around.
export function safeSpawnIndex(sim, selfIdx, map) {
  let best = sim.karts[selfIdx].spawnIdx, bestScore = -Infinity, found = false;
  for (let s = 0; s < map.spawns.length; s++) {
    const sp = map.spawns[s];
    let nearest = Infinity;
    for (let j = 0; j < sim.karts.length; j++) {
      if (j === selfIdx) continue;
      const k = sim.karts[j];
      if (!k.alive || k.gone) continue;
      const d2 = (k.x - sp.x) ** 2 + (k.z - sp.z) ** 2;
      if (d2 < nearest) nearest = d2;
    }
    if (nearest === Infinity) continue; // no living others to consider
    found = true;
    if (nearest > bestScore) { bestScore = nearest; best = s; }
  }
  return found ? best : sim.karts[selfIdx].spawnIdx;
}

function killKart(sim, victimIdx, ownerIdx, now) {
  const v = sim.karts[victimIdx];
  v.alive = false;
  v.respawnAt = now + RESPAWN_MS;
  v.weapon = null; v.ammo = 0; v.queue = []; v.mgAuto = false;
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
        const s = map.spawns[safeSpawnIndex(sim, i, map)];
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
      if (rising) k.mgAuto = true; // one press dumps the whole magazine
      if (k.mgAuto && k.ammo > 0 && now >= k.nextShotAt) {
        const t = nearestTarget(sim, i, map);
        if (t != null) {
          const tg = sim.karts[t];
          const dist = Math.hypot(tg.x - k.x, tg.z - k.z);
          damage(sim, t, mgDamage(dist), i, now);
          fireProjectile(sim, k, i, 'mg', now, map, tg);
        } else {
          fireProjectile(sim, k, i, 'mg', now, map, null); // idle fire
        }
        k.ammo -= 1; k.nextShotAt = now + MG.cadence;
        if (k.ammo <= 0) { k.weapon = null; k.mgAuto = false; }
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
    }
    k.prevFire = fire;
  }

  // kart-kart collision: bumper-car separation + recoil. Server-authoritative;
  // the shared integrator stays per-kart, so this resolution lives here.
  const KR2 = PHYS.KART_R * 2;
  for (let i = 0; i < sim.karts.length; i++) {
    const a = sim.karts[i];
    if (!a.alive || a.gone) continue;
    for (let j = i + 1; j < sim.karts.length; j++) {
      const b = sim.karts[j];
      if (!b.alive || b.gone) continue;
      if (Math.abs((a.y || 0) - (b.y || 0)) >= KART_COLLIDE_DY) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      let dist = Math.hypot(dx, dz);
      if (dist >= KR2) continue;
      let nx, nz;
      if (dist > 1e-6) { nx = dx / dist; nz = dz / dist; } else { nx = 1; nz = 0; dist = 0; }
      const pen = (KR2 - dist) / 2;
      a.x -= nx * pen; a.z -= nz * pen;
      b.x += nx * pen; b.z += nz * pen;
      // recoil whoever is driving into the other (velocity points along the contact normal)
      if (Math.sin(a.heading) * a.vel * nx + Math.cos(a.heading) * a.vel * nz > 0) a.vel = -KART_BOUNCE * a.vel;
      if (Math.sin(b.heading) * b.vel * -nx + Math.cos(b.heading) * b.vel * -nz > 0) b.vel = -KART_BOUNCE * b.vel;
    }
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
          if (i === pr.owner || sameTeam(sim.karts[pr.owner], k)) continue; // owner + teammates safe
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
      else if (!pr.cosmetic) { // cosmetic MG bullets are visual-only
        for (let i = 0; i < sim.karts.length; i++) {
          if (i === pr.owner) continue;
          const k = sim.karts[i];
          if (!k.alive || k.gone) continue;
          if (sameTeam(sim.karts[pr.owner], k)) continue; // no friendly fire
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
      team: k.team ?? null,
    })),
    crates: sim.crates.map((c) => ({ x: r1(c.x), z: r1(c.z), type: c.type })),
    proj: sim.projectiles.map((p) => ({ id: p.id, type: p.type, owner: p.owner, x: r1(p.x), y: r1(p.y || 0), z: r1(p.z), h: r1(p.h || 0) })),
    kills: sim.karts.map((k) => k.kills),
    teams: sim.mode === 'teams'
      ? [0, 1].map((t) => sim.karts.reduce((s, k) => s + (k.team === t ? k.kills : 0), 0))
      : null,
  };
}

function result(sim) {
  const kills = sim.karts.map((k) => k.kills);
  if (sim.mode === 'teams') {
    const teams = [0, 1].map((t) => sim.karts.reduce((s, k) => s + (k.team === t ? k.kills : 0), 0));
    const draw = teams[0] === teams[1];
    return { over: true, mode: 'teams', winner: draw ? null : (teams[0] > teams[1] ? 0 : 1), draw, teams, scores: kills };
  }
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
  modes: [{ id: 'ffa', name: 'Free-for-all' }, { id: 'teams', name: 'Teams' }],
  minPlayers: 2,
  maxPlayers: 8,
  createInitialState,
  createSim,
  step,
  snapshot,
  result,
  dropPlayer,
};
