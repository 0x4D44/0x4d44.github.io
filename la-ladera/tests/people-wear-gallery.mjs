// Asset QA only. This page calls the public opt-in runtime API; it has no animation loop.
import * as THREE from 'three';
import { CharacterLibrary, BONES } from '../js/people/rig.js';
import { WearLibrary } from '../js/people/wear.js';

const MODELS = '../assets/models/';
const PEOPLE = ['w_joven', 'm_tendero', 'w_vecina'];
const FIT_LABELS = ['Slender · w_joven', 'Regular · m_tendero', 'Fuller · w_vecina'];
const library = new CharacterLibrary(MODELS), wear = new WearLibrary(MODELS);
const renderer = new THREE.WebGLRenderer({canvas: document.getElementById('gallery'), antialias: true, preserveDrawingBuffer: true});
// Browser evidence tracks real WebGL handles, not only JS dispose events. This
// detects both leaked wardrobe buffers and accidental deletion of resident data.
const gl = renderer.getContext(), liveBuffers = new Set();
const createBuffer = gl.createBuffer.bind(gl), deleteBuffer = gl.deleteBuffer.bind(gl);
gl.createBuffer = () => { const buffer = createBuffer(); if (buffer) liveBuffers.add(buffer); return buffer; };
gl.deleteBuffer = buffer => { liveBuffers.delete(buffer); return deleteBuffer(buffer); };
let baselineGpu = null;
renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.autoClear = false;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9e6de');
renderer.setClearColor(scene.background, 1);
scene.add(new THREE.HemisphereLight(0xdbe5ed, 0x85755e, 2));
const key = new THREE.DirectionalLight(0xffefda, 2.8); key.position.set(-3, 5, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xd7e6ff, 0.75); fill.position.set(4, 2, -3); scene.add(fill);
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.43, 48), new THREE.MeshStandardMaterial({color: '#d3d6cb', roughness: 1}));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.008; scene.add(floor);
const camera = new THREE.OrthographicCamera(-0.77, 0.77, 1.04, -1.04, 0.01, 20);
camera.position.set(0.45, 1.02, 4.5); camera.lookAt(0, 1.01, 0);
const instances = new Map(), assert = (ok, message) => { if (!ok) throw new Error(message); };
const triangleCount = mesh => (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;

function chooseVariant(entry) {
  const choices = entry.id === 'tshirt' ? ['stripe_teal', 'plain_teal'] :
    ['dress', 'blouse', 'bikini_top', 'bikini_bottom', 'swimsuit_onepiece'].includes(entry.id) ? ['floral_teal', 'floral_cream', 'plain_coral'] :
    ['jeans', 'trousers', 'shorts', 'leggings', 'boxers', 'swim_trunks'].includes(entry.id) ? ['plain_navy', 'plain_charcoal'] :
    ['plain_teal', 'plain_coral', 'plain_cream', 'straw_natural'];
  return choices.find(value => entry.variants.includes(value)) ?? entry.variants[0];
}

function outfit(entry) {
  const result = [{id: entry.id, variant: chooseVariant(entry)}], occupied = new Set(entry.occupies ?? [entry.slot]);
  const add = (id, preference) => {
    const other = wear.garments.get(id);
    if (!other || result.some(item => item.id === id)) return;
    result.push({id, variant: other.variants.includes(preference) ? preference : other.variants[0]});
  };
  // A neutral companion makes the target readable without exhibiting an unclothed
  // model. Every companion is another real library garment, bound by the same API.
  if (entry.slot === 'underwear_top' || entry.id === 'bikini_top') add('briefs', 'plain_charcoal');
  else if (entry.slot === 'underwear_bottom' || entry.id === 'bikini_bottom') add('bra', 'plain_cream');
  else {
    if (!occupied.has('top')) add('tshirt', 'plain_cream');
    if (!occupied.has('bottom')) add('shorts', 'plain_charcoal');
  }
  return result;
}

function pose(inst, name, phase) {
  inst.mixer.stopAllAction(); inst.cur = null;
  if (name !== 'rest') {
    const action = library.play(inst, name, {fade: 0, time: phase});
    assert(action, `missing clip ${name}`); inst.mixer.update(0);
  } else inst.mesh.skeleton.pose();
  inst.root.updateMatrixWorld(true); inst.mesh.skeleton.update();
  if (inst.wear) wear.update(inst); // Also covers explicit rest/manual bone poses.
}

function render({lod = 0, clip = 'idle_a', phase = 0.27, ids = null, columns = 3, scale = 1} = {}) {
  const entries = ids ? ids.map(id => wear.garments.get(id)) : wear.manifest.garments;
  assert(entries.length && entries.every(Boolean), 'empty or unknown garment render request');
  assert(Number.isFinite(scale) && scale >= 1 && scale <= 3, 'invalid preview scale');
  const tileW = Math.round(240 * scale), tileH = Math.round(352 * scale), groupW = tileW * PEOPLE.length;
  const rows = Math.ceil(entries.length / columns), width = columns * groupW, height = rows * tileH;
  renderer.setSize(width, height, false);
  const sheet = document.getElementById('sheet'), labels = document.getElementById('labels');
  sheet.style.width = width + 'px'; sheet.style.height = height + 'px';
  labels.style.gridTemplateColumns = `repeat(${columns},${groupW}px)`;
  labels.style.gridAutoRows = tileH + 'px'; labels.replaceChildren();
  document.getElementById('status').textContent = `${entries.length} garments × 3 adult fits\n${lod ? 'FAR' : 'NEAR'} · ${clip} @ ${phase.toFixed(2)}`;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height); renderer.clear(); renderer.setScissorTest(true);
  const result = [];
  for (const [index, entry] of entries.entries()) {
    const col = index % columns, row = Math.floor(index / columns), bottom = (rows - row - 1) * tileH;
    const selection = outfit(entry), counts = [];
    for (const [fitIndex, id] of PEOPLE.entries()) {
      const inst = instances.get(id);
      wear.dress(inst, selection, {context: 'studio'}); library.setLod(inst, lod); pose(inst, clip, phase);
      scene.add(inst.root);
      const x = col * groupW + fitIndex * tileW;
      renderer.setViewport(x, bottom + 28, tileW, tileH - 78);
      renderer.setScissor(x, bottom + 28, tileW, tileH - 78); renderer.clear(); renderer.render(scene, camera);
      const meshes = []; inst.obj.traverse(mesh => { if (mesh.isSkinnedMesh && mesh.visible) meshes.push(mesh); });
      counts.push({id, visibleMeshes: meshes.length, triangles: meshes.reduce((sum, mesh) => sum + triangleCount(mesh), 0)});
      scene.remove(inst.root);
    }
    const label = document.createElement('div'); label.className = 'label';
    const title = document.createElement('strong'); title.textContent = `${String(index + 1).padStart(2, '0')} · ${entry.label}`; label.append(title);
    const subtitle = document.createElement('div'); subtitle.className = 'sub'; subtitle.textContent = `${entry.id} · ${chooseVariant(entry)} · ${lod ? 'far LOD' : 'near mesh'}`; label.append(subtitle);
    const fits = document.createElement('div'); fits.className = 'fits';
    for (const text of FIT_LABELS) { const span = document.createElement('span'); span.textContent = text; fits.append(span); }
    label.append(fits); labels.append(label); result.push({garment: entry.id, selection, fits: counts});
  }
  renderer.setScissorTest(false); renderer.getContext().finish();
  return {width, height: height + 110, lod, clip, phase, rows: result};
}

