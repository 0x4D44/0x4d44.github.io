// Geometric-fidelity check: compare compact and raw OSM extents, drawn meshes and published dimensions.
//
//   node tools/fidelity.ts --raw <overpass extract.json> [--json]
//
// The model is drawn from web/src/data/kx-track.json, which is the raw extract projected to a local
// metric frame about one origin and rounded to 0.1 m. This script measures the same things again
// from the RAW latitude and longitude, each platform in a frame about its own centre, so a slip
// in the projection, the rounding or the compaction shows up. It also prints the track gauge the
// model draws, the shed it builds, and the known disagreements with published figures.
//
// Exit status covers compact/raw OSM, track-length, arithmetic gauge and shed checks. Axis01 mesh flags are reported separately.
import { readFileSync } from 'node:fs';
import { railSegments, twinRails } from '../core/scene.ts';
import { GAUGE, KINGS_CROSS_PLATFORM_LENGTHS_M, RAIL_HEAD_WIDTH, SHED_LENGTH, concourseCanopy, longAxis, platformReport, shedLayout, stationPlatforms } from '../core/station.ts';
import type { RawElement } from '../core/osm.ts';
import type { KxData } from '../core/osm.ts';
import type { Pt } from '../core/geo.ts';
import { createAxis01Report } from './axis01-evidence.ts';

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const rawPath = flag('--raw');
if (!rawPath) {
  console.error('usage: node tools/fidelity.ts --raw <overpass extract.json> [--json]');
  process.exit(2);
}
const raw: RawElement[] = JSON.parse(readFileSync(rawPath, 'utf8')).elements;
const data: KxData = JSON.parse(readFileSync(new URL('../web/src/data/kx-track.json', import.meta.url), 'utf8'));

const RAD = Math.PI / 180;
const R = 6_371_008.8;
const PLATFORM_TOLERANCE_M = 1.0; // rubric: platforms to within about 1 m
const TRACK_TOLERANCE = 0.005; // total track length, fraction

/** Great-circle distance, metres. Independent of the model's equirectangular frame. */
function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Length of a raw polygon's long axis, in a metric frame centred on the polygon itself. */
function rawLength(geometry: { lat: number; lon: number }[]): number {
  const lat0 = geometry.reduce((s, g) => s + g.lat, 0) / geometry.length;
  const lon0 = geometry.reduce((s, g) => s + g.lon, 0) / geometry.length;
  // Scale each axis from true great-circle distances, not from a formula the model also uses.
  const mPerLat = haversine({ lat: lat0, lon: lon0 }, { lat: lat0 + 0.001, lon: lon0 }) / 0.001;
  const mPerLon = haversine({ lat: lat0, lon: lon0 }, { lat: lat0, lon: lon0 + 0.001 }) / 0.001;
  const ring: Pt[] = geometry.map((g) => [(g.lon - lon0) * mPerLon, -(g.lat - lat0) * mPerLat]);
  if (ring.length > 1) {
    const f = ring[0] as Pt;
    const l = ring[ring.length - 1] as Pt;
    if (f[0] === l[0] && f[1] === l[1]) ring.pop();
  }
  return longAxis(ring).length;
}

const failures: string[] = [];

// ---- platforms ----------------------------------------------------------------------------
const rawById = new Map<number, RawElement>();
for (const e of raw) if (e.type === 'way' && e.tags?.railway === 'platform') rawById.set(e.id, e);

const PUBLISHED_LENGTH_SOURCE = {
  citation: 'Network Rail LNE (NCS) Sectional Appendix, September 2026, PDF p.110 / printed p.44 (table dated February 2021)',
  url: 'https://sacuksprodnrdigital0001.blob.core.windows.net/sectional-appendix/Sectional%20Appendix%20full%20PDFs%20September%2026/London%20North%20Eastern%20%28NCS%29%20Sectional%20Appendix%20September%202026.pdf#page=110',
  basis: 'Published operational lengths, not full polygon extents. Stopping clearance is reserved separately; these figures do not locate the buffers.',
};
const PUBLISHED: Record<string, { m: number; source: string }> = Object.fromEntries(
  Object.entries(KINGS_CROSS_PLATFORM_LENGTHS_M).map(([ref, m]) => [ref, { m, source: PUBLISHED_LENGTH_SOURCE.citation }]),
);
const axis01 = createAxis01Report(data);
const drawnPlatforms = new Map(axis01.platforms.map((p) => [p.ref, p]));

