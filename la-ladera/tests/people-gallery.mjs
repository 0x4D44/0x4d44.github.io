// Test-only WebGL gallery: intentionally uses the shipped CharacterLibrary without replacing its materials, rig or LOD implementation.
// There is no render loop. The headless driver explicitly renders each contact sheet and exercises the animations.
import * as THREE from 'three';
import { CharacterLibrary, BONES } from '../js/people/rig.js';
import { makeVariant } from '../js/people/look.js';
import { makeRng } from '../js/core/rng.js';

const IDS = [
  'm_tendero', 'm_obrero', 'w_tendera', 'w_ama', 'w_elder', 'm_elder', 'b_boy', 'g_girl', 't_boy', 't_girl', 'm_afro', 'w_afro',
  'm_panadero', 'w_cocinera', 'm_carnicero', 'w_peluquera', 'm_mecanico', 'w_farmaceutica', 'w_maestra', 'm_mototaxi',
  'm_vendedor', 'm_abuelo', 'w_beata', 'b_escolar', 'g_escolar', 'm_joven', 'w_vecina', 'm_don', 'w_joven', 'm_rapado',
];
const CLIPS = [
  'idle_a', 'idle_b', 'walk', 'walk_fast', 'walk_bag', 'walk_step', 'phone_stand', 'phone_call', 'talk', 'wave', 'point',
  'sit_idle', 'sit_phone', 'sit_look', 'sit_cross_legs', 'stand_hold_pole', 'stand_hold_rail', 'turn_left', 'turn_right',
  'kid_bounce', 'kid_fidget', 'talk_b', 'sweep', 'cook', 'sell', 'walk_carry', 'carry_stand', 'lean_wall', 'laundry', 'pray', 'sit_talk', 'run',
];
const query = new URLSearchParams(location.search);
const baseline = query.has('baseline');
const lib = new CharacterLibrary('../assets/models/');
if (query.has('base')) lib.override = { base: new URL(query.get('base'), location.href).href, glb: 'people.glb', lod: 'people_lod.glb', meta: 'people_meta.json' };

