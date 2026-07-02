// Daily challenges: 3 per UTC day, deterministically drawn from a pool with a
// date-seeded PRNG. Progress persists per (user, day, challenge). XP rewards
// are granted by the progression orchestrator when a challenge completes.
import { getChallengeProgress, upsertChallengeProgress } from './db.js';
import { listGames } from './games/registry.js';

// mulberry32 — tiny seeded PRNG, good enough for daily rotation.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromDay(day) {
  return [...day].reduce((s, ch) => Math.imul(s, 33) + ch.charCodeAt(0), 5381) >>> 0;
}

const FIXED = [
  { kind: 'play-any', name: 'Warm Up', desc: 'Play {n} matches.', icon: '🎯', targets: [2, 3, 4], xpPer: 15 },
  { kind: 'win-any', name: 'Victory Lap', desc: 'Win {n} matches.', icon: '🏁', targets: [1, 2, 3], xpPer: 30 },
  { kind: 'play-distinct', name: 'Variety Pack', desc: 'Play {n} different games.', icon: '🎲', targets: [2, 3], xpPer: 25 },
];

export function challengesForDate(day) {
  const rand = rng(seedFromDay(day));
  const games = listGames();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const out = [];

  const c1 = pick(FIXED);
  const t1 = pick(c1.targets);
  out.push({
    id: `${c1.kind}-${t1}`, kind: c1.kind, name: c1.name, icon: c1.icon,
    target: t1, xp: c1.xpPer * t1, desc: c1.desc.replace('{n}', t1),
  });

  const g2 = pick(games);
  out.push({
    id: `play-game-${g2.id}`, kind: 'play-game', gameId: g2.id, name: `${g2.name} Time`,
    icon: '🕹️', target: 2, xp: 40, desc: `Play 2 matches of ${g2.name}.`,
  });

  const g3 = pick(games.filter((g) => g.id !== g2.id));
  out.push({
    id: `win-game-${g3.id}`, kind: 'win-game', gameId: g3.id, name: `${g3.name} Winner`,
    icon: '🏆', target: 1, xp: 50, desc: `Win a match of ${g3.name}.`,
  });

  return out;
}

function matchCounts(ch, { gameId, won }) {
  switch (ch.kind) {
    case 'play-any': return 1;
    case 'win-any': return won ? 1 : 0;
    case 'play-game': return gameId === ch.gameId ? 1 : 0;
    case 'win-game': return won && gameId === ch.gameId ? 1 : 0;
    default: return 0; // play-distinct is derived from the distinct set below
  }
}

export function applyMatchToChallenges({ userId, day, gameId, won, draw, playedGameIdsToday = [] }) {
  const defs = challengesForDate(day);
  const existing = new Map(getChallengeProgress(userId, day).map((r) => [r.challenge_id, r]));
  const updated = [];
  const completed = [];
  for (const ch of defs) {
    const row = existing.get(ch.id);
    if (row?.completed_at) continue;
    const prev = row?.progress || 0;
    const next = ch.kind === 'play-distinct'
      ? Math.min(ch.target, new Set(playedGameIdsToday).size)
      : Math.min(ch.target, prev + matchCounts(ch, { gameId, won }));
    if (next === prev) continue;
    const isDone = next >= ch.target;
    upsertChallengeProgress(userId, day, ch.id, next, isDone);
    updated.push({ challenge: ch, progress: next, completed: isDone });
    if (isDone) completed.push(ch);
  }
  return { updated, completed };
}

export function getDailyChallenges(userId, day) {
  const progress = new Map(getChallengeProgress(userId, day).map((r) => [r.challenge_id, r]));
  return challengesForDate(day).map((ch) => {
    const row = progress.get(ch.id);
    return { ...ch, progress: row?.progress || 0, completed: !!row?.completed_at };
  });
}

export function utcDay(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}
