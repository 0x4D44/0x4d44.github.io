// Dependency-free PNG pixel decoder for the independent Ground/Sky acceptance gate.
// This file does not import the procedural generators, a browser, or an image library.
import '../tests/nice.mjs';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let j = 0; j < 8; j++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function pngCrc(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const paeth = (left, up, corner) => {
  const prediction = left + up - corner;
  const a = Math.abs(prediction - left), b = Math.abs(prediction - up), c = Math.abs(prediction - corner);
  return a <= b && a <= c ? left : b <= c ? up : corner;
};

/** Strictly reconstruct non-interlaced PNG pixels, including palette and tRNS alpha. */
export function decodePng(input, label = 'PNG') {
  const bytes = typeof input === 'string' ? readFileSync(input) : input;
  requireThat(Buffer.isBuffer(bytes) && bytes.length >= 45 && bytes.subarray(0, 8).equals(SIGNATURE), `${label}: invalid PNG signature`);
  let header, palette, transparent, finished = false, sawData = false, dataClosed = false;
  const idat = [];
  for (let p = 8; p < bytes.length;) {
    requireThat(p + 12 <= bytes.length, `${label}: truncated PNG chunk`);
    const size = bytes.readUInt32BE(p), type = bytes.toString('ascii', p + 4, p + 8), end = p + size + 8;
    requireThat(/^[A-Za-z]{4}$/.test(type) && type[2] === type[2].toUpperCase() && end + 4 <= bytes.length,
      `${label}: truncated or invalid PNG chunk ${type}`);
    requireThat(pngCrc(bytes.subarray(p + 4, end)) === bytes.readUInt32BE(end), `${label}: PNG ${type} CRC mismatch`);
    const data = bytes.subarray(p + 8, end);
    if (!header) {
      requireThat(type === 'IHDR' && p === 8 && size === 13, `${label}: PNG must start with one IHDR`);
      header = data;
    } else if (type === 'IHDR') throw new Error(`${label}: duplicate PNG IHDR`);
    else if (type === 'PLTE') {
      requireThat(!palette && !sawData && size >= 3 && size <= 768 && size % 3 === 0, `${label}: invalid PNG palette/order`);
      palette = data;
    } else if (type === 'tRNS') {
      requireThat(!transparent && !sawData && size > 0 && (header[9] !== 3 || palette), `${label}: invalid PNG transparency/order`);
      transparent = data;
    } else if (type === 'IDAT') {
      requireThat(!dataClosed, `${label}: non-contiguous PNG IDAT`);
      sawData = true; idat.push(data);
    } else if (type === 'IEND') {
      requireThat(size === 0 && end + 4 === bytes.length, `${label}: invalid PNG IEND or trailing bytes`);
      finished = true;
    } else {
      requireThat(type[0] === type[0].toLowerCase(), `${label}: unknown critical PNG chunk ${type}`);
      requireThat(!['acTL', 'fcTL', 'fdAT'].includes(type), `${label}: animated PNG is outside the texture contract`);
    }
    if (sawData && type !== 'IDAT') dataClosed = true;
    p = end + 4;
  }
  requireThat(header && finished && sawData, `${label}: PNG missing IHDR, image data or IEND`);
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4), bitDepth = header[8], colorType = header[9];
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[colorType];
  const depths = ({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] })[colorType];
  requireThat(Number.isInteger(width) && width > 0 && width <= 8192 && height > 0 && height <= 8192
    && width * height <= 33_554_432, `${label}: unsupported PNG dimensions`);
  requireThat(depths?.includes(bitDepth) && header[10] === 0 && header[11] === 0 && header[12] === 0,
    `${label}: unsupported PNG depth, colour type, compression, filter or interlace`);
  if (colorType === 3) requireThat(palette && palette.length / 3 <= 2 ** bitDepth, `${label}: PNG indexed image needs a valid palette`);
  if (transparent) requireThat(colorType === 3 ? palette && transparent.length <= palette.length / 3
    : colorType === 0 ? transparent.length === 2 : colorType === 2 && transparent.length === 6,
  `${label}: invalid PNG tRNS length/colour type`);
  const rowBytes = Math.ceil(width * channels * bitDepth / 8), bpp = Math.max(1, Math.ceil(channels * bitDepth / 8));
  const compressed = Buffer.concat(idat), expected = (rowBytes + 1) * height;
  const inflated = inflateSync(compressed, { maxOutputLength: expected + 1, info: true });
  const raw = inflated.buffer;
  requireThat(raw.length === expected && inflated.engine.bytesWritten === compressed.length, `${label}: PNG inflated size or zlib trailing bytes differ`);
  const rows = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const start = y * (rowBytes + 1), filter = raw[start];
    requireThat(filter <= 4, `${label}: illegal PNG row filter`);
    for (let x = 0; x < rowBytes; x++) {
      const i = y * rowBytes + x, left = x >= bpp ? rows[i - bpp] : 0, up = y > 0 ? rows[i - rowBytes] : 0;
      const corner = y > 0 && x >= bpp ? rows[i - rowBytes - bpp] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3
        ? Math.floor((left + up) / 2) : paeth(left, up, corner);
      rows[i] = (raw[start + 1 + x] + prediction) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4), scale = 255 / (2 ** bitDepth - 1);
  const sample = (row, n) => bitDepth === 16 ? rows.readUInt16BE(row + n * 2) : bitDepth === 8 ? rows[row + n]
    : (rows[row + Math.floor(n * bitDepth / 8)] >>> (8 - bitDepth - n * bitDepth % 8)) & ((1 << bitDepth) - 1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4, row = y * rowBytes, n = x * channels;
    if (colorType === 3) {
      const index = sample(row, n);
      requireThat(index * 3 + 2 < palette.length, `${label}: PNG index outside palette`);
      palette.copy(rgba, offset, index * 3, index * 3 + 3);
      rgba[offset + 3] = transparent && index < transparent.length ? transparent[index] : 255;
    } else if (colorType === 0 || colorType === 4) {
      const v = sample(row, n), g = Math.round(v * scale);
      rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = g;
      rgba[offset + 3] = colorType === 4 ? Math.round(sample(row, n + 1) * scale) : transparent && v === transparent.readUInt16BE(0) ? 0 : 255;
    } else {
      const r = sample(row, n), g = sample(row, n + 1), b = sample(row, n + 2);
      rgba[offset] = Math.round(r * scale); rgba[offset + 1] = Math.round(g * scale); rgba[offset + 2] = Math.round(b * scale);
      rgba[offset + 3] = colorType === 6 ? Math.round(sample(row, n + 3) * scale) : transparent && r === transparent.readUInt16BE(0)
        && g === transparent.readUInt16BE(2) && b === transparent.readUInt16BE(4) ? 0 : 255;
    }
  }
  return { width, height, channels, bitDepth, colorType, hasAlpha: colorType === 4 || colorType === 6 || !!transparent, rgba };
}

export function edgeDifferences({ width, height, rgba }, axis) {
  requireThat(axis === 'x' || axis === 'y', 'edge axis must be x or y');
  const count = axis === 'x' ? height : width;
  let max = 0, sum = 0;
  for (let p = 0; p < count; p++) {
    const first = axis === 'x' ? p * width : p, last = axis === 'x' ? p * width + width - 1 : (height - 1) * width + p;
    for (let c = 0; c < 4; c++) {
      const difference = Math.abs(rgba[first * 4 + c] - rgba[last * 4 + c]);
      max = Math.max(max, difference); sum += difference;
    }
  }
  return { max, mean: sum / (count * 4) };
}

/** Conservative authoring fallback; paletted PNGs still expand to RGBA on ordinary texture loaders. */
export function rgbaMipBytes(width, height) {
  let total = 0;
  for (;;) {
    total += width * height * 4;
    if (width === 1 && height === 1) return total;
    width = Math.max(1, Math.floor(width / 2)); height = Math.max(1, Math.floor(height / 2));
  }
}
