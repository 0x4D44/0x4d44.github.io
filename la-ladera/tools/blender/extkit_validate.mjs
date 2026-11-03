// Independent release gate for the dormant exterior kit. Geometry is decoded
// from the shipped GLB buffers by the repository's existing binary inspector;
// no builder, Blender scene or claimed triangle/GPU totals are trusted.
import '../../tests/nice.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGlb, inspectGlb, inspectPng } from './substation2_validate.mjs';
import { inspectKtx2, decodeKtx2, seamMetrics } from './extkit_texture_codec.mjs';

// Reuse the shared, independently implemented binary readers, not copies of
// them. These exports let the corruption tests exercise the actual readers.
export { parseGlb, inspectGlb, inspectPng, inspectKtx2, decodeKtx2, seamMetrics };
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const MANIFEST = 'assets/models/manifest.extkit.json';
export const CATALOGUE = 'tools/blender/extkit.catalog.json';
export const MATERIALS = 'assets/models/extkit/materials.json';
export const MAX_GLB_BYTES = 4_500_000;
export const MAX_TEXTURE_BYTES = 8_000_000;
export const MAX_GPU_BYTES = 40_000_000;
export const MAX_NEAR_TRIANGLES = 6000;
export const MAX_SMALL_TRIANGLES = 2000;
export const MAX_LOD_RATIO = 0.4;
export const MAX_DESIGNS = 120;

// Acceptance coverage is defined independently of the producer. Removing a
// family from both catalogue and packed files cannot make --complete pass.
export const REQUIRED_FAMILIES = Object.freeze({
  water_tank: 14, laundry: 4, satellite_dish: 3, tv_aerial: 1, rebar: 6,
  gas_cage: 1, pipe: 4, drain: 4, meter_box: 1, transformer: 1,
  cable_segment: 1, chalkboard: 1, grille: 8, shutter_box: 1, plant: 6, lattice: 3,
});
export const SMALL_FAMILIES = Object.freeze([
  'satellite_dish', 'tv_aerial', 'rebar', 'pipe', 'drain', 'meter_box',
  'cable_segment', 'chalkboard', 'grille', 'shutter_box', 'plant',
]);
export const WALL_IDS = Object.freeze([
  'azul_anil', 'turquesa', 'amarillo_ocre', 'terracota', 'verde_menta', 'rosado',
  'tolete', 'tolete_humedo', 'bloque', 'baldosin', 'panete', 'cal',
].map((id) => `extkit_wall_${id}`));
const SMALL = new Set(SMALL_FAMILIES);
const MODEL_PREFIX = 'assets/models/extkit/';
const TEXTURE_PREFIX = 'assets/textures/extkit/';
const check = (ok, message) => { if (!ok) throw new Error(message); };
const natural = (n) => Number.isSafeInteger(n) && n >= 0;
const vector = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const positive = (a, n) => vector(a, n) && a.every((x) => x > 0);
const equal = (a, b, tolerance = 0.002) => vector(a, b?.length) && a.every((x, i) => Math.abs(x - b[i]) <= tolerance);
const jsonFile = (path) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const serialEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Resolve a declared path without permitting traversal or symlink escape. */
export function contained(root, name, label = 'file') {
  check(typeof name === 'string' && name.length > 0 && !isAbsolute(name) && !name.includes('\\') && !name.split('/').includes('..'), `${label}: path must stay within its namespace`);
  const path = resolve(root, name), base = realpathSync(root);
  check(existsSync(path) && statSync(path).isFile(), `${label}: missing file ${name}`);
  const actual = realpathSync(path);
  check(actual.startsWith(base + sep), `${label}: symlink escapes namespace`);
  return path;
}

