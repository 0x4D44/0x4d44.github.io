import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStPancrasAnchors, stPancrasMmlPlatforms, stPancrasMmlPlatformGeometry } from '../stpancras.ts';
import type { KxData } from '../osm.ts';
import type { SmartRow } from '../berths.ts';

// Entirely invented track, platform and berth identities. No SMART-derived fixtures.
function data(): KxData {
  return { attribution: 'Synthetic', origin: { lat: 0, lon: 0 }, nodes: [[11, -4, 0], [12, -4, -100]],
    rails: [{ id: 20, nodes: [11, 12], layer: 1, tunnel: false, bridge: false, service: 'main' }],
    buffers: [{ id: 11, x: -4, z: 0 }], signals: [{ id: 12, x: -4, z: -100, ref: 'WH 901', kinds: [] }],
    platforms: [{ id: 30, ref: '1', layer: 1, pts: [[-1, 0], [1, 0], [1, -100], [-1, -100]] }], switches: [], buildings: [] };
}
const row = (event = 'A', platform = '1'): SmartRow => ({ TD: 'WH', STANME: 'STPANCRAS', EVENT: event, PLATFORM: platform, FROMBERTH: 'Q901', TOBERTH: 'Z901', BERTHOFFSET: '99999' });

test('St Pancras geometry selects only unique layer-1 polygons and exposed graph buffers', () => {
  const d = data();
  d.platforms.push({ ...d.platforms[0]!, id: 31, layer: 0 }, { ...d.platforms[0]!, id: 32, ref: '5' });
  assert.deepEqual([...stPancrasMmlPlatforms(d).keys()], ['1']);
  assert.deepEqual(stPancrasMmlPlatformGeometry(d)[0]!.candidates.map(c => c.buffer), [11]);
  assert.deepEqual(stPancrasMmlPlatformGeometry(d)[0]!.candidates[0]!.signals, ['WH 901']);
  d.platforms.push({ ...d.platforms[0]!, id: 33 });
  assert.equal(stPancrasMmlPlatforms(d).size, 0);
});

test('St Pancras selects arrival TOBERTH and departure FROMBERTH, preserving provenance and uncertainty', () => {
  const map = buildStPancrasAnchors(data(), [row('A'), row('C'), row('B'), row('D')]);
  assert.deepEqual(map.anchors.map(a => a.berth), ['Q901', 'Z901']);
  for (const a of map.anchors) {
    assert.equal(a.platform, '1'); assert.deepEqual(a.point, [-4, 0]); assert.equal(a.from, 12); assert.equal(a.to, 11); assert.equal(a.t, 1);
    assert.ok(a.errorM >= 100); assert.match(a.evidence, /ASSUMPTION/); assert.match(a.evidence, /WH 901/); assert.match(a.evidence, /no metric position/);
  }
  assert.equal(map.area, 'WH');
  const arrival = buildStPancrasAnchors(data(), [row('A')]);
  assert.deepEqual(arrival.anchors.map(a => a.berth), ['Z901']);
  assert.equal(arrival.unmapped.find(b => b.berth === 'Q901')?.reason, 'no-evidence');
});

test('St Pancras never assigns unsupported areas, locations, platforms or observed approach chains', () => {
  const rows = [{ ...row(), TD: 'Y9' }, { ...row(), STANME: 'ELSEWHERE' }, row('A', '')];
  const map = buildStPancrasAnchors(data(), rows, [{ t: 0, e: { kind: 'step', area: 'WH', from: 'M901', to: 'N901' } }, { t: 1, e: { kind: 'step', area: 'Y9', from: 'FORE', to: 'IGNR' } }]);
  assert.equal(map.anchors.length, 0);
  assert.deepEqual(map.unmapped.map(b => b.berth), ['M901', 'N901', 'Q901', 'Z901']);
  assert.equal(map.unmapped.find(b => b.berth === 'M901')?.seen, 1);
});

test('St Pancras withholds ambiguous tracks and competing platform associations', () => {
  const d = data();
  d.nodes.push([13, 4, 0], [14, 4, -100]); d.buffers.push({ id: 13, x: 4, z: 0 });
  d.rails.push({ ...d.rails[0]!, id: 21, nodes: [13, 14] });
  const ambiguous = buildStPancrasAnchors(d, [row()]);
  assert.equal(ambiguous.anchors.length, 0); assert.equal(ambiguous.unmapped.find(b => b.berth === 'Z901')?.reason, 'conflict');
  const one = data(); one.platforms.push({ ...one.platforms[0]!, id: 34, ref: '2', pts: one.platforms[0]!.pts.map(([x,z]) => [x - 1, z]) });
  const competing = buildStPancrasAnchors(one, [row(), row('A', '2')]);
  assert.equal(competing.anchors.length, 0); assert.equal(competing.unmapped.find(b => b.berth === 'Z901')?.reason, 'conflict');
});
