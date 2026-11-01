// Developer-only evidence from actual exported GLB geometry. No production loader or placement code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MaterialLib } from '../../js/core/matlib.js';

const query = new URLSearchParams(location.search);
const manifestURL = new URL(query.get('manifest') || '../../assets/models/manifest.garments_teen.json', location.href);
const atlasEnabled = query.get('atlas') !== '0';
const library = new MaterialLib({ night: 0 });
const loader = new GLTFLoader();
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#gl'), antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xf8fbff, 0xa99578, 2.5));
const light = new THREE.DirectionalLight(0xfff8e9, 2.5); light.position.set(-2.5, 5, 4); scene.add(light);
const fill = new THREE.DirectionalLight(0xdbeaff, 1.2); fill.position.set(4, 2, -2); scene.add(fill);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.005, 100);
const specimen = new THREE.Group(); scene.add(specimen);
const occupancyTarget = new THREE.WebGLRenderTarget(128, 128, { depthBuffer: true });
const occupancyPixels = new Uint8Array(128 * 128 * 4);
const modelFiles = new Map(), thumbnailCache = new Map(), materialCache = new Map();
let manifest, palette, catalogue, atlasTexture, entries, modelsBase;

const states = { folded: 'FOLDED', hung: 'HUNG', flat: 'LAID FLAT' };
const fail = (message) => { throw new Error(message); };
const json = async (url) => { const response = await fetch(url); if (!response.ok) fail(`Missing data: ${response.status} ${url}`); return response.json(); };
const round = (n) => Math.round(n * 1e5) / 1e5;
const dimensionLabel = (size) => size.map((n) => (n * 100).toFixed(1)).join(' × ') + ' cm (W × H × D)';
const sizeClass = (key, asset) => asset.sizeClass || key.match(/_(small|big)_(folded|hung|flat)$/)?.[1];
const sizeLabel = (value) => value === 'small' ? 'SMALL · ages ~12–15 · 70%' : 'BIG · ages ~16–19 · 90%';

function variantMaterial(id) {
  if (materialCache.has(id)) return materialCache.get(id);
  const variant = palette.variants[id]; if (!variant) fail(`Unknown palette variant ${id}`);
  const material = library.get(palette.material).clone();
  material.name = `${palette.material}:${id}`; material.roughness = variant.roughness; material.vertexColors = true;
  if (atlasTexture) {
    const map = atlasTexture.clone();
    const [column, row] = variant.tile, inset = (palette.atlas.insetPixels ?? 2) / palette.atlas.size[0];
    map.flipY = false;
    map.repeat.set(1 / palette.atlas.grid[0] - 2 * inset, 1 / palette.atlas.grid[1] - 2 * inset);
    map.offset.set(column / palette.atlas.grid[0] + inset, row / palette.atlas.grid[1] + inset);
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; map.needsUpdate = true;
    material.map = map; material.color.set(0xffffff);
  } else material.color.set(variant.color);
  material.needsUpdate = true; materialCache.set(id, material); return material;
}

async function file(path) {
  const url = new URL(path, modelsBase).href;
  if (!modelFiles.has(url)) modelFiles.set(url, loader.loadAsync(url));
  return modelFiles.get(url);
}

function nodeStats(root) {
  let triangles = 0, meshes = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry.getAttribute('position');
    if (!position || position.count < 3) fail(`Empty mesh ${object.name}`);
    // Packed GLBs may interleave integer UV/colour bytes with float positions.
    // Inspect accessor components, not unrelated bytes through array's float view.
    for (let i = 0; i < position.count; i++) {
      if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) fail(`Non-finite position in ${object.name}`);
    }
    triangles += (object.geometry.index?.count ?? position.count) / 3; meshes++;
  });
  return { triangles, meshes };
}

async function garment(key, variantID, lod = false) {
  const entry = entries.get(key); if (!entry) fail(`Unknown asset ${key}`);
  const descriptor = entry.asset;
  if (!descriptor.variants.includes(variantID)) fail(`${key} does not allow ${variantID}`);
  const source = lod ? descriptor.lod : { glb: entry.glb, node: descriptor.node };
  if (!source?.glb || !source?.node) fail(`Missing ${lod ? 'LOD' : 'high-detail'} reference for ${key}`);
  const gltf = await file(source.glb), original = gltf.scene.getObjectByName(source.node);
  if (!original) fail(`No node ${source.node} in ${source.glb}`);
  const object = original.clone(true);
  object.traverse((part) => { if (part.isMesh) { part.material = variantMaterial(variantID); part.frustumCulled = true; } });
  object.updateMatrixWorld(true);
  const stats = nodeStats(object), expected = lod ? descriptor.lod.triangles : descriptor.triangles;
  if (!stats.meshes || stats.triangles !== expected) fail(`Triangle mismatch ${key}: ${stats.triangles} vs ${expected}`);
  const box = new THREE.Box3().setFromObject(object), size = box.getSize(new THREE.Vector3()).toArray();
  const expectedSize = lod ? descriptor.lod.size : descriptor.size;
  if (expectedSize && size.some((n, i) => Math.abs(n - expectedSize[i]) > .001)) fail(`Measured size mismatch ${key}`);
  return { object, descriptor, stats, size, glb: source.glb, node: source.node };
}

