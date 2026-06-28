// Client-side aim prediction shared by Pool and Carrom. Pure geometry — a visual
// aid only; the server's simulation remains authoritative for the real shot.
//
// Casts a ray from the cue/striker along the aim direction, finds the first
// object ball it would touch (combined radius) or the first cushion, and returns:
//   - path: the cue path points (start -> contact, with up to `maxBounces` rail
//           reflections if no ball is hit)
//   - hit:  { ghost, ball, objDir } when a ball is struck first, where `ghost` is
//           the cue centre at contact and `objDir` is the line-of-centres unit
//           vector the struck ball would travel along.

function unit(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

// Nearest t>0 where a ray from s along unit d reaches center distance `rr` of c.
function rayCircle(s, d, c, rr) {
  const ex = s.x - c.x, ey = s.y - c.y;
  const b = ex * d.x + ey * d.y;
  const cc = ex * ex + ey * ey - rr * rr;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > 1e-6 ? t : Infinity;
}

// Nearest cushion the cue centre (radius cueR) reaches, with the reflection axis.
function rayWall(s, d, bounds, cueR) {
  let t = Infinity, axis = null;
  const consider = (tt, a) => { if (tt > 1e-6 && tt < t) { t = tt; axis = a; } };
  if (d.x > 0) consider((bounds.hiX - cueR - s.x) / d.x, 'x');
  if (d.x < 0) consider((bounds.loX + cueR - s.x) / d.x, 'x');
  if (d.y > 0) consider((bounds.hiY - cueR - s.y) / d.y, 'y');
  if (d.y < 0) consider((bounds.loY + cueR - s.y) / d.y, 'y');
  return { t, axis };
}

export function predictShot(start, dir, balls, cueR, bounds, maxBounces = 2) {
  let s = { x: start.x, y: start.y };
  let d = unit(dir.x, dir.y);
  const path = [{ x: s.x, y: s.y }];

  for (let bounce = 0; bounce <= maxBounces; bounce++) {
    let bt = Infinity, bhit = null;
    for (const b of balls) {
      const t = rayCircle(s, d, b, cueR + b.r);
      if (t < bt) { bt = t; bhit = b; }
    }
    const w = rayWall(s, d, bounds, cueR);

    if (bhit && bt <= w.t) {
      const ghost = { x: s.x + d.x * bt, y: s.y + d.y * bt };
      path.push(ghost);
      const objDir = unit(bhit.x - ghost.x, bhit.y - ghost.y);
      return { path, hit: { ghost, ball: bhit, objDir } };
    }

    // bounce off the cushion and continue
    const wp = { x: s.x + d.x * w.t, y: s.y + d.y * w.t };
    path.push(wp);
    if (!Number.isFinite(w.t)) break;
    d = w.axis === 'x' ? { x: -d.x, y: d.y } : { x: d.x, y: -d.y };
    s = wp;
  }
  return { path, hit: null };
}
