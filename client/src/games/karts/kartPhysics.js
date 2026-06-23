// Shared, deterministic kart movement integrator. Used by the client predictor and
// the server sim — keep this file byte-identical to its server copy
// (server/src/games/kartPhysics.js); a test asserts they match.
export const PHYS = {
  ACCEL: 26, REVERSE_ACCEL: 16, MAX_SPEED: 28, REVERSE_MAX: 11,
  DRAG: 1.1, TURN_RATE: 2.8, KART_R: 2.2, ARENA_W: 80, ARENA_D: 80,
};
export const SIM_DT = 1 / 30;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Advance one movement step. Pure: depends only on (k, input, dt, map).
export function integrateKart(k, input, dt, map = null) {
  const { ACCEL, REVERSE_ACCEL, MAX_SPEED, REVERSE_MAX, DRAG, TURN_RATE, KART_R, ARENA_W, ARENA_D } = PHYS;
  const d = clamp(dt, 0, 0.1);
  const throttle = clamp(Number(input?.throttle) || 0, -1, 1);
  const steer = clamp(Number(input?.steer) || 0, -1, 1);
  if (throttle > 0) k.vel += ACCEL * throttle * d;
  else if (throttle < 0) k.vel += REVERSE_ACCEL * throttle * d;
  k.vel -= k.vel * Math.min(1, DRAG * d);
  k.vel = clamp(k.vel, -REVERSE_MAX, MAX_SPEED);
  // boost pads can briefly push speed above MAX_SPEED
  if (map && map.boosts) {
    for (const b of map.boosts) {
      const bx = k.x - b.x, bz = k.z - b.z;
      if (bx * bx + bz * bz < b.r * b.r && k.vel < b.strength) k.vel = b.strength;
    }
  }
  const turnFactor = clamp(Math.abs(k.vel) / 8, 0, 1);
  k.heading -= steer * TURN_RATE * d * turnFactor * Math.sign(k.vel || 1);
  k.x += Math.sin(k.heading) * k.vel * d;
  k.z += Math.cos(k.heading) * k.vel * d;
  // arena wall clamp (map arena overrides the default)
  const aw = (map && map.arena) ? map.arena.w : ARENA_W;
  const ad = (map && map.arena) ? map.arena.d : ARENA_D;
  const half = aw / 2 - KART_R, halfD = ad / 2 - KART_R;
  if (k.x > half) { k.x = half; k.vel *= 0.4; }
  if (k.x < -half) { k.x = -half; k.vel *= 0.4; }
  if (k.z > halfD) { k.z = halfD; k.vel *= 0.4; }
  if (k.z < -halfD) { k.z = -halfD; k.vel *= 0.4; }
  // obstacle push-out (circle of radius KART_R vs box/cyl)
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
  return k;
}
