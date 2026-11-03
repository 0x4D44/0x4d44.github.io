// Every named case has a deliberately wrong input selected by BEACH_SABOTAGE=<id>|all.
// beach-textures-mutations.mjs runs both the green suite and all independent red cases.
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { pngCrc } from '../tools/textures/beach_png.mjs';
import { validateBeach, decodePng, edgeDifferences, gpuBytes, sha256, lfBytes, ROOT, MANIFEST,
  REQUIRED, REGISTERED, MAX_BYTES, MAX_GPU_BYTES } from '../tools/textures/beach_validate.mjs';

function caseTest(id, title, run) {
  test(`[${id}] ${title}`, (t) => run(t, ['all', id].includes(process.env.BEACH_SABOTAGE)));
}
const errors = (r) => r.failures.join('\n');
const manifest = (root = ROOT) => JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8'));
const save = (f) => writeFileSync(resolve(f.root, MANIFEST), JSON.stringify(f.m, null, 2) + '\n');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ladera-beach-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = manifest();
  const paths = [MANIFEST, 'assets/textures/beach', 'assets/textures/manifest.json', 'assets/models/manifest.json',
    ...m.inputs.map((input) => input.path), m.review.signs.proof];
  for (const path of new Set(paths)) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    cpSync(resolve(ROOT, path), resolve(root, path), { recursive: true });
  }
  return { root, m };
}
function chunk(type, data) {
  const name = Buffer.from(type), out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(pngCrc(Buffer.concat([name, data])), 8 + data.length);
  return out;
}
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function pngBytes({ width, height, rgba }, filter = 0, channels = 4) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = channels === 4 ? 6 : 2;
  const rowBytes = width * channels, raw = Buffer.alloc((rowBytes + 1) * height), packed = Buffer.alloc(rowBytes * height);
  for (let p = 0; p < width * height; p++) for (let c = 0; c < channels; c++) packed[p * channels + c] = rgba[p * 4 + c];
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = filter;
    for (let x = 0; x < rowBytes; x++) {
      const i = y * rowBytes + x, a = x >= channels ? packed[i - channels] : 0, b = y ? packed[i - rowBytes] : 0;
      const c = y && x >= channels ? packed[i - rowBytes - channels] : 0, p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const guess = [0, a, b, Math.floor((a + b) / 2), pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter] ?? 0;
      raw[y * (rowBytes + 1) + x + 1] = (packed[i] - guess) & 255;
    }
  }
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function tinyImage() {
  return { width: 8, height: 8, rgba: Buffer.from(Array.from({ length: 256 }, (_, i) => i * 73 % 256)) };
}
function repin(f, path, bytes) {
  writeFileSync(resolve(f.root, 'assets/textures', path), bytes);
  const png = decodePng(bytes), row = f.m.files.find((file) => file.path === path);
  Object.assign(row, { width: png.width, height: png.height, channels: png.channels, bytes: bytes.length, sha256: sha256(bytes) });
  f.m.imageBytes = f.m.files.reduce((n, file) => n + file.bytes, 0);
  f.m.gpuBytes = f.m.files.reduce((n, file) => n + gpuBytes(file.width, file.height), 0);
  save(f);
}
function decoded(f, id) {
  const path = f.m.textures[id].map;
  return { path, image: decodePng(readFileSync(resolve(f.root, 'assets/textures', path))) };
}
function rejected(f, pattern) {
  const r = validateBeach({ root: f.root, complete: true });
  assert.equal(r.ok, false, 'expected the intentionally corrupted input to fail');
  assert.match(errors(r), pattern);
  return r;
}

caseTest('complete', 'complete requested pack decodes and fits byte/GPU budgets', (t, sabotage) => {
  const f = fixture(t);
  if (sabotage) { f.m.complete = false; save(f); }
  const r = validateBeach({ root: f.root, complete: true });
  assert.equal(r.ok, true, errors(r));
  assert.equal(r.textureCount, Object.keys(REQUIRED).length);
  assert.equal(r.fileCount, 51); // 25 primary PNGs + normal/roughness pairs for 13 materials.
  assert.equal(r.cellCount, 70);
  assert.equal(r.animationGroups, 5); assert.equal(r.registeredFrames, 12);
  assert.ok(r.payloadBytes <= MAX_BYTES && r.gpuBytes <= MAX_GPU_BYTES);
});

