// Actual GLB evidence: translation only, fixed orthographic scale, real laundry material and shared print atlas.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MaterialLib } from '../../js/core/matlib.js';

const ROOT = new URL('../../', import.meta.url), MODELS = new URL('assets/models/', ROOT);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#gl'), antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene(), specimen = new THREE.Group(); scene.add(specimen);
scene.add(new THREE.HemisphereLight(0xf7fbff, 0xa99e86, 2.1));
const key = new THREE.DirectionalLight(0xfff7e5, 2.1); key.position.set(-2, 4, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xd8e9ff, 0.8); fill.position.set(3, 2, -3); scene.add(fill);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
const occupancyTarget = new THREE.WebGLRenderTarget(128, 128, { depthBuffer: true });
const pixels = new Uint8Array(128 * 128 * 4);
const library = new MaterialLib({ night: 0 }), loader = new GLTFLoader();
const files = new Map(), materials = new Map(), entries = new Map();
const WORLD_WIDTH = 1.92, RENDER_W = 540, RENDER_H = 360;
const CELL_W = 560, CELL_H = 460, COLUMNS = 5, HEADER = 144;
let palette, catalogue, atlas;
const fail = (message) => { throw new Error(message); };
const round = (n) => Math.round(n * 1e6) / 1e6;
const json = async (url) => { const r = await fetch(url); if (!r.ok) fail(`${r.status}: ${url}`); return r.json(); };

function variantMaterial(id, reference = false) {
  const cacheKey = `${id}:${reference}`;
  if (materials.has(cacheKey)) return materials.get(cacheKey);
  const v = palette.variants[id]; if (!v) fail(`Unknown variant ${id}`);
  const m = library.get('laundry').clone();
  m.name = `laundry:${id}${reference ? ':reference' : ''}`; m.roughness = v.roughness; m.vertexColors = true;
  const texture = atlas.clone(), inset = 2 / palette.atlas.size[0];
  texture.flipY = false; texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1 / palette.atlas.grid[0] - 2 * inset, 1 / palette.atlas.grid[1] - 2 * inset);
  texture.offset.set(v.tile[0] / palette.atlas.grid[0] + inset, v.tile[1] / palette.atlas.grid[1] + inset);
  texture.needsUpdate = true; m.map = texture; m.color.set(0xffffff);
  if (reference) { m.transparent = true; m.opacity = 0.43; m.depthWrite = false; }
  m.needsUpdate = true; materials.set(cacheKey, m); return m;
}

async function garment(assetKey, variant, lod = false, reference = false) {
  const e = entries.get(assetKey); if (!e) fail(`Unknown asset ${assetKey}`);
  if (!e.asset.variants.includes(variant)) fail(`${assetKey}: invalid variant ${variant}`);
  const source = lod ? e.asset.lod : { glb: e.glb, node: e.asset.node };
  if (!files.has(source.glb)) files.set(source.glb, loader.loadAsync(new URL(source.glb, MODELS).href));
  const sourceScene = (await files.get(source.glb)).scene, original = sourceScene.getObjectByName(source.node);
  if (!original) fail(`${source.glb}: missing node ${source.node}`);
  const object = original.clone(true); let triangles = 0, meshes = 0;
  object.traverse((part) => {
    if (!part.isMesh) return;
    const p = part.geometry.getAttribute('position'); if (!p?.count) fail(`${assetKey}: no vertices`);
    for (const value of p.array) if (!Number.isFinite(value)) fail(`${assetKey}: non-finite vertex`);
    triangles += (part.geometry.index?.count ?? p.count) / 3; meshes++;
    part.material = variantMaterial(variant, reference);
  });
  if (!meshes || triangles !== (lod ? e.asset.lod.triangles : e.asset.triangles)) fail(`${assetKey}: triangle count mismatch ${triangles}`);
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object), size = bounds.getSize(new THREE.Vector3()).toArray();
  return { object, asset: e.asset, key: assetKey, variant, triangles, meshes, size: size.map(round), glb: source.glb, node: source.node };
}

function setCamera(state) {
  const halfHeight = WORLD_WIDTH * RENDER_H / RENDER_W / 2;
  camera.left = -WORLD_WIDTH / 2; camera.right = WORLD_WIDTH / 2; camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.up.set(0, 1, 0);
  if (state === 'hung') { camera.position.set(0, -0.34, 5); camera.lookAt(0, -0.34, 0); }
  else { camera.position.set(0, 4, 1.8); camera.lookAt(0, 0, 0); }
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}