export function filesBelow(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    check(!entry.isSymbolicLink(), `symlink is not an asset: ${path}`);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function checkDrawnStrings(value, label) {
  check(Array.isArray(value) && value.every((s) => typeof s === 'string'), `${label}: explicit drawnStrings list required`);
  check(new Set(value).size === value.length, `${label}: duplicate drawn string`);
  for (const text of value) {
    check(text.length > 0 && text === text.normalize('NFC') && !/[\uFFFD\u0000-\u001F]/u.test(text), `${label}: drawn Spanish strings must be valid NFC Unicode`);
    // The delivered kit has no lettering: the chalkboard's atlas cell is
    // deliberately blank. New lettering requires an explicit Spanish review.
    check(false, `${label}: unreviewed drawn string ${JSON.stringify(text)}; review Colombian Spanish before adding lettering`);
  }
}

export function validateCatalogue(catalogue, { complete = true } = {}) {
  check(catalogue?.version === 1 && catalogue.units === 'm' && catalogue.axes === '+Y up, +Z front' && catalogue.libraryOnly === true, 'catalogue requires version 1, metre units, +Y up, +Z front and libraryOnly');
  check(typeof catalogue.origin === 'string' && /centr|center/i.test(catalogue.origin) && /base|floor/i.test(catalogue.origin), 'catalogue must declare floor-centred origin');
  check(Array.isArray(catalogue.assets) && catalogue.assets.length > 0 && catalogue.assets.length <= MAX_DESIGNS, `catalogue requires 1..${MAX_DESIGNS} designs`);
  checkDrawnStrings(catalogue.drawnStrings, 'catalogue');
  const entries = new Map(), families = new Map();
  for (const item of catalogue.assets) {
    check(/^extkit_[a-z0-9_]+$/.test(item.id) && !item.id.endsWith('_lod1') && !entries.has(item.id), 'invalid/duplicate catalogue id');
    check(positive(item.size, 3) && item.size.every((v) => v <= 12), `${item.id}: invalid metre envelope`);
    check(Object.hasOwn(REQUIRED_FAMILIES, item.family), `${item.id}: unknown family ${item.family}`);
    check(typeof item.smallProp === 'boolean' && item.smallProp === SMALL.has(item.family), `${item.id}: small-prop classification does not match independent family policy`);
    check(Array.isArray(item.features) && item.features.length > 0 && item.features.every((v) => typeof v === 'string' && v.length > 0), `${item.id}: explicit design features required`);
    check(item.params && typeof item.params === 'object' && !Array.isArray(item.params), `${item.id}: catalogue modelling parameters required`);
    const a = item.anchors;
    check(a && ['rear', 'floor', 'pole'].includes(a.wallSide), `${item.id}: invalid attachment wall side`);
    check(vector(a.heightRange, 2) && a.heightRange[0] >= 0 && a.heightRange[1] >= a.heightRange[0] && a.heightRange[1] <= 30, `${item.id}: invalid height range above floor`);
    check(Number.isFinite(a.wallClearance) && a.wallClearance >= 0 && a.wallClearance <= 2, `${item.id}: invalid wall clearance`);
    check(Array.isArray(a.facadeZones) && a.facadeZones.length > 0 && new Set(a.facadeZones).size === a.facadeZones.length && a.facadeZones.every((zone) => ['back', 'side', 'roof'].includes(zone)), `${item.id}: invalid facade zones`);
    check(vector(a.position, 3) && vector(a.normal, 3) && Math.abs(Math.hypot(...a.normal) - 1) <= 0.00001, `${item.id}: finite attachment position and unit normal required`);
    check(Math.abs(a.position[0]) <= item.size[0] / 2 + 0.01 && a.position[1] >= -0.01 && a.position[1] <= item.size[1] + 0.01 && Math.abs(a.position[2]) <= item.size[2] / 2 + a.wallClearance + 0.01, `${item.id}: attachment lies outside the piece envelope`);
    if (item.family === 'cable_segment') check(Math.max(...item.size) <= 1.05, `${item.id}: cables must be short instancing segments, not long facade meshes`);
    entries.set(item.id, item);
    if (!families.has(item.family)) families.set(item.family, []);
    families.get(item.family).push(item);
  }
  if (complete) {
    for (const [family, minimum] of Object.entries(REQUIRED_FAMILIES)) check((families.get(family)?.length ?? 0) >= minimum, `required family ${family}: needs at least ${minimum} designs`);
    const tanks = families.get('water_tank');
    check(new Set(tanks.map((v) => v.params.volumeLitres)).size === 3 && [500, 1000, 2000].every((n) => tanks.some((v) => v.params.volumeLitres === n)), 'water tanks must cover 500, 1000 and 2000 litres');
    check(new Set(tanks.map((v) => v.params.colour)).size === 2, 'water tanks must cover two colours');
    check(tanks.every((v) => ['blue', 'black'].includes(v.params.colour)), 'water tank colours must be blue and black');
    for (const litres of [500, 1000, 2000]) for (const colour of ['blue', 'black']) for (const stand of ['steel', 'block']) check(tanks.some((v) => v.params.volumeLitres === litres && v.params.colour === colour && v.params.stand === stand), `water tanks missing ${litres} litre ${colour} ${stand} stand`);
    const rebars = families.get('rebar'), lengths = new Set(rebars.map((v) => v.params.length));
    check(lengths.size === 3 && [...lengths].every((v) => Number.isFinite(v) && v > 0), 'rebar must cover three positive lengths');
    check(rebars.every((v) => ['light', 'heavy'].includes(v.params.rustLevel)), 'rebar must use two declared rust levels');
    for (const length of lengths) for (const rustLevel of ['light', 'heavy']) check(rebars.some((v) => v.params.length === length && v.params.rustLevel === rustLevel), `rebar missing length ${length} rust ${rustLevel}`);
    for (const family of ['pipe', 'drain']) for (const shape of ['straight', 'elbow', 'tee', 'bracket']) check(families.get(family).some((v) => v.params.shape === shape), `${family} missing ${shape}`);
    check(new Set(families.get('laundry').map((v) => v.params.shape)).size >= 4, 'laundry requires four distinct arrangements');
    check(new Set(families.get('satellite_dish').map((v) => v.params.radius)).size >= 3 && families.get('satellite_dish').every((v) => Number.isFinite(v.params.radius) && v.params.radius > 0), 'satellite dishes require three sizes');
    check(new Set(families.get('grille').map((v) => v.params.pattern)).size >= 8, 'window grilles require eight distinct patterns');
    check(new Set(families.get('plant').map((v) => v.params.kind)).size >= 6 && families.get('plant').every((v) => typeof v.params.kind === 'string' && v.params.kind.length > 0), 'potted plants require six distinct kinds');
    check(new Set(families.get('lattice').map((v) => v.params.pattern)).size >= 3, 'breeze-block lattice requires three patterns');
  }
  return entries;
}

export function validateMaterialDefinitions(materials, { complete = true } = {}) {
  check(materials?.version === 1 && materials.atlas && materials.materials && typeof materials.materials === 'object', 'materials require version 1, shared atlas and named material definitions');
  checkDrawnStrings(materials.drawnStrings, 'materials');
  const atlas = materials.atlas;
  for (const field of ['size', 'normalSize', 'ormSize']) check(positive(atlas[field], 2) && atlas[field].every((n) => natural(n) && n <= 2048), `atlas ${field} exceeds 2048 pixels`);
  check(equal(atlas.size, atlas.normalSize, 0) && equal(atlas.size, atlas.ormSize, 0), 'shared atlas PBR planes must have matching dimensions');
  check(natural(atlas.gutterPixels) && atlas.gutterPixels >= 2, 'shared atlas requires at least a two-pixel gutter');
  check(atlas.tiles && Object.keys(atlas.tiles).length === 16, 'shared atlas requires sixteen surface cells');
  check(Object.keys(materials.materials).length === 16, 'shared atlas requires sixteen named materials');
  const rectangles = [];
  for (const [key, rect] of Object.entries(atlas.tiles)) {
    check(/^extkit_[a-z0-9_]+$/.test(key) && vector(rect, 4) && rect.every((v) => v >= 0 && v <= 1) && rect[0] < rect[2] && rect[1] < rect[3], `invalid atlas rectangle ${key}`);
    for (const [other, r] of rectangles) check(Math.min(rect[2], r[2]) <= Math.max(rect[0], r[0]) || Math.min(rect[3], r[3]) <= Math.max(rect[1], r[1]), `atlas tiles overlap: ${key} and ${other}`);
    rectangles.push([key, rect]);
  }
  for (const [name, definition] of Object.entries(materials.materials)) {
    check(/^extkit_[a-z0-9_]+$/.test(name) && Object.hasOwn(atlas.tiles, definition.tile ?? name), `unknown atlas cell for ${name}`);
    check(definition.vertexColors === true, `${name}: external atlas binding must multiply vertex colours`);
  }
  check(materials.colorSpace?.map === 'srgb' && materials.colorSpace?.normal === 'linear' && materials.colorSpace?.orm === 'linear', 'PBR colour-space semantics must be explicit');
  check(serialEqual(materials.ormChannels, ['occlusion', 'roughness', 'metallic']), 'ORM channels must be occlusion, roughness and metallic');
  check(Array.isArray(materials.walls) && (!complete || materials.walls.length === 12), 'twelve seamless wall materials required');
  const ids = new Set();
  for (const wall of materials.walls) {
    check(WALL_IDS.includes(wall.id) && !ids.has(wall.id), 'unknown/duplicate wall material'); ids.add(wall.id);
    check(typeof wall.label === 'string' && wall.label.length > 0 && wall.label === wall.label.normalize('NFC'), `${wall.id}: Spanish material label must be NFC Unicode`);
    check(equal(wall.size, [1024, 1024], 0), `${wall.id}: wall PBR planes must be 1024 square`);
    check(positive(wall.physicalSizeMetres, 2) && wall.physicalSizeMetres.every((v) => v <= 8), `${wall.id}: metre texture scale required`);
    check(wall.seamless === true && wall.normalEncoding === 'BC5_RG_positiveZ', `${wall.id}: seamless BC5 tangent-normal convention required`);
  }
  if (complete) check(WALL_IDS.every((id) => ids.has(id)), 'wall material coverage is incomplete');
  check(Array.isArray(materials.files), 'materials file hashes must be an array');
  return materials;
}

function texturePath(projectRoot, name) {
  check(typeof name === 'string' && /^\.\.\/\.\.\/textures\/extkit\/[a-zA-Z0-9_/-]+\.(png|ktx2)$/.test(name) && !name.slice(6).split('/').includes('..'), 'texture path must remain in assets/textures/extkit');
  return contained(resolve(projectRoot, 'assets/textures/extkit'), name.slice('../../textures/extkit/'.length), 'texture');
}

export function validateNormalPixels({ width, height, pixels }) {
  check(natural(width) && natural(height) && width > 0 && height > 0 && pixels?.length === width * height * 3, 'normal raster dimensions differ from decoded pixels');
  let maximumXYSquared = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    const x = pixels[i] / 127.5 - 1, y = pixels[i + 1] / 127.5 - 1, squared = x * x + y * y;
    check(Number.isFinite(squared) && squared <= 1.03, 'BC5 normal XY lies outside the unit hemisphere');
    maximumXYSquared = Math.max(maximumXYSquared, squared);
  }
  return maximumXYSquared;
}

