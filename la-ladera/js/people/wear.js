// Optional adult wardrobe. Construction/import are inert; normal character creation keeps its original outfit.
// Explicit use: await wear.load([inst.id]); wear.dress(inst, [{id:'tshirt',variant:'plain_teal'}, {id:'trousers',variant:'plain_navy'}]);
// Every fit uses the resident's existing skeleton, mixer and clips. No second animation player is created.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { slotRatio } from './look.js';
import { createWearCorrection } from './wear_correction.js';
import { WEAR_POLICY, WEAR_GARMENTS, WEAR_FITS, WEAR_ARCHETYPES, WEAR_VARIANTS } from './wear_data.js';
export { WEAR_POLICY, WEAR_GARMENTS, WEAR_FITS, WEAR_ARCHETYPES, WEAR_VARIANTS };

const own = (o, k) => Object.hasOwn(o, k);
const canon = (s) => s.replace(/_\d+$/, '');
const CHILD_TAGS = new Set(['kid', 'teen', 'boy', 'girl', 'child']);
const equalMatrix = (a, b, epsilon = 2e-5) => a?.elements?.length === 16 && b?.elements?.length === 16 && a.elements.every((v, i) => Number.isFinite(v) && Math.abs(v - b.elements[i]) <= epsilon);
const array = (m) => Array.isArray(m) ? m : [m];
const fail = (s) => { throw new Error('people wear: ' + s); };

/** Lossless transport only: decoded glTF, external-resource root and GPU layout
 * stay identical. A server may already decode Content-Encoding: gzip; inspect
 * the actual magic bytes so that response is never decompressed twice. */
