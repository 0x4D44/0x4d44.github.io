import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { shedLayout } from '../../core/station.ts';
import { furniturePlan } from '../src/furniture.ts';
import { PAINTERS, texture, TEXTURES } from '../src/materials.ts';
import { createDialLights, DIAL_GLOW } from '../src/night.ts';
import * as shedModule from '../src/shed.ts';

// Round 15 (platform-round-2 score, section 5; rubric shed-interior B5, R-kx-shed-interior-d viewed): the platform clock's dial sits on a horizontal cast beam
// from the arcade, a curved spandrel bracket under it back to the wall, scrolled cresting either side of the dial's base; the clock in a bay clear of the
// platform furniture, fixed to a pier; its night glow capped under clipping.
const data = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData;
const layout = shedLayout(data);
const S = shedModule as unknown as Record<string, unknown>;
type Spec = { y: number; out: number; radius: number; rim: number; drum: number; beam: number; beamDrop: number; spandrel: number; wall: number; glow: number };

function build() {
  const spec = S.PLATFORM_CLOCK as Spec;
  assert.ok(spec && typeof spec.beam === 'number' && typeof spec.spandrel === 'number' && typeof spec.glow === 'number', 'the beam, its spandrel and the glow cap are in PLATFORM_CLOCK');
  const shed = shedModule.buildShed(layout, { range: false });
  shed.updateMatrixWorld(true);
  const clock = shed.getObjectByName('shed-platform-clock') as THREE.Group;
  const iron = (clock.getObjectByName('shed-platform-clock-iron') as THREE.Mesh).geometry.getAttribute('position');
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < iron.count; i++) pts.push(new THREE.Vector3(iron.getX(i), iron.getY(i), iron.getZ(i)));
  const dial = (clock.userData.clockDials as { centre: number[] }[])[0]!;
  return { spec, shed, clock, pts, cx: dial.centre[0]!, z: (dial.centre[2]! + (clock.userData.clockDials as { centre: number[] }[])[1]!.centre[2]!) / 2 };
}

