# Smash Karts Combat & Weapon-Visual Tweaks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove red-zone hazards and the shield pickup, make mines friend/foe aware, make the MG dump its magazine on one press, and show the held weapon on the kart.

**Architecture:** Server combat changes in `server/src/games/karts.js`; map-data edits in the two byte-identical `kartMaps.js` copies; client render changes in `Karts.jsx`, `kartModel.js`, `scene.js`, `materials.js`. Server behavior is tested with `node --test`; client visuals are build-verified.

**Tech Stack:** Node (ESM, `node --test`), React + Vite, Three.js (client only).

## Global Constraints

- No ripped assets — all geometry is original procedural geometry (no Smash Karts APK art).
- `server/src/games/kartMaps.js` and `client/src/games/karts/kartMaps.js` must stay byte-identical (guarded by `mapsParity.test.js`). Every map edit happens in BOTH files identically.
- `kartPhysics.js` (both copies) must NOT be touched.
- The server test runner has no `three`; do not import `three` from any file a server test imports.
- Mine damage stays instant-kill (999). MG keeps proximity auto-aim. Respawn invulnerability (`shieldUntil = now + 1200`) and its bubble are kept.
- Run only `npm run dev` for local dev (never `npm start`).
- Test commands: server `npm test --prefix server`; client `npm run build --prefix client`.

---

### Task 1: Remove the shield pickup weapon

**Files:**
- Modify: `server/src/games/karts.js` (WEAPONS line 15, SHIELD const line 19, shield branch lines 302-304)
- Modify: `client/src/games/Karts.jsx` (WEAPON_COLOR line 17, WEAPON_LABEL line 18)
- Test: `server/test/weapons.test.js` (create)

**Interfaces:**
- Produces: named export `WEAPONS` from `karts.js` (array of weapon-type strings), so tests and future code can assert the weapon pool.

- [ ] **Step 1: Write the failing test**

Create `server/test/weapons.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../src/games/karts.js';

test('weapon pool has mg/rocket/mine and no shield', () => {
  assert.ok(WEAPONS.includes('mg'));
  assert.ok(WEAPONS.includes('rocket'));
  assert.ok(WEAPONS.includes('mine'));
  assert.ok(!WEAPONS.includes('shield'), 'shield pickup removed');
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npm test --prefix server 2>&1 | grep -A2 "weapon pool"`
Expected: FAIL — `WEAPONS` is not an export yet / still includes `'shield'`.

- [ ] **Step 3: Make WEAPONS a named export minus shield**

In `server/src/games/karts.js` line 15, change:

```js
const WEAPONS = ['mg', 'rocket', 'mine', 'shield'];
```

to:

```js
export const WEAPONS = ['mg', 'rocket', 'mine'];
```

- [ ] **Step 4: Delete the SHIELD const**

In `server/src/games/karts.js`, delete line 19:

```js
const SHIELD = { dur: 4000 };
```

- [ ] **Step 5: Delete the shield firing branch**

In `server/src/games/karts.js`, delete lines 302-304 (the whole `else if (k.weapon === 'shield') { ... }` block):

```js
    } else if (k.weapon === 'shield') {
      if (rising) { k.shieldUntil = now + SHIELD.dur; k.weapon = null; k.ammo = 0; }
    }
```

so the firing chain ends after the `rocket`/`mine` branch. (Keep `k.prevFire = fire;` on the next line.)

- [ ] **Step 6: Remove shield from the client weapon HUD maps**

In `client/src/games/Karts.jsx` lines 17-18, change:

```js
const WEAPON_COLOR = { mg: '#22e0ff', rocket: '#ff7a3c', mine: '#ffd24a', shield: '#8bd450' };
const WEAPON_LABEL = { mg: 'Machine gun', rocket: 'Rockets', mine: 'Mines', shield: 'Shield' };
```

to:

```js
const WEAPON_COLOR = { mg: '#22e0ff', rocket: '#ff7a3c', mine: '#ffd24a' };
const WEAPON_LABEL = { mg: 'Machine gun', rocket: 'Rockets', mine: 'Mines' };
```

