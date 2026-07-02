# Platform Shell Redesign + Progression — Design

**Date:** 2026-07-02
**Status:** Approved direction; first sub-project of the platform-wide redesign.

## Context

The platform is being redesigned in four sequenced workstreams:

- **A. Platform shell** (this spec) — Home / Lobby / Game chrome, "premium console" look, full progression layer.
- **C. Realism deep-dive** — Karts, Pool, Carrom, Ghost Rider, Tank Duel (separate spec, after A).
- **B. Per-game polish + features** — remaining games (separate specs, after C).
- **D. Mobile landscape expansion** — folded into each game's pass.

Decisions made during brainstorming:

- Art direction: **premium console** (PS5/Xbox-dashboard feel) — deep dark surfaces, glassy panels, big key-art tiles, cinematic gradients, restrained glow.
- Gamification: **full progression** — XP, levels, achievements, daily challenges, leaderboards, unlockables.
- Unlock model: **level-gated only** — no currency, no shop.
- Implementation approach: **evolve in place**, two phases — A1 visuals, then A2 progression. No parallel rebuild.

## Current state

- 19 games registered in `client/src/games/registry.js`, each with a small canvas `Thumbnail`.
- Shell: `App.jsx` → `Home.jsx` (socket orchestrator) → `Lobby.jsx` (topbar, games grid, chat sidebar, modals) / `Game.jsx` (game chrome, orientation gate, post-game overlay).
- Styling: single `client/src/styles.css` (~5,650 lines) with token themes: default "cozy dark depth" (warm charcoal + amber/teal), `light`, `arcade`.
- Server: Express + Socket.IO; SQLite via `server/src/db.js` with `users`, `friendships`, `messages`, `matches`, `match_players`, `player_stats`. Match recording already runs on game end.
- Auth + profile (username, avatar picker) already exist.

## A1 — Visual overhaul ("premium console")

### 1. Design tokens

- New default theme replaces "cozy dark depth": near-black cool base (`#0a0d14` family), glassy translucent panels with `backdrop-filter` blur, refined layered elevation, restrained glow reserved for interactive/hover states.
- One cinematic gradient per game, derived from its registry `accent`.
- Typography stays Inter (body) + Chakra Petch (display); display font promoted to all headings and numerals.
- `light` and `arcade` remain as token overrides and inherit the new layout.
- Motion: springier easing curve, staggered rail entrance animations, existing card pointer-parallax retained.

### 2. Home

- **Console header** (evolves the topbar): brand, level chip with XP progress ring (A2 data; renders without it in A1), avatar/profile chip. Existing actions (join code, rooms, friends, stats, settings) stay reachable.
- **Hero banner**: featured game — the user's most-played, falling back to a rotating pick. Full-width key art, title, Play / Quick Play CTAs.
- **Continue playing** rail: horizontal strip of recently played games, from match history.
- **Daily challenges** rail: today's 3 challenges with progress bars (A2 data; hidden until A2 lands).
- **All games** grid: rebuilt tiles — taller key-art format, hand-authored **SVG scene per game** (19 tiles, no external images), accent gradient, player-count/mode chips, hover glow, Quick Play button.
- Mobile: hero collapses to a compact card; rails scroll horizontally; existing FAB + menu-sheet pattern restyled to match.

### 3. Lobby (pre-game room) + game chrome

- Lobby becomes a console "party screen": player slots as avatar cards (avatar, frame, ready check, team color), options as segmented cards, prominent Start button.
- Game page keeps its structure; chrome adopts the new tokens.
- Post-match overlay rebuilt as a **podium screen**: placements → XP counter ticking up → level-up moment → achievement pop-ins → Rematch / Leave. (XP/achievement stages appear in A2; A1 ships the podium layout.)

## A2 — Progression

New module `server/src/progression.js`, invoked from the existing match-recording path, wrapped in try/catch so a progression failure can never break match recording.

### XP and levels

- XP per match: base for playing, bonus for winning, small multiplier for larger lobbies, win-streak bonus.
- Storage: `xp` column on `users` + `xp_events` audit table (user_id, amount, reason, match_id, created_at).
- Level is a pure function of cumulative XP (no table). Server computes level/progress and sends it to the client — the client never re-implements the curve.

### Achievements

- ~25 definitions in code (`server/src/achievements.js`): first win, per-game milestones, win streaks, "play every game", social ones, etc.
- `achievements` unlock table: (user_id, achievement_id, unlocked_at).
- Evaluated when a match records.

### Daily challenges

- 3 per day, deterministically generated from the date seed (e.g. "Win 2 Pool games", "Play 3 different games").
- `challenge_progress` table keyed by (user_id, date, challenge_id); XP reward on completion.

### Leaderboards

- Query endpoints over existing `matches` / `player_stats`: global XP, per-game wins, weekly (from match timestamps). No new tables.

### Unlockables

- Avatars, profile frames, and themes defined in a shared list with level requirements.
- Equipping extends the existing avatar/profile plumbing. No currency, no shop.

### Live delivery

- After `game:over`, server emits `progression:update` to each player: XP gained (with breakdown), new level/progress, new achievements, challenge progress.
- Feeds the podium screen, header level chip, and toasts.

### UI surfaces

- Header: level chip + XP ring (live-updates on `progression:update`).
- Profile: badges (achievements), stats, unlocks with equip controls.
- Leaderboard view (modal or page) with global XP / per-game / weekly tabs.
- Daily challenges rail on Home.
- Post-match podium XP/level-up/achievement sequence.

## Error handling

- Progression engine failures are caught and logged; match recording and game flow are unaffected.
- Client renders all progression UI defensively: missing/absent progression data (old accounts, failed fetches) degrades to the A1 visual-only state.

## Testing

- Server (`node:test`, matching existing suites): XP rules, level curve, achievement triggers, challenge determinism and daily rollover, leaderboard queries, progression-failure isolation (recording still succeeds).
- Client: CSS/layout assertion tests in the style of the existing `*Css.test.js` for tiles, hero, header chip, podium.
- E2E: Playwright pass over Home / Lobby / podium at desktop and mobile viewports.

## Out of scope (later workstreams)

- In-game visuals/physics of individual games (workstreams C and B).
- Landscape expansion to more games (D).
- Any currency/shop economy.
