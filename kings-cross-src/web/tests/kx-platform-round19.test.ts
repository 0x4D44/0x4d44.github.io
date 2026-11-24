import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { shedLayout, worldToShed } from '../../core/station.ts';
import * as furniture from '../src/furniture.ts';
import * as night from '../src/night.ts';

// Round 19 (platform-round-6 score, sections 3 and 5): the trolleys as shed-e's nested row, the trolley point to one side by the bins, the platform clock's
// night dial neutral, and the clock's scroll cheeks and spandrel roundels.
const data = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData;
const layout = shedLayout(data);
const F = furniture as unknown as Record<string, unknown>;

test('B5: the trolleys are a nested row: parallel, 70% overlapped, each on four castors with a low base, a sloped handle at the back, under 600 triangles', () => {
  const T = F.TROLLEY as { n: number; pitch: number; len: number } ;
  assert.ok(T.n >= 3 && T.n <= 4, `${T.n} trolleys`);
  const overlap = 1 - T.pitch / T.len;
  assert.ok(overlap > 0.6 && overlap < 0.8, `each overlaps the next by ${(overlap * 100).toFixed(0)}% of its length`);
  const g = furniture.extraGeometry({ kind: 'trolley', label: '1' });
  const p = g.getAttribute('position'), tris = g.index!.count / 3;
  assert.ok(tris <= 600, `${tris} triangles a trolley point`);
  // re-pinned (round 19, second pass, the lead: end-on to platform-furniture the nesting did not read): the row runs across the platform (local x), side-on to
  // a camera looking along it, so the trolleys' lengths, rails and sloped uprights are measured in x
  const xs: number[] = [], zsF: number[] = [];
  for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0.1 && p.getY(i) < 1.2) { xs.push(p.getX(i)); zsF.push(p.getZ(i)); }
  const spanX = Math.max(...xs) - Math.min(...xs), spanZ = Math.max(...zsF) - Math.min(...zsF);
  assert.ok(spanX > 1.4 && spanZ < 0.8, `the row ${spanX.toFixed(2)} m across the platform, ${spanZ.toFixed(2)} m along it`);
  // castors: vertices on the ground (y = 0) in front of the board, in 4 x n separate feet
  const feet = new Set<string>();
  for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0.1 && p.getY(i) < 1e-6) feet.add(`${Math.round(p.getX(i) * 20)},${Math.round(p.getZ(i) * 10)}`);
  assert.ok(feet.size >= 4 * T.n, `${feet.size} castor feet on the ground`);
  // the base frame: low bars (under 0.15 m) running each trolley's length
  let low = 0, sloped = 0;
  for (let i = 0; i + 3 < p.count; i += 4) {
    const ys = [0, 1, 2, 3].map((k) => p.getY(i + k)), xq = [0, 1, 2, 3].map((k) => p.getX(i + k));
    if (Math.max(...ys) < 0.15 && Math.min(...ys) > 0.05 && Math.max(...xq) - Math.min(...xq) > 0.8 * T.len) low++;
    // a sloped bar: a face whose corners differ in both y and x (round 18's posts were upright)
    const dy = Math.abs(p.getY(i + 2) - p.getY(i + 1)), dx = Math.abs(p.getX(i + 2) - p.getX(i + 1));
    if (dy > 0.5 && dx > 0.1 && p.getZ(i) > 0.1) sloped++;
  }
  assert.ok(low >= 2 * T.n, `${low} faces of low side rails: a base frame under each trolley`);
  assert.ok(sloped >= 2 * T.n, `${sloped} sloped faces: the uprights lean back to the handle`);
  // the handles at the backs: every vertex at handle height (1.0-1.05 m) in front of the board lies between the first trolley's back and the last's, less the
  // handle's lean (0.17 m), never over a basket or a nose
  const zc = (0.3 - 0.17 + 0.3 + (T.n - 1) * T.pitch + T.len) / 2, back0 = 0.3 - 0.17 - zc, backN = 0.3 + (T.n - 1) * T.pitch - zc;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < 0.1 || p.getY(i) < 0.995 || p.getY(i) > 1.05) continue;
    assert.ok(p.getX(i) > back0 - 0.05 && p.getX(i) < backN + 0.05, `a handle vertex at x ${p.getX(i).toFixed(2)}, beyond the backs ${back0.toFixed(2)} to ${backN.toFixed(2)}`);
  }
});

