import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildTerrainMesh, createTerrain, overMesh } from '../../core/terrain.ts';
import type { Terrain, TerrainFile } from '../../core/terrain.ts';
import { PERTH_TERRAIN_EXTENT } from '../../tools/build-perth-terrain.ts';
import { PERTH_WEST_EXTENT } from '../../tools/perth-west-extent.ts';
import { EAST_SKIRT, EAST_TONES, FIELD_WEIGHT } from '../src/perth-east-ground.ts';
import { GROUND_Y } from '../src/world.ts';
import { buildPerthEastGround } from '../src/perth-east-ground.ts';
import { PERTH_WEST, PERTH_WEST_FILE, buildPerthWestGround, mainApronEdge, westClassAt, westField, withWest } from '../src/perth-west-ground.ts';

// The main ground as addPerthGround draws it (perth-city.ts): the DTM mesh over 16 m leaves, the ground read off that mesh. The station's
// flattening (perth-scene.ts perthGround) is left out: it does not reach this edge (checked on the whole scene, not here: that build is slow).
const mainFile = JSON.parse(readFileSync(new URL('../src/data/perth-terrain.json', import.meta.url), 'utf8')) as TerrainFile;
const mainField = createTerrain(mainFile), mainMesh = buildTerrainMesh(mainField, { maxLeaf: 16, tolerance: () => .08 }), main = overMesh(mainField, mainMesh);
const W = PERTH_WEST_EXTENT, M = PERTH_TERRAIN_EXTENT, G = PERTH_WEST_FILE.grids[0]!, STEP = G.step, OUT = EAST_SKIRT.out;
const tile = buildPerthWestGround(main, { beside: null }); // the bare tile: no curtain (the default has one: the last test)
const mesh = tile.group.getObjectByName('perth-west-ground') as THREE.Mesh;
const P = mesh.geometry.getAttribute('position'), C = mesh.geometry.getAttribute('color'), I = mesh.geometry.getIndex()!;
const inside = (x: number, z: number) => x >= W.x0 - 1e-6 && x <= W.x1 + 1e-6 && z >= W.z0 - 1e-6 && z <= W.z1 + 1e-6;
/** Deterministic points over the tile (a hash, not Math.random). */
const hash = (k: number) => { const s = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

test('the tile is one draw: the whole 16 m lattice over the extent, plus its skirt', () => {
  assert.deepEqual(PERTH_WEST_FILE.extent, W, 'the data file is the shared extent');
  assert.equal(tile.stats.drawCalls, 1); assert.equal(tile.group.children.length, 1); assert.ok(mesh.isMesh);
  assert.equal(tile.group.name, 'perth-west'); assert.equal(mesh.name, 'perth-west-ground');
  const cells = (G.nx - 1) * (G.nz - 1), skirtQuads = (G.nz - 1) + 2 * (G.nx - 1) + 2; // the west strip, the north and south strips, the two west corners
  assert.equal(tile.stats.triangles, 2 * (cells + skirtQuads));
  assert.equal(I.count / 3, tile.stats.triangles, 'the stat is the geometry');
  const lattice = [...P.array as Float32Array].filter((_, k) => k % 3 === 0).filter((x, k) => inside(x, P.getZ(k))).length;
  assert.equal(lattice, G.nx * G.nz, 'every node of the lattice is a vertex, once');
  assert.ok(tile.stats.triangles < 50000, `${tile.stats.triangles} triangles: about an eighth of the whole west extension's +400k budget`);
});

test('every triangle faces up, the lattice and the skirt alike', () => {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  let down = 0;
  for (let t = 0; t < I.count; t += 3) {
    a.fromBufferAttribute(P, I.getX(t)); b.fromBufferAttribute(P, I.getX(t + 1)); c.fromBufferAttribute(P, I.getX(t + 2));
    n.crossVectors(b.sub(a), c.sub(a)); if (!(n.y > 0)) down++;
  }
  assert.equal(down, 0);
});

test('the seam is watertight: each vertex on the main terrain\'s west edge is the main mesh\'s own vertex, bit for bit', () => {
  const mainEdge = new Map<number, number>(); // z -> y, the main mesh's vertices on its west edge
  for (let v = 0; v < mainMesh.vertices; v++) if (mainMesh.positions[v * 3] === M.x0) mainEdge.set(mainMesh.positions[v * 3 + 2]!, mainMesh.positions[v * 3 + 1]!);
  assert.equal(mainEdge.size, (M.z1 - M.z0) / STEP + 1, 'the main mesh has a vertex every 16 m on its west edge');
  const seen = new Set<number>();
  for (let v = 0; v < P.count; v++) {
    if (P.getX(v) !== W.x1 || P.getZ(v) < M.z0 || P.getZ(v) > M.z1) continue;
    assert.ok(mainEdge.has(P.getZ(v)), `a main vertex at z ${P.getZ(v)}`); assert.equal(P.getY(v), mainEdge.get(P.getZ(v)), `y at z ${P.getZ(v)}`); seen.add(P.getZ(v));
  }
  assert.equal(seen.size, mainEdge.size, 'and every one of them is met');
});

test('the seam is read off the DRAWN main ground, wherever it is not the DTM (a rail flattening)', () => {
  const dent = (x: number, z: number) => x === W.x1 && z % 64 === 0 ? 2.5 : 0;
  const flattened = { extent: main.extent, heightAt: (x: number, z: number) => main.heightAt(x, z) + dent(x, z) };
  const t = buildPerthWestGround(flattened, { beside: null }), p = (t.group.getObjectByName('perth-west-ground') as THREE.Mesh).geometry.getAttribute('position');
  let raised = 0;
  for (let v = 0; v < p.count; v++) if (p.getX(v) === W.x1 && p.getZ(v) >= M.z0 && p.getZ(v) <= M.z1) {
    const want = main.heightAt(W.x1, p.getZ(v)) + dent(W.x1, p.getZ(v)); assert.ok(Math.abs(p.getY(v) - want) < 1e-4, `z ${p.getZ(v)}: ${p.getY(v)} against ${want}`); if (dent(W.x1, p.getZ(v))) raised++;
  }
  assert.ok(raised > 10, `raised seam vertices: ${raised}`);
  // one column in, the tile is the DTM again
  let column = 0;
  for (let v = 0; v < p.count; v++) if (p.getX(v) === W.x1 - STEP && inside(p.getX(v), p.getZ(v)) && p.getZ(v) % 64 === 0) { column++; assert.ok(Math.abs(p.getY(v) - PERTH_WEST.heightAt(p.getX(v), p.getZ(v))) < 1e-4); }
  assert.ok(column > 10, `lattice vertices one column in: ${column}`);
});

test('the tile only meets a main terrain whose west edge is its east edge', () => {
  const elsewhere = { extent: { ...M, x0: M.x0 + 16 }, heightAt: main.heightAt };
  assert.throws(() => buildPerthWestGround(elsewhere), /not the main terrain's west edge/);
  assert.throws(() => westField(elsewhere), /not the main terrain's west edge/);
  assert.throws(() => withWest({ ...main, extent: elsewhere.extent } as Terrain, tile.terrain), /not the main terrain's west edge/);
});

test('heightAt is the drawn surface: a ray down onto the mesh finds it, and every node is the DTM\'s', () => {
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  let worst = 0, n = 0;
  for (let k = 0; k < 300; k++) {
    const x = W.x0 + 1 + hash(k) * (W.x1 - W.x0 - 2), z = W.z0 + 1 + hash(k + 1000) * (W.z1 - W.z0 - 2);
    ray.set(new THREE.Vector3(x, 500, z), down);
    const hit = ray.intersectObject(mesh, false)[0]; assert.ok(hit, `a hit at ${x}, ${z}`);
    worst = Math.max(worst, Math.abs(hit.point.y - tile.heightAt(x, z))); n++;
  }
  assert.ok(worst < 2e-3, `worst departure ${worst} over ${n} rays`);
  // the drawn surface differs from the bilinear field inside cells (that is why to seat on it), and agrees with it at every node
  let apart = 0;
  for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) {
    const x = G.x0 + i * STEP, z = G.z0 + j * STEP;
    assert.ok(Math.abs(tile.heightAt(x, z) - PERTH_WEST.heightAt(x, z)) < 1e-4, `node ${i},${j}`);
    if (i < G.nx - 1 && j < G.nz - 1 && Math.abs(tile.heightAt(x + 7, z + 5) - PERTH_WEST.heightAt(x + 7, z + 5)) > .01) apart++;
  }
  assert.ok(apart > 100, `cells where the field and the surface differ: ${apart}`);
  // the terrain over it answers the same, and carries the tile's own extent and datum
  assert.deepEqual(tile.terrain.extent, W); assert.equal(tile.terrain.datumAod, main.datumAod); assert.equal(tile.terrain.groundY, main.groundY);
  for (let k = 0; k < 50; k++) { const x = W.x0 + hash(k + 7) * (W.x1 - W.x0), z = W.z0 + hash(k + 77) * (W.z1 - W.z0); assert.equal(tile.terrain.heightAt(x, z), tile.heightAt(x, z)); }
  const r = tile.terrain.rangeUnder([[-2000, 0], [-1980, 0], [-1980, 20], [-2000, 20]]); assert.ok(r.min <= r.mean && r.mean <= r.max && r.max < 120);
  assert.equal(tile.terrain.heightAt(W.x0 - 500, 0), tile.terrain.groundY, 'the flat plane outside, as every terrain here');
});

test('the skirt runs out west, north and south into the haze, just under the plane, and never past the seam', () => {
  let ring = 0, far = 0, maxX = -Infinity;
  const plane = new THREE.Color().setHex(EAST_SKIRT.tone, THREE.SRGBColorSpace);
  for (let v = 0; v < P.count; v++) {
    maxX = Math.max(maxX, P.getX(v));
    if (inside(P.getX(v), P.getZ(v))) continue; ring++;
    assert.ok(P.getY(v) <= EAST_SKIRT.to + 1e-6 && EAST_SKIRT.to < GROUND_Y, 'under the world\'s flat plane');
    assert.ok(Math.abs(C.getX(v) - plane.r) < 1e-4 && Math.abs(C.getY(v) - plane.g) < 1e-4 && Math.abs(C.getZ(v) - plane.b) < 1e-4, 'in the hazed field tone');
    assert.ok(P.getX(v) === W.x0 - OUT || P.getZ(v) === W.z0 - OUT || P.getZ(v) === W.z1 + OUT, 'a full skirt out');
    if (P.getX(v) === W.x0 - OUT) far++;
  }
  assert.equal(ring, G.nz + 2 * G.nx + 2, 'the west, north and south strips and the two west corners');
  assert.equal(far, G.nz + 2, 'a column of outer vertices the whole way down the west edge');
  assert.equal(maxX, W.x1, 'nothing past the seam: the main terrain (and its aprons) lie east of it');
  assert.ok(OUT >= 5000, 'the skirt runs out into the haze, as the east patch\'s');
});

test('the colours are the node classes\' tones, the east patch\'s; the material is Perth\'s hazed land', () => {
  const tone = (name: string) => new THREE.Color().setHex(EAST_TONES[name]!, THREE.SRGBColorSpace);
  const seen = new Set<string>();
  for (let v = 0; v < P.count; v++) {
    if (!inside(P.getX(v), P.getZ(v))) continue;
    const name = westClassAt(P.getX(v), P.getZ(v)), want = tone(name); seen.add(name);
    assert.ok(Math.abs(C.getX(v) - want.r) < 1e-4 && Math.abs(C.getY(v) - want.g) < 1e-4 && Math.abs(C.getZ(v) - want.b) < 1e-4, `${name} at ${P.getX(v)}, ${P.getZ(v)}`);
  }
  for (const name of ['field', 'water', 'wood', 'grass', 'houses']) assert.ok(seen.has(name), `${name} is drawn`);
  const m = mesh.material as THREE.MeshLambertMaterial;
  assert.ok(m.vertexColors); assert.match(m.customProgramCacheKey(), /perth-land-haze/);
  // W4 review (2026-11-13): the fields run over the tile's field nodes as over the skirt, by a per-vertex weight: 1 on a field node and on
  // the skirt, 0 on every other class, so the open land the cover drape leaves to the tile is the backdrop's patchwork with no edge
  assert.match(m.customProgramCacheKey(), /fields-all-weighted$/);
  const F = mesh.geometry.getAttribute(FIELD_WEIGHT); assert.ok(F, 'a field weight per vertex');
  let fields = 0, others = 0;
  for (let v = 0; v < P.count; v++) {
    const want = inside(P.getX(v), P.getZ(v)) ? (westClassAt(P.getX(v), P.getZ(v)) === 'field' ? 1 : 0) : null;
    if (want === null) continue; // the skirt and curtain: checked below
    assert.equal(F.getX(v), want, `field weight at ${P.getX(v)}, ${P.getZ(v)}`); if (want) fields++; else others++;
  }
  assert.ok(fields > 1000 && others > 1000, `field nodes ${fields}, others ${others}`);
  for (let v = 0; v < P.count; v++) if (P.getX(v) < W.x0 - 1 || P.getZ(v) < W.z0 - 1 || P.getZ(v) > W.z1 + 1) assert.equal(F.getX(v), 1, 'the skirt is fields');
  const shader = {fragmentShader: THREE.ShaderLib.lambert.fragmentShader, vertexShader: THREE.ShaderLib.lambert.vertexShader, uniforms: {}} as unknown as THREE.WebGLProgramParametersWithUniforms;
  m.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
  assert.ok(shader.vertexShader.includes(`attribute float ${FIELD_WEIGHT};`) && shader.fragmentShader.includes('k = mix(vec3(1.0), k, vFieldWeight);'), 'the shader weighs the fields');
  // nearest node's class, and the nodata nodes are water
  const k = [...PERTH_WEST_FILE.classes].findIndex(ch => ch === String(PERTH_WEST_FILE.classNames.indexOf('water')));
  const wx = G.x0 + (k % G.nx) * STEP, wz = G.z0 + Math.floor(k / G.nx) * STEP;
  assert.equal(westClassAt(wx, wz), 'water'); assert.equal(westClassAt(wx + 7, wz - 7), 'water'); assert.equal(westClassAt(-1e5, -1e5), westClassAt(W.x0, W.z0), 'clamped to the lattice');
});

test('withWest: one ground of the tile and the main terrain, the tile\'s west of the seam and the main\'s from it eastward', () => {
  const both = withWest(main, tile.terrain);
  assert.deepEqual(both.extent, { x0: W.x0, z0: Math.min(W.z0, M.z0), x1: M.x1, z1: Math.max(W.z1, M.z1) });
  for (const [x, z] of [[-2000, 0], [-1216, 300], [-1201, -700], [-2700, 1200], [-1500, -1500]] as const) assert.equal(both.heightAt(x, z), tile.heightAt(x, z), `${x}, ${z}`);
  for (const [x, z] of [[-1200, 0], [-1184, 300], [0, 0], [800, -400], [-1200, 912]] as const) assert.equal(both.heightAt(x, z), main.heightAt(x, z), `${x}, ${z}`);
  for (let z = M.z0; z <= M.z1; z += STEP) assert.ok(Math.abs(both.heightAt(W.x1 - 1e-6, z) - both.heightAt(W.x1, z)) < .6, `no jump across the seam at z ${z}`);
  assert.equal(both.stepIn(-2000, 0, -1900, 100), STEP, 'the tile\'s own spacing is known'); assert.equal(both.stepIn(0, 0, 100, 100), STEP);
  assert.ok(both.rangeUnder([[-1220, 0], [-1180, 0], [-1180, 30], [-1220, 30]]).max < 80, 'a footprint over the seam reads real ground on both sides');
});

test('mainApronEdge is the main apron\'s height along its west edge, as buildPerthEastGround draws it', () => {
  const edge = mainApronEdge(main), apron = buildPerthEastGround(main).group.getObjectByName('perth-main-apron') as THREE.Mesh, A = apron.geometry.getAttribute('position');
  // the apron's own vertices on the line x = the main terrain's west edge: the inner end at the north and south edges, the far end under the plane
  const ys = (z: number) => { const found: number[] = []; for (let v = 0; v < A.count; v++) if (A.getX(v) === M.x0 && A.getZ(v) === z) found.push(A.getY(v)); return found; };
  for (const [z, want] of [[M.z0, edge(M.z0 - 1e-6)], [M.z0 - OUT, EAST_SKIRT.to], [M.z1, edge(M.z1 + 1e-6)], [M.z1 + OUT, EAST_SKIRT.to]] as const) {
    const found = ys(z); assert.ok(found.length >= 1, `apron vertices at z ${z}`);
    for (const y of found) assert.ok(Math.abs(y - want) < 1e-4, `z ${z}: apron ${y}, edge ${want}`);
  }
  // between them: a ray just inside the apron's west boundary finds the line the edge describes
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  for (const z of [M.z0 - 100, M.z0 - 400, M.z0 - 3000, M.z1 + 100, M.z1 + 320, M.z1 + 4000]) {
    ray.set(new THREE.Vector3(M.x0 + .01, 900, z), down); const hit = ray.intersectObject(apron, false)[0];
    assert.ok(hit && Math.abs(hit.point.y - edge(z)) < .02, `the apron at z ${z}: ${hit?.point.y} against ${edge(z)}`);
  }
  assert.equal(edge(0), main.heightAt(M.x0, 0), 'within the main terrain\'s rows it is the main terrain');
});

test('beside: by default the tile hangs a curtain along the seam where the main terrain has no ground, each way round; nothing else changes', () => {
  const hung = buildPerthWestGround(main), hm = hung.group.getObjectByName('perth-west-ground') as THREE.Mesh; // the default
  const HP = hm.geometry.getAttribute('position'), HI = hm.geometry.getIndex()!, HN = hm.geometry.getAttribute('normal');
  assert.equal(tile.stats.triangles, 2 * ((G.nx - 1) * (G.nz - 1) + (G.nz - 1) + 2 * (G.nx - 1) + 2), 'with beside: null there is no curtain');
  // the default is the main apron's edge, asked for outright; null is none; a function of its own is followed
  const asked = buildPerthWestGround(main, { beside: mainApronEdge(main) }), AP = (asked.group.getObjectByName('perth-west-ground') as THREE.Mesh).geometry.getAttribute('position');
  assert.equal(asked.stats.triangles, hung.stats.triangles); // (compared value by value, never as one deepEqual: node's diff of two arrays this long is a memory hazard)
  const ap = AP.array as Float32Array, hp = HP.array as Float32Array, at = ap.findIndex((v, i) => !Object.is(v, hp[i]));
  assert.ok(ap.length === hp.length && at < 0, `the default is mainApronEdge(main): lengths ${ap.length} and ${hp.length}, first differing at ${at}`);
  const flat = buildPerthWestGround(main, { beside: () => 150 }), FP = (flat.group.getObjectByName('perth-west-ground') as THREE.Mesh).geometry.getAttribute('position');
  let top = -Infinity; for (let v = P.count; v < FP.count; v++) top = Math.max(top, FP.getY(v));
  assert.ok(flat.stats.triangles > tile.stats.triangles && top === 150, `a curtain up to the 150 m asked for: ${top}`);
  // what the plain tile has is untouched, vertex for vertex and triangle for triangle
  for (let k = 0; k < P.array.length; k++) assert.equal(HP.array[k], P.array[k]);
  for (let k = 0; k < I.count; k++) assert.equal(HI.getX(k), I.getX(k));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(); let east = 0, west = 0, reach = 0;
  for (let t = I.count; t < HI.count; t += 3) {
    const ids = [HI.getX(t), HI.getX(t + 1), HI.getX(t + 2)];
    a.fromBufferAttribute(HP, ids[0]!); b.fromBufferAttribute(HP, ids[1]!); c.fromBufferAttribute(HP, ids[2]!);
    for (const v of [a, b, c]) assert.equal(v.x, W.x1, 'the curtain hangs on the seam');
    n.crossVectors(b.clone().sub(a), c.clone().sub(a)); assert.ok(Math.abs(n.y) < 1e-6 && Math.abs(n.z) < 1e-6, 'vertical, facing along x');
    if (n.x > 0) east++; else west++;
    for (const id of ids) { assert.ok(Math.abs(Math.abs(HN.getX(id)) - 1) < 1e-4, 'a lit normal of its own'); reach = Math.max(reach, Math.abs(HP.getY(id) - mainApronEdge(main)(HP.getZ(id)))); }
  }
  assert.equal(east, west); assert.equal(east + west, hung.stats.triangles - tile.stats.triangles);
  const segments = (M.z0 - W.z0) / STEP + 1 + (W.z1 - M.z1) / STEP + 1; // the seam nodes beside no main ground, and the skirt's far corner at each end
  assert.equal(hung.stats.triangles - tile.stats.triangles, 4 * segments - 8, 'a quad each way for each segment, less the four flat triangles (two ends of the seam, each way) where the gap is nil: the main terrain\'s first and last rows, and the skirt\'s far corners, both at the same height as the apron there');
  assert.equal(hung.stats.drawCalls, 1);
  // one end of every quad is the tile's own edge, the other the apron's line: the gap the curtain closes
  let gap = 0; for (const z of [-1600, -1400, 960, 1232]) gap = Math.max(gap, Math.abs(hung.heightAt(W.x1, z) - mainApronEdge(main)(z)));
  assert.ok(gap > 9 && gap < 40, `the gap at the notch: ${gap} m`);
});
