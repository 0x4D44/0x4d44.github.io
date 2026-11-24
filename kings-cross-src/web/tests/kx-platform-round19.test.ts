import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
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
  // castors: vertices on the ground (y = 0) in front of the board, in 4 x n separate feet; base: something below 0.15 m; handle: the highest bar behind each base
  const feet = new Set<string>();
  let handleZ = -Infinity, low = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z > 0.1 && y < 1e-6) feet.add(`${Math.round(x * 10)},${Math.round(z * 20)}`);
    if (y > 0.98 && y < 1.1 && Math.abs(x) < 0.4) handleZ = Math.max(handleZ, z);
  }
  assert.ok(feet.size >= 4 * T.n, `${feet.size} castor feet on the ground`);
  // the base frame: low bars (under 0.15 m) running the trolley's length
  for (let i = 0; i + 3 < p.count; i += 4) {
    const ys = [0, 1, 2, 3].map((k) => p.getY(i + k)), zs = [0, 1, 2, 3].map((k) => p.getZ(i + k));
    if (Math.max(...ys) < 0.15 && Math.min(...ys) > 0.05 && Math.max(...zs) - Math.min(...zs) > 0.8 * T.len) low++;
  }
  assert.ok(low >= 2 * T.n, `${low} faces of low side rails: a base frame under each trolley`);
  // the handle sits behind the first trolley's back (its uprights slope back), not over its basket
  assert.ok(handleZ < 0.3 + (T.n - 1) * T.pitch, `the last handle at z ${handleZ.toFixed(2)}, behind that trolley's back`);
  // a sloped bar: some quad corner pairs differ in both y and z (round 18's posts were upright)
  let sloped = 0;
  for (let i = 0; i + 3 < p.count; i += 4) {
    const dy = Math.abs(p.getY(i + 2) - p.getY(i + 1)), dz = Math.abs(p.getZ(i + 2) - p.getZ(i + 1));
    if (dy > 0.5 && dz > 0.1) sloped++;
  }
  assert.ok(sloped >= 2 * T.n, `${sloped} sloped faces: the uprights lean back to the handle`);
});

test('B5: the trolley point closes its group\'s line, EXTRA_BESIDE past the blade or the bins, at the side of its band (off the bins\' line)', () => {
  const plan = furniture.furniturePlan(data, layout as never);
  const beside = F.EXTRA_BESIDE as number;
  assert.ok(beside >= 2.3 && beside <= 3, `EXTRA_BESIDE ${beside} m`);
  const trolleys = plan.extras.filter((e) => e.kind === 'trolley');
  let grouped = 0;
  for (const t of trolleys) {
    const at = worldToShed(layout, [t.x, t.z]);
    const mates = plan.extras.filter((e) => e.label === t.label && (e.kind === 'bins' || e.kind === 'blade')).map((e) => ({ e, s: worldToShed(layout, [e.x, e.z]) }));
    if (mates.some(({ s }) => Math.abs(Math.abs(s.v - at.v) - beside) < 0.05)) grouped++;
    const bins = mates.find(({ e }) => e.kind === 'bins');
    if (bins) assert.ok(Math.abs(at.u - bins.s.u) > 0.05, `platform ${t.label}: the trolley point ${(at.u - bins.s.u).toFixed(2)} m across from the bins' line`);
  }
  assert.ok(grouped >= 5, `${grouped} of ${trolleys.length} trolley points beside their bins or blade`);
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
