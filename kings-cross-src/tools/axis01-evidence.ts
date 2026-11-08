// Geometry evidence using the same mesh builders as web/src/main.ts. No WebGL or private feeds.
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import type { KxData } from '../core/osm.ts';
import type { Pt } from '../core/geo.ts';
import { GAUGE, KINGS_CROSS_PLATFORM_LENGTHS_M, longAxis, shedLayout, stationPlatforms } from '../core/station.ts';
import { railSegments } from '../core/scene.ts';
import { trainLayout } from '../core/train.ts';
import { buildPlatforms } from '../web/src/furniture.ts';
import { buildTrack, splitByZone } from '../web/src/track.ts';
import { buildShed } from '../web/src/shed.ts';
import { buildTrain } from '../web/src/train.ts';
import { tunnelMouths } from '../core/landmarks.ts';
import { faceMouth, mouthPartsTerrain } from '../web/src/portals.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUTPUT = resolve(ROOT, '.scratch/round21-geometry');
const round = (n: number) => Math.round(n * 1e6) / 1e6;
export const TOLERANCES = { platformM: 1, throatM: 3, gaugeM: 0.002 };

/** Project actual world mesh vertices onto a supplied unit axis. */
export function meshExtent(object: THREE.Object3D, axis: THREE.Vector3): number {
  object.updateWorldMatrix(true, true);
  let lo = Infinity; let hi = -Infinity;
  object.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const d = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).dot(axis);
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
  });
  if (!Number.isFinite(lo)) throw new Error('mesh contains no vertices');
  return round(hi - lo);
}

