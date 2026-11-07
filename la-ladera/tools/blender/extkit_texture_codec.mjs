// Independent Node22 reader for the extkit KTX2 subset. No producer metadata
// or Python/Pillow code is used to measure/decode the shipped texture bytes.
import { inflateSync } from 'node:zlib';

const MAGIC = Buffer.from('ab4b5458203230bb0d0a1a0a', 'hex');
const need = (ok, message) => { if (!ok) throw new Error(`KTX2 ${message}`); };
const integer = (x) => Number.isSafeInteger(x) && x >= 0;

export function inspectKtx2(input) {
  const b = Buffer.from(input);
  need(b.length >= 104 && b.subarray(0, 12).equals(MAGIC), 'invalid or truncated header');
  const get = (at) => b.readUInt32LE(at);
  const big = (at) => {
    const x = Number(b.readBigUInt64LE(at));
    need(integer(x), '64-bit offset cannot be represented exactly'); return x;
  };
  const vkFormat = get(12), typeSize = get(16), width = get(20), height = get(24);
  const levelCount = get(40), supercompressionScheme = get(44), bc5 = vkFormat === 141;
  need([131, 132, 141].includes(vkFormat), 'unsupported vkFormat');
  need(typeSize === 1 && get(28) === 0 && get(32) === 0 && get(36) === 1,
    'requires one two-dimensional non-array face');
  need(width > 0 && width <= 2048 && width === height && (width & (width - 1)) === 0,
    'requires bounded square power-of-two dimensions');
  need(levelCount === Math.log2(width) + 1 && supercompressionScheme === 3,
    'requires full mip chain and ZLIB scheme3');
  need(b.length >= 80 + levelCount * 24, 'truncated mip index');
  const dfdAt = get(48), dfdLength = get(52), kvdAt = get(56), kvdLength = get(60);
  need(big(64) === 0 && big(72) === 0, 'unexpected supercompression global data');
  const sampleCount = bc5 ? 2 : 1, expectedDfd = 28 + 16 * sampleCount;
  need(dfdAt === 80 + levelCount * 24 && dfdLength === expectedDfd &&
    kvdAt === dfdAt + dfdLength && kvdAt + kvdLength <= b.length, 'DFD/index layout invalid');
  const dfd = b.subarray(dfdAt, dfdAt + dfdLength);
  need(dfd.readUInt32LE(0) === dfdLength && dfd.readUInt32LE(4) === 0 &&
    dfd.readUInt16LE(8) === 2 && dfd.readUInt16LE(10) === dfdLength - 4, 'DFD descriptor invalid');
  need(dfd[12] === (bc5 ? 132 : 128) && dfd[13] === 1 &&
    dfd[14] === (vkFormat === 132 ? 2 : 1) && dfd[15] === 0, 'DFD colour model or transfer invalid');
  need(dfd.subarray(16, 20).equals(Buffer.from([3, 3, 0, 0])) &&
    dfd[20] === (bc5 ? 16 : 8) && dfd.subarray(21, 28).every((x) => x === 0),
    'DFD texel block dimensions/bytes invalid');
  for (let i = 0; i < sampleCount; i++) {
    const at = 28 + i * 16;
    need(dfd.readUInt16LE(at) === i * 64 && dfd[at + 2] === 63 && dfd[at + 3] === i &&
      dfd.subarray(at + 4, at + 12).every((x) => x === 0) && dfd.readUInt32LE(at + 12) === 0xffffffff,
      'DFD sample/channel invalid');
  }
  const metadata = {};
  for (let at = kvdAt; at < kvdAt + kvdLength;) {
    need(at + 4 <= kvdAt + kvdLength, 'truncated key/value length');
    const count = get(at); at += 4;
    need(count > 2 && at + count <= kvdAt + kvdLength, 'key/value range invalid');
    const raw = b.subarray(at, at + count), split = raw.indexOf(0);
    need(split > 0 && split < count - 1 && raw[count - 1] === 0, 'key/value termination invalid');
    const key = raw.subarray(0, split).toString('utf8'), value = raw.subarray(split + 1, count - 1).toString('utf8');
    need(!(key in metadata), 'duplicate metadata key'); metadata[key] = value;
    at += count;
    while (at % 4) { need(at < kvdAt + kvdLength && b[at] === 0, 'nonzero metadata padding'); at++; }
  }
  need(metadata.KTXorientation === 'rd', 'texture orientation must be rd');
  need(metadata['extkit.channel'] === (bc5 ? 'normal' : vkFormat === 132 ? 'albedo' : 'orm'),
    'channel metadata disagrees with format');
  if (bc5) need(metadata['extkit.normalEncoding'] === 'BC5_RG_positiveZ', 'normal encoding invalid');
  const levels = [], intervals = []; let gpuBytes = 0;
  for (let i = 0; i < levelCount; i++) {
    const at = 80 + i * 24, byteOffset = big(at), byteLength = big(at + 8), unpacked = big(at + 16);
    const w = Math.max(1, width >> i), h = Math.max(1, height >> i);
    const expected = Math.ceil(w / 4) * Math.ceil(h / 4) * (bc5 ? 16 : 8);
    need(byteOffset >= kvdAt + kvdLength && byteLength > 0 && byteOffset + byteLength <= b.length &&
      unpacked === expected, 'mip level range or block byte length invalid');
    let bytes;
    try {
      const inflated = inflateSync(b.subarray(byteOffset, byteOffset + byteLength), { maxOutputLength: expected, info: true });
      need(inflated.engine.bytesWritten === byteLength, 'trailing bytes within compressed mip');
      bytes = inflated.buffer;
    }
    catch (e) { throw new Error(`KTX2 invalid ZLIB mip: ${e.message}`); }
    need(bytes.length === expected, 'inflated mip does not match block byte length');
    intervals.push([byteOffset, byteOffset + byteLength]); gpuBytes += bytes.length;
    levels.push({ width: w, height: h, bytes, byteOffset, byteLength, uncompressedByteLength: bytes.length });
  }
  let end = kvdAt + kvdLength;
  for (let i = intervals.length - 1; i >= 0; i--) {
    need(intervals[i][0] === end, 'mips must be contiguous smallest-first without overlap'); end = intervals[i][1];
  }
  need(end === b.length, 'trailing or omitted payload');
  return { width, height, vkFormat, levelCount, supercompressionScheme, gpuBytes, levels,
    colorSpace: vkFormat === 132 ? 'srgb' : 'linear', dfd: { colorModel: dfd[12], bytesPerBlock: dfd[20] }, metadata };
}