const W = 1920, HEADER = 96, TILE = 320, COLS = 6, ROWS = 5;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gallery'), antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, TILE * ROWS, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.autoClear = false;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#ebe7df');
scene.add(new THREE.HemisphereLight(0xd4e1f0, 0x8f7e65, 2.1));
const key = new THREE.DirectionalLight(0xffead1, 3.1); key.position.set(-2, 4, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xd7e4ff, 0.65); fill.position.set(3, 2, -2); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ color: '#d7d3ca', roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.008; scene.add(floor);
const camera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.01, 20);
camera.position.set(0.5, 1.07, 4.5); camera.lookAt(0, 1.02, 0);
const instances = [];
const vector = new THREE.Vector3();
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const tris = (mesh) => (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
const assert = (ok, message) => { if (!ok) throw new Error(message); };

function pose(inst, clipName, phase = 0.27) {
  inst.mixer.stopAllAction(); inst.cur = null;
  const action = lib.play(inst, clipName, { fade: 0, time: phase });
  assert(action, `${inst.id}: missing animation ${clipName}`);
  inst.mixer.update(0); inst.root.updateMatrixWorld(true); inst.mesh.skeleton.update();
}

function geometryCheck(inst, lod) {
  const g = inst.mesh.geometry, p = g.attributes.position, joints = g.attributes.skinIndex, weights = g.attributes.skinWeight;
  assert(p && joints && weights, `${inst.id}/LOD${lod}: missing skinned attributes`);
  assert(g.attributes.color?.itemSize === 4, `${inst.id}/LOD${lod}: recolour slot alpha missing`);
  assert(g.attributes.normal && g.attributes.uv, `${inst.id}/LOD${lod}: missing normal/UV`);
  assert(joints.count === p.count && weights.count === p.count, `${inst.id}/LOD${lod}: attribute count mismatch`);
  const getters = ['getX', 'getY', 'getZ', 'getW'];
  const validSlots = new Set([16, ...Object.values(inst.meta.slots ?? {}).map(s => s.id)]), seenSlots = new Set();
  for (let v = 0; v < p.count; v++) {
    let sum = 0;
    for (const f of getters) {
      const j = joints[f](v), w = weights[f](v); sum += w;
      assert(Number.isInteger(j) && j >= 0 && j < BONES.length, `${inst.id}/LOD${lod}: joint index ${j} at ${v}`);
      assert(Number.isFinite(w) && w >= 0 && w <= 1.001, `${inst.id}/LOD${lod}: weight ${w} at ${v}`);
    }
    assert(Math.abs(sum - 1) < 0.02, `${inst.id}/LOD${lod}: weight sum ${sum} at ${v}`);
    assert(Number.isFinite(p.getX(v) + p.getY(v) + p.getZ(v)), `${inst.id}/LOD${lod}: nonfinite vertex ${v}`);
    const u = g.attributes.uv.getX(v), t = g.attributes.uv.getY(v);
    assert(Number.isFinite(u + t) && u >= -0.0001 && u <= 1.0001 && t >= -0.0001 && t <= 1.0001,
      `${inst.id}/LOD${lod}: atlas UV (${u}, ${t}) outside [0,1] at ${v}`);
    const n = g.attributes.normal;
    assert(Number.isFinite(n.getX(v) + n.getY(v) + n.getZ(v)), `${inst.id}/LOD${lod}: nonfinite normal ${v}`);
    const c = g.attributes.color, slot = Math.round(c.getW(v) * 255 / 16); seenSlots.add(slot);
    assert(getters.every(f => Number.isFinite(c[f](v)) && c[f](v) >= -0.0001 && c[f](v) <= 1.0001), `${inst.id}/LOD${lod}: invalid vertex colour ${v}`);
    if (!baseline) assert(validSlots.has(slot), `${inst.id}/LOD${lod}: colour alpha selects undeclared recolour slot ${slot} at ${v}`);
  }
  const count = tris(inst.mesh);
  assert(Number.isInteger(count) && count > 0, `${inst.id}/LOD${lod}: invalid triangle count`);
  if (!baseline) assert(count <= (lod ? 1500 : 8000), `${inst.id}/LOD${lod}: ${count} triangles exceeds ${lod ? 1500 : 8000}`);
  // Each surface belongs to one cell in the 8 x 8 atlas. A default UV triangle spanning the whole image is in [0,1] but still visually corrupt.
  // Original shipped near/far meshes both satisfy this bound (largest measured axis span 0.124448); allow quantisation/decimation tolerance.
  let maxTriangleUVSpan = 0;
  for (let i = 0; i < count * 3; i += 3) {
    const a = g.index ? g.index.getX(i) : i, b = g.index ? g.index.getX(i + 1) : i + 1, c = g.index ? g.index.getX(i + 2) : i + 2;
    for (const f of ['getX', 'getY']) {
      const x = g.attributes.uv[f](a), y = g.attributes.uv[f](b), z = g.attributes.uv[f](c);
      const lo = Math.min(x, y, z), hi = Math.max(x, y, z), span = hi - lo; maxTriangleUVSpan = Math.max(maxTriangleUVSpan, span);
      assert(span <= 0.128, `${inst.id}/LOD${lod}: triangle ${i / 3} UV span ${span} crosses atlas cells`);
      if (!baseline) {
        // A small triangle can still straddle two DIFFERENT tiles. Match the release validator's centroid cell and quantisation allowance.
        const epsilon = 0.00015, cell = Math.max(0, Math.min(7, Math.floor(((x + y + z) / 3) * 8)));
        assert(lo >= cell / 8 - epsilon && hi <= (cell + 1) / 8 + epsilon,
          `${inst.id}/LOD${lod}: triangle ${i / 3} UV ${f === 'getX' ? 'U' : 'V'} interval [${lo}, ${hi}] crosses a tile boundary`);
      }
    }
  }
  return { lod, triangles: count, vertices: p.count, maxTriangleUVSpan: +maxTriangleUVSpan.toFixed(6), recolourSlots: [...seenSlots].sort((a, b) => a - b) };
}

// All 32 clips are bound by canonical bone name on every resident and exercised at two interior phases on BOTH LODs.
// Sampling deformed vertices catches NaNs and exploded meshes, including a far mesh that silently uses another skeleton's joint order.
function animationCheck(inst, lod) {
  const p = inst.mesh.geometry.attributes.position, stride = Math.max(1, Math.floor(p.count / 96));
  let samples = 0;
  for (const name of CLIPS) {
    const clip = lib.clip(name);
    assert(clip && Number.isFinite(clip.duration) && clip.duration > 0, `${name}: invalid duration`);
    for (const t of clip.tracks) {
      assert(t.name.endsWith('.quaternion') && BONES.includes(t.name.slice(0, -11)), `${name}: unsupported track ${t.name}`);
      assert([...t.values].every(Number.isFinite), `${name}: nonfinite rotation`);
    }
    for (const phase of [0.19, 0.67]) {
      pose(inst, name, phase);
      for (let v = 0; v < p.count; v += stride) {
        inst.mesh.getVertexPosition(v, vector); vector.applyMatrix4(inst.mesh.matrixWorld);
        assert([vector.x, vector.y, vector.z].every(Number.isFinite), `${inst.id}/LOD${lod}/${name}: nonfinite posed vertex ${v}`);
        assert(Math.max(Math.abs(vector.x), Math.abs(vector.y), Math.abs(vector.z)) < 3.5, `${inst.id}/LOD${lod}/${name}: exploded posed vertex ${v}`);
        samples++;
      }
    }
  }
  return samples;
}

function validate() {
  const report = { baseline, expectedIds: IDS, ids: lib.ids(), clips: [...lib.clips.keys()], people: [], posedVertexChecks: 0 };
  if (!baseline) assert(sameSet(report.ids, IDS), `Expected the existing 30 builder IDs; loaded ${report.ids.length}: ${report.ids.join(', ')}`);
  assert(sameSet(report.clips, CLIPS), `Expected the existing 32 clips; loaded ${report.clips.length}`);
  for (const inst of instances) {
    assert(sameSet(Object.keys(inst.bones), BONES), `${inst.id}: bone names changed`);
    const mesh = inst.mesh, skeleton = mesh.skeleton, material = mesh.material;
    let meshCount = 0; inst.obj.traverse(o => { if (o.isSkinnedMesh) meshCount++; });
    assert(meshCount === 1 && !Array.isArray(material), `${inst.id}: expected one skinned mesh/material/draw call`);
    assert(lib.lodGeo.has(inst.id), `${inst.id}: far LOD is absent`);
    const row = { id: inst.id, heightM: inst.meta.heightM, lods: [] };
    for (const lod of [0, 1]) {
      lib.setLod(inst, lod);
      assert(inst.mesh === mesh && inst.mesh.skeleton === skeleton && inst.mesh.material === material, `${inst.id}: LOD replaced skeleton/material`);
      row.lods.push(geometryCheck(inst, lod));
      report.posedVertexChecks += animationCheck(inst, lod);
    }
    lib.setLod(inst, 0);
    const variant = makeVariant(inst.meta, makeRng(1741).fork(inst.id));
    for (const lod of [0, 1]) {
      const recoloured = lib.geometry(inst.id, lod, variant), base = lib.geometry(inst.id, lod, null);
      assert(recoloured?.attributes.position === base.attributes.position, `${inst.id}/LOD${lod}: variant duplicates or changes the body geometry`);
      assert(recoloured?.attributes.skinIndex === base.attributes.skinIndex, `${inst.id}/LOD${lod}: variant changes skin binding`);
    }
    row.variant = variant; report.people.push(row);
  }
  return report;
}

function render(lod = 0, clip = 'idle_a', phase = 0.27, headshots = false) {
  const labelRoot = document.getElementById('labels'); labelRoot.replaceChildren();
  document.getElementById('status').textContent = `${baseline ? 'BASELINE · ' : ''}${lod ? 'FAR LOD' : 'NEAR LOD'}${headshots ? ' · PORTRAITS' : ''}\n${instances.length} residents · ${clip} @ ${phase.toFixed(2)}`;
  const rows = [];
  renderer.setScissorTest(false); renderer.setViewport(0, 0, W, TILE * ROWS); renderer.clear();
  renderer.setScissorTest(true);
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]; lib.setLod(inst, lod); pose(inst, clip, phase); scene.add(inst.root);
    const radius = headshots ? 0.32 : 1.05;
    camera.left = -radius; camera.right = radius; camera.top = radius; camera.bottom = -radius; camera.updateProjectionMatrix();
    if (headshots) {
      const eye = inst.meta.eyeHeightM ?? inst.meta.heightM - 0.13;
      camera.position.set(0.14, eye + 0.015, 3); camera.lookAt(0, eye - 0.025, 0);
    } else { camera.position.set(0.5, 1.07, 4.5); camera.lookAt(0, 1.02, 0); }
    const col = i % COLS, row = Math.floor(i / COLS), bottom = (ROWS - row - 1) * TILE;
    renderer.setViewport(col * TILE, bottom, TILE, TILE - 42);
    renderer.setScissor(col * TILE, bottom, TILE, TILE - 42); renderer.clear(); renderer.render(scene, camera);
    scene.remove(inst.root);
    const label = document.createElement('div'); label.className = 'label';
    const title = document.createElement('strong'); title.textContent = `${String(i + 1).padStart(2, '0')}  ${inst.id}`; label.append(title);
    const detail = document.createElement('div'); detail.className = 'detail'; detail.textContent = inst.meta.tags.slice(0, 3).join(' · '); label.append(detail);
    const foot = document.createElement('div'); foot.className = 'foot'; foot.textContent = `${tris(inst.mesh).toLocaleString('en')} triangles · ${inst.meta.heightM.toFixed(2)} m`; label.append(foot);
    labelRoot.append(label); rows.push({ id: inst.id, triangles: tris(inst.mesh), lod });
  }
  renderer.setScissorTest(false); renderer.getContext().finish();
  return { width: W, height: TILE * ROWS + HEADER, lod, clip, phase, headshots, rows };
}

