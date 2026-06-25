# Smash Karts Combat & Weapon-Visual Tweaks — Design Spec

**Date:** 2026-06-25
**Status:** Approved
**Scope:** Smash Karts only (`karts`).

## Goal

Five player-requested changes to Smash Karts combat and presentation:

1. Remove the instant-kill "red zone" hazards entirely.
2. Make mines friend/foe aware: owner (and teammates) immune, enemies killed; color-coded per viewer (own = green, enemy = red).
3. Machine gun becomes tap-to-dump full-auto: one press empties the whole magazine.
4. Show the currently-held weapon as a model on the kart.
5. Remove the shield pickup weapon.

## Constraints (verbatim)

- **No ripped assets.** All weapon/kart/map geometry is original procedural geometry — do NOT use art from the real Smash Karts APK (IP/copyright).
- **`kartMaps.js` parity:** `server/src/games/kartMaps.js` and `client/src/games/karts/kartMaps.js` must stay byte-identical (guarded by `mapsParity` test).
- **`kartPhysics.js` parity** (server/client copies) unaffected by this work — do not touch it.
- The server test runner has **no `three` dependency**; any client file imported by a server test must not import `three`.
- Local dev: run ONLY `npm run dev`; never also `npm start` (stale-server-on-3001 gotcha).

## Decisions (locked)

- **Mine damage stays instant-kill** (999). Now telegraphed by color and avoidable.
- **MG keeps proximity auto-aim** + distance-scaled hitscan while it dumps.
- **Respawn invulnerability kept.** The brief post-respawn shield (`shieldUntil = now + 1200`) and its bubble visual stay; only the *pickup* shield weapon is removed.
- **Hazards deleted from every map**, including coliseum's lava and launchpad's gap hazard.

## Detailed Design

### 1. Remove red zones (hazards)

**Server (`server/src/games/karts.js`):**
- Delete the per-tick hazard self-damage loop in `step` (currently iterates `map.hazards` and calls `damage(sim, i, hz.dmg, i, now)`).
- Remove the `if (!k.alive) continue; // died to a hazard this tick` guard that exists only to handle hazard death.

**Maps (both parity copies — `server/src/games/kartMaps.js` and `client/src/games/karts/kartMaps.js`):**
- Remove every `hazards: [...]` array from all maps. The data-model field becomes simply absent.

**Client:**
- `scene.js`: remove the hazard mesh-building loop (the `map.hazards` `CircleGeometry` block).
- `materials.js`: remove the `hazard` material from the factory and its disposal.
- `materialParams.js`: remove any hazard-specific params if present.

### 2. Friend/foe mines

**Server:**
- In the mine trigger loop, skip the owner as well as teammates:
  `if (i === pr.owner || sameTeam(sim.karts[pr.owner], k)) continue;`
  (Owner is now immune; teammates already were.) Damage path and instant-kill value unchanged.
- Snapshot: add `owner` to mine projectile entries so clients can color per viewer. MG/rocket entries need not carry owner (only mines are color-coded), but adding `owner` uniformly is acceptable and simpler — include `owner` on all proj entries.

**Client (`Karts.jsx`):**
- When rendering a mine projectile, color it **green** when `p.owner === youAreIndex` OR the owner shares the local player's team; otherwise **red**. Friend/foe is computed client-side from `owner` + the team config already available to the client (`cfg.teams`).

### 3. MG tap-to-dump full-auto

**Server:**
- Add a per-kart latch `mgAuto` (boolean).
- On the **rising edge** of fire while `weapon === 'mg'` and `ammo > 0`, set `mgAuto = true`.
- Each tick: while `mgAuto && weapon === 'mg' && ammo > 0 && now >= nextShotAt`, fire one shot (existing auto-aim + hitscan), drain 1 ammo, set `nextShotAt = now + MG.cadence`. The fire button no longer needs to be held.
- When `ammo <= 0`: clear weapon (`weapon = null`, `ammo = 0`) and reset `mgAuto = false`.
- Reset `mgAuto = false` whenever the kart's weapon changes away from `'mg'` (pickup of a new crate, death/respawn clearing weapon).
- Initialize `mgAuto: false` in kart creation alongside other weapon fields.

### 4. Held weapon visible on kart

**Client (`kartModel.js`):**
- In `makeKart`, build three small **procedural** weapon attachments, added to the group, all `visible = false` initially:
  - **MG** — a short twin-barrel block mounted on the roof/front.
  - **Rocket** — a launcher tube angled forward.
  - **Mine** — a small rack/stack of disc shapes at the rear.
- Store references in `userData.weapons = { mg, rocket, mine }`.
- `updateKart(group, { ..., weapon })`: set each attachment's visibility so only the one matching `weapon` is shown; all hidden when `weapon` is null/unknown.

**Client (`Karts.jsx`):**
- Pass the snapshot kart's `weapon` into the existing `updateKart(...)` call.

### 5. Remove shield weapon

**Server:**
- Remove `'shield'` from `WEAPONS` (so crates never roll shield).
- Delete the `SHIELD` const and the `weapon === 'shield'` firing branch in `step`.
- Keep `shieldUntil`, the respawn `shieldUntil = now + 1200`, the `damage()` shield-absorb check, and the `shield` snapshot flag — these now reflect respawn protection only.

**Client:**
- Keep the shield bubble mesh in `kartModel.js` (driven by the `shield` snapshot flag → respawn protection).
- HUD: shield no longer appears as a held weapon (it isn't in `WEAPONS` and `weapon` is never `'shield'`, so no HUD change may be needed — verify the weapon HUD label/icon map has no shield-only assumption).

## Testing

Server `node --test` suite (`cd server && npm test`):
- **Remove/adjust** tests asserting hazard damage and shield-as-pickup behavior. `coliseum.test.js` and any map test asserting hazards must drop those assertions.
- **Add:** enemy driving over a mine dies; owner driving over own mine is unharmed; teammate over an ally's mine is unharmed (teams mode).
- **Add:** mine projectile snapshot entry includes `owner`.
- **Add:** MG latch — a single `fire` rising edge followed by `fire: false` ticks drains the full magazine over cadence ticks and clears the weapon.
- Confirm `mapsParity` still passes after editing both `kartMaps.js` copies.

Client verified by `npm run build --prefix client` (no render-test harness; weapon visuals are build- + manual-gated).

## Out of Scope

- Projectile-vs-obstacle horizontal blocking, fall damage, moving platforms, curved ramps.
- Any change to `kartPhysics.js`, lobby, or non-karts games.
