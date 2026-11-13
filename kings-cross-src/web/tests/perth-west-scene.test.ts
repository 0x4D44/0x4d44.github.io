// The west extension in the Perth scene (perth-west-scene.ts): drawn, seamed to the main ground, the main apron off its edge, the drape over
// the tile, the camera clamp and the world plane's carve over it, the credits, and the extension's budget (+400k triangles, +12 draws).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildPerthScene, perthGroundAt} from '../src/perth-scene.ts';
import {buildPerthEastGround} from '../src/perth-east-ground.ts';
import {PERTH_WEST_DRAWN, PERTH_WEST_GROUP, WEST_FOG_FADE} from '../src/perth-west-scene.ts';
import {PERTH_WEST_EXTENT} from '../../tools/perth-west-extent.ts';
import {PERTH_DRAPE} from '../src/perth-city-features.ts';

// ONE scene a file (a Perth scene with the west is about 3 GB resident in Node; the box's memory guard kills a test process near 9.5 GB).
// What Perth drew before the extension is rebuilt piecewise: the main apron as buildPerthEastGround draws it without `west`, the clamp's
// ground as perthGroundAt gives it without the tile. The city toggle hiding the extension is held in perth-city.test.ts, on its hidden scene.
const scene = buildPerthScene({lighting: false});
const oldEast = buildPerthEastGround(scene.terrain), oldApron = oldEast.group.getObjectByName('perth-main-apron') as THREE.Mesh;
test.after(() => { scene.dispose(); oldEast.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); [m.material].flat().forEach(x => x.dispose()); } }); });
const W = PERTH_WEST_EXTENT, M = scene.terrain.extent;
const mesh = (root: THREE.Object3D, name: string) => { const m = root.getObjectByName(name) as THREE.Mesh | undefined; assert.ok(m, `${name} drawn`); return m!; };
const down = (x: number, z: number, objects: THREE.Object3D[]) => {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 2000, z), new THREE.Vector3(0, -1, 0)); return ray.intersectObjects(objects, false)[0];
};

test('the west extension is in the Perth scene: the tile, its cover and its blocks, in one group of its own', () => {
  const west = scene.group.getObjectByName(PERTH_WEST_GROUP)!;
  assert.ok(west && west.parent === scene.group && scene.west?.group === west, 'its own group under the Perth group');
  for (const name of ['perth-west-ground', 'perth-west-ground-cover', 'perth-west-wood-crowns', 'perth-west-walls', 'perth-west-ashlar', 'perth-west-roofs']) {
    let inside = false; mesh(scene.group, name).traverseAncestors(a => { if (a === west) inside = true; }); assert.ok(inside, `${name} in the extension`);
  }
  assert.deepEqual({...PERTH_WEST_DRAWN}, {...W}, 'the drawn extent is the shared extent');
  assert.ok(scene.west!.buildingIds.length > 5000 && scene.west!.buildingIds.every(id => !scene.buildingIds.includes(id)), 'no block drawn twice');
});

test('seamed: the tile meets the main drawn ground at x -1200 with no step, and the main apron has left the tile\'s ground to it', () => {
  const tile = mesh(scene.group, 'perth-west-ground'), main = mesh(scene.group, 'perth-ground'), apron = mesh(scene.group, 'perth-main-apron');
  let worst = 0, n = 0;
  for (let z = M.z0 + 3; z < M.z1; z += 37) {
    const a = down(M.x0 - .01, z, [tile]), b = down(M.x0 + .01, z, [main]);
    assert.ok(a && b, `both grounds at z ${z}`); worst = Math.max(worst, Math.abs(a!.point.y - b!.point.y)); n++;
  }
  assert.ok(n > 50 && worst < .05, `the largest step across the seam: ${worst.toFixed(3)} m over ${n} rows`);
  // where the main terrain's west strip and west corners were, only the tile now: before the extension the main apron lay there
  for (const [x, z] of [[M.x0 - 400, (M.z0 + M.z1) / 2], [M.x0 - 300, M.z0 - 300], [M.x0 - 300, M.z1 + 300], [W.x0 + 50, 0]] as const) {
    assert.ok(!down(x, z, [apron]), `no main apron at ${x}, ${z}`);
    const hit = down(x, z, [tile]); assert.ok(hit && hit.face!.normal.y > 0, `the tile's ground at ${x}, ${z}`);
    assert.ok(down(x, z, [oldApron]), `the old apron lay at ${x}, ${z}`);
  }
  // the apron's north and south strips still start at the main terrain's west edge (the tile's curtain meets them), as before
  for (const z of [M.z0 - 300, M.z1 + 300]) assert.ok(down(M.x0 + 50, z, [apron]), `the north and south strips at z ${z}`);
});