function fitCamera(direction, width, height, padding = 1.18) {
  specimen.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(specimen); if (bounds.isEmpty()) fail('Cannot frame empty geometry');
  const centre = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const distance = Math.max(size.length() * 3, 2);
  camera.position.copy(centre).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));
  camera.up.set(0, 1, 0); camera.lookAt(centre); camera.updateMatrixWorld(true);
  let xMax = 0, yMax = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    xMax = Math.max(xMax, Math.abs(p.x)); yMax = Math.max(yMax, Math.abs(p.y));
  }
  const aspect = width / height, halfHeight = Math.max(yMax, xMax / aspect, .015) * padding;
  camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.near = .005; camera.far = distance + size.length() * 3 + 10; camera.updateProjectionMatrix();
  return { min: bounds.min.toArray().map(round), max: bounds.max.toArray().map(round) };
}

function renderAndMeasure(width, height) {
  renderer.setSize(width, height, false);
  renderer.setRenderTarget(occupancyTarget); renderer.clear(); renderer.render(scene, camera);
  renderer.readRenderTargetPixels(occupancyTarget, 0, 0, 128, 128, occupancyPixels);
  let opaquePixels = 0; for (let i = 3; i < occupancyPixels.length; i += 4) if (occupancyPixels[i] > 16) opaquePixels++;
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera);
  const occupancy = opaquePixels / (128 * 128);
  if (occupancy < .008) fail(`Rendered object absent or subpixel: occupancy ${occupancy}`);
  if (!renderer.info.render.calls || !renderer.info.render.triangles) fail('Renderer issued no geometry');
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let visibleMeshes = 0;
  specimen.traverse((object) => { if (object.isMesh && object.visible && frustum.intersectsObject(object)) visibleMeshes++; });
  if (!visibleMeshes) fail('No visible meshes intersect the review camera');
  return { occupancy: round(occupancy), visibleMeshes, calls: renderer.info.render.calls, renderedTriangles: renderer.info.render.triangles };
}

function canvas(width, height) {
  const element = document.createElement('canvas'); element.width = width; element.height = height;
  const ctx = element.getContext('2d'); ctx.fillStyle = '#f6f3ec'; ctx.fillRect(0, 0, width, height); return { canvas: element, ctx };
}
function captioned(title, subtitle, footer, width = 480, height = 520) {
  const image = canvas(width, height), { ctx } = image;
  ctx.fillStyle = '#273d38'; ctx.font = `600 ${width > 600 ? 22 : 19}px system-ui,sans-serif`; ctx.fillText(title, 20, 30);
  ctx.fillStyle = '#697268'; ctx.font = `${width > 600 ? 12 : 11}px system-ui,sans-serif`; ctx.fillText(subtitle, 20, 50);
  ctx.drawImage(renderer.domElement, 0, 64, width, height - 116);
  ctx.strokeStyle = '#d6d8cf'; ctx.beginPath(); ctx.moveTo(20, height - 48); ctx.lineTo(width - 20, height - 48); ctx.stroke();
  ctx.fillStyle = '#59635c'; ctx.font = '11px ui-monospace,monospace'; ctx.fillText(footer, 20, height - 29);
  ctx.fillStyle = '#788078'; ctx.font = '10px system-ui,sans-serif'; ctx.fillText('LA LADERA · TEEN GARMENT ASSETS · ACTUAL GLB RENDER', 20, height - 12);
  const dataUrl = image.canvas.toDataURL('image/jpeg', .90); document.querySelector('#review').src = dataUrl; return dataUrl;
}

function directionFor(state, meta) {
  if (state === 'hung') return [0.12, 0.02, 1];
  if (meta?.category === 'footwear' || meta?.category === 'hat') return [0.55, 1.0, 1];
  return state === 'flat' ? [0.06, 1.7, .42] : [.35, 1.2, .8];
}