test('B5: each trolley point stands beside its bins, TROLLEY_ASIDE across from the blade post\'s line, or past the bins on the far side from the blade', () => {
  const plan = furniture.furniturePlan(data, layout as never);
  const aside = F.TROLLEY_ASIDE as number, beside = F.EXTRA_BESIDE as number;
  assert.ok(aside >= 1.3, `TROLLEY_ASIDE ${aside} m: the board's width and 0.3 m`);
  let placed = 0;
  for (const t of plan.extras.filter((e) => e.kind === 'trolley')) {
    const at = worldToShed(layout, [t.x, t.z]);
    const bins = plan.extras.find((e) => e.kind === 'bins' && e.label === t.label), blade = plan.extras.find((e) => e.kind === 'blade' && e.label === t.label);
    if (!bins || !blade) continue;
    const b = worldToShed(layout, [bins.x, bins.z]), k = worldToShed(layout, [blade.x, blade.z]);
    const off = Math.abs(at.u - k.u), past = (at.v - b.v) * Math.sign(b.v - k.v); // > 0: past the bins, on the far side from the blade
    if (Math.abs(at.v - b.v) > 6) continue; // no room beside the bins (a narrow band): one of EXTRAS.trolley's own places along the platform, as before
    assert.ok(off >= aside - 1e-6 || Math.abs(past - beside) < 0.05, `platform ${t.label}: ${off.toFixed(2)} m across from the post, ${past.toFixed(2)} m past the bins`);
    assert.ok(past > 0, `platform ${t.label}: on the far side of the bins from the blade (${past.toFixed(2)} m)`);
    placed++;
  }
  assert.ok(placed >= 4, `${placed} trolley points with their group`);
  const six = plan.extras.find((e) => e.kind === 'trolley' && e.label === '6 7')!, post = plan.extras.find((e) => e.kind === 'blade' && e.label === '6 7')!;
  assert.ok(Math.abs(worldToShed(layout, [six.x, six.z]).u - worldToShed(layout, [post.x, post.z]).u) >= aside - 1e-6, 'the 6-7 island\'s stands aside of its blade post');
});

test('B5: from platform-furniture the 6-7 trolley board does not overlap the blade post on the screen', () => {
  const cams = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-station-cameras.json', import.meta.url), 'utf8')) as Record<string, { pos: number[]; target: number[]; fov?: number }>;
  const cam = cams['platform-furniture']!;
  const camera = new THREE.PerspectiveCamera(cam.fov ?? 50, 1280 / 800, 0.1, 9000);
  camera.position.set(cam.pos[0]!, cam.pos[1]!, cam.pos[2]!);
  camera.lookAt(cam.target[0]!, cam.target[1]!, cam.target[2]!);
  camera.updateMatrixWorld();
  const plan = furniture.furniturePlan(data, layout as never);
  const of = (kind: string) => plan.extras.find((e) => e.kind === kind && e.label === '6 7');
  const board = of('trolley'), blade = of('blade');
  assert.ok(board && blade, 'the 6-7 group has a trolley point and a blade');
  const B = F.BLADE as { top: number; size: number };
  const screenX = (e: { x: number; z: number; rotY: number }, box: [number, number, number, number, number, number]): [number, number] => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(e.x, PLATFORM_HEIGHT, e.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.rotY), new THREE.Vector3(1, 1, 1));
    const xs: number[] = [];
    for (const x of [box[0], box[3]]) for (const y of [box[1], box[4]]) for (const z of [box[2], box[5]]) xs.push(new THREE.Vector3(x, y, z).applyMatrix4(m).project(camera).x);
    return [Math.min(...xs), Math.max(...xs)];
  };
  const b = screenX(board, [-0.5, 1.0, -0.045, 0.5, 2.25, 0.045]), post = screenX(blade, [-0.05, 0, -0.05, 0.05, B.top - B.size, 0.05]);
  assert.ok(b[1] < post[0] || post[1] < b[0], `the board at x ${b.map((v) => v.toFixed(3))} and the post at ${post.map((v) => v.toFixed(3))} (NDC) overlap`);
});

test('B5: the platform clock\'s night dial comes out neutral (blue minus red under 5), on round 17\'s capture of it', () => {
  // DIAL_NEUTRAL_MODEL: final = face + k * glow colour (linear), k and the face from the round-17 capture (227, 234, 246) with the glow at 1.1 in each channel
  const lin = (c: number): number => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const srgb = (l: number): number => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);
  const face = [63, 78, 109].map(lin), seen = [227, 234, 246].map(lin), k = seen.map((s, i) => (s - face[i]!) / 1.1);
  const c = night.DIAL_GLOW_NEUTRAL;
  const out = [0, 1, 2].map((i) => srgb(Math.min(1, face[i]! + k[i]! * c[i]!)));
  assert.ok(Math.abs(out[2]! - out[0]!) < 5, `the dial at (${out.map((v) => v.toFixed(0)).join(', ')}): blue minus red ${(out[2]! - out[0]!).toFixed(1)}`);
  assert.ok(out[1]! > 225 && out[1]! < 245, 'about as bright as before');
});

