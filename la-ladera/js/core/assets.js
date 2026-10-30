// GLB asset registry (Blender -> glTF). Furniture / props / architectural parts are authored in Blender,
// exported as GLB with NO embedded textures: each mesh's glTF material NAME is a library material name
// (see core/matlib.js), so assets stay tiny and share the texture library. UVs of 'metric' materials
// are in metres (box projection), UVs of 'unit' (decal) materials are 0..1.
//
// assets/models/manifest.json   { "files": ["manifest.furniture.json", "manifest.props.json", ...] }
// manifest.<set>.json           { "files": [ { "glb": "furniture/set_a.glb",
//                                    "assets": { "bed_double": { "node": "bed_double", "tags": ["bed"], "footprint": [1.5, 2.0] } } } ] }
// Each asset = one top-level node of the GLB; its origin is the asset origin (floor level, centre or back).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Assets {
  constructor(ctx) {
    this.ctx = ctx; this.entries = new Map(); this.loader = new GLTFLoader();
    this.inflight = new Map();     // glb path -> Promise<gltf>
    this.loaded = new Map();       // glb path -> gltf (resolved)
    this.partCache = new Map(); this.missing = new Set(); this.root = './assets/models/';
  }

  /**
   * Read the manifests. `read(relPath)` returns parsed JSON or null; the default fetches from the page.
   * Node tests pass a reader that loads the same files from disk, so furnishing logic (which only needs the
   * manifest metadata - size, footprint, tags - never the GLB bytes) can be tested without a browser.
   */
  async init(read = (p) => fetch(this.root + p, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)) {
    const root = await read('manifest.json');
    for (const f of root?.files ?? []) {
      try {
        const m = await read(f);
        for (const set of m?.files ?? []) {
          for (const [name, meta] of Object.entries(set.assets ?? {})) this.entries.set(name, { name, glb: set.glb, node: meta.node ?? name, ...meta });
        }
      } catch (e) { console.warn('[assets] manifest', f, e); }
    }
  }

  has(name) { return this.entries.has(name); }
  names(tag) { return [...this.entries.values()].filter((e) => !tag || e.tags?.includes(tag)).map((e) => e.name); }
  meta(name) { return this.entries.get(name); }

  /** Raw GLTF result of a file under assets/models/ (cached). Use for skinned characters etc. */
  load(path) {
    let p = this.inflight.get(path);
    if (!p) {
      p = this.loader.loadAsync(this.root + path).then((g) => {
        g.scene.updateMatrixWorld(true); this.loaded.set(path, g); return g;
      }).catch((e) => {
        // A temporary download/parse failure must not poison the cache for the whole session.
        this.inflight.delete(path);
        throw e;
      });
      this.inflight.set(path, p);
    }
    return p;
  }

  /** Load every GLB that contains the given asset names (all assets when omitted). Call before parts()/place(). */
  async preload(names) {
    const files = new Set([...this.entries.values()].filter((e) => !names || names.includes(e.name)).map((e) => e.glb));
    await Promise.all([...files].map((f) => this.load(f).catch((e) => console.warn('[assets] failed', f, e))));
  }

  /** Flattened mesh parts of an asset in asset-local space: [{ geometry, matKey }]. Requires preload(). */
  parts(name) {
    const hit = this.partCache.get(name);
    if (hit) return hit;
    const e = this.entries.get(name), gl = e && this.loaded.get(e.glb);
    if (!gl) {
      if (!this.missing.has(name)) { this.missing.add(name); console.warn(`[assets] missing asset '${name}'`); }
      const g = new THREE.BoxGeometry(0.4, 0.4, 0.4); g.translate(0, 0.2, 0);
      return [{ geometry: g, matKey: 'missing_asset' }];
    }
    const node = gl.scene.getObjectByName(e.node);
    if (!node) { console.warn(`[assets] node '${e.node}' not found in ${e.glb}`); return []; }
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert(), out = [];
    node.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      out.push({ geometry: g, matKey: (Array.isArray(o.material) ? o.material[0] : o.material).name || 'missing_asset' });
    });
    this.partCache.set(name, out);
    return out;
  }

  /** Bounding box of an asset in its own space. */
  box(name) {
    const b = new THREE.Box3();
    for (const p of this.parts(name)) { p.geometry.computeBoundingBox(); b.union(p.geometry.boundingBox); }
    return b;
  }

  /** Bake an asset into a MeshBuilder. o.tints = { materialName: 0xRRGGBB } tints just those parts. */
  place(builder, name, matrix, o = {}) {
    for (const p of this.parts(name)) {
      const t = o.tints?.[p.matKey];
      builder.geometry(t != null ? `${p.matKey}#${t.toString(16).padStart(6, '0')}` : p.matKey, p.geometry, matrix, o);
    }
  }

  /** A live clone (for things that move or animate: doors, fans, TVs). Materials come from the library. */
  instance(name) {
    const e = this.entries.get(name), gl = e && this.loaded.get(e.glb);
    const node = gl?.scene.getObjectByName(e.node);
    if (!node) return new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), this.ctx.mat('missing_asset'));
    const c = node.clone(true);
    c.traverse((o) => {
      if (!o.isMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      o.material = this.ctx.mat(m.name || 'missing_asset'); o.castShadow = o.receiveShadow = true;
    });
    c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1);
    return c;
  }
}