function silhouetteChecks(object, garmentID, state) {
  if (!['shorts_chino', 'lycra_shorts', 'lycra_trousers', 'denim_shorts', 'denim_jeans', 'joggers', 'school_trousers', 'underwear_boxers', 'swim_shorts'].includes(garmentID) || state === 'folded') return [];
  const bounds = new THREE.Box3().setFromObject(object), size = bounds.getSize(new THREE.Vector3());
  const x = (bounds.min.x + bounds.max.x) / 2;
  const start = state === 'hung' ? new THREE.Vector3(x, bounds.min.y + size.y * .12, bounds.max.z + .1)
    : new THREE.Vector3(x, bounds.max.y + .1, bounds.max.z - size.z * .12);
  const ray = new THREE.Raycaster(start, state === 'hung' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, -1, 0), 0, size.length() + 1);
  const hits = ray.intersectObject(object, true);
  return [{ name: 'open-space-between-legs', pass: hits.length === 0, hits: hits.length }];
}

async function capture(key, options = {}) {
  specimen.clear();
  const descriptor = entries.get(key)?.asset; if (!descriptor) fail(`Unknown capture key ${key}`);
  const variant = options.variant || descriptor.defaultVariant || descriptor.variants[0], lod = options.lod === true;
  const model = await garment(key, variant, lod); specimen.add(model.object);
  const meta = catalogue.garments.find((g) => g.id === descriptor.garment), state = descriptor.state;
  const direction = directionFor(state, meta); if (options.view === 'back') direction[2] *= -1;
  const bounds = fitCamera(direction, 480, 404), pixels = renderAndMeasure(480, 404);
  const geometryChecks = silhouetteChecks(model.object, descriptor.garment, state);
  const report = { key, garment: descriptor.garment, state, sizeClass: sizeClass(key, descriptor), lod, variant,
    glb: model.glb, node: model.node, size: model.size.map(round), bounds, geometryChecks, ...model.stats, ...pixels };
  const dataUrl = captioned(meta?.label || descriptor.garment, `${states[state]} · ${sizeLabel(report.sizeClass)}${lod ? ' · LOD' : ''}`, `${dimensionLabel(model.size)} · ${model.stats.triangles} tri`);
  thumbnailCache.set(`${key}:${lod ? 'lod' : 'high'}`, dataUrl);
  document.querySelector('#status').textContent = JSON.stringify(report, null, 2); return { dataUrl, report };
}

async function decoded(url) { const image = new Image(); image.src = url; await image.decode(); return image; }
async function contact(keys, title, options = {}) {
  const columns = options.columns || 4, cellW = options.cellW || 240, cellH = options.cellH || 260, header = 76;
  const image = canvas(columns * cellW, Math.ceil(keys.length / columns) * cellH + header), { ctx } = image;
  ctx.fillStyle = '#273d38'; ctx.font = '600 24px system-ui,sans-serif'; ctx.fillText(title, 22, 34);
  ctx.fillStyle = '#70746b'; ctx.font = '13px system-ui,sans-serif'; ctx.fillText(options.subtitle || 'Actual exported meshes · original fabric atlas · separate garment library', 22, 56);
  for (let i = 0; i < keys.length; i++) {
    const item = keys[i], cacheKey = typeof item === 'string' ? `${item}:high` : item.cacheKey || `${item.key}:${item.lod ? 'lod' : 'high'}`;
    const url = thumbnailCache.get(cacheKey); if (!url) fail(`Missing contact-sheet image ${cacheKey}`);
    ctx.drawImage(await decoded(url), (i % columns) * cellW, header + Math.floor(i / columns) * cellH, cellW, cellH);
  }
  const dataUrl = image.canvas.toDataURL('image/jpeg', .91); document.querySelector('#review').src = dataUrl;
  return { dataUrl, count: keys.length, width: image.canvas.width, height: image.canvas.height };
}

