import * as T from 'three';
import { GLTFLoader } from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { loadSubstationMaterials, mapSubstationUvs } from '../../tools/substation_materials.mjs';
import { createSpanInstances } from '../../tools/substation_catenary.mjs';

const base = new URL('../../', import.meta.url);
const read = p => fetch(new URL(p, base)).then(r => { if (!r.ok) throw new Error(p + ': ' + r.status); return r.json(); });
window.substationGalleryReady = (async () => {
  const [manifest, atlas, uk, co, catalogue] = await Promise.all([read('assets/models/manifest.substation.json'), read('assets/textures/substation/atlas.json'), read('tools/blender/substation-plan.uk.json'), read('tools/blender/substation-plan.co.json'), read('tools/blender/substation.catalog.json')]);
  const materials = {};
  for (const v of ['uk', 'co']) materials[v] = await loadSubstationMaterials(T, atlas, v, new URL('assets/textures/substation/', base));
  const loader = new GLTFLoader(), roots = new Map();
  for (const file of manifest.files) {
    const gltf = await loader.loadAsync(new URL('assets/models/' + file.glb, base).href);
    gltf.scene.children.forEach(root => roots.set(root.name, root));
  }
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap; renderer.setPixelRatio(1); document.body.append(renderer.domElement);
  const scene = new T.Scene(); scene.background = new T.Color('#e8e8dd');
  scene.add(new T.HemisphereLight('#eff7ff', '#77745c', 2.4));
  const sun = new T.DirectionalLight('#fff1d4', 3.3); sun.position.set(-15, 27, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0003; scene.add(sun);
  const fill = new T.DirectionalLight('#c5dbe0', 1.2); fill.position.set(15, 10, -10); scene.add(fill);
  const ground = new T.Mesh(new T.PlaneGeometry(250, 250), new T.MeshStandardMaterial({ color: '#c8c9ba', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.025; ground.receiveShadow = true; scene.add(ground);
  const stage = new T.Group(); scene.add(stage);
  const camera = new T.PerspectiveCamera(35, 1.5, 0.005, 1500);
  function object(key, variant) { if (!roots.has(key)) throw new Error('Missing exported root ' + key); return materials[variant].apply(roots.get(key).clone(true)); }
  function figure(x = 0, z = 0) {
    const group = new T.Group(), mat = new T.MeshStandardMaterial({ color: '#cf9a43', roughness: 0.9 });
    function part(geometry, px, py, pz) { const m = new T.Mesh(geometry, mat); m.position.set(px, py, pz); m.castShadow = true; group.add(m); return m; }
    part(new T.SphereGeometry(0.105, 12, 8), 0, 1.695, 0);
    part(new T.CylinderGeometry(.17, .13, .53, 10), 0, 1.31, 0);
    for (const side of [-1, 1]) { part(new T.CylinderGeometry(.066, .05, .82, 8), side * .09, .47, 0); part(new T.CylinderGeometry(.045, .035, .61, 8), side * .22, 1.17, 0).rotation.z = side * .12; part(new T.BoxGeometry(.12, .08, .23), side * .09, .04, .045); }
    group.position.set(x, 0, z); return group;
  }
  function clear() { stage.clear(); }
  function shadowExtent(extent) { sun.shadow.camera.left = sun.shadow.camera.bottom = -extent; sun.shadow.camera.right = sun.shadow.camera.top = extent; sun.shadow.camera.near = 1; sun.shadow.camera.far = 150; sun.shadow.camera.updateProjectionMatrix(); }
  function render(width, height) { renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.render(scene, camera); return renderer.domElement.toDataURL('image/jpeg', 0.94); }
  function item(key, variant, mode = 'eye', lod = false, width = 520, height = 330) {
    clear(); const root = object(key + (lod ? '_lod1' : ''), variant), size = catalogue.assets[key].size; stage.add(root);
    const [w, h, d] = size, extent = Math.max(w, h, d, mode === 'scale' ? 1.8 : .2), nearView = mode === 'eye';
    shadowExtent(Math.max(5, extent * 1.2));
    if (mode === 'scale') stage.add(figure(w / 2 + Math.max(.35, w * .06), .1));
    const target = new T.Vector3(mode === 'scale' ? .18 : 0, (mode === 'scale' ? Math.max(h, 1.8) : h) * .48, 0);
    const distance = Math.max(nearView ? .65 : 3, extent * 1.9);
    camera.position.set(distance * .68, 1.6, distance * .9 + d * .25);
    camera.lookAt(target);
    const radius = nearView ? Math.max(w * .55, h * .55, d * .55) : Math.max(w * .75 + .5, h * .55, 1.05, d * .6);
    camera.fov = Math.max(4, Math.min(48, 2 * Math.atan(radius / camera.position.distanceTo(target)) * 180 / Math.PI * 1.3));
    return { image: render(width, height), key, variant, lod, cameraHeightMetres: 1.6, figureHeightMetres: mode === 'scale' ? 1.8 : null, triangles: manifest.files.flatMap(f => Object.entries(f.assets)).find(([k]) => k === key + (lod ? '_lod1' : ''))[1].triangles };
  }
  function overview(variant, width = 1600, height = 1000) {
    clear(); const plan = variant === 'uk' ? uk : co;
    const tileGeo = mapSubstationUvs(new T.BoxGeometry(2.5, .12, 2.5), atlas, 'substation_gravel');
    const gravel = new T.InstancedMesh(tileGeo, materials[variant].get('substation_gravel'), 22 * 16), transform = new T.Matrix4();
    for (let x = 0; x < 22; x++) for (let z = 0; z < 16; z++) { transform.makeTranslation(-26.25 + x * 2.5, -.09, -18.75 + z * 2.5); gravel.setMatrixAt(x * 16 + z, transform); }
    gravel.receiveShadow = true; stage.add(gravel);
    for (const entry of plan.equipment) {
      const key = plan.equipmentTypes[entry.type].variantBinding.asset, ob = object(key, variant);
      ob.position.fromArray(entry.position); ob.rotation.y = entry.rotationY;
      if (entry.scale) ob.scale.fromArray(entry.scale);
      for (const [suffix, angles] of Object.entries(entry.pivotRotations ?? {})) {
        const pivot = ob.getObjectByName(key + '-' + suffix); if (!pivot) throw new Error('Unknown posed pivot ' + suffix); pivot.rotation.set(...angles);
      }
      materials[variant].apply(ob, plan.variantProfile.instanceMaterialOverrides?.[entry.id]); stage.add(ob);
      if (entry.tagCells?.length) {
        const size = plan.equipmentTypes[entry.type].variantBinding.envelope;
        for (const [i, cellId] of entry.tagCells.entries()) {
          const cell = atlas.variants[variant].cells.find(c => c.id === cellId); if (!cell) throw new Error('Unknown plan tag cell ' + cellId);
          const plane = new T.PlaneGeometry(.7, .18), uv = plane.attributes.uv;
          for (let n = 0; n < uv.count; n++) uv.setXY(n, cell.uv[0] + uv.getX(n) * (cell.uv[2] - cell.uv[0]), cell.uv[1] + uv.getY(n) * (cell.uv[3] - cell.uv[1]));
          const tag = new T.Mesh(plane, materials[variant].get('substation_signs')); tag.position.set(-.5 + i * .8, 1.7, size[2] / 2 + .025); ob.add(tag);
        }
      }
    }
    for (const span of plan.variantProfile.resolvedSpans ?? []) {
      const wire = createSpanInstances(T, span.start, span.end, { sag: span.sagM, radius: span.conductorRadiusM, maxSegmentLength: span.maxSegmentLengthM, material: materials[variant].get('substation_galvanised') });
      mapSubstationUvs(wire.geometry, atlas, 'substation_galvanised'); stage.add(wire);
    }
    // Mark the data route without changing the plan or adding any runtime nav code.
    const route = plan.visitorRoute.points;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i], p = new T.Vector3(a[0], .025, a.length === 3 ? a[2] : a[1]), q = new T.Vector3(b[0], .025, b.length === 3 ? b[2] : b[1]);
      const strip = new T.Mesh(new T.BoxGeometry(.7, .012, p.distanceTo(q)), new T.MeshStandardMaterial({ color: '#bdc5ab', roughness: 1 }));
      strip.position.copy(p).add(q).multiplyScalar(.5); strip.rotation.y = Math.atan2(q.x - p.x, q.z - p.z); stage.add(strip);
    }
    stage.add(figure(-17, 17)); sun.position.set(-45, 70, 35); shadowExtent(60);
    camera.position.set(60, 49, 73); camera.lookAt(0, 7, -4); camera.fov = 44;
    return { image: render(width, height), variant, equipmentInstances: plan.equipment.length, planSource: `substation-plan.${variant}.json` };
  }
  function finishReview() {
    // The reviewer owns a shadow render target in addition to the library's
    // five image textures. Release that target before counting atlas images;
    // all library images stay uploaded and both material sets remain alive.
    const before = { ...renderer.info.memory };
    const targets = [sun.shadow.map, sun.shadow.mapPass].filter(Boolean);
    renderer.shadowMap.enabled = false;
    targets.forEach(target => target.dispose()); sun.shadow.map = null; sun.shadow.mapPass = null;
    return { before, reviewRenderTargetsReleased: targets.length, after: { ...renderer.info.memory } };
  }
  const sourcePins = { models: manifest.files.map(({ glb, bytes, sha256 }) => ({ glb, bytes, sha256 })), atlas: manifest.textureMetadata, plans: manifest.plans };
  window.substationGallery = { item, overview, finishReview, sourcePins, keys: Object.keys(catalogue.assets), catalogue, renderer: renderer.info, dispose() { materials.uk.dispose(); materials.co.dispose(); renderer.dispose(); } };
  item('substation_grid_transformer', 'co');
  return true;
})();
