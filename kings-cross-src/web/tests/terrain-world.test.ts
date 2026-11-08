// The ground as the page draws it (web/src/world.ts) and the tunnel mouths cut into it (web/src/portals.ts, terrain mode),
// held to the committed Environment Agency terrain (web/src/data/kx-terrain.json) and the tunnel mouths in kx-track.json.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { CityData } from '../../core/city.ts';
import { archOpening, FIGURES, tunnelCover, tunnelMouths } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import { railSegments } from '../../core/scene.ts';
import { buildTerrainMesh, createTerrain, distanceField, terrainFromFunction, toleranceNearRails } from '../../core/terrain.ts';
import type { TerrainFile } from '../../core/terrain.ts';
import { addCity } from '../src/city.ts';
import { material, terrainMaterial } from '../src/materials.ts';
import { addPortals, BLOCK, blockTop, faceCover, faceMouth, inMouthFrame, mouthPartsTerrain, PORTAL, portalHole } from '../src/portals.ts';
import { createSignals } from '../src/signals.ts';
import type { SignalOverlay } from '../src/signals.ts';
import { addTerrain, flatRing, GROUND_Y } from '../src/world.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const signalData: SignalOverlay = JSON.parse(readFileSync(new URL('../src/data/kx-signals.json', import.meta.url), 'utf8'));
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

