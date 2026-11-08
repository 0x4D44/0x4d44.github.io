// The ground as the page draws it (web/src/world.ts) and the tunnel mouths cut into it (web/src/portals.ts, terrain mode),
// held to the committed Environment Agency terrain (web/src/data/kx-terrain.json) and the tunnel mouths in kx-track.json.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { FIGURES, tunnelMouths } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import { railSegments } from '../../core/scene.ts';
import { buildTerrainMesh, createTerrain, distanceField, terrainFromFunction, toleranceNearRails } from '../../core/terrain.ts';
import type { TerrainFile } from '../../core/terrain.ts';
import { addPortals, BLOCK, blockTop, inMouthFrame, mouthPartsTerrain, portalHole } from '../src/portals.ts';
import { addTerrain, flatRing, GROUND_Y } from '../src/world.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const file: TerrainFile = JSON.parse(readFileSync(new URL('../src/data/kx-terrain.json', import.meta.url), 'utf8'));
const field = createTerrain(file);
const mouths = tunnelMouths(data);
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);

/** The real mesh, built the way main.ts builds it: tolerance by distance to the open rails, the portal strips left out. */
function realMesh(exclude?: (x: number, z: number) => boolean): ReturnType<typeof buildTerrainMesh> {
  const rails = railSegments(data);
  const segments: [number, number, number, number][] = [];
  for (const flat of [rails.main, rails.siding]) for (let i = 0; i + 5 < flat.length; i += 6) segments.push([flat[i] as number, flat[i + 2] as number, flat[i + 3] as number, flat[i + 5] as number]);
  return buildTerrainMesh(field, { exclude, toleranceAt: toleranceNearRails(distanceField(segments, field.extent)) });
}

// ---- world.ts ----------------------------------------------------------------------------------------

test('world: GROUND_Y is the terrain file\'s own groundY, so the flat plane meets the terrain\'s edge at the same height', () => {
  assert.equal(GROUND_Y, file.groundY);
  close(field.heightAt(file.extent.x0, file.extent.z0), GROUND_Y, 1e-6, 'the corner of the extent is the flat plane');
});

test('flatRing: the plane outside a rectangle and nothing inside it, level at GROUND_Y, every triangle facing up', () => {
  const hole = { x0: -100, z0: -200, x1: 300, z1: 400 };
  const g = flatRing(hole, 1000);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  assert.equal(p.count % 3, 0);
  let area = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i);
    const az = p.getZ(i);
    const bx = p.getX(i + 1);
    const bz = p.getZ(i + 1);
    const cx = p.getX(i + 2);
    const cz = p.getZ(i + 2);
    for (let k = 0; k < 3; k++) close(p.getY(i + k), GROUND_Y, 1e-6, 'level');
    const up = ((bz - az) * (cx - ax) - (bx - ax) * (cz - az)) / 2; // y of the face normal: positive is counter-clockwise from above
    assert.ok(up > 0, `triangle ${i / 3} faces down or is degenerate`);
    area += up;
    const mx = (ax + bx + cx) / 3;
    const mz = (az + bz + cz) / 3;
    assert.ok(!(mx > hole.x0 && mx < hole.x1 && mz > hole.z0 && mz < hole.z1), 'a triangle lies over the hole');
  }
  close(area, 2000 * 2000 - 400 * 600, 1e-6, 'the ring\'s area is the square less the hole');
});

/** A step, a 45 degree bank, a 72 degree face and a plateau: one of each class. */
const ridge = (x: number): number => (x < 100 ? 0 : x < 104 ? x - 100 : x < 108 ? 4 + 3 * (x - 104) : 16);
const EXT256 = { x0: 0, z0: 0, x1: 256, z1: 256 };