- [ ] **Step 7: Run tests + build**

Run: `npm test --prefix server` → all pass (incl. new weapons test; the existing autoMg "shielded nearest target absorbs damage" test still passes — it uses `shieldUntil`, the respawn mechanism we kept).
Run: `npm run build --prefix client` → builds clean.

- [ ] **Step 8: Commit**

```bash
git add server/src/games/karts.js client/src/games/Karts.jsx server/test/weapons.test.js
git commit -m "feat(karts): remove shield pickup weapon (keep respawn invuln)"
```

---

### Task 2: Remove red-zone hazards

**Files:**
- Modify: `server/src/games/karts.js` (hazard loop lines 257-262)
- Modify: `server/src/games/kartMaps.js` (hazards at lines 34, 58, 82, 96, 126)
- Modify: `client/src/games/karts/kartMaps.js` (same lines — keep byte-identical)
- Modify: `client/src/games/karts/scene.js` (hazard mesh loop, lines 97-103)
- Modify: `client/src/games/karts/materials.js` (hazard material, lines 121-125 + factory return + dispose)
- Test: `server/test/maps.test.js` (remove the hazard test, lines 29-37)

**Interfaces:**
- Produces: maps no longer carry a `hazards` field; `map.hazards` is `undefined` everywhere.

- [ ] **Step 1: Delete the hazard test**

In `server/test/maps.test.js`, delete the whole test block (lines 29-37):

```js
test('hazard zone damages a kart standing in it (server-side)', () => {
  ...
  assert.ok(sim.karts[0].hp < before || !sim.karts[0].alive, 'hazard should reduce hp');
});
```

- [ ] **Step 2: Run the suite to confirm it's green without that test**

Run: `npm test --prefix server`
Expected: PASS (the removed test no longer runs; nothing else references hazards yet).

- [ ] **Step 3: Delete the server hazard loop**

In `server/src/games/karts.js`, delete lines 257-262:

```js
    // hazard zones: server-authoritative self-damage (no kill credit; shield/spawn-protect applies via damage())
    for (const hz of map.hazards) {
      const hx = k.x - hz.x, hz2 = k.z - hz.z;
      if (hx * hx + hz2 * hz2 < hz.r * hz.r) { damage(sim, i, hz.dmg, i, now); break; }
    }
    if (!k.alive) continue; // died to a hazard this tick
```

(The next line, `// pick up a weapon when unarmed`, now follows directly after `const fire = ...`.)

- [ ] **Step 4: Remove the `hazards` field from every map in BOTH kartMaps copies**

Apply identical edits to `server/src/games/kartMaps.js` AND `client/src/games/karts/kartMaps.js`.

- Line 21 comment — change:
  `// hazards: {x,z,r,dmg} (server-side damage; 999 = instakill). boosts: {x,z,r,strength}.`
  to:
  `// boosts: {x,z,r,strength}.`
