// Developer-only studio. Every view decodes the committed GLB and samples its real animation tracks.
// No world bootstrap, procedural substitute, texture loading, or new animal simulation lives here.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MaterialLib } from '../js/core/matlib.js';

const KEYS = ['dog', 'cat', 'pigeon', 'hen', 'mule', 'parrot_caged', 'canary_caged'];
const NAMES = { dog: 'Stray dog', cat: 'Street cat', pigeon: 'Pigeon', hen: 'Hen', mule: 'Mule', parrot_caged: 'Caged parrot', canary_caged: 'Caged canary' };
const CLIPS = ['idle', 'walk', 'eat'];
const $ = (id) => document.getElementById(id);
const loader = new GLTFLoader();
const materials = new MaterialLib({ night: 0 }); // Deliberately no init(): this review verifies textureless library colours.
const assets = new Map();
let manifest, renderer, views = [], selected = 'dog', selectedLOD = 'near', playing = false, lastTime = 0;
let animationFrame;
const v = new THREE.Vector3();

function meshReport(root, sample = false) {
  const bounds = new THREE.Box3();
  const coords = [], names = new Set();
  let triangles = 0, meshes = 0, skinnedMeshes = 0, vertices = 0, hash = 2166136261;
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (o.isSkinnedMesh) skinnedMeshes++;
    const p = o.geometry.attributes.position;
    vertices += p.count;
    triangles += (o.geometry.index?.count ?? p.count) / 3;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) names.add(m.name);
    // Use the actual skinned/morphed vertices, not a bone-only hash: tracks must move visible geometry.
    const stride = Math.max(1, Math.floor(p.count / 192));
    for (let i = 0; i < p.count; i++) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
      if (!Number.isFinite(v.x + v.y + v.z)) throw new Error(`Non-finite posed vertex in ${o.name}`);
      bounds.expandByPoint(v);
      if (i % stride === 0) {
        for (const n of [v.x, v.y, v.z]) {
          hash = Math.imul(hash ^ Math.round(n * 1e6), 16777619) >>> 0;
          if (sample) coords.push(n);
        }
      }
    }
  });
  return { triangles, meshes, skinnedMeshes, vertices, materials: [...names].sort(), signature: hash.toString(16).padStart(8, '0'), bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, ...(sample ? { sample: coords } : {}) };
}

function remap(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const use = (m) => {
      if (!materials.has(m.name.split('#')[0])) throw new Error(`Unknown library material ${JSON.stringify(m.name)}`);
      return materials.get(m.name);
    };
    o.material = Array.isArray(o.material) ? o.material.map(use) : use(o.material);
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false; // Capture all animated extremities; the world uses its own culling.
  });
}

function pathURL(file) {
  if (typeof file !== 'string' || !file.endsWith('.glb') || file.includes('..') || /^[a-z]+:/i.test(file) || file.startsWith('/')) throw new Error(`Unsafe asset path: ${file}`);
  return new URL('../assets/models/' + file, import.meta.url).href;
}

async function asset(key) {
  if (assets.has(key)) return assets.get(key);
  const entry = manifest.animals?.[key];
  if (!entry) throw new Error(`Animal missing from manifest: ${key}`);
  const pending = (async () => {
    const [near, far] = await Promise.all([loader.loadAsync(pathURL(entry.glb)), loader.loadAsync(pathURL(entry.lod))]);
    if (entry.node && !near.scene.getObjectByName(entry.node)) throw new Error(`${key}: missing root ${entry.node}`);
    if (entry.lodNode && !far.scene.getObjectByName(entry.lodNode)) throw new Error(`${key}: missing far root ${entry.lodNode}`);
    remap(near.scene); remap(far.scene);
    const clips = {};
    for (const name of CLIPS) {
      const requested = entry.clips?.[name];
      clips[name] = THREE.AnimationClip.findByName(near.animations, requested);
      if (!clips[name] || !clips[name].tracks.length || !(clips[name].duration > 0)) throw new Error(`${key}: missing usable ${name} clip (${requested})`);
    }
    const root = clone(near.scene), mixer = new THREE.AnimationMixer(root), frame = new THREE.Box3();
    const extend = () => { const b = meshReport(root).bounds; frame.expandByPoint(new THREE.Vector3(...b.min)); frame.expandByPoint(new THREE.Vector3(...b.max)); };
    extend();
    for (const name of CLIPS) {
      mixer.stopAllAction();
      const action = mixer.clipAction(clips[name]).reset().play();
      for (const phase of [0, 0.25, 0.5, 0.75]) { mixer.setTime(phase * clips[name].duration); extend(); }
      action.stop();
    }
    mixer.uncacheRoot(root);
    return { key, entry, near, far, clips, frame, nearReport: meshReport(near.scene), farReport: meshReport(far.scene) };
  })();
  assets.set(key, pending);
  return pending;
}