test('addTerrain: ground, bank and wall in their own draws, every triangle in exactly one, the wall with UVs in metres', () => {
  const scene = new THREE.Scene();
  const t = terrainFromFunction(ridge, EXT256, 1);
  const d = addTerrain(scene, t, { tolerance: () => 0.02 });
  assert.equal(d.group.parent, scene);
  assert.deepEqual(d.group.children.map((c) => c.name).sort(), ['terrain-bank', 'terrain-ground', 'terrain-wall']);
  assert.equal(d.stats.triangles, d.mesh.triangles);
  assert.equal(d.stats.ground + d.stats.bank + d.stats.wall, d.stats.triangles);
  assert.ok(d.stats.ground > 0 && d.stats.bank > 0 && d.stats.wall > 0, `${d.stats.ground} ground, ${d.stats.bank} bank, ${d.stats.wall} wall`);
  assert.equal(d.stats.meshes, 3);
  const wall = d.group.children.find((c) => c.name === 'terrain-wall') as THREE.Mesh;
  const uv = wall.geometry.getAttribute('uv') as THREE.BufferAttribute;
  const pos = wall.geometry.getAttribute('position') as THREE.BufferAttribute;
  assert.equal(uv.count, pos.count);
  for (let i = 0; i < pos.count; i++) {
    close(uv.getY(i), pos.getY(i), 1e-6, 'v is height in metres');
    const u = uv.getX(i);
    assert.ok(Math.abs(u - pos.getX(i)) < 1e-6 || Math.abs(u - pos.getZ(i)) < 1e-6, 'u is the distance along x or z, in metres');
  }
  let freed = 0;
  for (const c of d.group.children as THREE.Mesh[]) c.geometry.addEventListener('dispose', () => freed++);
  d.dispose();
  assert.equal(d.group.parent, null);
  assert.equal(freed, 3, 'every draw\'s geometry is freed');
});

test('addTerrain: ground reads the drawn surface; exclude leaves a hole of exactly the triangles named', () => {
  const scene = new THREE.Scene();
  const t = terrainFromFunction((x, z) => 1.5 * Math.sin(x / 13) * Math.cos(z / 9), EXT256, 2);
  const whole = addTerrain(scene, t, { tolerance: () => 0.15 });
  for (const [x, z] of [[17.3, 40.1], [128, 128], [200.5, 77.7]] as const) assert.equal(whole.ground.heightAt(x, z), whole.mesh.heightAt(x, z));
  assert.ok(Math.abs(whole.ground.heightAt(17.3, 40.1) - t.heightAt(17.3, 40.1)) <= 0.5, 'near the field, within the tolerance and a little');
  assert.equal(whole.ground.extent, t.extent);
  const hole = (x: number, z: number): boolean => x > 100 && x < 140 && z > 100 && z < 140;
  const cut = addTerrain(scene, t, { tolerance: () => 0.15, exclude: hole });
  assert.ok(cut.stats.triangles < whole.stats.triangles, `${cut.stats.triangles} against ${whole.stats.triangles}`);
  const names = cut.group.children.flatMap((c) => {
    const g = (c as THREE.Mesh).geometry;
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const idx = g.getIndex();
    const out: [number, number][] = [];
    const count = idx ? idx.count : p.count;
    for (let i = 0; i < count; i += 3) {
      const v = (k: number): number => (idx ? idx.getX(i + k) : i + k);
      out.push([(p.getX(v(0)) + p.getX(v(1)) + p.getX(v(2))) / 3, (p.getZ(v(0)) + p.getZ(v(1)) + p.getZ(v(2))) / 3]);
    }
    return out;
  });
  assert.ok(names.length > 0 && names.every(([x, z]) => !hole(x, z)), 'no triangle centre is inside the hole');
  whole.dispose();
  cut.dispose();
});

test('addTerrain: given the rails, the mesh hugs the ground close to them and lets go with distance, with far fewer triangles', () => {
  const scene = new THREE.Scene();
  const rolling = (x: number, z: number): number => 0.8 * Math.sin(x / 12) * Math.cos(z / 17) + 0.5 * Math.sin((x + z) / 29);
  const t = terrainFromFunction(rolling, EXT256, 4); // a grid of 4 m or coarser: only finer ones (the portal patches) are held to their own scale
  const rails = { main: [0, 0, 128, 256, 0, 128], siding: [] as number[] };
  const plain = addTerrain(scene, t, { tolerance: () => 0.03 });
  const near = addTerrain(scene, t, { rails });
  assert.ok(near.stats.triangles < 0.7 * plain.stats.triangles, `${near.stats.triangles} against ${plain.stats.triangles}`);
  const p = near.mesh.positions;
  let close_ = 0;
  let far = 0;
  for (let i = 0; i < near.mesh.vertices; i++) {
    const dz = Math.abs((p[i * 3 + 2] as number) - 128);
    if (dz < 16) close_++;
    else if (dz > 80) far++;
  }
  // 32 m either side of the rail against 2 x 48 m far from it: the density of vertices must be several times greater by the rail
  const density = (n: number, widthMetres: number): number => n / (widthMetres * 256);
  assert.ok(density(close_, 32) > 3 * density(far, 96), `${close_} vertices within 16 m of the rail, ${far} beyond 80 m`);
  // and within the rail's corridor the drawn surface is within 3 cm... 5 cm of the field
  let worst = 0;
  for (let x = 4; x < 252; x += 7.3) for (let z = 118; z < 138; z += 3.1) worst = Math.max(worst, Math.abs(near.ground.heightAt(x, z) - t.heightAt(x, z)));
  assert.ok(worst < 0.08, `worst departure beside the rail ${worst.toFixed(3)} m`);
  plain.dispose();
  near.dispose();
});

