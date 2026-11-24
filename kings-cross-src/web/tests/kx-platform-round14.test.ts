import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { shedLayout } from '../../core/station.ts';
import { PAINTERS, TEXTURES } from '../src/materials.ts';
import { createDialLights } from '../src/night.ts';
import { buildShed, PLATFORM_CLOCK } from '../src/shed.ts';

// Round 14 (platform-round-1 score, section 5; rubric shed-interior B4 and B5, judged against R-kx-shed-interior-e and -a): the tactile strip set back from
// the coping with surface between, muted, no yellow line, the surface bands speckled as the platform tops are; the platform clock lit after dark, a deeper
// arm with a spandrel, and a camera that frames it.
const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);

/** Paint `name` into a recording context: the full-height fills (the bands) and the small fills (the speckle), in metres. */
function paint(name: 'platformEdge' | 'asphalt') {
  const spec = TEXTURES[name], [w, h] = spec.px, pxm = w / spec.tile[0], bands: { x: number; w: number; c: string }[] = [], specks: { x: number; s: number }[] = [];
  let style = '';
  const g = new Proxy({}, {
    get: (_t, k) => (k === 'fillRect' ? (x: number, y: number, fw: number, fh: number) => {
      if (y <= 0 && fh >= h) bands.push({ x, w: fw, c: style });
      else if (fw <= 4 && fh <= 4 && /^rgba/.test(style)) specks.push({ x: x / pxm, s: fw / pxm });
    } : k === 'fillStyle' ? style : () => undefined),
    set: (_t, k, value) => { if (k === 'fillStyle') style = String(value); return true; },
  });
  (PAINTERS[name] as (g: unknown, w: number, h: number) => void)(g, w, h);
  const at = (x: number): [number, number, number] => {
    const hit = [...bands].reverse().find((f) => f.x <= x * pxm && x * pxm < f.x + f.w && /^#/.test(f.c));
    assert.ok(hit, `a band at ${x} m`);
    const n = parseInt(hit.c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  return { at, specks, area: spec.tile[0] * spec.tile[1] };
}
const sat = ([r, g, b]: number[]): number => (Math.max(r!, g!, b!) - Math.min(r!, g!, b!)) / Math.max(r!, g!, b!, 1);
const lum = ([r, g, b]: number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

test('B4: coping, surface, a muted tactile strip 0.5-0.9 m back, surface again; no yellow; the surface speckled as the tops are', () => {
  const edge = paint('platformEdge'), tops = paint('asphalt'), surface = tops.at(1);
  const coping = edge.at(0.1);
  assert.ok(sat(coping) < 0.1 && lum(coping) > 165, `the coping pale enough to read at night: ${coping}`);
  for (const x of [0.25, 0.35, 0.45, 0.95, 1.2, 1.55]) assert.deepEqual(edge.at(x), surface, `at ${x} m the platform's surface tone`);
  for (const x of [0.55, 0.7, 0.85]) {
    const t = edge.at(x), dl = lum(t) - lum(surface);
    assert.ok(dl > 3 && dl < 25, `at ${x} m the tactile a little lighter than the surface: ${t}, ${dl.toFixed(1)}`);
    assert.ok(t[0] - t[2] > surface[0] - surface[2] + 8 && sat(t) < 0.3, `and warmer, a muted ochre, not yellow: ${t}`);
  }
  for (let x = 0.05; x < 1.6; x += 0.05) assert.ok(sat(edge.at(x)) < 0.3, `no yellow line: ${x.toFixed(2)} m is ${edge.at(x)}`);
  // the surface bands' speckle: the same count on the ground and the same size as the tops' (paintAsphalt)
  const perM2 = (p: ReturnType<typeof paint>, a: number) => p.specks.length / a;
  const surf = edge.specks.filter((s) => (s.x >= 0.2 && s.x < 0.5) || (s.x >= 0.9 && s.x < 1.6));
  const wantDensity = perM2(tops, tops.area), gotDensity = surf.length / ((0.3 + 0.7) * TEXTURES.platformEdge.tile[1]);
  assert.ok(Math.abs(gotDensity / wantDensity - 1) < 0.2, `speckle ${gotDensity.toFixed(0)} a square metre against the tops' ${wantDensity.toFixed(0)}`);
  const size = (l: { s: number }[]) => l.reduce((n, s) => n + s.s, 0) / l.length;
  assert.ok(Math.abs(size(surf) / size(tops.specks) - 1) < 0.15, `speck ${size(surf).toFixed(4)} m against the tops' ${size(tops.specks).toFixed(4)} m`);
});

test('B5: the platform clock glows after dark as the tower does, its arm is a deep cast-iron section with a spandrel, and a camera frames it', () => {
  const shed = buildShed(layout, { range: false });
  const clock = shed.getObjectByName('shed-platform-clock') as THREE.Group;
  const lights = createDialLights();
  shed.updateMatrixWorld(true);
  assert.equal(lights.scan(clock), 2, 'both faces take a night glow');
  const { y, radius, rim, arm, out } = PLATFORM_CLOCK, armY = y + radius + rim + 0.35, armEnd = out + radius * 0.6;
  const pos = (clock.getObjectByName('shed-platform-clock-iron') as THREE.Mesh).geometry.getAttribute('position');
  let deep = 0, web = 0;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i);
    if (Math.abs(px - armEnd) < 0.01 && py >= armY + 0.085) deep++;
    if (px > 0.3 && px < 0.95 && py > armY - 0.8 && py < armY - 0.2) web++;
  }
  assert.ok(deep > 0, `the arm at least 0.17 m deep (${arm} m before)`);
  assert.ok(web > 0, 'a spandrel of bars between the strut and the arm');
  const cams = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-station-cameras.json', import.meta.url), 'utf8')) as Record<string, { pos: number[]; target: number[] }>;
  const cam = cams['platform-clock'];
  assert.ok(cam, 'a platform-clock camera');
  shed.updateMatrixWorld(true);
  const dial = (clock.userData.clockDials as { centre: number[]; normal: number[] }[]).find((d) => d.normal[2] === 1)!;
  const centre = clock.localToWorld(new THREE.Vector3(...dial.centre)), eye = new THREE.Vector3(...cam.pos);
  assert.ok(new THREE.Vector3(...cam.target).distanceTo(centre) < 0.5, 'it looks at the south dial');
  const d = eye.distanceTo(centre);
  assert.ok(d > 12 && d < 15 && Math.abs(eye.y - 2.5) < 0.01, `from ${d.toFixed(1)} m at platform eye height`);
  const n = new THREE.Vector3(...dial.normal).transformDirection(clock.matrixWorld);
  assert.ok(eye.clone().sub(centre).normalize().dot(n) > 0.8, 'in front of the face');
});
