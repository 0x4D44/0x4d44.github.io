// Developer asset lab. This reference studio is intentionally independent of the
// missing drawer renderer at source revision 8fa06a5; it is not evidence that the
// objects are connected to an in-game inspection flow or its lighting.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Assets } from '../../js/core/assets.js';
import { MaterialLib } from '../../js/core/matlib.js';

export const INSPECT_STUDIO = Object.freeze({
  id: 'inspect-reference-studio-v1',
  actualGameInspectLightingVerified: false,
  description: 'Warm key, cool fill, hemisphere and generated room reflections; reference lighting only.',
  key: { color: 0xffe1b5, intensity: 2.8, position: [-2, 3, 4] },
  fill: { color: 0xb8d6ee, intensity: 1.2, position: [3, 1, 2] },
  rim: { color: 0xffd4a1, intensity: 2.0, position: [-1, 2, -3] },
  hemisphere: { sky: 0xe4e9dd, ground: 0x4b4338, intensity: 1.1 },
  environment: { generator: 'Three.js r180 RoomEnvironment', sigmaRadians: 0.02 },
  toneMapping: 'ACESFilmic', exposure: 1.1, fov: 32,
  frontDirection: [0.18, 0.22, 1], margin: 1.14,
});

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
if (query.has('capture')) document.body.classList.add('capture');

const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = INSPECT_STUDIO.exposure;
renderer.setClearColor(0x000000, 0);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(INSPECT_STUDIO.fov, 1, 0.001, 100);
for (const name of ['key', 'fill', 'rim']) {
  const def = INSPECT_STUDIO[name];
  const light = new THREE.DirectionalLight(def.color, def.intensity);
  light.position.fromArray(def.position);
  scene.add(light);
}
const hemi = INSPECT_STUDIO.hemisphere;
scene.add(new THREE.HemisphereLight(hemi.sky, hemi.ground, hemi.intensity));
const environment = new RoomEnvironment();
const pmrem = new THREE.PMREMGenerator(renderer);
const envTarget = pmrem.fromScene(environment, INSPECT_STUDIO.environment.sigmaRadians);
scene.environment = envTarget.texture;
environment.dispose();
pmrem.dispose();

const ctx = { night: 0 };
const materials = new MaterialLib(ctx);
materials.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
ctx.mat = (name) => materials.get(name);
const assets = new Assets(ctx);
let manifest;
let keys = [];
let active = null;
let current = null;
let radius = 1;
let sequence = 0;

function render() {
  renderer.info.reset();
  renderer.render(scene, camera);
}

function fit() {
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const direction = new THREE.Vector3().fromArray(INSPECT_STUDIO.frontDirection).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right);
  // Fit the actual projected bounds rather than a sphere: a wide harmonica or
  // thin letter should use the available inspection area, just like a coin.
  let distance = 0.004;
  if (active) {
    const box = new THREE.Box3().setFromObject(active);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const corner = new THREE.Vector3(x, y, z);
      const depth = corner.dot(direction);
      distance = Math.max(distance,
        depth + Math.abs(corner.dot(right)) / Math.tan(hfov / 2) * INSPECT_STUDIO.margin,
        depth + Math.abs(corner.dot(up)) / Math.tan(vfov / 2) * INSPECT_STUDIO.margin);
    }
  } else distance = radius / Math.sin(Math.min(vfov, hfov) / 2) * INSPECT_STUDIO.margin;
  camera.position.copy(direction).multiplyScalar(distance);
  camera.near = Math.max(0.0001, distance - radius * 2);
  camera.far = Math.max(1, distance + radius * 4);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  render();
}

function state() {
  const materialNames = new Set();
  let meshTriangles = 0, meshes = 0;
  active?.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    meshes++;
    materialNames.add(o.material.name);
    meshTriangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  });
  return {
    ...current,
    triangles: renderer.info.render.triangles,
    drawCalls: renderer.info.render.calls,
    meshTriangles, meshes,
    materials: [...materialNames].sort(),
    viewport: { width: renderer.domElement.width, height: renderer.domElement.height },
    camera: { position: camera.position.toArray(), fov: camera.fov, near: camera.near, far: camera.far },
  };
}

