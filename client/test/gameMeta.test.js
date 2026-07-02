import assert from 'node:assert/strict';
import test from 'node:test';

import {
  modeSummary,
  playerCountLabel,
  requiresLandscape,
  rulesForGame,
} from '../src/games/gameMeta.js';

test('playerCountLabel distinguishes 1v1 from larger rooms', () => {
  assert.equal(playerCountLabel({ maxPlayers: 2 }), '1v1');
  assert.equal(playerCountLabel({ minPlayers: 2, maxPlayers: 4 }), '2-4 players');
  assert.equal(playerCountLabel({ minPlayers: 4, maxPlayers: 4 }), '4 players');
});

test('modeSummary exposes mode counts and names compactly', () => {
  assert.equal(modeSummary({ modes: null }), '');
  assert.equal(modeSummary({ modes: [{ name: 'Classic' }] }), 'Classic');
  assert.equal(modeSummary({ modes: [{ name: 'Classic' }, { name: 'Blitz' }] }), '2 modes');
});

test('rulesForGame builds concise rules from registry metadata', () => {
  const rules = rulesForGame({
    name: 'Pool',
    maxPlayers: 2,
    modes: [
      { name: '8-Ball', hint: 'Sink your group, then the 8.' },
      { name: 'Blitz', hint: '8-Ball with a 20s shot clock.' },
    ],
    options: [{ label: 'Rounds', default: 3 }],
  });

  assert.equal(rules.playerCount, '1v1');
  assert.deepEqual(rules.modes, [
    { name: '8-Ball', hint: 'Sink your group, then the 8.' },
    { name: 'Blitz', hint: '8-Ball with a 20s shot clock.' },
  ]);
  assert.deepEqual(rules.options, [{ label: 'Rounds', value: 3 }]);
});

test('requiresLandscape identifies games that need horizontal mobile play', () => {
  assert.equal(requiresLandscape('karts'), true);
  assert.equal(requiresLandscape('ghostrider'), true);
  assert.equal(requiresLandscape('artillery'), true);
  assert.equal(requiresLandscape('carrom'), false);
});
