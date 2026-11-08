// Terrain audit: how far is the model's flat ground from the real ground?
//
//   node tools/terrain-audit.ts [--json <out.json>]
//
// Every building, street, tree and canal is drawn on one flat plane, GROUND_Y = -0.2 m (web/src/world.ts; kx-terrain.json
// carries the same number, which core/tests/terrain.test.ts pins). The real ground is the height field in
// web/src/data/kx-terrain.json (core/terrain.ts). For each kind of object this measures
//     g = ground height - GROUND_Y            (metres, at the object's reference points)
// g > 0: the ground is above the plane, so an object drawn on the plane is BURIED by g; g < 0: the ground is below it and
// the object HOVERS by |g|. Rails sit at their own level, the rail head y = 0, and are measured against that instead.
// Frame: x east, z south, y up, metres (core/geo.ts). Read-only: prints tables (100 columns at most) and, with --json,
// writes every number per object.
import { readFileSync, writeFileSync } from 'node:fs';
import { createTerrain } from '../core/terrain.ts';
import type { TerrainFile } from '../core/terrain.ts';
import type { Pt } from '../core/geo.ts';
import type { KxData } from '../core/osm.ts';
import type { CityData } from '../core/city.ts';
import { OSM_IDS } from '../core/landmarks.ts';
import { OSM as KXCENTRAL } from '../core/kxcentral.ts';
import { centroid } from '../core/zones.ts';

const args = process.argv.slice(2);
const jsonOut = args[0] === '--json' ? args[1] : undefined;
if (args.length > 0 && !(args.length === 2 && jsonOut)) {
  console.error('usage: node tools/terrain-audit.ts [--json <out.json>]');
  process.exit(2);
}