/** Texture budgets count every file; GPU bytes come from actual block/mip sizes. */
export function inspectTextures(projectRoot, materials) {
  const files = filesBelow(resolve(projectRoot, 'assets/textures/extkit'));
  const textureBytes = files.reduce((sum, path) => sum + statSync(path).size, 0);
  check(textureBytes <= MAX_TEXTURE_BYTES, `texture payload ${textureBytes} exceeds ${MAX_TEXTURE_BYTES} bytes`);
  const declared = new Map(), textures = [], add = (path, info) => {
    check(!declared.has(path), `PBR planes must be distinct image files: ${path}`);
    declared.set(path, info); textures.push({ path: relative(projectRoot, path).split(sep).join('/'), ...info });
  };
  for (const channel of ['map', 'normal', 'orm']) {
    const path = texturePath(projectRoot, materials.atlas[channel]);
    check(extname(path) === '.png', 'shared atlas planes must be PNG');
    const info = inspectPng(readFileSync(path), 2048), sizeField = channel === 'map' ? 'size' : channel + 'Size';
    check(equal([info.width, info.height], materials.atlas[sizeField], 0), `atlas ${channel}: actual dimensions differ from definitions`);
    // Conservative RGBA8 storage, including a complete power-of-two mip chain.
    const mipBytes = (w, h) => { let total = 0; for (;;) { total += w * h * 4; if (w === 1 && h === 1) return total; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); } };
    add(path, { channel, format: 'RGBA8', width: info.width, height: info.height, bytes: info.bytes, gpuBytes: mipBytes(info.width, info.height) });
  }
  for (const wall of materials.walls) for (const channel of ['map', 'normal', 'orm']) {
    const path = texturePath(projectRoot, wall[channel]);
    check(extname(path) === '.ktx2', `${wall.id}: wall planes require native block-compressed KTX2`);
    const input = readFileSync(path), info = inspectKtx2(input), format = channel === 'normal' ? 141 : channel === 'map' ? 132 : 131;
    check(info.width === 1024 && info.height === 1024 && info.levelCount === 11, `${wall.id} ${channel}: requires 1024 square complete eleven-level mip chain`);
    check(info.vkFormat === format, `${wall.id} ${channel}: wrong GPU block format or colour space`);
    check(info.supercompressionScheme === 3, `${wall.id} ${channel}: expected independently decodable KTX2 ZLIB levels`);
    // The decoded *shipped* block edges must tile. Checking the author's source
    // PNG would miss seams introduced by block compression or mip generation.
    let seamMax = 0;
    for (let level = 0; level < info.levelCount; level++) {
      const decoded = decodeKtx2(info, level), seam = seamMetrics(decoded);
      if (channel === 'normal') validateNormalPixels(decoded);
      const maximum = Math.max(seam.horizontalMax, seam.verticalMax);
      check(Number.isFinite(maximum) && maximum <= 1, `${wall.id} ${channel} mip ${level}: decoded opposite edges are not seamless (${maximum})`);
      seamMax = Math.max(seamMax, maximum);
    }
    add(path, { wall: wall.id, channel, width: info.width, height: info.height, bytes: input.length, format: info.vkFormat, mipLevels: info.levelCount, gpuBytes: info.gpuBytes, seamMax });
  }
  const listed = new Set();
  for (const file of materials.files) {
    const path = texturePath(projectRoot, file.file);
    check(!listed.has(path) && declared.has(path), `materials files list contains duplicate/unbound texture ${file.file}`); listed.add(path);
    const bytes = readFileSync(path), info = declared.get(path);
    check(file.bytes === bytes.length && file.sha256 === hash(bytes), `texture bytes/SHA-256 differ: ${file.file}`);
    check(file.width === info.width && file.height === info.height, `texture dimensions differ from file: ${file.file}`);
  }
  check(listed.size === declared.size, 'materials file hashes do not cover every atlas and wall plane');
  for (const path of files) check(declared.has(path), `unlisted/stale texture payload ${relative(projectRoot, path)}`);
  const gpuBytes = textures.reduce((sum, item) => sum + item.gpuBytes, 0);
  check(gpuBytes <= MAX_GPU_BYTES, `texture GPU memory ${gpuBytes} exceeds ${MAX_GPU_BYTES} bytes`);
  const gpuCompressedWallBytes = textures.filter((item) => item.wall).reduce((sum, item) => sum + item.gpuBytes, 0);
  return { textureBytes, gpuBytes, gpuCompressedWallBytes, gpuAtlasBytes: gpuBytes - gpuCompressedWallBytes, textures, files: [...declared.keys()] };
}

