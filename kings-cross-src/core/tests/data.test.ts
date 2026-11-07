// Sanity checks on the committed compact model (web/src/data/kx-track.json). These pin
// facts about the real data, so a bad rebuild (a wrong bounding box, a dropped tag) fails here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildGraph, components, snap } from '../graph.ts';
import type { KxData } from '../osm.ts';
import { centroid, inZone, KINGS_CROSS } from '../zones.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
const g = buildGraph(data);

test('data: attribution is present and every rail node has a finite position', () => {
  assert.match(data.attribution, /OpenStreetMap/);
  const ids = new Set(data.nodes.map((n) => n[0]));
  for (const [, x, z] of data.nodes) assert.ok(Number.isFinite(x) && Number.isFinite(z));
  for (const r of data.rails) for (const n of r.nodes) assert.ok(ids.has(n), `rail ${r.id} node ${n} missing`);
});

test('data: the track is one connected network of well over a thousand nodes', () => {
  const comps = components(g);
  assert.equal(comps.length, 1);
  assert.ok(g.pos.size > 1000);
});

test('data: King\'s Cross platforms 0-10 each exist once in the station zone, on a track, 100-400 m long', () => {
  const main = new Set(components(g)[0]);
  for (let n = 0; n <= 10; n++) {
    const found = data.platforms.filter((p) => p.ref === String(n) && inZone(KINGS_CROSS, centroid(p.pts)));
    assert.equal(found.length, 1, `platform ${n}: expected exactly one way in the King's Cross zone, found ${found.length}`);
    const p = found[0] as (typeof found)[number];
    const s = snap(g, centroid(p.pts), main);
    assert.ok(s && s.distance < 8, `platform ${n} is ${s?.distance.toFixed(1)} m from the nearest track`);
    const xs = p.pts.map((q) => q[0]);
    const zs = p.pts.map((q) => q[1]);
    const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    assert.ok(diag > 100 && diag < 400, `platform ${n} diagonal ${diag.toFixed(0)} m`);
  }
});

test('data: most buffer stops sit on the track, and many buildings have a height or level count', () => {
  const main = new Set(components(g)[0]);
  const onTrack = data.buffers.filter((b) => (snap(g, [b.x, b.z], main)?.distance ?? 999) < 40).length;
  assert.ok(onTrack >= 20, `only ${onTrack} of ${data.buffers.length} buffers are within 40 m of track`);
  assert.ok(data.buildings.filter((b) => b.height !== undefined || b.levels !== undefined).length >= 250);
  assert.ok(data.buildings.length > 900);
});

test('data: tunnels and bridges are tagged (Gasworks and Copenhagen tunnels, the canal bridges)', () => {
  assert.ok(data.rails.filter((r) => r.tunnel).length >= 40);
  assert.ok(data.rails.filter((r) => r.bridge).length >= 30);
});