const platformRows = platformReport(data).map((p) => {
  const e = rawById.get(p.osmId);
  const rawM = e?.geometry ? rawLength(e.geometry) : Number.NaN;
  const delta = p.lengthM - rawM;
  if (!(Math.abs(delta) <= PLATFORM_TOLERANCE_M)) failures.push(`platform ${p.ref}: compact OSM ${p.lengthM.toFixed(2)} m vs raw OSM ${rawM.toFixed(2)} m`);
  const drawn = drawnPlatforms.get(p.ref);
  const published = PUBLISHED[p.ref];
  return {
    ref: p.ref, osmId: p.osmId,
    modelM: p.lengthM, // Compatibility alias; this is compact OSM geometry, not the drawn mesh.
    compactOsmM: p.lengthM, rawM, deltaM: delta, widthM: p.meanWidthM,
    drawnMeshM: drawn?.drawnLengthM ?? null,
    drawnMinusPublishedM: drawn?.drawnMinusPublishedM ?? null,
    drawingInference: drawn?.outlineInference ?? null,
    published,
  };
});

// every platform 0-10 present once, and no eleventh
const refs = [...stationPlatforms(data).keys()].sort((a, b) => Number(a) - Number(b));
if (refs.join(',') !== '0,1,2,3,4,5,6,7,8,9,10') failures.push(`platform set is ${refs.join(',')}`);

// ---- track ---------------------------------------------------------------------------------
const nodeById = new Map<number, { lat: number; lon: number }>();
for (const e of raw) {
  if (e.type === 'node' && e.lat !== undefined && e.lon !== undefined) nodeById.set(e.id, { lat: e.lat, lon: e.lon });
  if (e.type === 'way' && e.nodes && e.geometry) e.nodes.forEach((n, i) => e.geometry?.[i] && nodeById.set(n, e.geometry[i] as { lat: number; lon: number }));
}
let rawTrack = 0;
for (const r of data.rails) {
  for (let i = 0; i + 1 < r.nodes.length; i++) {
    const a = nodeById.get(r.nodes[i] as number);
    const b = nodeById.get(r.nodes[i + 1] as number);
    if (a && b) rawTrack += haversine(a, b);
  }
}
const seg = railSegments(data);
let modelTrack = 0;
for (const bucket of [seg.main, seg.siding, seg.tunnel]) {
  for (let i = 0; i + 5 < bucket.length; i += 6) modelTrack += Math.hypot((bucket[i + 3] as number) - (bucket[i] as number), (bucket[i + 5] as number) - (bucket[i + 2] as number));
}
const trackDelta = (modelTrack - rawTrack) / rawTrack;
if (!(Math.abs(trackDelta) <= TRACK_TOLERANCE)) failures.push(`total track length: model ${modelTrack.toFixed(0)} m vs raw ${rawTrack.toFixed(0)} m (${(trackDelta * 100).toFixed(2)} %)`);

// gauge as drawn: distance between the two rails of a segment, less one rail head, is the gauge
const twin = twinRails(seg.main.slice(0, 6));
const spacing = Math.hypot((twin[0] as number) - (twin[6] as number), (twin[2] as number) - (twin[8] as number));
const drawnGauge = spacing - RAIL_HEAD_WIDTH;
if (Math.abs(drawnGauge - 1.435) > 0.001) failures.push(`drawn gauge ${drawnGauge.toFixed(4)} m, want 1.435 m`);

