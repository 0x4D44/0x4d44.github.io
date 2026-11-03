// Each named case has its own deliberate wrong input. The mutation runner verifies
// an attributable assertion failure for every case, not merely a process failure.
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { deflateSync, zstdCompressSync } from 'node:zlib';
import { pngCrc } from '../tools/groundsky_png.mjs';
import { ROOT, MANIFEST, CATALOGUE, validateGroundsky, decodePng, decodeKtx2, edgeDifferences,
  sha256, astcMipBytes, rgbaMipBytes, MAX_TEXTURE_BYTES, MAX_FILE_BYTES, MAX_GPU_BYTES } from '../tools/groundsky_validate.mjs';

function caseTest(id, title, run) {
  test(`[${id}] ${title}`, (t) => run(t, [id, 'all'].includes(process.env.GROUNDSKY_SABOTAGE)));
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ladera-groundsky-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const m = JSON.parse(readFileSync(resolve(ROOT, MANIFEST), 'utf8'));
  const c = JSON.parse(readFileSync(resolve(ROOT, CATALOGUE), 'utf8'));
  for (const path of [MANIFEST, CATALOGUE, 'assets/textures/groundsky', 'dev/groundsky/masters',
    'assets/models/manifest.json', 'assets/textures/manifest.json', 'js', ...(m.review?.files ?? []).map((f) => f.path)]) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    cpSync(resolve(ROOT, path), resolve(root, path), { recursive: true });
  }
  return { root, m, c };
}
function save(f) {
  writeFileSync(resolve(f.root, MANIFEST), JSON.stringify(f.m, null, 2) + '\n');
  writeFileSync(resolve(f.root, CATALOGUE), JSON.stringify(f.c, null, 2) + '\n');
}
function update(f, path, patch) {
  Object.assign(f.m.files.find((r) => r.path === path), patch);
  Object.assign(f.c.files.find((r) => r.path === path), Object.fromEntries(Object.entries(patch).filter(([k]) => !['sha256', 'bytes'].includes(k))));
}
function repin(f, path, bytes) {
  writeFileSync(resolve(f.root, path), bytes);
  const patch = { bytes: bytes.length, sha256: sha256(bytes) };
  if (path.endsWith('.png')) {
    const image = decodePng(bytes); Object.assign(patch, { width: image.width, height: image.height });
  }
  update(f, path, patch); save(f);
}
function selected(f, predicate) {
  const record = f.m.files.find((r) => r.format === 'png' && predicate(r));
  assert.ok(record, 'test fixture needs the requested real master');
  return { record, image: decodePng(readFileSync(resolve(f.root, record.path))) };
}
function rejected(f, pattern) {
  const report = validateGroundsky({ root: f.root, complete: true });
  assert.equal(report.ok, false, 'the intentionally wrong input must be rejected');
  assert.match(report.failures.join('\n'), pattern);
  return report;
}
function chunk(type, data) {
  const name = Buffer.from(type), bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length); name.copy(bytes, 4); data.copy(bytes, 8);
  bytes.writeUInt32BE(pngCrc(Buffer.concat([name, data])), data.length + 8);
  return bytes;
}
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function pngBytes({ width, height, rgba }, filter = 0) {
  const h = Buffer.alloc(13); h.writeUInt32BE(width); h.writeUInt32BE(height, 4); h[8] = 8; h[9] = 6;
  const stride = width * 4, raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= 4 ? rgba[i - 4] : 0, b = y ? rgba[i - stride] : 0, c = y && x >= 4 ? rgba[i - stride - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const prediction = [0, a, b, Math.floor((a + b) / 2), pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter] ?? 0;
      raw[y * (stride + 1) + x + 1] = (rgba[i] - prediction) & 255;
    }
  }
  return Buffer.concat([PNG_MAGIC, chunk('IHDR', h), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function tinyImage() {
  return { width: 8, height: 8, rgba: Buffer.from(Array.from({ length: 256 }, (_, i) => (i * 73 + 11) % 256)) };
}
// Independently written container fixture. These tests exercise KTX framing and
// mip accounting; ASTC rendering is covered by the separate actual-export review.
function tinyKtx(padded = false, blockSize = 6, compression = 3) {
  const w = 8, h = 8, levels = 4, header = Buffer.alloc(80 + levels * 24), dfd = Buffer.alloc(44);
  Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32LE(blockSize === 4 ? 157 : 165, 12); header.writeUInt32LE(1, 16); header.writeUInt32LE(w, 20); header.writeUInt32LE(h, 24);
  header.writeUInt32LE(1, 36); header.writeUInt32LE(levels, 40); header.writeUInt32LE(compression, 44);
  header.writeUInt32LE(header.length, 48); header.writeUInt32LE(dfd.length, 52);
  dfd.writeUInt32LE(44); dfd.writeUInt16LE(2, 8); dfd.writeUInt16LE(40, 10); dfd[12] = 162; dfd[14] = 1;
  dfd[16] = blockSize - 1; dfd[17] = blockSize - 1; dfd[20] = 16; dfd[30] = 127; dfd.writeUInt32LE(0xffffffff, 40);
  const parts = [header, dfd]; let cursor = header.length + dfd.length;
  for (let level = levels - 1; level >= 0; level--) {
    const width = Math.max(1, w >> level), height = Math.max(1, h >> level), count = Math.ceil(width / blockSize) * Math.ceil(height / blockSize);
    const block = Buffer.from([0xfc, 0xfd, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 255, 255]);
    const raw = Buffer.concat(Array.from({ length: count }, () => block));
    const data = compression === 2 ? zstdCompressSync(raw) : deflateSync(raw);
    const padding = padded ? (8 - cursor % 8) % 8 : 0;
    if (padding) { parts.push(Buffer.alloc(padding)); cursor += padding; }
    const at = 80 + level * 24;
    header.writeBigUInt64LE(BigInt(cursor), at); header.writeBigUInt64LE(BigInt(data.length), at + 8); header.writeBigUInt64LE(BigInt(raw.length), at + 16);
    parts.push(data); cursor += data.length;
  }
  return Buffer.concat(parts);
}

caseTest('complete', 'the complete pack passes its independent decoded acceptance gate', (t, sabotage) => {
  const f = fixture(t);
  if (sabotage) { f.m.complete = false; save(f); }
  const r = validateGroundsky({ root: f.root, complete: true });
  assert.equal(r.ok, true, r.failures.join('\n'));
  assert.equal(r.masterCount, 122); assert.equal(r.deliveryCount, 122); assert.equal(r.fileCount, 244);
  assert.equal(r.edges.length, 148);
  assert.ok(r.textureBytes <= MAX_TEXTURE_BYTES && r.gpuBytes <= MAX_GPU_BYTES);
});

caseTest('png_filters', 'every PNG row filter reconstructs the same exact pixels', (_t, sabotage) => {
  assert.equal(pngCrc(Buffer.from('123456789')), 0xcbf43926);
  const expected = tinyImage(), input = { ...expected, rgba: Buffer.from(expected.rgba) };
  if (sabotage) input.rgba[9] ^= 128;
  for (let filter = 0; filter < 5; filter++) assert.deepEqual(decodePng(pngBytes(input, filter)).rgba, expected.rgba);
});

caseTest('png_palette', 'packed palette indices and transparency retain all colours and alpha', (_t, sabotage) => {
  const h = Buffer.alloc(13); h.writeUInt32BE(4); h.writeUInt32BE(1, 4); h[8] = 2; h[9] = 3;
  const palette = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  const alpha = Buffer.from([0, 85, 170, 255]); if (sabotage) alpha[1] = 255;
  const bytes = Buffer.concat([PNG_MAGIC, chunk('IHDR', h), chunk('PLTE', palette), chunk('tRNS', alpha),
    chunk('IDAT', deflateSync(Buffer.from([0, 0x1b]))), chunk('IEND', Buffer.alloc(0))]);
  assert.deepEqual(decodePng(bytes).rgba, Buffer.from([255, 0, 0, 0, 0, 255, 0, 85, 0, 0, 255, 170, 255, 255, 255, 255]));
});

caseTest('png_damage', 'CRC damage, truncation, trailing bytes and illegal filters fail decoding', (_t, sabotage) => {
  const valid = pngBytes(tinyImage()), damaged = Buffer.from(valid); if (!sabotage) damaged[29] ^= 1;
  assert.throws(() => decodePng(damaged), /CRC/);
  assert.throws(() => decodePng(valid.subarray(0, valid.length - 4)), /truncated|missing/);
  assert.throws(() => decodePng(Buffer.concat([valid, Buffer.from([0])])), /trailing/);
  assert.throws(() => decodePng(pngBytes(tinyImage(), 5)), /row filter/);
});

caseTest('mip_accounting', 'GPU accounting includes compressed block rounding and the complete mip tail', (_t, sabotage) => {
  assert.equal(astcMipBytes(sabotage ? 4 : 8, 8), 112);
  assert.equal(astcMipBytes(1, 1), 16);
  assert.equal(astcMipBytes(12, 12, 4), 240);
  assert.equal(astcMipBytes(12, 12, 6), 112);
  assert.equal(rgbaMipBytes(1024, 512), 2_796_204);
  assert.equal(rgbaMipBytes(1024, 1024), 5_592_404);
  const image = decodeKtx2(tinyKtx()); assert.equal(image.gpuBytes, 112); assert.equal(image.mipLevels.length, 4);
  assert.deepEqual(decodeKtx2(tinyKtx(false, 4)).blockSize, [4, 4]);
  assert.equal(decodeKtx2(tinyKtx(false, 4, 2)).supercompression, 'zstd');
  assert.equal(decodeKtx2(tinyKtx(false, 6, 2)).gpuBytes, 112);
});

caseTest('ktx_header', 'KTX2 dimensions, ASTC colour model and full mip counts are structural gates', (_t, sabotage) => {
  const bytes = tinyKtx(); if (!sabotage) bytes.writeUInt32LE(2, 40);
  assert.throws(() => decodeKtx2(bytes), /full mip chain/);
  const wrongColour = tinyKtx(); wrongColour[wrongColour.readUInt32LE(48) + 14] = 2;
  assert.throws(() => decodeKtx2(wrongColour), /colour transfer/);
  const wrongBlock = tinyKtx(false, 4); wrongBlock[wrongBlock.readUInt32LE(48) + 16] = 5;
  assert.throws(() => decodeKtx2(wrongBlock), /DFD block dimensions/);
});

caseTest('ktx_overlap', 'a KTX2 mip cannot overlap its header or another section', (_t, sabotage) => {
  const bytes = tinyKtx(); if (!sabotage) bytes.writeBigUInt64LE(0n, 80);
  assert.throws(() => decodeKtx2(bytes), /overlapping/);
  assert.throws(() => decodeKtx2(tinyKtx(true)), /tightly packed smallest-first/);
});

caseTest('ktx_payload', 'all Zstd and zlib mip streams are inflated and damaged compressed bytes fail', (_t, sabotage) => {
  const bytes = tinyKtx(); if (!sabotage) bytes[Number(bytes.readBigUInt64LE(80)) + 2] ^= 128;
  assert.throws(() => decodeKtx2(bytes));
  const zstd = tinyKtx(false, 4, 2); if (!sabotage) zstd[Number(zstd.readBigUInt64LE(80))] ^= 255;
  assert.throws(() => decodeKtx2(zstd));
});

caseTest('coverage', 'removing a whole material cannot pass as a complete catalogue', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const files = f.m.files.filter((r) => r.material === 'kikuyu_lush');
    f.m.files = f.m.files.filter((r) => !files.includes(r)); f.c.files = f.c.files.filter((r) => !files.some((x) => x.path === r.path)); save(f);
  }
  rejected(f, /ground set kikuyu_lush needs|122 PNG masters/);
});