/** Cast from the track centre towards each rail at 7 mm below rail top: the first hits are inner head faces. */
export function measureRailFaces(mesh: THREE.Mesh, point: Pt, direction: Pt) {
  const l = Math.hypot(...direction);
  const across = new THREE.Vector3(-direction[1] / l, 0, direction[0] / l);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const probe = new THREE.Mesh(mesh.geometry, material);
  probe.matrixWorld.copy(mesh.matrixWorld);
  const origin = new THREE.Vector3(point[0], -0.007, point[1]);
  const hits = [1, -1].map(sign => new THREE.Raycaster(origin, across.clone().multiplyScalar(sign), 0, 2).intersectObject(probe, false)[0]);
  material.dispose();
  return hits.some(h => h === undefined) ? null : { gaugeM: round(hits[0]!.distance + hits[1]!.distance), innerFacePoints: hits.map(h => h!.point.toArray().map(round)) };
}
export function measureGauge(mesh: THREE.Mesh, point: Pt, direction: Pt): number | null {
  return measureRailFaces(mesh, point, direction)?.gaugeM ?? null;
}
function box(object: THREE.Object3D) {
  const b = new THREE.Box3().setFromObject(object);
  return { x: [round(b.min.x), round(b.max.x)], y: [round(b.min.y), round(b.max.y)], z: [round(b.min.z), round(b.max.z)] };
}
export function createAxis01Report(data: KxData, layout = shedLayout(data), inputs: unknown = {}) {
  const platformGroup = buildPlatforms({ ...data, platforms: [...stationPlatforms(data).values()] }, layout);
  const track = buildTrack(data, layout);
  track.updateMatrixWorld(true);
  const platforms = [...stationPlatforms(data)].sort(([a], [b]) => Number(a) - Number(b)).map(([ref, p]) => {
    const osm = longAxis(p.pts);
    // Tops are triangulated separately from edge classification. Restricting to one polygon retains its exact top mesh.
    const built = buildPlatforms({ ...data, platforms: [p] }, layout);
    const top = built.getObjectByName('platform-tops');
    if (!top) throw new Error(`platform ${ref} has no drawn top`);
    const drawnLengthM = meshExtent(top, new THREE.Vector3(osm.axis[0], 0, osm.axis[1]));
    const published = KINGS_CROSS_PLATFORM_LENGTHS_M[ref] ?? null;
    const geometry = (top as THREE.Mesh).geometry;
    const vertices = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const triangles = Math.floor((index?.count ?? vertices.count) / 3);
    const drawnTopSamples = Array.from({ length: Math.min(9, triangles) }, (_, sample) => {
      const triangle = Math.floor(sample * triangles / Math.min(9, triangles));
      const centre = new THREE.Vector3();
      for (let k = 0; k < 3; k++) centre.add(new THREE.Vector3().fromBufferAttribute(vertices, index ? index.getX(triangle * 3 + k) : triangle * 3 + k));
      return centre.divideScalar(3).toArray().map(round);
    });
    return { ref, osmId: p.id, drawnTopBounds: box(top), drawnTopSamples, drawnLengthM, osmLongAxisM: round(osm.length), publishedOperationalLengthM: published,
      drawnMinusOsmM: round(drawnLengthM - osm.length), drawnMinusPublishedM: published === null ? null : round(drawnLengthM - published),
      withinPublishedTolerance: published === null ? null : Math.abs(drawnLengthM - published) <= TOLERANCES.platformM,
      withinOsmTolerance: Math.abs(drawnLengthM - osm.length) <= TOLERANCES.platformM };
  });
  const segments = railSegments(data);
  const near = [...splitByZone(segments.main, layout).near, ...splitByZone(segments.siding, layout).near];
  const railMesh = track.getObjectByName('track-rails') as THREE.Mesh | undefined;
  const candidates: { point: Pt; direction: Pt; segmentIndex: number }[] = [];
  for (let i = 0; i < near.length; i += 6) {
    const dx = near[i + 3]! - near[i]!; const dz = near[i + 5]! - near[i + 2]!;
    if (Math.hypot(dx, dz) < 5) continue;
    candidates.push({ point: [(near[i]! + near[i + 3]!) / 2, (near[i + 2]! + near[i + 5]!) / 2], direction: [dx, dz], segmentIndex: i });
  }
  // Select geometric clearances before measuring, never by whether a gauge result passes.
  const clear = candidates.filter(c => {
    for (let i = 0; i < near.length; i += 6) {
      if (i === c.segmentIndex) continue;
      const dx = near[i + 3]! - near[i]!; const dz = near[i + 5]! - near[i + 2]!;
      const l2 = dx * dx + dz * dz;
      if (!l2) continue;
      const t = Math.max(0, Math.min(1, ((c.point[0] - near[i]!) * dx + (c.point[1] - near[i + 2]!) * dz) / l2));
      const distance = Math.hypot(c.point[0] - near[i]! - t * dx, c.point[1] - near[i + 2]! - t * dz);
      const parallel = Math.abs((dx * c.direction[0] + dz * c.direction[1]) / Math.sqrt(l2) / Math.hypot(...c.direction));
      if (distance < 1.7 && (distance > 0.05 || parallel < 0.98)) return false;
    }
    return true;
  });
  const gaugeSamples = clear.filter((_, i) => i % Math.max(1, Math.floor(clear.length / 12)) === 0).slice(0, 12).map(c => {
    const faces = railMesh ? measureRailFaces(railMesh, c.point, c.direction) : null;
    const gaugeM = faces?.gaugeM ?? null;
    return { point: c.point, innerFacePoints: faces?.innerFacePoints ?? [], gaugeM, expectedM: GAUGE, errorM: gaugeM === null ? null : round(gaugeM - GAUGE), withinTolerance: gaugeM !== null && Math.abs(gaugeM - GAUGE) <= TOLERANCES.gaugeM };
  });
  const portalGroup = new THREE.Group();
  const tunnels = tunnelMouths(data).map(m => {
    const face = faceMouth(m);
    // The page's terrain-mode face builder; ground height changes the lid/flanks, not this face plane.
    const parts = mouthPartsTerrain(face, { heightAt: () => -0.2 });
    const geometry = parts.brick!.build();
    const mesh = new THREE.Mesh(geometry); if (m.id.endsWith('-south') && m.id.startsWith('gasworks')) portalGroup.add(mesh);
    const p = geometry.getAttribute('position');
    // Dominant masonry plane along the mouth axis comes from the actual front-face vertices.
    const planes = new Map<number, number>();
    for (let i = 0; i < p.count; i++) {
      const w = Math.round(((p.getX(i) - m.origin[0]) * m.axis[0] + (p.getZ(i) - m.origin[1]) * m.axis[1]) * 1000) / 1000;
      planes.set(w, (planes.get(w) ?? 0) + 1);
    }
    const setbackM = [...planes].sort((a, b) => b[1] - a[1])[0]![0];
    const drawnFaceOrigin: Pt = [round(m.origin[0] + m.axis[0] * setbackM), round(m.origin[1] + m.axis[1] * setbackM)];
    return { id: m.id, osmOrigin: m.origin, drawnFaceOrigin, setbackM, withinThroatTolerance: Math.abs(setbackM) <= TOLERANCES.throatM,
      osmNodeIds: m.nodeIds, osmWayIds: data.rails.filter(r => r.tunnel && r.nodes.some(n => m.nodeIds.includes(n))).map(r => r.id) };
  });
  const train = buildTrain('lner5');
  const car = train.children[1]!;
  const specLengthM = trainLayout('lner5').cars[1]!.length;
  const drawnCarLengthM = meshExtent(car, new THREE.Vector3(0, 0, 1));
  const station = new THREE.Group(); station.add(platformGroup, buildShed(layout));
  const throat = new THREE.Group(); if (railMesh) throat.add(railMesh.clone()); throat.add(portalGroup);
  const flags = [
    ...platforms.filter(p => !p.withinOsmTolerance).map(p => ({ code: 'platform-osm-tolerance', detail: `Platform ${p.ref}: drawn minus OSM ${p.drawnMinusOsmM} m` })),
    ...platforms.filter(p => p.withinPublishedTolerance === false).map(p => ({ code: 'platform-published-tolerance', detail: `Platform ${p.ref}: drawn minus published operational ${p.drawnMinusPublishedM} m exceeds 1 m; operational length and polygon extent differ in definition` })),
    ...platforms.filter(p => p.withinPublishedTolerance === null).map(p => ({ code: 'platform-published-missing', detail: `Platform ${p.ref}: no published operational length` })),
    ...(gaugeSamples.length < 3 ? [{ code: 'gauge-samples-missing', detail: `Only ${gaugeSamples.length} clear-track gauge samples; at least 3 required` }] : []),
    ...gaugeSamples.filter(p => !p.withinTolerance).map(p => ({ code: p.gaugeM === null ? 'gauge-hit-missing' : 'gauge-tolerance', detail: `Gauge at ${p.point.join(',')}: ${p.gaugeM ?? 'missing'} m` })),
    ...tunnels.filter(t => !t.withinThroatTolerance).map(t => ({ code: 'throat-tolerance', detail: `${t.id}: ${t.setbackM} m from OSM boundary` })),
    ...(Math.abs(drawnCarLengthM - specLengthM) > 0.001 ? [{ code: 'car-tolerance', detail: `26 m car extent ${drawnCarLengthM} m exceeds 1 mm tolerance` }] : []),
    ...(platforms.some(p => p.ref === '11') ? [{ code: 'platform-eleven-drawn', detail: 'Station surface platform 11 is drawn' }] : []),
  ];
  return { schemaVersion: 1, inputs, tolerances: TOLERANCES, flags,
    method: { independentSurvey: false, platforms: 'Actual platform-tops mesh vertex extent projected onto OSM long axis; same buildPlatforms as main.ts, per polygon. Published lengths are operational lengths, not polygon extents.',
      gauge: 'Samples selected before measuring where no other centreline is within 1.7 m (coincident parallel segments permitted); turnout crossings excluded. Horizontal rays from centreline at y=-0.007 onto actual merged rail mesh inner head faces; 2 mm tolerance allows Float32 and miter errors.',
      tunnels: 'Dominant actual brick mesh face plane vs OSM open/tunnel boundary nodes; terrain-mode face builder with flat ground; lid/flank terrain heights excluded.',
      sources: 'Published dimensions and citations retained in core/station.ts; no independent source re-verification in this tool.' },
    platforms, gaugeSamples, tunnels,
    platform11: { drawn: platforms.some(p => p.ref === '11'), drawnStationRefs: platforms.map(p => p.ref), basis: 'All station-zone surface source polygons passed through the actual platform builder; no generated extra slabs.' },
    sample26mCar: { kind: 'lner5', carIndex: 1, specLengthM, drawnCarLengthM, differenceM: round(drawnCarLengthM - specLengthM), toleranceM: 0.001, withinTolerance: Math.abs(drawnCarLengthM - specLengthM) <= 0.001, includes: 'all car meshes including coupler; model spec length includes coupling allowance' },
    captureBounds: { station: box(station), throat: box(throat) } };
}
/** A plain, shareable rendering of the same measurements and flags stored in JSON. */
export function renderAxis01Markdown(report: ReturnType<typeof createAxis01Report>): string {
  const lines = [
    '# Axis 01 geometry evidence', '',
    'Model consistency evidence; not an independent survey. Published operational platform lengths and drawn polygon extents differ in definition. A published-length flag is a numeric comparison, not proof that the platform mesh is wrong.', '',
    '| Platform | Drawn m | OSM m | Published operational m | Drawn − published m | Within published 1 m |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
    ...report.platforms.map(p => `| ${p.ref} | ${p.drawnLengthM} | ${p.osmLongAxisM} | ${p.publishedOperationalLengthM ?? 'missing'} | ${p.drawnMinusPublishedM ?? 'missing'} | ${p.withinPublishedTolerance === null ? 'missing' : p.withinPublishedTolerance ? 'yes' : 'FLAG'} |`),
    '', 'Gauge samples (actual inner rail faces; tolerance 0.002 m):', '',
    ...report.gaugeSamples.map((p, i) => `- ${i + 1}: x=${round(p.point[0])}, z=${round(p.point[1])}; ${p.gaugeM ?? 'missing'} m; error ${p.errorM ?? 'missing'} m; ${p.withinTolerance ? 'PASS' : 'FLAG'}`),
    '', `26 m intermediate car: drawn ${report.sample26mCar.drawnCarLengthM} m; specification ${report.sample26mCar.specLengthM} m; tolerance ${report.sample26mCar.toleranceM} m; ${report.sample26mCar.withinTolerance ? 'PASS' : 'FLAG'}.`,
    '', `Platform 11 drawn: ${report.platform11.drawn ? 'YES — FLAG' : 'no'}. Drawn station refs: ${report.platform11.drawnStationRefs.join(', ')}.`,
    '', 'Tunnel mouth face offsets from OSM boundary (tolerance 3 m):', '',
    ...report.tunnels.map(t => `- ${t.id}: ${t.setbackM} m; ${t.withinThroatTolerance ? 'PASS' : 'FLAG'}`),
    '', `Flags (${report.flags.length}):`, '',
    ...report.flags.map(f => `- ${f.code}: ${f.detail}`),
    ...(report.flags.length === 0 ? ['- None.'] : []),
    '', 'Method:', '',
    ...Object.entries(report.method).filter(([key]) => key !== 'independentSurvey').map(([key, value]) => `- ${key}: ${value}`),
    '', 'Default output directory: worktree .scratch/round21-geometry. The --out option accepts that exact directory only.', '',
  ];
  return lines.join('\n');
}
async function fingerprint(path: string) { return { path: relative(ROOT, path), sha256: createHash('sha256').update(await readFile(path)).digest('hex') }; }
async function main() {
  const args = process.argv.slice(2);
  let graph = resolve(ROOT, 'kings-cross-src/web/src/data/kx-track.json'); let out = OUTPUT;
  for (let i = 0; i < args.length; i++) {
    if (!['--graph', '--out'].includes(args[i]!) || !args[i + 1]) throw new Error('usage: axis01-evidence.ts [--graph PATH] [--out .scratch/round21-geometry]');
    if (args[i] === '--graph') graph = resolve(args[++i]!); else out = resolve(args[++i]!);
  }
  await mkdir(OUTPUT, { recursive: true });
  if (await realpath(out) !== await realpath(OUTPUT)) throw new Error('output must be worktree .scratch/round21-geometry');
  const sources = await Promise.all(['core/station.ts', 'core/scene.ts', 'core/landmarks.ts', 'web/src/furniture.ts', 'web/src/track.ts', 'web/src/portals.ts', 'web/src/train.ts', 'core/train.ts', 'web/src/main.ts', 'web/src/shed.ts', 'web/src/materials.ts', 'web/src/world.ts', 'tools/axis01-evidence.ts'].map(p => fingerprint(resolve(ROOT, 'kings-cross-src', p))));
  const report = createAxis01Report(JSON.parse(await readFile(graph, 'utf8')) as KxData, undefined, { graph: await fingerprint(graph), sources });
  await writeFile(resolve(out, 'axis01-evidence.json'), JSON.stringify(report, null, 2) + '\n');
  const markdown = renderAxis01Markdown(report);
  await writeFile(resolve(out, 'axis01-evidence.md'), markdown);
  console.log(markdown);
  console.log(`Evidence written to ${relative(ROOT, out)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