caseTest('png_filters', 'decoder reconstructs all five PNG filters and indexed alpha', (_t, sabotage) => {
  assert.equal(pngCrc(Buffer.from('123456789')), 0xcbf43926, 'published CRC-32 check value');
  const source = tinyImage(), wrong = { ...source, rgba: Buffer.from(source.rgba) };
  if (sabotage) wrong.rgba[0] ^= 64;
  for (let filter = 0; filter <= 4; filter++) {
    const actual = decodePng(pngBytes(wrong, filter));
    assert.deepEqual(actual.rgba, source.rgba, `PNG filter ${filter} must reconstruct every source byte`);
  }
  const h = Buffer.alloc(13); h.writeUInt32BE(2); h.writeUInt32BE(1, 4); h[8] = 1; h[9] = 3;
  const indexed = Buffer.concat([PNG_SIGNATURE, chunk('IHDR', h), chunk('PLTE', Buffer.from([255, 0, 0, 0, 0, 255])),
    chunk('tRNS', Buffer.from([0, 255])), chunk('IDAT', deflateSync(Buffer.from([0, 0x40]))), chunk('IEND', Buffer.alloc(0))]);
  assert.deepEqual(decodePng(indexed).rgba, Buffer.from([255, 0, 0, 0, 0, 0, 255, 255]));
});

caseTest('png_damage', 'PNG decoder rejects corrupt CRC, truncation, illegal filters and trailing bytes', (_t, sabotage) => {
  const valid = pngBytes(tinyImage()), crc = Buffer.from(valid); if (!sabotage) crc[29] ^= 1;
  assert.throws(() => decodePng(crc), /CRC/);
  assert.throws(() => decodePng(valid.subarray(0, valid.length - 5)), /truncated|missing/);
  assert.throws(() => decodePng(pngBytes(tinyImage(), 5)), /row filter/);
  assert.throws(() => decodePng(Buffer.concat([valid, Buffer.from([0])])), /trailing/);
});

caseTest('dimensions', 'decoded dimensions and power-of-two rules survive truthful re-pinning', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { path, image } = decoded(f, 'seabed_rock');
    const width = 510, cropped = Buffer.alloc(width * image.height * 4);
    for (let y = 0; y < image.height; y++) image.rgba.copy(cropped, y * width * 4, y * image.width * 4, (y * image.width + width) * 4);
    repin(f, path, pngBytes({ width, height: image.height, rgba: cropped }));
  }
  rejected(f, /power-of-two/);
});

caseTest('sha_pins', 'a changed binary pin cannot silently pass', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) { f.m.files[0].sha256 = '0'.repeat(64); save(f); }
  rejected(f, /SHA-256 differs/);
});

caseTest('shifted_edge', 'shifting only one decoded edge fails even with fresh hashes and totals', (t, sabotage) => {
  const f = fixture(t), { path, image } = decoded(f, 'sand_dry');
  if (!sabotage) {
    const original = Buffer.from(image.rgba);
    for (let y = 1; y < image.height - 1; y++) {
      const other = 1 + (y + 37) % (image.height - 2);
      original.copy(image.rgba, y * image.width * 4, other * image.width * 4, other * image.width * 4 + 4);
    }
    repin(f, path, pngBytes(image));
  }
  assert.ok(edgeDifferences(image, 'x').max > 0, 'edge-shift mutation must damage a real opposite edge');
  rejected(f, /seam x opposite-edge mismatch/);
});

caseTest('alpha_pixels', 'an opaque backdrop fails the promised alpha contract after re-pinning', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { path, image } = decoded(f, 'boat_names');
    for (let i = 3; i < image.rgba.length; i += 4) image.rgba[i] = 255;
    repin(f, path, pngBytes(image, 0, 3));
  }
  rejected(f, /promised alpha/);
});

caseTest('atlas_cells', 'overlapping occupied cells are rejected despite valid normalized UVs', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const cells = f.m.textures.signs_menus.cells;
    cells[1].rect = [...cells[0].rect]; cells[1].uv = [...cells[0].uv]; save(f);
  }
  rejected(f, /overlapping atlas cells/);
});

caseTest('spanish_text', 'Spanish metadata keeps the requested ñ and exact signs', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) { f.m.textures.signs_menus.cells[0].text = 'Zona de bano'; save(f); }
  rejected(f, /requested Spanish, including ñ/);
});

caseTest('provenance', 'every image needs original generation provenance and a source hash', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) { delete f.m.textures.sand_wet.provenance.sourceSha256; save(f); }
  rejected(f, /original generation provenance/);
});

caseTest('payload_budget', 'extra files cannot hide outside declared totals or inflate the 8 MB limit', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) writeFileSync(resolve(f.root, 'assets/textures/beach/unlisted.png'), Buffer.alloc(MAX_BYTES + 1));
  const r = rejected(f, /payload .* exceeds fixed 8000000 byte budget/);
  assert.ok(r.payloadBytes > MAX_BYTES);
  assert.match(errors(r), /unregistered payload file/);
});

caseTest('gpu_budget', 'GPU accounting includes full mip chains and a fixed non-overridable cap', (t, sabotage) => {
  assert.equal(gpuBytes(1024, sabotage ? 256 : 512), 2_796_204, 'rectangular texture full mip count');
  assert.equal(gpuBytes(1024, 1024), 5_592_404);
  assert.equal(gpuBytes(256, 256), 349_524);
  const f = fixture(t); f.m.budgets.maxGpuBytes = MAX_GPU_BYTES * 2; save(f);
  rejected(f, /declared budgets differ from fixed acceptance limits/);
});