caseTest('missing_file', 'a declared texture must exist on disk', (t, sabotage) => {
  const f = fixture(t); if (!sabotage) rmSync(resolve(f.root, f.m.files[0].path));
  rejected(f, /ENOENT/);
});

caseTest('path_escape', 'texture paths cannot escape either allowed namespace', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) { const path = f.m.files[0].path; update(f, path, { path: '../outside.png' }); save(f); }
  rejected(f, /namespace|unsafe relative path/);
});

caseTest('binary_pins', 'changed file bytes cannot pass with stale SHA-256 pins', (t, sabotage) => {
  const f = fixture(t); if (!sabotage) { f.m.files[0].sha256 = '0'.repeat(64); save(f); }
  rejected(f, /SHA-256 differs/);
});

caseTest('catalogue_agreement', 'catalogue and manifest cannot silently disagree on world scale', (t, sabotage) => {
  const f = fixture(t); if (!sabotage) { f.c.files[0].worldSizeM[0] *= 2; save(f); }
  rejected(f, /catalogue and manifest file metadata differ/);
});

caseTest('colour_space', 'normal and ORM data cannot be declared as sRGB', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) { const { record } = selected(f, (r) => r.role === 'normal'); update(f, record.path, { colourSpace: 'srgb' }); save(f); }
  rejected(f, /colour-space contract/);
});

