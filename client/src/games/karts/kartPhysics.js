// Shared, deterministic kart movement integrator. Used by the client predictor and
// the server sim — keep this file byte-identical to its server copy
// (server/src/games/kartPhysics.js); a test asserts they match.
export const PHYS = {
  ACCEL: 26, REVERSE_ACCEL: 16, MAX_SPEED: 28, REVERSE_MAX: 11,
  DRAG: 1.1, TURN_RATE: 2.8, KART_R: 2.2, ARENA_W: 80, ARENA_D: 80,
};
export const SIM_DT = 1 / 30;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Advance one movement step. Pure: depends only on (k, input, dt).
export function integrateKart(k, input, dt) {
  const { ACCEL, REVERSE_ACCEL, MAX_SPEED, REVERSE_MAX, DRAG, TURN_RATE, KART_R, ARENA_W, ARENA_D } = PHYS;
  const d = clamp(dt, 0, 0.1);
  const throttle = clamp(Number(input?.throttle) || 0, -1, 1);
  const steer = clamp(Number(input?.steer) || 0, -1, 1);
  if (throttle > 0) k.vel += ACCEL * throttle * d;
  else if (throttle < 0) k.vel += REVERSE_ACCEL * throttle * d;
  k.vel -= k.vel * Math.min(1, DRAG * d);
  k.vel = clamp(k.vel, -REVERSE_MAX, MAX_SPEED);
  const turnFactor = clamp(Math.abs(k.vel) / 8, 0, 1);
  k.heading -= steer * TURN_RATE * d * turnFactor * Math.sign(k.vel || 1);
  k.x += Math.sin(k.heading) * k.vel * d;
  k.z += Math.cos(k.heading) * k.vel * d;
  const half = ARENA_W / 2 - KART_R, halfD = ARENA_D / 2 - KART_R;
  if (k.x > half) { k.x = half; k.vel *= 0.4; }
  if (k.x < -half) { k.x = -half; k.vel *= 0.4; }
  if (k.z > halfD) { k.z = halfD; k.vel *= 0.4; }
  if (k.z < -halfD) { k.z = -halfD; k.vel *= 0.4; }
  return k;
}
