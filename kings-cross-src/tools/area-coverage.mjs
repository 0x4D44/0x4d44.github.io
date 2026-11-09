// Offline, private SMART/recording evidence. This never connects to a relay or feed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lstat, mkdir, readFile, readdir, realpath, open } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { validTdEvent } from '../relay/td.mjs';
import { areaDataDir } from '../relay/areas.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const stations = { WH: 'STPANCRAS', X0: 'STPANCA&B', CT: 'STPANCINT', EB: 'EDINBURGH' };
const text = value => String(value ?? '').trim();
const sorted = values => [...values].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (base, target) => { const rel = path.relative(base, target); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };

export function smartCandidates(rows, area) {
  const selected = rows.filter(row => text(row.TD) === area && text(row.STANME) === stations[area]);
  const endpoints = new Set(), platform = new Map(), areaEndpoints = new Set();
  for (const row of rows.filter(row => text(row.TD) === area)) {
    for (const id of [row.FROMBERTH, row.TOBERTH].map(text)) if (/^[A-Z0-9]{4}$/.test(id)) areaEndpoints.add(id);
  }
  for (const row of selected) {
    for (const id of [row.FROMBERTH, row.TOBERTH].map(text)) if (/^[A-Z0-9]{4}$/.test(id)) endpoints.add(id);
    const event = text(row.EVENT), p = text(row.PLATFORM);
    const id = text(['A', 'C'].includes(event) ? row.TOBERTH : ['B', 'D'].includes(event) ? row.FROMBERTH : '');
    if (!p || !/^[A-Z0-9]{4}$/.test(id)) continue;
    const key = `${p}:${event}:${id}`;
    platform.set(key, { platform: p, event, berth: id, role: ['A', 'C'].includes(event) ? 'arrival' : 'departure' });
  }
  return { station: stations[area], rows: selected.length, endpoints, areaEndpoints,
    associations: [...platform.values()].sort((a, b) => `${a.platform}:${a.event}:${a.berth}`.localeCompare(`${b.platform}:${b.event}:${b.berth}`, 'en', { numeric: true })) };
}

export function analyzeCoverage(rows, area, candidates) {
  const observed = new Map(), snapshotBerths = new Map(), sAddresses = new Set(), snapshotAddresses = new Set();
  const counts = {}, headcodes = new Set();
  let invalidRows = 0, otherAreaRows = 0, firstMs = null, lastMs = null;
  const touch = (map, berth, descr) => {
    if (!map.has(berth)) map.set(berth, { events: 0, headcodes: new Set() });
    const entry = map.get(berth); entry.events++; entry.headcodes.add(descr);
  };
  for (const row of rows) {
    const e = row?.e;
    if (!Number.isFinite(row?.t) || !e || typeof e !== 'object') { invalidRows++; continue; }
    if (e.area !== area) { otherAreaRows++; continue; }
    if (e.kind === 'snapshot') {
      if (!e.berths || typeof e.berths !== 'object' || Array.isArray(e.berths)) { invalidRows++; continue; }
      for (const [id, descr] of Object.entries(e.berths)) if (/^[A-Z0-9]{4}$/.test(id) && typeof descr === 'string' && descr.length === 4) touch(snapshotBerths, id, descr);
      for (const address of Object.keys(e.sclass?.data ?? {})) snapshotAddresses.add(address.toUpperCase());
    } else if (e.kind !== 'trust' && !validTdEvent(e)) { invalidRows++; continue; }
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    firstMs = firstMs === null ? row.t : Math.min(firstMs, row.t);
    lastMs = lastMs === null ? row.t : Math.max(lastMs, row.t);
    if (['step', 'interpose', 'cancel'].includes(e.kind)) {
      headcodes.add(e.descr);
      for (const id of new Set([e.from, e.to].filter(Boolean))) touch(observed, id, e.descr);
    }
    if (e.kind === 'sclass') {
      for (let i = 0; i < e.data.length / 2; i++) sAddresses.add((parseInt(e.address, 16) + i).toString(16).toUpperCase().padStart(4, '0'));
    }
  }
  const associations = candidates.associations.map(a => ({ ...a, observedEvents: observed.get(a.berth)?.events ?? 0,
    snapshotObservations: snapshotBerths.get(a.berth)?.events ?? 0,
    headcodes: sorted(new Set([...(observed.get(a.berth)?.headcodes ?? []), ...(snapshotBerths.get(a.berth)?.headcodes ?? [])])),
    snapshotOnly: !observed.has(a.berth) && snapshotBerths.has(a.berth) }));
  const platformIds = new Set(associations.map(a => a.berth));
  const snapshotHeadcodes = new Set([...snapshotBerths.values()].flatMap(b => [...b.headcodes]));
  return { area, station: candidates.station, window: { firstMs, lastMs }, counts, invalidRows, otherAreaRows,
    headcodes: sorted(new Set([...headcodes, ...snapshotHeadcodes])), eventHeadcodes: sorted(headcodes), snapshotHeadcodes: sorted(snapshotHeadcodes),
    smart: { rows: candidates.rows, stationEndpointCount: candidates.endpoints.size,
      platformCandidateCount: platformIds.size, platformAssociations: associations,
      eventObservedPlatformCandidateCount: [...platformIds].filter(id => observed.has(id)).length,
      snapshotOnlyPlatformCandidateCount: [...platformIds].filter(id => !observed.has(id) && snapshotBerths.has(id)).length,
      missingPlatformCandidates: sorted([...platformIds].filter(id => !observed.has(id) && !snapshotBerths.has(id))),
      missingEventPlatformCandidates: sorted([...platformIds].filter(id => !observed.has(id))),
      observedStationEndpoints: sorted([...new Set([...observed.keys(), ...snapshotBerths.keys()])].filter(id => candidates.endpoints.has(id))) },
    observedBerths: sorted(observed.keys()).map(id => ({ berth: id, events: observed.get(id).events,
      headcodes: sorted(observed.get(id).headcodes), stationCandidate: candidates.endpoints.has(id), platformCandidate: platformIds.has(id) })),
    unmappedToStationCandidates: sorted([...observed.keys()].filter(id => !candidates.endpoints.has(id))),
    absentFromAreaSmart: sorted([...observed.keys()].filter(id => !candidates.areaEndpoints.has(id))),
    snapshotOnlyBerths: sorted([...snapshotBerths.keys()].filter(id => !observed.has(id))),
    sclass: { messages: counts.sclass ?? 0, byteAddresses: sorted(sAddresses), snapshotAddresses: sorted(snapshotAddresses),
      semantics: 'Address receipt only; no signal position, aspect or decoding established.' } };
}

