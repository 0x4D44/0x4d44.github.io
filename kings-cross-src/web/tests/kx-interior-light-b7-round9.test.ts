// Shed interior B7, round 9 (evidence, not light; the round-8 score: the crown band reads only by comparing two cameras, and no day view has a
// train under the roof). (a) shed-across-west: a fixed station view across the west vault, from footbridge height over platform 5 by the spine,
// looking west and down, so island 6/7 under the west crown and the near-wall floor by the west wall (platform 8) are in one frame, the
// floor filling most of it. (b) `--trains demo`, for a `--views` run only: the station views are taken with the sample trains at the buffers (the
// page's own `?trains=demo`), so the same view shows the white sample Azuma (lner9, track 1 at u 11.2) standing under the roof by day.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { pointInPolygon, SHED_SPAN_WIDTH, shedBufferStops, shedLayout, shedToWorld, stationPlatforms, worldToShed } from '../../core/station.ts';
// @ts-expect-error the evidence tool is plain JavaScript
import { ELEMENT_VIEWS, optionsFrom, stationCameras, stationQuery } from '../../tools/evidence.mjs';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
type Cam = { pos: number[]; target: number[]; fov?: number; near?: number; source: string };
const ASPECT = 1.6; // the capture's aspect (evidence.mjs, the western-range lens note)

/** Where the world point lands in `cam`'s frame: x and y from -1 to 1 across it when in view, and whether it is in front. */
function onScreen(cam: Cam, p: [number, number, number]): { x: number; y: number; front: boolean } {
  const c = new THREE.PerspectiveCamera(cam.fov ?? 50, ASPECT, cam.near ?? 0.1, 20000);
  c.position.set(...(cam.pos as [number, number, number]));
  c.lookAt(...(cam.target as [number, number, number]));
  c.updateMatrixWorld(true);
  const v = new THREE.Vector3(...p).project(c);
  return { x: v.x, y: v.y, front: v.z < 1 };
}
const inFrame = (s: { x: number; y: number; front: boolean }) => s.front && Math.abs(s.x) < 0.95 && Math.abs(s.y) < 0.95;
const floorAt = (u: number, v: number): [number, number, number] => { const [x, z] = shedToWorld(layout, u, v); return [x, PLATFORM_HEIGHT, z]; };

test('B7 round 9 shed-across-west: one frame across the west vault holds island 6/7 under the crown and the near-wall floor by the west wall (platform 8)', () => {
  const cam = (stationCameras() as Record<string, Cam>)['shed-across-west'];
  assert.ok(cam, 'shed-across-west exists');
  assert.ok((ELEMENT_VIEWS as Record<string, string[]>)['shed-interior']!.includes('shed-across-west'), 'a shed-interior view');
  assert.match(cam.source, /\([a-z0-9-]+\.jpg\)/, 'it names its reference photograph');
  const foot = worldToShed(layout, [cam.pos[0]!, cam.pos[2]!]), aim = worldToShed(layout, [cam.target[0]!, cam.target[2]!]);
  assert.ok(pointInPolygon([cam.pos[0]!, cam.pos[2]!], stationPlatforms(data).get('5')!.pts), `over platform 5 by the spine (u ${foot.u.toFixed(1)})`);
  assert.ok(foot.v > 60 && foot.v < 200 && Math.abs(aim.v - foot.v) < 1, `across the shed, mid-length (v ${foot.v.toFixed(1)} to ${aim.v.toFixed(1)})`);
  assert.ok(aim.u < foot.u - 10, 'looking west');
  assert.ok(cam.pos[1]! - PLATFORM_HEIGHT >= 4 && cam.pos[1]! - PLATFORM_HEIGHT <= 7 && cam.target[1]! < cam.pos[1]! - 3, 'from footbridge height, looking down');
  const v = foot.v;
  for (const [u, what] of [[layout.spine - R, 'the west crown line on island 6/7'], [layout.spine - R - 2.5, 'island 6/7 2.5 m off the crown'], [layout.spine - 2 * R + 4, 'platform 8, 4 m from the west wall (the near-wall shade)'], [layout.spine - 2 * R + 2.6, 'platform 8, 2.6 m from the west wall']] as const) {
    assert.ok(inFrame(onScreen(cam, floorAt(u, v))), `${what} (u ${u.toFixed(1)}) is in the frame`);
  }
  // a stretch along the crown, not a slot: the crown line 8 m either side along the shed is in the frame too (rib stripes cross it every 6.1 m)
  for (const dv of [-8, 8]) assert.ok(inFrame(onScreen(cam, floorAt(layout.spine - R, v + dv))), `the crown line ${dv} m along`);
  // the floor fills most of the frame: the frame's centre and its lower half land on the floor, and the far wall's foot sits above the middle
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PLATFORM_HEIGHT), c = new THREE.PerspectiveCamera(cam.fov ?? 50, ASPECT, 0.1, 20000);
  c.position.set(...(cam.pos as [number, number, number])); c.lookAt(...(cam.target as [number, number, number])); c.updateMatrixWorld(true);
  const hits = (sy: number) => { const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(0, sy), c); const p = r.ray.intersectPlane(ground, new THREE.Vector3()); return p ? worldToShed(layout, [p.x, p.z]).u : null; };
  for (const sy of [0, -0.5, -0.9]) { const u = hits(sy); assert.ok(u !== null && u > layout.spine - 2 * R && u < layout.spine, `screen row ${sy} lands on the west vault's floor (u ${u?.toFixed(1)})`); }
  assert.ok(onScreen(cam, floorAt(layout.spine - 2 * R, v)).y > 0, 'the west wall\'s foot is in the upper half: the floor takes the lower');
});

test('B7 round 9 --trains demo: a --views run can take the station views with the sample trains, the white Azuma in shed-across-west, and the default is unchanged', () => {
  const base = ['--views', 'shed-across-west'];
  assert.equal(optionsFrom(base).trains, 'none', 'no trains by default');
  assert.equal(optionsFrom([...base, '--trains', 'demo']).trains, 'demo');
  assert.throws(() => optionsFrom([...base, '--trains', 'live']), /--trains/);
  assert.throws(() => optionsFrom(['--trains', 'demo']), /--trains/, 'only with --views: the full pack keeps its own train runs');
  assert.equal(stationQuery(optionsFrom(base)), '?trains=none&board=0', 'the station views as before');
  assert.equal(stationQuery(optionsFrom([...base, '--trains', 'demo'])), '?trains=demo&board=0');
  // the sample Azuma (main.ts: lner9 at the second buffer stop from the west, 234 m long from its nose by the stop) stands in shed-across-west's frame
  const stops = shedBufferStops(data, layout).map((p) => worldToShed(layout, [p.x, p.z])).sort((a, b) => a.u - b.u), stop = stops[1]!;
  assert.ok(Math.abs(stop.u - 11.2) < 0.5, `track 1 at u ${stop.u.toFixed(1)}`);
  const cam = (stationCameras() as Record<string, Cam>)['shed-across-west']!, v = worldToShed(layout, [cam.pos[0]!, cam.pos[2]!]).v;
  assert.ok(v > stop.v + 10 && v < stop.v + 230 && v < layout.length - 2, 'the view crosses the Azuma\'s length under the roof');
  assert.ok(v > stops[3]!.v + 129.7 + 2, 'past the end of the sample lner5 on track 3 (u 25.7, 130 m), which would stand between the eye and the vault');
  const [x, z] = shedToWorld(layout, stop.u + 1.4, v);
  assert.ok(inFrame(onScreen(cam, [x, 2.5, z])), 'the Azuma\'s east side, at its windows\' height, is in the frame');
});
