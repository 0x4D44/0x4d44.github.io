import { EUSTON_REFERENCE, opticIntensity, sceneRadiance, SPECTRA } from './light-photometry.ts';
import type { LightSource } from './light-sources.ts';

export const LIGHT_GRID_DESKTOP = { cellM: 8, cap: 16 };
export const LIGHT_GRID_MOBILE = { cellM: 16, cap: 24 };
export interface LightGridSpec { cellM: number; cap: number }
export interface LightField {
  spec: LightGridSpec;
  sources: readonly LightSource[];
  origin: readonly [number, number];
  columns: number;
  rows: number;
  data: Float32Array<ArrayBuffer>;
  dataWidth: number;
  dataHeight: number;
  grid: Uint8Array<ArrayBuffer>;
  gridWidth: number;
  gridHeight: number;
  maxCandidates: number;
  overflowingCells: number;
}
export const LIGHT_FIELD_ROAD = 1;
export const LIGHT_FIELD_EUSTON = 2;
export const LIGHT_FIELD_STRIP = 3;
export const LIGHT_FIELD_DOWNLIGHT = 4;
export const LIGHT_FIELD_TEXELS_PER_SOURCE = 4;
export const LIGHT_FIELD_FACADE_REACH = 20;
export const EUSTON_FACADE_REACH = 44;
export const EUSTON_ROAD_REACH = 38;
export const EUSTON_ROAD_SPECTRUM = [1, .53, .06] as const;

const TEXTURE_EDGE = 2048; // WebGL2 minimum.
const ROW_TEXELS = 1024;
const radians = Math.PI / 180;

type DirectLight = LightSource & { optic: Exclude<LightSource['optic'], { kind: 'panel' }> };

function packLight(source: DirectLight, data: Float32Array, index: number): { range: number; strength: number } {
  const { optic, pos, yaw, halfSpace } = source;
  const height = Math.max(1, pos[1] - source.footY);
  let kind: number, range: number, opticParams: readonly number[];
  let spectrum = SPECTRA[source.spectrum].linearRgb;
  const peak = sceneRadiance(opticIntensity(source.lumens, optic, 1), 1);
  let strength = peak;
  if (optic.kind === 'road') {
    const euston = source.tags.includes('euston-road') && source.spectrum === 'hps';
    kind = euston ? LIGHT_FIELD_EUSTON : LIGHT_FIELD_ROAD;
    if (euston) {
      spectrum = EUSTON_ROAD_SPECTRUM;
      // S1 matched the pilot on linear luma. Recover the red-channel scale
      // for the pilot's calibrated receiver spectrum.
      strength /= .2126 * spectrum[0] + .7152 * spectrum[1] + .0722 * spectrum[2];
    }
    range = EUSTON_ROAD_REACH * Math.max(optic.throwM / EUSTON_REFERENCE.optic.throwM, optic.spreadM / EUSTON_REFERENCE.optic.spreadM);
    opticParams = [yaw, range, height / 10.15 * EUSTON_REFERENCE.optic.spreadM / optic.spreadM,
      height / 10.15 * EUSTON_REFERENCE.optic.throwM / optic.throwM];
  } else if (optic.kind === 'strip' && source.tags.includes('mast')) {
    // The vertical LED strip describes the visible fitting. Its small
    // downward spill is a broad, soft pool centred on the column. The
    // spill share puts 0.40-albedo paving near 0.09 linear RGB at the foot.
    kind = LIGHT_FIELD_DOWNLIGHT;
    range = 12;
    strength *= .086;
    // Balance the cool night fill on the paving with a slightly warm source.
    spectrum = [1, .98, .90];
    opticParams = [0, range, Math.cos(54 * radians), Math.cos(12 * radians)];
  } else if (optic.kind === 'strip') {
    kind = LIGHT_FIELD_STRIP;
    range = Math.max(optic.throwM, optic.spreadM);
    opticParams = [yaw, range, optic.spreadM, optic.throwM];
  } else {
    kind = LIGHT_FIELD_DOWNLIGHT;
    range = optic.radiusM;
    opticParams = [0, range, Math.cos(optic.halfAngleDeg * radians),
      Math.cos(Math.max(0, optic.halfAngleDeg - optic.softDeg) * radians)];
  }
  data.set([
    ...pos, strength,
    ...spectrum, source.cover === 'under-roof' ? -kind : kind,
    ...opticParams,
    ...(halfSpace ? [...halfSpace.normal, halfSpace.offset] : [0, 0, 0, 0]),
  ], index * LIGHT_FIELD_TEXELS_PER_SOURCE * 4);
  const facadeReach = kind === LIGHT_FIELD_EUSTON ? EUSTON_FACADE_REACH : LIGHT_FIELD_FACADE_REACH;
  return { range: kind <= LIGHT_FIELD_EUSTON ? Math.max(range, facadeReach) : range, strength };
}

