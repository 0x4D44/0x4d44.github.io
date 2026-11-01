// Optional future-consumer helper. Nothing imports this from the game boot path.
// THREE is supplied by the caller (r180). Images remain outside the GLBs.
export const SHARED_CELL_ALIASES = Object.freeze({ paint: 'paint_uk', porcelain: 'porcelain_brown', rust: 'rusted_steel', concrete: 'concrete_clean', concrete_weathered: 'concrete_damp', oil: 'oil_stain', render: 'rendered_block', dark: 'steel_dark', vegetation: 'dry_vegetation' });
const SHARED_TEXTURES = new WeakMap();

/** Map a freshly made 0..1 primitive (for example a catenary cylinder) into a cell. */
export function mapSubstationUvs(geometry, atlas, materialName) {
  const key = materialName.replace(/^substation_/, ''), cell = atlas.shared.cells[SHARED_CELL_ALIASES[key] ?? key];
  if (!cell || !geometry.attributes.uv) throw new Error('Primitive needs UVs and a known substation material');
  const uv = geometry.attributes.uv, [u0, v0, u1, v1] = cell.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  uv.needsUpdate = true; return geometry;
}

/** Load a variant once; reuse the returned materials across all instances. */
export async function loadSubstationMaterials(THREE, atlas, variant, textureBase) {
  if (!['uk', 'co'].includes(variant)) throw new RangeError('Substation variant must be uk or co');
  const loader = new THREE.TextureLoader(), paths = ['baseColor', 'normal', 'orm'];
  let cache = SHARED_TEXTURES.get(THREE); if (!cache) SHARED_TEXTURES.set(THREE, cache = new Map());
  const cacheKey = new URL(textureBase).href + paths.map(k => atlas.shared[k].sha256).join(':');
  let shared = cache.get(cacheKey);
  if (!shared) {
    shared = { users: 0, promise: Promise.all(paths.map(async key => {
      const map = await loader.loadAsync(new URL(atlas.shared[key].path, textureBase).href);
      // This library deliberately uses bottom-origin UVs; it has no GLTF image bindings.
      map.flipY = true; map.colorSpace = key === 'baseColor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; map.anisotropy = 4;
      return [key, map];
    })).then(Object.fromEntries) }; cache.set(cacheKey, shared);
  }
  shared.users++;
  let maps, signs;
  try { maps = await shared.promise; signs = await loader.loadAsync(new URL(atlas.variants[variant].atlas.path, textureBase).href); }
  catch (error) { if (--shared.users === 0) { if (maps) Object.values(maps).forEach(t => t.dispose()); cache.delete(cacheKey); } throw error; }
  signs.flipY = true; signs.colorSpace = THREE.SRGBColorSpace; signs.anisotropy = 4;
  const materials = new Map(), clones = new Set();
  const shifted = (map, du, dv) => {
    if (!du && !dv) return map;
    const t = map.clone(); t.offset.set(du, dv); t.needsUpdate = true; clones.add(t); return t;
  };
  function get(name, overrideCell) {
    const materialKey = name + (overrideCell ? ':' + overrideCell : '');
    if (materials.has(materialKey)) return materials.get(materialKey);
    if (name === 'substation_signs') {
      const m = new THREE.MeshStandardMaterial({ name, map: signs, roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide }); materials.set(materialKey, m); return m;
    }
    const bare = name.replace(/^substation_/, ''), source = atlas.shared.cells[SHARED_CELL_ALIASES[bare] ?? bare];
    const binding = atlas.variants[variant].materials[name], dest = overrideCell ? atlas.shared.cells[overrideCell] : binding?.cell ? atlas.shared.cells[binding.cell] : source;
    if (!source || !dest) throw new Error(`Unknown substation atlas cell for ${name}`);
    const du = dest.uv[0] - source.uv[0], dv = dest.uv[1] - source.uv[1];
    const orm = shifted(maps.orm, du, dv);
    const m = new THREE.MeshStandardMaterial({ name, map: shifted(maps.baseColor, du, dv), normalMap: shifted(maps.normal, du, dv),
      roughnessMap: orm, metalnessMap: orm, aoMap: orm, roughness: 1, metalness: 1, normalScale: new THREE.Vector2(0.35, 0.35), vertexColors: false });
    // AO uses UV0 (the atlas), rather than requiring a redundant second UV accessor.
    orm.channel = 0;
    if (bare === 'glass') { m.roughness = 0.35; m.metalness = 0.2; }
    if (bare === 'lamp') { m.emissive.set('#e5d8a4'); m.emissiveIntensity = 0.15; }
    materials.set(materialKey, m); return m;
  }
  let disposed = false;
  return {
    get,
    apply(root, overrides = {}) { root.traverse(n => { if (n.isMesh) { const bind = m => get(m.name, overrides[m.name]?.cell); n.material = Array.isArray(n.material) ? n.material.map(bind) : bind(n.material); n.castShadow = true; n.receiveShadow = true; } }); return root; },
    dispose() { if (disposed) return; disposed = true; materials.forEach(m => m.dispose()); signs.dispose(); clones.forEach(t => t.dispose()); if (--shared.users === 0) { Object.values(maps).forEach(t => t.dispose()); cache.delete(cacheKey); } },
  };
}