test('addTerrain: the retaining wall is sooty brick of its own, much darker than a portal face but still warm, and behind the city layers in depth', () => {
  const scene = new THREE.Scene();
  const d = addTerrain(scene, terrainFromFunction(ridge, EXT256, 1), { tolerance: () => 0.02 });
  const wall = d.group.children.find((c) => c.name === 'terrain-wall') as THREE.Mesh;
  const m = wall.material as THREE.MeshLambertMaterial;
  const portal = material('brick') as THREE.MeshLambertMaterial;
  assert.equal(m, terrainMaterial('wall'), 'the shared terrain wall material');
  assert.notEqual(m, portal, 'not the clean brick of the portal faces');
  assert.equal(m.name, 'terrain-wall');
  assert.equal(m.map, portal.map, 'the same brick picture (none in Node), so the UVs in metres still hold');
  // In Node there is no picture and the colour is the flat average, so the product the browser draws is comparable here.
  for (const channel of ['r', 'g', 'b'] as const) {
    const ratio = m.color[channel] / portal.color[channel];
    assert.ok(ratio > 0.15 && ratio < 0.4, `${channel}: ${ratio.toFixed(3)} of the portal brick is not a sooty tint`);
  }
  assert.ok(m.color.r >= m.color.g && m.color.g >= m.color.b, 'still brick: red, then green, then blue');
  for (const flat of [terrainMaterial('ground'), terrainMaterial('bank')] as const) assert.equal(m.polygonOffsetFactor, flat.polygonOffsetFactor, `pushed back as far as the ${flat.name}`);
  assert.ok(m.polygonOffset && m.polygonOffsetFactor === 1 && m.polygonOffsetUnits === 1, 'behind the city layers, whose offsets are negative');
  assert.equal(portal.polygonOffset, false, 'the portal brick itself is untouched');
  d.dispose();
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

test('addTerrain: an exclude with a floorAt gives the drawn ground that height inside the hole, and the mesh\'s own outside it', () => {
  const scene = new THREE.Scene();
  const t = terrainFromFunction((x, z) => 1.5 * Math.sin(x / 13) * Math.cos(z / 9) + 3, EXT256, 2);
  const inside = (x: number, z: number): boolean => x > 100 && x < 140 && z > 100 && z < 140;
  const plain = addTerrain(scene, t, { tolerance: () => 0.15, exclude: inside });
  const floored = addTerrain(scene, t, { tolerance: () => 0.15, exclude: Object.assign((x: number, z: number) => inside(x, z), { floorAt: (x: number) => -0.2 + x / 1000 }) });
  assert.equal(floored.stats.triangles, plain.stats.triangles, 'the same hole is cut');
  for (const [x, z] of [[101, 101], [120, 120], [139, 105]] as const) {
    assert.ok(Math.abs(plain.ground.heightAt(x, z) - t.heightAt(x, z)) <= 0.5, 'without a floor the ground is the mesh\'s, the filled-in surface');
    close(floored.ground.heightAt(x, z), -0.2 + x / 1000, 1e-12, `in the hole at ${x}, ${z}`);
  }
  for (const [x, z] of [[99, 120], [141, 120], [120, 99.5], [17.3, 40.1], [200.5, 77.7]] as const) assert.equal(floored.ground.heightAt(x, z), floored.mesh.heightAt(x, z), `outside the hole at ${x}, ${z}`);
  plain.dispose();
  floored.dispose();
});

test('portalHole: its floor is the plinth\'s foot, and what the page lays over the ground stays down there: the city\'s grass is nowhere up the face, nor across the arches\' feet', () => {
  const hole = portalHole(mouths);
  assert.equal(hole.floorAt(0, 0), GROUND_Y, 'the forecourt\'s level');
  const rails = railSegments(data);
  const drawn = addTerrain(new THREE.Scene(), field, { exclude: hole, rails });
  const city: CityData = JSON.parse(readFileSync(new URL('../src/data/kx-city.json', import.meta.url), 'utf8'));
  const faces = mouths.map((m) => faceMouth(m));
  const built = addCity(new THREE.Scene(), data, city, { hidden: new Set<number>(), terrain: drawn.ground });
  let checked = 0;
  for (const layer of ['grass', 'plaza', 'pavement', 'asphalt', 'paint', 'water']) {
    const mesh = built.group.getObjectByName(`city-${layer}`) as THREE.Mesh | undefined;
    if (!mesh) continue;
    const p = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      for (const [k, m] of mouths.entries()) {
        const q = inMouthFrame(m, p.getX(i), p.getZ(i));
        const face = inMouthFrame(faces[k] as (typeof faces)[number], p.getX(i), p.getZ(i));
        // over the forecourt (from the hole's front edge to the face, across the face) a layer lies on the forecourt, not on the DTM's ramp
        if (q.w < BLOCK.hole[0] + 0.5 || face.w > 0 || Math.abs(q.u) > m.halfWidth) continue;
        checked++;
        assert.ok(p.getY(i) <= GROUND_Y + 0.5, `${m.id}: a vertex of the city's ${layer} stands ${p.getY(i).toFixed(2)} m up, ${(-face.w).toFixed(2)} m in front of the face, in the arches' feet`);
      }
    }
  }
  assert.ok(checked >= 20, `${checked} vertices of the city's flat layers were over the forecourts`);
  built.dispose();
  drawn.dispose();
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

// ---- the portals' setback, and the signals that stand at them ----------------------------------------------------

test('faceMouth and faceCover: the face line moves PORTAL.setback into the tunnel, everything else about the mouth is the OSM one', () => {
  for (const m of mouths) {
    const f = faceMouth(m);
    const d = inMouthFrame(m, f.origin[0], f.origin[1]);
    close(d.u, 0, 1e-9, `${m.id}: straight in`);
    close(d.w, PORTAL.setback, 1e-9, `${m.id}: PORTAL.setback in`);
    assert.deepEqual([f.axis, f.across, f.halfWidth, f.id, f.nodeIds], [m.axis, m.across, m.halfWidth, m.id, m.nodeIds]);
    assert.deepEqual(f.bores.map((b) => [b.lateral, b.width]), m.bores.map((b) => [b.lateral, b.width]));
    for (const b of m.bores) for (const t of b.tracks) close(inMouthFrame(f, t.x, t.z).w, t.along - PORTAL.setback, 1e-6, `${m.id}: a rail node, seen from the face line`);
    for (const b of f.bores) for (const t of b.tracks) close(t.along, inMouthFrame(f, t.x, t.z).w, 1e-6, `${m.id}: its own along is measured from the face line`);
    assert.equal(faceMouth(m, 0).origin[0], m.origin[0], 'no setback, no move');
  }
  for (const c of tunnelCover(data)) {
    const f = faceCover(c);
    assert.equal(f.mouths.length, c.mouths.length);
    f.mouths.forEach((m, i) => assert.deepEqual(m.origin, faceMouth(c.mouths[i] as (typeof c.mouths)[number]).origin));
    close(f.length, c.length - PORTAL.setback * (c.openEnded ? 1 : 2), 1e-9, `${c.name}: the bank is shorter by a setback at each face`);
    close((f.from[0] - c.from[0]) * c.axis[0] + (f.from[1] - c.from[1]) * c.axis[1], PORTAL.setback, 1e-9, `${c.name}: its start moved in along the run`);
    assert.deepEqual([f.lo, f.hi, f.axis, f.across], [c.lo, c.hi, c.axis, c.across]);
  }
});

type P3 = [number, number, number];
type P2 = readonly [number, number];

/** Every triangle of a group's meshes (the portals' geometry is in world coordinates), by mesh name. */
function groupTriangles(group: THREE.Group): { name: string; p: [P3, P3, P3] }[] {
  const out: { name: string; p: [P3, P3, P3] }[] = [];
  for (const child of group.children as THREE.Mesh[]) {
    const pos = child.geometry.getAttribute('position') as THREE.BufferAttribute;
    const idx = child.geometry.getIndex();
    const n = idx ? idx.count : pos.count;
    const at = (k: number): P3 => {
      const v = idx ? idx.getX(k) : k;
      return [pos.getX(v), pos.getY(v), pos.getZ(v)];
    };
    for (let i = 0; i < n; i += 3) out.push({ name: child.name, p: [at(i), at(i + 1), at(i + 2)] });
  }
  return out;
}

/** The distance in plan from a point to a triangle's footprint: nothing if it is inside, the nearest edge otherwise (a wall's footprint is a line). */
function planDistance(p: P2, a: P2, b: P2, c: P2): number {
  const edge = (s: P2, t: P2): number => {
    const dx = t[0] - s[0];
    const dz = t[1] - s[1];
    const l2 = dx * dx + dz * dz;
    const k = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dz) / l2));
    return Math.hypot(p[0] - (s[0] + k * dx), p[1] - (s[1] + k * dz));
  };
  const sides = Math.min(edge(a, b), edge(b, c), edge(c, a));
  const cross = (q: P2, r: P2, s: P2): number => (q[0] - s[0]) * (r[1] - s[1]) - (r[0] - s[0]) * (q[1] - s[1]);
  if (Math.abs(cross(a, b, c)) < 1e-9) return sides; // a wall seen from above is a line
  const d1 = cross(p, a, b);
  const d2 = cross(p, b, c);
  const d3 = cross(p, c, a);
  return (d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0) ? sides : 0;
}