caseTest('lf_text_pins', 'CRLF checkout text validates against LF pins while real content changes fail', (t, sabotage) => {
  const f = fixture(t), input = f.m.inputs[0], path = resolve(f.root, input.path);
  const lf = lfBytes(readFileSync(path)).toString('utf8');
  writeFileSync(path, lf.replace(/\n/g, '\r\n') + (sabotage ? '\r\nCONTENT CHANGED\r\n' : ''));
  const r = validateBeach({ root: f.root, complete: true });
  assert.equal(r.ok, true, errors(r));
  writeFileSync(path, lf + '\nCONTENT CHANGED\n');
  rejected(f, /LF SHA-256 mismatch/);
});

caseTest('sign_proof', 'visual text proof must be a complete decoded rendered PNG, not just a declared filename', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const path = resolve(f.root, f.m.review.signs.proof), bad = Buffer.concat([readFileSync(path), Buffer.from([0])]);
    writeFileSync(path, bad); f.m.review.signs.sha256 = sha256(bad); save(f);
  }
  rejected(f, /sign proof: .*trailing/);
});

caseTest('offline', 'new pack stays out of the active model manifest, and out of the texture manifest but for the registered coast materials', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const path = resolve(f.root, 'assets/models/manifest.json'), active = JSON.parse(readFileSync(path));
    active.files.push('manifest.beach.json'); writeFileSync(path, JSON.stringify(active));
  }
  rejected(f, /must not enter active model or texture manifests/);
  // the registered materials are in the active texture manifest and pass; an unregistered one, or a registered id pointing at a file the pack does not have, does not
  const ok = fixture(t), textures = (x) => resolve(x.root, 'assets/textures/manifest.json'), read = (x) => JSON.parse(readFileSync(textures(x)));
  assert.deepEqual(REGISTERED.filter((id) => !(id in read(ok).textures)), [], 'the coast materials are registered in the active texture manifest');
  assert.equal(validateBeach({ root: ok.root, complete: true }).ok, true, errors(validateBeach({ root: ok.root, complete: true })));
  const extra = fixture(t), tex = read(extra); tex.textures.gull_sprites = { map: 'beach/gull_sprites.png', size: 1024 }; writeFileSync(textures(extra), JSON.stringify(tex));
  rejected(extra, /"gull_sprites" is not a registered coast material/);
  const stray = fixture(t), tex2 = read(stray); tex2.textures.sand_dry.map = 'beach/not_in_the_pack.png'; writeFileSync(textures(stray), JSON.stringify(tex2));
  rejected(stray, /"sand_dry\.map" \(beach\/not_in_the_pack\.png\) is not a PNG of the library/);
  const lost = fixture(t), tex3 = read(lost); delete tex3.textures; writeFileSync(textures(lost), JSON.stringify(tex3));
  rejected(lost, /no `textures` table to check/);
});

caseTest('normal_data', 'normal PNGs contain unit forward-facing tangent vectors after re-pinning', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { path, image } = decoded(f, 'water_ripple_n');
    image.rgba.fill(0); for (let i = 3; i < image.rgba.length; i += 4) image.rgba[i] = 255;
    repin(f, path, pngBytes(image));
  }
  rejected(f, /non-unit or negative-Z tangent normal/);
});

caseTest('missing_and_paths', 'complete mode rejects missing PNGs and paths outside the asset pack', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) rmSync(resolve(f.root, 'assets/textures', f.m.files[0].path));
  rejected(f, /ENOENT/);
  const other = fixture(t); other.m.files[0].path = '../outside.png'; save(other);
  rejected(other, /PNG must be within beach/);
});

caseTest('animation_registration', 'matched animation anchors, loops and real transparent content bounds are enforced', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    // Both metadata values honestly describe the moved pivot; only comparison
    // against the other frames reveals the registration drift.
    const cell = f.m.textures.gull_sprites.cells[1];
    cell.registration.anchorPx[0] += 2;
    cell.pivot[0] = cell.registration.anchorPx[0] / cell.rect[2]; save(f);
  }
  rejected(f, /animation registration drift/);
  const loop = fixture(t);
  loop.m.textures.gull_sprites.animations.flap.frames[2] = 7; save(loop);
  rejected(loop, /animation loop frames differ/);
  const pixels = fixture(t), { path, image } = decoded(pixels, 'gull_sprites');
  const [x, y] = pixels.m.textures.gull_sprites.cells[0].rect;
  const i = ((y + 1) * image.width + x + 1) * 4;
  image.rgba[i] = image.rgba[i + 1] = image.rgba[i + 2] = image.rgba[i + 3] = 255;
  repin(pixels, path, pngBytes(image));
  rejected(pixels, /alpha gutter is not fully transparent|visible alpha outside declared contentRect/);
});