function clipping(object) {
  let greatest = 0; const v = new THREE.Vector3();
  object.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).project(camera);
      greatest = Math.max(greatest, Math.abs(v.x), Math.abs(v.y));
      if (v.z < -1 || v.z > 1) fail(`${mesh.name}: outside camera depth`);
    }
  });
  if (greatest >= 0.985) fail(`${object.name}: clipped by common camera (${greatest})`);
  return round(greatest);
}

function measure(child, adult) {
  adult.visible = false;
  renderer.setRenderTarget(occupancyTarget); renderer.clear(); renderer.render(scene, camera);
  renderer.readRenderTargetPixels(occupancyTarget, 0, 0, 128, 128, pixels);
  let occupied = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 16) occupied++;
  adult.visible = true; renderer.setRenderTarget(null);
  if (occupied < 20) fail(`${child.name}: child has only ${occupied} visible pixels`);
  renderer.setSize(RENDER_W, RENDER_H, false); renderer.clear(); renderer.render(scene, camera);
  if (!renderer.info.render.calls) fail('No actual geometry rendered');
  return { occupiedPixels: occupied, occupancy: round(occupied / (128 * 128)), renderedTriangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls };
}

const preferred = {
  child_school_shirt: 'plain_cream', child_school_polo: 'plain_navy', child_pinafore: 'plain_navy', child_school_trousers: 'plain_charcoal',
  child_school_shorts: 'plain_navy', child_tshirt: 'plain_teal', child_hoodie: 'plain_coral', child_jeans: 'plain_navy', child_skirt: 'plain_teal',
  child_dress: 'floral_cream', child_pyjama_top: 'stripe_teal', child_pyjama_bottoms: 'stripe_teal', child_cardigan: 'plain_lavender',
  child_socks_pair: 'plain_cream', child_shoes: 'plain_charcoal', child_cap: 'plain_coral', child_backpack: 'plain_teal',
  child_swim_trunks: 'stripe_teal', child_swimsuit_onepiece: 'plain_coral', child_rash_vest: 'plain_teal',
};

function grid(ctx, x, y, state) {
  const pp = RENDER_W / WORLD_WIDTH;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, RENDER_W, RENDER_H); ctx.clip();
  ctx.strokeStyle = '#e8ece5'; ctx.lineWidth = 1;
  for (let dx = -1; dx <= 1; dx += 0.1) {
    const px = x + RENDER_W / 2 + dx * pp; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + RENDER_H); ctx.stroke();
  }
  // In the front view, both world axes have the same pixel scale. Other views use this grid only as a screen-space scale reference.
  for (let dy = -0.7; dy <= 0.7; dy += 0.1) {
    const py = y + RENDER_H / 2 + dy * pp; ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + RENDER_W, py); ctx.stroke();
  }
  ctx.restore();
  if (state === 'hung') {
    const py = y + RENDER_H / 2 - 0.34 * pp;
    ctx.strokeStyle = '#bdcbbf'; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(x + 12, py); ctx.lineTo(x + RENDER_W - 12, py); ctx.stroke(); ctx.setLineDash([]);
  }
}