const rgb565 = (v) => {
  const r = (v >>> 11) & 31, g = (v >>> 5) & 63, b = v & 31;
  return [(r << 3) | (r >>> 2), (g << 2) | (g >>> 4), (b << 3) | (b >>> 2)];
};
function bc4(block, at) {
  const a = block[at], b = block[at + 1], palette = [a, b];
  if (a > b) for (let i = 1; i <= 6; i++) palette.push(Math.floor(((7 - i) * a + i * b) / 7));
  else {
    for (let i = 1; i <= 4; i++) palette.push(Math.floor(((5 - i) * a + i * b) / 5));
    palette.push(0, 255);
  }
  // Two 24bit words avoid loss of selector bits in Javascript bitwise math.
  const lo = block.readUIntLE(at + 2, 3), hi = block.readUIntLE(at + 5, 3), result = [];
  for (let i = 0; i < 16; i++) result.push(palette[((i < 8 ? lo : hi) >>> ((i % 8) * 3)) & 7]);
  return result;
}

export function decodeKtx2(input, level = 0) {
  const info = input?.levels ? input : inspectKtx2(input);
  need(Number.isInteger(level) && level >= 0 && level < info.levels.length, 'mip selection invalid');
  const { width, height, bytes } = info.levels[level], bc5 = info.vkFormat === 141;
  const pixels = new Uint8Array(width * height * 3), stride = bc5 ? 16 : 8;
  const nx = Math.ceil(width / 4), ny = Math.ceil(height / 4);
  for (let by = 0; by < ny; by++) for (let bx = 0; bx < nx; bx++) {
    const at = (by * nx + bx) * stride, block = bytes.subarray(at, at + stride);
    let red, green, palette, selectors;
    if (bc5) { red = bc4(block, 0); green = bc4(block, 8); }
    else {
      const c0 = block.readUInt16LE(0), c1 = block.readUInt16LE(2), a = rgb565(c0), b = rgb565(c1);
      palette = [a, b];
      if (c0 > c1) palette.push(a.map((v, k) => Math.floor((2 * v + b[k]) / 3)),
        a.map((v, k) => Math.floor((v + 2 * b[k]) / 3)));
      else palette.push(a.map((v, k) => Math.floor((v + b[k]) / 2)), [0, 0, 0]);
      selectors = block.readUInt32LE(4);
    }
    for (let y = 0; y < 4 && by * 4 + y < height; y++) for (let x = 0; x < 4 && bx * 4 + x < width; x++) {
      const i = y * 4 + x, to = ((by * 4 + y) * width + bx * 4 + x) * 3;
      if (bc5) {
        const nx = red[i] / 127.5 - 1, ny = green[i] / 127.5 - 1;
        pixels[to] = red[i]; pixels[to + 1] = green[i];
        pixels[to + 2] = Math.round((Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * .5 + .5) * 255);
      } else pixels.set(palette[(selectors >>> (i * 2)) & 3], to);
    }
  }
  return { width, height, pixels };
}

export function seamMetrics({ width, height, pixels }) {
  let horizontalMax = 0, verticalMax = 0, hs = 0, vs = 0;
  for (let y = 0; y < height; y++) for (let c = 0; c < 3; c++) {
    const d = Math.abs(pixels[(y * width) * 3 + c] - pixels[(y * width + width - 1) * 3 + c]);
    horizontalMax = Math.max(horizontalMax, d); hs += d;
  }
  for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
    const d = Math.abs(pixels[x * 3 + c] - pixels[((height - 1) * width + x) * 3 + c]);
    verticalMax = Math.max(verticalMax, d); vs += d;
  }
  return { horizontalMax, verticalMax, horizontalMean: hs / (height * 3), verticalMean: vs / (width * 3) };
}