// ---- portals.ts, terrain mode -------------------------------------------------------------------------

test('inMouthFrame: u across the face, w along the axis into the tunnel', () => {
  for (const m of mouths) {
    const x = m.origin[0] + 5 * m.axis[0] + 2 * m.across[0];
    const z = m.origin[1] + 5 * m.axis[1] + 2 * m.across[1];
    const f = inMouthFrame(m, x, z);
    close(f.u, 2, 1e-9, `${m.id} u`);
    close(f.w, 5, 1e-9, `${m.id} w`);
  }
});

test('portalHole: the strip behind the face and across the arches, and no more', () => {
  const hole = portalHole(mouths);
  const probe = (m: (typeof mouths)[number], u: number, w: number): boolean => hole(m.origin[0] + u * m.across[0] + w * m.axis[0], m.origin[1] + u * m.across[1] + w * m.axis[1]);
  for (const m of mouths) {
    assert.ok(probe(m, 0, 1), `${m.id}: behind the face, in the hole`);
    assert.ok(probe(m, m.halfWidth - 0.5, 0.5), `${m.id}: near the edge of the strip`);
    assert.ok(!probe(m, 0, BLOCK.hole[0] - 0.5), `${m.id}: in front of the face is open ground`);
    assert.ok(!probe(m, 0, BLOCK.hole[1] + 0.5), `${m.id}: beyond the strip the terrain is back`);
    assert.ok(!probe(m, m.halfWidth + 0.5, 1), `${m.id}: beside the strip the terrain is back`);
  }
  assert.ok(!hole(10_000, 10_000), 'nowhere else');
});

test('the real mesh with the strips left out has no triangle in them, and the earth over every bore is above the crown', () => {
  const hole = portalHole(mouths);
  const mesh = realMesh(hole);
  const p = mesh.positions;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] as number;
    const b = mesh.indices[i + 1] as number;
    const c = mesh.indices[i + 2] as number;
    const cx = ((p[a * 3] as number) + (p[b * 3] as number) + (p[c * 3] as number)) / 3;
    const cz = ((p[a * 3 + 2] as number) + (p[b * 3 + 2] as number) + (p[c * 3 + 2] as number)) / 3;
    assert.ok(!hole(cx, cz), `a triangle stands in a portal strip at ${cx.toFixed(1)}, ${cz.toFixed(1)}`);
  }
  const whole = realMesh();
  assert.ok(whole.triangles > mesh.triangles, 'the strips took some triangles out');
  // behind the strip, over the bores, the drawn ground is at least the crown plus a metre of cover (the DTM's blurred ramp is gone)
  for (const m of mouths) {
    for (let w = BLOCK.hole[1] + 0.4; w <= 10; w += 1) {
      for (let u = -m.halfWidth; u <= m.halfWidth + 1e-9; u += 1) {
        const y = mesh.heightAt(m.origin[0] + u * m.across[0] + w * m.axis[0], m.origin[1] + u * m.across[1] + w * m.axis[1]);
        assert.ok(y >= FIGURES.tunnel.crown + 0.8, `${m.id}: ground ${y.toFixed(2)} m over the bore at u ${u.toFixed(1)}, ${w.toFixed(1)} m in`);
      }
    }
  }
});

test('blockTop: the parapet, or the ground behind the block when that is higher', () => {
  const m = mouths[0] as (typeof mouths)[number];
  assert.equal(blockTop(m, { heightAt: () => -0.2 }), FIGURES.tunnel.parapet);
  close(blockTop(m, { heightAt: () => 25 }), 25.05, 1e-9, 'tall ground behind');
  const ramp = (x: number, z: number): number => 12 + 0.5 * inMouthFrame(m, x, z).w; // rises into the tunnel
  const top = blockTop(m, { heightAt: ramp });
  close(top, 12 + 0.5 * BLOCK.depth + 0.05, 1e-9, 'the ground where the lid ends, 4.6 m in');
});

