// Independent decoding gate for the beach texture and sprite pack: offline, except the coast's ground materials the consuming beach work registered (REGISTERED, below).
// node la-ladera/tools/textures/beach_validate.mjs --complete [--root la-ladera] [--json]
import '../../tests/nice.mjs';
import { readFileSync, readdirSync, existsSync, realpathSync, statSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { decodePng, edgeDifferences, gpuBytes } from './beach_png.mjs';

export { decodePng, edgeDifferences, gpuBytes } from './beach_png.mjs';
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const MANIFEST = 'assets/textures/manifest.beach.json';
export const MAX_BYTES = 8_000_000;
export const MAX_GPU_BYTES = 160 * 1024 * 1024;
export const SIGN_TEXT = Object.freeze(['Zona de baño', 'Bandera roja', 'Prohibido el paso', 'Cocadas', 'Ceviche',
  'Jugos naturales', 'Helados', 'Alquiler de tablas', 'Cooperativa de pescadores', 'Salvavidas']);
export const BOAT_NAMES = Object.freeze(['Maria del Mar', 'La Esperanza', 'San Pedro', 'Brisa']);
export const REQUIRED = Object.freeze({
  sand_dry: [1024, 1024], sand_wet: [1024, 1024], seabed_sand: [1024, 1024], seabed_rock: [512, 512],
  rock_sea: [1024, 1024], seawall_concrete: [512, 512], promenade_pavers: [512, 512], jetty_planks: [512, 512],
  pile_wood: [512, 512], rope_hemp: [256, 256], thatch_palm: [512, 512], canvas_stripe: [512, 512],
  water_ripple_n: [256, 256], foam_noise: [256, 256], caustic_tile: [256, 256], boat_hull_paint: [512, 512],
  sails_kites: [1024, 512], board_decks: [1024, 512], towels_bags: [512, 512], signs_menus: [1024, 512],
  boat_names: [512, 256], gull_sprites: [1024, 256], fish_sprites: [512, 256], crab_shells: [256, 256], seagrass_coral: [512, 512],
});
// What the consuming beach work has registered in the active texture manifest, one material at a time (round 7, A5: js/world/coastmesh.js and periphery.js draw the coast's
// ground with them). Everything else of the pack stays offline: a later consumer adds its ids here, which is the review.
export const REGISTERED = Object.freeze(['sand_dry', 'sand_wet', 'seabed_sand', 'seabed_rock', 'rock_sea', 'seawall_concrete', 'promenade_pavers']);
/** The beach PROPS library's atlas, registered for js/world/beachprops.js: its id in the active texture manifest -> the props library's manifest, whose `textures.maps` name the three PNGs it may point at. */
export const REGISTERED_ATLAS = Object.freeze({ beach_props: 'assets/models/manifest.beach_props.json' });
/** The PNGs a props library manifest names, as the active texture manifest writes them (relative to assets/textures/); empty when the manifest is missing or unreadable. */
function atlasPngs(root, manifestPath) {
  try {
    const lib = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
    return new Set(Object.values(lib.textures?.maps ?? {}).map((x) => String(x?.path ?? '').replace(/^\.\.\/textures\//, '')));
  } catch { return new Set(); }
}
const CELL_COUNTS = Object.freeze({ sails_kites: 12, board_decks: 8, towels_bags: 16, signs_menus: 10,
  boat_names: 4, gull_sprites: 8, fish_sprites: 6, crab_shells: 3, seagrass_coral: 3 });
const ALPHA = new Set(['foam_noise', 'boat_names', 'gull_sprites', 'fish_sprites', 'crab_shells', 'seagrass_coral']);
const EFFECTS = new Set(['water_ripple_n', 'foam_noise', 'caustic_tile']);
const TILE_METRES = Object.freeze({ sand_dry: 2.5, sand_wet: 2.5, seabed_sand: 3, seabed_rock: 3,
  rock_sea: 2, seawall_concrete: 2, promenade_pavers: 2.4, jetty_planks: 2, pile_wood: 1.5,
  rope_hemp: 0.5, thatch_palm: 1.5, canvas_stripe: 1, water_ripple_n: 6, foam_noise: 6, caustic_tile: 4, boat_hull_paint: 3 });
const ROLES = new Set(['albedo', 'normal', 'roughness', 'sprite', 'effect']);
const HEX = /^[a-f0-9]{64}$/;
const DECODED = new Map();
const demand = (ok, message) => { if (!ok) throw new Error(message); };
const equal = (a, b) => Array.isArray(a) && a.length === b.length && a.every((n, i) => n === b[i]);
const finite = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const pot = (x) => Number.isInteger(x) && x > 0 && (x & (x - 1)) === 0;
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const lfBytes = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n'));

function inside(root, path, label) {
  demand(typeof path === 'string' && path.length && !isAbsolute(path) && !path.includes('\\')
    && !path.split('/').includes('..') && !/^[A-Za-z]:/.test(path), `${label}: unsafe relative path`);
  const p = resolve(root, path), r = relative(root, p);
  demand(r !== '..' && !r.startsWith('..' + sep) && !isAbsolute(r), `${label}: path escapes root`);
  if (existsSync(p)) {
    const actual = relative(realpathSync(root), realpathSync(p));
    demand(actual !== '..' && !actual.startsWith('..' + sep) && !isAbsolute(actual), `${label}: symlink escapes root`);
  }
  return p;
}
function walk(dir) {
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory()
    ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]) : [];
}
function alphaStats(png, rect = [0, 0, png.width, png.height]) {
  const [x, y, w, h] = rect;
  let clear = 0, opaque = 0, nonzero = 0;
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const a = png.rgba[(j * png.width + i) * 4 + 3];
    if (a <= 8) clear++;
    if (a >= 240) opaque++;
    if (a > 8) nonzero++;
  }
  return { clear: clear / (w * h), opaque: opaque / (w * h), nonzero: nonzero / (w * h) };
}
function checkNormal(png, label) {
  for (let i = 0; i < png.rgba.length; i += 4) {
    const x = png.rgba[i] / 127.5 - 1, y = png.rgba[i + 1] / 127.5 - 1, z = png.rgba[i + 2] / 127.5 - 1;
    demand(z >= -1 / 255 && Math.abs(Math.hypot(x, y, z) - 1) <= 0.10, `${label}: non-unit or negative-Z tangent normal`);
  }
}

function checkAnimationRegistration(texture, key) {
  const plan = key === 'gull_sprites' ? {
    flap: { members: [0, 1, 2, 3], frames: [0, 1, 2, 3, 2, 1] },
    walk: { members: [5, 6], frames: [5, 6] },
  } : key === 'fish_sprites' ? {
    jack: { members: [0, 3], frames: [0, 3] },
    grunt: { members: [1, 4], frames: [1, 4] },
    tang: { members: [2, 5], frames: [2, 5] },
  } : null;
  if (!plan) return { groups: 0, frames: 0 };
  demand(texture.animations && equal(Object.keys(texture.animations).sort(), Object.keys(plan).sort()), 'required animation loops are missing or unexpected loops were added');
  let count = 0;
  for (const [group, expected] of Object.entries(plan)) {
    const loop = texture.animations[group];
    demand(equal(loop.frames, expected.frames), `${group}: animation loop frames differ from the specified sequence`);
    demand(Number.isFinite(loop.fps) && loop.fps > 0 && loop.fps <= 60, `${group}: animation fps must be finite, positive and at most 60`);
    let first;
    for (let frame = 0; frame < expected.members.length; frame++) {
      const index = expected.members[frame], cell = texture.cells[index], registration = cell?.registration;
      demand(cell && registration?.group === group && registration.anchor === 'eye'
        && cell.animation === group && cell.frame === frame && cell.facing === '+X', `${group}/${index}: missing or incorrect animation registration metadata`);
      demand(finite(registration.anchorPx, 2) && finite(registration.sourceAnchorPx, 2)
        && registration.sourceAnchorPx.every((v) => v >= 0) && Number.isFinite(registration.scale) && registration.scale > 0,
      `${group}/${index}: registration anchors/scale must be finite and source coordinates nonnegative`);
      const [, , w, h] = cell.rect;
      demand(registration.anchorPx[0] >= 0 && registration.anchorPx[0] <= w
        && registration.anchorPx[1] >= 0 && registration.anchorPx[1] <= h,
      `${group}/${index}: destination registration anchor is outside the cell`);
      demand(finite(cell.pivot, 2) && cell.pivot.every((v) => v >= 0 && v <= 1)
        && Math.abs(cell.pivot[0] - registration.anchorPx[0] / w) <= 1e-6
        && Math.abs(cell.pivot[1] - registration.anchorPx[1] / h) <= 1e-6,
      `${group}/${index}: pivot differs from the declared registration anchor`);
      if (first) demand(registration.anchorPx.every((v, i) => Math.abs(v - first.anchorPx[i]) <= 1e-6)
        && Math.abs(registration.scale - first.scale) <= 1e-6, `${group}/${index}: animation registration drift (anchor or scale changed within group)`);
      else first = registration;
      count++;
    }
    demand(loop.frames.every((index) => Number.isInteger(index) && index >= 0 && index < texture.cells.length
      && texture.cells[index].registration?.group === group), `${group}: animation loop references an invalid or unrelated cell`);
  }
  // Eye positions are author-reviewed metadata. This verifies their geometric
  // agreement, not anatomical eye recognition in the generated artwork.
  return { groups: Object.keys(plan).length, frames: count };
}

export function validateBeach({ root = ROOT, complete = false } = {}) {
  root = resolve(root);
  const report = { ok: false, failures: [], textureCount: 0, fileCount: 0, cellCount: 0,
    animationGroups: 0, registeredFrames: 0, imageBytes: 0, payloadBytes: 0, gpuBytes: 0,
    maxBytes: MAX_BYTES, maxGpuBytes: MAX_GPU_BYTES, edges: [], files: [] };
  const capture = (label, fn) => { try { return fn(); } catch (e) { report.failures.push(`${label}: ${e.message}`); return undefined; } };
  const manifestBytes = capture('manifest', () => readFileSync(resolve(root, MANIFEST)));
  if (!manifestBytes) return report;
  report.payloadBytes = manifestBytes.length;
  const m = capture('manifest JSON', () => JSON.parse(manifestBytes));
  if (!m) return report;
  capture('contract', () => {
    demand(m.version === 1 && m.runtime === false, 'version must be 1 and runtime must be false');
    demand(!complete || m.complete === true, '--complete rejects preview/partial output');
    demand(m.budgets?.maxBytes === MAX_BYTES && m.budgets?.maxGpuBytes === MAX_GPU_BYTES, 'declared budgets differ from fixed acceptance limits');
    demand(m.textures && typeof m.textures === 'object' && !Array.isArray(m.textures), 'textures object is required');
    demand(Array.isArray(m.files) && m.files.length > 0, 'generated PNG files are required');
  });
  const declarations = new Map(), images = new Map(), used = new Set();
  for (const f of Array.isArray(m.files) ? m.files : []) capture(`PNG ${f?.path ?? '?'}`, () => {
    demand(typeof f.path === 'string' && /^beach\/[a-z0-9_/-]+\.png$/.test(f.path), 'PNG must be within beach/');
    demand(!declarations.has(f.path), 'duplicate PNG declaration');
    declarations.set(f.path, f);
    const path = inside(resolve(root, 'assets/textures'), f.path, f.path), bytes = readFileSync(path), digest = sha256(bytes);
    report.imageBytes += bytes.length; report.fileCount++;
    demand(f.bytes === bytes.length && f.sha256 === digest, 'byte count/SHA-256 differs from actual PNG bytes');
    let png = DECODED.get(digest);
    if (!png) { png = decodePng(bytes, f.path); DECODED.set(digest, png); if (DECODED.size > 96) DECODED.delete(DECODED.keys().next().value); }
    images.set(f.path, png);
    report.gpuBytes += gpuBytes(png.width, png.height);
    demand(pot(png.width) && pot(png.height) && png.width <= 2048 && png.height <= 2048, 'PNG dimensions must be power-of-two and at most 2048');
    demand(f.width === png.width && f.height === png.height, 'PNG dimensions differ from manifest');
    demand(f.channels === undefined || f.channels === png.channels, 'PNG channels differ from manifest');
    demand(ROLES.has(f.role), 'unknown PNG map role');
    demand(typeof f.alpha === 'boolean', 'alpha promise must be explicit');
    if (f.alpha) {
      const a = alphaStats(png);
      demand(png.hasAlpha && a.clear >= 0.005 && a.opaque >= 0.001, 'promised alpha needs transparent background and visible subject pixels');
    } else for (let i = 3; i < png.rgba.length; i += 4) demand(png.rgba[i] === 255, 'opaque map contains undeclared transparent pixels');
    demand(Array.isArray(f.tileAxes) && f.tileAxes.every((a) => a === 'x' || a === 'y') && new Set(f.tileAxes).size === f.tileAxes.length, 'invalid tiling axes');
    if (f.tileAxes.length) {
      demand(f.edgeTolerance?.max === 0 && f.edgeTolerance?.mean === 0, 'edge tolerance must remain max 0 / mean 0 in 8-bit channels');
      for (const axis of f.tileAxes) {
        const d = edgeDifferences(png, axis); report.edges.push({ path: f.path, axis, ...d });
        demand(d.max === 0 && d.mean === 0, `seam ${axis} opposite-edge mismatch (max ${d.max}, mean ${d.mean.toFixed(4)}; tolerance 0)`);
      }
    }
    if (f.role === 'normal') checkNormal(png, f.path);
    if (f.role === 'roughness') for (let i = 0; i < png.rgba.length; i += 4)
      demand(png.rgba[i] === png.rgba[i + 1] && png.rgba[i] === png.rgba[i + 2], 'roughness must be scalar grayscale data');
    report.files.push({ path: f.path, width: png.width, height: png.height, bytes: bytes.length, gpuBytes: gpuBytes(png.width, png.height) });
  });
  const keys = Object.keys(m.textures ?? {});
  report.textureCount = keys.length;
  capture('catalogue', () => demand(keys.length === Object.keys(REQUIRED).length && keys.every((key) => REQUIRED[key]), 'complete catalogue requires exactly the 25 requested materials and atlases'));
  for (const [key, expected] of Object.entries(REQUIRED)) capture(`texture ${key}`, () => {
    const t = m.textures?.[key]; demand(t && typeof t === 'object', 'required texture is absent');
    demand(equal(t.size, expected), `expected ${expected.join(' x ')} pixel size`);
    const atlas = Object.hasOwn(CELL_COUNTS, key), expectedAxes = atlas ? [] : ['pile_wood', 'boat_hull_paint'].includes(key) ? ['x'] : key === 'rope_hemp' ? ['y'] : ['x', 'y'];
    demand(t.uv === (atlas ? 'unit' : 'tile') && equal(t.tileAxes, expectedAxes), 'UV mode or tiling axes differ from the requested surface');
    demand(typeof t.alpha === 'boolean' && t.alpha === ALPHA.has(key), 'alpha promise differs from requested texture');
    if (!atlas) demand(t.tile === TILE_METRES[key], 'tile scale differs from the specified real-world metres');
    if (key === 'canvas_stripe') demand(t.tint === true, 'canvas_stripe must be tintable');
    const p = t.provenance;
    demand(p && p.method === 'OpenAI built-in image generator' && typeof p.prompt === 'string' && p.prompt.length > 30
      && HEX.test(p.sourceSha256) && p.license === 'CC0-1.0' && typeof p.notes === 'string' && p.notes.length > 10, 'original generation provenance, prompt, source hash, licence and processing notes are required');
    const map = images.get(t.map), mapFile = declarations.get(t.map);
    demand(map && mapFile && equal([map.width, map.height], expected), 'base PNG is missing or has the wrong decoded size');
    used.add(t.map);
    demand(equal(mapFile.tileAxes, expectedAxes) && mapFile.alpha === t.alpha, 'base PNG declaration disagrees with texture contract');
    demand(mapFile.role === (key === 'water_ripple_n' ? 'normal' : atlas ? 'sprite' : EFFECTS.has(key) ? 'effect' : 'albedo'), 'base PNG role disagrees with material or atlas');
    if (key === 'water_ripple_n') demand(mapFile.role === 'normal', 'water ripple must be tangent-space normal data');
    if (!atlas && !EFFECTS.has(key)) for (const [binding, role] of [['normal', 'normal'], ['rough', 'roughness']]) {
      const image = images.get(t[binding]), file = declarations.get(t[binding]);
      demand(image && file && file.role === role, `physical material requires a decoded ${binding} map`);
      demand(image.width === image.height && image.width <= expected[0] && image.width >= 128, `${binding} map dimensions must be square, 128..albedo-size`);
      demand(equal(file.tileAxes, expectedAxes) && !file.alpha, `${binding} tiling axes or alpha disagree with material`);
      used.add(t[binding]);
    }
    if (atlas) {
      demand(Array.isArray(t.cells) && t.cells.length === CELL_COUNTS[key], `atlas requires ${CELL_COUNTS[key]} occupied cell rectangles`);
      const ids = new Set();
      for (let index = 0; index < t.cells.length; index++) {
        const cell = t.cells[index];
        demand(typeof cell.id === 'string' && cell.id.length && !ids.has(cell.id), 'cell identifiers must be distinct'); ids.add(cell.id);
        demand(finite(cell.rect, 4) && cell.rect.every(Number.isInteger), `${cell.id}: cell rectangle must contain finite pixel integers`);
        const [x, y, w, h] = cell.rect;
        demand(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= expected[0] && y + h <= expected[1], `${cell.id}: cell rectangle outside image`);
        demand(finite(cell.uv, 4) && cell.uv.every((v, i) => Math.abs(v - [x / expected[0], y / expected[1], (x + w) / expected[0], (y + h) / expected[1]][i]) <= 1e-9), `${cell.id}: cell UVs differ from top-origin pixel rectangle`);
        for (const other of t.cells.slice(0, index)) {
          const [a, b, c, d] = other.rect;
          demand(x >= a + c || a >= x + w || y >= b + d || b >= y + h, `${cell.id}: overlapping atlas cells`);
        }
        demand(finite(cell.contentRect, 4) && cell.contentRect.every(Number.isInteger), `${cell.id}: contentRect must contain finite pixel integers`);
        const [cx, cy, cw, ch] = cell.contentRect;
        demand(cx >= x && cy >= y && cw > 0 && ch > 0 && cx + cw <= x + w && cy + ch <= y + h,
          `${cell.id}: contentRect is outside its owning cell`);
        demand(Number.isInteger(cell.gutter) && cell.gutter >= 6, `${cell.id}: declared cell gutter must be at least 6 pixels`);
        if (key === 'gull_sprites' || key === 'fish_sprites') demand(finite(cell.pivot, 2)
          && cell.pivot.every((v) => v >= 0 && v <= 1) && cell.facing === '+X', `${cell.id}: invalid sprite pivot or facing`);
        if (t.alpha) {
          const a = alphaStats(map, cell.rect);
          demand(a.clear >= 0.02 && a.nonzero >= 0.005, `${cell.id}: alpha cell has no clear padding or visible subject`);
          demand(cx >= x + 2 && cy >= y + 2 && cx + cw <= x + w - 2 && cy + ch <= y + h - 2,
            `${cell.id}: contentRect must leave a transparent outer gutter`);
          for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
            const alpha = map.rgba[(py * map.width + px) * 4 + 3];
            if (px < x + 2 || py < y + 2 || px >= x + w - 2 || py >= y + h - 2)
              demand(alpha === 0, `${cell.id}: outer two-pixel alpha gutter is not fully transparent`);
            if (px < cx || py < cy || px >= cx + cw || py >= cy + ch)
              demand(alpha === 0, `${cell.id}: visible alpha outside declared contentRect`);
          }
        }
      }
      report.cellCount += t.cells.length;
      if (key === 'signs_menus') demand(equal(t.cells.map((c) => c.text), SIGN_TEXT), 'sign text must match requested Spanish, including ñ');
      if (key === 'boat_names') demand(equal(t.cells.map((c) => c.text), BOAT_NAMES), 'boat lettering must match the four requested names verbatim');
      const registration = checkAnimationRegistration(t, key);
      report.animationGroups += registration.groups; report.registeredFrames += registration.frames;
    }
  });
  capture('file inventory', () => {
    for (const path of declarations.keys()) demand(used.has(path), `unbound declared PNG: ${path}`);
    for (const path of walk(resolve(root, 'assets/textures/beach'))) {
      report.payloadBytes += statSync(path).size;
      const rel = relative(resolve(root, 'assets/textures'), path).split(sep).join('/');
      demand(declarations.has(rel), `unregistered payload file: ${rel}`);
    }
  });
  capture('budgets', () => {
    // Count the whole directory even if inventory validation stopped at an unexpected file.
    report.payloadBytes = manifestBytes.length + walk(resolve(root, 'assets/textures/beach')).reduce((s, p) => s + statSync(p).size, 0);
    demand(report.payloadBytes <= MAX_BYTES, `payload ${report.payloadBytes} exceeds fixed ${MAX_BYTES} byte budget`);
    demand(report.gpuBytes <= MAX_GPU_BYTES, `GPU ${report.gpuBytes} exceeds fixed ${MAX_GPU_BYTES} byte budget`);
    demand(m.imageBytes === report.imageBytes, 'imageBytes differs from decoded file inventory');
    demand(m.gpuBytes === report.gpuBytes, 'gpuBytes differs from RGBA8 full-mip pixel accounting');
  });
  capture('text input pins', () => {
    demand(Array.isArray(m.inputs) && m.inputs.length > 0, 'LF-normalized text input pins are required');
    const seen = new Set();
    for (const input of m.inputs) {
      demand(!seen.has(input.path) && input.normalization === 'lf' && HEX.test(input.sha256), 'duplicate or invalid LF text pin'); seen.add(input.path);
      const path = inside(root, input.path, 'input pin');
      demand(sha256(lfBytes(readFileSync(path))) === input.sha256, `LF SHA-256 mismatch: ${input.path}`);
    }
  });
  capture('sign proof', () => {
    const proof = m.review?.signs;
    demand(proof?.verified === true && typeof proof.notes === 'string' && proof.notes.length > 20 && HEX.test(proof.sha256), 'visual sign-legibility attestation and proof hash are required');
    demand(typeof proof.proof === 'string' && /^dev\/beach-textures\/.+\.png$/.test(proof.proof), 'sign proof must be a rendered PNG contact sheet');
    const bytes = readFileSync(inside(root, proof.proof, 'sign proof'));
    demand(sha256(bytes) === proof.sha256, 'rendered sign proof SHA-256 mismatch');
    const png = decodePng(bytes, 'sign proof');
    demand(png.width >= 1024 && png.height >= 512, 'sign proof resolution is too small to inspect lettering');
  });
  capture('offline loader contract', () => {
    const models = readFileSync(resolve(root, 'assets/models/manifest.json'), 'utf8');
    const active = JSON.parse(readFileSync(resolve(root, 'assets/textures/manifest.json'), 'utf8'));
    demand(!/manifest\.beach\.json/.test(models), 'beach library must not enter active model or texture manifests');
    // The texture manifest may name the library only as the registered coast materials, each one a PNG this gate has decoded (a `source` note may mention the pack's manifest, nothing else may).
    const library = new Set(Object.values(m.files ?? {}).map((file) => file?.path));
    demand(active.textures && typeof active.textures === 'object', 'the active texture manifest has no `textures` table to check');
    for (const [id, entry] of Object.entries(active.textures)) {
      if (!entry || typeof entry !== 'object') continue;
      const refs = Object.entries(entry).filter(([key, value]) => key !== 'source' && typeof value === 'string' && /beach/.test(value));
      if (!refs.length) continue;
      if (id in REGISTERED_ATLAS) {                    // the props library's atlas: registered under its own name, and only ever as the PNGs that library's manifest names
        const own = atlasPngs(root, REGISTERED_ATLAS[id]);
        for (const [key, value] of refs) demand(own.has(value), `beach library must not enter active model or texture manifests: "${id}.${key}" (${value}) is not a PNG of the props library`);
        continue;
      }
      demand(REGISTERED.includes(id), `beach library must not enter active model or texture manifests: "${id}" is not a registered coast material`);
      for (const [key, value] of refs) demand(library.has(value), `beach library must not enter active model or texture manifests: "${id}.${key}" (${value}) is not a PNG of the library`);
    }
  });
  report.ok = report.failures.length === 0;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--complete') options.complete = true;
    else if (args[i] === '--root' && args[i + 1] && !args[i + 1].startsWith('--')) options.root = args[++i];
    else if (args[i] !== '--json') { console.error(`Unknown or incomplete argument: ${args[i]}`); process.exit(2); }
  }
  const report = validateBeach(options);
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.ok ? 'PASS' : 'FAIL'} beach textures: ${report.textureCount} entries, ${report.fileCount} PNGs, ${report.cellCount} atlas cells`);
    console.log(`Payload: ${report.payloadBytes.toLocaleString('en-US')} / ${MAX_BYTES.toLocaleString('en-US')} bytes (PNGs + manifest)`);
    console.log(`GPU: ${report.gpuBytes.toLocaleString('en-US')} / ${MAX_GPU_BYTES.toLocaleString('en-US')} bytes (RGBA8, all mip levels)`);
    console.log(`Seams: ${report.edges.length} opposite-edge comparisons; tolerance max 0 / mean 0 per 8-bit channel`);
    console.log(`Animation registration: ${report.animationGroups} groups, ${report.registeredFrames} frames; reviewed eye anchors and shared group scales`);
    console.log('Sign legibility: recorded visual proof and exact Spanish metadata; no automated OCR claim');
    for (const failure of report.failures) console.error(`  ${failure}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}
