// Real exported GLBs at one fixed orthographic world scale. No model auto-fitting.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MaterialLib } from '../../js/core/matlib.js';

const ROOT = new URL('../../', import.meta.url), MODELS = new URL('assets/models/', ROOT);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#gl'), antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene(), specimen = new THREE.Group(); scene.add(specimen);
scene.add(new THREE.HemisphereLight(0xf7fbff, 0xa99e86, 2.1));
const keyLight = new THREE.DirectionalLight(0xfff7e5, 2.1); keyLight.position.set(-2, 4, 5); scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xd8e9ff, 0.8); fillLight.position.set(3, 2, -3); scene.add(fillLight);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
const target = new THREE.WebGLRenderTarget(256, 128, { depthBuffer: true });
const pixels = new Uint8Array(256 * 128 * 4);
const library = new MaterialLib({ night: 0 }), loader = new GLTFLoader();
const files = new Map(), materials = new Map(), entries = new Map(), palettes = new Map(), atlases = new Map();
const WORLD_WIDTH = 3.90, RENDER_W = 1000, RENDER_H = 480;
const CELL_W = 1024, CELL_H = 620, COLUMNS = 3, HEADER = 150;
const X_POSITIONS = [-1.36, -0.47, 0.42, 1.31];
const LABELS = ['Adult tee', 'Child tee · 60%', 'Teen small · 70%', 'Teen big · 90%'];
let catalogue;
const fail = (message) => { throw new Error(message); };
const round = (n) => Math.round(n * 1e6) / 1e6;
const json = async (url) => { const r = await fetch(url); if (!r.ok) fail(`${r.status}: ${url}`); return r.json(); };

function variantMaterial(id, palettePath) {
  const cacheKey = `${palettePath}:${id}`;
  if (materials.has(cacheKey)) return materials.get(cacheKey);
  const palette = palettes.get(palettePath), variant = palette?.variants[id];
  if (!variant) fail(`Unknown variant ${cacheKey}`);
  const m = library.get('laundry').clone(); m.name = `laundry:${id}`;
  m.roughness = variant.roughness; m.vertexColors = true;
  const texture = atlases.get(palettePath).clone(), inset = 2 / palette.atlas.size[0];
  texture.flipY = false; texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1 / palette.atlas.grid[0] - 2 * inset, 1 / palette.atlas.grid[1] - 2 * inset);
  texture.offset.set(variant.tile[0] / palette.atlas.grid[0] + inset, variant.tile[1] / palette.atlas.grid[1] + inset);
  texture.needsUpdate = true; m.map = texture; m.color.set(0xffffff); m.needsUpdate = true;
  materials.set(cacheKey, m); return m;
}

async function garment(assetKey, variant, lod = false) {
  const entry = entries.get(assetKey); if (!entry) fail(`Unknown asset ${assetKey}`);
  if (!entry.asset.variants.includes(variant)) fail(`${assetKey}: invalid variant ${variant}`);
  const source = lod ? entry.asset.lod : { glb: entry.glb, node: entry.asset.node };
  if (!files.has(source.glb)) files.set(source.glb, loader.loadAsync(new URL(source.glb, MODELS).href));
  const original = (await files.get(source.glb)).scene.getObjectByName(source.node);
  if (!original) fail(`${source.glb}: missing node ${source.node}`);
  const object = original.clone(true); let triangles = 0, meshes = 0;
  object.traverse((part) => {
    if (!part.isMesh) return;
    const position = part.geometry.getAttribute('position');
    if (!position?.count) fail(`${assetKey}: no vertices`);
    // Teen buffers interleave packed UVs/colours; accessor methods skip their bytes.
    for (let i = 0; i < position.count; i++) if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) fail(`${assetKey}: non-finite vertex`);
    triangles += (part.geometry.index?.count ?? position.count) / 3; meshes++;
    part.material = variantMaterial(variant, entry.palette);
  });
  if (!meshes || triangles !== (lod ? entry.asset.lod.triangles : entry.asset.triangles)) fail(`${assetKey}: triangle count mismatch ${triangles}`);
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object), size = bounds.getSize(new THREE.Vector3()).toArray();
  return { object, asset: entry.asset, key: assetKey, variant, triangles, meshes, size: size.map(round), glb: source.glb, node: source.node };
}

function setCamera(state) {
  const halfHeight = WORLD_WIDTH * RENDER_H / RENDER_W / 2;
  camera.left = -WORLD_WIDTH / 2; camera.right = WORLD_WIDTH / 2; camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.up.set(0, 1, 0);
  if (state === 'hung') { camera.position.set(0, -0.55, 5); camera.lookAt(0, -0.55, 0); }
  else { camera.position.set(0, 4, 1.8); camera.lookAt(0, 0, 0); }
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}