caseTest('seam_x', 'changing one horizontal opposite edge fails after truthful re-pinning', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { record, image } = selected(f, (r) => r.kind === 'ground' && r.role === 'albedo');
    image.rgba[(13 * image.width) * 4] ^= 64; assert.ok(edgeDifferences(image, 'x').max > 0);
    repin(f, record.path, pngBytes(image));
  }
  rejected(f, /seam x opposite-edge mismatch/);
});

caseTest('seam_y', 'changing one vertical opposite edge fails after truthful re-pinning', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { record, image } = selected(f, (r) => r.kind === 'ground' && r.role === 'albedo');
    image.rgba[17 * 4 + 1] ^= 64; assert.ok(edgeDifferences(image, 'y').max > 0);
    repin(f, record.path, pngBytes(image));
  }
  rejected(f, /seam y opposite-edge mismatch/);
});

caseTest('normal_vectors', 'normal pixels must be unit forward-facing tangent vectors', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { record, image } = selected(f, (r) => r.role === 'normal');
    const p = (image.width * 100 + 100) * 4; image.rgba[p] = image.rgba[p + 1] = image.rgba[p + 2] = 0;
    repin(f, record.path, pngBytes(image));
  }
  rejected(f, /non-unit or negative-Z tangent normal/);
});