// ---- shed and concourse --------------------------------------------------------------------
const shed = shedLayout(data);
const canopy = concourseCanopy(data);
if (shed.length !== SHED_LENGTH) failures.push('shed length is not 800 ft');

const drawingInferences = axis01.platforms.flatMap((p) => p.outlineInference ? [{
  ref: p.ref,
  osmId: p.osmId,
  compactOsmM: p.osmLongAxisM,
  drawnMeshM: p.drawnLengthM,
  publishedOperationalM: p.publishedOperationalLengthM,
  inference: 'The north cap is reconstructed along mapped OSM rail from the assumed buffer node to the published operational length.',
  independentSurvey: false,
  source: p.outlineInference.source,
  limitation: 'This is a documented drawing inference, not a survey of the physical cap or buffer position.',
}] : []);

const report = {
  platforms: platformRows,
  publishedLengthSource: PUBLISHED_LENGTH_SOURCE,
  platformMeasurementBasis: {
    compactOsmM: 'Long-axis extent of the rounded compact OSM platform polygon; modelM is a compatibility alias for this value.',
    rawM: 'Long-axis extent recomputed from the supplied raw OSM latitude and longitude geometry using great-circle distance.',
    drawnMeshM: 'Actual platform-top mesh extent from the web platform builder, measured on the OSM long axis by tools/axis01-evidence.ts.',
    publishedOperationalM: PUBLISHED_LENGTH_SOURCE.basis,
  },
  drawingInferences,
  track: { rawM: rawTrack, modelM: modelTrack, deltaFraction: trackDelta },
  gaugeM: {
    standard: GAUGE,
    drawn: drawnGauge,
    method: 'Arithmetic from twinRails segment spacing minus rail-head width; not an actual mesh-ray measurement.',
  },
  axis01Evidence: {
    source: 'Actual mesh evidence from tools/axis01-evidence.ts; these flags are separate from this CLI exit status.',
    method: axis01.method,
    flags: axis01.flags,
  },
  shed: { widthM: shed.width, lengthM: shed.length, aisleM: shed.aisle, crownM: shed.crown, headingDeg: (shed.heading * 180) / Math.PI },
  concourse: {
    radiusM: canopy.radius, // Compatibility alias; this fits only the partial OSM arc.
    partialOsmArcFitRadiusM: canopy.radius, rmsM: canopy.rms, apexM: canopy.apex, rimM: canopy.rim,
    drawnNorthSouthM: axis01.concourse?.drawnNorthSouthM ?? null,
    publishedOverallRoofM: axis01.concourse?.publishedOverallRoofM ?? null,
    drawnMinusPublishedM: axis01.concourse?.differenceM ?? null,
    withinPublishedTolerance: axis01.concourse?.withinTolerance ?? null,
    drawnMeshSource: 'Actual concourse roof mesh extent measured by tools/axis01-evidence.ts against Arup fig.6 overall roof extent.',
  },
  unresolvedOsmIssues: [
    'OSM polygon extents describe mapped physical footprints; the cited published figures are operational lengths. They differ in definition, reserve stopping clearance separately and do not locate buffers.',
    'No independent survey validates the OSM footprint vertices, track or platform levels, buffer positions, or the mesh built from those inputs; agreement between compact and raw OSM is not survey evidence.',
    'Platform 9 north-cap geometry is a documented inference from the published 176 m operational length along mapped OSM rail from assumed buffer node 822146067; it is not a surveyed physical endpoint.',
    'The station plan geometry does not establish vertical track gradients or platform elevations; the drawn ground and platform levels are simplified model assumptions.',
    'The canal edge, water level and adjacent terrain are not independently surveyed or validated by this station plan geometry.',
    'The concourse circle fit uses only a partial OSM arc; its radius is not the overall roof radius. The separate drawn north-south roof extent is compared with Arup’s 138 m overall dimension.',
    'The shed footprint in OSM leans about 2.3 degrees east of north along its east edge; the platforms lean about 1.6 degrees. The shed follows the platforms.',
    'The published shed arch figures (105 ft clear span, 71 ft crown) leave a side aisle of about 4.1 m each side inside the 72 m OSM footprint. The aisle roofs are drawn flat at the springing height; that is an assumption.',
    'Rib spacing in the shed (6.1 m), funnel placement and the shallow-dome section of the concourse remain approximations; no complete published section was found.',
  ],
};