test('mouthPartsTerrain: a plinth to the ground, a lid at the top as wide as the block is deep, and the arches\' recess tubes', () => {
  const flat = { heightAt: () => GROUND_Y };
  for (const m of mouths) {
    const parts = mouthPartsTerrain(m, flat);
    const top = blockTop(m, flat);
    const Hb = m.halfWidth + BLOCK.flank;
    const earth = parts.earth;
    assert.ok(earth && earth.indices.length === 6, 'the lid is one quad');
    for (let i = 0; i < (earth as NonNullable<typeof earth>).positions.length; i += 3) close((earth as NonNullable<typeof earth>).positions[i + 1] as number, top, 1e-9, `${m.id} lid height`);
    // the lid's footprint is 2 Hb by BLOCK.depth
    let lo = Infinity;
    let hi = -Infinity;
    let uLo = Infinity;
    let uHi = -Infinity;
    const e = earth as NonNullable<typeof earth>;
    for (let i = 0; i < e.positions.length; i += 3) {
      const f = inMouthFrame(m, e.positions[i] as number, e.positions[i + 2] as number);
      lo = Math.min(lo, f.w);
      hi = Math.max(hi, f.w);
      uLo = Math.min(uLo, f.u);
      uHi = Math.max(uHi, f.u);
    }
    close(hi - lo, BLOCK.depth, 1e-9, `${m.id} lid depth`);
    close(uHi - uLo, 2 * Hb, 1e-9, `${m.id} lid width`);
    // nothing is below the ground
    let lowest = Infinity;
    for (const k of ['brick', 'stone', 'earth', 'tube'] as const) {
      const b = parts[k];
      if (!b) continue;
      for (let i = 1; i < b.positions.length; i += 3) lowest = Math.min(lowest, b.positions[i] as number);
    }
    close(lowest, GROUND_Y, 1e-9, `${m.id} lowest point`);
    // the face wall's plinth: the brick triangles lying in the face plane below rail head (one quad, two triangles),
    // which stand on the ground across the whole width of the block. The flanks' corners also reach the ground, so
    // the plinth is judged by its own triangles, not by every brick vertex in the plane.
    const brick = parts.brick as NonNullable<typeof parts.brick>;
    let plinth = 0;
    let plinthLow = Infinity;
    let plinthU0 = Infinity;
    let plinthU1 = -Infinity;
    for (let i = 0; i < brick.indices.length; i += 3) {
      const v = [0, 1, 2].map((k) => {
        const o = (brick.indices[i + k] as number) * 3;
        const f = inMouthFrame(m, brick.positions[o] as number, brick.positions[o + 2] as number);
        return { y: brick.positions[o + 1] as number, w: f.w, u: f.u };
      });
      if (!v.every((p) => Math.abs(p.w) < 1e-9 && p.y <= 1e-9)) continue;
      plinth += 1;
      for (const p of v) {
        plinthLow = Math.min(plinthLow, p.y);
        plinthU0 = Math.min(plinthU0, p.u);
        plinthU1 = Math.max(plinthU1, p.u);
      }
    }
    assert.equal(plinth, 2, `${m.id}: one quad (two triangles) of plinth in the face plane below rail head`);
    close(plinthLow, GROUND_Y, 1e-9, `${m.id}: the plinth stands on the ground`);
    close(plinthU1 - plinthU0, 2 * Hb, 1e-9, `${m.id}: the plinth spans the whole block`);
    assert.ok(parts.tube && parts.tube.indices.length > 0, `${m.id}: a dark recess behind every arch`);
  }
});

test('addPortals on the terrain: no earth bank, the strips reported, three mouths, a clean dispose; on flat ground nothing is cut', () => {
  const scene = new THREE.Scene();
  const on = addPortals(scene, data, { terrain: field });
  assert.equal(on.covers.length, 0, 'the terrain is the earth over the tunnels');
  assert.equal(on.stats.mouths, 3);
  assert.ok(on.group.children.length <= 4, `${on.group.children.length} draw calls`);
  const m = on.mouths[0] as (typeof mouths)[number];
  assert.ok(on.hole(m.origin[0] + m.axis[0], m.origin[1] + m.axis[1]), 'a point just inside the face is in the hole');
  assert.ok(!on.group.children.some((c) => c.name === 'portals-earth' && (c as THREE.Mesh).material instanceof THREE.MeshLambertMaterial && ((c as THREE.Mesh).material as THREE.MeshLambertMaterial).color.getHex() === 0x3f4a35), 'no grass bank of the flat-ground build');
  let freed = 0;
  for (const c of on.group.children as THREE.Mesh[]) c.geometry.addEventListener('dispose', () => freed++);
  const meshes = on.group.children.length;
  on.dispose();
  assert.equal(on.group.parent, null);
  assert.equal(freed, meshes);
  const flat = addPortals(scene, data);
  assert.ok(flat.covers.length > 0, 'on flat ground there is an earth bank over each tunnel');
  assert.ok(!flat.hole(m.origin[0] + m.axis[0], m.origin[1] + m.axis[1]), 'and no hole to cut');
  flat.dispose();
});