async function contact(state = 'hung', lod = false) {
  if (!['hung', 'flat', 'folded'].includes(state)) fail(`Unknown state ${state}`);
  const list = catalogue.garments.filter((g) => g.states.includes(state));
  const canvas = document.createElement('canvas'); canvas.width = CELL_W * COLUMNS; canvas.height = HEADER + Math.ceil(list.length / COLUMNS) * CELL_H + 62;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f6f7f1'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#25483d'; ctx.font = '600 38px system-ui,sans-serif'; ctx.fillText(`LA LADERA / Child clothes · ${state}${lod ? ' · LOD' : ''}`, 30, 52);
  ctx.fillStyle = '#58736a'; ctx.font = '21px system-ui,sans-serif'; ctx.fillText(`${list.length} original designs · ages 6–10 · pale adult tee on the left of every card · actual exported GLB meshes`, 32, 88);
  ctx.font = '18px ui-monospace,monospace'; ctx.fillText(`One fixed camera: ${WORLD_WIDTH.toFixed(2)} m across every card. Model scale = 1.000. Grid spacing = 10 cm${state === 'hung' ? ' in world X/Y.' : ' in projected view.'}`, 32, 119);
  setCamera(state); const reports = [];
  for (let index = 0; index < list.length; index++) {
    const g = list[index], assetKey = `garment_${g.id}_${state}`, e = entries.get(assetKey);
    const variant = e.asset.variants.includes(preferred[g.id]) ? preferred[g.id] : e.asset.variants[0];
    const [adult, child] = await Promise.all([garment(`garment_tshirt_${state}`, 'plain_cream', false, true), garment(assetKey, variant, lod)]);
    specimen.clear(); adult.object.position.x = -0.46; child.object.position.x = 0.48;
    specimen.add(adult.object, child.object); specimen.updateMatrixWorld(true);
    const cameraExtent = { adult: clipping(adult.object), child: clipping(child.object) }, visibility = measure(child.object, adult.object);
    const x = (index % COLUMNS) * CELL_W, y = HEADER + Math.floor(index / COLUMNS) * CELL_H;
    ctx.strokeStyle = '#d7e0d5'; ctx.strokeRect(x + 4, y + 4, CELL_W - 8, CELL_H - 8);
    ctx.fillStyle = '#29483d'; ctx.font = '600 21px system-ui,sans-serif'; ctx.fillText(`${String(index + 1).padStart(2, '0')}  ${g.label}`, x + 15, y + 33, CELL_W - 30);
    grid(ctx, x + 10, y + 45, state); ctx.drawImage(renderer.domElement, x + 10, y + 45);
    ctx.fillStyle = '#819086'; ctx.font = '16px system-ui,sans-serif'; ctx.fillText('Adult tee · 100%', x + 62, y + 393);
    ctx.fillStyle = '#29483d'; ctx.fillText('Child', x + 380, y + 393);
    const length = state === 'hung' ? child.size[1] : child.size[2];
    ctx.font = '16px ui-monospace,monospace'; ctx.fillText(`${(length * 100).toFixed(1)} cm ${state === 'hung' ? 'drop' : 'depth'} · ${child.triangles} triangles`, x + 16, y + 421);
    ctx.fillStyle = '#667b6f'; ctx.font = '14px ui-monospace,monospace'; ctx.fillText(`${g.id} / ${variant}`, x + 16, y + 444, CELL_W - 32);
    reports.push({ key: assetKey, state, lod, variant, glb: child.glb, node: child.node, triangles: child.triangles, size: child.size, referenceKey: adult.key, referenceTriangles: adult.triangles, referenceSize: adult.size,
      modelScale: child.object.scale.toArray(), referenceScale: adult.object.scale.toArray(), cameraExtent, ...visibility });
  }
  const foot = canvas.height - 27; ctx.fillStyle = '#456357'; ctx.font = '18px system-ui,sans-serif';
  ctx.fillText('Generated geometry · shared 256 × 256 print atlas · preview only · no figures or wearable meshes', 30, foot);
  const barX = canvas.width - 240, barW = 0.2 * RENDER_W / WORLD_WIDTH;
  ctx.strokeStyle = '#456357'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(barX, foot - 7); ctx.lineTo(barX + barW, foot - 7); ctx.stroke();
  ctx.font = '16px ui-monospace,monospace'; ctx.fillText('20 cm', barX + barW + 10, foot - 2);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.94); document.querySelector('#review').src = dataUrl;
  return { dataUrl, report: { state, lod, count: list.length, width: canvas.width, height: canvas.height, worldWidth: WORLD_WIDTH, worldHeight: WORLD_WIDTH * RENDER_H / RENDER_W, imageWidth: RENDER_W, imageHeight: RENDER_H, items: reports } };
}

async function init() {
  const [child, adult, cat, pal] = await Promise.all([
    json(new URL('manifest.garments-child.json', MODELS)), json(new URL('manifest.garments.json', MODELS)),
    json(new URL('tools/blender/garments-child.catalog.json', ROOT)), json(new URL('garments/palette.json', MODELS)),
  ]);
  catalogue = cat; palette = pal;
  if (catalogue.sizeTag !== 'child') fail('Expected child catalogue');
  for (const m of [child, adult]) for (const pack of m.files) for (const [assetKey, asset] of Object.entries(pack.assets)) {
    if (entries.has(assetKey)) fail(`Duplicate asset ${assetKey}`); entries.set(assetKey, { asset, glb: pack.glb });
  }
  atlas = await new THREE.TextureLoader().loadAsync(new URL(`garments/${palette.atlas.file}`, MODELS).href);
  atlas.colorSpace = THREE.SRGBColorSpace; atlas.flipY = false; atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.magFilter = THREE.LinearFilter;
  document.querySelector('#status').textContent = `${catalogue.garments.length} child designs ready. Fixed camera; no auto-fit or model rescaling.`;
  return { revision: THREE.REVISION, count: catalogue.garments.length, states: Object.fromEntries(['hung', 'flat', 'folded'].map((s) => [s, catalogue.garments.filter((g) => g.states.includes(s)).length])), atlas: { width: atlas.image.width, height: atlas.image.height } };
}
window.__childGarments = { contact, loadedFiles: () => [...files.keys()], ready: null };
window.__childGarments.ready = init().catch((error) => { document.querySelector('#error').textContent = error.stack; throw error; });