function validateRuntime() {
  const report = {fits: PEOPLE, clips: [...library.clips.keys()], checks: [], posedVertices: 0};
  const vector = new THREE.Vector3();
  for (const id of PEOPLE) {
    const inst = instances.get(id), original = {mesh: inst.mesh, geometry: inst.mesh.geometry, material: inst.mesh.material, visible: inst.mesh.visible, skeleton: inst.mesh.skeleton};
    wear.dress(inst, [{id:'tshirt',variant:'plain_teal'},{id:'trousers',variant:'plain_navy'},{id:'shoes',variant:'plain_charcoal'}]);
    assert(inst.mesh === original.mesh && inst.mesh.skeleton === original.skeleton, `${id}: wardrobe replaced original skeleton`);
    for (const lod of [0, 1]) {
      library.setLod(inst, lod); assert(inst.lod === lod, `${id}: LOD did not reach wardrobe`);
      for (const clip of report.clips) {
        for (const phase of [0.19, 0.67]) {
          pose(inst, clip, phase);
          inst.obj.traverse(mesh => {
            if (!mesh.isSkinnedMesh || !mesh.visible) return;
            assert(mesh.skeleton.bones.length === BONES.length, `${id}: wearable skeleton size`);
            const index = mesh.geometry.index, used = index ? Array.from(new Set(index.array)) : Array.from({length:mesh.geometry.attributes.position.count}, (_, n) => n);
            for (let v = 0; v < used.length; v += Math.max(1, Math.floor(used.length / 32))) {
              mesh.getVertexPosition(used[v], vector);
              assert([vector.x,vector.y,vector.z].every(Number.isFinite) && Math.max(Math.abs(vector.x),Math.abs(vector.y),Math.abs(vector.z)) < 3.5, `${id}/${clip}: invalid wearable skin deformation`);
              report.posedVertices++;
            }
          });
        }
      }
    }
    wear.restore(inst);
    assert(inst.mesh === original.mesh && inst.mesh.geometry === original.geometry && inst.mesh.material === original.material && inst.mesh.visible === original.visible && inst.mesh.skeleton === original.skeleton, `${id}: restore changed the original look`);
    assert(!inst.wear, `${id}: restore left wardrobe active`);
    report.checks.push({id, restore: true, lods: [0,1], clips: report.clips.length});
  }
  assert(report.clips.length === 32, 'not all 32 original clips loaded');
  return report;
}