// Read framebuffer pixels, independent of screenshot file existence: a blank figure cannot pass just by emitting a PNG.
function pixels() {
  const gl = renderer.getContext(), result = [];
  for (let i = 0; i < instances.length; i++) {
    const col = i % COLS, row = Math.floor(i / COLS), width = 170, height = 210;
    const data = new Uint8Array(width * height * 4);
    gl.readPixels(col * TILE + 75, (ROWS - row - 1) * TILE + 37, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let dark = 0, opaque = 0;
    for (let j = 0; j < data.length; j += 4) {
      if (data[j + 3] > 240) opaque++;
      if ((data[j] + data[j + 1] + data[j + 2]) / 3 < 150) dark++;
    }
    assert(opaque > width * height * 0.99 && dark > 120, `${instances[i].id}: blank or transparent contact-sheet tile (${dark} dark pixels)`);
    result.push({ id: instances[i].id, darkPixels: dark, opaquePixels: opaque });
  }
  return result;
}

window.__peopleCheck = { ready: null, validate, render, pixels };
window.__peopleCheck.ready = lib.load().then(() => {
  for (const id of lib.ids()) instances.push(lib.instantiate(id));
  render(); return { count: instances.length, ids: lib.ids(), clips: [...lib.clips.keys()] };
}).catch(e => { document.getElementById('status').textContent = String(e); throw e; });
