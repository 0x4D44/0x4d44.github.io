// Geometry evidence using the same mesh builders as web/src/main.ts. No WebGL or private feeds.
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { project } from '../core/geo.ts';
import type { RawElement, KxData } from '../core/osm.ts';
import type { Pt } from '../core/geo.ts';
import { GAUGE, KINGS_CROSS_PLATFORM_LENGTHS_M, concourseCanopy, longAxis, shedLayout, stationBuilding, stationPlatforms, platformDrawingOutline } from '../core/station.ts';
import { railSegments } from '../core/scene.ts';
import { trainLayout } from '../core/train.ts';
import { buildPlatforms } from '../web/src/furniture.ts';
import { buildTrack, splitByZone } from '../web/src/track.ts';
import { buildShed } from '../web/src/shed.ts';
import { buildConcourse } from '../web/src/concourse.ts';
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
/** Sample both actual mesh boundary and reference ring at intervals no greater than 2 m.
 * Shared triangle edges cancel; coordinates include all ancestor/object transforms.
 * This is sampled source/drawing consistency, not a survey or an exact Hausdorff bound. */
export function measureBoundaryAgreement(object: THREE.Object3D, ring: readonly Pt[], toleranceM = 1) {
  const sampleIntervalM = 2;
  type Edge = [Pt, Pt];
  const counts = new Map<string, { edge: Edge; count: number }>();
  object.updateWorldMatrix(true, true);
  object.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const position = o.geometry.getAttribute('position'), index = o.geometry.getIndex();
    if (!position) return;
    const at = (i: number): Pt => {
      const v = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
      return [v.x, v.z];
    };
    for (let i = 0; i + 2 < (index?.count ?? position.count); i += 3) {
      const pts = [0, 1, 2].map(k => at(index ? index.getX(i + k) : i + k));
      for (let k = 0; k < 3; k++) {
        const edge: Edge = [pts[k]!, pts[(k + 1) % 3]!];
        const key = edge.map(p => p.map(n => n.toFixed(5)).join(',')).sort().join('|');
        const previous = counts.get(key);
        counts.set(key, { edge, count: (previous?.count ?? 0) + 1 });
      }
    }
  });
  const drawn = [...counts.values()].filter(e => e.count === 1).map(e => e.edge);
  const reference: Edge[] = ring.map((p, i) => [p, ring[(i + 1) % ring.length]!]);
  const valid = drawn.length > 0 && ring.length >= 3;
  const distance = (p: Pt, [a, b]: Edge): number => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
  };
  const directed = (from: Edge[], to: Edge[]): number => {
    let maximum = 0;
    for (const [a, b] of from) {
      const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / sampleIntervalM));
      for (let k = 0; k <= count; k++) {
        const point: Pt = [a[0] + (b[0] - a[0]) * k / count, a[1] + (b[1] - a[1]) * k / count];
        maximum = Math.max(maximum, Math.min(...to.map(e => distance(point, e))));
      }
    }
    return round(maximum);
  };
  const drawnToReferenceM = valid ? directed(drawn, reference) : null;
  const referenceToDrawnM = valid ? directed(reference, drawn) : null;
  return { status: valid ? 'available' as const : 'unavailable' as const, sampleIntervalM, toleranceM,
    drawnToReferenceM, referenceToDrawnM, withinTolerance: valid && drawnToReferenceM! <= toleranceM && referenceToDrawnM! <= toleranceM };
}
function box(object: THREE.Object3D) {
  const b = new THREE.Box3().setFromObject(object);
  return { x: [round(b.min.x), round(b.max.x)], y: [round(b.min.y), round(b.max.y)], z: [round(b.min.z), round(b.max.z)] };
}
export function createAxis01Report(data: KxData, layout = shedLayout(data), inputs: unknown = {}, rawElements?: readonly RawElement[]) {
  const rawNodes = new Map<number, Pt>(), rawWays = new Map<number, RawElement>();
  for (const e of rawElements ?? []) {
    if (e.type === 'node' && e.lat !== undefined && e.lon !== undefined) rawNodes.set(e.id, project(e.lat, e.lon, data.origin));
    if (e.type === 'way') {
      rawWays.set(e.id, e);
      e.nodes?.forEach((id, i) => { const p = e.geometry?.[i]; if (p) rawNodes.set(id, project(p.lat, p.lon, data.origin)); });
    }
  }
  const positions = new Map(data.nodes.map(([id, x, z]) => [id, [x, z] as Pt]));
  const registration = (ids: readonly number[]) => {
    const nodes = ids.map(id => { const a = positions.get(id), b = rawNodes.get(id); const distanceM = a && b ? round(Math.hypot(a[0] - b[0], a[1] - b[1])) : null;
      return { id, distanceM, withinTolerance: distanceM !== null && distanceM <= TOLERANCES.throatM }; });
    return { nodes, maxDistanceM: nodes.some(n => n.distanceM === null) || !nodes.length ? null : Math.max(...nodes.map(n => n.distanceM!)), withinTolerance: nodes.length > 0 && nodes.every(n => n.withinTolerance) };
  };
  const railRegistration = registration([...new Set(data.rails.flatMap(r => r.nodes))]);
  const sourceRegistration = { status: rawElements === undefined ? 'unavailable' as const : 'available' as const, toleranceM: TOLERANCES.throatM, railNodes: rawElements === undefined ? [] : railRegistration.nodes, maxDistanceM: rawElements === undefined ? null : railRegistration.maxDistanceM };
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
    const rawRing = rawWays.get(p.id)?.geometry?.map(g => project(g.lat, g.lon, data.origin));
    const drawingBoundary = measureBoundaryAgreement(top, platformDrawingOutline(p, data));
    const rawBoundary = rawElements === undefined ? null : measureBoundaryAgreement(top, rawRing ?? []);
    return { ref, osmId: p.id, drawingBoundary, rawBoundary, drawnTopBounds: box(top), drawnTopSamples, drawnLengthM, osmLongAxisM: round(osm.length), publishedOperationalLengthM: published,
      drawnMinusOsmM: round(drawnLengthM - osm.length), drawnMinusPublishedM: published === null ? null : round(drawnLengthM - published),
      withinPublishedTolerance: published === null ? null : Math.abs(drawnLengthM - published) <= TOLERANCES.platformM,
      withinOsmTolerance: Math.abs(drawnLengthM - osm.length) <= TOLERANCES.platformM,
      // A documented drawing inference (core/station.ts platformDrawingOutline) explains an OSM difference; it is not a survey.
      outlineInference: (built.userData.outlineInferences as { source: string }[] | undefined)?.[0] ?? null };
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
    return { id: m.id, sourceRegistration: rawElements === undefined ? null : registration(m.nodeIds), osmOrigin: m.origin, drawnFaceOrigin, setbackM, withinThroatTolerance: Math.abs(setbackM) <= TOLERANCES.throatM,
      osmNodeIds: m.nodeIds, osmWayIds: data.rails.filter(r => r.tunnel && r.nodes.some(n => m.nodeIds.includes(n))).map(r => r.id) };
  });
  // The concourse needs the OSM station footprint; without one there is nothing to measure.
  const footprint = stationBuilding(data)?.pts;
  const concourse = footprint ? (() => {
    const canopy = concourseCanopy(data);
    const roof = buildConcourse(canopy, footprint, layout, data.buildings.filter(b => b.id === 46821177).map(b => b.pts)).getObjectByName('concourse-panels')!;
    const drawnNorthSouthM = round(meshExtent(roof, new THREE.Vector3(Math.sin(layout.heading), 0, -Math.cos(layout.heading))));
    return { drawnNorthSouthM, publishedOverallRoofM: 138, differenceM: round(drawnNorthSouthM - 138),
      withinTolerance: Math.abs(drawnNorthSouthM - 138) <= 3, fittedArcDiameterM: round(2 * canopy.radius),
      source: 'https://www.arup.com/globalassets/downloads/arup-journal/the-arup-journal-2012-issue-2.pdf#page=15',
      basis: 'Arup fig.6: overall north-south roof extent; compare actual roof mesh extent along the station axis, not twice the partial OSM arc fit. Funnel placement and roof section remain approximations.' };
  })() : null;
  const train = buildTrain('lner5');
  const car = train.children[1]!;
  const specLengthM = trainLayout('lner5').cars[1]!.length;
  const drawnCarLengthM = meshExtent(car, new THREE.Vector3(0, 0, 1));
  const station = new THREE.Group(); station.add(platformGroup, buildShed(layout));
  const throat = new THREE.Group(); if (railMesh) throat.add(railMesh.clone()); throat.add(portalGroup);
  const flags = [
    ...platforms.filter(p => !p.drawingBoundary.withinTolerance).map(p => ({ code: 'platform-drawing-boundary', detail: `Platform ${p.ref}: actual top boundary differs from approved drawing outline or is unavailable` })),
    ...platforms.filter(p => p.rawBoundary !== null && !p.rawBoundary.withinTolerance).map(p => ({ code: p.outlineInference ? 'platform-raw-boundary-inferred' : 'platform-raw-boundary', detail: `Platform ${p.ref}: sampled actual top boundary vs raw OSM ${p.rawBoundary!.drawnToReferenceM}/${p.rawBoundary!.referenceToDrawnM} m (drawn-to-raw/raw-to-drawn); ${p.outlineInference ? 'documented drawing inference, not a survey' : 'source consistency difference or missing source ring'}` })),
    ...(rawElements !== undefined && !railRegistration.withinTolerance ? [{ code: 'rail-source-registration', detail: `Compact rail node-ID plan registration against raw OSM exceeds ${TOLERANCES.throatM} m or has missing source nodes; maximum ${railRegistration.maxDistanceM} m` }] : []),
    ...tunnels.filter(t => t.sourceRegistration !== null && !t.sourceRegistration.withinTolerance).map(t => ({ code: 'mouth-source-registration', detail: `${t.id}: compact mouth boundary node-ID plan registration against raw OSM exceeds ${TOLERANCES.throatM} m or is missing; maximum ${t.sourceRegistration!.maxDistanceM} m` })),
    ...platforms.filter(p => !p.withinOsmTolerance).map(p => p.outlineInference
      ? { code: 'platform-outline-inferred', detail: `Platform ${p.ref}: drawn minus OSM ${p.drawnMinusOsmM} m by a documented inference, not a survey: ${p.outlineInference.source}` }
      : { code: 'platform-osm-tolerance', detail: `Platform ${p.ref}: drawn minus OSM ${p.drawnMinusOsmM} m` }),
    ...platforms.filter(p => p.withinPublishedTolerance === false).map(p => ({ code: 'platform-published-tolerance', detail: `Platform ${p.ref}: drawn minus published operational ${p.drawnMinusPublishedM} m exceeds 1 m; operational length and polygon extent differ in definition` })),
    ...platforms.filter(p => p.withinPublishedTolerance === null).map(p => ({ code: 'platform-published-missing', detail: `Platform ${p.ref}: no published operational length` })),
    ...(gaugeSamples.length < 3 ? [{ code: 'gauge-samples-missing', detail: `Only ${gaugeSamples.length} clear-track gauge samples; at least 3 required` }] : []),
    ...gaugeSamples.filter(p => !p.withinTolerance).map(p => ({ code: p.gaugeM === null ? 'gauge-hit-missing' : 'gauge-tolerance', detail: `Gauge at ${p.point.join(',')}: ${p.gaugeM ?? 'missing'} m` })),
    ...tunnels.filter(t => !t.withinThroatTolerance).map(t => ({ code: 'throat-tolerance', detail: `${t.id}: ${t.setbackM} m from OSM boundary` })),
    ...(Math.abs(drawnCarLengthM - specLengthM) > 0.001 ? [{ code: 'car-tolerance', detail: `26 m car extent ${drawnCarLengthM} m exceeds 1 mm tolerance` }] : []),
    ...(platforms.some(p => p.ref === '11') ? [{ code: 'platform-eleven-drawn', detail: 'Station surface platform 11 is drawn' }] : []),
    ...(concourse === null ? [{ code: 'concourse-missing', detail: 'No OSM station footprint, so the Western Concourse roof was not measured' }]
      : concourse.withinTolerance ? [] : [{ code: 'concourse-tolerance', detail: `Concourse N–S roof ${concourse.drawnNorthSouthM} m differs from Arup's 138 m by more than 3 m` }]),
  ];
  return { schemaVersion: 1, inputs, sourceRegistration, tolerances: TOLERANCES, flags,
    method: { independentSurvey: false, platforms: 'Actual platform-tops mesh vertex extent projected onto OSM long axis; same buildPlatforms as main.ts, per polygon. Published lengths are operational lengths, not polygon extents.',
      gauge: 'Samples selected before measuring where no other centreline is within 1.7 m (coincident parallel segments permitted); turnout crossings excluded. Horizontal rays from centreline at y=-0.007 onto actual merged rail mesh inner head faces; 2 mm tolerance allows Float32 and miter errors.',
      tunnels: 'Dominant actual brick mesh face plane vs OSM open/tunnel boundary nodes; terrain-mode face builder with flat ground; lid/flank terrain heights excluded.',
      boundary: 'Actual transformed top mesh triangle boundary vs approved drawing outline and, when provided, raw OSM way ring reprojected with core/project; bidirectional samples at <=2 m spacing, 1 m tolerance. Raw P9 inference difference remains explicit. Not an independent survey.',
      registration: 'When raw OSM is provided: compact rail nodes and mouth boundary nodes matched by original OSM node IDs, plan distance <=3 m. This checks source registration, not drawn rail or portal survey accuracy. Missing raw input is unavailable.',
      sources: 'Published dimensions and citations retained in core/station.ts; no independent source re-verification in this tool.' },
    platforms, gaugeSamples, tunnels, concourse,
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
    '', report.concourse === null ? 'Western Concourse overall N–S roof: not measured (no OSM station footprint). FLAG.'
      : `Western Concourse overall N–S roof: ${report.concourse.drawnNorthSouthM} m; Arup overall roof 138 m; difference ${report.concourse.differenceM} m; ${report.concourse.withinTolerance ? 'PASS' : 'FLAG'} at 3 m. Partial OSM arc fitted-circle diameter ${report.concourse.fittedArcDiameterM} m is a different measurement. [Source: Arup fig.6](${report.concourse.source}).`,
    '', `Raw OSM source registration: ${report.sourceRegistration.status}; maximum compact rail node-ID plan distance ${report.sourceRegistration.maxDistanceM ?? 'unavailable'} m; tolerance 3 m. Source consistency, not drawn survey accuracy.`,
    '', 'Platform sampled boundary agreement (drawn/reference directions, <=2 m interval, 1 m tolerance):',
    ...report.platforms.map(p => `- Platform ${p.ref}: approved drawing ${p.drawingBoundary.drawnToReferenceM}/${p.drawingBoundary.referenceToDrawnM} m, ${p.drawingBoundary.withinTolerance ? 'PASS' : 'FLAG'}; raw OSM ${p.rawBoundary ? `${p.rawBoundary.drawnToReferenceM}/${p.rawBoundary.referenceToDrawnM} m, ${p.rawBoundary.withinTolerance ? 'PASS' : 'FLAG'}` : 'unavailable'}${p.outlineInference ? '; documented outline inference remains explicit' : ''}.`),
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
/** A supplied extract must be explicit; malformed input must not become optional absence. */
export function rawExtractElements(value: unknown): RawElement[] {
  if (typeof value !== 'object' || value === null || !Array.isArray((value as { elements?: unknown }).elements)) throw new Error('raw OSM extract must contain an elements array');
  return (value as { elements: RawElement[] }).elements;
}
async function fingerprint(path: string) { return { path: relative(ROOT, path), sha256: createHash('sha256').update(await readFile(path)).digest('hex') }; }
async function main() {
  const args = process.argv.slice(2);
  let graph = resolve(ROOT, 'kings-cross-src/web/src/data/kx-track.json'); let out = OUTPUT; let rawPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (!['--graph', '--out', '--raw'].includes(args[i]!) || !args[i + 1]) throw new Error('usage: axis01-evidence.ts [--graph PATH] [--raw PATH] [--out .scratch/round21-geometry]');
    if (args[i] === '--graph') graph = resolve(args[++i]!); else if (args[i] === '--raw') rawPath = resolve(args[++i]!); else out = resolve(args[++i]!);
  }
  const rawElements = rawPath ? rawExtractElements(JSON.parse(await readFile(rawPath, 'utf8'))) : undefined;
  await mkdir(OUTPUT, { recursive: true });
  if (await realpath(out) !== await realpath(OUTPUT)) throw new Error('output must be worktree .scratch/round21-geometry');
  const sources = await Promise.all(['core/station.ts', 'core/scene.ts', 'core/landmarks.ts', 'web/src/furniture.ts', 'web/src/track.ts', 'web/src/portals.ts', 'web/src/train.ts', 'core/train.ts', 'web/src/main.ts', 'web/src/shed.ts', 'web/src/materials.ts', 'web/src/world.ts', 'tools/axis01-evidence.ts'].map(p => fingerprint(resolve(ROOT, 'kings-cross-src', p))));
  const report = createAxis01Report(JSON.parse(await readFile(graph, 'utf8')) as KxData, undefined, { graph: await fingerprint(graph), sources, ...(rawPath ? { raw: await fingerprint(rawPath) } : {}) }, rawElements);
  await writeFile(resolve(out, 'axis01-evidence.json'), JSON.stringify(report, null, 2) + '\n');
  const markdown = renderAxis01Markdown(report);
  await writeFile(resolve(out, 'axis01-evidence.md'), markdown);
  console.log(markdown);
  console.log(`Evidence written to ${relative(ROOT, out)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
