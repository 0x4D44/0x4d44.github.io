// Development-only evidence of the exported child GLB. No game placement is performed.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MaterialLib } from '../../js/core/matlib.js';

const query = new URLSearchParams(location.search);
const manifestURL = new URL(query.get('manifest') || '../../assets/models/manifest.garments_child.json', location.href);
const library = new MaterialLib({ night: 0 });
const loader = new GLTFLoader();
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#gl'), antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xf8fbff, 0xa99578, 2.1));
const keyLight = new THREE.DirectionalLight(0xfff8e9, 2.7); keyLight.position.set(-2.5, 5, 4); scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xdbeaff, 1.0); fillLight.position.set(4, 2, -2); scene.add(fillLight);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.005, 100);
const specimen = new THREE.Group(); scene.add(specimen);
const occupancyTarget = new THREE.WebGLRenderTarget(160, 160, { depthBuffer: true });
const occupancyPixels = new Uint8Array(160 * 160 * 4);
const modelFiles = new Map(), materials = new Map(), cards = new Map();
const round = (n) => Math.round(n * 1e6) / 1e6;
const labels = {
  tshirt_teal: 'Plain teal T-shirt', tshirt_coral: 'Plain coral T-shirt', tshirt_motif: 'T-shirt with simple motif',
  shorts: 'Everyday shorts', cotton_dress: 'Cotton dress', hoodie: 'Hoodie', joggers: 'Joggers',
  school_jumper: 'School jumper', school_polo: 'White school polo', school_trousers: 'School trousers',
  school_skirt: 'Pleated school skirt', school_tie: 'Sash-style school tie', socks_pair: 'Pair of socks',
  cap: 'Cap', light_jacket: 'Light jacket', school_shoes: 'Pair of school shoes', sandals: 'Pair of sandals',
};
let manifest, palette, atlasTexture, modelsBase, entries;
function demand(condition, message) { if (!condition) throw new Error(message); }
async function json(url) { const response = await fetch(url); demand(response.ok, `Missing data: ${response.status} ${url}`); return response.json(); }

function variantMaterial(id) {
  if (materials.has(id)) return materials.get(id);
  const variant = palette.variants[id]; demand(variant, `Unknown adult palette variant ${id}`);
  const material = library.get(palette.material).clone();
  material.name = `${palette.material}:${id}`; material.vertexColors = true; material.roughness = variant.roughness ?? .95;
  if (atlasTexture) {
    const map = atlasTexture.clone(), [col, row] = variant.tile, inset = 2 / palette.atlas.size[0];
    map.flipY = false; map.repeat.set(1 / palette.atlas.grid[0] - 2 * inset, 1 / palette.atlas.grid[1] - 2 * inset);
    map.offset.set(col / palette.atlas.grid[0] + inset, row / palette.atlas.grid[1] + inset);
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; map.needsUpdate = true;
    material.map = map; material.color.set(0xffffff);
  } else material.color.set(variant.color);
  material.needsUpdate = true; materials.set(id, material); return material;
}
async function model(key, lod = false) {
  const entry = entries.get(key); demand(entry, `Unknown child asset ${key}`);
  const { asset, glb } = entry, source = lod ? asset.lod : { glb, node: asset.node };
  const url = new URL(source.glb, modelsBase).href;
  if (!modelFiles.has(url)) modelFiles.set(url, loader.loadAsync(url));
  const gltf = await modelFiles.get(url), original = gltf.scene.getObjectByName(source.node);
  demand(original, `Missing root ${source.node}`);
  const object = original.clone(true), variant = asset.defaultVariant || asset.variants[0];
  let triangles = 0, meshes = 0;
  object.traverse((part) => {
    if (!part.isMesh) return;
    const positions = part.geometry.getAttribute('position'); demand(positions && positions.count >= 3, `${key}: empty mesh`);
    demand(Array.from(positions.array).every(Number.isFinite), `${key}: non-finite positions`);
    triangles += (part.geometry.index?.count ?? positions.count) / 3; meshes++;
    part.material = variantMaterial(variant); part.frustumCulled = true;
  });
  object.updateMatrixWorld(true);
  demand(meshes > 0 && triangles > 0, `${key}: empty geometry`);
  demand(triangles === (lod ? asset.lod.triangles : asset.triangles), `${key}: triangle metadata mismatch`);
  const box = new THREE.Box3().setFromObject(object), size = box.getSize(new THREE.Vector3()).toArray();
  const declaredSize = lod ? asset.lod.size : asset.size;
  demand(size.every((value, i) => Math.abs(value - declaredSize[i]) < .00015), `${key}: rendered bounds differ from manifest`);
  return { object, report: { key, garment: asset.garment, sizeClass: asset.sizeClass, state: asset.state, lod, variant, node: source.node, glb: source.glb,
    triangles, meshes, size: size.map(round), bounds: { min: box.min.toArray().map(round), max: box.max.toArray().map(round) } } };
}
function fitCamera(direction, width, height) {
  specimen.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(specimen), size = bounds.getSize(new THREE.Vector3()), centre = bounds.getCenter(new THREE.Vector3());
  demand(!bounds.isEmpty(), 'Cannot frame empty comparison');
  const distance = Math.max(size.length() * 3, 2);
  camera.position.copy(centre).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));
  camera.up.set(0, 1, 0); camera.lookAt(centre); camera.updateMatrixWorld(true);
  let halfWidth = 0, halfHeight = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    halfWidth = Math.max(halfWidth, Math.abs(p.x)); halfHeight = Math.max(halfHeight, Math.abs(p.y));
  }
  halfHeight = Math.max(halfHeight, halfWidth / (width / height), .02) * 1.16;
  camera.left = -halfHeight * width / height; camera.right = -camera.left; camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.far = distance + size.length() * 3 + 10; camera.updateProjectionMatrix();
}
function measureRender(width, height) {
  renderer.setSize(width, height, false);
  renderer.setRenderTarget(occupancyTarget); renderer.clear(); renderer.render(scene, camera);
  renderer.readRenderTargetPixels(occupancyTarget, 0, 0, 160, 160, occupancyPixels);
  let opaquePixels = 0;
  for (let i = 3; i < occupancyPixels.length; i += 4) if (occupancyPixels[i] > 16) opaquePixels++;
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera);
  const occupancy = opaquePixels / (160 * 160);
  demand(occupancy > .005, 'Rendered comparison is absent or subpixel');
  demand(renderer.info.render.calls > 0 && renderer.info.render.triangles > 0, 'Renderer issued no geometry');
  return { occupancy: round(occupancy), calls: renderer.info.render.calls, renderedTriangles: renderer.info.render.triangles };
}
function canvasImage(width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f8f5ed'; ctx.fillRect(0, 0, width, height); return { canvas, ctx };
}