caseTest('orm_packing', 'nonmetallic terrain cannot hide metallic values in packed blue', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { record, image } = selected(f, (r) => r.role === 'orm'); image.rgba[(image.width * 100 + 100) * 4 + 2] = 255;
    repin(f, record.path, pngBytes(image));
  }
  rejected(f, /ORM packing/);
});

caseTest('decal_alpha', 'a hard opaque decal is rejected even with correct PNG hashes', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { record, image } = selected(f, (r) => r.kind === 'decal');
    for (let i = 3; i < image.rgba.length; i += 4) image.rgba[i] = 255;
    repin(f, record.path, pngBytes(image));
  }
  rejected(f, /alpha must contain transparent, soft and visible/);
});

caseTest('decal_metres', 'decal physical size is constrained to the requested one to four metres', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) { const { record } = selected(f, (r) => r.kind === 'decal'); update(f, record.path, { worldSizeM: [9, 9] }); save(f); }
  rejected(f, /decals must be.*1\.\.4 metres/);
});

caseTest('mask_channels', 'every packed mask channel has real full-range image content', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { record, image } = selected(f, (r) => r.kind === 'blend-mask');
    for (let i = 2; i < image.rgba.length; i += 4) image.rgba[i] = 128;
    repin(f, record.path, pngBytes(image));
  }
  rejected(f, /all four packed mask channels/);
});

caseTest('city_registration', 'day dusk and night retain the exact registered skyline silhouette', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { record, image } = selected(f, (r) => r.kind === 'city' && r.timeOfDay === 'dusk');
    const p = (image.width * 300 + 101) * 4 + 3; image.rgba[p] = image.rgba[p] === 255 ? 254 : image.rgba[p] + 1;
    repin(f, record.path, pngBytes(image));
  }
  rejected(f, /time variants must preserve silhouette registration/);
});

caseTest('city_arc', 'the panorama must describe the requested 200 degree physical arc', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) { const { record } = selected(f, (r) => r.kind === 'city'); update(f, record.path, { arcDegrees: 180 }); save(f); }
  rejected(f, /physical 200-degree arc/);
});