// first in the file: texture() caches what it makes, and this test is the one that gives it a (stub) document
test('B4: the strip is one tile across, clamped so its inner edge samples no coping; the tactile warmed toward yellow-khaki, the coping paler for the night', () => {
  const g = new Proxy({}, { get: (_t, k) => (k === 'fillStyle' ? '' : () => undefined), set: () => true });
  const doc = { createElement: () => ({ width: 0, height: 0, getContext: () => g }) };
  (globalThis as { document?: unknown }).document = doc;
  try {
    const t = texture('platformEdge');
    assert.ok(t, 'a texture where there is a document');
    assert.equal(t.wrapS, THREE.ClampToEdgeWrapping, 'across the strip: clamped, its far (inner) edge does not filter in the coping');
    assert.equal(t.wrapT, THREE.RepeatWrapping, 'along it: repeating');
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
  const spec = TEXTURES.platformEdge, [w, h] = spec.px, pxm = w / spec.tile[0], fills: { x: number; c: string }[] = [];
  let style = '';
  const rec = new Proxy({}, {
    get: (_t, k) => (k === 'fillRect' ? (x: number, y: number, _fw: number, fh: number) => { if (y <= 0 && fh >= h) fills.push({ x, c: style }); } : k === 'fillStyle' ? style : () => undefined),
    set: (_t, k, v) => { if (k === 'fillStyle') style = String(v); return true; },
  });
  (PAINTERS.platformEdge as (g: unknown, w: number, h: number) => void)(rec, w, h);
  const at = (x: number): number[] => { const f = [...fills].reverse().find((q) => q.x <= x * pxm && /^#/.test(q.c))!; const n = parseInt(f.c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const sat = (c: number[]) => (Math.max(...c) - Math.min(...c)) / Math.max(...c), lum = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  const tactile = at(0.7), coping = at(0.1);
  assert.ok(sat(tactile) >= 0.25 && sat(tactile) < 0.3, `the tactile a muted yellow-khaki: ${tactile} (saturation ${sat(tactile).toFixed(2)})`);
  assert.ok(lum(coping) >= 185 && sat(coping) < 0.1, `the coping pale: ${coping}`);
});

test('B5: the dial sits on a beam from the arcade\'s face, a curved spandrel under the beam back to the wall, cresting either side of the dial\'s base', () => {
  const { spec, pts, cx, z } = build();
  const beamY = spec.y - spec.beamDrop, R = spec.spandrel, x0 = spec.wall, dialFoot = spec.y - spec.radius - spec.rim;
  // the beam: its top just under the dial's foot, running from the arcade's face past the dial
  const onBeam = pts.filter((p) => Math.abs(p.y - beamY) < 0.1);
  const span = onBeam.map((p) => p.x);
  assert.ok(span.length && Math.min(...span) <= x0 + 0.01 && Math.max(...span) >= cx + spec.radius, 'a beam from the wall out past the dial');
  const beamTop = onBeam.reduce((m, p) => Math.max(m, p.y), -Infinity), bottom = onBeam.reduce((m, p) => Math.min(m, p.y), Infinity);
  const under = pts.filter((p) => Math.abs(p.y - bottom) < 0.005).map((p) => p.x); // the beam's own underside, nothing else lies there
  assert.ok(Math.min(...under) <= x0 + 0.01 && Math.max(...under) >= cx + spec.radius, `the beam itself from the wall out past the dial: its underside ${Math.min(...under).toFixed(2)} to ${Math.max(...under).toFixed(2)}`);
  assert.ok(beamTop < dialFoot && dialFoot - beamTop < 0.15, `the dial sits on the beam: its foot ${dialFoot.toFixed(2)}, the beam's top ${beamTop.toFixed(2)}`);
  assert.ok(!pts.some((p) => p.y > spec.y + spec.radius + spec.rim + 0.05), 'nothing over the dial: no arm above it');
  // the spandrel: iron on the quarter circle from (wall, beamY - R) to (wall + R, beamY), its hollow down and out, at 30, 45 and 60 degrees
  for (const deg of [30, 45, 60]) {
    const a = Math.PI - (deg * Math.PI) / 180, q = new THREE.Vector2(x0 + R + R * Math.cos(a), beamY - R + R * Math.sin(a));
    // tightened round 16: the bracket's own flange (deeper than the web's plate, which since round 16 also follows the curve)
    assert.ok(pts.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 0.08 && Math.abs(p.z - z) > 0.035), `the curved bracket through ${q.x.toFixed(2)}, ${q.y.toFixed(2)}`);
  }
  assert.ok(pts.some((p) => p.x <= x0 + 0.01 && p.y <= beamY - R + 0.05), 'its foot on the wall, R under the beam');
  // the cresting: iron beside the dial's base on both sides, above the beam
  for (const s of [-1, 1]) assert.ok(pts.some((p) => s * (p.x - cx) > spec.radius * 0.95 && s * (p.x - cx) < spec.radius + 0.3 && p.y > beamTop + 0.05 && p.y < beamTop + 0.3), `cresting on the ${s < 0 ? 'wall' : 'platform'} side of the dial`);
});

test('B5: fixed to a pier (a rib line) with no platform furniture within 6 m of the beam, and its night glow capped under clipping', () => {
  const { spec, clock, z } = build();
  const ribs = shedModule.ribPositions(layout.length);
  assert.ok(ribs.some((r) => Math.abs(-z - r) < 1e-6), `on a rib line (a pier between the arches): v ${(-z).toFixed(2)}`);
  const plan = furniturePlan(data, layout) as unknown as Record<string, { x: number; z: number }[]>;
  const a = clock.localToWorld(new THREE.Vector3(spec.wall, 5, z)), b = clock.localToWorld(new THREE.Vector3(spec.wall + spec.beam, 5, z));
  let near = Infinity;
  for (const list of Object.values(plan)) for (const q of list) if (typeof q?.x === 'number') for (let t = 0; t <= 1.0001; t += 0.05) near = Math.min(near, Math.hypot(q.x - (a.x + (b.x - a.x) * t), q.z - (a.z + (b.z - a.z) * t)));
  assert.ok(near >= 6, `the nearest platform furniture ${near.toFixed(1)} m from the beam`);
  const lights = createDialLights();
  assert.equal(lights.scan(clock), 2);
  lights.setLevel(1);
  const glows: THREE.Mesh[] = [];
  clock.traverse((o) => { if (o.name === 'clock-dial-glow') glows.push(o as THREE.Mesh); });
  assert.equal(glows.length, 2);
  for (const g of glows) {
    const c = (g.material as THREE.MeshBasicMaterial).color;
    assert.ok(Math.max(c.r, c.g, c.b) <= 0.75 && Math.max(c.r, c.g, c.b) >= 0.4, `the glow capped: ${c.toArray().map((n) => n.toFixed(2))}`);
  }
  // the tower keeps its full glow
  const tower = new THREE.Group(), face = new THREE.Mesh(new THREE.CircleGeometry(1, 8), new THREE.MeshLambertMaterial());
  tower.add(face);
  tower.userData.clockDials = [{ centre: [0, 0, 0], normal: [0, 0, 1], up: [0, 1, 0], radius: 1 }];
  const own = createDialLights();
  own.scan(tower);
  own.setLevel(1);
  const tg = tower.getObjectByName('clock-dial-glow') as THREE.Mesh;
  assert.deepEqual((tg.material as THREE.MeshBasicMaterial).color.toArray(), new THREE.Color().setRGB(...DIAL_GLOW).toArray(), 'an uncapped face keeps DIAL_GLOW');
});