async function compareSizes(garmentID, state, options = {}) {
  specimen.clear();
  const meta = catalogue.garments.find((g) => g.id === garmentID); if (!meta) fail(`Unknown garment ${garmentID}`);
  state ||= meta.states.includes('hung') ? 'hung' : 'flat';
  const models = [];
  for (const size of ['small', 'big']) {
    const key = `garment_${garmentID}_${size}_${state}`, descriptor = entries.get(key)?.asset;
    if (!descriptor) fail(`Missing size comparison asset ${key}`);
    models.push(await garment(key, descriptor.defaultVariant || descriptor.variants[0], options.lod === true));
  }
  // Translation only. Both original root transforms and child scales survive;
  // using one fitted camera preserves the intended 0.70:0.90 size relationship.
  const gap = .10, offset = (models[0].size[0] + models[1].size[0]) / 4 + gap / 2;
  models[0].object.position.x = -offset; models[1].object.position.x = offset;
  for (const model of models) specimen.add(model.object);
  const direction = directionFor(state, meta), bounds = fitCamera(direction, 700, 360), pixels = renderAndMeasure(700, 360);
  const ratio = Math.max(...models[0].size) / Math.max(...models[1].size);
  if (Math.abs(ratio - 7 / 9) > .005) fail(`Wrong measured small/big ratio for ${garmentID}: ${ratio}`);
  const report = { garment: garmentID, state, lod: options.lod === true, sameWorldScale: true, measuredSmallBigRatio: round(ratio),
    sizes: models.map((model, i) => ({ sizeClass: ['small', 'big'][i], size: model.size.map(round), triangles: model.stats.triangles })), bounds, ...pixels };
  const lengths = models.map((m) => (Math.max(...m.size) * 100).toFixed(1));
  const dataUrl = captioned(meta.label || garmentID, `${states[state]} · SMALL (70%) left / BIG (90%) right · shared camera and physical scale`, `Longest side: ${lengths[0]} / ${lengths[1]} cm · measured ratio ${ratio.toFixed(4)}`, 700, 476);
  const cacheKey = `sizes:${garmentID}:${state}:${options.lod ? 'lod' : 'high'}`;
  thumbnailCache.set(cacheKey, dataUrl); return { dataUrl, report, cacheKey };
}

async function swatches() {
  const image = canvas(960, 672), { ctx } = image;
  ctx.fillStyle = '#273d38'; ctx.font = '600 24px system-ui,sans-serif'; ctx.fillText('Teen fabrics · sixteen original swatches', 22, 35);
  ctx.fillStyle = '#70746b'; ctx.font = '13px system-ui,sans-serif'; ctx.fillText('External 256 × 256 atlas · two-pixel tile inset · no embedded GLB images', 22, 58);
  for (const [id, variant] of Object.entries(palette.variants)) {
    const [column, row] = variant.tile, x = column * 240 + 20, y = row * 145 + 80;
    if (atlasTexture?.image) { ctx.imageSmoothingEnabled = false; ctx.drawImage(atlasTexture.image, column * 64 + 2, row * 64 + 2, 60, 60, x, y, 200, 100); }
    else { ctx.fillStyle = variant.color; ctx.fillRect(x, y, 200, 100); }
    ctx.fillStyle = '#384b43'; ctx.font = '11px ui-monospace,monospace'; ctx.fillText(id, x, y + 119);
    ctx.fillStyle = '#737b71'; ctx.font = '10px system-ui,sans-serif'; ctx.fillText(`${variant.pattern} · ${variant.color}`, x, y + 134);
  }
  const dataUrl = image.canvas.toDataURL('image/jpeg', .93); document.querySelector('#review').src = dataUrl;
  return { dataUrl, count: Object.keys(palette.variants).length, atlasLoaded: !!atlasTexture };
}

async function init() {
  manifest = await json(manifestURL); modelsBase = new URL('.', manifestURL);
  const paletteURL = new URL(manifest.palette, modelsBase);
  [palette, catalogue] = await Promise.all([json(paletteURL), json(new URL('../../tools/blender/garments_teen.catalog.json', location.href))]);
  entries = new Map();
  for (const set of manifest.files || []) for (const [key, asset] of Object.entries(set.assets || {})) {
    if (entries.has(key)) fail(`Duplicate manifest key ${key}`); entries.set(key, { asset, glb: set.glb });
  }
  if (!entries.size) fail('Teen garment manifest is empty');
  if (atlasEnabled) {
    atlasTexture = await new THREE.TextureLoader().loadAsync(new URL(palette.atlas.file, paletteURL).href);
    atlasTexture.colorSpace = THREE.SRGBColorSpace; atlasTexture.flipY = false;
    atlasTexture.minFilter = THREE.LinearMipmapLinearFilter; atlasTexture.magFilter = THREE.LinearFilter;
  }
  const listed = [...entries].map(([key, { asset }]) => ({ key, state: asset.state, garment: asset.garment, sizeClass: sizeClass(key, asset), variants: asset.variants }));
  document.querySelector('#status').textContent = `${listed.length} teen state assets ready.`;
  return { entries: listed, atlasLoaded: !!atlasTexture, material: palette.material, manifest: manifestURL.pathname, revision: THREE.REVISION };
}
window.__teenGarments = { capture, contact, compareSizes, swatches, loadedFiles: () => [...modelFiles.keys()], ready: null };
window.__teenGarments.ready = init().catch((error) => { document.querySelector('#error').textContent = error.stack; throw error; });
