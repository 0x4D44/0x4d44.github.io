// Dedicated 1.6 m body-review gallery. Uses CharacterLibrary's real materials,
// skinning and LOD swap. No render loop, input, audio, simulation or desktop access.
import * as THREE from 'three';
import { CharacterLibrary } from '../js/people/rig.js';

const IDS = ['m_tendero', 'm_don', 'm_elder', 'm_abuelo', 'w_elder', 'm_panadero', 'm_afro', 'w_ama'];
const DISTANCE = 1.6, FOV = 74, W = 1920, HEADER = 100, TILE_W = 480, TILE_H = 780, VIEW_H = 686, COLS = 4, ROWS = 2;
const query = new URLSearchParams(location.search);
const label = query.get('label') ?? 'AFTER';
const lib = new CharacterLibrary('../assets/models/');
if (query.has('base')) lib.override = { base: new URL(query.get('base'), location.href).href, glb: 'people.glb', lod: 'people_lod.glb', meta: 'people_meta.json' };
const assert = (value, message) => { if (!value) throw new Error(message); };
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gallery'), antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, TILE_H * ROWS, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.autoClear = false;
const background = new THREE.Color('#e9e5dd');
const scene = new THREE.Scene(); scene.background = background;
scene.add(new THREE.HemisphereLight(0xd4e1f0, 0x8f7e65, 2.1));
const key = new THREE.DirectionalLight(0xffead1, 3.1); key.position.set(-2, 4, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xd7e4ff, 0.65); fill.position.set(3, 2, -2); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ color: '#d7d3ca', roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.008; scene.add(floor);
const camera = new THREE.PerspectiveCamera(FOV, TILE_W / VIEW_H, 0.03, 20);
const maskMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
const instances = [];
const v = new THREE.Vector3(), projected = new THREE.Vector3();

function pose(inst, clip, phase) {
  inst.mixer.stopAllAction(); inst.cur = null;
  assert(lib.play(inst, clip, { fade: 0, time: phase }), `${inst.id}: missing clip ${clip}`);
  inst.mixer.update(0); inst.root.updateMatrixWorld(true); inst.mesh.skeleton.update();
}

function cameraFor(inst, yawDegrees, portrait, torso) {
  const yaw = THREE.MathUtils.degToRad(yawDegrees);
  // Horizontal distance is measured from the camera to the resident's root.
  // Full-body images use a fixed camera height and aim point for every person;
  // neither the before/after assets nor their bounds can change the framing.
  // The torso supplement centres on frozen hip metadata, never on rebuilt mesh
  // bounds. This keeps the collar and fingertips framed for different heights.
  const cameraY = portrait ? inst.meta.eyeHeightM - 0.025 : torso ? inst.meta.hipHeightM * 1.23 : 1.0;
  const targetY = portrait || torso ? cameraY : 0.9;
  camera.fov = portrait ? 21 : torso ? 36 : FOV;
  camera.position.set(Math.sin(yaw) * DISTANCE, cameraY, Math.cos(yaw) * DISTANCE);
  camera.lookAt(0, targetY, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  return { positionM: camera.position.toArray(), targetM: [0, targetY, 0], horizontalDistanceM: Math.hypot(camera.position.x, camera.position.z), verticalFovDegrees: camera.fov, aspect: camera.aspect, nearM: camera.near, farM: camera.far };
}

function projectionCheck(inst, detail) {
  const p = inst.mesh.geometry.attributes.position;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let clippedVertices = 0;
  for (let i = 0; i < p.count; i++) {
    inst.mesh.getVertexPosition(i, v); v.applyMatrix4(inst.mesh.matrixWorld);
    assert([v.x, v.y, v.z].every(Number.isFinite), `${inst.id}: non-finite skinned vertex ${i}`);
    projected.copy(v).project(camera);
    for (const [k, value] of [projected.x, projected.y, projected.z].entries()) { min[k] = Math.min(min[k], value); max[k] = Math.max(max[k], value); }
    if (Math.abs(projected.x) >= 0.994 || Math.abs(projected.y) >= 0.994 || projected.z <= -1 || projected.z >= 1) clippedVertices++;
  }
  // Detail supplements explicitly crop the figure. Only full-body sheets are
  // accepted as framing proof; every posed vertex must lie within their frame.
  if (!detail) assert(clippedVertices === 0, `${inst.id}: ${clippedVertices} skinned vertices clipped by the fixed 1.6 m camera; bounds ${JSON.stringify({ min, max })}`);
  return { vertices: p.count, minNdc: min, maxNdc: max, clippedVertices, fullBodyFramingChecked: !detail };
}

function maskCheck(inst, left, bottom, detail) {
  const gl = renderer.getContext(), data = new Uint8Array(TILE_W * VIEW_H * 4);
  scene.background = new THREE.Color(0xffffff); scene.overrideMaterial = maskMaterial; floor.visible = false;
  renderer.clear(); renderer.render(scene, camera); gl.finish();
  gl.readPixels(left, bottom, TILE_W, VIEW_H, gl.RGBA, gl.UNSIGNED_BYTE, data);
  scene.background = background; scene.overrideMaterial = null; floor.visible = true;
  let foregroundPixels = 0, edgePixels = 0;
  const min = [TILE_W, VIEW_H], max = [-1, -1], mask = new Uint8Array(TILE_W * VIEW_H);
  for (let y = 0; y < VIEW_H; y++) for (let x = 0; x < TILE_W; x++) {
    const i = (y * TILE_W + x) * 4;
    if (data[i] >= 128 || data[i + 1] >= 128 || data[i + 2] >= 128) continue;
    mask[y * TILE_W + x] = 1; foregroundPixels++;
    min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y);
    if (x < 2 || x >= TILE_W - 2 || y < 2 || y >= VIEW_H - 2) edgePixels++;
  }
  assert(foregroundPixels > 4500, `${inst.id}: missing or blank render (${foregroundPixels} silhouette pixels)`);
  if (!detail) assert(edgePixels === 0, `${inst.id}: silhouette touches the image edge (${edgePixels} pixels)`);
  // Record disconnected silhouette components to make tiny far-LOD specks
  // measurable. These are evidence, not an invented universal anatomy limit.
  const components = [], queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    let head = 0, tail = 1; queue[0] = start; mask[start] = 0;
    while (head < tail) {
      const q = queue[head++], x = q % TILE_W, y = Math.floor(q / TILE_W);
      for (const n of [x > 0 ? q - 1 : -1, x < TILE_W - 1 ? q + 1 : -1, y > 0 ? q - TILE_W : -1, y < VIEW_H - 1 ? q + TILE_W : -1]) {
        if (n >= 0 && mask[n]) { mask[n] = 0; queue[tail++] = n; }
      }
    }
    components.push(tail);
  }
  components.sort((a, b) => b - a);
  return { foregroundPixels, edgePixels, boundsPixels: { min, max }, componentAreasPixels: components };
}

