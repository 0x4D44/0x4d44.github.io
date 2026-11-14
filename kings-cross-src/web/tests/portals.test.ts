// web/src/portals.ts: the tunnel portals, the retaining walls and the earth bank over the tunnels.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { approachEnvelope, archOpening, area2, FIGURES, ringSelfIntersects, tunnelCover, tunnelMouths, tunnelRuns } from '../../core/landmarks.ts';
import type { Cover, Mouth } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import { Batch } from '../src/materials.ts';
import type { V3 } from '../src/materials.ts';
import { addBox, addPortals, coverParts, faceOutline, mouthParts, openingsIn, PORTAL, TUBE_LIT_ALBEDO, wingPath } from '../src/portals.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const mouths = tunnelMouths(data);
const covers = tunnelCover(data);
const runs = tunnelRuns(data);
const envelope = (m: Mouth) => approachEnvelope(data, m, PORTAL.wing.reach, PORTAL.wing.step);

interface Tri {
  p: [V3, V3, V3];
}
function triangles(m: Batch | undefined): Tri[] {
  const out: Tri[] = [];
  if (!m) return out;
  const v = (k: number): V3 => [m.positions[k * 3] as number, m.positions[k * 3 + 1] as number, m.positions[k * 3 + 2] as number];
  for (let i = 0; i < m.indices.length; i += 3) out.push({ p: [v(m.indices[i] as number), v(m.indices[i + 1] as number), v(m.indices[i + 2] as number)] });
  return out;
}
const triArea = (t: Tri): number => {
  const [a, b, c] = t.p;
  const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
};
/** world -> (across, along the axis into the tunnel, up) in a mouth's frame */
const inMouth = (m: Mouth, p: V3): { u: number; w: number; y: number } => ({ u: (p[0] - m.origin[0]) * m.across[0] + (p[2] - m.origin[1]) * m.across[1], w: (p[0] - m.origin[0]) * m.axis[0] + (p[2] - m.origin[1]) * m.axis[1], y: p[1] });
const inCover = (c: Cover, p: Pt): { u: number; w: number } => ({ u: (p[0] - c.from[0]) * c.across[0] + (p[1] - c.from[1]) * c.across[1], w: (p[0] - c.from[0]) * c.axis[0] + (p[1] - c.from[1]) * c.axis[1] });
/** Is q inside the triangle (either winding, edges count)? */
function covers2d(t: [[number, number], [number, number], [number, number]], q: [number, number]): boolean {
  const s = (a: [number, number], b: [number, number], c: [number, number]): number => (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);
  const d1 = s(q, t[0], t[1]);
  const d2 = s(q, t[1], t[2]);
  const d3 = s(q, t[2], t[0]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
/** every open-rail point, a rail sample every 1.5 m, in world metres (x, z) */
const OPEN_RAIL_POINTS: Pt[] = (() => {
  const pos = new Map(data.nodes.map(([id, x, z]) => [id, [x, z] as Pt] as const));
  const out: Pt[] = [];
  for (const r of data.rails) {
    if (r.tunnel) continue;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = pos.get(r.nodes[i] as number);
      const b = pos.get(r.nodes[i + 1] as number);
      if (!a || !b) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
      for (let k = 0; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  }
  return out;
})();
/** the open rails on a mouth's approach, as (across, metres back from the face) */
function approachSamples(m: Mouth): { u: number; d: number }[] {
  const out: { u: number; d: number }[] = [];
  for (const p of OPEN_RAIL_POINTS) {
    const x = p[0] - m.origin[0];
    const z = p[1] - m.origin[1];
    const u = x * m.across[0] + z * m.across[1];
    const d = -(x * m.axis[0] + z * m.axis[1]);
    if (d >= -1 && d <= PORTAL.wing.reach + 1 && Math.abs(u) <= m.halfWidth + 12) out.push({ u, d });
  }
  return out;
}

// ---- the face ----------------------------------------------------------------------------------

test('addBox: a box has six outward faces and the right surface area', () => {
  const m = new Batch();
  addBox(m, [1, 2, 3], [2, 0, 0], [0, 3, 0], [0, 0, 4]);
  const ts = triangles(m);
  assert.equal(ts.length, 12);
  close(ts.reduce((s, t) => s + triArea(t), 0), 2 * (2 * 3 + 2 * 4 + 3 * 4), 1e-9, 'surface');
  for (let i = 0; i < m.normals.length; i += 3) {
    // every stored normal points away from the box's centre (2, 3.5, 5)
    const out = ((m.positions[i] as number) - 2) * (m.normals[i] as number) + ((m.positions[i + 1] as number) - 3.5) * (m.normals[i + 1] as number) + ((m.positions[i + 2] as number) - 5) * (m.normals[i + 2] as number);
    assert.ok(out > 0, 'normal faces out');
  }
});

test('faceOutline: a notch for every arch, round heads at the crown height, simple and counter-clockwise', () => {
  for (const m of mouths) {
    const arches = m.bores.map(archOpening);
    const outline = faceOutline(arches, m.halfWidth, FIGURES.tunnel.parapet);
    assert.equal(ringSelfIntersects(outline), false, `${m.id}: no self-crossing`);
    assert.ok(area2(outline) > 0, `${m.id}: counter-clockwise`);
    // area = the face rectangle less the arches (a semicircle on a rectangle), to the faceting of the arc
    let holes = 0;
    for (const a of arches) holes += 2 * a.halfWidth * a.spring + (Math.PI * a.halfWidth * a.halfWidth) / 2;
    close(area2(outline) / 2, 2 * m.halfWidth * FIGURES.tunnel.parapet - holes, 0.01 * holes, `${m.id}: face area`);
    for (const a of arches) {
      const inside = outline.filter(([u, y]) => Math.abs(u - a.lateral) <= a.halfWidth + 1e-9 && y > 0);
      close(Math.max(...inside.map((p) => p[1])), FIGURES.tunnel.crown, 1e-9, `${m.id}: crown`);
    }
    // each arch is a notch in the ground line: two points on y = 0 per arch plus the two ends
    assert.equal(outline.filter((p) => p[1] === 0).length, 2 * arches.length + 2);
  }
});

test('the face wall: arches are open, piers and the wall above the crowns are solid, at every mouth', () => {
  for (const m of mouths) {
    const parts = mouthParts(m, envelope(m));
    const face = triangles(parts.brick).filter((t) => t.p.every((p) => Math.abs(inMouth(m, p).w) < 1e-6));
    assert.ok(face.length > 30, `${m.id}: face triangles`);
    const tri2d = face.map((t) => t.p.map((p) => [inMouth(m, p).u, inMouth(m, p).y]) as [[number, number], [number, number], [number, number]]);
    const solid = (q: [number, number]): boolean => tri2d.some((t) => covers2d(t, q));
    const arches = m.bores.map(archOpening).sort((a, b) => a.lateral - b.lateral);
    for (const a of arches) {
      assert.equal(solid([a.lateral, 2.0]), false, `${m.id}: the arch at ${a.lateral} is open at 2 m`);
      assert.equal(solid([a.lateral, a.crown - 0.3]), false, `${m.id}: and just under its crown`);
      assert.equal(solid([a.lateral + a.halfWidth - 0.2, 0.5]), false, `${m.id}: and by its jamb`);
      assert.equal(solid([a.lateral, a.crown + 0.4]), true, `${m.id}: wall above the crown`);
    }
    for (let i = 0; i + 1 < arches.length; i++) {
      const a = arches[i];
      const b = arches[i + 1];
      assert.ok(a && b);
      const mid = (a.lateral + a.halfWidth + (b.lateral - b.halfWidth)) / 2;
      assert.equal(solid([mid, 1.0]), true, `${m.id}: pier ${i} is solid`);
    }
    assert.equal(solid([m.halfWidth - 0.3, 3]), true, `${m.id}: the end of the face`);
    assert.equal(solid([-m.halfWidth + 0.3, 3]), true, `${m.id}: and the other end`);
    // beyond the end of the face only the thickness of a retaining wall's end reaches the plane of the face
    assert.equal(solid([m.halfWidth + PORTAL.wallThickness + 0.3, 3]), false, `${m.id}: nothing beyond the wing walls' ends`);
  }
});

test('the recess behind each arch is dark, PORTAL.recess deep, and closed at the end', () => {
  for (const m of mouths) {
    const tube = mouthParts(m, envelope(m)).tube;
    const end = triangles(tube).filter((t) => t.p.every((p) => Math.abs(inMouth(m, p).w - PORTAL.recess) < 1e-6));
    const arches = m.bores.map(archOpening);
    // the end caps together fill the arches
    const expected = arches.reduce((s, a) => s + 2 * a.halfWidth * a.spring + (Math.PI * a.halfWidth * a.halfWidth) / 2, 0);
    close(end.reduce((s, t) => s + triArea(t), 0), expected, 0.01 * expected, `${m.id}: recess end caps fill the arches`);
    const ws = triangles(tube).flatMap((t) => t.p.map((p) => inMouth(m, p).w));
    close(Math.min(...ws), 0, 1e-6, 'starts at the face');
    close(Math.max(...ws), PORTAL.recess, 1e-6, 'ends at the recess depth');
  }
});

test('stone dressing: a voussoir ring and jamb strips round every arch, and a cornice across the top of the face', () => {
  for (const m of mouths) {
    const stone = triangles(mouthParts(m, envelope(m)).stone);
    const front = stone.filter((t) => t.p.every((p) => inMouth(m, p).w < 0.01));
    const ys = front.flatMap((t) => t.p.map((p) => inMouth(m, p).y));
    assert.ok(Math.max(...ys) > FIGURES.tunnel.parapet - 0.01, `${m.id}: the cornice reaches the parapet`);
    // a ring per arch: arcSteps segments of two triangles each, plus a two-triangle strip up each jamb
    const ring = front.filter((t) => t.p.every((p) => Math.abs(inMouth(m, p).w + 0.12) < 1e-6));
    assert.equal(ring.length, m.bores.length * (2 * PORTAL.arcSteps + 2 * 2), `${m.id}: ring triangles`);
    // the ring hugs an arch: every vertex is between that opening's edge and the edge plus a voussoir width
    const arches = m.bores.map(archOpening);
    for (const t of ring) for (const p of t.p) {
      const q = inMouth(m, p);
      const hugs = arches.some((a) => {
        const r = q.y > a.spring ? Math.hypot(q.u - a.lateral, q.y - a.spring) : Math.abs(q.u - a.lateral);
        return r >= a.halfWidth - 1e-6 && r <= a.halfWidth + PORTAL.voussoir + 1e-6;
      });
      assert.ok(hugs, `${m.id}: a ring vertex at (${q.u.toFixed(2)}, ${q.y.toFixed(2)}) is not on any arch's edge band`);
    }
  }
});

// ---- the retaining walls -----------------------------------------------------------------------

test('wingPath: starts at the face end, never narrows, tapers from the parapet to the end height', () => {
  for (const m of mouths) for (const sign of [-1, 1] as const) {
    const path = wingPath(sign, m.halfWidth, FIGURES.tunnel.parapet, envelope(m));
    assert.equal(path.length, PORTAL.wing.reach / PORTAL.wing.step + 1);
    close(path[0]?.d ?? -1, 0, 1e-9, 'starts at the face');
    assert.ok(sign * (path[0]?.u ?? 0) >= m.halfWidth - 1e-9, `${m.id}: begins at or beyond the face end`);
    close(path[0]?.h ?? 0, FIGURES.tunnel.parapet, 1e-9, 'starts at the parapet');
    close(path[path.length - 1]?.h ?? 0, PORTAL.wing.endHeight, 1e-9, 'ends low');
    for (let i = 1; i < path.length; i++) {
      assert.ok(sign * (path[i]?.u ?? 0) >= sign * (path[i - 1]?.u ?? 0) - 1e-9, `${m.id}: wall ${sign} widens or holds`);
      assert.ok((path[i]?.h ?? 0) < (path[i - 1]?.h ?? 0), 'and falls');
    }
  }
});

test('the retaining walls never cross a rail: every open rail on the approach is clear of both walls', () => {
  for (const m of mouths) {
    const left = wingPath(-1, m.halfWidth, FIGURES.tunnel.parapet, envelope(m));
    const right = wingPath(1, m.halfWidth, FIGURES.tunnel.parapet, envelope(m));
    const at = (path: typeof left, d: number): number => {
      const k = Math.min(path.length - 2, Math.max(0, Math.floor(d / PORTAL.wing.step)));
      const a = path[k] as (typeof left)[number];
      const b = path[k + 1] as (typeof left)[number];
      return a.u + ((b.u - a.u) * (d - a.d)) / (b.d - a.d);
    };
    let checked = 0;
    for (const s of approachSamples(m)) {
      if (s.d < 0) continue; // a rail in front of the face's own plane is on the tunnel side of it
      checked++;
      assert.ok(s.u > at(left, s.d) + 1.0, `${m.id}: a rail at u=${s.u.toFixed(1)}, d=${s.d.toFixed(1)} is ${(s.u - at(left, s.d)).toFixed(2)} m from the left wall`);
      assert.ok(s.u < at(right, s.d) - 1.0, `${m.id}: a rail at u=${s.u.toFixed(1)}, d=${s.d.toFixed(1)} is ${(at(right, s.d) - s.u).toFixed(2)} m from the right wall`);
    }
    assert.ok(checked > 50, `${m.id}: ${checked} rail samples checked`);
  }
});

// ---- the earth bank ----------------------------------------------------------------------------

function bankMesh(c: Cover): THREE.Mesh {
  const mesh = new THREE.Mesh(coverParts(c).earth?.build() as THREE.BufferGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  return mesh;
}
/** height of the bank at a world point, or 0 where there is none */
function bankHeight(mesh: THREE.Mesh, x: number, z: number): number {
  const hit = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0];
  return hit ? 100 - hit.distance : 0;
}

test('the earth bank buries every tunnel node deeper than a train is tall', () => {
  const trainHeight = 3.9; // the model's tallest train (an HST / Class 91 class) stands about this high; PORTAL.cover.ridge is above it
  assert.equal(runs.length, covers.length);
  covers.forEach((c, i) => {
    const mesh = bankMesh(c);
    let checked = 0;
    for (const n of (runs[i] as (typeof runs)[number]).nodes) {
      const { u, w } = inCover(c, [n.x, n.z]);
      assert.ok(u >= c.lo - 1e-9 && u <= c.hi + 1e-9, `${c.name}: node ${n.id} lies inside the strip`);
      // not at a face (the arch is open there), and not on the open end's taper
      if (w < 0.5 || w > c.length - 0.5 || (c.openEnded && w > c.length - PORTAL.cover.taper)) continue;
      checked++;
      const h = bankHeight(mesh, n.x, n.z);
      assert.ok(h >= trainHeight + 0.5, `${c.name}: node ${n.id} (${w.toFixed(0)} m in) is under ${h.toFixed(2)} m of bank`);
    }
    assert.ok(checked >= 5, `${c.name}: ${checked} nodes checked`);
  });
});

test('the earth bank stays close to its tunnel: its foot is within 12 m of the strip, and no open rail runs alongside that close', () => {
  for (const c of covers) {
    const pos = (coverParts(c).earth?.build() as THREE.BufferGeometry).getAttribute('position');
    let beyond = 0;
    for (let i = 0; i < pos.count; i++) {
      const { u, w } = inCover(c, [pos.getX(i), pos.getZ(i)]);
      assert.ok(w >= -1e-3 && w <= c.length + 1e-3,`${c.name}: the bank lies within the run (${w.toFixed(1)} m of ${c.length.toFixed(1)})`);
      beyond = Math.max(beyond, c.lo - u, u - c.hi);
    }
    // the ends are as high as the face wall's cap (parapet less 0.3 m) with a 45 degree slope and a pad: the widest part of the foot
    close(beyond, PORTAL.cover.pad + FIGURES.tunnel.parapet - 0.3, 1e-3, `${c.name}: how far the foot spreads beyond the strip (positions are 32-bit floats)`);
    assert.ok(beyond <= 12, `${c.name}: the foot spreads ${beyond.toFixed(1)} m beyond the strip`);
    // open rails running alongside the run (not the portals' own nodes, within 1 m of an end) are all farther than that
    let nearest = Infinity;
    for (const p of OPEN_RAIL_POINTS) {
      const { u, w } = inCover(c, p);
      if (w < 1 || w > c.length - 1) continue;
      nearest = Math.min(nearest, Math.max(c.lo - u, u - c.hi, 0));
    }
    assert.ok(nearest > beyond + 10, `${c.name}: the nearest open rail alongside is ${nearest.toFixed(1)} m from the strip, the bank's foot ${beyond.toFixed(1)} m`);
  }
});

test('the earth bank leaves the arches open: its end cap has a notch for every bore', () => {
  for (const c of covers) {
    const mesh = bankMesh(c);
    const m0 = c.mouths[0] as Mouth;
    const arches = openingsIn(c, m0);
    assert.equal(arches.length, m0.bores.length);
    // a ray along the run at 2 m, from 5 m before the face to 1 m after it (the cap stands 0.3 m in)
    const ray = (lateral: number): THREE.Raycaster => new THREE.Raycaster(new THREE.Vector3(c.from[0] + c.across[0] * lateral - c.axis[0] * 5, 2, c.from[1] + c.across[1] * lateral - c.axis[1] * 5), new THREE.Vector3(c.axis[0], 0, c.axis[1]), 0, 6);
    for (const a of arches) {
      assert.equal(ray(a.lateral).intersectObject(mesh).length, 0, `${c.name}: a ray through the arch at ${a.lateral.toFixed(1)} meets no bank cap`);
      assert.ok(ray(a.lateral + a.halfWidth + 0.4).intersectObject(mesh).length > 0, `${c.name}: ...but the cap is there beside it`);
    }
  }
});

test('openingsIn: a far mouth looks back the other way, so its arches run across the run in the opposite order', () => {
  const gas = covers.find((c) => c.name === 'Gasworks Tunnel');
  assert.ok(gas);
  assert.equal(gas.mouths.length, 2);
  const south = openingsIn(gas, gas.mouths[0]).map((o) => o.lateral);
  const north = openingsIn(gas, gas.mouths[1]).map((o) => o.lateral);
  assert.equal(south.length, 3);
  assert.equal(north.length, 3);
  assert.ok((south[0] as number) < (south[1] as number) && (south[1] as number) < (south[2] as number), "the first mouth's arches increase across the run");
  assert.ok((north[0] as number) > (north[1] as number) && (north[1] as number) > (north[2] as number), "the far mouth's decrease");
  // and the arches sit over the tunnel's own nodes: every arch is inside the strip, give or take the face's masonry
  for (const l of [...south, ...north]) assert.ok(l >= gas.lo - 4 && l <= gas.hi + 4, `arch at ${l.toFixed(1)} is within the strip ${gas.lo.toFixed(1)}..${gas.hi.toFixed(1)}`);
  assert.deepEqual(openingsIn(gas, undefined), []);
});

// ---- assembly ----------------------------------------------------------------------------------

test('addPortals: four draw calls, a modest triangle budget, all three mouths, and a clean dispose', () => {
  const scene = new THREE.Scene();
  const p = addPortals(scene, data);
  assert.equal(p.group.parent, scene);
  assert.equal(p.mouths.length, 3);
  assert.equal(p.stats.mouths, 3);
  assert.equal(p.stats.meshes, p.group.children.length);
  assert.ok(p.group.children.length <= 4, `${p.group.children.length} draw calls`);
  assert.ok(p.stats.triangles > 500 && p.stats.triangles < 8000, `${p.stats.triangles} triangles`);
  let disposed = 0;
  for (const c of p.group.children as THREE.Mesh[]) c.geometry.addEventListener('dispose', () => disposed++);
  const meshes = p.group.children.length;
  p.dispose();
  assert.equal(p.group.parent, null);
  assert.equal(disposed, meshes, 'every geometry freed');
});

test('addPortals({ cover: false }) leaves out the earth bank and nothing else', () => {
  const scene = new THREE.Scene();
  const withBank = addPortals(scene, data);
  const without = addPortals(scene, data, { cover: false });
  const names = (g: THREE.Group): string[] => g.children.map((c) => c.name).sort();
  assert.ok(names(withBank.group).includes('portals-earth'));
  assert.deepEqual(names(without.group), names(withBank.group).filter((n) => n !== 'portals-earth'));
  assert.ok(without.stats.triangles < withBank.stats.triangles);
  withBank.dispose();
  without.dispose();
});

test('addPortals: the tunnels\' lining, drawn near black, takes a train\'s headlamps as sooty brick (train-headlamp-light.ts); the faces and the bank are Lambert and take them with the rest', () => {
  const scene = new THREE.Scene();
  const p = addPortals(scene, data);
  const basics = (p.group.children as THREE.Mesh[]).map((m) => m.material as THREE.Material).filter((m) => (m as THREE.MeshBasicMaterial).isMeshBasicMaterial);
  assert.equal(basics.length, 1, 'the lining is the one unlit part');
  assert.equal(basics[0]!.customProgramCacheKey(), `${new THREE.MeshBasicMaterial().customProgramCacheKey()}+headlampBasic-${TUBE_LIT_ALBEDO}`);
  assert.ok(TUBE_LIT_ALBEDO > 0.03 && TUBE_LIT_ALBEDO < 0.3, 'darker than most brick, brighter than its drawn colour');
  p.dispose();
});
