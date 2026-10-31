// Developer-only visual QA. Actual GLBs + the real material library; no game placement or loader changes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MaterialLib } from '../../js/core/matlib.js';

const query = new URLSearchParams(location.search);
const manifestURL = new URL(query.get('manifest') || '../../assets/models/manifest.garments.json', location.href);
const atlasEnabled = query.get('atlas') !== '0';
const library = new MaterialLib({ night: 0 });
const loader = new GLTFLoader();
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#gl'), antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xf8fbff, 0xa99578, 2.5));
const keyLight = new THREE.DirectionalLight(0xfff8e9, 2.5); keyLight.position.set(-2.5, 5, 4); scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xdbeaff, 1.2); fillLight.position.set(4, 2, -2); scene.add(fillLight);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.005, 100);
const specimen = new THREE.Group(); scene.add(specimen);
const occupancyTarget = new THREE.WebGLRenderTarget(128, 128, { depthBuffer: true });
const occupancyPixels = new Uint8Array(128 * 128 * 4);
const modelFiles = new Map(), thumbnailCache = new Map(), materialCache = new Map();
const fixtureMaterials = new Map();
let manifest, palette, assortments, catalogue, atlasTexture, entries, modelsBase;

const states = { folded: 'DOBLADA · FOLDED', hung: 'COLGADA · HUNG', flat: 'EXTENDIDA · LAID FLAT' };
const fail = (message) => { throw new Error(message); };
const json = async (url) => { const response = await fetch(url); if (!response.ok) fail(`Missing data: ${response.status} ${url}`); return response.json(); };
const round = (n) => Math.round(n * 1e5) / 1e5;
const clear = () => { specimen.clear(); };

function variantMaterial(id) {
  if (materialCache.has(id)) return materialCache.get(id);
  const variant = palette.variants[id];
  if (!variant) fail(`Unknown palette variant ${id}`);
  const material = library.get(palette.material).clone();
  material.name = `${palette.material}:${id}`;
  material.roughness = variant.roughness;
  material.vertexColors = true;
  if (atlasTexture) {
    const map = atlasTexture.clone();
    // glTF UVs use the image's top-left convention with flipY=false. Tile rows are counted from the image top.
    const [col, row] = variant.tile, inset = 2 / palette.atlas.size[0];
    map.flipY = false;
    map.repeat.set(1 / palette.atlas.grid[0] - 2 * inset, 1 / palette.atlas.grid[1] - 2 * inset);
    map.offset.set(col / palette.atlas.grid[0] + inset, row / palette.atlas.grid[1] + inset);
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.needsUpdate = true;
    material.map = map; material.color.set(0xffffff);
  } else material.color.set(variant.color);
  material.needsUpdate = true;
  materialCache.set(id, material);
  return material;
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
    for (let i = 0; i < position.array.length; i++) if (!Number.isFinite(position.array[i])) fail(`Non-finite position in ${object.name}`);
    triangles += (object.geometry.index?.count ?? position.count) / 3; meshes++;
  });
  return { triangles, meshes };
}

async function garment(key, variantID, lod = false) {
  const entry = entries.get(key);
  if (!entry) fail(`Unknown asset ${key}`);
  const descriptor = entry.asset;
  if (!descriptor.variants.includes(variantID)) fail(`${key} does not allow ${variantID}`);
  const source = lod ? descriptor.lod : { glb: entry.glb, node: descriptor.node };
  if (!source?.glb || !source?.node) fail(`Missing ${lod ? 'LOD' : 'high-detail'} reference for ${key}`);
  const gltf = await file(source.glb), original = gltf.scene.getObjectByName(source.node);
  if (!original) fail(`No node ${source.node} in ${source.glb}`);
  const object = original.clone(true);
  object.traverse((part) => { if (part.isMesh) { part.material = variantMaterial(variantID); part.userData.garmentAsset = key; part.frustumCulled = true; } });
  object.updateMatrixWorld(true);
  const stats = nodeStats(object);
  if (stats.meshes === 0 || stats.triangles === 0) fail(`No geometry for ${key}`);
  const expected = lod ? descriptor.lod.triangles : descriptor.triangles;
  if (Number.isFinite(expected) && stats.triangles !== expected) fail(`Triangle mismatch ${key}: ${stats.triangles} vs ${expected}`);
  object.userData.assetKey = key;
  object.userData.variantID = variantID;
  object.userData.lod = lod;
  return { object, descriptor, stats, glb: source.glb, node: source.node };
}