/** Select exactly one mesh hierarchy; cached GLBs never enter the visible scene. */
async function show(key, options = {}) {
  const ticket = ++sequence;
  const meta = assets.meta(key);
  if (!meta || meta.lodOf) throw new Error(`Unknown inspect object: ${key}`);
  const lod = options.lod === true;
  const selected = lod ? meta.lod : key;
  const entry = assets.meta(selected);
  if (!entry) throw new Error(`Missing LOD entry for ${key}`);
  const gltf = await assets.load(entry.glb);
  if (!gltf.scene.getObjectByName(entry.node)) throw new Error(`Missing node ${entry.node} in ${entry.glb}`);
  if (ticket !== sequence) return null;
  const next = assets.instance(selected);
  // An instance has shared geometry/materials; removing it must not dispose the
  // cached source geometry or the library's shared materials.
  if (active) scene.remove(active);
  active = next;
  active.rotation.set(0, options.view === 'back' ? Math.PI : 0, 0);
  scene.add(active);
  await materials.whenReady();
  if (ticket !== sequence) return null;
  if (materials.missing.size) throw new Error(`Unknown materials: ${[...materials.missing].join(', ')}`);
  const box = new THREE.Box3().setFromObject(active);
  if (box.isEmpty()) throw new Error(`Empty object: ${selected}`);
  radius = Math.max(0.001, box.getBoundingSphere(new THREE.Sphere()).radius);
  const size = box.getSize(new THREE.Vector3());
  const originalSize = meta.size ?? size.toArray();
  current = { key, selected, lod, view: options.view === 'back' ? 'back' : 'front',
    label: meta.label ?? key, bounds: { min: box.min.toArray(), max: box.max.toArray() } };
  $('title').textContent = current.label;
  $('view').textContent = `${current.view === 'back' ? 'Reverso' : 'Vista frontal'}${lod ? ' · LOD' : ''}`;
  $('size').textContent = originalSize.map((v) => `${(v * 100).toFixed(1)}`).join(' × ') + ' cm';
  $('object').value = key;
  $('detail').textContent = lod ? 'Ver detalle' : 'Ver LOD';
  fit();
  // Let the texture upload and compositor settle without an animation loop.
  await new Promise((resolve) => requestAnimationFrame(() => { render(); requestAnimationFrame(resolve); }));
  return state();
}

async function boot() {
  await materials.init();
  const response = await fetch('./assets/models/manifest.inspect.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Inspect manifest: HTTP ${response.status}`);
  manifest = await response.json();
  // Read only this optional library, independent of the world's registered sets.
  await assets.init(async (name) => name === 'manifest.json' ? { files: ['manifest.inspect.json'] } : manifest);
  keys = [...assets.entries].filter(([, meta]) => !meta.lodOf).map(([key]) => key);
  if (!keys.length) throw new Error('Inspect library contains no objects');
  for (const key of keys) {
    const option = document.createElement('option');
    option.value = key; option.textContent = assets.meta(key).label ?? key;
    $('object').append(option);
  }
  await show(query.get('object') ?? keys[0]);
  return true;
}

window.__inspect = {
  ready: null, show, state,
  list: () => keys.map((key) => ({ key, ...assets.meta(key) })),
  lighting: INSPECT_STUDIO,
  integrationStatus: () => manifest?.integrationStatus ?? 'unknown',
  snapshot: () => { render(); return renderer.domElement.toDataURL('image/png'); },
};
window.__inspect.ready = boot().then(() => { window.__inspectReady = true; return true; }).catch((error) => {
  window.__inspectError = String(error.stack ?? error);
  $('error').hidden = false; $('error').textContent = `No se pudo cargar el objeto.\n${error.message}`;
  console.error(error);
  return false;
});

$('object').addEventListener('change', () => show($('object').value).catch(console.error));
$('turn').addEventListener('click', () => current && show(current.key, { lod: current.lod, view: current.view === 'front' ? 'back' : 'front' }).catch(console.error));
$('detail').addEventListener('click', () => current && show(current.key, { lod: !current.lod, view: current.view }).catch(console.error));
addEventListener('resize', fit);

let drag = null;
stage.addEventListener('pointerdown', (event) => {
  if (!active || query.has('capture')) return;
  drag = { x: event.clientX, y: event.clientY, rx: active.rotation.x, ry: active.rotation.y };
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener('pointermove', (event) => {
  if (!drag || !active) return;
  active.rotation.x = drag.rx + (event.clientY - drag.y) * 0.008;
  active.rotation.y = drag.ry + (event.clientX - drag.x) * 0.008;
  render();
});
stage.addEventListener('pointerup', () => { drag = null; });
stage.addEventListener('pointercancel', () => { drag = null; });

addEventListener('pagehide', () => {
  envTarget.dispose();
  renderer.dispose();
}, { once: true });
