// Scottish Phase V TIFFs use tiled LZW float32 samples. Fetch only the tiles sampled by our grid.
// All input is checked; missing/nodata values remain missing rather than inventing relief.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { GeoTiff } from './terrain-source.ts';

/** TIFF 6.0 MSB-first LZW with early code-width change. */
export function decodeLzw(bytes: Uint8Array): Uint8Array {
  let bit = 0, width = 9, next = 258;
  let table: Uint8Array[] = [];
  let previous: Uint8Array | undefined;
  const output: number[] = [];
  const reset = () => { table = Array.from({ length: 256 }, (_, i) => Uint8Array.of(i)); width = 9; next = 258; previous = undefined; };
  reset();
  while (bit + width <= bytes.length * 8) {
    let code = 0;
    for (let i = 0; i < width; i++, bit++) code = (code << 1) | ((bytes[bit >> 3]! >> (7 - (bit & 7))) & 1);
    if (code === 256) { reset(); continue; }
    if (code === 257) return Uint8Array.from(output);
    let entry = table[code];
    if (!entry && code === next && previous) entry = Uint8Array.from([...previous, previous[0]!]);
    if (!entry) throw new Error(`invalid LZW code ${code}`);
    for (const v of entry) output.push(v);
    if (previous && next < 4096) {
      const joined = new Uint8Array(previous.length + 1);
      joined.set(previous); joined[previous.length] = entry[0]!;
      table[next++] = joined;
      if (next === (1 << width) - 1 && width < 12) width++;
    }
    previous = entry;
  }
  throw new Error('LZW stream has no end code');
}

/** Nearest native pixel sample. affine maps the upper-left pixel corner. */
export function sampleRaster(g: GeoTiff, e: number, n: number): number | null {
  const col = Math.floor((e - g.affine[0]) / g.affine[1]);
  const row = Math.floor((n - g.affine[3]) / g.affine[5]);
  if (col < 0 || row < 0 || col >= g.width || row >= g.height) return null;
  const v = g.bands[0]![row * g.width + col]!;
  return !Number.isFinite(v) || v === g.nodata ? null : v;
}

export const SCOTTISH_DTM_BASE = 'https://srsp-open-data.s3.eu-west-2.amazonaws.com/lidar/phase-5/dtm/27700/gridded/';
/** Phase I (2011-12), 1 m DTM in 10 km tiles: the phase that covers Perth (NO12). Same TIFF layout as Phase V. */
export const SCOTTISH_DTM_PHASE1_BASE = 'https://srsp-open-data.s3.eu-west-2.amazonaws.com/lidar/phase-1/dtm/27700/gridded/';

async function cachedRange(url: string, first: number, count: number, cache: string): Promise<Uint8Array> {
  const dest = path.join(cache, `${path.basename(new URL(url).pathname)}-${first}-${count}.bin`);
  try { const bytes = await readFile(dest); if (bytes.length === count) return bytes; } catch { /* fetch absent cache */ }
  const response = await fetch(`${url}?range=${first}-${count}`, { headers: { Range: `bytes=${first}-${first + count - 1}` }, signal: AbortSignal.timeout(30000) });
  if (response.status !== 206 || !response.headers.get('content-range')?.startsWith(`bytes ${first}-`)) throw new Error(`range request failed: ${response.status} ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== count) throw new Error('short HTTP range');
  await mkdir(cache, { recursive: true }); await writeFile(dest, bytes);
  return bytes;
}

/** Supports only the verified Phase V float32, predictor 1, little-endian LZW TIFF layout. */
export async function openScottishDtm(name: string, cache: string, base = SCOTTISH_DTM_BASE): Promise<{ at(e: number, n: number): Promise<number | null>; url: string; resolution: number }> {
  const url = base + name;
  const bytes = await cachedRange(url, 0, 65536, cache);
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (d.getUint16(0, true) !== 0x4949 || d.getUint16(2, true) !== 42) throw new Error('expected little-endian TIFF');
  const tags = new Map<number, number[]>();
  const start = d.getUint32(4, true), count = d.getUint16(start, true);
  const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 };
  for (let i = 0; i < count; i++) {
    const p = start + 2 + i * 12, tag = d.getUint16(p, true), type = d.getUint16(p + 2, true), n = d.getUint32(p + 4, true);
    const size = sizes[type]; if (!size) continue;
    const offset = size * n <= 4 ? p + 8 : d.getUint32(p + 8, true);
    if (offset + size * n > bytes.length) throw new Error('TIFF metadata outside header range');
    const values = Array.from({ length: n }, (_, k) => type === 12 ? d.getFloat64(offset + k * size, true) : type === 4 ? d.getUint32(offset + k * size, true) : type === 3 ? d.getUint16(offset + k * size, true) : d.getUint8(offset + k));
    tags.set(tag, values);
  }
  const one = (tag: number) => tags.get(tag)?.[0];
  if (one(258) !== 32 || one(259) !== 5 || one(317) !== 1 || one(339) !== 3 || one(277) !== 1) throw new Error('unsupported Scottish TIFF layout');
  const width = one(256)!, height = one(257)!, tw = one(322)!, th = one(323)!;
  const scale = tags.get(33550)!, tie = tags.get(33922)!;
  const east = tie[3]! - tie[0]! * scale[0]!, north = tie[4]! + tie[1]! * scale[1]!;
  const offsets = tags.get(324)!, counts = tags.get(325)!;
  const nodata = Number(new TextDecoder().decode(Uint8Array.from(tags.get(42113) ?? [])).replace(/\0/g, ''));
  const tiles = new Map<number, Promise<Float32Array>>();
  return { url, resolution: scale[0]!, async at(e, n) {
    const col = Math.floor((e - east) / scale[0]!), row = Math.floor((north - n) / scale[1]!);
    if (col < 0 || row < 0 || col >= width || row >= height) return null;
    const index = Math.floor(row / th) * Math.ceil(width / tw) + Math.floor(col / tw);
    if (!tiles.has(index)) tiles.set(index, (async () => {
      const packed = await cachedRange(url, offsets[index]!, counts[index]!, cache);
      const unpacked = decodeLzw(packed);
      if (unpacked.length !== tw * th * 4) throw new Error('unexpected decoded tile length');
      const view = new DataView(unpacked.buffer, unpacked.byteOffset, unpacked.byteLength);
      return Float32Array.from({ length: tw * th }, (_, i) => view.getFloat32(i * 4, true));
    })());
    const v = (await tiles.get(index)!)[(row % th) * tw + col % tw]!;
    return !Number.isFinite(v) || v === nodata ? null : v;
  } };
}