function fitCamera(direction, width, height, padding = 1.18) {
  specimen.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(specimen);
  if (bounds.isEmpty()) fail('Cannot frame empty geometry');
  const centre = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const distance = Math.max(size.length() * 3, 2);
  camera.position.copy(centre).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));
  camera.up.set(0, 1, 0); camera.lookAt(centre); camera.updateMatrixWorld(true);
  let xMax = 0, yMax = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    xMax = Math.max(xMax, Math.abs(p.x)); yMax = Math.max(yMax, Math.abs(p.y));
  }
  const aspect = width / height, halfHeight = Math.max(yMax, xMax / aspect, 0.015) * padding;
  camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
  camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.near = 0.005; camera.far = distance + size.length() * 3 + 10; camera.updateProjectionMatrix();
  return { min: bounds.min.toArray().map(round), max: bounds.max.toArray().map(round) };
}

function renderAndMeasure(width, height) {
  renderer.setSize(width, height, false);
  renderer.setRenderTarget(occupancyTarget); renderer.clear(); renderer.render(scene, camera);
  renderer.readRenderTargetPixels(occupancyTarget, 0, 0, 128, 128, occupancyPixels);
  let opaquePixels = 0;
  for (let i = 3; i < occupancyPixels.length; i += 4) if (occupancyPixels[i] > 16) opaquePixels++;
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera);
  const occupancy = opaquePixels / (128 * 128);
  if (occupancy < 0.008) fail(`Rendered object is absent or subpixel: occupancy ${occupancy}`);
  if (renderer.info.render.calls === 0 || renderer.info.render.triangles === 0) fail('Renderer issued no geometry');
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let visibleMeshes = 0;
  specimen.traverse((object) => { if (object.isMesh && object.visible && frustum.intersectsObject(object)) visibleMeshes++; });
  if (visibleMeshes === 0) fail('No meshes intersect the review camera');
  return { occupancy: round(occupancy), opaquePixels, visibleMeshes, calls: renderer.info.render.calls, renderedTriangles: renderer.info.render.triangles };
}

function imageCanvas(width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f6f3ec'; ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

function captioned(title, subtitle, footer, width, height, options = {}) {
  const { canvas, ctx } = imageCanvas(width, height);
  ctx.fillStyle = '#273d38'; ctx.font = `600 ${width > 600 ? 23 : 19}px system-ui,sans-serif`; ctx.fillText(title, 22, 30);
  ctx.fillStyle = '#70746b'; ctx.font = `${width > 600 ? 13 : 11}px system-ui,sans-serif`; ctx.fillText(subtitle, 22, 50);
  const imageTop = 64, footerHeight = options.footerHeight ?? 46;
  ctx.drawImage(renderer.domElement, 0, imageTop, width, height - imageTop - footerHeight);
  ctx.strokeStyle = '#d8d7cb'; ctx.beginPath(); ctx.moveTo(22, height - footerHeight); ctx.lineTo(width - 22, height - footerHeight); ctx.stroke();
  ctx.fillStyle = '#59635c'; ctx.font = `${width > 600 ? 12 : 10}px ui-monospace,monospace`; ctx.fillText(footer, 22, height - 25);
  ctx.fillStyle = '#788078'; ctx.font = '10px system-ui,sans-serif'; ctx.fillText('LA LADERA · ADULT GARMENT OBJECTS · ACTUAL GLB RENDER', 22, height - 9);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  document.querySelector('#review').src = dataUrl;
  return dataUrl;
}

function preferredVariant(key, descriptor) {
  const list = descriptor.variants;
  if (key.includes('tshirt')) return list.includes('stripe_navy') ? 'stripe_navy' : list[0];
  if (key.includes('knickers') || key.includes('nightdress')) return list.includes('floral_cream') ? 'floral_cream' : list[0];
  return list[0];
}

function silhouetteChecks(object, garmentID, state) {
  // A filled crotch notch can still produce a nonempty, well-framed render. Check this genuine empty-space invariant separately.
  if (!['shorts', 'swim_trunks', 'boxers', 'leggings', 'tights'].includes(garmentID) || state === 'folded') return [];
  const bounds = new THREE.Box3().setFromObject(object), size = bounds.getSize(new THREE.Vector3());
  const centreX = (bounds.min.x + bounds.max.x) / 2;
  const start = state === 'hung'
    ? new THREE.Vector3(centreX, bounds.min.y + size.y * 0.15, bounds.max.z + 0.10)
    : new THREE.Vector3(centreX, bounds.max.y + 0.10, bounds.max.z - size.z * 0.15);
  const direction = state === 'hung' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, -1, 0);
  const ray = new THREE.Raycaster(start, direction, 0, size.length() + 1);
  const hits = ray.intersectObject(object, true);
  return [{ name: 'open-space-between-legs', pass: hits.length === 0, rayOrigin: start.toArray().map(round), hits: hits.length }];
}

