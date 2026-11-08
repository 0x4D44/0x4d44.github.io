// Source-data helpers for tools/build-terrain.ts: a small GeoTIFF reader, the OSTN15 datum shift, and
// the British National Grid projection. Pure functions over buffers (no network, no files), so they
// are testable and the build tool stays short.
//
// Why this exists: the Environment Agency DTM is in British National Grid (EPSG:27700, OSGB36 datum
// realised by OSTN15) while the model is projected from WGS84 lat/lon (core/geo.ts). Plain 7-parameter
// Helmert would be a few metres out, which matters when the model's rails sit in a cutting 25 m wide;
// the OSTN15 grid (Ordnance Survey, BSD 2-clause, as converted for PROJ) is good to centimetres.
import { inflateSync } from 'node:zlib';

// ---- GeoTIFF -------------------------------------------------------------------------------------

export interface GeoTiff {
  width: number;
  height: number;
  /** one Float32Array (width*height, row-major, top row first) per band */
  bands: Float32Array[];
  /** affine map pixel (col,row) -> map (x,y): x = a + b*col + c*row ; y = d + e*col + f*row (pixel corner) */
  affine: [a: number, b: number, c: number, d: number, e: number, f: number];
  nodata: number | null;
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };

/**
 * Reads a baseline or tiled GeoTIFF with 8/16/32-bit integer or 32/64-bit float samples, no compression or
 * Deflate, predictor 1, 2 or 3 (floating point), chunky or planar. That covers the EA WCS output and the
 * PROJ OSTN15 grid; anything else throws rather than guessing.
 */
