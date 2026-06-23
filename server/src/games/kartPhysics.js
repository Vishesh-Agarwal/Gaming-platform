// Shared, deterministic kart movement integrator. Used by the server sim and the
// client predictor — keep this file byte-identical to its client copy
// (client/src/games/karts/kartPhysics.js); a test asserts they match.
export const PHYS = {
  ACCEL: 26, REVERSE_ACCEL: 16, MAX_SPEED: 28, REVERSE_MAX: 11,
  DRAG: 1.1, TURN_RATE: 2.8, KART_R: 2.2, ARENA_W: 80, ARENA_D: 80,
  GRAVITY: 30, SNAP: 2,
};
export const SIM_DT = 1 / 30;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Height of the highest walkable surface column at (x, z). Default ground = 0.
// Boxes contribute their flat top (box.top ?? 3) within their footprint;
// wedges contribute a linear slope; cylinders are not walkable.
export function surfaceHeight(map, x, z) {
  let h = 0;
  if (map && map.obstacles) {
    for (const o of map.obstacles) {
      if (o.kind !== 'box') continue;
      const hw = o.w / 2, hd = o.d / 2;
      if (x >= o.x - hw && x <= o.x + hw && z >= o.z - hd && z <= o.z + hd) {
        const top = o.top == null ? 3 : o.top;
        if (top > h) h = top;
      }
    }
  }
  if (map && map.ramps) {
    for (const r of map.ramps) {
      const hw = r.w / 2, hd = r.d / 2;
      if (x >= r.x - hw && x <= r.x + hw && z >= r.z - hd && z <= r.z + hd) {
        const t = r.axis === 'x' ? (x - (r.x - hw)) / r.w : (z - (r.z - hd)) / r.d;
        const tc = t < 0 ? 0 : t > 1 ? 1 : t;
        const ry = r.loY + (r.hiY - r.loY) * tc;
        if (ry > h) h = ry;
      }
    }
  }
  return h;
}

// Advance one movement step. Pure: depends only on (k, input, dt, map).
export function integrateKart(k, input, dt, map = null) {
  const { ACCEL, REVERSE_ACCEL, MAX_SPEED, REVERSE_MAX, DRAG, TURN_RATE, KART_R, ARENA_W, ARENA_D, GRAVITY, SNAP } = PHYS;
  if (k.y == null) k.y = 0;
  if (k.vy == null) k.vy = 0;
  if (k.grounded == null) k.grounded = true;
  const d = clamp(dt, 0, 0.1);
  const px = k.x, pz = k.z;
  const throttle = clamp(Number(input?.throttle) || 0, -1, 1);
  const steer = clamp(Number(input?.steer) || 0, -1, 1);

  // horizontal accel/drag/boost only when grounded; in air, momentum is carried
  if (k.grounded) {
    if (throttle > 0) k.vel += ACCEL * throttle * d;
    else if (throttle < 0) k.vel += REVERSE_ACCEL * throttle * d;
    k.vel -= k.vel * Math.min(1, DRAG * d);
    k.vel = clamp(k.vel, -REVERSE_MAX, MAX_SPEED);
    if (map && map.boosts) {
      for (const b of map.boosts) {
        const bx = k.x - b.x, bz = k.z - b.z;
        if (bx * bx + bz * bz < b.r * b.r && k.vel < b.strength) k.vel = b.strength;
      }
    }
  }
  // heading turns in both states (steer-only air control)
  const turnFactor = clamp(Math.abs(k.vel) / 8, 0, 1);
  k.heading -= steer * TURN_RATE * d * turnFactor * Math.sign(k.vel || 1);
  k.x += Math.sin(k.heading) * k.vel * d;
  k.z += Math.cos(k.heading) * k.vel * d;

  // arena perimeter clamp — always (full-height walls)
  const aw = (map && map.arena) ? map.arena.w : ARENA_W;
  const ad = (map && map.arena) ? map.arena.d : ARENA_D;
  const half = aw / 2 - KART_R, halfD = ad / 2 - KART_R;
  if (k.x > half) { k.x = half; k.vel *= 0.4; }
  if (k.x < -half) { k.x = -half; k.vel *= 0.4; }
  if (k.z > halfD) { k.z = halfD; k.vel *= 0.4; }
  if (k.z < -halfD) { k.z = -halfD; k.vel *= 0.4; }

  // obstacle push-out: boxes height-gated (wall only while below the top); cyl always solid
  if (map && map.obstacles) {
    for (const o of map.obstacles) {
      if (o.kind === 'cyl') {
        const dx = k.x - o.x, dz = k.z - o.z;
        const dist = Math.hypot(dx, dz), min = KART_R + o.r;
        if (dist < min) {
          if (dist > 1e-6) { k.x = o.x + (dx / dist) * min; k.z = o.z + (dz / dist) * min; }
          else { k.x = o.x + min; }
          k.vel *= 0.4;
        }
      } else {
        const top = o.top == null ? 3 : o.top;
        if (k.y >= top - 0.01) continue; // on/above the mesa top — not a wall
        const hw = o.w / 2, hd = o.d / 2;
        const cx = clamp(k.x, o.x - hw, o.x + hw);
        const cz = clamp(k.z, o.z - hd, o.z + hd);
        const dx = k.x - cx, dz = k.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < KART_R * KART_R) {
          if (d2 > 1e-6) {
            const dist = Math.sqrt(d2);
            k.x = cx + (dx / dist) * KART_R; k.z = cz + (dz / dist) * KART_R;
          } else {
            const penX = hw + KART_R - Math.abs(k.x - o.x);
            const penZ = hd + KART_R - Math.abs(k.z - o.z);
            if (penX < penZ) k.x = o.x + Math.sign(k.x - o.x || 1) * (hw + KART_R);
            else k.z = o.z + Math.sign(k.z - o.z || 1) * (hd + KART_R);
          }
          k.vel *= 0.4;
        }
      }
    }
  }

  // vertical resolution (launch added in Task 3)
  const floor = surfaceHeight(map, k.x, k.z);
  if (k.grounded) {
    if (k.y - floor > SNAP) {
      // ground fell away beneath us (drove off an edge) — start falling
      k.grounded = false;
      k.vy = 0;
    } else {
      k.y = floor;
      k.vy = 0;
    }
  } else {
    k.vy -= GRAVITY * d;
    k.y += k.vy * d;
    if (k.y <= floor) { k.y = floor; k.vy = 0; k.grounded = true; }
  }
  return k;
}