const load = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../web/src/data/${name}`, import.meta.url), 'utf8')) as T;
const terrain = createTerrain(load<TerrainFile>('kx-terrain.json'));
const track = load<KxData>('kx-track.json');
const city = load<CityData>('kx-city.json');
const GROUND_Y = terrain.groundY;
const gap = (x: number, z: number): number => terrain.heightAt(x, z) - GROUND_Y;
const fail = (m: string): never => {
  throw new Error(m);
};

// ---- statistics and printing ---------------------------------------------------------------------------

interface Dist { n: number; min: number; p5: number; p25: number; p50: number; p75: number; p95: number; max: number }
const COLS = ['min', 'p5', 'p25', 'p50', 'p75', 'p95', 'max'] as const;

/** Percentiles by sorting and indexing: the value at floor(p * (n - 1)). */
function dist(values: readonly number[]): Dist {
  const a = values.slice().sort((p, q) => p - q);
  const at = (p: number): number => a[Math.floor(p * (a.length - 1))] as number;
  return { n: a.length, min: at(0), p5: at(0.05), p25: at(0.25), p50: at(0.5), p75: at(0.75), p95: at(0.95), max: at(1) };
}

/** Counts of |v| under 0.3, 0.3 to 1, 1 to 3 and over 3 metres. */
function bands(abs: readonly number[]): number[] {
  const c = [0, 0, 0, 0];
  for (const v of abs) c[v < 0.3 ? 0 : v < 1 ? 1 : v <= 3 ? 2 : 3]++;
  return c;
}

function groupBy<T>(items: readonly T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const g = m.get(k);
    if (g) g.push(it);
    else m.set(k, [it]);
  }
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

const f = (v: number, d = 2): string => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d);
/** One table line from [text, width] cells: a positive width pads on the left (numbers), a negative one on the right (text, cut to fit). */
const cells = (...c: [string | number, number][]): string => c.map(([v, w]) => (w < 0 ? String(v).slice(0, -w).padEnd(-w) : String(v).padStart(w))).join('');
const distHead = (label: string): string => cells([label, -36], ['n', 6], ...COLS.map((c): [string, number] => [c, 8]));
const distRow = (label: string, d: Dist): string => cells([label, -36], [d.n, 6], ...COLS.map((c): [string, number] => [f(d[c]), 8]));
const bandHead = (): string => cells(['count and share of |gap|', -36], ...['under 0.3 m', '0.3 to 1 m', '1 to 3 m', 'over 3 m'].map((s): [string, number] => [s, 15]));
const bandRow = (label: string, abs: readonly number[]): string =>
  cells([label, -36], ...bands(abs).map((n): [string, number] => [`${n} (${((100 * n) / abs.length).toFixed(0)}%)`, 15]));

interface Sample { s: number; x: number; z: number }
/** Points every `step` metres of arc length along a polyline, from its first vertex to its last (the last is always included). */
function along(line: readonly Pt[], step: number): Sample[] {
  const out: Sample[] = [];
  let walked = 0;
  let next = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i] as Pt;
    const [bx, bz] = line[i + 1] as Pt;
    const len = Math.hypot(bx - ax, bz - az);
    for (; next <= walked + len; next += step) {
      const t = len > 0 ? (next - walked) / len : 0;
      out.push({ s: next, x: ax + (bx - ax) * t, z: az + (bz - az) * t });
    }
    walked += len;
  }
  const [lx, lz] = line[line.length - 1] as Pt;
  if (!out.length || walked - (out[out.length - 1] as Sample).s > 1e-6) out.push({ s: walked, x: lx, z: lz });
  return out;
}
const lengthOf = (smp: readonly Sample[]): number => (smp[smp.length - 1] as Sample).s;

const report: Record<string, unknown> = { groundY: GROUND_Y };
console.log(`TERRAIN AUDIT   flat ground GROUND_Y = ${f(GROUND_Y)} m against web/src/data/kx-terrain.json`);
console.log('g = ground height - GROUND_Y: g > 0, the object is buried by g; g < 0, it hovers by |g|. (metres)');
console.log('Rails use the rail head (y = 0) instead. Percentiles: sorted value at index floor(p * (n - 1)).');

// ---- 1. buildings --------------------------------------------------------------------------------------

const bRows = track.buildings.map((b) => {
  const r = terrain.rangeUnder(b.pts, 2);
  const [x, z] = centroid(b.pts);
  const float = Math.max(0, GROUND_Y - r.min);
  const sunk = Math.max(0, r.max - GROUND_Y);
  return { id: b.id, name: b.name ?? '', kind: b.kind, x, z, lowest: r.min, highest: r.max, float, sunk, relief: r.max - r.min, worst: Math.max(float, sunk) };
});
const byWorst = bRows.slice().sort((a, b) => b.worst - a.worst);
const byFloat = bRows.slice().sort((a, b) => b.float - a.float);
const landmarks = [...Object.entries(OSM_IDS), ...Object.entries(KXCENTRAL)].map(([key, id]) => {
  const row = bRows.find((r) => r.id === id);
  return { key, id, rank: row ? byWorst.indexOf(row) + 1 : null, row: row ?? null };
});
report.buildings = {
  count: bRows.length,
  gapAtLowest: dist(bRows.map((r) => r.lowest - GROUND_Y)),
  gapAtHighest: dist(bRows.map((r) => r.highest - GROUND_Y)),
  float: dist(bRows.map((r) => r.float)),
  sunk: dist(bRows.map((r) => r.sunk)),
  relief: dist(bRows.map((r) => r.relief)),
  worstBands: bands(bRows.map((r) => r.worst)),
  landmarks,
  items: bRows,
};

console.log(`\n1. BUILDINGS   ${bRows.length} footprints; ground under each: corners, edge midpoints and a 2 m lattice`);
console.log(distHead('measure'));
console.log(distRow('g at the lowest ground', dist(bRows.map((r) => r.lowest - GROUND_Y))));
console.log(distRow('g at the highest ground', dist(bRows.map((r) => r.highest - GROUND_Y))));
console.log(distRow('float: base above lowest ground', dist(bRows.map((r) => r.float))));
console.log(distRow('sunk: burial at highest ground', dist(bRows.map((r) => r.sunk))));
console.log(distRow('relief: highest - lowest ground', dist(bRows.map((r) => r.relief))));
console.log(`\n${bandHead()}`);
console.log(bandRow('buildings: max(float, sunk)', bRows.map((r) => r.worst)));
const buildingTable = (title: string, list: typeof bRows): void => {
  console.log(`\n${title}`);
  console.log(cells(['id', -11], ['name or kind', -23], ['x', 8], ['z', 8], ['lowest', 8], ['highest', 8], ['float', 7], ['sunk', 7]));
  for (const r of list) console.log(cells([r.id, -11], [r.name || r.kind, -23], [f(r.x, 1), 8], [f(r.z, 1), 8], [f(r.lowest), 8], [f(r.highest), 8], [f(r.float), 7], [f(r.sunk), 7]));
};
buildingTable('worst 20 by max(float, sunk)', byWorst.slice(0, 20));
buildingTable('worst 10 by float alone (the base hovering above the lowest ground)', byFloat.slice(0, 10));
console.log('\nlandmarks (rank = place among all buildings by max(float, sunk), 1 = worst)');
console.log(cells(['name', -20], ['id', -11], ['rank', 5], ['lowest', 8], ['highest', 8], ['relief', 8], ['float', 7], ['sunk', 7]));
for (const { key, id, rank, row: r } of landmarks) {
  const head = cells([key, -20], [id, -11]);
  console.log(r ? head + cells([rank as number, 5], [f(r.lowest), 8], [f(r.highest), 8], [f(r.relief), 8], [f(r.float), 7], [f(r.sunk), 7]) : `${head}  not in kx-track.json buildings`);
}

// ---- 2. streets ----------------------------------------------------------------------------------------

const roadPts: { cls: string; g: number }[] = [];
const roads = city.roads.map((road) => {
  const smp = along(road.pts, 5);
  const g = smp.map((p) => gap(p.x, p.z));
  for (const v of g) roadPts.push({ cls: road.cls, g: v });
  // the largest height change over any 20 m: windows start on the 5 m samples, so a road under 20 m long has none
  let dh: number | null = null;
  for (let i = 0; i + 4 < smp.length; i++) {
    if ((smp[i + 4] as Sample).s - (smp[i] as Sample).s > 19.99) dh = Math.max(dh ?? 0, Math.abs((g[i + 4] as number) - (g[i] as number)));
  }
  return {
    id: road.id, cls: road.cls, name: road.name ?? '', bridge: road.bridge === true, length: lengthOf(smp), n: g.length,
    minG: Math.min(...g), maxG: Math.max(...g), worstG: g.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0),
    dh20: dh, gradePct: dh === null ? null : dh * 5,
  };
});
const byGap = roads.slice().sort((a, b) => Math.abs(b.worstG) - Math.abs(a.worstG));
const bySteep = roads.filter((r) => r.gradePct !== null).sort((a, b) => (b.gradePct as number) - (a.gradePct as number));
const roadClasses = groupBy(roadPts, (p) => p.cls);
report.streets = {
  roads: roads.length,
  points: roadPts.length,
  gap: dist(roadPts.map((p) => p.g)),
  byClass: Object.fromEntries(roadClasses.map(([cls, v]) => [cls, dist(v.map((p) => p.g))])),
  bands: bands(roadPts.map((p) => Math.abs(p.g))),
  items: roads,
};

console.log(`\n2. STREETS   ${roads.length} roads (${roads.filter((r) => r.bridge).length} on bridges), ${roadPts.length} points every 5 m along them`);
console.log(distHead('g'));
console.log(distRow('all streets', dist(roadPts.map((p) => p.g))));
for (const [cls, v] of roadClasses) console.log(distRow(`  ${cls}`, dist(v.map((p) => p.g))));
console.log(`\n${bandHead()}`);
console.log(bandRow('street points', roadPts.map((p) => Math.abs(p.g))));
const roadTable = (title: string, list: typeof roads): void => {
  console.log(`\n${title}`);
  console.log(cells(['id', -11], ['class', -11], ['name', -26], ['len m', 7], ['worst g', 9], ['dh 20 m', 9], ['grade %', 9]));
  for (const r of list.slice(0, 10)) console.log(cells([r.id, -11], [r.cls + (r.bridge ? '*' : ''), -11], [r.name, -26], [f(r.length, 0), 7], [f(r.worstG), 9], [r.dh20 === null ? '-' : f(r.dh20), 9], [r.gradePct === null ? '-' : f(r.gradePct, 1), 9]));
};
console.log('\n* on a bridge. worst g: the g of largest size, signed. dh 20 m: largest change over any 20 m.');
roadTable('10 worst roads by max |g|', byGap);
roadTable('10 steepest roads: grade = dh 20 m / 20 m (roads under 20 m long are skipped)', bySteep);

// ---- 3. trees ------------------------------------------------------------------------------------------

const treeG = city.trees.map(([x, z]) => gap(x, z));
report.trees = { count: treeG.length, gap: dist(treeG), bands: bands(treeG.map(Math.abs)), items: city.trees.map(([x, z], i) => [x, z, treeG[i]]) };
console.log(`\n3. TREES   ${treeG.length} trees`);
console.log(distHead('g'));
console.log(distRow('all trees', dist(treeG)));
console.log(`\n${bandHead()}`);
console.log(bandRow('trees', treeG.map(Math.abs)));

// ---- 4. canal ------------------------------------------------------------------------------------------

const canals = city.canals.map((c) => {
  const smp = along(c.pts, 5);
  const d = dist(smp.map((p) => terrain.heightAt(p.x, p.z)));
  return { id: c.id, name: c.name ?? '', length: lengthOf(smp), n: d.n, min: d.min, median: d.p50, max: d.max, spread: d.max - d.min, level: d.max - d.min <= 0.3 };
});
report.canals = canals;
console.log(`\n4. CANAL   ${canals.length} centre-line pieces; ground height y every 5 m along each (g = y - GROUND_Y)`);
console.log('not level: spread (max - min) over 0.3 m on one piece');
console.log(cells(['id', -11], ['name', -26], ['len m', 7], ['n', 4], ['min', 8], ['median', 8], ['max', 8], ['spread', 8]));
for (const c of canals) console.log(cells([c.id, -11], [c.name, -26], [f(c.length, 0), 7], [c.n, 4], [f(c.min), 8], [f(c.median), 8], [f(c.max), 8], [f(c.spread), 8]) + (c.level ? '' : '  NOT LEVEL'));
console.log(`${canals.filter((c) => !c.level).length} of ${canals.length} pieces are not level`);

// ---- 5. areas ------------------------------------------------------------------------------------------

const areas = city.areas.map((a) => {
  const r = terrain.rangeUnder(a.pts, 4);
  const [cx, cz] = centroid(a.pts);
  return { id: a.id, kind: a.kind, name: a.name ?? '', range: r.max - r.min, gAtCentroid: gap(cx, cz) };
});
const areaKinds = groupBy(areas, (a) => a.kind);
report.areas = { count: areas.length, byKind: Object.fromEntries(areaKinds.map(([kind, v]) => [kind, { range: dist(v.map((a) => a.range)), gAtCentroid: dist(v.map((a) => a.gAtCentroid)) }])), items: areas };
console.log(`\n5. AREAS   ${areas.length} rings; ground range = highest - lowest ground under the ring (4 m lattice)`);
console.log('g at centroid: the centroid is the mean of the ring vertices (core/zones.ts)');
console.log(distHead('kind: measure'));
for (const [kind, v] of areaKinds) {
  console.log(distRow(`${kind}: ground range`, dist(v.map((a) => a.range))));
  console.log(distRow(`${kind}: g at centroid`, dist(v.map((a) => a.gAtCentroid))));
}

// ---- 6. rails against the terrain ----------------------------------------------------------------------

const BURIED = 0.3; // ground above this: the rail head (y = 0) is buried
const HOVER = -0.7; // ground below this: the rail hovers
const nodeAt = new Map(track.nodes.map(([id, x, z]): [number, Pt] => [id, [x, z]]));
const open = track.rails.filter((r) => !r.tunnel && !r.bridge);
const ways = open.map((r) => {
  const line = r.nodes.map((id) => nodeAt.get(id) ?? fail(`rail ${r.id}: node ${id} has no position`));
  const ref = r.ref ?? '(none)';
  return { way: r.id, ref, layer: r.layer, pts: along(line, 10).map((p) => ({ ref, way: r.id, layer: r.layer, x: p.x, z: p.z, h: terrain.heightAt(p.x, p.z) })) };
});
const railPts = ways.flatMap((w) => w.pts);
const railRow = (ref: string, v: typeof railPts) => {
  const d = dist(v.map((p) => p.h));
  return { ref, ways: new Set(v.map((p) => p.way)).size, points: v.length, min: d.min, median: d.p50, max: d.max, buried: v.filter((p) => p.h > BURIED).length, hover: v.filter((p) => p.h < HOVER).length };
};
const refRows = [...groupBy(railPts, (p) => p.ref).map(([ref, v]) => railRow(ref, v)), railRow('ALL', railPts)];
const excess = (h: number): number => Math.max(h - BURIED, HOVER - h, 0);
const worstRail = railPts.slice().sort((a, b) => excess(b.h) - excess(a.h)).slice(0, 10).filter((p) => excess(p.h) > 0);
report.rails = { open: open.length, points: railPts.length, buriedAbove: BURIED, hoverBelow: HOVER, byRef: refRows, byWay: ways.map((w) => ({ way: w.way, layer: w.layer, ...railRow(w.ref, w.pts) })), worst: worstRail };
console.log(`\n6. RAILS   ${open.length} open ways (not tunnel, not bridge); ${railPts.length} points every 10 m along them`);
console.log(`y = ground height, rail head 0: buried if y > ${BURIED}, hover if y < ${HOVER} (track bed ${f(GROUND_Y)})`);
console.log(cells(['ref', -8], ['ways', 6], ['points', 8], ['min', 8], ['median', 8], ['max', 8], ['buried', 8], ['hover', 8], ['bad %', 8]));
for (const r of refRows) console.log(cells([r.ref, -8], [r.ways, 6], [r.points, 8], [f(r.min), 8], [f(r.median), 8], [f(r.max), 8], [r.buried, 8], [r.hover, 8], [f((100 * (r.buried + r.hover)) / r.points, 1), 8]));
if (worstRail.length) {
  console.log('\nworst points (the farthest outside the band)');
  console.log(cells(['ref', -8], ['way', -12], ['layer', 6], ['x', 9], ['z', 9], ['ground', 9]));
  for (const p of worstRail) console.log(cells([p.ref, -8], [p.way, -12], [p.layer, 6], [f(p.x, 1), 9], [f(p.z, 1), 9], [f(p.h), 9]));
}

// ---- the numbers as JSON -------------------------------------------------------------------------------

if (jsonOut) {
  writeFileSync(jsonOut, `${JSON.stringify(report, (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v))}\n`);
  console.log(`\nfull numbers written to ${jsonOut}`);
}