export async function loadWearGltf(loader, url) {
  if (!/\.glb\.gz(?:[?#]|$)/.test(url)) return loader.loadAsync(url);
  const response = await fetch(url);
  if (!response.ok) fail(`${url}: HTTP ${response.status}`);
  let bytes = await response.arrayBuffer();
  const magic = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    if (typeof DecompressionStream !== 'function') fail('this browser cannot decode gzip wearable assets');
    bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  if (bytes.byteLength < 12 || new DataView(bytes).getUint32(0, true) !== 0x46546c67) fail(`${url}: decoded wearable is not a GLB`);
  const absolute = new URL(url, globalThis.document?.baseURI ?? globalThis.location?.href ?? import.meta.url);
  return loader.parseAsync(bytes, new URL('.', absolute).href);
}

/** The committed identity list is authoritative: relabelling a child as an adult cannot opt it in. */
export function isAdultWearFit(id) { return typeof id === 'string' && own(WEAR_FITS, id); }

/** Pure selection gate, shared by the runtime and Node tests. Returns a fresh normalized selection. */
export function validateOutfit(id, items, { context = 'daily' } = {}) {
  if (!isAdultWearFit(id)) fail(`${id}: only existing adult and elder residents have wearable fits`);
  if (!WEAR_POLICY.contexts.includes(context)) fail(`unknown wardrobe context ${context}`);
  if (!Array.isArray(items)) fail('outfit must be an array');
  const fit = WEAR_FITS[id], occupied = new Set(), normalized = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !own(WEAR_GARMENTS, item.id)) fail(`unknown garment ${item?.id ?? item}`);
    const g = WEAR_GARMENTS[item.id], variant = item.variant ?? g.variants[0];
    if (typeof variant !== 'string' || !g.variants.includes(variant) || !own(WEAR_VARIANTS, variant)) fail(`${g.id}: unknown or ineligible colour ${variant}`);
    // The explicit studio context is the contact-sheet/asset inspector. It still rejects every child/teen ID.
    if (context !== 'studio') {
      if (!g.archetypes.includes(fit.archetype) || !WEAR_ARCHETYPES[fit.archetype].garments.includes(g.id)) fail(`${g.id}: not in ${fit.archetype}'s wardrobe`);
      if (!g.contexts.includes(context)) fail(`${g.id}: not available in ${context}; swimwear is an explicit beach outfit`);
    }
    for (const slot of g.occupies) {
      if (occupied.has(slot)) fail(`outfit uses ${slot} more than once`);
      occupied.add(slot);
    }
    normalized.push({ id: g.id, variant });
  }
  if (normalized.length && context !== 'studio') {
    const bottom = occupied.has('bottom') || (context === 'private' && occupied.has('underwear_bottom'));
    const top = occupied.has('top') || (context === 'private' && occupied.has('underwear_top'));
    const needsTop = context === 'daily' || fit.archetype.endsWith('_woman');
    if (!bottom || (needsTop && !top)) fail(`${context} outfit needs ${needsTop ? 'top and bottom' : 'bottom'} coverage; use studio only for asset inspection`);
  }
  return normalized;
}

function skinnedNode(scene, name) {
  const node = scene?.getObjectByName(name);
  if (node?.isSkinnedMesh) return node;
  let mesh = null;
  node?.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  return mesh;
}

/** Reject a fit for a different body even if its bone names happen to match. */
export function validateWearBinding(source, target, label = 'mesh') {
  if (!source?.isSkinnedMesh || !target?.isSkinnedMesh) fail(`${label}: a skinned mesh is required`);
  const a = source.skeleton, b = target.skeleton;
  if (!a || !b || a.bones.length !== b.bones.length || a.boneInverses.length !== b.boneInverses.length) fail(`${label}: skeleton size mismatch`);
  for (let i = 0; i < a.bones.length; i++) {
    if (canon(a.bones[i].name) !== canon(b.bones[i].name)) fail(`${label}: joint order mismatch at ${i}`);
    if (!equalMatrix(a.boneInverses[i], b.boneInverses[i])) fail(`${label}: inverse bind matrix mismatch at ${i}`);
  }
  if (!equalMatrix(source.bindMatrix, target.bindMatrix)) fail(`${label}: mesh bind matrix mismatch`);
  const g = source.geometry, p = g?.getAttribute('position'), j = g?.getAttribute('skinIndex'), w = g?.getAttribute('skinWeight');
  if (!p || !j || !w || j.count !== p.count || w.count !== p.count || j.itemSize !== 4 || w.itemSize !== 4) fail(`${label}: missing skin attributes`);
  return true;
}

/** Pose targets are CPU data, never glTF morph targets or renderer attributes.
 * Read their packed buffer view directly so near/far targets do not introduce
 * hidden GPU allocations. Reused accessors also retain one CPU array identity. */
async function readPoseTarget(gltf, mesh, name, deltas) {
  const json = gltf.parser?.json, nodes = json?.nodes?.filter((node) => node.name === name);
  if (!nodes?.length) {
    if (mesh.userData.poseTarget != null) fail(`${name}: missing pose target source node`);
    return null;
  }
  if (nodes.length !== 1) fail(`${name}: ambiguous pose target source node`);
  const node = nodes[0], target = node.extras?.poseTarget;
  if (target == null) return null;
  const label = `${name}: pose target`, primitives = json.meshes?.[node.mesh]?.primitives;
  if (target.version !== 1 || target.kind !== 'seated' || !Number.isSafeInteger(target.deltaAccessor) || target.deltaAccessor < 0) fail(`${label} has an unsupported descriptor`);
  if (primitives?.length !== 1 || primitives[0].targets?.length || Object.keys(mesh.geometry.morphAttributes).length) fail(`${label} must be CPU-only on a single primitive`);
  const primitive = primitives[0], source = mesh.geometry.getAttribute('position');
  if (!Number.isSafeInteger(target.basePositionAccessor) || target.basePositionAccessor !== primitive.attributes?.POSITION) fail(`${label} does not reference its immutable base POSITION`);
  const base = json.accessors?.[target.basePositionAccessor];
  if (!source || source.itemSize !== 3 || base?.componentType !== 5126 || base.type !== 'VEC3' || !Number.isSafeInteger(base.count) || base.count <= 0 || base.count !== source.count) fail(`${label} has an incompatible base POSITION`);
  const activation = target.activation;
  if (!activation || activation.parentJoint !== 'hips' || !Array.isArray(activation.thighJoints) || activation.thighJoints.length !== 2 || activation.thighJoints[0] !== 'thigh_l' || activation.thighJoints[1] !== 'thigh_r' || activation.startRadians !== Math.PI / 4 || activation.fullRadians !== 4 * Math.PI / 9) fail(`${label} has an unsupported seated activation`);
  const accessor = json.accessors?.[target.deltaAccessor], view = json.bufferViews?.[accessor?.bufferView];
  const offset = accessor?.byteOffset ?? 0, length = source.count * 3;
  if (!accessor || accessor.componentType !== 5126 || accessor.type !== 'VEC3' || accessor.count !== source.count || accessor.normalized || accessor.sparse || !Number.isSafeInteger(accessor.bufferView) || accessor.bufferView < 0) fail(`${label} needs a packed Float32 VEC3 delta per source vertex`);
  if (!view || own(view, 'target') || own(view, 'byteStride') || (view.buffer ?? 0) !== 0 || !Number.isSafeInteger(view.byteLength) || view.byteLength < 0 || !Number.isSafeInteger(view.byteOffset ?? 0) || (view.byteOffset ?? 0) < 0 || (view.byteOffset ?? 0) % 4 || !Number.isSafeInteger(offset) || offset < 0 || offset % 4 || offset + length * 4 > view.byteLength) fail(`${label} has an invalid CPU buffer range`);
  let delta = deltas.get(target.deltaAccessor);
  if (!delta) {
    const buffer = await gltf.parser.getDependency('bufferView', accessor.bufferView);
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== view.byteLength || offset + length * 4 > buffer.byteLength) fail(`${label} has a truncated CPU buffer`);
    delta = new Float32Array(buffer, offset, length);
    if (!delta.every(Number.isFinite)) fail(`${label} contains a non-finite delta`);
    deltas.set(target.deltaAccessor, delta);
  }
  return Object.freeze({ version: 1, kind: 'seated', delta, activation: Object.freeze({
    parentJoint: activation.parentJoint, thighJoints: Object.freeze([...activation.thighJoints]),
    startRadians: activation.startRadians, fullRadians: activation.fullRadians,
  }) });
}

