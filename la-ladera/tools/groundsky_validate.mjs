// Independent binary/pixel acceptance for the dormant Ground/Sky library.
// node la-ladera/tools/groundsky_validate.mjs --complete [--root la-ladera] [--json]
import '../tests/nice.mjs';
import { readFileSync, readdirSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync, zstdDecompressSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { decodePng, edgeDifferences, rgbaMipBytes } from './groundsky_png.mjs';

export { decodePng, edgeDifferences, rgbaMipBytes } from './groundsky_png.mjs';
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST = 'assets/models/manifest.groundsky.json';
export const CATALOGUE = 'tools/groundsky.catalog.json';
export const MAX_TEXTURE_BYTES = 12_000_000;
export const MAX_FILE_BYTES = 4_000_000;
export const MAX_GPU_BYTES = 80_000_000;
export const GROUND_MATERIALS = Object.freeze(['kikuyu_lush', 'kikuyu_dry', 'kikuyu_trampled', 'kikuyu_clover_edge',
  'dirt_brown', 'dirt_dry_pale', 'red_clay_dry', 'red_clay_wet', 'gravel_fine_grey', 'gravel_coarse_river',
  'packed_earth_tyres', 'packed_earth_footworn', 'mud_rutted', 'mud_puddled', 'stone_scatter_dark', 'stone_scatter_pale',
  'leaf_litter_eucalyptus', 'leaf_litter_mixed', 'cobble_edge_moss', 'cracked_concrete_light', 'cracked_concrete_dark',
  'asphalt_repaired', 'asphalt_gravel_edge', 'sand_to_kikuyu']);
const COUNTS = Object.freeze({ ground: 72, decal: 16, 'blend-mask': 2, city: 9, haze: 5, vegetation: 18 });
const TIMES = Object.freeze([7, 12, 17.2, 19.5, 22]);
const VEGETATION_FAMILIES = Object.freeze(['banana_groves', 'cloud_forest_edge', 'cypress_hedges', 'eucalyptus_stands', 'kikuyu_slopes', 'rooftop_container_gardens']);
const HEX = /^[a-f0-9]{64}$/;
const PNG_CACHE = new Map(), KTX_CACHE = new Map(), PIXEL_STATS = new Map();
const demand = (ok, message) => { if (!ok) throw new Error(message); };
const exact = isDeepStrictEqual;
const finite = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Actual complete ASTC block allocation, including the minimum one block in the mip tail. */
export function astcMipBytes(width, height, block = 6) {
  let total = 0;
  for (;;) {
    total += Math.ceil(width / block) * Math.ceil(height / block) * 16;
    if (width === 1 && height === 1) return total;
    width = Math.max(1, Math.floor(width / 2)); height = Math.max(1, Math.floor(height / 2));
  }
}

/** Parse KTX2 and inflate every mip independently; ASTC pixels require an ASTC GPU/decoder. */
export function decodeKtx2(input, label = 'KTX2') {
  const b = typeof input === 'string' ? readFileSync(input) : input;
  const magic = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  demand(Buffer.isBuffer(b) && b.length >= 80 && b.subarray(0, 12).equals(magic), `${label}: invalid KTX2 signature`);
  const vkFormat = b.readUInt32LE(12), typeSize = b.readUInt32LE(16), width = b.readUInt32LE(20), height = b.readUInt32LE(24);
  const depth = b.readUInt32LE(28), layers = b.readUInt32LE(32), faces = b.readUInt32LE(36), levelCount = b.readUInt32LE(40);
  const supercompression = b.readUInt32LE(44), dfdOffset = b.readUInt32LE(48), dfdLength = b.readUInt32LE(52);
  const kvdOffset = b.readUInt32LE(56), kvdLength = b.readUInt32LE(60);
  const u64 = (offset) => {
    const n = b.readBigUInt64LE(offset);
    demand(n <= BigInt(Number.MAX_SAFE_INTEGER), `${label}: KTX2 offset exceeds safe integer`);
    return Number(n);
  };
  const sgdOffset = u64(64), sgdLength = u64(72);
  demand([157, 158, 165, 166].includes(vkFormat) && typeSize === 1, `${label}: KTX2 requires ASTC 4x4 or 6x6 UNORM or sRGB`);
  const blockSize = vkFormat <= 158 ? 4 : 6, srgb = vkFormat % 2 === 0;
  demand(width > 0 && width <= 4096 && height > 0 && height <= 1024 && depth === 0 && layers === 0 && faces === 1,
    `${label}: KTX2 must contain one supported 2D texture`);
  demand(levelCount === Math.floor(Math.log2(Math.max(width, height))) + 1, `${label}: KTX2 full mip chain is required`);
  demand([2, 3].includes(supercompression) && sgdOffset === 0 && sgdLength === 0, `${label}: KTX2 requires Zstd scheme 2 or zlib scheme 3 without global supercompression data`);
  demand(80 + levelCount * 24 <= b.length, `${label}: truncated KTX2 mip index`);
  const ranges = [[0, 80 + levelCount * 24, 'header/index']];
  const section = (offset, length, name, alignment = 1) => {
    demand(Number.isInteger(offset) && Number.isInteger(length) && offset >= 0 && length > 0 && offset % alignment === 0
      && offset + length <= b.length, `${label}: invalid KTX2 ${name} range/alignment`);
    for (const [a, z, other] of ranges) demand(offset >= z || offset + length <= a, `${label}: overlapping KTX2 ${name} and ${other}`);
    ranges.push([offset, offset + length, name]);
  };
  section(dfdOffset, dfdLength, 'DFD', 4);
  demand(dfdLength === 44 && b.readUInt32LE(dfdOffset) === dfdLength, `${label}: invalid KTX2 DFD size`);
  const d = dfdOffset + 4;
  demand(b.readUInt32LE(d) === 0 && b.readUInt16LE(d + 4) === 2 && b.readUInt16LE(d + 6) === dfdLength - 4,
    `${label}: unsupported KTX2 DFD vendor/type/version`);
  demand(b[d + 8] === 162 && b[d + 10] === (srgb ? 2 : 1), `${label}: KTX2 DFD ASTC model or colour transfer mismatch`);
  demand(b[d + 9] === (srgb ? 1 : 0) && b[d + 11] === 0, `${label}: KTX2 DFD primaries or straight-alpha flags mismatch`);
  demand(b[d + 12] === blockSize - 1 && b[d + 13] === blockSize - 1 && b[d + 14] === 0 && b[d + 15] === 0 && b[d + 16] === 16,
    `${label}: KTX2 DFD block dimensions/bytes mismatch`);
  demand(b.subarray(d + 17, d + 24).every((x) => x === 0), `${label}: KTX2 DFD additional planes are unsupported`);
  demand(b.readUInt16LE(d + 24) === 0 && b[d + 26] === 127 && b[d + 27] === 0
    && b.subarray(d + 28, d + 32).every((x) => x === 0) && b.readUInt32LE(d + 32) === 0
    && b.readUInt32LE(d + 36) === 0xffffffff, `${label}: KTX2 DFD ASTC sample descriptor mismatch`);
  if (kvdLength) {
    section(kvdOffset, kvdLength, 'key/value data', 4);
    const names = new Set();
    for (let p = kvdOffset; p < kvdOffset + kvdLength;) {
      demand(p + 4 <= kvdOffset + kvdLength, `${label}: truncated KTX2 key/value size`);
      const length = b.readUInt32LE(p), end = p + 4 + length;
      demand(length > 0 && end <= kvdOffset + kvdLength, `${label}: invalid KTX2 key/value length`);
      const value = b.subarray(p + 4, end), nul = value.indexOf(0), name = value.subarray(0, nul).toString('utf8');
      demand(nul > 0 && !names.has(name), `${label}: invalid/duplicate KTX2 metadata key`); names.add(name);
      p = Math.ceil(end / 4) * 4;
      demand(p <= kvdOffset + kvdLength, `${label}: truncated KTX2 key/value padding`);
    }
  } else demand(kvdOffset === 0, `${label}: zero-length KTX2 metadata needs zero offset`);
  const mipLevels = [], mipRanges = [];
  let w = width, h = height, gpuBytes = 0;
  for (let i = 0; i < levelCount; i++) {
    const at = 80 + i * 24, offset = u64(at), byteLength = u64(at + 8), uncompressedByteLength = u64(at + 16);
    const expected = Math.ceil(w / blockSize) * Math.ceil(h / blockSize) * 16;
    demand(uncompressedByteLength === expected, `${label}: KTX2 mip ${i} block allocation differs`);
    section(offset, byteLength, `mip ${i}`);
    const decompress = supercompression === 2 ? zstdDecompressSync : inflateSync;
    const inflated = decompress(b.subarray(offset, offset + byteLength), { maxOutputLength: expected + 1, info: true });
    demand(inflated.buffer.length === expected && inflated.engine.bytesWritten === byteLength,
      `${label}: KTX2 mip ${i} compressed data/length mismatch`);
    mipLevels.push({ width: w, height: h, byteLength, uncompressedByteLength });
    mipRanges.push({ offset, byteLength });
    gpuBytes += expected; w = Math.max(1, Math.floor(w / 2)); h = Math.max(1, Math.floor(h / 2));
  }
  let nextPayload = Math.max(80 + levelCount * 24, dfdOffset + dfdLength, kvdOffset + kvdLength);
  for (let level = levelCount - 1; level >= 0; level--) {
    demand(mipRanges[level].offset === nextPayload, `${label}: KTX2 supercompressed mip payloads must be tightly packed smallest-first`);
    nextPayload += mipRanges[level].byteLength;
  }
  ranges.sort((a, z) => a[0] - z[0]);
  for (let i = 1; i < ranges.length; i++) demand(b.subarray(ranges[i - 1][1], ranges[i][0]).every((x) => x === 0), `${label}: nonzero KTX2 section padding`);
  demand(ranges.at(-1)[1] === b.length && nextPayload === b.length, `${label}: trailing KTX2 bytes`);
  return { width, height, vkFormat, colourSpace: srgb ? 'srgb' : 'linear', blockSize: [blockSize, blockSize],
    supercompression: supercompression === 2 ? 'zstd' : 'zlib', mipLevels, gpuBytes };
}

function safePath(root, path) {
  demand(typeof path === 'string' && !isAbsolute(path) && !path.includes('\\') && !path.split('/').some((x) => !x || x === '.' || x === '..')
    && !/^[A-Za-z]:/.test(path), 'unsafe relative path');
  const p = resolve(root, path), r = relative(root, p);
  demand(r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r), 'path escapes library root');
  if (existsSync(p)) {
    demand(!lstatSync(p).isSymbolicLink(), 'texture symlinks are not allowed');
    const actual = relative(realpathSync(root), realpathSync(p));
    demand(actual !== '..' && !actual.startsWith(`..${sep}`) && !isAbsolute(actual), 'symlink path escapes library root');
  }
  return p;
}
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
}
function stats(image, digest) {
  if (PIXEL_STATS.has(digest)) return PIXEL_STATS.get(digest);
  const { width, height, rgba } = image, pixels = width * height;
  const s = { min: [255, 255, 255, 255], max: [0, 0, 0, 0], clear: 0, opaque: 0, soft: 0, topNonzero: 0, borderNonzero: 0,
    normalError: 0, minNormalZ: 1, metallicNonzero: 0, alphaDigest: '' };
  const alpha = Buffer.alloc(pixels);
  for (let i = 0; i < pixels; i++) {
    const offset = i * 4, a = rgba[offset + 3]; alpha[i] = a;
    for (let c = 0; c < 4; c++) { const value = rgba[offset + c]; if (value < s.min[c]) s.min[c] = value; if (value > s.max[c]) s.max[c] = value; }
    if (a === 0) s.clear++; else if (a === 255) s.opaque++; else s.soft++;
    if (a && i < width) s.topNonzero++;
    if (a && (i < width || i >= pixels - width || i % width === 0 || i % width === width - 1)) s.borderNonzero++;
  }
  s.alphaDigest = sha256(alpha); PIXEL_STATS.set(digest, s);
  return s;
}
function normalStats(image, s) {
  if (s.normalMeasured) return s;
  for (let i = 0; i < image.rgba.length; i += 4) {
    const x = image.rgba[i] / 127.5 - 1, y = image.rgba[i + 1] / 127.5 - 1, z = image.rgba[i + 2] / 127.5 - 1;
    s.minNormalZ = Math.min(s.minNormalZ, z); s.normalError = Math.max(s.normalError, Math.abs(Math.hypot(x, y, z) - 1));
  }
  s.normalMeasured = true; return s;
}
function metadata(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !['bytes', 'sha256'].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
}
function colourContract(f) {
  return ['normal', 'orm', 'mask'].includes(f.role) ? 'linear' : 'srgb';
}