test('the cover drape lies over the tile, as the context drape lies over the main ground', () => {
  const tile = mesh(scene.group, 'perth-west-ground'), cover = mesh(scene.group, 'perth-west-ground-cover');
  assert.ok((cover.material as THREE.Material).polygonOffset, 'pulled forward as the context drape is');
  let over = 0, n = 0;
  for (let x = W.x0 + 41; x < W.x1; x += 173) for (let z = W.z0 + 29; z < W.z1; z += 211) {
    const c = down(x, z, [cover]), t = down(x, z, [tile]); if (!c || !t) continue; n++;
    if (c.point.y >= t.point.y - 1e-3 && c.point.y <= t.point.y + PERTH_DRAPE + .5) over++;
  }
  assert.ok(n > 100 && over === n, `the drape over the tile, within its lift: ${over} of ${n}`);
});

test('the camera clamp and the world plane know the west ground; the credits cover its sources', () => {
  const tile = scene.west!.ground;
  let rise = 0;
  for (let x = W.x0 + 8; x < W.x1; x += 64) for (let z = W.z0 + 8; z < W.z1; z += 64) {
    assert.equal(scene.groundAt(x, z), tile.heightAt(x, z), `the clamp's ground at ${x}, ${z}`);
    rise = Math.max(rise, tile.heightAt(x, z) - scene.terrain.groundY);
  }
  assert.ok(rise > 30, `the west's hills stand off the flat plane (${rise.toFixed(1)} m), so the clamp needs them`);
  assert.equal(perthGroundAt(scene.terrain)(W.x0 + 500, 0), scene.terrain.groundY, 'before the extension the clamp saw the flat plane there');
  assert.equal(scene.groundAt(0, 0), scene.terrain.heightAt(0, 0), 'the main ground unchanged');
  assert.ok(scene.terrainMore.some(e => e.x0 === W.x0 && e.x1 === W.x1 && e.z0 === W.z0 && e.z1 === W.z1), 'the world plane is carved under the tile');
  assert.match(scene.attribution, /OpenStreetMap contributors \(ODbL\).*Scottish public sector LiDAR.*Open Government Licence v3/);
  for (const c of scene.west!.attribution) assert.ok(scene.attribution.includes(c.split('. ')[0]!), `credited: ${c.slice(0, 60)}`);
});

test('budget: the scene inside 2M triangles and 1,000 draws, the extension inside +400k triangles and +12 draws', () => {
  assert.ok(scene.stats.triangles <= 2_000_000 && scene.stats.drawCalls <= 1000, JSON.stringify(scene.stats));
  // against Perth before it: less the extension, plus the main apron's west strip and corners it took over (no draw of their own)
  const apronTris = (m: THREE.Mesh) => m.geometry.index!.count / 3, taken = apronTris(oldApron) - apronTris(mesh(scene.group, 'perth-main-apron'));
  assert.ok(taken > 0, `the apron gave up ${taken} triangles`);
  const dt = scene.west!.stats.triangles - taken, dd = scene.west!.stats.drawCalls;
  assert.ok(dt > 0 && dt <= 400_000 && dd > 0 && dd <= 12, `the extension: +${dt} triangles, +${dd} draws`);
  assert.ok(scene.west!.stats.triangles <= 400_000 && scene.west!.stats.drawCalls <= 12, JSON.stringify(scene.west!.stats));
  let t = 0, d = 0;
  scene.west!.group.traverse(o => { if (!(o instanceof THREE.Mesh)) return; const g = o.geometry, n = (g.index ? g.index.count : g.getAttribute('position').count) / 3; t += o instanceof THREE.InstancedMesh ? o.count * n : n; d++; });
  assert.deepEqual({triangles: t, drawCalls: d}, scene.west!.stats, 'the stats are what is drawn');
});

// W4 review (2026-11-13, pt-west-from-station): from a low eye the far west blocks stood fully fogged, paler than the sky, as a jagged
// band. The blocks and the crowns thin out (a dithered discard) as the fog takes them; the tile and the drape, the ground, do not.
test('the west blocks and crowns thin out in the fog; the ground does not', () => {
  const frag = (m: THREE.Material) => { const sh = {fragmentShader: THREE.ShaderLib.lambert.fragmentShader, vertexShader: THREE.ShaderLib.lambert.vertexShader, uniforms: {}} as unknown as THREE.WebGLProgramParametersWithUniforms; m.onBeforeCompile(sh, undefined as unknown as THREE.WebGLRenderer); return sh.fragmentShader; };
  for (const name of WEST_FOG_FADE.meshes) for (const m of [mesh(scene.group, name).material].flat()) {
    assert.match(m.customProgramCacheKey(), /\+perth-west-fog-fade$/, `${name}: its own program`);
    const f = frag(m), at = f.indexOf('#include <fog_fragment>');
    assert.ok(at >= 0 && f.indexOf('discard;', at) > at && f.includes(`smoothstep(${WEST_FOG_FADE.from.toFixed(4)}, ${WEST_FOG_FADE.to.toFixed(4)}, fogFactor)`), `${name}: discarded after the fog, by its factor`);
  }
  for (const name of ['perth-west-ground', 'perth-west-ground-cover']) for (const m of [mesh(scene.group, name).material].flat()) {
    assert.doesNotMatch(m.customProgramCacheKey(), /fog-fade/, `${name} stays whole`); assert.ok(!frag(m).includes('discard;'), `${name}: no discard`);
  }
});