/** Owns wearable resources; original resident geometry, materials, bones and animation state are borrowed. */
export class WearLibrary {
  constructor(root = './assets/models/', options = {}) {
    this.root = root.endsWith('/') ? root : root + '/';
    this.manifest = null;
    this.garments = new Map();
    this.fits = new Map();
    this.pending = new Map();
    this.active = new Set();
    this.materials = new Map();
    this.bodyMaterials = new Map();
    this.atlas = null;
    this.ownsAtlas = false;
    this.disposed = false;
    this.loader = options.loader ?? null;
    this.textureLoader = options.textureLoader ?? null;
    this.fetchJson = options.fetchJson ?? (async (url) => {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) fail(`${url}: HTTP ${r.status}`);
      return r.json();
    });
    this._manifestLoad = null;
    this._atlasLoad = null;
  }

  _live() { if (this.disposed) fail('library has been disposed'); }

  /** Manifest-only parse for offline tests/preloaded assets. Does not fetch a file. */
  parse(manifest) {
    this._live();
    if (this.active.size || this.fits.size) fail('cannot replace a manifest while fits are loaded');
    if (!manifest || manifest.schemaVersion !== 1 || manifest.adultOnly !== true || manifest.defaultEnabled !== false) fail('manifest must be adult-only and disabled by default');
    if (!Array.isArray(manifest.garments) || !manifest.fits || !manifest.atlas?.file) fail('manifest is incomplete');
    const ids = new Set();
    for (const g of manifest.garments) {
      if (!own(WEAR_GARMENTS, g.id) || ids.has(g.id)) fail(`unknown or duplicate manifest garment ${g.id}`);
      ids.add(g.id);
    }
    if (ids.size !== Object.keys(WEAR_GARMENTS).length) fail('manifest is missing garments');
    for (const [id, fit] of Object.entries(manifest.fits)) {
      if (!isAdultWearFit(id)) fail(`manifest includes non-adult fit ${id}`);
      if (typeof fit.file !== 'string' || !/^wear\/[a-z0-9_]+\.glb(?:\.gz)?$/.test(fit.file)) fail(`${id}: invalid wearable file`);
      if (!fit.bodyNode || !fit.garments) fail(`${id}: incomplete fit`);
      for (const gid of ids) if (!fit.garments[gid]?.node || !fit.garments[gid]?.lodNode) fail(`${id}: missing near/far garment ${gid}`);
    }
    if (Object.keys(manifest.fits).length !== Object.keys(WEAR_FITS).length) fail('manifest is missing adult fits');
    if (manifest.atlas.file !== WEAR_POLICY.atlas.file) fail('unexpected wardrobe atlas');
    this.manifest = manifest;
    this.garments = new Map(manifest.garments.map((g) => [g.id, g]));
    return this;
  }

  /** Explicit opt-in. With no IDs, loads only the manifest; fits and textures stay lazy. */
  async load(ids = []) {
    this._live();
    if (!Array.isArray(ids)) fail('load expects an array of resident IDs');
    for (const id of ids) if (!isAdultWearFit(id)) fail(`cannot load non-adult fit ${id}`);
    if (!this.manifest) {
      this._manifestLoad ??= this.fetchJson(this.root + 'manifest.people-wear.json').then((m) => this.parse(m)).catch((e) => { this._manifestLoad = null; throw e; });
      await this._manifestLoad;
    }
    await Promise.all(ids.map((id) => this.loadFit(id)));
    return this;
  }

  setAtlas(texture, { owned = false } = {}) {
    this._live();
    if (!texture?.isTexture) fail('atlas must be a THREE.Texture');
    if (this.atlas && this.atlas !== texture && this.materials.size) fail('cannot replace an atlas after garment materials are in use');
    this.atlas = texture; this.ownsAtlas = owned;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    return this;
  }

  async _loadAtlas() {
    if (this.atlas) return this.atlas;
    this._atlasLoad ??= (this.textureLoader ??= new THREE.TextureLoader()).loadAsync(this.root + this.manifest.atlas.file).then((t) => {
      if (this.disposed) { t.dispose(); fail('library disposed while loading atlas'); }
      this.setAtlas(t, { owned: true }); return t;
    }).catch((e) => { this._atlasLoad = null; throw e; });
    return this._atlasLoad;
  }

  async loadFit(id) {
    this._live();
    if (!isAdultWearFit(id)) fail(`cannot load non-adult fit ${id}`);
    if (!this.manifest) await this.load();
    if (this.fits.has(id)) return this.fits.get(id);
    if (this.pending.has(id)) return this.pending.get(id);
    const pending = Promise.all([
      loadWearGltf(this.loader ??= new GLTFLoader(), this.root + this.manifest.fits[id].file),
      this._loadAtlas(),
    ]).then(async ([gltf]) => {
      if (this.disposed) { this._disposeGltf(gltf); fail('library disposed while loading a fit'); }
      try { return await this.parseFit(id, gltf); } catch (e) { this._disposeGltf(gltf); throw e; }
    }).finally(() => this.pending.delete(id));
    this.pending.set(id, pending);
    return pending;
  }

  /** Register real parsed GLBs without browser loading; useful to the independent validator. */
  async parseFit(id, gltf) {
    this._live();
    if (!isAdultWearFit(id) || !this.manifest?.fits[id]) fail(`unknown adult fit ${id}`);
    if (this.fits.has(id)) fail(`${id}: fit is already loaded`);
    const info = this.manifest.fits[id], declaredTargetBytes = info.poseTargetCpuBytes;
    if (declaredTargetBytes != null && (!Number.isSafeInteger(declaredTargetBytes) || declaredTargetBytes < 0)) fail(`${id}: invalid pose target CPU byte inventory`);
    const get = (name, required = true) => {
      const n = name && skinnedNode(gltf.scene, name);
      if (!n && required) fail(`${id}: missing skinned node ${name}`);
      return n || null;
    };
    const body = get(info.bodyNode), bodyLod = get(info.bodyLodNode, false);
    const identity = gltf.scene?.getObjectByName(info.identityNode ?? `wear_identity_${id}`);
    const ai = identity?.userData?.sourceIndicesAccessor;
    if (!identity || identity.isMesh || typeof identity.userData?.sourceNode !== 'string' || !Number.isInteger(ai) || ai < 0 || !gltf.parser?.getDependency) fail(`${id}: missing source identity index accessor`);
    const identityIndex = await gltf.parser.getDependency('accessor', ai);
    this._live();
    if (!identityIndex?.isBufferAttribute || identityIndex.itemSize !== 1 || identityIndex.normalized || !(identityIndex.array instanceof Uint16Array) || !identityIndex.count || identityIndex.count % 3 || identityIndex.array.length !== identityIndex.count) fail(`${id}: invalid source identity index accessor`);
    if (this.fits.has(id)) fail(`${id}: fit is already loaded`);
    const garments = new Map(), deltas = new Map(), poseTargets = new Map(), targetPools = new Map();
    for (const g of this.manifest.garments) {
      const a = info.garments[g.id];
      const source = { near: get(a.node), far: get(a.lodNode) };
      for (const [name, mesh] of [[a.node, source.near], [a.lodNode, source.far]]) {
        const target = await readPoseTarget(gltf, mesh, name, deltas), geometry = mesh.geometry;
        if (declaredTargetBytes > 0 && ['trousers', 'jeans', 'leggings'].includes(g.id) && !target) fail(`${name}: missing required seated pose target`);
        if (poseTargets.has(geometry) && poseTargets.get(geometry)?.delta !== target?.delta) fail(`${id}: shared geometry has conflicting pose targets`);
        // The correction wrapper pools geometries that borrow the same position
        // and skin attributes. Such a pool must have one target too, even when
        // the geometries have different indices, UVs or material assignments.
        const p = geometry.getAttribute('position'), j = geometry.getAttribute('skinIndex'), w = geometry.getAttribute('skinWeight');
        let pools = targetPools.get(p); if (!pools) targetPools.set(p, pools = []);
        const shared = pools.find((row) => row.j === j && row.w === w);
        if (shared && shared.delta !== target?.delta) fail(`${id}: shared position/skin pool has conflicting pose targets`);
        if (!shared) pools.push({ j, w, delta: target?.delta });
        poseTargets.set(geometry, target);
      }
      garments.set(g.id, source);
    }
    const actualTargetBytes = [...new Set(deltas.values())].reduce((sum, delta) => sum + delta.byteLength, 0);
    if (declaredTargetBytes != null && declaredTargetBytes !== actualTargetBytes) fail(`${id}: pose target CPU byte inventory disagrees with its binary`);
    // Resolving CPU views is asynchronous. Commit no descriptors or fit until
    // every target passes, and recheck disposal/concurrent offline registration.
    this._live();
    if (this.fits.has(id)) fail(`${id}: fit is already loaded`);
    for (const [geometry, target] of poseTargets) {
      if (target) geometry.userData.poseTarget = target;
      else delete geometry.userData.poseTarget;
    }
    const fit = { id, info, gltf, body, bodyLod, identity, identityIndex, identityGeometries: new Map(), garments };
    this.fits.set(id, fit);
    return fit;
  }

  _material(variant, vertexColors = false) {
    // Near/far and different builds can omit COLOR_0 independently. Compiling
    // USE_COLOR without the attribute makes StandardMaterial multiply by black.
    const key = `${variant}|${vertexColors ? 'colour' : 'plain'}`;
    if (this.materials.has(key)) return this.materials.get(key);
    const v = WEAR_VARIANTS[variant];
    const material = new THREE.MeshStandardMaterial({ name: 'wear_' + variant, vertexColors, roughness: v.roughness ?? 0.95, metalness: 0, side: THREE.DoubleSide });
    if (this.atlas) {
      // Texture clones share one Source/image and therefore one GPU atlas; only the UV matrix differs.
      const map = this.atlas.clone(), a = WEAR_POLICY.atlas, [w, h] = a.size, [cols, rows] = a.grid, inset = a.insetPixels;
      map.source = this.atlas.source;
      map.offset.set(v.tile[0] / cols + inset / w, v.tile[1] / rows + inset / h);
      map.repeat.set(1 / cols - 2 * inset / w, 1 / rows - 2 * inset / h);
      map.needsUpdate = true; map.updateMatrix();
      material.map = map; material.color.setHex(0xffffff);
    } else material.color.set(v.color); // Offline parsers and intentionally texture-free inspection preserve the palette tint.
    this.materials.set(key, material);
    return material;
  }

  _bodyMaterial(fit, inst) {
    const source = fit.body.material, hex = inst.variant?.skin, slot = inst.meta.slots?.skin;
    if (!hex || !slot) return source;
    if (Array.isArray(source) || !source?.color) fail(`${inst.id}: optional body needs one skin material`);
    const key = `${fit.id}|${hex}`;
    if (this.bodyMaterials.has(key)) return this.bodyMaterials.get(key);
    const ratio = slotRatio(slot, hex);
    if (!ratio.every((v) => Number.isFinite(v) && v >= 0)) fail(`${inst.id}: invalid existing skin variant`);
    const material = source.clone();
    material.name = `${source.name}_${fit.id}_${hex}`;
    // The original face tile carries the baked skin tone and white vertex colour;
    // recolourAttribute clamps that multiplier to one. Match its darker/warmer
    // ratios, including the same upper clamp, on this untextured body's tint.
    material.color.setRGB(source.color.r * Math.min(1, ratio[0]), source.color.g * Math.min(1, ratio[1]), source.color.b * Math.min(1, ratio[2]), THREE.LinearSRGBColorSpace);
    this.bodyMaterials.set(key, material);
    return material;
  }

  _mesh(source, original, material, label) {
    const mesh = new THREE.SkinnedMesh(source.geometry, material);
    mesh.name = label;
    mesh.position.copy(original.position); mesh.quaternion.copy(original.quaternion); mesh.scale.copy(original.scale);
    mesh.bindMode = original.bindMode;
    mesh.bind(original.skeleton, original.bindMatrix);
    mesh.frustumCulled = original.frustumCulled;
    mesh.boundingBox = original.boundingBox?.clone() ?? null;
    mesh.boundingSphere = original.boundingSphere?.clone() ?? null;
    mesh.receiveShadow = original.receiveShadow; mesh.castShadow = original.castShadow;
    mesh.renderOrder = original.renderOrder;
    return mesh;
  }

  _identity(fit, inst) {
    // The original near mesh owns the expensive head attributes. Neither a current
    // far LOD nor a previously dressed body may become this source accidentally.
    const source = skinnedNode(inst.meta.node, fit.identity.userData.sourceNode);
    if (!source) fail(`${inst.id}: original near identity source is missing`);
    validateWearBinding(source, inst.mesh, 'original identity');
    // CharacterLibrary retains its exact near variant before any LOD swap. Using
    // the un-recoloured template here could upload an extra full colour buffer,
    // and would lose a caller's existing skin tint. Custom instances must supply
    // the same retained near reference; silently allocating a substitute is unsafe
    // for this library's measured GPU budget.
    const near = inst.nearGeometry;
    if (!near?.isBufferGeometry || near.attributes.position !== source.geometry.attributes.position || near.attributes.skinIndex !== source.geometry.attributes.skinIndex || near.attributes.skinWeight !== source.geometry.attributes.skinWeight) fail(`${inst.id}: original near variant geometry is missing or incompatible`);
    const indices = fit.identityIndex.array, count = near.attributes.position.count;
    if (indices.some((i) => i >= count)) fail(`${inst.id}: source identity index outside original near mesh`);
    let geometry = fit.identityGeometries.get(near);
    if (!geometry) {
      geometry = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(near.attributes)) geometry.setAttribute(name, attr);
      geometry.setIndex(fit.identityIndex);
      geometry.boundingBox = near.boundingBox?.clone() ?? null;
      geometry.boundingSphere = near.boundingSphere?.clone() ?? null;
      fit.identityGeometries.set(near, geometry);
    }
    return { geometry };
  }

  /** Replace a complete outfit atomically after all IDs, colours, slots and skin bindings pass. Empty restores. */
  dress(inst, items, options = {}) {
    this._live();
    if (!inst?.mesh?.isSkinnedMesh) fail('dress requires a live CharacterLibrary instance');
    const normalized = validateOutfit(inst.id, items, options);
    if (!normalized.length) return this.restore(inst);
    if (inst.meta?.id !== inst.id || inst.meta?.kind !== WEAR_FITS[inst.id].kind || (inst.meta?.tags ?? []).some((t) => CHILD_TAGS.has(t))) fail(`${inst.id}: live resident metadata does not match its adult fit`);
    const fit = this.fits.get(inst.id);
    if (!fit) fail(`${inst.id}: call loadFit before dress`);
    const original = inst.mesh;
    if (!original.parent) fail(`${inst.id}: resident mesh has no parent`);
    if (typeof inst.mixer?.update !== 'function' || !Object.isExtensible(inst.mixer)) fail(`${inst.id}: a mutable existing animation mixer is required`);
    const mixerDescriptor = Object.getOwnPropertyDescriptor(inst.mixer, 'update');
    if (mixerDescriptor && (!own(mixerDescriptor, 'value') || !mixerDescriptor.writable)) fail(`${inst.id}: animation mixer update cannot be wrapped`);
    const currentLod = inst.lod ?? 0, currentVisible = original.visible;
    if (currentLod !== 0 && currentLod !== 1) fail(`invalid current LOD ${currentLod}`);
    const sources = [fit.body, fit.bodyLod, ...normalized.flatMap((g) => { const p = fit.garments.get(g.id); return [p.near, p.far]; })].filter(Boolean);
    for (const source of sources) validateWearBinding(source, original, source.name);
    const bodyMaterial = this._bodyMaterial(fit, inst);
    const originalMaterial = inst.wear?.saved?.material ?? original.material;
    const identity = this._mesh(this._identity(fit, inst), original, originalMaterial, `wear_live_identity_${inst.id}`);
    const meshes = normalized.map((g) => {
      const source = fit.garments.get(g.id);
      return { ...g, mesh: this._mesh(source.near, original, this._material(g.variant, source.near.geometry.hasAttribute('color')), `wear_live_${g.id}_${inst.id}`), source };
    });
    const correction = createWearCorrection(inst, fit, meshes);
    // Run the initial clearance pass before committing anything. A malformed fit
    // or an unsolvable pose leaves the preceding wardrobe and mixer hook intact.
    try { correction.update({ force: true }); } catch (error) { correction.dispose(); throw error; }
    // No appearance changes to the resident have happened above.
    if (inst.wear) inst.wear.library.restore(inst);
    const saved = { geometry: original.geometry, material: original.material, visible: original.visible, castShadow: original.castShadow, lod: inst.lod };
    const mixerUpdate = inst.mixer.update, mixerUpdateDescriptor = Object.getOwnPropertyDescriptor(inst.mixer, 'update');
    const state = { library: this, fit, items: normalized, context: options.context ?? 'daily', saved, identity, meshes, correction, mixerUpdate, mixerUpdateDescriptor };
    state.mixerHook = function (...args) {
      const result = mixerUpdate.apply(this, args);
      // Animation callbacks can replace this wardrobe before the mixer applies
      // its final bone bindings. Update whichever wardrobe owns the instance
      // now, including a different library, and safely skip an explicit restore.
      const active = inst.wear;
      if (active) active.library.update(inst);
      return result;
    };
    original.geometry = fit.body.geometry; original.material = bodyMaterial; original.visible = currentVisible;
    identity.visible = currentVisible;
    for (const g of meshes) g.mesh.visible = currentVisible;
    original.parent.add(identity, ...meshes.map((g) => g.mesh));
    inst.wear = state; this.active.add(inst);
    // Three uploads attributes before mesh.onBeforeRender. Updating directly
    // after the existing mixer ensures the corrected streams reach this frame's
    // colour and shadow passes without a one-frame penetration lag.
    inst.mixer.update = state.mixerHook;
    // Replacing an already worn outfit must retain the camera's current LOD,
    // although restore() deliberately retains the earlier original-look snapshot.
    this.setLod(inst, currentLod, true);
    return state;
  }

  /** After manual bone/IK edits, update before renderer.render(). Normal game
   * animation is covered automatically by the existing mixer.update() call. */
  update(inst, options = {}) {
    this._live();
    const state = inst?.wear;
    if (!state || state.library !== this) return false;
    try { return state.correction.update(options); }
    catch (error) { this.restore(inst); throw error; }
  }

  /** Called by CharacterLibrary.setLod only while this instance has explicitly opted in. */
  setLod(inst, lod, force = false) {
    this._live();
    if (lod !== 0 && lod !== 1) fail(`invalid LOD ${lod}`);
    const s = inst?.wear;
    if (!s || s.library !== this || (!force && inst.lod === lod)) return false;
    inst.mesh.geometry = (lod === 1 ? s.fit.bodyLod ?? s.fit.body : s.fit.body).geometry;
    // The identity always borrows the original near head; its one index buffer is
    // shared by both garment LODs, preserving the resident's existing face.
    for (const g of s.meshes) {
      g.mesh.geometry = s.correction.geometry(g, lod);
      g.mesh.material = this._material(g.variant, g.mesh.geometry.hasAttribute('color'));
      g.mesh.castShadow = lod === 0;
    }
    inst.mesh.castShadow = s.identity.castShadow = lod === 0;
    inst.lod = lod;
    this.update(inst);
    return true;
  }

  /** Restore the exact pre-wardrobe geometry/material references and leave mixer, bones and props untouched. */
  restore(inst) {
    const s = inst?.wear;
    if (!s || s.library !== this) return false;
    if (s.mixerUpdateDescriptor) Object.defineProperty(inst.mixer, 'update', s.mixerUpdateDescriptor);
    else delete inst.mixer.update;
    s.identity.removeFromParent();
    for (const g of s.meshes) g.mesh.removeFromParent();
    inst.mesh.geometry = s.saved.geometry; inst.mesh.material = s.saved.material;
    inst.mesh.visible = s.saved.visible; inst.mesh.castShadow = s.saved.castShadow; inst.lod = s.saved.lod;
    delete inst.wear; this.active.delete(inst);
    s.correction.dispose();
    return true;
  }

  _disposeGltf(gltf, seen = { geometry: new Set(), material: new Set(), texture: new Set() }) {
    gltf?.scene?.traverse((o) => {
      if (o.geometry && !seen.geometry.has(o.geometry)) { seen.geometry.add(o.geometry); o.geometry.dispose(); }
      for (const mat of array(o.material).filter(Boolean)) {
        if (seen.material.has(mat)) continue;
        seen.material.add(mat);
        for (const value of Object.values(mat)) if (value?.isTexture && !seen.texture.has(value)) { seen.texture.add(value); value.dispose(); }
        mat.dispose();
      }
    });
    return seen;
  }

  dispose() {
    if (this.disposed) return;
    for (const inst of [...this.active]) this.restore(inst);
    const seen = { geometry: new Set(), material: new Set(), texture: new Set() };
    for (const fit of this.fits.values()) {
      const ownedStreams = new Set();
      fit.gltf.scene.traverse((node) => {
        if (!node.geometry) return;
        for (const attribute of Object.values(node.geometry.attributes)) ownedStreams.add(attribute);
        if (node.geometry.index) ownedStreams.add(node.geometry.index);
      });
      ownedStreams.add(fit.identityIndex);
      this._disposeGltf(fit.gltf, seen);
      for (const geometry of fit.identityGeometries.values()) {
        // Garment templates are never rendered, so disposing their source
        // geometry alone cannot notify Three's renderer about borrowed wardrobe
        // streams. The retained identity wrapper is registered whenever garments
        // render: it is attached first with matching visibility, layers and bounds.
        // At final library disposal it owns this cleanup. Remove every original
        // resident attribute, then expose only wardrobe-owned streams to Three's
        // dispose listener. InterleavedBufferAttributes retain their shared .data
        // identity; index attributes work here because removal uses buffer identity,
        // not the attribute's shader name. No temporary attribute is ever uploaded.
        // Every wrapper is notified to cover every renderer that used this fit.
        for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
        let number = 0;
        for (const attribute of ownedStreams) geometry.setAttribute(`wear_dispose_${number++}`, attribute);
        geometry.dispose();
        for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
      }
      fit.identityGeometries.clear();
    }
    for (const material of this.materials.values()) { material.map?.dispose(); material.dispose(); }
    for (const material of this.bodyMaterials.values()) material.dispose();
    if (this.ownsAtlas) this.atlas?.dispose();
    this.fits.clear(); this.materials.clear(); this.bodyMaterials.clear(); this.garments.clear(); this.manifest = null; this.atlas = null;
    this.disposed = true;
  }
}