async function capture(key, options = {}) {
  clear();
  const descriptor = entries.get(key)?.asset;
  if (!descriptor) fail(`Unknown capture key ${key}`);
  const variant = options.variant || preferredVariant(key, descriptor), lod = options.lod === true, view = options.view === 'back' ? 'back' : 'front';
  const model = await garment(key, variant, lod); specimen.add(model.object);
  const state = descriptor.state || key.match(/_(folded|hung|flat)$/)?.[1];
  const garmentID = descriptor.garment || key.replace(/^garment_/, '').replace(/_(folded|hung|flat)$/, '');
  const meta = catalogue.garments.find((g) => g.id === garmentID);
  const geometryChecks = silhouetteChecks(model.object, garmentID, state);
  const direction = state === 'hung' ? [0.18, 0.06, 1] : meta?.category === 'hat' ? [0.5, 1.0, 1] : state === 'flat' ? [0.06, 1.5, 0.45] : [0.35, 1.2, 0.8];
  if (view === 'back') direction[2] *= -1;
  const bounds = fitCamera(direction, 480, 410);
  const pixels = renderAndMeasure(480, 410);
  const report = { key, garment: garmentID, state, lod, view, variant, glb: model.glb, node: model.node, bounds, geometryChecks, ...model.stats, ...pixels };
  const dataUrl = captioned(meta?.labelEs || garmentID, `${states[state]} · ${palette.variants[variant].label}${lod ? ' · LOD' : ''}${view === 'back' ? ' · BACK' : ''}`, `${key} · ${model.stats.triangles} tri`, 480, 520);
  thumbnailCache.set(`${key}:${lod ? 'lod' : 'high'}${view === 'back' ? ':back' : ''}`, dataUrl);
  document.querySelector('#status').textContent = JSON.stringify(report, null, 2);
  return { dataUrl, report };
}

async function decoded(url) { const image = new Image(); image.src = url; await image.decode(); return image; }

async function contact(keys, title, options = {}) {
  const columns = options.columns || 4, cellW = 240, cellH = 260, header = 75;
  const { canvas, ctx } = imageCanvas(columns * cellW, Math.ceil(keys.length / columns) * cellH + header);
  ctx.fillStyle = '#273d38'; ctx.font = '600 24px system-ui,sans-serif'; ctx.fillText(title, 22, 34);
  ctx.fillStyle = '#70746b'; ctx.font = '13px system-ui,sans-serif'; ctx.fillText('Actual exported meshes · adult objects · no game placement', 22, 56);
  for (let i = 0; i < keys.length; i++) {
    const cacheKey = typeof keys[i] === 'string' ? `${keys[i]}:high` : `${keys[i].key}:${keys[i].lod ? 'lod' : 'high'}${keys[i].view === 'back' ? ':back' : ''}`;
    const url = thumbnailCache.get(cacheKey); if (!url) fail(`Missing contact-sheet image ${cacheKey}`);
    ctx.drawImage(await decoded(url), (i % columns) * cellW, header + Math.floor(i / columns) * cellH, cellW, cellH);
  }
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92); document.querySelector('#review').src = dataUrl;
  return { dataUrl, count: keys.length, width: canvas.width, height: canvas.height };
}

