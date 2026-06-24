# Smash Karts — Proximity Auto-MG (Sub-project 2) Design

**Date:** 2026-06-24
**Status:** Approved design — ready for implementation plan
**Sub-project:** 2 of 3 in the Smash Karts visual + combat + team-play initiative
(order: 1. realistic visuals ✅ DONE → 2. proximity auto-MG → 3. 2v2/4v4 + expanded map).

## Goal

Turn the machine gun from a manually-aimed forward-firing weapon into a
**proximity auto-aim weapon**, like the real Smash Karts MG: while the player
holds fire, it automatically targets the nearest visible enemy within range and
deals **distance-scaled damage** (closer = more, farther = less). Only the MG
changes; rocket, mine, and shield are untouched.

## Locked behavior

- **Trigger:** the player must hold/press the fire button (not a hands-off
  turret).
- **Target:** the single **nearest** enemy that is alive, not gone, not self,
  **within `MG_RANGE`** (horizontal x/z distance), **and with a clear line of
  sight**. The lock re-evaluates every shot tick (it follows whoever is the
  nearest valid target now).
- **Hit model:** **hitscan** — damage is applied instantly and reliably the
  moment the shot fires (no travel-time miss). A cosmetic bullet is spawned for
  visuals only.
- **Damage:** scaled by the target's distance (see Damage falloff).
- **No valid target in range/sight:** the MG **still fires** — a cosmetic bullet
  goes straight ahead (along the kart heading, "idle" fire) and **ammo is still
  spent** — it simply deals no damage. So holding fire always drains the
  magazine whether or not anything is hit.
- **Out of ammo:** the weapon clears (`weapon = null`); the player must drive
  over another crate to pick up a new weapon (existing pickup logic).

## Non-goals

- No change to rocket, mine, or shield.
- No client-side prediction of combat (firing/targeting/damage stay fully
  server-authoritative, as today). The client only renders the cosmetic bullet.
- No new weapon, no UI/HUD redesign.
- No change to physics, maps data, or the realtime engine.

## Constraints (binding)

- All combat logic stays in `server/src/games/karts.js`; firing, targeting, and
  damage are computed server-side only.
- Damage must route through the existing `damage(sim, victimIdx, dmg, ownerIdx,
  now)` so shield and spawn-protection still absorb it and kill credit still
  works.
- The snapshot `proj` shape stays unchanged so the client renderer needs no
  structural change.
- Original assets only; no new dependencies.
- Server test suite must stay green and gain coverage for the new logic.

## Architecture / changes

### `server/src/games/karts.js`

**1. New constants** (the tuning knobs):
```
MG_RANGE = 15        // max horizontal distance to lock a target
MG_DMG_NEAR = 8      // damage at point-blank (dist 0)
MG_DMG_FAR = 2.5     // damage at MG_RANGE
```
The existing `MG` object keeps `speed`, `life`, `ammo: 24`, `cadence: 90`, `r`.
`MG.dmg` is no longer used for the flat value (replaced by the falloff); leave or
remove it as the implementation prefers, but the falloff constants are the source
of truth.

**2. New helper `lineOfSightClear(map, x0, z0, x1, z1) -> boolean`** (named
export for unit testing). Returns `false` if the segment from (x0,z0) to (x1,z1)
crosses any **solid blocking obstacle** footprint:
- `kind: 'box'` obstacles — segment vs axis-aligned rectangle footprint.
- `kind: 'cyl'` obstacles — segment vs circle (distance from center to segment
  `< r`).
- `ramps` that are **flat plateaus** (`loY === hiY`, solid mesa blocks) — treated
  as box footprints.
Sloped wedge ramps (`loY !== hiY`) do **not** block. An obstacle whose footprint
**contains either endpoint** is skipped (so a target standing on a mesa is not
blocked by its own mesa, and a shooter inside/under an obstacle isn't self-
blocked). The arena perimeter walls are not considered (both karts are always
inside them).

**3. New helper for target selection** (inline or small function): given the
shooter index, scan all karts and return the index of the nearest valid target —
`alive && !gone && idx !== self`, horizontal `dist < MG_RANGE`, and
`lineOfSightClear(...)` true — or `null` if none.

**4. New damage falloff:**
```
mgDamage(dist) = MG_DMG_NEAR + (MG_DMG_FAR - MG_DMG_NEAR) * clamp(dist / MG_RANGE, 0, 1)
```