function render({ lod = 0, clip = 'idle_a', phase = 0.27, yaw = 0, portrait = false, torso = false } = {}) {
  assert(!(portrait && torso), 'Select only one detail framing');
  const detail = portrait || torso;
  const labels = document.getElementById('labels'); labels.replaceChildren();
  const view = portrait ? 'HEAD / NECK · 21° DETAIL LENS' : torso ? 'TORSO / HANDS · 36° DETAIL LENS' : `FULL BODY · ${FOV}° VERTICAL LENS`;
  document.getElementById('status').textContent = `${label.toUpperCase()} · ${lod ? 'FAR' : 'NEAR'} LOD · ${view}\n1.600 m horizontal distance · ${clip} @ ${phase.toFixed(2)} · yaw ${yaw}°`;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, W, TILE_H * ROWS); renderer.setClearColor(background, 1); renderer.clear(); renderer.setScissorTest(true);
  const rows = [];
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]; lib.setLod(inst, lod); pose(inst, clip, phase); scene.add(inst.root);
    const cameraInfo = cameraFor(inst, yaw, portrait, torso), projection = projectionCheck(inst, detail);
    const left = i % COLS * TILE_W, bottom = (ROWS - 1 - Math.floor(i / COLS)) * TILE_H + 32;
    renderer.setViewport(left, bottom, TILE_W, VIEW_H); renderer.setScissor(left, bottom, TILE_W, VIEW_H);
    const mask = maskCheck(inst, left, bottom, detail);
    renderer.clear(); renderer.render(scene, camera); scene.remove(inst.root);
    const triangles = (inst.mesh.geometry.index?.count ?? inst.mesh.geometry.attributes.position.count) / 3;
    const div = document.createElement('div'); div.className = 'label';
    const name = document.createElement('strong'); name.textContent = `${String(i + 1).padStart(2, '0')}  ${inst.id}`; div.append(name);
    const detailLabel = document.createElement('div'); detailLabel.className = 'detail'; detailLabel.textContent = inst.meta.tags.slice(0, 3).join(' · '); div.append(detailLabel);
    const foot = document.createElement('div'); foot.className = 'foot'; foot.textContent = `${triangles.toLocaleString('en')} triangles · ${inst.meta.heightM.toFixed(2)} m · ${detail ? (torso ? 'head / feet intentionally cropped' : 'intentional detail crop') : 'whole figure; no clipped vertices'}`; div.append(foot); labels.append(div);
    rows.push({ id: inst.id, lod, triangles, heightM: inst.meta.heightM, camera: cameraInfo, projection, mask });
  }
  renderer.setScissorTest(false); renderer.getContext().finish();
  return { width: W, height: HEADER + TILE_H * ROWS, lod, clip, phase, yawDegrees: yaw, portrait, torso, rows };
}

window.__bodiesReview = { ready: null, render };
window.__bodiesReview.ready = lib.load().then(() => {
  assert(lib.ids().length === 30, `Expected 30 loaded residents; found ${lib.ids().length}`);
  assert(lib.clips.size === 32, `Expected 32 clips; found ${lib.clips.size}`);
  for (const id of IDS) { assert(lib.has(id), `Missing resident ${id}`); assert(lib.lodGeo.has(id), `Missing far LOD for ${id}`); instances.push(lib.instantiate(id)); }
  return { ids: IDS, loadedIds: lib.ids(), clipNames: [...lib.clips.keys()], quiet: !!window.__quiet };
}).catch(e => { document.getElementById('status').textContent = String(e); throw e; });
