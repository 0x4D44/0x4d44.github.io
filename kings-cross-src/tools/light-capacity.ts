import { opticIntensity } from '../core/light-photometry.ts';
import type { LightPoint, LightSource, Optic } from '../core/light-sources.ts';

type DirectOptic = Exclude<Optic, { kind: 'panel' }>;
interface Candidate {
  source: LightSource;
  optic: DirectOptic;
  rank: number;
}
export interface ReceiverSample {
  pos: LightPoint;
  covered: boolean;
}
export interface LightGrid {
  sizeM: number;
  cells: ReadonlyMap<string, readonly Candidate[]>;
}
const cellKey = (x: number, z: number) => `${x},${z}`;
const compareId = (a: Candidate, b: Candidate) => a.source.id < b.source.id ? -1 : Number(a.source.id > b.source.id);

/** XZ broad phase. The disk encloses each optic's elliptical support and
 * admits elevated receivers. Ranking uses the best horizontal irradiance
 * at the cell, at the emitter's own mounting surface height. */
export function lightGrid(sources: readonly LightSource[], sizeM: number): LightGrid {
  const cells = new Map<string, Candidate[]>();
  for (const source of sources) {
    const { optic } = source;
    if (optic.kind === 'panel') continue;
    const radius = optic.kind === 'downlight' ? optic.radiusM : Math.max(optic.throwM, optic.spreadM);
    const [x, y, z] = source.pos;
    const height = Math.max(1, y - source.footY);
    const peakCd = opticIntensity(source.lumens, optic, 1);
    for (let row = Math.floor((z - radius) / sizeM); row <= Math.floor((z + radius) / sizeM); row++) {
      for (let col = Math.floor((x - radius) / sizeM); col <= Math.floor((x + radius) / sizeM); col++) {
        const dx = Math.max(col * sizeM - x, x - (col + 1) * sizeM, 0);
        const dz = Math.max(row * sizeM - z, z - (row + 1) * sizeM, 0);
        const d2 = dx * dx + dz * dz;
        if (d2 > radius * radius) continue;
        const rank = peakCd * height / (height * height + d2) ** 1.5;
        const key = cellKey(col, row);
        const list = cells.get(key) ?? [];
        list.push({ source, optic, rank });
        cells.set(key, list);
      }
    }
  }
  for (const list of cells.values()) list.sort((a, b) => b.rank - a.rank || compareId(a, b));
  return { sizeM, cells };
}

export function occupancy(grid: LightGrid) {
  const ordered = [...grid.cells].sort(([a, as], [b, bs]) => as.length - bs.length || (a < b ? 1 : -1));
  const [key, worst] = ordered.at(-1) ?? ['0,0', []];
  const [x, z] = key.split(',').map(n => Number(n) * grid.sizeM);
  const p = (q: number) => ordered[Math.ceil(q * ordered.length) - 1]?.[1].length ?? 0;
  return { occupiedCells: ordered.length, p50: p(.5), p90: p(.9), p95: p(.95), p99: p(.99),
    over8: ordered.filter(([, list]) => list.length > 8).length,
    worst: { x, z, count: worst.length, ids: worst.map(v => v.source.id) } };
}

function irradiance({ source, optic }: Candidate, { pos: [x, y, z], covered }: ReceiverSample): number {
  if ((source.cover === 'under-roof') !== covered || y < source.footY - 3) return 0;
  const [lx, ly, lz] = source.pos;
  const dx = x - lx, dz = z - lz, up = ly - y;
  if (up <= 0) return 0;
  const plane = source.halfSpace;
  if (plane && plane.normal[0] * x + plane.normal[1] * y + plane.normal[2] * z < plane.offset) return 0;
  let r: number;
  if (optic.kind === 'downlight') {
    r = Math.hypot(dx, dz) / optic.radiusM;
  } else {
    // The pole arm crosses a road. The platform optic's yaw follows the
    // platform, as it does in the existing paving bake.
    const yaw = source.yaw + (source.tags.includes('open-platform') ? 0 : Math.PI / 2);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    r = Math.hypot((dx * c - dz * s) / optic.throwM, (dx * s + dz * c) / optic.spreadM);
  }
  if (r >= 1) return 0;
  const t = Math.max(0, (r - .75) / .25);
  const window = 1 - t * t * (3 - 2 * t);
  const d = Math.hypot(dx, dz, up), incidence = up / d;
  return opticIntensity(source.lumens, optic, incidence) * incidence * window / Math.max(1, d * d);
}

function at(grid: LightGrid, receiver: ReceiverSample, cap: number) {
  const [x, , z] = receiver.pos;
  const list = grid.cells.get(cellKey(Math.floor(x / grid.sizeM), Math.floor(z / grid.sizeM))) ?? [];
  let kept = 0, lost = 0;
  list.forEach((candidate, i) => {
    const lux = irradiance(candidate, receiver);
    if (i < cap) kept += lux;
    else lost += lux;
  });
  return { kept, lost };
}

export function measureCap(grid: LightGrid, samples: readonly ReceiverSample[], cap: number) {
  let unlimitedLux = 0, droppedLux = 0, maxDroppedLux = 0, maxDroppedPercentAt1Lux = 0, affected = 0;
  let worstAt: LightPoint | null = null;
  for (const sample of samples) {
    const { kept, lost } = at(grid, sample, cap);
    const full = kept + lost;
    unlimitedLux += full;
    droppedLux += lost;
    if (lost > 0) affected++;
    if (lost > maxDroppedLux) { maxDroppedLux = lost; worstAt = sample.pos; }
    if (full >= 1) maxDroppedPercentAt1Lux = Math.max(maxDroppedPercentAt1Lux, 100 * lost / full);
  }
  return { samples: samples.length, affected, unlimitedLux, droppedLux,
    droppedPercent: unlimitedLux ? 100 * droppedLux / unlimitedLux : 0, maxDroppedLux, maxDroppedPercentAt1Lux, worstAt };
}

/** Difference of the overflow error 2 cm across a cell seam, at one
 * receiver height. Subtracting the uncapped light removes the real gradient. */
export function measureSeams(grid: LightGrid, seams: readonly (readonly [ReceiverSample, ReceiverSample])[], cap: number) {
  let maxJumpLux = 0, worstAt: LightPoint | null = null;
  for (const [a, b] of seams) {
    const jump = Math.abs(at(grid, a, cap).lost - at(grid, b, cap).lost);
    if (jump > maxJumpLux) { maxJumpLux = jump; worstAt = a.pos; }
  }
  return { seams: seams.length, maxJumpLux, worstAt };
}
