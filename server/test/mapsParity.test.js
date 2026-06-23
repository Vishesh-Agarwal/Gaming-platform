import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as server from '../src/games/kartMaps.js';
import * as client from '../../client/src/games/karts/kartMaps.js';

test('client and server kartMaps are identical', () => {
  assert.deepEqual(client.MAPS, server.MAPS);
  assert.equal(client.DEFAULT_MAP, server.DEFAULT_MAP);
  assert.deepEqual(client.listMaps(), server.listMaps());
});

test('every map is well-formed', () => {
  for (const m of Object.values(server.MAPS)) {
    assert.ok(m.id && m.name && m.arena?.w && m.arena?.d, `map ${m.id} missing core fields`);
    assert.ok(Array.isArray(m.spawns) && m.spawns.length >= 1, `map ${m.id} needs spawns`);
    assert.ok(Array.isArray(m.pads) && m.pads.length >= 1, `map ${m.id} needs pads`);
  }
});

test('getMap falls back to default for unknown ids', () => {
  assert.equal(server.getMap('nope').id, server.DEFAULT_MAP);
  assert.equal(server.getMap(undefined).id, server.DEFAULT_MAP);
});