function clipping(object) {
  let greatest = 0; const v = new THREE.Vector3();
  object.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(camera);
      greatest = Math.max(greatest, Math.abs(v.x), Math.abs(v.y));
      if (v.z < -1 || v.z > 1) fail(`${mesh.name}: outside camera depth`);
    }
  });
  if (greatest >= 0.985) fail(`${object.name}: clipped by common camera (${greatest})`);
  return round(greatest);
}

function measure(models) {
  const occupancy = [];
  for (const current of models) {
    for (const model of models) model.object.visible = model === current;
    renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 256, 128, pixels);
    let occupied = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 16) occupied++;
    if (occupied < 20) fail(`${current.key}: only ${occupied} visible pixels`);
    occupancy.push(occupied);
  }
  for (const model of models) model.object.visible = true;
  renderer.setRenderTarget(null); renderer.setSize(RENDER_W, RENDER_H, false); renderer.clear(); renderer.render(scene, camera);
  if (renderer.info.render.calls !== models.length) fail(`Expected ${models.length} actual garment draws, received ${renderer.info.render.calls}`);
  return { occupiedPixels: occupancy, renderedTriangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls };
}

function grid(ctx, x, y, state) {
  const pixelsPerMetre = RENDER_W / WORLD_WIDTH;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, RENDER_W, RENDER_H); ctx.clip(); ctx.strokeStyle = '#e7ece5'; ctx.lineWidth = 1;
  for (let d = -2; d <= 2; d += 0.1) {
    const px = x + RENDER_W / 2 + d * pixelsPerMetre;
    ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + RENDER_H); ctx.stroke();
    const py = y + RENDER_H / 2 + d * pixelsPerMetre;
    ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + RENDER_W, py); ctx.stroke();
  }
  ctx.restore();
  if (state === 'hung') {
    const py = y + RENDER_H / 2 - 0.55 * pixelsPerMetre;
    ctx.strokeStyle = '#a8bdb0'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(x + 10, py); ctx.lineTo(x + RENDER_W - 10, py); ctx.stroke(); ctx.setLineDash([]);
  }
}