test('B5: the platform clock has solid cheeks under the dial (a plate, not a fan of bars) and a large spandrel roundel, a third of the spandrel\'s depth', async () => {
  const shed = await import('../src/shed.ts') as unknown as Record<string, unknown>;
  const spec = shed.PLATFORM_CLOCK as { spandrel: number; y: number; beamDrop: number; wall: number; out: number; radius: number };
  const roundels = shed.SPANDREL_ROUNDELS as [number, number, number][];
  const big = Math.max(...roundels.map((r) => r[2]));
  assert.ok(2 * big >= (spec.spandrel / 3) * 0.9, `the largest roundel ${(2 * big).toFixed(2)} m across, a third of the spandrel's ${spec.spandrel} m is ${(spec.spandrel / 3).toFixed(2)}`);
  // each roundel inside the web: clear of the wall, the beam and the curve
  for (const [dx, dy, r] of roundels) {
    const fromCurve = Math.hypot(dx - spec.spandrel, -dy - spec.spandrel) - spec.spandrel;
    assert.ok(dx >= r && -dy >= r && fromCurve >= r, `the roundel at ${dx}, ${dy} (r ${r}) inside the web`);
  }
  // the cheeks: on each side of the dial, a face square to z of at least 0.08 m^2 between the dial's foot and the cresting's edge
  const clock = (shed.buildPlatformClock as (l: number) => THREE.Group)(layout.length);
  const geo = (clock.getObjectByName('shed-platform-clock-iron') as THREE.Mesh).geometry, p = geo.getAttribute('position'), idx = geo.index!;
  const cx = spec.wall + spec.out, area = [0, 0];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    A.fromBufferAttribute(p, idx.getX(i)); B.fromBufferAttribute(p, idx.getX(i + 1)); C.fromBufferAttribute(p, idx.getX(i + 2));
    N.copy(B).sub(A).cross(C.clone().sub(A));
    const a = N.length() / 2;
    if (a < 1e-9 || Math.abs(N.z) / (2 * a) < 0.99) continue;
    const mx = (A.x + B.x + C.x) / 3 - cx, my = (A.y + B.y + C.y) / 3;
    if (Math.abs(mx) > spec.radius * 0.55 && my < spec.y - spec.radius + 0.2 && my > spec.y - spec.beamDrop + 0.12 && a >= 0.015) area[mx > 0 ? 1 : 0]! += a; // a plate's triangle above the beam and the plinth (a bar's face is under 0.005)
  }
  for (const a of area) assert.ok(a >= 0.08 * 2, `a cheek's faces cover ${a.toFixed(3)} m^2 (both faces)`);
  // the large roundel is open: no face of the web's plate covers its centre (round 16's open test looked for vertices, and a slat run whole through a roundel
  // this size has none near its centre)
  const beamY = spec.y - spec.beamDrop, zMid = (() => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < p.count; i++) { lo = Math.min(lo, p.getZ(i)); hi = Math.max(hi, p.getZ(i)); } return (lo + hi) / 2; })();
  const inTri = (x: number, y: number): boolean => {
    const d = (ax: number, ay: number, bx: number, by: number) => (x - bx) * (ay - by) - (ax - bx) * (y - by);
    const d1 = d(A.x, A.y, B.x, B.y), d2 = d(B.x, B.y, C.x, C.y), d3 = d(C.x, C.y, A.x, A.y);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  for (const [dx, dy] of roundels) {
    const x = spec.wall + dx, y = beamY + dy;
    for (let i = 0; i < idx.count; i += 3) {
      A.fromBufferAttribute(p, idx.getX(i)); B.fromBufferAttribute(p, idx.getX(i + 1)); C.fromBufferAttribute(p, idx.getX(i + 2));
      if (Math.abs(A.z - B.z) > 1e-6 || Math.abs(A.z - C.z) > 1e-6 || Math.abs(A.z - zMid) > 0.03) continue;
      assert.ok(!inTri(x, y), `a face at z ${(A.z - zMid).toFixed(3)} covers the roundel at ${dx}, ${dy}`);
    }
  }
  // the cheek's edge: its rim bars (deeper than the plate) along the quarter ellipse, either side
  const crest = shed.CRESTING as { a: number; b: number }, depth = (shed.CHEEK as { depth: number }).depth;
  const top = beamY + 0.09;
  for (const sd of [-1, 1]) {
    let rim = 0;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(Math.abs(p.getZ(i) - zMid) - depth / 2) < 0.002) continue; // the plate's own corners
      if (Math.abs(p.getZ(i) - zMid) < depth / 2 + 0.005) continue;
      const u = Math.atan2(sd * (p.getX(i) - (cx + sd * spec.radius * 0.55)) / crest.a, (p.getY(i) - top) / crest.b);
      if (u < 0 || u > Math.PI / 2) continue;
      const q = [cx + sd * spec.radius * 0.55 + sd * crest.a * Math.sin(u), top + crest.b * Math.cos(u)];
      if (Math.hypot(p.getX(i) - q[0]!, p.getY(i) - q[1]!) < 0.04) rim++;
    }
    assert.ok(rim >= 12, `${rim} rim-bar corners along the ${sd > 0 ? 'right' : 'left'} cheek's edge`);
  }
});