function fixtureMaterial(name) {
  if (!fixtureMaterials.has(name)) {
    // These review primitives have no COLOR_0 attribute. Garment GLBs retain the real library's vertex-colour behaviour.
    const material = library.get(name).clone(); material.vertexColors = false; material.needsUpdate = true;
    fixtureMaterials.set(name, material);
  }
  return fixtureMaterials.get(name);
}

function box(material, x, y, z, w, h, d) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fixtureMaterial(material)); mesh.position.set(x, y, z); specimen.add(mesh); return mesh;
}

function rod(material, a, b, radius = 0.008) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), axis = to.clone().sub(from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, axis.length(), 8), fixtureMaterial(material));
  mesh.position.copy(from).add(to).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()); specimen.add(mesh); return mesh;
}

async function placeStock(item, x, y, z, rotation = 0, lod = false) {
  const model = await garment(item.asset, item.variant, lod), object = model.object;
  object.rotation.y = rotation; object.position.set(x, y, z); specimen.add(object); object.updateMatrixWorld(true);
  return { key: item.asset, variant: item.variant, triangles: model.stats.triangles, count: 1, object };
}

function hanger(x, y, z, rotation) {
  const transform = (px, py) => [x + Math.cos(rotation) * px, y + py, z - Math.sin(rotation) * px];
  rod('metal_dark', transform(0, 0.04), transform(-0.20, -0.07), 0.004);
  rod('metal_dark', transform(-0.20, -0.07), transform(0.20, -0.07), 0.004);
  rod('metal_dark', transform(0.20, -0.07), transform(0, 0.04), 0.004);
  const points = Array.from({ length: 9 }, (_, i) => { const angle = -Math.PI * 0.3 + i * Math.PI * 1.5 / 8; return transform(0.036 * Math.cos(angle), 0.085 + 0.036 * Math.sin(angle)); });
  for (let i = 1; i < points.length; i++) rod('metal_dark', points[i - 1], points[i], 0.0035);
}