export function readGeoTiff(buf: Uint8Array): GeoTiff {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const order = String.fromCharCode(buf[0] as number, buf[1] as number);
  if (order !== 'II' && order !== 'MM') throw new Error('not a TIFF');
  const le = order === 'II';
  const u16 = (o: number): number => dv.getUint16(o, le);
  const u32 = (o: number): number => dv.getUint32(o, le);
  if (u16(2) !== 42) throw new Error('BigTIFF is not supported');
  const tags = new Map<number, number[] | string>();
  const ifd = u32(4);
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    const tag = u16(e);
    const type = u16(e + 2);
    const n = u32(e + 4);
    const size = (TYPE_SIZE[type] ?? 1) * n;
    const off = size <= 4 ? e + 8 : u32(e + 8);
    if (type === 2) {
      tags.set(tag, new TextDecoder('latin1').decode(buf.subarray(off, off + n)).replace(/\0+$/, ''));
      continue;
    }
    const vals: number[] = [];
    for (let k = 0; k < n; k++) {
      if (type === 3) vals.push(u16(off + 2 * k));
      else if (type === 4) vals.push(u32(off + 4 * k));
      else if (type === 1 || type === 7) vals.push(buf[off + k] as number);
      else if (type === 12) vals.push(dv.getFloat64(off + 8 * k, le));
      else if (type === 11) vals.push(dv.getFloat32(off + 4 * k, le));
      else vals.push(Number.NaN);
    }
    tags.set(tag, vals);
  }
  const num = (tag: number, d?: number): number => {
    const v = tags.get(tag);
    if (Array.isArray(v) && v.length) return v[0] as number;
    if (d === undefined) throw new Error(`missing TIFF tag ${tag}`);
    return d;
  };
  const arr = (tag: number): number[] => {
    const v = tags.get(tag);
    if (!Array.isArray(v)) throw new Error(`missing TIFF tag ${tag}`);
    return v;
  };
  const width = num(256);
  const height = num(257);
  const spp = num(277, 1);
  const bps = num(258, 8);
  const compression = num(259, 1);
  const predictor = num(317, 1);
  const planar = num(284, 1);
  const sampleFormat = num(339, 1);
  if (compression !== 1 && compression !== 8 && compression !== 32946) throw new Error(`TIFF compression ${compression} is not supported`);
  const bytes = bps / 8;
  const tiled = tags.has(322);
  const tw = tiled ? num(322) : width;
  const th = tiled ? num(323) : num(278, height);
  const offsets = arr(tiled ? 324 : 273);
  const counts = arr(tiled ? 325 : 279);
  const tilesAcross = Math.ceil(width / tw);
  const tilesDown = Math.ceil(height / th);
  const perPlane = tilesAcross * tilesDown;
  const planes = planar === 2 ? spp : 1;
  const bandsPerTile = planar === 2 ? 1 : spp;
  const bands = Array.from({ length: spp }, () => new Float32Array(width * height));

  const sample = (view: DataView, o: number): number => {
    if (sampleFormat === 3) return bps === 32 ? view.getFloat32(o, le) : view.getFloat64(o, le);
    const signed = sampleFormat === 2;
    if (bps === 8) return signed ? view.getInt8(o) : view.getUint8(o);
    if (bps === 16) return signed ? view.getInt16(o, le) : view.getUint16(o, le);
    return signed ? view.getInt32(o, le) : view.getUint32(o, le);
  };

  for (let plane = 0; plane < planes; plane++) {
    for (let t = 0; t < perPlane; t++) {
      const idx = plane * perPlane + t;
      let data: Uint8Array = buf.subarray(offsets[idx] as number, (offsets[idx] as number) + (counts[idx] as number));
      if (compression !== 1) data = new Uint8Array(inflateSync(data));
      const rowSamples = tw * bandsPerTile;
      const rows = tiled ? th : Math.min(th, height - Math.floor(t / tilesAcross) * th);
      const rowBytes = rowSamples * bytes;
      const out = new Uint8Array(rows * rowBytes);
      out.set(data.subarray(0, Math.min(data.length, out.length)));
      if (predictor === 2) {
        // horizontal differencing, per sample
        if (bps !== 8) throw new Error('TIFF predictor 2 is only supported for 8-bit samples');
        for (let r = 0; r < rows; r++) for (let i = bandsPerTile; i < rowSamples; i++) out[r * rowBytes + i] = ((out[r * rowBytes + i] as number) + (out[r * rowBytes + i - bandsPerTile] as number)) & 255;
      } else if (predictor === 3) {
        // floating point: byte-differenced, then split into most-significant-first byte planes
        const tmp = new Uint8Array(rowBytes);
        for (let r = 0; r < rows; r++) {
          const base = r * rowBytes;
          for (let i = bandsPerTile; i < rowBytes; i++) out[base + i] = ((out[base + i] as number) + (out[base + i - bandsPerTile] as number)) & 255;
          tmp.set(out.subarray(base, base + rowBytes));
          for (let s = 0; s < rowSamples; s++) for (let b = 0; b < bytes; b++) out[base + s * bytes + (le ? bytes - 1 - b : b)] = tmp[b * rowSamples + s] as number;
        }
      } else if (predictor !== 1) throw new Error(`TIFF predictor ${predictor} is not supported`);
      const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
      const x0 = (t % tilesAcross) * tw;
      const y0 = Math.floor(t / tilesAcross) * th;
      for (let r = 0; r < rows && y0 + r < height; r++) {
        for (let c = 0; c < tw && x0 + c < width; c++) {
          for (let b = 0; b < bandsPerTile; b++) {
            const band = planar === 2 ? plane : b;
            (bands[band] as Float32Array)[(y0 + r) * width + x0 + c] = sample(view, (r * rowSamples + c * bandsPerTile + b) * bytes);
          }
        }
      }
    }
  }

  let affine: GeoTiff['affine'];
  const m = tags.get(34264);
  const scale = tags.get(33550);
  const tie = tags.get(33922);
  if (Array.isArray(m) && m.length >= 16) affine = [m[3] as number, m[0] as number, m[1] as number, m[7] as number, m[4] as number, m[5] as number];
  else if (Array.isArray(scale) && Array.isArray(tie)) {
    const [i, j, , X, Y] = tie as number[];
    affine = [(X as number) - (i as number) * (scale[0] as number), scale[0] as number, 0, (Y as number) + (j as number) * (scale[1] as number), 0, -(scale[1] as number)];
  } else throw new Error('TIFF has no georeferencing');
  const nd = tags.get(42113);
  const nodata = typeof nd === 'string' && nd.trim() !== '' ? Number.parseFloat(nd) : null;
  return { width, height, bands, affine, nodata };
}

