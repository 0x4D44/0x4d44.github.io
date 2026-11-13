// ALM-BUG-FLU-00021: St Leonard's Bridge (OSM way/24228327) over Perth's south throat was missing. These hold that it is drawn over the
// mapped tracks it crosses, at the LiDAR's road level, with the arches clear of the trains and the piers off the track.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { buildPerthScene } from '../src/perth-scene.ts';
import { ST_LEONARDS, ST_LEONARDS_LENGTH, ST_LEONARDS_LINE, ST_LEONARDS_SOURCE, stLeonardsFrame, stLeonardsSoffit } from '../src/perth-st-leonards-bridge.ts';

const data = unpackWaverleyScene(JSON.parse(readFileSync(new URL('../src/data/perth-scene.json', import.meta.url), 'utf8')));
const scene = buildPerthScene({ lighting: false });
test.after(() => scene.dispose());

/** Where each mapped rail crosses the bridge way's centreline: metres along the way, the rail's id, and the crossing segment. */
function crossings(): { id: string; s: number; p: Pt; seg: [Pt, Pt] }[] {
  const [a, b] = ST_LEONARDS_LINE as [Pt, Pt], out: { id: string; s: number; p: Pt; seg: [Pt, Pt] }[] = [];
  for (const r of data.rails) for (let i = 0; i + 1 < r.path.length; i++) {
    const p = r.path[i] as Pt, q = r.path[i + 1] as Pt, d = (a[0] - b[0]) * (p[1] - q[1]) - (a[1] - b[1]) * (p[0] - q[0]);
    if (!d) continue;
    const t = ((a[0] - p[0]) * (p[1] - q[1]) - (a[1] - p[1]) * (p[0] - q[0])) / d, u = -((a[0] - b[0]) * (a[1] - p[1]) - (a[1] - b[1]) * (a[0] - p[0])) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push({ id: r.id, s: t * ST_LEONARDS_LENGTH, p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], seg: [p, q] });
  }
  return out;
}

test('St Leonard\'s Bridge is OSM way/24228327 and is cited', () => {
  assert.ok(ST_LEONARDS_LENGTH > 70 && ST_LEONARDS_LENGTH < 80, `way length ${ST_LEONARDS_LENGTH}`);
  // south of the station (z is south), over the main lines
  assert.ok(ST_LEONARDS_LINE.every(p => p[1] > 140 && p[1] < 190), JSON.stringify(ST_LEONARDS_LINE));
  assert.match(ST_LEONARDS_SOURCE.osm, /way\/24228327$/);
  assert.match(ST_LEONARDS_SOURCE.photo, /geograph\.org\.uk\/photo\/591926$/);
});

test('the arches span every mapped track the way crosses, with the soffit at least 4.5 m and the road 5.5-6.5 m over the rail', () => {
  const xs = crossings();
  // the five running lines the way crosses in OSM (SCM5 and HGL1 pairs and the up main) and the crossover
  assert.ok(xs.length >= 6, `crossings ${JSON.stringify(xs.map(x => x.id))}`);
  assert.ok(ST_LEONARDS.road >= 5.5 && ST_LEONARDS.road <= 6.5);
  for (const x of xs) {
    assert.ok(x.s > ST_LEONARDS.abutments[0] + 2 && x.s < ST_LEONARDS.abutments[1] - 2, `${x.id} at ${x.s.toFixed(1)} m between the abutments`);
    // the rail's line under the deck's whole width (its crossing segment, extended straight: the rails are straight here): the soffit over it
    const [p, q] = x.seg.map(stLeonardsFrame);
    for (let o = -ST_LEONARDS.half; o <= ST_LEONARDS.half; o += 1) {
      const s = p!.s + (o - p!.o) / (q!.o - p!.o) * (q!.s - p!.s), soffit = stLeonardsSoffit(s);
      assert.ok(soffit >= 4.5, `${x.id}: soffit ${soffit.toFixed(2)} m over the rail at side offset ${o} (s ${s.toFixed(2)})`);
    }
  }
});

test('no pier or abutment stands within 2 m of a mapped rail (plan), across the deck\'s whole width', () => {
  const blocks = [...ST_LEONARDS.piers.map(c => [c - ST_LEONARDS.pierWidth / 2, c + ST_LEONARDS.pierWidth / 2]), [-Infinity, ST_LEONARDS.abutments[0]], [ST_LEONARDS.abutments[1], Infinity]];
  for (const r of data.rails) for (let i = 0; i + 1 < r.path.length; i++) {
    const a = r.path[i]!, b = r.path[i + 1]!, n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .25);
    for (let k = 0; k <= n; k++) {
      const f = stLeonardsFrame([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
      if (Math.abs(f.o) > ST_LEONARDS.half + .5 || Math.abs(f.s - ST_LEONARDS_LENGTH / 2) > ST_LEONARDS_LENGTH) continue;
      for (const [s0, s1] of blocks) assert.ok(f.s < s0! - 2 || f.s > s1! + 2, `${r.id} at s ${f.s.toFixed(2)}, o ${f.o.toFixed(2)} within 2 m of [${s0}, ${s1}]`);
    }
  }
});

test('the scene draws it: from above, the road at the LiDAR level over each track; from the rail, the arch overhead', () => {
  const mesh = scene.group.getObjectByName('perth-st-leonards-bridge') as THREE.Mesh | undefined;
  assert.ok(mesh, 'the bridge mesh is in the scene');
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const x of crossings()) {
    ray.set(new THREE.Vector3(x.p[0], 60, x.p[1]), new THREE.Vector3(0, -1, 0));
    const top: THREE.Intersection | undefined = ray.intersectObject(mesh)[0];
    assert.ok(top && Math.abs(top.point.y - ST_LEONARDS.road) < .2, `${x.id}: road over the rail at ${top?.point.y}`);
    ray.set(new THREE.Vector3(x.p[0], .5, x.p[1]), new THREE.Vector3(0, 1, 0));
    const under: THREE.Intersection | undefined = ray.intersectObject(mesh)[0];
    assert.ok(under && under.point.y >= 4.5 && under.point.y < ST_LEONARDS.road, `${x.id}: arch soffit over the rail at ${under?.point.y}`);
  }
  // its cost: one draw, a few thousand triangles
  const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute('position').count) / 3;
  assert.ok(tris > 500 && tris < 20_000, `triangles ${tris}`);
});
