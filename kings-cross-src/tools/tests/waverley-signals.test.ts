// The Waverley OSM signal overlay, on synthetic OSM elements near the real origin. Synthetic data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWaverleyScene, packWaverleyScene, WAVERLEY_ORIGIN } from '../../core/waverley-data.ts';
import type { WaverleyRawElement } from '../../core/waverley-data.ts';
import { decodeWaverleyAnchorScene, waverleyTrackData } from '../../core/waverley-anchors.ts';
import { buildStationSignalOverlay } from '../build-waverley.ts';

const { lat, lon } = WAVERLEY_ORIGIN;
const node = (id: number, dLat: number, dLon: number, tags?: Record<string, string>): WaverleyRawElement => ({ type: 'node', id, lat: lat + dLat, lon: lon + dLon, ...(tags ? { tags } : {}) });
const states = 'GB-NR:red;GB-NR:yellow;GB-NR:double_yellow;GB-NR:green';
function elements(): WaverleyRawElement[] {
  return [
    node(1, 0, 0), node(2, 5e-4, 0, { railway: 'signal', 'railway:signal:main': 'GB-NR:colour_light', 'railway:signal:main:states': states,
      'railway:signal:direction': 'forward', 'railway:signal:position': 'left', ref: 'EB123' }),
    node(3, 1e-3, 0), node(4, 1.5e-3, 0, { railway: 'signal', 'railway:signal:main': 'GB-NR:colour_light', 'railway:signal:direction': 'backward', ref: 'EB124' }),
    { type: 'way', id: 10, nodes: [1, 2, 3, 4], tags: { railway: 'rail' } },
    // a platform 3 to 9 m east of the track between nodes 2 and 3
    node(21, 5e-4, 5e-5), node(22, 5e-4, 1.5e-4), node(23, 1e-3, 1.5e-4), node(24, 1e-3, 5e-5),
    { type: 'way', id: 20, nodes: [21, 22, 23, 24, 21], tags: { railway: 'platform', train: 'yes', ref: '1' } },
    // a track nowhere near a platform, with a signal: not part of the station
    node(31, 0, 3e-3), node(32, 5e-4, 3e-3, { railway: 'signal', 'railway:signal:main': 'GB-NR:colour_light', ref: 'EB900' }),
    { type: 'way', id: 30, nodes: [31, 32], tags: { railway: 'rail' } },
    // a signal outside the site
    node(41, 0.02, 0, { railway: 'signal', 'railway:signal:main': 'GB-NR:colour_light' }),
  ];
}
const packed = () => packWaverleyScene(buildWaverleyScene({ elements: elements() }, { url: '', fetchedAt: '', sha256: '', license: 'ODbL', query: 'synthetic' }));

test('the station overlay places each OSM signal on the scene\'s own track, with OSM fields only', () => {
  const scene = packed(), { overlay, report } = buildStationSignalOverlay(elements(), scene);
  assert.match(overlay.attribution, /OpenStreetMap/);
  assert.deepEqual(overlay.signals.map(s => s.id), [2, 4]);
  assert.deepEqual([report.inputSignals, report.includedSignals, report.excludedSignals], [3, 2, 1], 'the off-site node is not an input; the far track is excluded');
  const track = waverleyTrackData(decodeWaverleyAnchorScene(scene)), pos = new Map(track.nodes.map(([id, x, z]) => [id, [x, z]]));
  const [forward, backward] = overlay.signals as [typeof overlay.signals[number], typeof overlay.signals[number]];
  // the edge is the local graph's, leaving the signal's own vertex the way its trains run
  assert.ok(pos.has(forward.edge.from) && pos.has(forward.edge.to));
  assert.equal(forward.edge.t, 0); assert.ok(forward.travel[1] < 0, 'forward along the way: north, toward -z');
  assert.equal(backward.edge.t, 1); assert.ok(backward.travel[1] > 0, 'backward: south');
  assert.equal(forward.aspects, 4, 'its states list double yellow'); assert.equal(backward.aspects, undefined);
  assert.deepEqual([forward.side, forward.sideSource, backward.sideSource], ['left', 'osm', 'assumed-left']);
  for (const s of overlay.signals) {
    assert.equal(s.berth, undefined, 'no public berth: the area has no public ref rule');
    assert.equal(s.review, 'unreviewed'); assert.equal(s.positionReview, undefined);
    assert.equal(s.point, undefined); assert.equal(s.facing, undefined);
    assert.deepEqual(Object.keys(s).sort().filter(k => !['aspects', 'direction', 'edge', 'id', 'kinds', 'ref', 'review', 'side', 'sideSource', 'travel'].includes(k)), []);
  }
  assert.deepEqual(forward.kinds, ['main', 'main:states', 'position'], 'the railway:signal:* suffixes, as compactOsm lists them'); assert.equal(forward.ref, 'EB123');
});