// Refuse every symlink component, including .scratch itself. Final writes are
// exclusive (wx), so an existing output file or file symlink cannot be followed.
export async function ensureScratchOutput(out, repoRoot = root) {
  const physicalRoot = await realpath(repoRoot), scratch = path.join(physicalRoot, '.scratch');
  const target = path.resolve(out);
  if (!inside(scratch, target)) throw new Error('--out must be within worktree-root .scratch');
  let current = physicalRoot;
  for (const component of path.relative(physicalRoot, target).split(path.sep)) {
    current = path.join(current, component);
    try { await mkdir(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('--out must contain only real directories, no symlinks');
  }
  if (!inside(scratch, await realpath(target))) throw new Error('--out resolves outside worktree-root .scratch');
  return target;
}

export function markdown(report) {
  return `# Private area coverage\n\nOffline observation, not evidence of complete service or validated metric anchors. SMART A/C selects TOBERTH; B/D selects FROMBERTH. Platform associations are candidates, including conflicts. Blank platforms stay unresolved (including X0 A/B). Snapshots do not count as current C-class delivery. Unmapped means outside the selected station candidates, not necessarily a bad berth.\n\n| Area | SMART platform candidates | Observed platform candidates | C-class events | S-class messages | Unmapped to station |\n|---|---:|---:|---:|---:|---:|\n${report.areas.map(r => `| ${r.area} | ${r.smart.platformCandidateCount} | ${r.smart.platformCandidateCount - r.smart.missingPlatformCandidates.length} | ${(r.counts.step ?? 0) + (r.counts.cancel ?? 0) + (r.counts.interpose ?? 0)} | ${r.sclass.messages} | ${r.unmappedToStationCandidates.length} |`).join('\n')}\n\nFull platform/headcode alternatives, source hashes, file windows, discarded partial tails and missing candidates are in area-coverage.json. Zero events means no observation in these inputs; it does not prove no feed exists. S-class receipt establishes no aspects.\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--data-dir', '--smart', '--out'].includes(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--') || args.has(argv[i])) throw new Error('usage: area-coverage.mjs --data-dir <private-relay-data> --smart <smart.json.gz> --out <worktree-root/.scratch/dir>');
    args.set(argv[i], argv[i + 1]);
  }
  if (args.size !== 3) throw new Error('--data-dir, --smart and --out are required');
  const out = await ensureScratchOutput(args.get('--out'));
  const smartBytes = await readFile(args.get('--smart'));
  const smart = JSON.parse(gunzipSync(smartBytes));
  if (!Array.isArray(smart.BERTHDATA) || smart.BERTHDATA.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error('SMART must contain BERTHDATA objects');
  const sources = [], areas = [];
  for (const area of Object.keys(stations)) {
    const files = new Set(), rows = [];
    for (const dir of new Set([path.join(args.get('--data-dir'), 'recordings'), path.join(areaDataDir(args.get('--data-dir'), area), 'recordings')])) {
      let names;
      try { names = await readdir(dir); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      for (const name of names.filter(name => new RegExp(`^td-${area}-\\d{8}\\.ndjson$`).test(name))) files.add(await realpath(path.join(dir, name)));
    }
    for (const file of sorted(files)) {
      const bytes = await readFile(file), end = bytes.lastIndexOf(10) + 1;
      let malformedLines = 0;
      for (const line of bytes.subarray(0, end).toString('utf8').split('\n').filter(Boolean)) {
        try { rows.push(JSON.parse(line)); } catch { malformedLines++; }
      }
      sources.push({ area, file, bytes: bytes.length, completeBytes: end, ignoredTailBytes: bytes.length - end, malformedLines, sha256: sha(bytes) });
    }
    areas.push({ ...analyzeCoverage(rows, area, smartCandidates(smart.BERTHDATA, area)), recordingFiles: files.size });
  }
  const report = { generatedAt: new Date().toISOString(), private: true, smartSha256: sha(smartBytes), sources, areas };
  for (const [name, body] of [['area-coverage.json', JSON.stringify(report, null, 2) + '\n'], ['area-coverage.md', markdown(report)]]) {
    const file = await open(path.join(out, name), 'wx', 0o600);
    try { await file.writeFile(body); } finally { await file.close(); }
  }
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`area-coverage: ${error.message}`); process.exitCode = 1; });