// A shared camera sees both sizes together. There is no independent auto-fit that could disguise a size error.
async function comparison(id, state, options = {}) {
  specimen.clear();
  const lodComparison = options.compareLod === true, lod = options.lod === true;
  const specs = lodComparison ? [{ size: 'big', lod: false }, { size: 'big', lod: true }] : [{ size: 'small', lod }, { size: 'big', lod }];
  const models = await Promise.all(specs.map((spec) => model(`garment_${id}_${spec.size}_${state}`, spec.lod)));
  const widths = models.map(({ report }) => report.size[0]), gap = Math.max(...widths) * .22 + .012;
  models[0].object.position.x = -(widths[1] + gap) / 2;
  models[1].object.position.x = (widths[0] + gap) / 2;
  for (const { object } of models) specimen.add(object);
  const direction = state === 'hung' ? [0.04, .025, 1] : ['cap', 'school_shoes', 'sandals'].includes(id) ? [.12, 1.0, 1.2] : state === 'flat' ? [.025, 1.7, .42] : [.12, 1.2, .7];
  fitCamera(direction, 700, 420);
  const render = measureRender(700, 420), { canvas, ctx } = canvasImage(700, 580);
  demand(render.renderedTriangles === models.reduce((sum, model) => sum + model.report.triangles, 0), 'A comparison object was not fully rendered');
  ctx.fillStyle = '#263f37'; ctx.font = '600 26px system-ui,sans-serif'; ctx.fillText(labels[id] || id, 24, 35);
  ctx.fillStyle = '#6b776b'; ctx.font = '15px system-ui,sans-serif'; ctx.fillText(`${state.toUpperCase()}${lodComparison ? ' · HIGH DETAIL / LOD' : lod ? ' · LOD' : ''}`, 25, 61);
  ctx.drawImage(renderer.domElement, 0, 75);
  for (let i = 0; i < models.length; i++) {
    const { report } = models[i], longest = Math.max(...report.size), x = i * 350 + 175;
    ctx.fillStyle = '#314e42'; ctx.textAlign = 'center'; ctx.font = '600 18px system-ui,sans-serif';
    ctx.fillText(lodComparison ? (i ? 'LOD' : 'HIGH DETAIL') : `${specs[i].size.toUpperCase()} · ${i ? '8–12' : '4–7'} years`, x, 519);
    ctx.fillStyle = '#748073'; ctx.font = '14px system-ui,sans-serif'; ctx.fillText(`${Math.round(longest * 1000)} mm longest · ${report.triangles} tri`, x, 542);
  }
  ctx.textAlign = 'left'; ctx.strokeStyle = '#d9ddcf'; ctx.beginPath(); ctx.moveTo(24, 557); ctx.lineTo(676, 557); ctx.stroke();
  ctx.fillStyle = '#7c8375'; ctx.font = '12px system-ui,sans-serif'; ctx.fillText('Shared scale within comparison · actual exported meshes · metres', 25, 574);
  const cardKey = `${id}:${state}:${lodComparison ? 'compare-lod' : lod ? 'lod' : 'high'}`;
  cards.set(cardKey, canvas);
  return { cardKey, items: models.map(({ report }) => report), render };
}
async function contact(state, options = {}) {
  const ids = Object.keys(labels).filter((id) => entries.has(`garment_${id}_big_${state}`));
  const compareLod = options.compareLod === true, lod = options.lod === true;
  const results = [];
  for (const id of ids) results.push(await comparison(id, state, { compareLod, lod }));
  const columns = 3, cellWidth = 490, cellHeight = 406, header = 125, footer = 45;
  const { canvas, ctx } = canvasImage(columns * cellWidth, Math.ceil(ids.length / columns) * cellHeight + header + footer);
  ctx.fillStyle = '#274b3c'; ctx.fillRect(0, 0, canvas.width, 9); ctx.font = '600 34px system-ui,sans-serif';
  ctx.fillText(`LA LADERA / ${compareLod ? 'HIGH DETAIL & LOD' : state.toUpperCase()}`, 30, 56);
  ctx.fillStyle = '#63735e'; ctx.font = '18px system-ui,sans-serif';
  ctx.fillText(compareLod ? 'Children’s everyday clothes · big size · matching views and scale' : `Children’s everyday clothes · small 4–7 / big 8–12 · ${ids.length} garment comparisons`, 31, 88);
  ctx.font = '13px system-ui,sans-serif'; ctx.fillText('Measured geometry • original neutral designs • shared adult fabric palette and atlas', 31, 111);
  for (let i = 0; i < results.length; i++) {
    const x = (i % columns) * cellWidth, y = header + Math.floor(i / columns) * cellHeight;
    ctx.drawImage(cards.get(results[i].cardKey), x, y, cellWidth, cellHeight);
  }
  ctx.fillStyle = '#6e7b67'; ctx.font = '13px system-ui,sans-serif';
  ctx.fillText('DEVELOPMENT RENDERS · exported child asset library · no room integration implied', 31, canvas.height - 16);
  const dataUrl = canvas.toDataURL('image/jpeg', .93);
  document.querySelector('#review').src = dataUrl;
  document.querySelector('#status').textContent = `${results.length} comparisons · ${state}${compareLod ? ' · high detail / LOD' : ''}`;
  return { dataUrl, width: canvas.width, height: canvas.height, count: results.length, items: results.flatMap((r) => r.items), renders: results.map((r) => r.render) };
}
async function init() {
  manifest = await json(manifestURL); modelsBase = new URL('.', manifestURL);
  demand(manifest.childOnly === true && manifest.ageGroup === 'child', 'Expected an explicit child object manifest');
  const paletteURL = new URL(manifest.palette, modelsBase); palette = await json(paletteURL);
  entries = new Map();
  for (const set of manifest.files || []) for (const [key, asset] of Object.entries(set.assets || {})) {
    demand(!entries.has(key), `Duplicate child key ${key}`); entries.set(key, { asset, glb: set.glb });
  }
  demand(entries.size > 0, 'Empty child garment library');
  if (query.get('atlas') !== '0') {
    atlasTexture = await new THREE.TextureLoader().loadAsync(new URL(palette.atlas.file, paletteURL).href);
    atlasTexture.colorSpace = THREE.SRGBColorSpace; atlasTexture.flipY = false;
    atlasTexture.minFilter = THREE.LinearMipmapLinearFilter; atlasTexture.magFilter = THREE.LinearFilter;
  }
  return { entries: [...entries].map(([key, { asset }]) => ({ key, garment: asset.garment, state: asset.state, sizeClass: asset.sizeClass })),
    atlasLoaded: !!atlasTexture, material: palette.material, revision: THREE.REVISION, manifest: manifestURL.pathname };
}
window.__childGarments = { contact, comparison, loadedFiles: () => [...modelFiles.keys()], ready: null };
window.__childGarments.ready = init().catch((error) => { document.querySelector('#error').textContent = error.stack; throw error; });