// ---- datum shift and projection ------------------------------------------------------------------

const RAD = Math.PI / 180;

interface Ellipsoid {
  a: number;
  b: number;
}
const AIRY: Ellipsoid = { a: 6377563.396, b: 6356256.909 };

// OSGB36 National Grid: transverse Mercator, true origin 49N 2W, false origin (400000, -100000), scale 0.9996012717.
const F0 = 0.9996012717;
const LAT0 = 49 * RAD;
const LON0 = -2 * RAD;
const E0 = 400000;
const N0 = -100000;

function meridianArc(e: Ellipsoid, lat: number): number {
  const n = (e.a - e.b) / (e.a + e.b);
  const n2 = n * n;
  const n3 = n2 * n;
  const dl = lat - LAT0;
  const sl = lat + LAT0;
  return (
    e.b * F0 * ((1 + n + (5 / 4) * n2 + (5 / 4) * n3) * dl - (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(dl) * Math.cos(sl) + ((15 / 8) * (n2 + n3)) * Math.sin(2 * dl) * Math.cos(2 * sl) - (35 / 24) * n3 * Math.sin(3 * dl) * Math.cos(3 * sl))
  );
}

/** OSGB36 (Airy 1830) latitude and longitude in degrees to National Grid easting and northing. */
export function osgb36ToGrid(latDeg: number, lonDeg: number): [number, number] {
  const e = AIRY;
  const lat = latDeg * RAD;
  const lon = lonDeg * RAD;
  const e2 = 1 - (e.b * e.b) / (e.a * e.a);
  const sin = Math.sin(lat);
  const cos = Math.cos(lat);
  const tan = Math.tan(lat);
  const nu = (e.a * F0) / Math.sqrt(1 - e2 * sin * sin);
  const rho = (e.a * F0 * (1 - e2)) / Math.pow(1 - e2 * sin * sin, 1.5);
  const eta2 = nu / rho - 1;
  const M = meridianArc(e, lat);
  const I = M + N0;
  const II = (nu / 2) * sin * cos;
  const III = (nu / 24) * sin * cos ** 3 * (5 - tan * tan + 9 * eta2);
  const IIIA = (nu / 720) * sin * cos ** 5 * (61 - 58 * tan * tan + tan ** 4);
  const IV = nu * cos;
  const V = (nu / 6) * cos ** 3 * (nu / rho - tan * tan);
  const VI = (nu / 120) * cos ** 5 * (5 - 18 * tan * tan + tan ** 4 + 14 * eta2 - 58 * tan * tan * eta2);
  const dl = lon - LON0;
  return [E0 + IV * dl + V * dl ** 3 + VI * dl ** 5, I + II * dl ** 2 + III * dl ** 4 + IIIA * dl ** 6];
}

/** National Grid easting and northing to OSGB36 latitude and longitude in degrees (iterated meridian arc). */
export function gridToOsgb36(E: number, N: number): [number, number] {
  const e = AIRY;
  const e2 = 1 - (e.b * e.b) / (e.a * e.a);
  let lat = (N - N0) / (e.a * F0) + LAT0;
  let M = 0;
  do {
    lat = (N - N0 - M) / (e.a * F0) + lat;
    M = meridianArc(e, lat);
  } while (Math.abs(N - N0 - M) >= 0.00001);
  const sin = Math.sin(lat);
  const cos = Math.cos(lat);
  const tan = Math.tan(lat);
  const nu = (e.a * F0) / Math.sqrt(1 - e2 * sin * sin);
  const rho = (e.a * F0 * (1 - e2)) / Math.pow(1 - e2 * sin * sin, 1.5);
  const eta2 = nu / rho - 1;
  const VII = tan / (2 * rho * nu);
  const VIII = (tan / (24 * rho * nu ** 3)) * (5 + 3 * tan * tan + eta2 - 9 * tan * tan * eta2);
  const IX = (tan / (720 * rho * nu ** 5)) * (61 + 90 * tan * tan + 45 * tan ** 4);
  const X = 1 / (cos * nu);
  const XI = (1 / (cos * 6 * nu ** 3)) * (nu / rho + 2 * tan * tan);
  const XII = (1 / (cos * 120 * nu ** 5)) * (5 + 28 * tan * tan + 24 * tan ** 4);
  const XIIA = (1 / (cos * 5040 * nu ** 7)) * (61 + 662 * tan * tan + 1320 * tan ** 4 + 720 * tan ** 6);
  const dE = E - E0;
  const latOut = lat - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6;
  const lonOut = LON0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7;
  return [latOut / RAD, lonOut / RAD];
}

/** The OSTN15 NTv2 grid as shipped for PROJ: a 4-band float TIFF of arc-second shifts OSGB36 -> ETRS89. */
export interface Ostn15 {
  grid: GeoTiff;
}

/** Bilinear sample of a band of the shift grid at a geographic point, or null outside the grid. */
function shiftAt(g: GeoTiff, band: number, latDeg: number, lonDeg: number): number | null {
  const col = (lonDeg - g.affine[0]) / g.affine[1];
  const row = (latDeg - g.affine[3]) / g.affine[5];
  const c = Math.floor(col);
  const r = Math.floor(row);
  if (c < 0 || r < 0 || c + 1 >= g.width || r + 1 >= g.height) return null;
  const fc = col - c;
  const fr = row - r;
  const b = g.bands[band] as Float32Array;
  const at = (rr: number, cc: number): number => b[rr * g.width + cc] as number;
  return at(r, c) * (1 - fc) * (1 - fr) + at(r, c + 1) * fc * (1 - fr) + at(r + 1, c) * (1 - fc) * fr + at(r + 1, c + 1) * fc * fr;
}

/**
 * ETRS89 (WGS84 to a metre or so) latitude and longitude in degrees to National Grid easting and
 * northing, by OSTN15: the shift grid is defined from OSGB36, so the OSGB36 position is found by iteration.
 * `lonSign` is +1 when the grid's longitude shifts are positive east (the PROJ GeoTIFF convention).
 */
export function etrs89ToGrid(ostn: Ostn15, latDeg: number, lonDeg: number, lonSign: 1 | -1 = 1): [number, number] {
  let lat = latDeg;
  let lon = lonDeg;
  for (let i = 0; i < 6; i++) {
    const dLat = shiftAt(ostn.grid, 0, lat, lon);
    const dLon = shiftAt(ostn.grid, 1, lat, lon);
    if (dLat === null || dLon === null) throw new Error(`point ${latDeg}, ${lonDeg} is outside the OSTN15 grid`);
    lat = latDeg - dLat / 3600;
    lon = lonDeg - (lonSign * dLon) / 3600;
  }
  return osgb36ToGrid(lat, lon);
}

/** National Grid to ETRS89 latitude and longitude in degrees (the inverse of etrs89ToGrid). */
export function gridToEtrs89(ostn: Ostn15, E: number, N: number, lonSign: 1 | -1 = 1): [number, number] {
  const [lat, lon] = gridToOsgb36(E, N);
  const dLat = shiftAt(ostn.grid, 0, lat, lon);
  const dLon = shiftAt(ostn.grid, 1, lat, lon);
  if (dLat === null || dLon === null) throw new Error(`grid point ${E}, ${N} is outside the OSTN15 grid`);
  return [lat + dLat / 3600, lon + (lonSign * dLon) / 3600];
}