if (args.includes('--json')) {
  console.log(JSON.stringify({ ...report, failures }, null, 2));
} else {
  console.log('PLATFORM LENGTHS (m): compact and raw OSM polygon extents, actual drawn mesh, and operational length');
  console.log('ref  OSM way      compact     raw   Δcompact   drawn  width  published operational');
  for (const r of platformRows) {
    const pub = r.published ? `${r.published.m}` : '-';
    const drawn = r.drawnMeshM === null ? '-' : r.drawnMeshM.toFixed(1);
    console.log(`${r.ref.padStart(3)}  ${String(r.osmId).padEnd(11)} ${r.compactOsmM.toFixed(1).padStart(7)}  ${r.rawM.toFixed(1).padStart(6)}  ${r.deltaM.toFixed(2).padStart(8)}  ${drawn.padStart(6)}  ${r.widthM.toFixed(1).padStart(5)}  ${pub}`);
  }
  console.log(`Published source: ${PUBLISHED_LENGTH_SOURCE.citation}; ${PUBLISHED_LENGTH_SOURCE.url}`);
  console.log(`Basis: ${PUBLISHED_LENGTH_SOURCE.basis}`);
  console.log('Compact and raw columns are polygon extents; drawn is the actual mesh axis01-evidence measurement; published values are operational lengths.');
  for (const p of drawingInferences) console.log(`P${p.ref} DRAWING INFERENCE: ${p.inference} ${p.limitation} Source: ${p.source}`);
  console.log(`\nTRACK: model ${modelTrack.toFixed(0)} m, raw ${rawTrack.toFixed(0)} m, difference ${(trackDelta * 100).toFixed(3)} %`);
  console.log(`GAUGE (twinRails arithmetic, not mesh rays): standard ${GAUGE} m, derived ${drawnGauge.toFixed(4)} m between rail faces (rail head ${RAIL_HEAD_WIDTH * 1000} mm)`);
  console.log(`SHED:  ${shed.width.toFixed(1)} m wide x ${shed.length.toFixed(1)} m long, crown ${shed.crown.toFixed(1)} m, aisles ${shed.aisle.toFixed(1)} m, heading ${report.shed.headingDeg.toFixed(2)} deg`);
  console.log(`CONCOURSE OSM ARC FIT: ${canopy.radius.toFixed(1)} m radius (partial arc only; rms ${canopy.rms.toFixed(1)} m)`);
  console.log(`CONCOURSE DRAWN ROOF: ${report.concourse.drawnNorthSouthM?.toFixed(3) ?? 'not measured'} m N–S vs ${report.concourse.publishedOverallRoofM ?? 'no published'} m overall roof; difference ${report.concourse.drawnMinusPublishedM?.toFixed(3) ?? 'n/a'} m`);
  console.log(`\nAXIS01 ACTUAL-MESH EVIDENCE FLAGS (${axis01.flags.length}); separate from the exit status`);
  for (const flag of axis01.flags) console.log(` - ${flag.code}: ${flag.detail}`);
  console.log('\nUNRESOLVED OSM ISSUES');
  for (const i of report.unresolvedOsmIssues) console.log(` - ${i}`);
  console.log(failures.length === 0
    ? '\nOK: compact/raw OSM platform and track comparisons, arithmetic gauge and shed dimensions are inside their tolerances; Axis01 actual-mesh flags are reported separately.'
    : `\nFAIL:\n${failures.map((f) => ` - ${f}`).join('\n')}`);
}
process.exit(failures.length === 0 ? 0 : 1);
