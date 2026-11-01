// Independent, dependency-free PNG decoder used by the beach acceptance gate.
// It does not import the image generator or its post-processing code.
import '../../tests/nice.mjs';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let j = 0; j < 8; j++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function pngCrc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const demand = (ok, message) => { if (!ok) throw new Error(message); };
const paeth = (a, b, c) => {
  const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
  return x <= y && x <= z ? a : y <= z ? b : c;
};

/** Decode every pixel, including all five PNG row filters and palette transparency. */
export function decodePng(bytesOrPath, label = 'PNG') {
  const bytes = typeof bytesOrPath === 'string' ? readFileSync(bytesOrPath) : bytesOrPath;
  demand(Buffer.isBuffer(bytes) && bytes.length >= 45 && bytes.subarray(0, 8).equals(SIGNATURE), `${label}: invalid PNG signature`);
  let header, palette, transparency, ended = false, dataEnded = false, sawData = false;
  const compressed = [];
  for (let p = 8; p < bytes.length;) {
    demand(p + 12 <= bytes.length, `${label}: truncated PNG chunk`);
    const n = bytes.readUInt32BE(p), type = bytes.toString('ascii', p + 4, p + 8), end = p + n + 8;
    demand(/^[A-Za-z]{4}$/.test(type) && end + 4 <= bytes.length, `${label}: truncated or invalid PNG ${type} chunk`);
    demand(pngCrc(bytes.subarray(p + 4, end)) === bytes.readUInt32BE(end), `${label}: PNG ${type} CRC mismatch`);
    const data = bytes.subarray(p + 8, end);
    if (!header) {
      demand(p === 8 && type === 'IHDR' && n === 13, `${label}: PNG must begin with IHDR`);
      header = data;
    } else if (type === 'IHDR') throw new Error(`${label}: duplicate PNG IHDR`);
    else if (type === 'PLTE') {
      demand(!palette && !sawData && n > 0 && n <= 768 && n % 3 === 0, `${label}: invalid PNG palette`);
      palette = data;
    } else if (type === 'tRNS') {
      demand(!transparency && !sawData, `${label}: invalid PNG transparency order`);
      transparency = data;
    } else if (type === 'IDAT') {
      demand(!dataEnded, `${label}: PNG IDAT chunks are not contiguous`);
      sawData = true; compressed.push(data);
    } else if (type === 'IEND') {
      demand(n === 0 && end + 4 === bytes.length, `${label}: invalid PNG IEND or trailing bytes`);
      ended = true;
    } else {
      demand(type[0] === type[0].toLowerCase(), `${label}: unknown critical PNG chunk ${type}`);
      demand(!['acTL', 'fcTL', 'fdAT'].includes(type), `${label}: animated PNG is not supported`);
    }
    if (sawData && type !== 'IDAT') dataEnded = true;
    p = end + 4;
  }
  demand(header && ended && compressed.length, `${label}: PNG is missing IHDR, IDAT or IEND`);
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4), bitDepth = header[8], colorType = header[9];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  demand(width > 0 && height > 0 && width <= 4096 && height <= 4096, `${label}: unsafe PNG dimensions`);
  demand(channels && [1, 2, 4, 8, 16].includes(bitDepth)
    && (colorType === 0 || colorType === 3 || bitDepth >= 8) && !(colorType === 3 && bitDepth === 16), `${label}: invalid PNG colour/depth`);
  demand(header[10] === 0 && header[11] === 0 && header[12] === 0, `${label}: nonstandard PNG compression/filtering or interlacing`);
  if (colorType === 3) demand(palette && palette.length / 3 <= 2 ** bitDepth, `${label}: indexed PNG needs a valid palette`);
  if (transparency) {
    demand(colorType === 0 && transparency.length === 2 || colorType === 2 && transparency.length === 6
      || colorType === 3 && transparency.length > 0 && transparency.length <= palette.length / 3, `${label}: invalid PNG tRNS`);
  }
  const rowBytes = Math.ceil(width * channels * bitDepth / 8), step = Math.max(1, Math.ceil(channels * bitDepth / 8));
  const expected = (rowBytes + 1) * height, packed = Buffer.concat(compressed);
  const inflated = inflateSync(packed, { maxOutputLength: expected + 1, info: true });
  const raw = inflated.buffer;
  demand(raw.length === expected, `${label}: PNG inflated byte count mismatch`);
  demand(inflated.engine.bytesWritten === packed.length, `${label}: trailing compressed PNG data`);
  const rows = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (rowBytes + 1)];
    demand(filter <= 4, `${label}: invalid PNG row filter`);
    for (let x = 0; x < rowBytes; x++) {
      const i = y * rowBytes + x, a = x >= step ? rows[i - step] : 0, b = y ? rows[i - rowBytes] : 0;
      const c = y && x >= step ? rows[i - rowBytes - step] : 0;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      rows[i] = (raw[y * (rowBytes + 1) + x + 1] + predictor) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4), scale = 255 / (2 ** bitDepth - 1);
  // Production maps are 8-bit. Avoid allocating an array per pixel in this common path.
  if (bitDepth === 8 && !transparency && (colorType === 2 || colorType === 6 || colorType === 0 || colorType === 4)) {
    for (let p = 0, i = 0; p < rows.length; p += channels, i += 4) {
      rgba[i] = rows[p];
      rgba[i + 1] = colorType === 0 || colorType === 4 ? rows[p] : rows[p + 1];
      rgba[i + 2] = colorType === 0 || colorType === 4 ? rows[p] : rows[p + 2];
      rgba[i + 3] = colorType === 6 ? rows[p + 3] : colorType === 4 ? rows[p + 1] : 255;
    }
    return { width, height, channels, bitDepth, colorType, hasAlpha: [4, 6].includes(colorType), rgba };
  }
  if (bitDepth === 8 && colorType === 3) {
    for (let p = 0, i = 0; p < rows.length; p++, i += 4) {
      const n = rows[p]; demand(n * 3 + 2 < palette.length, `${label}: PNG palette index outside PLTE`);
      rgba[i] = palette[n * 3]; rgba[i + 1] = palette[n * 3 + 1]; rgba[i + 2] = palette[n * 3 + 2];
      rgba[i + 3] = transparency && n < transparency.length ? transparency[n] : 255;
    }
    return { width, height, channels, bitDepth, colorType, hasAlpha: !!transparency, rgba };
  }
  const sample = (row, index) => bitDepth === 16 ? rows.readUInt16BE(row + index * 2)
    : bitDepth === 8 ? rows[row + index]
      : (rows[row + Math.floor(index * bitDepth / 8)] >>> (8 - bitDepth - index * bitDepth % 8)) & (2 ** bitDepth - 1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, row = y * rowBytes, j = x * channels;
    const values = Array.from({ length: channels }, (_, k) => sample(row, j + k));
    if (colorType === 3) {
      const n = values[0]; demand(n * 3 + 2 < palette.length, `${label}: PNG palette index outside PLTE`);
      rgba[i] = palette[n * 3]; rgba[i + 1] = palette[n * 3 + 1]; rgba[i + 2] = palette[n * 3 + 2];
      rgba[i + 3] = transparency && n < transparency.length ? transparency[n] : 255;
    } else if (colorType === 0 || colorType === 4) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = Math.round(values[0] * scale);
      rgba[i + 3] = colorType === 4 ? Math.round(values[1] * scale)
        : transparency && values[0] === transparency.readUInt16BE(0) ? 0 : 255;
    } else {
      rgba[i] = Math.round(values[0] * scale); rgba[i + 1] = Math.round(values[1] * scale); rgba[i + 2] = Math.round(values[2] * scale);
      rgba[i + 3] = colorType === 6 ? Math.round(values[3] * scale)
        : transparency && values.every((v, k) => v === transparency.readUInt16BE(k * 2)) ? 0 : 255;
    }
  }
  return { width, height, channels, bitDepth, colorType, hasAlpha: [4, 6].includes(colorType) || !!transparency, rgba };
}

/** Uncompressed RGBA8 + every generated mip level; conservative for palette/gray PNGs. */
export function gpuBytes(width, height) {
  let total = 0;
  for (;;) {
    total += width * height * 4;
    if (width === 1 && height === 1) return total;
    width = Math.max(1, Math.floor(width / 2)); height = Math.max(1, Math.floor(height / 2));
  }
}

export function edgeDifferences(png, axis) {
  demand(axis === 'x' || axis === 'y', 'edge axis must be x or y');
  const { width: w, height: h, rgba } = png, n = axis === 'x' ? h : w;
  let max = 0, sum = 0;
  for (let j = 0; j < n; j++) {
    const a = axis === 'x' ? j * w : j, b = axis === 'x' ? j * w + w - 1 : (h - 1) * w + j;
    for (let c = 0; c < 4; c++) { const d = Math.abs(rgba[a * 4 + c] - rgba[b * 4 + c]); max = Math.max(max, d); sum += d; }
  }
  return { max, mean: sum / (n * 4) };
}
