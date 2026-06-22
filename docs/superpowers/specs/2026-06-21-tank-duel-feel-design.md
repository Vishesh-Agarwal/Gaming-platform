# Tank Duel — destructible terrain, real movement & command-console UI

**Date:** 2026-06-21
**Game:** `artillery` ("Tank Duel"), turn-based, server-authoritative referee.
**Goal:** Make Tank Duel feel real — destructible ground, weighty driving, and a
themed "fire control" UI.

## Scope

Three cohesive changes to the existing game. No new netcode (still
`game:move` → `game:state`). Out of scope this pass: best-of-3 rounds, sound.

## 1. Destructible terrain + debris

**Server (`server/src/games/artillery.js`) — authoritative.**
- The `ground` heightmap is already in state and broadcast each move.
- On a non-off-screen impact, carve a crater of radius `CRATER_R` (~55px):
  for each ground column within `dx = |x − impact.x| ≤ R`,
  `newY = min(H, max(oldY, impact.y + √(R² − dx²)))` (y grows downward, so a
  larger y = lower surface = a bowl). Craters are permanent and accumulate, so
  later trajectories and landings change; hills can be dug through.
- Tanks store no `y`; they are always placed on the surface at their `x`. Carving
  under a tank therefore makes it **settle** with no extra logic.
- `lastShot` gains `crater: { x, y, r }` (omitted when the shell flew off-screen).

**Client (`client/src/games/Artillery.jsx`) — visual only.**
- Maintain a `displayedGround` array used for rendering and tank placement.
- During the shell's flight, render the *old* terrain (don't reveal the crater
  early). At the boom moment, carve `displayedGround` locally with the same
  formula, then snap it to authoritative `st.ground`.
- At impact, spawn ~18 dirt **debris particles** (terrain-colored, gravity,
  fade) flying out of the crater for the "blasted away" feel.

## 2. Real tank movement

Client-side feel only; the server move-budget clamp is unchanged.
- Replace stepped driving with **velocity-based driving** in the rAF loop:
  a `heldDir` (−1/0/+1) from `A/D` or the `◀ ▶` buttons accelerates `driveVel`
  toward `±MAX_DRIVE_SPEED` (~2.2 px/frame) with friction on release — eases in
  and out instead of teleporting.
- Displacement from the turn's start is capped by `state.moveBudget`
  (matches the server clamp). Hitting the cap stops the tank.
- Render: tank **body rotates to the terrain slope**, **wheels/treads animate**
  with distance, and a small **dust puff** trail spawns while moving.
- The final position is still sent with the shot (`move.x`).

## 3. Command-console (military) UI

Redesign the control bar (`client/src/games/Artillery.jsx` + `styles.css`) into a
"FIRE CONTROL" panel.
- Dark-olive panel, amber accents, uppercase Orbitron labels + monospace
  readouts (all offline-safe, no new fonts).
- **Angle**: small SVG **dial gauge** with a needle.
- **Power** and **Fuel**: segmented charge meters.
- **Wind**: direction arrow + value.
- Controls: **DRIVE ◀ ▶** (hold to drive) and a prominent **FIRE** button.
- Turn state reads **YOUR SHOT / OPPONENT / INCOMING**.
- On-canvas HP bars and wind gauge stay.
- Cheap extra that sells destruction: a small **smoking wreck** look when a tank
  reaches 0 HP.

## Data flow

Unchanged turn-based referee. Per move the server returns the (possibly carved)
`ground` and `lastShot` (now with `crater`). The client animates the returned
trajectory, carves its displayed terrain at impact, and emits debris.

## Testing

- Server unit check: an impact lowers `ground` near the impact, the change
  persists across moves, and a subsequent trajectory sees the new terrain.
- Client production build succeeds.
- Manual playtest by the user (canvas feel can't be auto-tested here).
