// Geometric-fidelity check: does the model say what OpenStreetMap says?
//
//   node tools/fidelity.ts --raw <overpass extract.json> [--json]
//
// The model is drawn from web/src/data/kx-track.json, which is the raw extract projected to a local
// metric frame about one origin and rounded to 0.1 m. This script measures the same things again
// from the RAW latitude and longitude, each platform in a frame about its own centre, so a slip
// in the projection, the rounding or the compaction shows up. It also prints the track gauge the
// model draws, the shed it builds, and the known disagreements with published figures.
//
// Exit status: 0 when every check is inside tolerance, 1 otherwise.
import { readFileSync } from 'node:fs';
import { railSegments, twinRails } from '../core/scene.ts';
import { GAUGE, RAIL_HEAD_WIDTH, SHED_LENGTH, concourseCanopy, longAxis, platformReport, shedLayout, stationPlatforms } from '../core/station.ts';
import type { RawElement } from '../core/osm.ts';
import type { KxData } from '../core/osm.ts';
import type { Pt } from '../core/geo.ts';

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

// Published lengths we could find. Blog figures quoting Google results: weak, shown for context.
const PUBLISHED: Record<string, { m: number; source: string }> = {
  '0': { m: 305, source: 'blog citing Google (weak)' },
  '1': { m: 304, source: 'blog citing Google (weak)' },
  '10': { m: 276, source: 'blog citing Google (weak)' },
};

const platformRows = platformReport(data).map((p) => {
  const e = rawById.get(p.osmId);
  const rawM = e?.geometry ? rawLength(e.geometry) : Number.NaN;
  const delta = p.lengthM - rawM;
  if (!(Math.abs(delta) <= PLATFORM_TOLERANCE_M)) failures.push(`platform ${p.ref}: model ${p.lengthM.toFixed(2)} m vs raw OSM ${rawM.toFixed(2)} m`);
  return { ref: p.ref, osmId: p.osmId, modelM: p.lengthM, rawM, deltaM: delta, widthM: p.meanWidthM, published: PUBLISHED[p.ref] };
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

const report = {
  platforms: platformRows,
  track: { rawM: rawTrack, modelM: modelTrack, deltaFraction: trackDelta },
  gaugeM: { standard: GAUGE, drawn: drawnGauge },
  shed: { widthM: shed.width, lengthM: shed.length, aisleM: shed.aisle, crownM: shed.crown, headingDeg: (shed.heading * 180) / Math.PI },
  concourse: { radiusM: canopy.radius, rmsM: canopy.rms, apexM: canopy.apex, rimM: canopy.rim },
  unresolvedOsmIssues: [
    'No platform 11: none exists since the 2021 remodel (old 11 became 10), so none is drawn. OSM and SMART agree.',
    'Platforms 0 and 1 are drawn about 338 m and 344 m long in OSM; the weak published figures are 305 m and 304 m. OSM probably includes the tapered northern ends.',
    'Platform 10 is drawn about 175 m long in OSM; the weak published figure is 276 m. Platforms 9 and 10 stop at the concourse in this model.',
    'The Western Concourse arc in OSM fits a circle of about 61-64 m radius; the published roof radius is 74 m. Position follows OSM, heights are the published ones.',
    'The shed footprint in OSM leans about 2.3 degrees east of north along its east edge; the platforms lean about 1.6 degrees. The shed follows the platforms.',
    'The published shed arch figures (105 ft clear span, 71 ft crown) leave a side aisle of about 4.1 m each side inside the 72 m OSM footprint. The aisle roofs are drawn flat at the springing height; that is an assumption.',
    'Rib spacing in the shed (6.1 m) and the shallow-dome profile of the concourse are assumptions; no published figure was found.',
  ],
};

if (args.includes('--json')) {
  console.log(JSON.stringify({ ...report, failures }, null, 2));
} else {
  console.log('PLATFORM LENGTHS (m): model from the compact data, raw from OSM latitude/longitude');
  console.log('ref  OSM way      model     raw    delta   width  published');
  for (const r of platformRows) {
    const pub = r.published ? `${r.published.m} (${r.published.source}; model differs by ${(r.modelM - r.published.m).toFixed(0)})` : '-';
    console.log(`${r.ref.padStart(3)}  ${String(r.osmId).padEnd(11)} ${r.modelM.toFixed(1).padStart(6)}  ${r.rawM.toFixed(1).padStart(6)}  ${r.deltaM.toFixed(2).padStart(6)}  ${r.widthM.toFixed(1).padStart(5)}  ${pub}`);
  }
  console.log(`\nTRACK: model ${modelTrack.toFixed(0)} m, raw ${rawTrack.toFixed(0)} m, difference ${(trackDelta * 100).toFixed(3)} %`);
  console.log(`GAUGE: standard ${GAUGE} m, drawn ${drawnGauge.toFixed(4)} m between rail faces (rail head ${RAIL_HEAD_WIDTH * 1000} mm)`);
  console.log(`SHED:  ${shed.width.toFixed(1)} m wide x ${shed.length.toFixed(1)} m long, crown ${shed.crown.toFixed(1)} m, aisles ${shed.aisle.toFixed(1)} m, heading ${report.shed.headingDeg.toFixed(2)} deg`);
  console.log(`CONCOURSE: radius ${canopy.radius.toFixed(1)} m (rms ${canopy.rms.toFixed(1)} m), apex ${canopy.apex} m, rim ${canopy.rim} m`);
  console.log('\nUNRESOLVED OSM ISSUES');
  for (const i of report.unresolvedOsmIssues) console.log(` - ${i}`);
  console.log(failures.length === 0 ? '\nOK: every check is inside tolerance' : `\nFAIL:\n${failures.map((f) => ` - ${f}`).join('\n')}`);
}
process.exit(failures.length === 0 ? 0 : 1);
