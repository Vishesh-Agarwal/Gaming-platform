# Smash Karts — combat (weapons, kills, timer, scoreboard)

**Date:** 2026-06-23
**Goal:** Turn the driving slice into a deathmatch: pick up weapons from crates,
shoot/trap opponents, die + respawn, **most kills in 90 s wins**.

## Feel (per the user)
HP = 100. **MG** chips slowly; **rocket** takes a big chunk (2–3 = kill); **mine**
is an instant kill; **shield** briefly blocks damage. Rockets and mines fire as a
**burst of 3** (one after another). Pickups are random from crates; you hold one
weapon at a time (pick up only when unarmed).

## Tuning
- MG: 8 dmg/bullet, fast cadence (~80 ms), 24 bullets, hold to fire, short life.
- Rocket: 45 dmg, salvo of 3 (~140 ms apart), medium speed; wall/kart = explode.
- Mine: instant kill, drop 3 behind (~200 ms apart), arm ~0.4 s, trigger radius,
  ~12 s life.
- Shield: 4 s invulnerability (consumed on use).
- Respawn 2 s after death. 3 s pre-match countdown, then 90 s clock.
- 5 crate pads; an empty pad recharges a random weapon every ~6 s.

## Server (`karts.js` — sim grows; engine passes `now`)
- `createSim(players, now)`: per-kart `{ x,z,heading,vel, hp, alive, respawnAt,
  kills, weapon, ammo, shieldUntil, prevFire, queue[], nextShotAt, gone }`;
  `crates[]` at fixed pads `{x,z,type,readyAt}`; `projectiles[]`; `startAt`,
  `endsAt`, `over`, `nextPid`.
- `step(sim, inputs, dt, now)`: countdown gate; move alive karts; auto-pickup when
  unarmed; firing (MG hold; rocket/mine burst-of-3 on rising edge via `queue`;
  shield on edge); advance projectiles + collisions (bullets/rockets damage,
  mines instakill, shield absorbs); deaths credit `killer.kills`, set respawn;
  respawn timer; match end at `endsAt` → `over=true`.
- `snapshot(sim, now)`: `{ phase, countdown, timeLeft, karts:[{i,x,z,h,hp,alive,
  kills,weapon,shield,gone}], crates:[{x,z,type}], proj:[{id,type,x,z,h}], kills }`.
- `result(sim)`: `{ over:true, winner|null, draw, scores: kills[] }` (max kills;
  tie = draw).

## Realtime engine + rooms (match end + N-player leave)
- `stepRoom(roomId, dt, now)` passes `now`; when `sim.over`, set
  `room.status='over'`, `room.result = game.result(sim)`, return `{ players, data,
  over:true, room }` (and end the room). `realtime.js` emits the final snap, then
  `game:over { room }`, then `stopMatch`.
- N-player leave: `rooms.dropFromRealtime(userId)` marks that kart `gone`, frees
  `userRooms[user]`; if <2 active remain, end the match (winner by kills) → caller
  emits `game:over` + `stopMatch`; else the match continues. `socketHandlers`
  routes realtime leaves/disconnects here instead of the 1v1 `forfeit`.

## Client (`Karts.jsx`)
- Render crates (glowing boxes, color/icon by type), projectiles (bullets =
  small glow spheres, rockets = capsules + trail, mines = pucks on the ground),
  per-kart **HP bar** + name, shield bubble when active, death explosion.
- HUD (DOM overlay): **timer**, **scoreboard** (kills per player), your weapon +
  ammo + HP, and a **countdown** / **"Time!"** banner.
- Input adds **fire** (Space / click) in the input payload.
- Match end uses the existing delayed score overlay (`Game.jsx`) — `result.scores`
  shows kills.

## Out of scope (next)
Models/textures, sound, perf tuning for 4, client-side prediction.

## Testing
Server units: pickup, MG damage reduces HP, rocket 2–3 kill + kill credit, mine
instakill, shield blocks, respawn after 2 s, salvo-of-3 counts, match ends at 90 s
with winner by kills, leave marks gone / ends when <2. Client build.