/** Every vertex of a drawn signal in world metres: post, head, lamp, question mark. */
function signalVertices(root: THREE.Object3D): P3[] {
  root.updateMatrixWorld(true);
  const out: P3[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const pos = ((o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined)?.getAttribute('position');
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(o.matrixWorld);
      out.push([v.x, v.y, v.z]);
    }
  });
  return out;
}

/** What a signal's nearest part must keep from the portal masonry: half a metre (the coordinator's figure; the stone's own 0.12 m of relief is inside it). */
const SIGNAL_CLEAR = 0.5;

test('every drawn signal stands outside the portals: not in the block, and half a metre clear of every wall, lining and stone, on the terrain and on flat ground', () => {
  const layer = createSignals(signalData, new THREE.Group());
  const drawn = layer.signals();
  assert.equal(drawn.length, signalData.signals.length, 'every OSM signal is drawn');
  const yellow = drawn.find((r) => r.signal.ref === 'YA1023');
  assert.ok(yellow, 'signal YA1023 (OSM 1752783510), the one that stood behind the Gasworks south face, is drawn');
  const near = new Set<string>();
  for (const mode of ['terrain', 'flat'] as const) {
    const scene = new THREE.Scene();
    const portals = mode === 'terrain' ? addPortals(scene, data, { terrain: field }) : addPortals(scene, data);
    // walls, linings, stone and the bank's slopes and caps; level ground (the lid, the forecourt, the recess floor) is not something a post can be inside
    const surfaces = groupTriangles(portals.group).filter((t) => {
      const [a, b, c] = t.p;
      const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      const area = Math.hypot((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      return area > 1e-12 && Math.abs(ny) / area < 0.95;
    });
    assert.ok(surfaces.length > 500, `${mode}: ${surfaces.length} wall triangles`);
    portals.faces.forEach((face) => {
      const Hb = face.halfWidth + BLOCK.flank;
      const arches = face.bores.map(archOpening);
      const top = blockTop(face, field);
      for (const rec of drawn) {
        const verts = signalVertices(rec.group);
        const frame = verts.map((v) => ({ ...inMouthFrame(face, v[0], v[2]), y: v[1] }));
        if (frame.every((q) => Math.abs(q.u) > Hb + 6 || q.w < -12 || q.w > BLOCK.depth + 6)) continue; // not at this portal
        near.add(`${face.id} ${rec.signal.id}`);
        const label = `${mode}: signal ${rec.signal.ref ?? rec.signal.id} at ${face.id}`;
        if (mode === 'terrain') {
          for (const q of frame) {
            const inBlock = Math.abs(q.u) <= Hb && q.w >= 0 && q.w <= BLOCK.depth && q.y <= top;
            const inArch = arches.some((a) => (q.y <= a.spring ? Math.abs(q.u - a.lateral) <= a.halfWidth : Math.hypot(q.u - a.lateral, q.y - a.spring) <= a.halfWidth));
            assert.ok(!inBlock || inArch, `${label}: a part of it is inside the masonry or the earth, at u ${q.u.toFixed(2)}, ${q.w.toFixed(2)} m behind the face, ${q.y.toFixed(1)} m up`);
          }
        }
        let nearest = Infinity;
        for (const t of surfaces) {
          const ys = [t.p[0][1], t.p[1][1], t.p[2][1]];
          if (Math.max(...ys) < 0 || Math.min(...ys) > 4.5) continue; // above or below the signal
          for (const v of verts) nearest = Math.min(nearest, planDistance([v[0], v[2]], [t.p[0][0], t.p[0][2]], [t.p[1][0], t.p[1][2]], [t.p[2][0], t.p[2][2]]));
        }
        assert.ok(nearest >= SIGNAL_CLEAR, `${label}: ${nearest.toFixed(3)} m from the nearest wall, lining or stone (needs ${SIGNAL_CLEAR} m)`);
      }
    });
    assert.ok(near.has(`gasworks-south ${(yellow as NonNullable<typeof yellow>).signal.id}`), `${mode}: YA1023 was checked at Gasworks south`);
  }
  assert.ok(near.size >= 12, `${near.size} signals at the portals were checked`);
});

test('addPortals on the terrain: no masonry in front of the OSM node, the face PORTAL.setback behind it, and the hole is covered all the way to the face', () => {
  const scene = new THREE.Scene();
  const portals = addPortals(scene, data, { terrain: field });
  const tris = groupTriangles(portals.group);
  portals.mouths.forEach((m) => {
    const Hb = m.halfWidth + BLOCK.flank;
    const here = (p: P3): boolean => {
      const q = inMouthFrame(m, p[0], p[2]);
      return Math.abs(q.u) <= Hb + 0.4 && q.w > -3 && q.w < 15; // the cornice runs 0.35 m past the block's ends
    };
    // the masonry of this mouth: everything in brick, stone or the recess's lining over the face's footprint. The flanks that run on
    // forward along the forecourt (on the block's side planes, ending at the face) hold the ground back; they are not the face's masonry
    const alongForecourt = (t: { p: [P3, P3, P3] }): boolean =>
      t.p.every((p) => {
        const q = inMouthFrame(m, p[0], p[2]);
        return Math.abs(Math.abs(q.u) - Hb) < 1e-4 && q.w <= PORTAL.setback + 1e-4;
      });
    const masonry = tris.filter((t) => t.name !== 'portals-earth' && t.p.every(here) && !alongForecourt(t));
    assert.ok(masonry.length > 100, `${m.id}: ${masonry.length} masonry triangles`);
    const ws = masonry.flatMap((t) => t.p.map((p) => inMouthFrame(m, p[0], p[2]).w));
    // the cornice stands proud of the face, at the top; it is the most forward masonry
    close(Math.min(...ws), PORTAL.setback - PORTAL.cornice.out, 1e-4, `${m.id}: the front of the masonry`);
    assert.ok(Math.min(...ws) > 0, `${m.id}: all of it is behind the OSM node`);
    close(Math.max(...ws), PORTAL.setback + PORTAL.recess, 1e-4, `${m.id}: the recess's end is its depth behind the face`);
    // the face wall's plane: brick triangles at the setback, the plinth and the wall
    const inFace = masonry.filter((t) => t.name === 'portals-brick' && t.p.every((p) => Math.abs(inMouthFrame(m, p[0], p[2]).w - PORTAL.setback) < 1e-4));
    assert.ok(inFace.length > 30, `${m.id}: ${inFace.length} triangles in the face plane`);
    // the earth: the lid behind the face, and the forecourt in front of it level with the plinth's foot; together they cover the hole's whole footprint
    const earth = tris.filter((t) => t.name === 'portals-earth' && t.p.every(here));
    const level = earth.filter((t) => t.p.every((p) => Math.abs(p[1] - GROUND_Y) < 1e-6));
    assert.equal(level.length, 2, `${m.id}: the forecourt is one quad at ground level`);
    // the flanks along the forecourt: some ground to hold back at every mouth, nowhere above that ground by more than the coping
    const forward = tris.filter((t) => t.name === 'portals-brick' && alongForecourt(t));
    assert.ok(forward.length >= 4, `${m.id}: ${forward.length} flank triangles along the forecourt`);
    for (const t of forward) {
      for (const p of t.p) {
        const q = inMouthFrame(m, p[0], p[2]);
        assert.ok(q.w >= PORTAL.setback - (PORTAL.setback - BLOCK.hole[0] + BLOCK.forecourtOverlap) - 1e-4, `${m.id}: a flank starts in front of the forecourt`);
        // (a vertex is a Float32: where the ground is steep, 2 mm of height is the rounding of its position)
        assert.ok(p[1] <= Math.max(GROUND_Y, field.heightAt(p[0], p[2]) + BLOCK.flankCoping) + 2e-3, `${m.id}: a flank stands ${p[1].toFixed(2)} m up where the ground is ${field.heightAt(p[0], p[2]).toFixed(2)}`);
      }
    }
    const inFrame = earth.map((t) => t.p.map((p) => [inMouthFrame(m, p[0], p[2]).u, inMouthFrame(m, p[0], p[2]).w] as P2) as [P2, P2, P2]);
    for (let u = -(m.halfWidth + BLOCK.holeSide); u <= m.halfWidth + BLOCK.holeSide + 1e-9; u += 0.5) {
      for (let w = BLOCK.hole[0]; w <= BLOCK.hole[1] + 1e-9; w += 0.1) {
        assert.ok(inFrame.some((t) => planDistance([u, w], t[0], t[1], t[2]) < 1e-3), `${m.id}: the hole is open to the sky at u ${u.toFixed(1)}, ${w.toFixed(1)} m behind the node`);
      }
    }
  });
});

test('mouthPartsTerrain with a forecourt: the flanks run on forward along its sides, as high as the ground beside them, and no taller', () => {
  const m = faceMouth(mouths[0] as (typeof mouths)[number]);
  const Hb = m.halfWidth + BLOCK.flank;
  const forecourt = 3;
  // the ground beside the cutting climbs 0.5 m for every metre nearer the face, from level 3 m in front of it
  const bank = (x: number, z: number): number => {
    const q = inMouthFrame(m, x, z);
    return Math.abs(q.u) > m.halfWidth ? Math.max(GROUND_Y, GROUND_Y + 0.5 * (q.w + forecourt)) : GROUND_Y;
  };
  const parts = mouthPartsTerrain(m, { heightAt: bank }, forecourt);
  const brick = parts.brick as NonNullable<typeof parts.brick>;
  // the forward flanks: brick triangles on the planes u = +-Hb that lie in front of the face
  const ahead: { sign: number; w: number[]; y: number[] }[] = [];
  for (let i = 0; i < brick.indices.length; i += 3) {
    const pts = [0, 1, 2].map((k) => {
      const o = (brick.indices[i + k] as number) * 3;
      return { ...inMouthFrame(m, brick.positions[o] as number, brick.positions[o + 2] as number), y: brick.positions[o + 1] as number };
    });
    const sign = Math.sign(pts[0]!.u);
    if (pts.every((q) => Math.abs(Math.abs(q.u) - Hb) < 1e-6 && Math.sign(q.u) === sign && q.w <= 1e-6)) ahead.push({ sign, w: pts.map((q) => q.w), y: pts.map((q) => q.y) });
  }
  for (const sign of [-1, 1]) {
    const side = ahead.filter((t) => t.sign === sign);
    assert.ok(side.length >= 4, `side ${sign}: ${side.length} triangles run on forward`);
    const ws = side.flatMap((t) => t.w);
    close(Math.min(...ws), -forecourt, 1e-6, `side ${sign}: the flank starts at the forecourt's front edge`);
    close(Math.max(...ws), 0, 1e-6, `side ${sign}: and ends at the face`);
    for (const t of side) {
      t.w.forEach((w, k) => {
        const top = GROUND_Y + 0.5 * (w + forecourt) + BLOCK.flankCoping;
        assert.ok((t.y[k] as number) <= Math.max(top, GROUND_Y) + 1e-6, `side ${sign}: the flank is ${(t.y[k] as number).toFixed(2)} m up at ${w.toFixed(2)} m in front of the face, above the ground's ${top.toFixed(2)}`);
      });
    }
    // at the face it holds the ground back all the way up: 0.5 m a metre over 3 m
    const nearFace = side.flatMap((t) => t.w.map((w, k) => ({ w, y: t.y[k] as number }))).filter((p) => p.w > -1e-6);
    close(Math.max(...nearFace.map((p) => p.y)), GROUND_Y + 0.5 * forecourt + BLOCK.flankCoping, 1e-6, `side ${sign}: the flank's height at the face`);
  }
  // the forecourt reaches the flanks' feet, whatever the ground; without it, or on level ground, there is no flank in front of the face
  const level = (parts.earth as NonNullable<typeof parts.earth>).positions;
  let uMax = -Infinity;
  for (let i = 0; i < level.length; i += 3) {
    const q = inMouthFrame(m, level[i] as number, level[i + 2] as number);
    if (Math.abs(level[i + 1] as number - GROUND_Y) < 1e-9 && q.w < 0) uMax = Math.max(uMax, Math.abs(q.u));
  }
  close(uMax, Hb, 1e-6, 'the forecourt is as wide as the block');
  for (const none of [mouthPartsTerrain(m, { heightAt: bank }), mouthPartsTerrain(m, { heightAt: () => GROUND_Y }, forecourt)]) {
    const b = none.brick as NonNullable<typeof none.brick>;
    for (let i = 0; i < b.positions.length; i += 3) assert.ok(inMouthFrame(m, b.positions[i] as number, b.positions[i + 2] as number).w >= -1e-6, 'no brick stands in front of the face');
  }
});