export function validateInventory(projectRoot, manifest) {
  check(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0, 'manifest artifacts inventory with byte sizes and SHA-256 is required');
  const required = new Set([
    ...filesBelow(resolve(projectRoot, 'assets/models/extkit')),
    ...filesBelow(resolve(projectRoot, 'assets/textures/extkit')),
    resolve(projectRoot, CATALOGUE),
  ]);
  const listed = new Set();
  for (const file of manifest.artifacts) {
    check(typeof file.path === 'string' && (file.path.startsWith(MODEL_PREFIX) || file.path.startsWith(TEXTURE_PREFIX) || file.path === CATALOGUE), 'artifact path must remain in exterior-kit payload namespace');
    const path = contained(projectRoot, file.path, 'artifact');
    check(required.has(path) && !listed.has(path), `duplicate/unexpected artifact ${file.path}`); listed.add(path);
    const bytes = readFileSync(path);
    check(natural(file.bytes) && file.bytes === bytes.length, `artifact byte count differs: ${file.path}`);
    check(typeof file.sha256 === 'string' && /^[0-9a-f]{64}$/.test(file.sha256) && file.sha256 === hash(bytes), `artifact SHA-256 differs: ${file.path}`);
  }
  check(listed.size === required.size, `artifact inventory omits payload files: ${[...required].filter((path) => !listed.has(path)).map((path) => relative(projectRoot, path)).join(', ')}`);
  return listed.size;
}