async function contact(state = 'hung', lod = false) {
  if (!['hung', 'flat', 'folded'].includes(state)) fail(`Unknown state ${state}`);
  const list = catalogue.garments.filter((g) => g.states.includes(state));
  const canvas = document.createElement('canvas'); canvas.width = CELL_W * COLUMNS; canvas.height = HEADER + Math.ceil(list.length / COLUMNS) * CELL_H + 65;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f6f7f1'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#25483d'; ctx.font = '600 40px system-ui,sans-serif'; ctx.fillText(`LA LADERA / Teen clothes · ${state}${lod ? ' · LOD' : ''}`, 32, 53);
  ctx.fillStyle = '#58736a'; ctx.font = '24px system-ui,sans-serif';
  ctx.fillText(`${list.length} styles in both sizes · adult and child tee references in every card · actual exported meshes and fabric tiles`, 34, 92);
  ctx.font = '20px ui-monospace,monospace';
  ctx.fillText(`Fixed ${WORLD_WIDTH.toFixed(2)} m camera width. All selected roots at scale 1.000. Grid = 10 cm${state === 'hung' ? ' world X/Y.' : ' in projected view.'} No independently resized thumbnails.`, 34, 125);
  setCamera(state); const reports = [];
  for (let index = 0; index < list.length; index++) {
    const g = list[index];
    const models = await Promise.all([
      garment(`garment_tshirt_${state}`, 'plain_cream'), garment(`garment_child_tshirt_${state}`, 'plain_teal'),
      garment(`garment_teen_${g.id}_small_${state}`, g.defaultVariant, lod), garment(`garment_teen_${g.id}_big_${state}`, g.defaultVariant, lod),
    ]);
    specimen.clear(); models.forEach((model, i) => { model.object.position.x = X_POSITIONS[i]; specimen.add(model.object); }); specimen.updateMatrixWorld(true);
    const extents = models.map((m) => clipping(m.object)), visibility = measure(models);
    const x = (index % COLUMNS) * CELL_W, y = HEADER + Math.floor(index / COLUMNS) * CELL_H;
    ctx.strokeStyle = '#d4dfd5'; ctx.strokeRect(x + 4, y + 4, CELL_W - 8, CELL_H - 8);
    ctx.fillStyle = '#29483d'; ctx.font = '600 23px system-ui,sans-serif'; ctx.fillText(`${String(index + 1).padStart(2, '0')}  ${g.label}`, x + 16, y + 34, CELL_W - 32);
    grid(ctx, x + 12, y + 46, state); ctx.drawImage(renderer.domElement, x + 12, y + 46);
    ctx.textAlign = 'center'; ctx.fillStyle = '#38584a'; ctx.font = '18px system-ui,sans-serif';
    for (let i = 0; i < models.length; i++) ctx.fillText(LABELS[i], x + 12 + RENDER_W / 2 + X_POSITIONS[i] * RENDER_W / WORLD_WIDTH, y + 549);
    ctx.textAlign = 'left'; ctx.font = '17px ui-monospace,monospace';
    const lengths = models.slice(2).map((m) => (m.size[state === 'hung' ? 1 : 2] * 100).toFixed(1));
    ctx.fillText(`Small / big: ${lengths.join(' / ')} cm ${state === 'hung' ? 'drop' : 'depth'} · ${models[2].triangles} triangles each`, x + 17, y + 577);
    ctx.fillStyle = '#667b6f'; ctx.font = '16px ui-monospace,monospace'; ctx.fillText(`${g.id} / ${g.defaultVariant}`, x + 17, y + 601);
    reports.push({ styleId: g.id, state, lod, variant: g.defaultVariant, ...visibility, models: models.map((m, i) => ({ key: m.key, glb: m.glb, node: m.node, triangles: m.triangles, size: m.size, rootScale: m.object.scale.toArray(), translation: m.object.position.toArray(), cameraExtent: extents[i], occupiedPixels: visibility.occupiedPixels[i] })) });
  }
  const footer = canvas.height - 28; ctx.fillStyle = '#456357'; ctx.font = '21px system-ui,sans-serif';
  ctx.fillText('Original empty garment objects · teen small ≈ ages 12–15 / big ≈ ages 16–19 · preview only; no renderer placements', 32, footer);
  const barX = canvas.width - 270, barWidth = 0.2 * RENDER_W / WORLD_WIDTH;
  ctx.strokeStyle = '#456357'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(barX, footer - 7); ctx.lineTo(barX + barWidth, footer - 7); ctx.stroke();
  ctx.font = '18px ui-monospace,monospace'; ctx.fillText('20 cm', barX + barWidth + 12, footer - 2);
  const dataUrl = canvas.toDataURL('image/webp', 0.60); document.querySelector('#review').src = dataUrl;
  return { dataUrl, report: { state, lod, count: list.length, teenObjects: list.length * 2, width: canvas.width, height: canvas.height, worldWidth: WORLD_WIDTH, worldHeight: WORLD_WIDTH * RENDER_H / RENDER_W, imageWidth: RENDER_W, imageHeight: RENDER_H, items: reports } };
}

async function init() {
  const [adult, child, teen, cat] = await Promise.all([
    json(new URL('manifest.garments.json', MODELS)), json(new URL('manifest.garments-child.json', MODELS)),
    json(new URL('manifest.garments-teen.json', MODELS)), json(new URL('tools/blender/garments_teen.catalog.json', ROOT)),
  ]);
  catalogue = cat;
  for (const manifest of [adult, child, teen]) {
    if (!palettes.has(manifest.palette)) {
      const palette = await json(new URL(manifest.palette, MODELS)); palettes.set(manifest.palette, palette);
      const atlas = await new THREE.TextureLoader().loadAsync(new URL(manifest.atlas.file, MODELS).href);
      atlas.colorSpace = THREE.SRGBColorSpace; atlas.flipY = false; atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.magFilter = THREE.LinearFilter; atlases.set(manifest.palette, atlas);
    }
    for (const pack of manifest.files) for (const [assetKey, asset] of Object.entries(pack.assets)) {
      if (entries.has(assetKey)) fail(`Duplicate asset ${assetKey}`); entries.set(assetKey, { asset, glb: pack.glb, palette: manifest.palette });
    }
  }
  document.querySelector('#status').textContent = `${catalogue.garments.length} teen styles in two sizes ready. Fixed camera; no auto-fit or model rescaling.`;
  return { revision: THREE.REVISION, count: catalogue.garments.length, states: Object.fromEntries(['hung', 'flat', 'folded'].map((state) => [state, catalogue.garments.filter((g) => g.states.includes(state)).length])), atlases: [...atlases].map(([path, atlas]) => ({ palette: path, width: atlas.image.width, height: atlas.image.height })) };
}
window.__teenGarments = { contact, loadedFiles: () => [...files.keys()], ready: null };
window.__teenGarments.ready = init().catch((error) => { document.querySelector('#error').textContent = error.stack; throw error; });