export function validateGroundsky({ root = ROOT, complete = false } = {}) {
  root = resolve(root);
  const report = { ok: false, failures: [], fileCount: 0, masterCount: 0, deliveryCount: 0, textureBytes: 0, masterBytes: 0, deliveryBytes: 0,
    gpuBytes: 0, rgbaFallbackBytes: 0, edges: [], counts: {}, reviewCount: 0, maxTextureBytes: MAX_TEXTURE_BYTES, maxFileBytes: MAX_FILE_BYTES, maxGpuBytes: MAX_GPU_BYTES };
  const capture = (label, fn) => { try { return fn(); } catch (error) { report.failures.push(`${label}: ${error.message}`); return undefined; } };
  const m = capture('manifest', () => JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8')));
  const catalogue = capture('catalogue', () => JSON.parse(readFileSync(resolve(root, CATALOGUE), 'utf8')));
  if (!m || !catalogue) return report;
  capture('contract', () => {
    demand(m.schemaVersion === 1 && m.libraryOnly === true && catalogue.schemaVersion === 1 && catalogue.libraryOnly === true, 'schemaVersion 1 and libraryOnly true are required');
    demand(!complete || m.complete === true, '--complete rejects partial output');
    demand(!complete || Array.isArray(m.review?.files) && m.review.files.length >= 3, 'complete library requires hashed contact sheets and two eye-height render proofs');
    demand(m.license === 'CC0-1.0', 'original work license must be CC0-1.0');
    demand(m.budgets?.maxTextureBytes === MAX_TEXTURE_BYTES && m.budgets?.maxFileBytes === MAX_FILE_BYTES
      && m.budgets?.maxGpuBytes === MAX_GPU_BYTES, 'declared budgets differ from fixed acceptance limits');
    demand(Array.isArray(m.files) && m.files.length === 244 && Array.isArray(catalogue.files) && catalogue.files.length === 244,
      'complete library needs 122 PNG masters and 122 KTX2 deliveries');
  });
  const declarations = new Map(), images = new Map(), measurements = new Map();
  const catalogueRows = new Map();
  for (const f of catalogue.files ?? []) capture('catalogue record', () => {
    demand(f && typeof f.path === 'string' && !catalogueRows.has(f.path), 'duplicate or invalid catalogue path'); catalogueRows.set(f.path, f);
  });
  for (const f of m.files ?? []) capture(`file ${f?.path ?? '?'}`, () => {
    demand(f && typeof f.path === 'string' && !declarations.has(f.path), 'duplicate or invalid file declaration');
    declarations.set(f.path, f);
    const master = f.format === 'png';
    demand(master ? /^dev\/groundsky\/masters\/[a-z0-9_/-]+\.png$/.test(f.path)
      : f.format === 'ktx2' && /^assets\/textures\/groundsky\/[a-z0-9_/-]+\.ktx2$/.test(f.path), 'texture path/format must be in the Ground/Sky master or delivery namespace');
    demand(Object.hasOwn(COUNTS, f.kind), 'unknown texture kind');
    demand(['srgb', 'linear'].includes(f.colourSpace) && f.colourSpace === colourContract(f), 'colour-space contract disagrees with map role');
    demand(f.tiling && typeof f.tiling.x === 'boolean' && typeof f.tiling.y === 'boolean', 'both tiling axes must be explicit booleans');
    demand(typeof f.intendedUse === 'string' && f.intendedUse.length >= 12, 'intended use is required per file');
    demand(finite(f.worldSizeM, 2) && f.worldSizeM.every((x) => x > 0), 'world size must be two positive finite metres');
    demand(catalogueRows.has(f.path) && exact(metadata(f), metadata(catalogueRows.get(f.path))), 'catalogue and manifest file metadata differ');
    const bytes = readFileSync(safePath(root, f.path)), digest = sha256(bytes);
    report.fileCount++;
    demand(Number.isInteger(f.bytes) && f.bytes === bytes.length && HEX.test(f.sha256) && f.sha256 === digest, 'byte count/SHA-256 differs from actual file');
    demand(bytes.length <= MAX_FILE_BYTES, `file exceeds fixed ${MAX_FILE_BYTES} byte limit`);
    if (master) {
      let image = PNG_CACHE.get(digest);
      if (!image) { image = decodePng(bytes, f.path); PNG_CACHE.set(digest, image); }
      demand(image.width === f.width && image.height === f.height, 'decoded PNG dimensions differ from metadata');
      images.set(f.path, image); measurements.set(f.path, stats(image, digest));
      report.masterCount++; report.rgbaFallbackBytes += rgbaMipBytes(image.width, image.height);
      report.counts[f.kind] = (report.counts[f.kind] ?? 0) + 1;
      for (const axis of ['x', 'y']) if (f.tiling[axis]) {
        const edge = edgeDifferences(image, axis); report.edges.push({ path: f.path, axis, ...edge });
        demand(edge.max === 0, `seam ${axis} opposite-edge mismatch (maximum ${edge.max})`);
      }
    } else {
      let decoded = KTX_CACHE.get(digest);
      if (!decoded) { decoded = decodeKtx2(bytes, f.path); KTX_CACHE.set(digest, decoded); }
      demand(decoded.width === f.width && decoded.height === f.height, 'decoded KTX2 dimensions differ from metadata');
      demand(decoded.colourSpace === f.colourSpace && exact(decoded.blockSize, f.blockSize), 'KTX2 block/colour-space declaration differs');
      demand(f.supercompression === decoded.supercompression && f.gpuBytes === decoded.gpuBytes, 'KTX2 compression/GPU declaration differs from decoded allocation');
      demand(exact(decoded.mipLevels, f.mipLevels), 'KTX2 mip metadata differs from decoded index');
      demand(typeof f.derivedFrom === 'string' && /^dev\/groundsky\/masters\/[a-z0-9_/-]+\.png$/.test(f.derivedFrom), 'KTX2 must declare a PNG master');
      report.deliveryCount++; report.gpuBytes += decoded.gpuBytes;
    }
  });
  const masterRows = [...declarations.values()].filter((f) => f.format === 'png');
  const deliveryRows = [...declarations.values()].filter((f) => f.format === 'ktx2');
  capture('source pairing', () => {
    demand(masterRows.length === 122 && deliveryRows.length === 122, '122 distinct masters and deliveries are required');
    const paired = new Set();
    for (const f of deliveryRows) {
      const source = declarations.get(f.derivedFrom);
      demand(source?.format === 'png' && !paired.has(f.derivedFrom), 'missing or multiply paired PNG master'); paired.add(f.derivedFrom);
      demand(HEX.test(f.derivedSha256) && f.derivedSha256 === source.sha256, 'delivery/master source SHA-256 pin differs');
      demand(f.id === `${source.id}_astc`
        && f.path === source.path.replace('dev/groundsky/masters/', 'assets/textures/groundsky/').replace(/\.png$/, '.ktx2'),
      'delivery/master canonical name or file path differs');
      for (const key of Object.keys(source).filter((key) => !['path', 'id', 'format', 'bytes', 'sha256'].includes(key)))
        demand(exact(f[key], source[key]), `delivery/master ${key} differs`);
    }
    demand(paired.size === masterRows.length, 'a PNG master has no compressed delivery');
  });
  const byKind = (kind) => masterRows.filter((f) => f.kind === kind);
  for (const [kind, count] of Object.entries(COUNTS)) capture(`coverage ${kind}`, () => demand(byKind(kind).length === count, `required ${count} ${kind} master files`));
  for (const f of masterRows) capture(`pixels ${f.path}`, () => {
    const image = images.get(f.path), s = measurements.get(f.path);
    demand(image && s, 'master did not decode');
    const opaque = f.kind === 'ground';
    if (opaque) demand(s.min[3] === 255, 'opaque texture contains transparent pixels');
    if (['decal', 'city', 'vegetation'].includes(f.kind)) {
      demand(image.hasAlpha && s.clear > 0 && s.soft > 0 && s.max[3] >= 220, 'alpha must contain transparent, soft and visible values');
      if (f.kind === 'decal') demand(s.borderNonzero === 0 && s.soft / (f.width * f.height) >= 0.025, 'decal requires a clear border and a broad organic soft-alpha edge');
      if (f.kind === 'vegetation') demand(s.borderNonzero === 0, 'vegetation requires transparent outer atlas gutters');
      if (f.kind === 'city') demand(s.topNonzero === 0, 'panorama needs a transparent top border');
    }
    if (f.role === 'normal') {
      normalStats(image, s);
      demand(s.normalError <= 0.035 && s.minNormalZ >= 0, 'non-unit or negative-Z tangent normal');
    }
    if (f.role === 'orm') demand(s.max[2] === 0 && s.min[0] >= 1 && s.min[1] >= 1 && s.max[1] > s.min[1], 'ORM packing must be occlusion R, varying roughness G, nonmetallic B=0');
    if (f.kind === 'blend-mask') demand(s.min.every((n) => n <= 16) && s.max.every((n) => n >= 239), 'all four packed mask channels need useful 0..255 dynamic range');
  });
  capture('ground sets', () => {
    const ground = byKind('ground');
    demand(new Set(ground.filter((f) => f.role === 'albedo').map((f) => f.sha256)).size === 24, '24 distinct ground albedos are required');
    for (const material of GROUND_MATERIALS) {
      const maps = ground.filter((f) => f.material === material);
      demand(maps.length === 3 && exact(maps.map((f) => f.role).sort(), ['albedo', 'normal', 'orm']), `ground set ${material} needs albedo, normal and ORM`);
      for (const f of maps) demand(f.width === 1024 && f.height === 1024 && f.tiling.x && f.tiling.y, `${material} must be 1024 square and tile both axes`);
      demand(maps.every((f) => exact(f.worldSizeM, maps[0].worldSizeM)), `${material} map scales differ`);
    }
  });
  capture('decal shapes and metres', () => {
    const decals = byKind('decal');
    demand(new Set(decals.map((f) => f.sha256)).size === 16, '16 distinct decal images are required');
    for (const f of decals) demand(f.role === 'albedo' && [512, 1024].includes(f.width) && f.width === f.height
      && !f.tiling.x && !f.tiling.y && f.worldSizeM.every((x) => x >= 1 && x <= 4), 'decals must be 512/1024 square, non-tiling, and 1..4 metres');
  });
  capture('blend atlas channels', () => {
    const names = [];
    for (const f of byKind('blend-mask')) {
      demand(f.role === 'mask' && f.width === 1024 && f.height === 1024 && f.tiling.x && f.tiling.y
        && Array.isArray(f.channels) && f.channels.length === 4 && f.channels.every((x) => typeof x === 'string' && x.length), 'blend atlas needs four explicit 1024 square tileable mask channels');
      names.push(...f.channels);
    }
    demand(names.length === 8 && new Set(names).size === 8, 'eight distinct splat masks are required');
  });
  capture('city layers and variants', () => {
    for (const layer of ['near', 'middle', 'far']) {
      const group = byKind('city').filter((f) => f.layer === layer);
      demand(group.length === 3 && exact(group.map((f) => f.timeOfDay).sort(), ['day', 'dusk', 'night']), `${layer} city needs day, dusk and night`);
      demand(new Set(group.map((f) => f.sha256)).size === 3, `${layer} city variants must differ`);
      demand(new Set(group.map((f) => measurements.get(f.path)?.alphaDigest)).size === 1, `${layer} time variants must preserve silhouette registration`);
      for (const f of group) demand(f.role === 'panorama' && f.width === 4096 && f.height === 512 && !f.tiling.x && !f.tiling.y
        && f.arcDegrees === 200 && Number.isFinite(f.radiusM) && f.radiusM > 0
        && Math.abs(f.worldSizeM[0] - f.radiusM * 200 * Math.PI / 180) < 0.01, 'city requires a 4096x512 panorama with a physical 200-degree arc');
      const lighting = Object.fromEntries(group.map((f) => [f.timeOfDay, f.litWindowCount]));
      demand(lighting.day === 0 && Number.isInteger(lighting.dusk) && lighting.dusk > 0
        && Number.isInteger(lighting.night) && lighting.night > lighting.dusk, 'city lighting metadata must record distinct day/dusk/night window populations');
    }
    const features = [];
    for (const f of byKind('city').filter((r) => r.timeOfDay === 'day')) {
      demand(Array.isArray(f.features) && f.features.length, 'city feature annotations are required');
      for (const feature of f.features) {
        demand(typeof feature.kind === 'string' && finite(feature.boundsPx, 4) && feature.boundsPx.every(Number.isInteger), 'city feature annotation needs kind and pixel bounds');
        const [x, y, w, h] = feature.boundsPx;
        demand(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= f.width && y + h <= f.height, 'city feature annotation lies outside its panorama');
        features.push(feature.kind);
      }
    }
    for (const feature of ['far_ridge_silhouettes', 'radio_mast', 'church_spire', 'stadium'])
      demand(features.includes(feature), `city is missing its annotated ${feature}`);
  });
  capture('haze times', () => {
    const ramps = byKind('haze');
    demand(exact(ramps.map((f) => f.timeOfDay).sort((a, b) => a - b), TIMES), 'haze requires hours 7, 12, 17.2, 19.5 and 22');
    demand(new Set(ramps.map((f) => f.sha256)).size === 5, 'five distinct haze ramps are required');
    for (const f of ramps) {
      demand(f.role === 'ramp' && f.width === 256 && f.height === 4 && !f.tiling.x && !f.tiling.y, 'haze ramps must be 256x4 and non-tiling');
      const image = images.get(f.path); demand(image, 'haze ramp did not decode');
      for (let y = 1; y < 4; y++) demand(image.rgba.subarray(0, 1024).equals(image.rgba.subarray(y * 1024, (y + 1) * 1024)), 'haze ramp rows must match');
      demand(image.rgba[3] === 0 && image.rgba[1023] === 255, 'haze ramp alpha must span clear to full haze');
      for (let x = 1; x < 256; x++) demand(image.rgba[x * 4 + 3] >= image.rgba[(x - 1) * 4 + 3], 'haze ramp alpha must increase with distance');
    }
  });
  capture('vegetation LOD registration', () => {
    const vegetation = byKind('vegetation'), families = [...new Set(vegetation.map((f) => f.family))];
    demand(exact(families.sort(), VEGETATION_FAMILIES), 'six specified vegetation families are required');
    for (const family of families) {
      const group = vegetation.filter((f) => f.family === family).sort((a, b) => a.lod - b.lod);
      demand(group.length === 3 && exact(group.map((f) => f.lod), [0, 1, 2]), `${family} requires three LODs`);
      for (let lod = 0; lod < 3; lod++) {
        const f = group[lod], size = 1024 >> lod;
        demand(f.role === 'billboard' && f.width === size && f.height === size && !f.tiling.x && !f.tiling.y, `${family} LOD ${lod} dimensions/role differ`);
        demand(exact(f.worldSizeM, group[0].worldSizeM), `${family} LOD world scale drift`);
        demand(Array.isArray(f.cells) && f.cells.length > 0 && f.cells.length === group[0].cells.length, `${family} LOD cell layout missing`);
        for (let index = 0; index < f.cells.length; index++) {
          const cell = f.cells[index], initial = group[0].cells[index];
          demand(cell.id === initial.id && finite(cell.rect, 4) && cell.rect.every(Number.isInteger), `${family} cell identity/rectangle differs`);
          const [x, y, w, h] = cell.rect;
          demand(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= size && y + h <= size, `${family} atlas cell outside image`);
          const uv = [x / size, y / size, (x + w) / size, (y + h) / size];
          demand(finite(cell.uv, 4) && cell.uv.every((v, i) => Math.abs(v - uv[i]) < 1e-9) && exact(cell.uv, initial.uv), `${family} LOD cell UV registration drift`);
          demand(finite(cell.pivot, 2) && cell.pivot.every((v) => v >= 0 && v <= 1) && exact(cell.pivot, initial.pivot)
            && exact(cell.worldSizeM, initial.worldSizeM), `${family} LOD pivot or cell world-size drift`);
          demand(Number.isInteger(cell.gutterPx) && cell.gutterPx >= 4 && cell.gutterPx < Math.min(w, h) / 2, `${family} cell gutter is missing or invalid`);
          const image = images.get(f.path); demand(image, `${family} image did not decode`);
          for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++)
            if (xx < x + cell.gutterPx || xx >= x + w - cell.gutterPx || yy < y + cell.gutterPx || yy >= y + h - cell.gutterPx)
              demand(image.rgba[(yy * size + xx) * 4 + 3] === 0, `${family} transparent per-cell atlas gutter contains visible pixels`);
          for (const other of f.cells.slice(0, index)) {
            const [a, b, c, d] = other.rect;
            demand(x >= a + c || a >= x + w || y >= b + d || b >= y + h, `${family} atlas cells overlap`);
          }
        }
      }
    }
  });
  capture('file inventory and budgets', () => {
    const files = [...walk(resolve(root, 'assets/textures/groundsky')), ...walk(resolve(root, 'dev/groundsky/masters'))];
    for (const p of files) {
      const rel = relative(root, p).split(sep).join('/');
      const s = lstatSync(p); demand(s.isFile() && !s.isSymbolicLink(), 'library texture inventory contains a non-regular file');
      report.textureBytes += s.size;
      if (rel.startsWith('dev/')) report.masterBytes += s.size; else report.deliveryBytes += s.size;
      if (!declarations.has(rel)) report.failures.push(`inventory: unregistered texture file ${rel}`);
      if (s.size > MAX_FILE_BYTES) report.failures.push(`inventory: ${rel} exceeds fixed ${MAX_FILE_BYTES} byte file limit`);
    }
    demand(report.textureBytes <= MAX_TEXTURE_BYTES, `texture payload ${report.textureBytes} exceeds fixed ${MAX_TEXTURE_BYTES} byte budget`);
    demand(report.gpuBytes <= MAX_GPU_BYTES, `GPU allocation ${report.gpuBytes} exceeds fixed ${MAX_GPU_BYTES} byte budget`);
  });
  if (m.totals) capture('declared totals', () => {
    for (const [field, measured] of Object.entries({ masterPngCount: report.masterCount, deliveryCount: report.deliveryCount,
      masterPngBytes: report.masterBytes, deliveryBytes: report.deliveryBytes, textureBytes: report.textureBytes,
      gpuBytes: report.gpuBytes, uncompressedRgba8WithMipsBytes: report.rgbaFallbackBytes }))
      demand(m.totals[field] === measured, `manifest ${field} differs from independently measured ${measured}`);
  });
  capture('offline isolation', () => {
    for (const path of ['assets/models/manifest.json', 'assets/textures/manifest.json']) {
      const p = resolve(root, path); demand(existsSync(p), `active manifest missing: ${path}`);
      demand(!/groundsky|ground-sky/i.test(readFileSync(p, 'utf8')), 'Ground/Sky must not enter active asset registries');
    }
    demand(existsSync(resolve(root, 'js')), 'game js directory is required for offline isolation check');
    for (const path of walk(resolve(root, 'js')).filter((p) => /\.(?:js|mjs|json)$/.test(p)))
      demand(!/groundsky|ground-sky/i.test(readFileSync(path, 'utf8')), `game must not reference Ground/Sky: ${relative(root, path)}`);
  });
  if (m.review?.files) capture('review proof', () => {
    demand(Array.isArray(m.review.files), 'review files must be an array');
    const seen = new Set();
    for (const f of m.review.files) {
      demand(/^dev\/groundsky\/[a-z0-9_/-]+\.png$/.test(f.path) && !f.path.startsWith('dev/groundsky/masters/')
        && !seen.has(f.path), 'invalid/duplicate review proof path'); seen.add(f.path);
      const bytes = readFileSync(safePath(root, f.path)), digest = sha256(bytes);
      demand(bytes.length === f.bytes && digest === f.sha256, `review proof byte count/SHA-256 differs: ${f.path}`);
      if (!PNG_CACHE.has(digest)) PNG_CACHE.set(digest, decodePng(bytes, f.path));
      report.reviewCount++;
      if (f.kind === 'eye-height') demand(f.cameraHeightM === 1.6, 'eye-height proof camera must be 1.60 metres');
    }
    demand(m.review.files.filter((f) => f.kind === 'eye-height').length >= 2
      && m.review.files.some((f) => f.kind === 'contact-sheet'), 'review needs contact sheets and two eye-height renders');
  });
  report.ok = report.failures.length === 0;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); let root = ROOT, complete = false, json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--complete') complete = true;
    else if (args[i] === '--json') json = true;
    else if (args[i] === '--root' && args[i + 1]) root = resolve(args[++i]);
    else throw new Error('Usage: groundsky_validate.mjs [--complete] [--root PATH] [--json]');
  }
  const result = validateGroundsky({ root, complete });
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`GROUND/SKY ${result.ok ? 'OK' : 'FAILED'}: ${result.masterCount} PNG masters; ${result.deliveryCount} KTX2 deliveries; ${result.edges.length} exact PNG edge comparisons`);
    console.log(`Texture bytes (masters + delivery): ${result.textureBytes} / ${MAX_TEXTURE_BYTES}`);
    console.log(`ASTC GPU bytes, all times/LODs/full mip chains: ${result.gpuBytes} / ${MAX_GPU_BYTES}`);
    console.log(`Uncompressed RGBA fallback, not within this delivery budget: ${result.rgbaFallbackBytes}`);
    for (const failure of result.failures) console.error(failure);
  }
  process.exitCode = result.ok ? 0 : 1;
}