- Line 34 `hazards: [], boosts: [],` → `boosts: [],`
- Line 58 `hazards: [],` → delete the whole line.
- Line 82 `hazards: [{ x: 0, z: -25, r: 7, dmg: 40 }],` → delete the whole line.
- Line 96 `hazards: [{ x: 0, z: 8, r: 8, dmg: 40 }],` → delete the whole line.
- Line 126 onward — delete the entire multi-line `hazards: [ ... ],` block (coliseum's lava).

- [ ] **Step 5: Confirm parity holds**

Run: `npm test --prefix server 2>&1 | grep -i "mapsParity\|parity"`
Expected: the maps-parity test passes (both files edited identically). If it fails, the two copies diverged — diff them and align.

- [ ] **Step 6: Remove client hazard rendering**

In `client/src/games/karts/scene.js`, delete the hazard mesh loop (lines 97-103):

```js
  // Hazard zones — realistic lava/oil patches (no glow).
  for (const hz of map.hazards || []) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(hz.r, 32), mat.hazard);
    m.rotation.x = -Math.PI / 2;
    m.position.set(hz.x, 0.04, hz.z);
    scene.add(m);
  }
```

- [ ] **Step 7: Remove the hazard material**

In `client/src/games/karts/materials.js`:
- Delete the hazard material definition (lines 121-125: the `hazardTex` + `hazard` `MeshStandardMaterial`).
- Remove `hazard` from the factory return object (line 134: `sky, environment, asphalt, grass, wall, block, ramp, hazard, boost` → drop `hazard`).
- Remove `hazard` from the dispose list (line 137: `for (const m of [asphalt, grass, wall, block, ramp, hazard, boost]) m.dispose();` → drop `hazard`).
- If `HAZARD_GLOW` becomes unused after this, delete its declaration too (search the file for `HAZARD_GLOW`).

- [ ] **Step 8: Build the client**

Run: `npm run build --prefix client`
Expected: builds clean (no reference to `mat.hazard` or `HAZARD_GLOW` remains).

- [ ] **Step 9: Commit**

```bash
git add server/src/games/karts.js server/src/games/kartMaps.js client/src/games/karts/kartMaps.js client/src/games/karts/scene.js client/src/games/karts/materials.js server/test/maps.test.js
git commit -m "feat(karts): remove red-zone hazards from maps + render"
```

---

### Task 3: Friend/foe mines (owner immunity + owner in snapshot)

**Files:**
- Modify: `server/src/games/karts.js` (mine trigger loop line 318; snapshot `proj` map line 364)
- Test: `server/test/mines.test.js` (create)

**Interfaces:**
- Consumes: `game.createSim(players, host, options)`, `game.step(sim, inputs, dt, now)`, `game.snapshot(sim, now)` (existing default export).
- Produces: mine projectile snapshot entries include `owner` (the firing kart's index); a mine no longer damages its owner.

- [ ] **Step 1: Write the failing tests**

Create `server/test/mines.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../src/games/karts.js';

const NOW = 5000; // > startAt (countdown), < endsAt
// Drop a mine from kart `owner` at its current position, then advance time
// past the mine's arm delay so it can trigger.
function simWithMine(ownerPos, owner, opts = {}) {
  const n = opts.n || 2;
  const sim = game.createSim(Array.from({ length: n }, () => ({})), 0,
    { map: 'arena', ...(opts.mode ? { mode: opts.mode, teams: opts.teams } : {}) });
  const k = sim.karts[owner];
  k.x = ownerPos[0]; k.z = ownerPos[1]; k.y = 0; k.grounded = true; k.vy = 0;
  k.weapon = 'mine'; k.ammo = 1; k.queue = [];
  const inputs = Array.from({ length: n }, (_, i) => (i === owner ? { last: { fire: true } } : {}));
  game.step(sim, inputs, 1 / 30, NOW); // places + arms-pending the mine
  return sim;
}

test('an enemy driving over a mine is killed', () => {
  const sim = simWithMine([20, 0], 0);
  const enemy = sim.karts[1];
  enemy.x = 20; enemy.z = 0; enemy.y = 0; enemy.grounded = true; enemy.alive = true;
  game.step(sim, [{}, {}], 1 / 30, NOW + 1000); // past arm delay
  assert.equal(enemy.alive, false, 'enemy over mine should die');
});

test('the owner driving over their own mine is unharmed', () => {
  const sim = simWithMine([20, 0], 0);
  const owner = sim.karts[0];
  owner.x = 20; owner.z = 0; // stand on own mine
  const hpBefore = owner.hp;
  game.step(sim, [{}, {}], 1 / 30, NOW + 1000);
  assert.equal(owner.alive, true, 'owner immune to own mine');
  assert.equal(owner.hp, hpBefore, 'owner takes no damage from own mine');
});

test('a teammate driving over an ally mine is unharmed (teams mode)', () => {
  const sim = simWithMine([20, 0], 0, { n: 4, mode: 'teams', teams: [0, 1, 0, 1] });
  const ally = sim.karts[2]; // same team as owner (0)
  ally.x = 20; ally.z = 0; ally.y = 0; ally.grounded = true; ally.alive = true;
  game.step(sim, [{}, {}, {}, {}], 1 / 30, NOW + 1000);
  assert.equal(ally.alive, true, 'teammate immune to ally mine');
});

test('mine snapshot entries carry their owner index', () => {
  const sim = simWithMine([20, 0], 0);
  const snap = game.snapshot(sim, NOW);
  const mine = snap.proj.find((p) => p.type === 'mine');
  assert.ok(mine, 'a mine projectile exists');
  assert.equal(mine.owner, 0);
});
```

- [ ] **Step 2: Run, expect failures**

Run: `npm test --prefix server 2>&1 | grep -E "own mine|teammate immune|carry their owner"`
Expected: FAIL — owner currently self-triggers (dies), and snapshot mine has no `owner`.

- [ ] **Step 3: Make the owner immune to their own mine**

In `server/src/games/karts.js` line 318, change:

```js
          if (i !== pr.owner && sameTeam(sim.karts[pr.owner], k)) continue; // teammates safe; owner can still self-trigger
```

to:

```js
          if (i === pr.owner || sameTeam(sim.karts[pr.owner], k)) continue; // owner + teammates safe
```

- [ ] **Step 4: Add `owner` to the projectile snapshot**

In `server/src/games/karts.js` line 364, change:

```js
    proj: sim.projectiles.map((p) => ({ id: p.id, type: p.type, x: r1(p.x), y: r1(p.y || 0), z: r1(p.z), h: r1(p.h || 0) })),
```

to:

```js
    proj: sim.projectiles.map((p) => ({ id: p.id, type: p.type, owner: p.owner, x: r1(p.x), y: r1(p.y || 0), z: r1(p.z), h: r1(p.h || 0) })),
```

- [ ] **Step 5: Run tests**

Run: `npm test --prefix server`
Expected: PASS (all four new mine tests + the rest of the suite).

- [ ] **Step 6: Commit**

```bash
git add server/src/games/karts.js server/test/mines.test.js
git commit -m "feat(karts): friend/foe mines — owner immune, owner in snapshot"
```

---

### Task 4: MG tap-to-dump full-auto

**Files:**
- Modify: `server/src/games/karts.js` (kart creation line 138-139; giveWeapon ~line 158; clearWeapon line 202; MG firing branch lines 277-290)
- Test: `server/test/mgLatch.test.js` (create)

**Interfaces:**
- Consumes: existing default export (`createSim`, `step`).
- Produces: a kart's MG, once fired, empties its full magazine over cadence ticks without the fire button held; a per-kart `mgAuto` flag governs this and resets on weapon change / empty.

- [ ] **Step 1: Write the failing test**

Create `server/test/mgLatch.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../src/games/karts.js';

const NOW = 5000;

test('one MG press drains the whole magazine over ticks, no hold needed', () => {
  const sim = game.createSim([{}, {}], 0, { map: 'arena' });
  const k = sim.karts[0];
  k.x = 20; k.z = 0; k.y = 0; k.grounded = true;
  k.weapon = 'mg'; k.ammo = 5; k.nextShotAt = 0; k.prevFire = false;

  // Single press this tick:
  game.step(sim, [{ last: { fire: true } }, {}], 1 / 30, NOW);
  assert.equal(k.ammo, 4, 'first shot fired on press');

  // Release the button; advance time past cadence each tick. It must keep firing.
  let t = NOW;
  for (let s = 0; s < 10 && k.weapon === 'mg'; s++) {
    t += 200; // > MG.cadence (90)
    game.step(sim, [{}, {}], 1 / 30, t);
  }
  assert.equal(k.ammo, 0, 'magazine fully drained without holding fire');
  assert.equal(k.weapon, null, 'weapon clears when empty');
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test --prefix server 2>&1 | grep -A2 "whole magazine"`
Expected: FAIL — currently the MG only fires while `fire` is held, so releasing stops it and `ammo` stays > 0.

- [ ] **Step 3: Add the `mgAuto` field to kart creation**

In `server/src/games/karts.js` lines 138-139, change:

```js
      weapon: null, ammo: 0, shieldUntil: 0,
      prevFire: false, queue: [], nextShotAt: 0, gone: false, lastSeq: 0,
```

to:

```js
      weapon: null, ammo: 0, shieldUntil: 0, mgAuto: false,
      prevFire: false, queue: [], nextShotAt: 0, gone: false, lastSeq: 0,
```

- [ ] **Step 4: Reset `mgAuto` on weapon pickup and on clear**

In `giveWeapon` (around line 158, where `k.queue = [];` is set), add `k.mgAuto = false;` so a freshly-picked MG needs a new press.

In `clearWeapon`/respawn clear at line 202, change:

```js
  v.weapon = null; v.ammo = 0; v.queue = [];
```

to:

```js
  v.weapon = null; v.ammo = 0; v.queue = []; v.mgAuto = false;
```

- [ ] **Step 5: Rewrite the MG firing branch as a latch**

In `server/src/games/karts.js`, replace the MG branch (lines 277-290):

```js
    if (k.weapon === 'mg') {
      if (fire && k.ammo > 0 && now >= k.nextShotAt) {
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
        if (k.ammo <= 0) k.weapon = null;
      }
    } else if (k.weapon === 'rocket' || k.weapon === 'mine') {
```

with:

```js
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
```

- [ ] **Step 6: Run tests**

Run: `npm test --prefix server`
Expected: PASS (new mgLatch test + the existing autoMg tests: those press fire on the firing kart every step, so the magazine still drains as before — the latch only adds "keeps firing after release").

- [ ] **Step 7: Commit**

```bash
git add server/src/games/karts.js server/test/mgLatch.test.js
git commit -m "feat(karts): MG dumps full magazine on one press (auto latch)"
```

---

### Task 5: Client visuals — per-viewer mine color + held weapon on kart

**Files:**
- Modify: `client/src/games/karts/kartModel.js` (`makeKart` — add weapon attachments; `updateKart` — add `weapon` param)
- Modify: `client/src/games/Karts.jsx` (`makeProj` ~line 80; the proj create call ~line 318; the `updateKart` call line 256)
- Verified by: `npm run build --prefix client`

**Interfaces:**
- Consumes: snapshot `proj[].owner` (from Task 3), snapshot `kart.weapon`, `youAreIndex`, `cfg.teams`/`teamMode` (already in `Karts.jsx` setup scope).
- Produces: weapon attachment meshes on each kart; mine meshes colored green (friendly) / red (enemy) per local viewer.

- [ ] **Step 1: Add weapon attachments to `makeKart`**

In `client/src/games/karts/kartModel.js`, just before the `g.userData = {...}` line (line 61), insert:

```js
  // Held-weapon attachments — original procedural geometry; only the active one shows.
  const wMat = new THREE.MeshStandardMaterial({ color: '#2c2f36', roughness: 0.5, metalness: 0.6 });

  const mgW = new THREE.Group();
  const mgBarrel = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 10);
  for (const bx of [-0.18, 0.18]) {
    const barrel = new THREE.Mesh(mgBarrel, wMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(bx, 0, 0.7); mgW.add(barrel);
  }
  mgW.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.5), wMat));
  mgW.position.set(0, 1.5, 0.7); g.add(mgW);

  const rocketW = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 12), wMat);
  tube.rotation.x = Math.PI / 2; tube.position.z = 0.4; rocketW.add(tube);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 12),
    new THREE.MeshStandardMaterial({ color: '#ff7a3c', roughness: 0.5, metalness: 0.3 }));
  tip.rotation.x = Math.PI / 2; tip.position.z = 1.4; rocketW.add(tip);
  rocketW.position.set(0, 1.55, 0.3); g.add(rocketW);

  const mineW = new THREE.Group();
  const discGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.18, 12);
  const discMat = new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.6, metalness: 0.4 });
  for (const [dx, dy] of [[-0.3, 0], [0.3, 0], [0, 0.22]]) {
    const disc = new THREE.Mesh(discGeo, discMat); disc.position.set(dx, dy, 0); mineW.add(disc);
  }
  mineW.position.set(0, 1.5, -1.5); g.add(mineW);

  for (const w of [mgW, rocketW, mineW]) w.visible = false;
```

- [ ] **Step 2: Store weapon refs in userData**

In `client/src/games/karts/kartModel.js`, change the `g.userData = {...}` line (line 61):

```js
  g.userData = { wheels, shield, bodyMat, baseColor: new THREE.Color(color), body };
```

to:

```js
  g.userData = { wheels, shield, bodyMat, baseColor: new THREE.Color(color), body, weapons: { mg: mgW, rocket: rocketW, mine: mineW } };
```

- [ ] **Step 3: Toggle weapon visibility in `updateKart`**

In `client/src/games/karts/kartModel.js`, change the signature (line 67):

```js
export function updateKart(group, { speed, turn, hp, shield, now }) {
```

to:

```js
export function updateKart(group, { speed, turn, hp, shield, weapon, now }) {
```

and, inside the function (after `const ud = group.userData;`), add:

```js
  if (ud.weapons) {
    ud.weapons.mg.visible = weapon === 'mg';
    ud.weapons.rocket.visible = weapon === 'rocket';
    ud.weapons.mine.visible = weapon === 'mine';
  }
```

- [ ] **Step 4: Pass `weapon` from the render loop**

In `client/src/games/Karts.jsx` line 256, change:

```js
          updateKart(g, { speed, turn, hp: meta?.hp ?? 100, shield: visible && meta?.shield, now: performance.now() });
```

to:

```js
          updateKart(g, { speed, turn, hp: meta?.hp ?? 100, shield: visible && meta?.shield, weapon: meta?.weapon, now: performance.now() });
```

- [ ] **Step 5: Color mines per local viewer**

In `client/src/games/Karts.jsx`, add a friend/foe helper in the setup scope (near `bodyColor`, around line 40):

```js
    const mineFriendly = (owner) =>
      owner === youAreIndex || (teamMode && cfg.teams[owner] === cfg.teams[youAreIndex]);
```

Change `makeProj` (line 80) to accept a mine color:

```js
    const makeProj = (type, mineColor = '#ff5d6c') => {
      let m;
      if (type === 'mine') {
        m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 16),
          new THREE.MeshStandardMaterial({ color: mineColor, emissive: mineColor, emissiveIntensity: 0.6 }));
        const warn = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 20),
          new THREE.MeshBasicMaterial({ color: mineColor, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
        warn.rotation.x = -Math.PI / 2; warn.position.y = -0.18; m.add(warn);
      } else if (type === 'rocket') {
```

(the rest of `makeProj` is unchanged.)

Change the create call (line 318) from:

```js
            mesh = makeProj(p.type); scene.add(mesh); projMap.set(p.id, mesh);
```

to:

```js
            mesh = makeProj(p.type, mineFriendly(p.owner) ? '#5cd860' : '#ff5d6c'); scene.add(mesh); projMap.set(p.id, mesh);
```

- [ ] **Step 6: Build the client**

Run: `npm run build --prefix client`
Expected: builds clean.

- [ ] **Step 7: Commit**

```bash
git add client/src/games/karts/kartModel.js client/src/games/Karts.jsx
git commit -m "feat(karts): show held weapon on kart + friend/foe mine colors"
```

---

## Final verification

- [ ] `npm test --prefix server` — full suite green.
- [ ] `npm run build --prefix client` — clean build.
- [ ] Then use **superpowers:finishing-a-development-branch**.

## Notes for the manual playtest (after merge)

- Confirm no red zones on any map (arena/pillars/gauntlet/launchpad/coliseum).
- Drop a mine: it shows green to you, harmless to you; an opponent sees it red and dies on contact.
- Tap MG once: it empties the whole magazine on nearest enemies, then the weapon clears.
- The held weapon (MG/rocket/mine) is visible on the kart; nothing shows when unarmed.
- No shield pickup appears; respawning still gives a brief protective bubble.