interface Candidate { index: number; rank: number }

/**
 * Each cell header occupies one RGBA8 texel (a little-endian uint32 slot offset).
 * The list starts after the headers. A slot is a little-endian uint16, two per
 * texel, with the count at the offset followed by source indices. Empty cells
 * share the zero count in the first list slot. Lamp records occupy four RGBA32F
 * texels with one record per index, ordered by stable source ID.
 */
export function buildLightField(input: readonly LightSource[], spec: LightGridSpec): LightField {
  const { cellM, cap } = spec;
  if (!Number.isFinite(cellM) || cellM <= 0 || !Number.isInteger(cap) || cap < 1 || cap > 65535) {
    throw new RangeError('Invalid light field cell size or cap');
  }
  const sources = input.filter((s): s is DirectLight => s.optic.kind !== 'panel' && s.lumens > 0)
    .sort((a, b) => a.id < b.id ? -1 : Number(a.id > b.id));
  if (sources.length > 65536) throw new RangeError('Light field source IDs exceed 16 bits');
  const dataTexels = Math.max(1, sources.length * LIGHT_FIELD_TEXELS_PER_SOURCE);
  const dataWidth = Math.min(ROW_TEXELS, dataTexels);
  const dataHeight = Math.ceil(dataTexels / dataWidth);
  const data = new Float32Array(dataWidth * dataHeight * 4);
  const packed = sources.map((source, index) => packLight(source, data, index));
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  sources.forEach(({ pos: [x, , z] }, index) => {
    const { range } = packed[index]!;
    minX = Math.min(minX, Math.floor((x - range) / cellM));
    minZ = Math.min(minZ, Math.floor((z - range) / cellM));
    maxX = Math.max(maxX, Math.floor((x + range) / cellM));
    maxZ = Math.max(maxZ, Math.floor((z + range) / cellM));
  });
  if (sources.length === 0) minX = minZ = 0;
  const columns = sources.length ? maxX - minX + 1 : 0;
  const rows = sources.length ? maxZ - minZ + 1 : 0;
  const headers = columns * rows;
  if (headers >= ROW_TEXELS * TEXTURE_EDGE) throw new RangeError('Light field bounds exceed the grid texture');
  const cells = new Map<number, Candidate[]>();
  sources.forEach((source, index) => {
    const { pos: [x, y, z], footY } = source;
    const { range, strength } = packed[index]!;
    const height = Math.max(1, y - footY);
    for (let row = Math.floor((z - range) / cellM); row <= Math.floor((z + range) / cellM); row++) {
      for (let col = Math.floor((x - range) / cellM); col <= Math.floor((x + range) / cellM); col++) {
        const dx = Math.max(col * cellM - x, x - (col + 1) * cellM, 0);
        const dz = Math.max(row * cellM - z, z - (row + 1) * cellM, 0);
        const d2 = dx * dx + dz * dz;
        if (d2 > range * range) continue;
        // Upper bound on horizontal illumination at mounting surface height.
        const rank = strength * height / (height * height + d2) ** 1.5;
        const key = (row - minZ) * columns + col - minX;
        const list = cells.get(key) ?? [];
        list.push({ index, rank });
        cells.set(key, list);
      }
    }
  });
  let maxCandidates = 0, overflowingCells = 0, slots = 1;
  for (const list of cells.values()) {
    maxCandidates = Math.max(maxCandidates, list.length);
    if (list.length > cap) {
      overflowingCells++;
      list.sort((a, b) => b.rank - a.rank || a.index - b.index);
      list.length = cap;
    }
    slots += 1 + list.length;
  }
  const gridTexels = headers + Math.ceil(slots / 2);
  const gridWidth = Math.min(ROW_TEXELS, gridTexels);
  const gridHeight = Math.ceil(gridTexels / gridWidth);
  if (gridHeight > TEXTURE_EDGE) throw new RangeError('Light field lists exceed the grid texture');
  const grid = new Uint8Array(gridWidth * gridHeight * 4);
  const view = new DataView(grid.buffer);
  const emptyOffset = headers * 2;
  let next = emptyOffset + 1;
  for (let cell = 0; cell < headers; cell++) {
    const list = cells.get(cell);
    view.setUint32(cell * 4, list ? next : emptyOffset, true);
    if (!list) continue;
    view.setUint16(2 * next++, list.length, true);
    for (const { index } of list) view.setUint16(2 * next++, index, true);
  }
  return { spec, sources, origin: [minX * cellM, minZ * cellM], columns, rows, data, dataWidth, dataHeight,
    grid, gridWidth, gridHeight, maxCandidates, overflowingCells };
}