async function fixture(kind) {
  clear();
  const ids = { drawer: 'drawer_daily_tops', wardrobe: 'wardrobe_daily', washing_line: 'washing_line_daily', shop_shelf: 'shop_folded_basics' };
  const recipe = assortments.bindings.find((b) => b.id === ids[kind]);
  if (!recipe) fail(`Missing fixture recipe ${kind}`);
  const instances = [];
  if (kind === 'drawer') {
    const w = 1.18, d = 0.47;
    box('wood_pine', 0, 0.012, 0, w, 0.024, d);
    box('wood_dark', 0, 0.09, d / 2, w + 0.05, 0.18, 0.04);
    box('wood_pine', 0, 0.075, -d / 2, w, 0.15, 0.025);
    for (const sign of [-1, 1]) box('wood_pine', sign * w / 2, 0.075, 0, 0.025, 0.15, d);
    rod('metal_dark', [-0.08, 0.10, d / 2 + 0.04], [0.08, 0.10, d / 2 + 0.04], 0.009);
    // Two ordinary mixed stacks use the real folded footprints. Distributing one stack per garment type would overfill this drawer.
    const columns = [{ items: [], width: 0, height: 0 }, { items: [], width: 0, height: 0 }];
    for (const item of recipe.items) {
      const size = entries.get(item.asset).asset.size;
      if (size[2] > d - 0.04) fail(`Drawer garment too deep ${item.asset}`);
      for (let n = 0; n < item.count; n++) {
        const column = columns[0].height <= columns[1].height ? columns[0] : columns[1];
        column.items.push({ item, y: column.height });
        column.width = Math.max(column.width, size[0]); column.height += size[1] + 0.003;
      }
    }
    const needed = columns.reduce((sum, column) => sum + column.width, 0) + 0.035;
    if (needed > w - 0.04) fail(`Drawer stock width ${needed} exceeds preview tray ${w - 0.04}`);
    let left = -needed / 2;
    for (const column of columns) {
      if (column.height + 0.026 > 0.17) fail(`Drawer stock stack ${column.height} exceeds the drawer wall`);
      for (const stock of column.items) instances.push(await placeStock(stock.item, left + column.width / 2, 0.026 + stock.y, 0));
      left += column.width + 0.035;
    }
  } else if (kind === 'wardrobe') {
    const w = 1.95, h = 2.1, d = 1.00;
    box('wood_dark', 0, h / 2, -d / 2, w, h, 0.04);
    for (const sign of [-1, 1]) box('wood_pine', sign * w / 2, h / 2, 0, 0.05, h, d);
    for (const y of [0.025, 0.21, h]) box('wood_pine', 0, y, 0, w, 0.05, d);
    rod('metal_steel', [-w / 2 + 0.05, 1.86, 0], [w / 2 - 0.05, 1.86, 0], 0.016);
    const rotation = Math.PI * 0.38;
    for (let i = 0; i < recipe.items.length; i++) {
      const item = recipe.items[i], x = (i - (recipe.items.length - 1) / 2) * 0.34;
      instances.push(await placeStock(item, x, 1.75, 0, rotation)); hanger(x, 1.75, 0, rotation);
    }
  } else if (kind === 'washing_line') {
    const widths = recipe.items.map((item) => entries.get(item.asset).asset.size[0]), total = widths.reduce((a, b) => a + b, 0) + 0.18 * (widths.length - 1);
    const half = total / 2 + 0.22;
    for (const sign of [-1, 1]) { rod('wood_old', [sign * half, 0, 0], [sign * half, 2.05, 0], 0.038); box('floor_cement', sign * half, 0.06, 0, 0.20, 0.12, 0.24); }
    const sag = (x) => 1.91 - 0.10 * (1 - (x / half) ** 2);
    const segments = 20;
    for (let i = 0; i < segments; i++) { const x0 = -half + 2 * half * i / segments, x1 = -half + 2 * half * (i + 1) / segments; rod('wire_dark', [x0, sag(x0), 0], [x1, sag(x1), 0], 0.004); }
    let left = -total / 2;
    for (let i = 0; i < recipe.items.length; i++) {
      const item = recipe.items[i], x = left + widths[i] / 2, y = sag(x) - 0.018;
      instances.push(await placeStock(item, x, y, 0));
      const offsets = item.asset.includes('sock_single') ? [0] : [-widths[i] * 0.21, widths[i] * 0.21];
      for (const dx of offsets) box('wood_pine', x + dx, y + 0.012, 0.015, 0.016, 0.055, 0.023);
      left += widths[i] + 0.18;
    }
  } else if (kind === 'shop_shelf') {
    const w = 1.34, d = 0.49, h = 1.82;
    for (const sign of [-1, 1]) box('wood_pine', sign * w / 2, h / 2, 0, 0.04, h, d);
    box('wood_dark', 0, h / 2, -d / 2, w, h, 0.025);
    const shelfHeights = [0.18, 0.70, 1.22];
    for (const y of [...shelfHeights, 1.75]) box('wood_pine', 0, y, 0, w, 0.035, d);
    for (let i = 0; i < recipe.items.length; i++) {
      const item = recipe.items[i], size = entries.get(item.asset).asset.size, tier = Math.floor(i / 2), x = i % 2 === 0 ? -0.32 : 0.32;
      if (size[0] > 0.60 || size[2] > d - 0.035) fail(`Shop shelf garment does not fit: ${item.asset}`);
      for (let n = 0; n < item.count; n++) instances.push(await placeStock(item, x, shelfHeights[tier] + 0.02 + n * (size[1] + 0.003), 0.01));
    }
  } else fail(`Unknown fixture ${kind}`);
  const direction = kind === 'drawer' ? [0.35, 1.25, 1] : kind === 'washing_line' ? [0.20, 0.12, 1] : [0.45, 0.38, 1];
  const bounds = fitCamera(direction, 1000, 610, 1.13), pixels = renderAndMeasure(1000, 610);
  const expected = recipe.items.reduce((sum, item) => sum + item.count, 0);
  if (instances.length !== expected) fail(`Fixture ${kind} placed ${instances.length} of ${expected} recipe items`);
  const report = { kind, recipe: recipe.id, previewOnly: true, bounds, garmentInstances: instances.length, garmentTriangles: instances.reduce((sum, item) => sum + item.triangles, 0), items: instances.map(({ object, ...item }) => item), ...pixels };
  const title = { drawer: 'Cajón abierto · Open drawer', wardrobe: 'Armario · Wardrobe', washing_line: 'Tendedero · Washing line', shop_shelf: 'Estante de ropa · Shop shelf' }[kind];
  const dataUrl = captioned(title, 'PREVIEW ASSEMBLY · actual garment GLBs + procedural review furniture · not world integration', `${recipe.id} · ${report.garmentInstances} garments · ${report.garmentTriangles} garment triangles`, 1000, 720);
  document.querySelector('#status').textContent = JSON.stringify(report, null, 2);
  return { dataUrl, report };
}