caseTest('haze_rows', 'a 256 by 4 gradient is four matching rows rather than an arbitrary small image', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { record, image } = selected(f, (r) => r.kind === 'haze'); image.rgba[1024 + 100] ^= 32;
    repin(f, record.path, pngBytes(image));
  }
  rejected(f, /haze ramp rows must match/);
});

caseTest('haze_hours', 'all five specified hours are present exactly once', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) { const { record } = selected(f, (r) => r.kind === 'haze'); update(f, record.path, { timeOfDay: 8 }); save(f); }
  rejected(f, /haze requires hours 7, 12, 17.2, 19.5 and 22/);
});

caseTest('vegetation_lod', 'vegetation cell UVs stay registered across all three LODs', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { record } = selected(f, (r) => r.kind === 'vegetation' && r.lod === 1);
    const cells = structuredClone(record.cells); cells[0].uv[0] += 0.01;
    update(f, record.path, { cells }); save(f);
  }
  rejected(f, /LOD cell UV registration drift/);
});

caseTest('vegetation_gutters', 'vegetation alpha never touches the outer atlas border', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const { record, image } = selected(f, (r) => r.kind === 'vegetation'); image.rgba[3] = 255;
    repin(f, record.path, pngBytes(image));
  }
  rejected(f, /transparent outer atlas gutters/);
});

caseTest('source_pairing', 'a delivery cannot be silently paired to two different masters', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const rows = f.m.files.filter((r) => r.format === 'ktx2'); update(f, rows[1].path, { derivedFrom: rows[0].derivedFrom }); save(f);
  }
  rejected(f, /missing or multiply paired PNG master|delivery\/master/);
  const stale = fixture(t);
  if (!sabotage) {
    const record = stale.m.files.find((r) => r.format === 'ktx2'); update(stale, record.path, { derivedSha256: '0'.repeat(64) }); save(stale);
  }
  rejected(stale, /source SHA-256 pin differs/);
});

caseTest('unlisted_payload', 'unlisted disk files are counted and rejected rather than hidden from budgets', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) writeFileSync(resolve(f.root, 'assets/textures/groundsky/unregistered.bin'), Buffer.alloc(100));
  rejected(f, /unregistered texture file/);
});

caseTest('file_budget', 'a file over four million bytes fails the fixed per-file budget', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) writeFileSync(resolve(f.root, 'assets/textures/groundsky/oversize.bin'), Buffer.alloc(MAX_FILE_BYTES + 1));
  rejected(f, /exceeds fixed 4000000 byte file limit/);
});

caseTest('fixed_budgets', 'manifest declarations cannot increase the texture or GPU acceptance caps', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) { f.m.budgets.maxGpuBytes = MAX_GPU_BYTES * 2; f.m.budgets.maxTextureBytes = MAX_TEXTURE_BYTES * 2; save(f); }
  rejected(f, /declared budgets differ from fixed acceptance limits/);
});

caseTest('offline_registry', 'the new library cannot enter a production boot asset registry', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) {
    const p = resolve(f.root, 'assets/models/manifest.json'), data = JSON.parse(readFileSync(p, 'utf8'));
    data.groundsky = MANIFEST; writeFileSync(p, JSON.stringify(data));
  }
  rejected(f, /must not enter active asset registries/);
});

caseTest('offline_js', 'production game JavaScript cannot import the dormant library', (t, sabotage) => {
  const f = fixture(t);
  if (!sabotage) writeFileSync(resolve(f.root, 'js/groundsky-mutation.js'), 'export const forbidden = "assets/textures/groundsky";\n');
  rejected(f, /game must not reference Ground\/Sky/);
});

caseTest('review_proof', 'review PNG proofs must decode successfully after their own hash check', (t, sabotage) => {
  const f = fixture(t); assert.ok(f.m.review?.files?.length, 'manifest needs actual review evidence');
  if (!sabotage) {
    const proof = f.m.review.files[0], path = resolve(f.root, proof.path), bytes = Buffer.concat([readFileSync(path), Buffer.from([0])]);
    writeFileSync(path, bytes); proof.bytes = bytes.length; proof.sha256 = sha256(bytes); save(f);
  }
  rejected(f, /review proof: .*trailing/);
});