**5. Rewrite the `mg` branch of `step`:** replace the current
"fire straight ahead" block. While `fire && k.ammo > 0 && now >= k.nextShotAt`,
**always fire one shot** (every tick spends ammo and advances cooldown):
- Find the nearest valid target.
- **If found** (index `t`, distance `dist`): `damage(sim, t, mgDamage(dist), i,
  now)` and spawn a cosmetic tracer-bullet aimed at the target's current
  position.
- **If none found:** spawn a cosmetic bullet straight ahead (along `k.heading`),
  deal no damage (idle fire).
- In both cases: `k.ammo -= 1`; `k.nextShotAt = now + MG.cadence`;
  `if (k.ammo <= 0) k.weapon = null` (so the player must collect another crate).

**6. Cosmetic MG bullets:** the spawned MG projectile is **visual only**. In the
projectile-update loop, MG-type projectiles no longer hit-test karts or deal
damage — they travel from the barrel toward the target and expire on
life/wall/ground exactly as now. Rocket and mine projectiles keep their existing
hit-tests and damage. `fireProjectile` is adjusted so MG bullets are aimed at the
target (direction = normalized barrel→target in x/z, keeping the existing
`speed`/`life`; `vy` from the small height delta or 0) rather than along the
kart heading.

### Client `client/src/games/Karts.jsx`

No structural change required — MG bullets still arrive in the `proj` snapshot
list and render with the existing bullet mesh. (Optional, deferred polish: a
brief muzzle flash or a thin tracer line; not part of this sub-project.)

## Data flow

`fire` input (already plumbed) → `step` MG branch → nearest-valid-target scan
(range + LOS) → `damage()` (shield/spawn-protect/kill-credit honored) →
cosmetic bullet pushed to `sim.projectiles` → `snapshot.proj` → client renders.

## Edge cases

- **Shielded / spawn-protected nearest target:** still locked and shot (ammo
  spent); `damage()` no-ops. Deliberate (matches real behavior; avoids
  complex "skip shielded" targeting).
- **Target on a different elevation:** targeting/range/damage use horizontal
  (x/z) distance; the target's own mesa does not block LOS (endpoint-containment
  rule).
- **Multiple equidistant targets:** first found in index order wins (stable,
  deterministic).
- **Self / dead / gone karts:** never targeted (but the gun still idle-fires at
  nothing, spending ammo).
- **Out of range or blocked by a wall:** the MG still fires forward (idle, no
  damage) and still spends ammo + advances cooldown.

## Testing (`node --test` in `server/test/`)

This logic is fully server-deterministic, so it gets real automated coverage. New
file `server/test/autoMg.test.js` (plus a focused `lineOfSightClear` test, may be
same file):
- **Nearest selection:** two enemies at different distances → the closer one
  takes damage.
- **Range gate:** the only enemy is just beyond `MG_RANGE` → no damage, ammo
  unchanged.
- **Damage falloff:** a near shot deals more than a far shot; assert the exact
  `mgDamage(dist)` values at two distances.
- **Line of sight:** an enemy in range but behind a box/cyl/plateau → not hit;
  move the blocker aside → hit. Direct `lineOfSightClear` asserts for box, cyl,
  flat plateau (blocks), sloped wedge (does not block), and endpoint-containment
  (target on a mesa is reachable).
- **Shield/spawn-protect:** shielded nearest target absorbs (no hp loss) while
  ammo is still spent.
- **Exclusions:** dead/gone/self never targeted (no damage dealt to them).
- **Idle fire with no target:** holding fire with no valid target still spends
  one ammo per tick, advances `nextShotAt`, and spawns a forward cosmetic bullet,
  but deals no damage to anyone.
- **Ammo depletion clears weapon:** firing (hitting or whiffing) until ammo
  reaches 0 sets `weapon = null`, after which driving over a crate re-arms.
- **Cosmetic bullet:** an MG projectile present in the sim does not reduce any
  kart's hp as it travels (only the hitscan at fire time damages).
- **Kill credit:** an MG shot that drops a target to 0 hp credits the shooter's
  `kills`.

## Tuning knobs (for post-merge feel tuning)

`MG_RANGE` (15), `MG_DMG_NEAR` (8), `MG_DMG_FAR` (2.5), `MG.cadence` (90),
`MG.ammo` (24). Note: because every shot now lands (hitscan), the MG is
materially stronger than the old miss-prone version — expect to tune these down
after playtest.

## Out-of-scope / future

- Line-of-sight in full 3D (height-aware occlusion) — current LOS is 2D
  footprint with the endpoint-containment rule.
- Muzzle flash / tracer-line client polish.
- Team-aware targeting (don't shoot teammates) — arrives with sub-project 3
  (2v2/4v4); until then all non-self karts are enemies.