async function swatches() {
  const { canvas, ctx } = imageCanvas(960, 660);
  ctx.fillStyle = '#273d38'; ctx.font = '600 24px system-ui,sans-serif'; ctx.fillText('Colour and print variants', 22, 35);
  ctx.fillStyle = '#70746b'; ctx.font = '13px system-ui,sans-serif'; ctx.fillText('Original 256 × 256 atlas · no embedded GLB images · plain material-tint fallback', 22, 59);
  const image = atlasTexture?.image;
  for (const [id, variant] of Object.entries(palette.variants)) {
    const [column, row] = variant.tile, x = column * 240 + 20, y = row * 145 + 80;
    if (image) { ctx.imageSmoothingEnabled = false; ctx.drawImage(image, column * 64 + 2, row * 64 + 2, 60, 60, x, y, 200, 100); }
    else { ctx.fillStyle = variant.color; ctx.fillRect(x, y, 200, 100); }
    ctx.fillStyle = '#384b43'; ctx.font = '11px ui-monospace,monospace'; ctx.fillText(id, x, y + 119);
    ctx.fillStyle = '#737b71'; ctx.font = '10px system-ui,sans-serif'; ctx.fillText(`${variant.pattern} · ${variant.color}`, x, y + 134);
  }
  const dataUrl = canvas.toDataURL('image/jpeg', 0.94); document.querySelector('#review').src = dataUrl;
  return { dataUrl, count: Object.keys(palette.variants).length, atlasLoaded: !!image };
}

async function init() {
  manifest = await json(manifestURL); modelsBase = new URL('.', manifestURL);
  const paletteRef = typeof manifest.palette === 'string' ? manifest.palette : manifest.palette?.file || 'garments/palette.json';
  const paletteURL = new URL(paletteRef, modelsBase);
  [palette, assortments, catalogue] = await Promise.all([
    json(paletteURL), json(new URL('garments/assortments.json', modelsBase)), json(new URL('../../tools/blender/garments.catalog.json', modelsBase)),
  ]);
  if (!catalogue.adultOnly || !assortments.adultOnly) fail('Review must be explicitly adult-only');
  entries = new Map();
  for (const set of manifest.files || []) for (const [key, asset] of Object.entries(set.assets || {})) {
    if (entries.has(key)) fail(`Duplicate manifest key ${key}`); entries.set(key, { asset, glb: set.glb });
  }
  if (!entries.size) fail('Garment manifest is empty');
  if (atlasEnabled) {
    atlasTexture = await new THREE.TextureLoader().loadAsync(new URL(palette.atlas.file, paletteURL).href);
    atlasTexture.colorSpace = THREE.SRGBColorSpace; atlasTexture.flipY = false;
    atlasTexture.minFilter = THREE.LinearMipmapLinearFilter; atlasTexture.magFilter = THREE.LinearFilter;
  }
  const listed = [...entries].map(([key, { asset }]) => ({ key, state: asset.state || key.match(/_(folded|hung|flat)$/)?.[1], garment: asset.garment || key.replace(/^garment_/, '').replace(/_(folded|hung|flat)$/, ''), variants: asset.variants }));
  document.querySelector('#status').textContent = `${listed.length} state assets ready. Renderer: ${renderer.capabilities.isWebGL2 ? 'WebGL 2' : 'WebGL'}.`;
  return { entries: listed, atlasLoaded: !!atlasTexture, material: palette.material, manifest: manifestURL.pathname, revision: THREE.REVISION };
}

window.__garments = { capture, contact, fixture, swatches, loadedFiles: () => [...modelFiles.keys()], ready: null };
window.__garments.ready = init().catch((error) => { document.querySelector('#error').textContent = error.stack; throw error; });
