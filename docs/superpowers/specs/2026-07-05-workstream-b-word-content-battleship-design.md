# Workstream B: word-game content + Battleship salvo — Design

**Date:** 2026-07-05

## Background

A gap assessment across all 19 games found most already feature-complete
(modes, forced captures, wild stacking, word-choice prompts, etc.). The real
gaps are content-sized word pools, one integrity hole, and one mode-less game:

| Game | Gap |
|---|---|
| Boggle Race | Dictionary is 60 words — most legitimate words score zero |
| Word Duel | Only 40 answers; any 5-letter junk string is a legal guess |
| Codenames Lite | Classic deck is 25 words — every board is the same vocabulary |
| Skribble | 78-word pool repeats within a few sessions |
| Battleship | No modes; wide two-grid layout stuck in portrait on mobile |

## B1 — word content + integrity

- **`server/src/games/boggleWords.js`** (new, generated): all 3–8-letter
  lowercase-alpha words from `/usr/share/dict/american-english`, uppercased,
  minus a small profanity denylist (~35k words). `boggle.js` builds `DICT`
  from it. Generation script kept in the module header comment for
  reproducibility; the generated file is committed.
- **`server/src/games/wordduelWords.js`** (new): `GUESS_WORDS` — all 5-letter
  words from the same source (~4.7k, generated) — and `ANSWERS` — a curated
  list of ~400 common 5-letter words (hand-written; test asserts every answer
  is also in `GUESS_WORDS` to catch typos). `wordduel.js` picks answers from
  `ANSWERS` and rejects guesses not in the union set with
  "Not in the word list." Hints, scoring, and streaks unchanged.
- **Codenames**: expand the classic deck in place to ~250 curated
  association-friendly nouns. Mythic/tech decks unchanged.
- **Skribble**: expand `WORDS` in place to ~250 drawable entries with healthy
  1-word / 2-word / 3-word buckets (the choice pool filters by
  `wordsPerPrompt`). Party pack modestly extended. Packs/custom words
  unchanged.

Seeded picking (`nextRand`) is untouched everywhere, so daily boards and
deterministic tests keep working. Old-seed answers change (pool size is a
modulus input) — acceptable; no live matches persist across deploys.

## B2 — Battleship salvo mode + landscape

- **Salvo mode** (`server/src/games/battleship.js`): add
  `modes: [classic, salvo]`. In salvo, each turn you fire one shot per
  surviving ship (5 → fewer as ships sink), submitted as one move
  (`{ type: 'salvo', cells: [...] }`); results resolve together. Classic
  stays the default and keeps the current single-shot move shape.
- **Landscape** (client): add battleship to the landscape-orientation game
  set used on mobile so the two grids sit side by side; grid layout gets a
  landscape media/orientation variant.

## Testing

Server: word-module contract tests (size floors, charset, uniqueness,
answers ⊆ guesses), wordduel rejection test, salvo-mode engine tests.
Client: source-assertion tests for landscape wiring. Existing suites must
stay green (existing tests already use real words like CRANE/CAR).