function makeView(a, clip = 'idle', phase = 0.375, lod = 'near') {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeceee7);
  const root = clone(a[lod === 'far' ? 'far' : 'near'].scene);
  scene.add(root);
  const size = a.frame.getSize(new THREE.Vector3());
  const centre = a.frame.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 0.1);
  scene.add(new THREE.HemisphereLight(0xfafcff, 0x8d8875, 2.1));
  const sun = new THREE.DirectionalLight(0xfff4df, 3.2);
  sun.position.set(-span * 2.5, span * 4, span * 3);
  sun.target.position.copy(centre);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -span * 1.7, right: span * 1.7, top: span * 1.7, bottom: -span * 1.7, near: 0.01, far: span * 12 });
  sun.shadow.normalBias = 0.003 * span;
  sun.shadow.bias = -0.0001;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 40, span * 40), new THREE.MeshStandardMaterial({ color: 0xdce0d2, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.001;
  ground.receiveShadow = true;
  scene.add(ground);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, span * 30);
  camera.position.copy(centre).add(new THREE.Vector3(2.5, 1.7, 3.7).normalize().multiplyScalar(span * 5));
  camera.lookAt(centre);
  camera.updateMatrixWorld(true);
  const figure = document.createElement('figure');
  figure.innerHTML = '<div class="viewport"></div><figcaption><div><span class="animal-name"></span><span class="clip-label"></span></div><span class="counts"></span></figcaption>';
  figure.querySelector('.animal-name').textContent = NAMES[a.key];
  const report = lod === 'far' ? a.farReport : a.nearReport;
  figure.querySelector('.counts').textContent = `${report.triangles.toLocaleString('en-GB')} tris · ${lod} LOD`;
  const view = { a, scene, root, camera, ground, sun, element: figure, viewport: figure.querySelector('.viewport'), mixer: new THREE.AnimationMixer(root), clip, phase, lod };
  poseView(view, clip, phase);
  return view;
}

function poseView(view, clip, phase, tag = '') {
  if (!CLIPS.includes(clip)) throw new Error(`Unknown clip: ${clip}`);
  if (!Number.isFinite(phase) || phase < 0 || phase >= 1) throw new Error('Clip phase must be in [0, 1)');
  view.clip = clip;
  view.phase = phase;
  view.mixer.stopAllAction();
  if (view.lod === 'near') {
    view.mixer.clipAction(view.a.clips[clip]).reset().play();
    view.mixer.setTime(view.a.clips[clip].duration * phase);
  }
  view.root.updateMatrixWorld(true);
  view.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
  const t = view.a.clips[clip].duration * phase;
  view.element.querySelector('.clip-label').textContent = view.lod === 'far' ? 'Static distance silhouette' : `${clip[0].toUpperCase() + clip.slice(1)} · ${t.toFixed(3)} s${tag ? ' · ' + tag : ''}`;
}

function fitCamera(view, aspect) {
  // Frame the union of the real animation bounds so every clip uses the same camera.
  const c = view.camera, b = view.a.frame;
  let halfW = 0, halfH = 0;
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    v.set(x, y, z).applyMatrix4(c.matrixWorldInverse);
    halfW = Math.max(halfW, Math.abs(v.x)); halfH = Math.max(halfH, Math.abs(v.y));
  }
  const h = Math.max(halfH, halfW / aspect) * 1.22;
  Object.assign(c, { left: -h * aspect, right: h * aspect, top: h, bottom: -h });
  c.updateProjectionMatrix();
}

function render() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setScissorTest(false);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.info.reset();
  renderer.setScissorTest(true);
  for (const view of views) {
    const rect = view.viewport.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.width <= 0 || rect.height <= 0) continue;
    fitCamera(view, rect.width / rect.height);
    renderer.setViewport(rect.left, innerHeight - rect.bottom, rect.width, rect.height);
    renderer.setScissor(rect.left, innerHeight - rect.bottom, rect.width, rect.height);
    renderer.render(view.scene, view.camera);
  }
  renderer.setScissorTest(false);
}

function disposeViews() {
  for (const view of views) {
    view.mixer.stopAllAction(); view.mixer.uncacheRoot(view.root);
    view.ground.geometry.dispose(); view.ground.material.dispose(); view.sun.shadow.map?.dispose();
  }
  views = [];
  $('views').replaceChildren();
}

async function setAnimal(key, lod = 'near') {
  if (!KEYS.includes(key)) throw new Error(`Unknown animal: ${key}`);
  if (!['near', 'far'].includes(lod)) throw new Error(`Unknown LOD: ${lod}`);
  playing = false;
  const a = await asset(key);
  document.body.classList.remove('contact');
  disposeViews();
  selected = key; selectedLOD = lod;
  const view = makeView(a, $('clip').value, +$('phase').value, lod);
  views.push(view); $('views').append(view.element);
  $('animal').value = key; $('lod').value = lod;
  $('title').textContent = NAMES[key];
  $('status').textContent = `${lod === 'far' ? a.entry.lod : a.entry.glb}`;
  $('footer-left').textContent = `${a.entry.node ?? key} · ${lod === 'near' ? 'three in-place clips' : 'static distance model'} · library materials by name`;
  render();
  return inspectView(view);
}