export function validateDormancy(projectRoot) {
  for (const name of ['assets/models/manifest.json', 'assets/textures/manifest.json']) {
    const manifest = jsonFile(resolve(projectRoot, name));
    check(!/extkit|exterior-kit/i.test(JSON.stringify(manifest)), `exterior kit must not be registered in boot manifest ${name}`);
  }
  for (const path of filesBelow(resolve(projectRoot, 'js')).filter((path) => /\.[cm]?js$/.test(path))) {
    check(!/extkit|exterior-kit/i.test(readFileSync(path, 'utf8')), `exterior kit must stay dormant: runtime reference in ${relative(projectRoot, path)}`);
  }
  return true;
}

export function validateExtkit({ projectRoot = ROOT, complete = false } = {}) {
  const report = { ok: false, complete: false, runtime: process.version, baseAssets: 0, lodAssets: 0, glbBytes: 0, modelBytes: 0,
    textureBytes: 0, gpuBytes: 0, gpuCompressedWallBytes: 0, gpuAtlasBytes: 0, maxTriangles: 0, maxSmallTriangles: 0, maxLodRatio: 0, sharedMeshAliases: 0,
    artifactCount: 0, families: {}, assets: [], textures: [], errors: [] };
  const capture = (label, fn) => { try { return fn(); } catch (error) { report.errors.push(`${label}: ${error.message}`); return null; } };
  projectRoot = resolve(projectRoot);
  const manifest = capture('manifest', () => {
    const value = jsonFile(resolve(projectRoot, MANIFEST));
    check(value.version === 1 && value.units === 'm' && value.axes === '+Y up, +Z front', 'requires version 1, metres, +Y up and +Z front');
    check(value.libraryOnly === true, 'libraryOnly must be true');
    check(typeof value.complete === 'boolean' && (!complete || value.complete), 'complete release was requested but complete flag is false');
    checkDrawnStrings(value.drawnStrings, 'manifest');
    check(value.materials === 'extkit/materials.json', 'materials path must remain in extkit namespace');
    check(Array.isArray(value.files) && value.files.length === 2, 'exactly two packed GLBs are required');
    report.complete = value.complete; return value;
  });
  const entries = capture('catalogue', () => validateCatalogue(jsonFile(resolve(projectRoot, CATALOGUE)), { complete }));
  const materials = capture('materials', () => validateMaterialDefinitions(jsonFile(resolve(projectRoot, MATERIALS)), { complete }));
  if (entries) for (const item of entries.values()) report.families[item.family] = (report.families[item.family] ?? 0) + 1;
  const measured = new Map(), metadata = new Map(), glbPaths = new Set();
  if (manifest && entries && materials) for (const file of manifest.files) capture(file.glb ?? 'GLB', () => {
    check(['extkit/extkit_near.glb', 'extkit/extkit_lod.glb'].includes(file.glb), 'GLB path must name the near or LOD packed extkit file');
    const path = contained(resolve(projectRoot, 'assets/models'), file.glb, 'GLB');
    check(!glbPaths.has(path), 'duplicate packed GLB'); glbPaths.add(path);
    const input = readFileSync(path), actual = inspectGlb(path, materials);
    report.glbBytes += input.length;
    check(file.bytes === input.length, 'GLB declared byte count differs from file');
    check(file.sha256 === hash(input), 'GLB SHA-256 differs from file');
    check(file.sharedMeshAliases == null || file.sharedMeshAliases === actual.sharedMeshAliases, 'shared mesh count differs from decoded GLB');
    report.sharedMeshAliases += actual.sharedMeshAliases;
    check(file.assets && typeof file.assets === 'object' && !Array.isArray(file.assets), 'assets must be a keyed object');
    const names = Object.keys(file.assets), isFarFile = file.glb.endsWith('_lod.glb');
    check(names.length === actual.assets.size && names.every((key) => actual.assets.has(key)), 'GLB root coverage differs from manifest');
    check(names.every((key) => key.endsWith('_lod1') === isFarFile), 'near and LOD roots must be in their separate packed files');
    for (const [key, meta] of Object.entries(file.assets)) {
      const far = key.endsWith('_lod1'), base = far ? key.slice(0, -5) : key, cat = entries.get(base), asset = actual.assets.get(key);
      check(cat && !metadata.has(key) && meta.node === key, `${key}: unknown/duplicate catalogue key or mismatched node`);
      check(equal(meta.size, cat.size, 1e-8) && equal(meta.footprint, [cat.size[0], cat.size[2]], 1e-8), `${key}: metre size/footprint differs from catalogue`);
      check(meta.triangles === asset.triangles && meta.parts === asset.parts, `${key}: triangle/part metadata differs from decoded GLB`);
      check(equal(meta.bounds?.min, asset.min) && equal(meta.bounds?.max, asset.max), `${key}: bounds differ from binary geometry`);
      check(serialEqual(meta.anchors, cat.anchors), `${key}: attachment anchors differ from catalogue`);
      const [w, h, d] = cat.size, low = [-w / 2, 0, -d / 2], high = [w / 2, h, d / 2];
      check(asset.min.every((v, k) => v >= low[k] - 0.002) && asset.max.every((v, k) => v <= high[k] + 0.002), `${key}: binary geometry exceeds metre catalogue envelope`);
      check(Math.abs(asset.min[1]) <= 0.002 && Math.abs(asset.min[0] + asset.max[0]) <= 0.004 && Math.abs(asset.min[2] + asset.max[2]) <= 0.004, `${key}: origin must be at the floor centre of the actual X/Z bounds`);
      check(asset.size.every((v, k) => v > 0 && v >= cat.size[k] * 0.25), `${key}: geometry collapsed relative to metre catalogue size`);
      const cap = SMALL.has(cat.family) ? MAX_SMALL_TRIANGLES : MAX_NEAR_TRIANGLES;
      check(asset.triangles <= cap, `${key}: triangle cap ${cap} exceeded by ${asset.triangles}`);
      if (far) report.lodAssets++;
      else { report.baseAssets++; report.maxTriangles = Math.max(report.maxTriangles, asset.triangles); if (SMALL.has(cat.family)) report.maxSmallTriangles = Math.max(report.maxSmallTriangles, asset.triangles); }
      metadata.set(key, meta); measured.set(key, asset);
      report.assets.push({ key, family: cat.family, ...asset });
    }
  });
  // Attachment positions describe clearance planes, not bolt locations. Keep
  // the near plane for both LOD metadata records so swapping detail levels
  // cannot move a fitting toward or away from its wall.
  if (entries) for (const [key, cat] of entries) if (measured.has(key)) capture(key + ' anchors', () => {
    const near = measured.get(key), floor = cat.anchors.wallSide === 'floor';
    const position = floor ? [0, 0, 0] : [0, 0, near.min[2]];
    const reference = floor ? 'floor centre' : 'near-geometry rear clearance plane';
    check(equal(cat.anchors.position, position, 0.00001), `attachment anchor differs from decoded ${floor ? 'floor centre' : 'near geometry rear clearance plane'}`);
    check(cat.anchors.reference === reference, `attachment reference must be '${reference}'`);
  });
  if (manifest && entries) for (const [key, meta] of metadata) if (!key.endsWith('_lod1')) capture(key + ' LOD', () => {
    check(meta.lod1 === key + '_lod1' && metadata.has(meta.lod1), 'missing explicit LOD1');
    const near = measured.get(key), far = measured.get(meta.lod1), ratio = far.triangles / near.triangles;
    report.maxLodRatio = Math.max(report.maxLodRatio, ratio);
    check(ratio <= MAX_LOD_RATIO + 1e-12, `LOD1 ${far.triangles} exceeds 40% of near ${near.triangles}`);
  });
  if (complete && entries) capture('complete packed library', () => {
    const missing = [...entries.keys()].filter((id) => !metadata.has(id) || !metadata.has(id + '_lod1'));
    check(missing.length === 0, `missing required near/LOD roots: ${missing.join(', ')}`);
    check(report.baseAssets === entries.size && report.lodAssets === entries.size && glbPaths.size === 2, 'complete near/LOD count mismatch');
  });
  capture('model payload', () => {
    const files = filesBelow(resolve(projectRoot, 'assets/models/extkit'));
    report.modelBytes = statSync(resolve(projectRoot, MANIFEST)).size + files.reduce((sum, path) => sum + statSync(path).size, 0);
    // Sum bytes from disk even when a GLB was rejected before inspection.
    report.glbBytes = files.filter((path) => extname(path) === '.glb').reduce((sum, path) => sum + statSync(path).size, 0);
    check(report.glbBytes <= MAX_GLB_BYTES, `GLB payload ${report.glbBytes} exceeds ${MAX_GLB_BYTES} bytes`);
    check(files.filter((path) => extname(path) === '.glb').length === 2, 'exactly two GLB files must exist on disk');
    for (const path of files) check(glbPaths.has(path) || path === resolve(projectRoot, MATERIALS), `unlisted/stale model payload ${relative(projectRoot, path)}`);
  });
  if (materials) capture('textures', () => {
    const info = inspectTextures(projectRoot, materials);
    report.textureBytes = info.textureBytes; report.gpuBytes = info.gpuBytes; report.textures = info.textures;
    report.gpuCompressedWallBytes = info.gpuCompressedWallBytes; report.gpuAtlasBytes = info.gpuAtlasBytes;
  });
  if (manifest) capture('inventory', () => { report.artifactCount = validateInventory(projectRoot, manifest); });
  if (complete) capture('offline isolation', () => validateDormancy(projectRoot));
  report.ok = report.errors.length === 0; return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = { complete: args.includes('--complete') };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root') { check(typeof args[i + 1] === 'string' && !args[i + 1].startsWith('--'), '--root requires a path'); options.projectRoot = resolve(args[++i]); }
    else if (!['--complete', '--json'].includes(args[i])) { console.error(`unknown option: ${args[i]}`); process.exit(2); }
  }
  const report = validateExtkit(options);
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`extkit: ${report.baseAssets} near + ${report.lodAssets} LOD1 (${report.complete ? 'complete' : 'partial'}) under ${process.version}`);
    console.log(`GLBs: ${report.glbBytes} / ${MAX_GLB_BYTES} bytes; textures: ${report.textureBytes} / ${MAX_TEXTURE_BYTES} bytes`);
    console.log(`GPU including every wall/atlas and mip: ${report.gpuBytes} / ${MAX_GPU_BYTES} bytes`);
    console.log(`maximum near: ${report.maxTriangles}; small prop: ${report.maxSmallTriangles}; LOD/near: ${(report.maxLodRatio * 100).toFixed(2)}%`);
    console.log(`hashed artifacts: ${report.artifactCount}; actual shared mesh aliases: ${report.sharedMeshAliases}`);
    if (report.ok) console.log('PASS: decoded geometry, catalogue coverage, anchors, LODs, PBR planes, seams, hashes, budgets and offline isolation. Runtime integration is untested.');
    else for (const error of report.errors) console.error(`FAIL: ${error}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}