function validateGpuSharing() {
  renderer.setSize(480, 640, false); renderer.setScissorTest(false); renderer.setViewport(0, 0, 480, 640);
  const draw = inst => { scene.add(inst.root); renderer.clear(); renderer.render(scene, camera); scene.remove(inst.root); };
  // Upload each original resident first. The measured difference then includes
  // only new wardrobe textures, even when the first wearable is a hat or shoe.
  for (const id of PEOPLE) { const inst = instances.get(id); wear.restore(inst); library.setLod(inst, 0); pose(inst, 'rest', 0); draw(inst); }
  const baselineTextures = renderer.info.memory.textures, variants = new Set();
  baselineGpu = {textures: baselineTextures, geometries: renderer.info.memory.geometries, buffers: new Set(liveBuffers)};
  for (const entry of wear.manifest.garments) for (const variant of entry.variants) {
    if (variants.has(variant)) continue;
    variants.add(variant);
    for (const id of PEOPLE) {
      const inst = instances.get(id), selection = outfit(entry); selection[0].variant = variant;
      wear.dress(inst, selection, {context:'studio'}); draw(inst); wear.restore(inst);
    }
  }
  renderer.getContext().finish();
  const wardrobeTextures = renderer.info.memory.textures, addedTextures = wardrobeTextures - baselineTextures;
  assert(addedTextures === 1, `variant textures allocated ${addedTextures} GPU images; expected one shared atlas`);
  return {baselineTextures, wardrobeTextures, addedTextures, variants: [...variants], fits: PEOPLE};
}

function validateDisposal() {
  assert(baselineGpu, 'GPU baseline must be recorded before final disposal');
  wear.dispose();
  const leaked = [...liveBuffers].filter(buffer => !baselineGpu.buffers.has(buffer));
  const lost = [...baselineGpu.buffers].filter(buffer => !liveBuffers.has(buffer));
  assert(leaked.length === 0, `wardrobe left ${leaked.length} WebGL buffers allocated`);
  assert(lost.length === 0, `wardrobe deleted ${lost.length} original WebGL buffers`);
  assert(renderer.info.memory.textures === baselineGpu.textures, 'wardrobe texture disposal did not return to baseline');
  assert(renderer.info.memory.geometries === baselineGpu.geometries, 'wardrobe geometry disposal did not return to baseline');
  return {baselineBuffers: baselineGpu.buffers.size, remainingBuffers: liveBuffers.size, leakedBuffers: leaked.length, lostOriginalBuffers: lost.length,
    textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries};
}

window.__wearCheck = {ready: null, render, validateRuntime, validateGpuSharing, validateDisposal};
window.__wearCheck.ready = Promise.all([library.load(),wear.load(PEOPLE)]).then(() => {
  for (const id of PEOPLE) instances.set(id, library.instantiate(id));
  return {garments: wear.manifest.garments.map(entry => entry.id), fits: PEOPLE};
}).catch(error => { document.getElementById('status').textContent = String(error); throw error; });