function inspectView(view, withSample = false) {
  return { key: view.a.key, lod: view.lod, clip: view.clip, phase: view.phase, duration: view.a.clips[view.clip].duration, file: view.lod === 'near' ? view.a.entry.glb : view.a.entry.lod, ...meshReport(view.root, withSample) };
}

function setPose(clip, phase, tag = '') {
  if (views.length !== 1) throw new Error('Select one animal before setting its pose');
  playing = false;
  poseView(views[0], clip, phase, tag);
  $('clip').value = clip; $('phase').value = phase;
  render();
  return inspectView(views[0]);
}

async function contact(phases = {}) {
  playing = false;
  const loaded = await Promise.all(KEYS.map(asset));
  document.body.classList.add('contact');
  disposeViews();
  for (const a of loaded) for (const clip of CLIPS) {
    const view = makeView(a, clip, phases[a.key]?.[clip] ?? 0.375);
    views.push(view); $('views').append(view.element);
  }
  $('title').textContent = 'Animals of La Ladera';
  $('subtitle').textContent = 'Seven species · idle / walk / eat · sampled from the committed GLB clips. Each row uses the same camera and scale; species are framed individually.';
  $('footer-left').textContent = 'Near LOD · actual WebGL renders · library materials by name · no embedded textures';
  render();
  return views.map((view) => inspectView(view));
}

function sampleClip(clip) {
  if (views.length !== 1 || views[0].lod !== 'near') throw new Error('Select a near animal before sampling a clip');
  const view = views[0], phases = [0.125, 0, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
  const before = { clip: view.clip, phase: view.phase };
  const samples = phases.map((phase) => { poseView(view, clip, phase); return inspectView(view, true); });
  const reference = samples[0];
  let maxDelta = 0, second = reference;
  const deltas = samples.map((sample) => {
    let sum = 0, maximum = 0;
    if (sample.sample.length !== reference.sample.length) throw new Error('Posed vertex sample count changed');
    for (let i = 0; i < sample.sample.length; i += 3) {
      const d = Math.hypot(...sample.sample.slice(i, i + 3).map((n, j) => n - reference.sample[i + j]));
      sum += d * d; maximum = Math.max(maximum, d);
    }
    const rms = Math.sqrt(sum / (sample.sample.length / 3));
    if (maximum > maxDelta) { maxDelta = maximum; second = sample; }
    return { phase: sample.phase, signature: sample.signature, maxDisplacementMetres: maximum, rmsDisplacementMetres: rms };
  });
  poseView(view, before.clip, before.phase);
  render();
  return { key: view.a.key, clip, duration: view.a.clips[clip].duration, phases: [reference.phase, second.phase], signatures: [reference.signature, second.signature], maxDisplacementMetres: maxDelta, samples: deltas };
}

function animate(t) {
  if (!playing || views.length !== 1 || views[0].lod !== 'near') return;
  const view = views[0], dt = lastTime ? Math.min((t - lastTime) / 1000, 0.1) : 0;
  lastTime = t;
  poseView(view, view.clip, (view.phase + dt / view.a.clips[view.clip].duration) % 1);
  $('phase').value = view.phase;
  render();
  animationFrame = requestAnimationFrame(animate);
}

async function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  $('canvas-root').append(renderer.domElement);
  const response = await fetch(new URL('../assets/models/manifest.animals.json', import.meta.url));
  if (!response.ok) throw new Error(`Animal manifest: HTTP ${response.status}`);
  manifest = await response.json();
  for (const key of KEYS) { const option = document.createElement('option'); option.value = key; option.textContent = NAMES[key]; $('animal').append(option); }
  $('animal').onchange = () => setAnimal($('animal').value, selectedLOD).catch(fatal);
  $('lod').onchange = () => setAnimal(selected, $('lod').value).catch(fatal);
  $('clip').onchange = $('phase').oninput = () => { if (views.length === 1) setPose($('clip').value, +$('phase').value); };
  $('contact').onclick = () => contact().catch(fatal);
  $('play').onclick = () => {
    playing = !playing; lastTime = 0; cancelAnimationFrame(animationFrame);
    $('play').textContent = playing ? 'Pause' : 'Play';
    if (playing) animationFrame = requestAnimationFrame(animate);
  };
  addEventListener('resize', render);
  addEventListener('scroll', render, { passive: true });
  await setAnimal(KEYS[0]);
  return { keys: KEYS, clips: CLIPS, materialWarnings: [...materials.missing], manifest: '../assets/models/manifest.animals.json' };
}

function fatal(error) { $('fatal').hidden = false; $('fatal').textContent = error.stack ?? String(error); $('status').textContent = 'Review failed'; console.error(error); }

window.__animals = {
  ready: null, setAnimal, setPose, contact, sampleClip,
  inspect: () => views.map((view) => inspectView(view)),
  counters: () => ({ views: views.length, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, materialWarnings: [...materials.missing] }),
  capture: async (enabled = true) => { document.body.classList.toggle('capture', enabled); render(); await new Promise(requestAnimationFrame); return true; },
  render: async () => { render(); await new Promise(requestAnimationFrame); return true; },
};
window.__animals.ready = init().catch((error) => { fatal(error); throw error; });
