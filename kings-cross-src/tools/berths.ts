// Derive berth anchors and a private evidence report from TD recordings and SMART data.
//
//   node tools/berths.ts --recording <td.ndjson> [--recording <td.ndjson> ...]
//     --smart <smart.json.gz> --out ../.scratch/berths
//
// Reports contain private evidence from local recordings; outputs stay inside .scratch or KX_DATA_DIR.
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { NOT_A_TRAIN } from '../core/anchors.ts';
import { buildGraph } from '../core/graph.ts';
import { unproject } from '../core/geo.ts';
import { analyseSteps, auditBerths, buildAnchors, describeEvidence, leaveOneOut, reviewGeographicEvidence } from '../core/berths.ts';
import type { BerthAudit, RecordingEvent, SignalTrial, SmartRow } from '../core/berths.ts';
import type { AnchorKind, AnchorMap, UnmappedReason } from '../core/anchors.ts';
import type { KxData } from '../core/osm.ts';

interface CliArgs {
  recordings: string[];
  smart: string;
  out: string;
  previous?: string;
  graph?: string;
  geographicEvidence?: string;
  preservePositions: boolean;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const repoRoot = path.resolve(packageRoot, '..');
const KINDS: AnchorKind[] = ['platform', 'signal', 'smart', 'inferred'];
const UNMAPPED_REASONS: UnmappedReason[] = ['outside-network', 'no-evidence', 'conflict'];

function parseArgs(argv: string[]): CliArgs {
  const recordings: string[] = [];
  let smart: string | undefined;
  let out: string | undefined;
  let previous: string | undefined;
  let graph: string | undefined;
  let geographicEvidence: string | undefined;
  let preservePositions = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--preserve-positions') {
      if (preservePositions) throw new Error('--preserve-positions may be given once');
      preservePositions = true;
      continue;
    }
    if (flag !== '--recording' && flag !== '--smart' && flag !== '--out' && flag !== '--previous' && flag !== '--graph' && flag !== '--geographic-evidence') {
      throw new Error(`unknown option ${flag ?? ''}; ${usage()}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} needs a path; ${usage()}`);
    i += 1;
    if (flag === '--recording') recordings.push(value);
    else if (flag === '--smart') {
      if (smart !== undefined) throw new Error('--smart may be given once');
      smart = value;
    } else if (flag === '--previous') {
      if (previous !== undefined) throw new Error('--previous may be given once');
      previous = value;
    } else if (flag === '--geographic-evidence') {
      if (geographicEvidence !== undefined) throw new Error('--geographic-evidence may be given once');
      geographicEvidence = value;
    } else if (flag === '--graph') {
      if (graph !== undefined) throw new Error('--graph may be given once');
      graph = value;
    } else {
      if (out !== undefined) throw new Error('--out may be given once');
      out = value;
    }
  }

  if (recordings.length === 0 || !smart || !out) throw new Error(usage());
  if (preservePositions && !previous) throw new Error('--preserve-positions requires --previous');
  return { recordings, smart, out, previous, graph, geographicEvidence, preservePositions };
}

function usage(): string {
  return 'usage: node tools/berths.ts --recording <td.ndjson> [--recording <td.ndjson> ...] --smart <smart.json.gz> --out <dir-inside-worktree-.scratch-or-KX_DATA_DIR> [--previous <anchors.json>] [--preserve-positions] [--graph <kx-track.json>] [--geographic-evidence <overpass.json>]';
}

function isWithinOrEqual(parent: string, candidate: string): boolean {
  const rel = path.relative(parent, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function ensureOutputDirectory(outArg: string): Promise<string> {
  const physicalRepoRoot = await realpath(repoRoot);
  const scratchPath = path.join(physicalRepoRoot, '.scratch');

  try {
    const scratchStat = await lstat(scratchPath);
    if (scratchStat.isSymbolicLink()) throw new Error('worktree .scratch must not be a symlink');
    if (!scratchStat.isDirectory()) throw new Error('worktree .scratch is not a directory');
  } catch (error) {
    if (!isMissing(error)) throw error;
    await mkdir(scratchPath);
  }

  const scratchReal = await realpath(scratchPath);
  if (!isWithinOrEqual(physicalRepoRoot, scratchReal)) throw new Error('worktree .scratch resolves outside the worktree');

  const configuredDataRoot = process.env.KX_DATA_DIR;
  if (configuredDataRoot !== undefined && configuredDataRoot.trim() === '') throw new Error('KX_DATA_DIR must name a directory');
  const dataRootPath = path.resolve(configuredDataRoot ?? path.join(homedir(), 'kx-data'));
  let dataRootReal: string | undefined;
  try {
    const dataRootStat = await lstat(dataRootPath);
    if (dataRootStat.isSymbolicLink()) throw new Error('KX_DATA_DIR must not be a symlink');
    if (!dataRootStat.isDirectory()) throw new Error('KX_DATA_DIR is not a directory');
    dataRootReal = await realpath(dataRootPath);
    if (isWithinOrEqual(physicalRepoRoot, dataRootReal) && !isWithinOrEqual(scratchReal, dataRootReal)) {
      throw new Error('KX_DATA_DIR must be outside the worktree or inside its .scratch directory');
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
    if (isWithinOrEqual(physicalRepoRoot, dataRootPath) && !isWithinOrEqual(scratchReal, dataRootPath)) {
      throw new Error('KX_DATA_DIR must be outside the worktree or inside its .scratch directory');
    }
  }

  const physicalCwd = await realpath(process.cwd());
  const outPath = path.resolve(path.isAbsolute(outArg) ? outArg : path.join(physicalCwd, outArg));
  const allowedRoots = [scratchReal, ...(dataRootReal ? [dataRootReal] : [])];
  const allowedRoot = allowedRoots
    .filter((root) => isWithinOrEqual(root, outPath))
    .sort((a, b) => b.length - a.length)[0];
  if (!allowedRoot) throw new Error(`output directory must be inside ${allowedRoots.join(' or ')}`);

  const relative = path.relative(allowedRoot, outPath);
  let current = allowedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) throw new Error(`output path contains a symlink: ${current}`);
      if (!entry.isDirectory()) throw new Error(`output path component is not a directory: ${current}`);
    } catch (error) {
      if (!isMissing(error)) throw error;
      await mkdir(current);
    }
    const actual = await realpath(current);
    if (!isWithinOrEqual(allowedRoot, actual)) throw new Error(`output path resolves outside allowed root ${allowedRoot}`);
  }

  return await realpath(outPath);
}

async function checkOutputFile(outDir: string, name: string): Promise<void> {
  const target = path.join(outDir, name);
  try {
    const entry = await lstat(target);
    if (entry.isSymbolicLink()) throw new Error(`refusing to write through output symlink: ${target}`);
    if (!entry.isFile()) throw new Error(`output path is not a regular file: ${target}`);
    if (entry.nlink > 1) throw new Error(`refusing to overwrite multiply-linked output file: ${target}`);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

async function inputPath(value: string): Promise<string> {
  const absolute = path.resolve(value);
  return await realpath(absolute);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validatePreviousMap(value: unknown, source: string): AnchorMap {
  if (!isObject(value) || value.area !== 'Y9' || !Array.isArray(value.anchors) || !Array.isArray(value.unmapped)) {
    throw new Error(`${source} must contain a Y9 AnchorMap`);
  }
  for (const anchor of value.anchors) {
    if (!isObject(anchor) || typeof anchor.berth !== 'string' || !KINDS.includes(anchor.kind as AnchorKind)) {
      throw new Error(`${source} has an invalid anchors entry`);
    }
  }
  for (const unmapped of value.unmapped) {
    if (!isObject(unmapped) || typeof unmapped.berth !== 'string' || !UNMAPPED_REASONS.includes(unmapped.reason as UnmappedReason)) {
      throw new Error(`${source} has an invalid unmapped entry`);
    }
  }
  return value as unknown as AnchorMap;
}

async function readPreviousMap(file: string): Promise<AnchorMap> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new Error(`${path.basename(file)} is not readable JSON`);
  }
  return validatePreviousMap(parsed, path.basename(file));
}

interface StepCoverage {
  valid: number;
  destinationAnchored: number;
  bothEndsAnchored: number;
}

function observedStepCoverage(recordings: RecordingEvent[][], map: AnchorMap): StepCoverage {
  const anchored = new Set(map.anchors.map((anchor) => anchor.berth));
  const coverage = { valid: 0, destinationAnchored: 0, bothEndsAnchored: 0 };
  for (const recording of recordings) {
    for (const { e } of recording) {
      if (e.area !== map.area || e.kind !== 'step' || !e.from || !e.to || !e.descr || e.descr === NOT_A_TRAIN) continue;
      coverage.valid += 1;
      if (anchored.has(e.to)) coverage.destinationAnchored += 1;
      if (anchored.has(e.from) && anchored.has(e.to)) coverage.bothEndsAnchored += 1;
    }
  }
  return coverage;
}

function percentage(part: number, total: number): string {
  return total === 0 ? '—' : `${(part * 100 / total).toFixed(2)}%`;
}

function coverageValue(part: number, total: number): string {
  return `${part}/${total} (${percentage(part, total)})`;
}

function validateEvent(value: unknown, source: string, line: number): RecordingEvent {
  if (!value || typeof value !== 'object') throw new Error(`${source}:${line}: expected a recording object`);
  const row = value as Record<string, unknown>;
  if (typeof row.t !== 'number' || !Number.isFinite(row.t)) throw new Error(`${source}:${line}: t must be a finite number`);
  if (!row.e || typeof row.e !== 'object' || Array.isArray(row.e)) throw new Error(`${source}:${line}: e must be an event object`);
  const event = row.e as Record<string, unknown>;
  if (typeof event.kind !== 'string' || typeof event.area !== 'string') {
    throw new Error(`${source}:${line}: event kind and area must be strings`);
  }
  for (const key of ['descr', 'from', 'to']) {
    if (event[key] !== undefined && typeof event[key] !== 'string') {
      throw new Error(`${source}:${line}: event ${key} must be a string when present`);
    }
  }
  if (event.time !== undefined && event.time !== null && (typeof event.time !== 'number' || !Number.isFinite(event.time))) {
    throw new Error(`${source}:${line}: event time must be a finite number or null`);
  }
  return { t: row.t, e: event as RecordingEvent['e'] };
}

async function readRecording(file: string): Promise<RecordingEvent[]> {
  const contents = await readFile(file, 'utf8');
  const result: RecordingEvent[] = [];
  for (const [index, raw] of contents.split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`${path.basename(file)}:${index + 1}: invalid NDJSON`);
    }
    result.push(validateEvent(parsed, path.basename(file), index + 1));
  }
  return result;
}

async function readSmart(file: string): Promise<SmartRow[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(gunzipSync(await readFile(file)).toString('utf8'));
  } catch {
    throw new Error(`${path.basename(file)} is not readable gzipped JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || !('BERTHDATA' in parsed)) {
    throw new Error(`${path.basename(file)} must contain a BERTHDATA array`);
  }
  const rows = (parsed as { BERTHDATA: unknown }).BERTHDATA;
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error(`${path.basename(file)} must contain a BERTHDATA array of objects`);
  }
  return rows as SmartRow[];
}

async function readOsm(file: string): Promise<KxData> {
  const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object') throw new Error('OSM model is not a JSON object');
  const data = parsed as KxData;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.rails) || !Array.isArray(data.signals) || !Array.isArray(data.platforms)) {
    throw new Error('OSM model is missing track, signal, or platform data');
  }
  return data;
}

function mdCell(value: string | number | undefined): string {
  return String(value ?? '—').replaceAll('|', '\\|').replaceAll('\r', '').replaceAll('\n', '<br>');
}

function number(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

function signalTrialWarnings(trials: SignalTrial[]): SignalTrial[] {
  return trials.filter((trial) =>
    !trial.placed || trial.distanceM === null || !Number.isFinite(trial.distanceM) || trial.distanceM > 15 || !trial.directionOk || !trial.trusted,
  );
}

function counts<T extends string>(items: T[], keys: readonly T[]): Record<T, number> {
  const out = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return out;
}

interface MapCounts {
  anchors: number;
  anchorsByKind: Record<AnchorKind, number>;
  unmapped: number;
  unmappedByReason: Record<UnmappedReason, number>;
  observedSteps: StepCoverage;
}

function mapCounts(map: AnchorMap, recordings: RecordingEvent[][]): MapCounts {
  return {
    anchors: map.anchors.length,
    anchorsByKind: counts(map.anchors.map((anchor) => anchor.kind), KINDS),
    unmapped: map.unmapped.length,
    unmappedByReason: counts(map.unmapped.map((item) => item.reason), UNMAPPED_REASONS),
    observedSteps: observedStepCoverage(recordings, map),
  };
}

interface AnchorGeometry {
  from: number;
  to: number;
  t: number;
  point: [number, number];
  platform: string | null;
  kind: AnchorKind;
}

function geometry(anchor: AnchorMap['anchors'][number]): AnchorGeometry {
  return {
    from: anchor.from,
    to: anchor.to,
    t: anchor.t,
    point: [...anchor.point],
    platform: anchor.platform ?? null,
    kind: anchor.kind,
  };
}

interface DrawnPositionDiff {
  compared: boolean;
  previous: string | null;
  same: { berth: string; geometry: AnchorGeometry }[];
  new: { berth: string; candidate: AnchorGeometry }[];
  removed: { berth: string; previous: AnchorGeometry }[];
  moved: { berth: string; previous: AnchorGeometry; candidate: AnchorGeometry; displacementM: number }[];
}

function drawnPositionDiff(candidate: AnchorMap, previous?: AnchorMap, previousName?: string): DrawnPositionDiff {
  if (!previous) return { compared: false, previous: null, same: [], new: [], removed: [], moved: [] };
  const before = new Map(previous.anchors.map((anchor) => [anchor.berth, geometry(anchor)]));
  const after = new Map(candidate.anchors.map((anchor) => [anchor.berth, geometry(anchor)]));
  const same: DrawnPositionDiff['same'] = [];
  const added: DrawnPositionDiff['new'] = [];
  const removed: DrawnPositionDiff['removed'] = [];
  const moved: DrawnPositionDiff['moved'] = [];
  for (const [berth, next] of [...after].sort(([a], [b]) => a.localeCompare(b))) {
    const old = before.get(berth);
    if (!old) added.push({ berth, candidate: next });
    else if (JSON.stringify(old) === JSON.stringify(next)) same.push({ berth, geometry: next });
    else moved.push({ berth, previous: old, candidate: next, displacementM: Math.hypot(next.point[0] - old.point[0], next.point[1] - old.point[1]) });
  }
  for (const [berth, old] of [...before].sort(([a], [b]) => a.localeCompare(b))) {
    if (!after.has(berth)) removed.push({ berth, previous: old });
  }
  return { compared: true, previous: previousName ?? 'previous AnchorMap', same, new: added, removed, moved };
}

function preservePreviousAnchors(previous: AnchorMap, candidate: AnchorMap, recordings: RecordingEvent[][], previousName: string): AnchorMap {
  const frozen = new Set(previous.anchors.map((anchor) => anchor.berth));
  const newCandidates = candidate.anchors.filter((anchor) => !frozen.has(anchor.berth));
  const seen = new Map<string, number>();
  for (const recording of recordings) for (const { e } of recording) {
    if (e.area !== candidate.area || e.kind !== 'step') continue;
    for (const berth of new Set([e.from, e.to])) if (berth) seen.set(berth, (seen.get(berth) ?? 0) + 1);
  }
  const withheld = newCandidates.map((anchor) => ({
    berth: anchor.berth,
    reason: 'no-evidence' as const,
    detail: `Candidate-pending-validation: the current builder produced a ${anchor.kind} placement (${anchor.evidence}), but no drawn-position review has approved it; it remains unmapped and is withheld from runtime anchors. See drawn-position-diff.json.`,
    seen: seen.get(anchor.berth) ?? 0,
  }));
  const pendingBerths = new Set(withheld.map((item) => item.berth));
  const currentUnmapped = candidate.unmapped.filter((item) => !frozen.has(item.berth) && !pendingBerths.has(item.berth));
  const candidateInventory = new Set([...candidate.anchors, ...candidate.unmapped].map((item) => item.berth));
  const priorUnmappedAbsentFromCurrent = previous.unmapped.filter((item) =>
    !frozen.has(item.berth) && !candidateInventory.has(item.berth) && !pendingBerths.has(item.berth));
  return {
    ...previous,
    sources: [...candidate.sources, `Previous anchor map: ${previousName}; its anchor geometries remain frozen`],
    anchors: previous.anchors,
    unmapped: [...currentUnmapped, ...priorUnmappedAbsentFromCurrent, ...withheld].sort((a, b) => a.berth.localeCompare(b.berth)),
  };
}

function graphBounds(data: KxData): {
  nodes: number;
  edges: number;
  origin: KxData['origin'];
  local: { minX: number | null; maxX: number | null; minZ: number | null; maxZ: number | null };
  geographic: { north: number; south: number; west: number; east: number } | null;
} {
  const xs = data.nodes.map((node) => node[1]).filter(Number.isFinite);
  const zs = data.nodes.map((node) => node[2]).filter(Number.isFinite);
  const graph = buildGraph(data);
  const local = {
    minX: xs.length ? Math.min(...xs) : null,
    maxX: xs.length ? Math.max(...xs) : null,
    minZ: zs.length ? Math.min(...zs) : null,
    maxZ: zs.length ? Math.max(...zs) : null,
  };
  return {
    nodes: data.nodes.length,
    edges: graph.edges.length,
    origin: data.origin,
    local,
    geographic: local.minX === null || local.maxX === null || local.minZ === null || local.maxZ === null ? null : {
      north: unproject(0, local.minZ, data.origin).lat,
      south: unproject(0, local.maxZ, data.origin).lat,
      west: unproject(local.minX, 0, data.origin).lon,
      east: unproject(local.maxX, 0, data.origin).lon,
    },
  };
}

async function sourceHash(file: string, role: string): Promise<{ role: string; file: string; bytes: number; sha256: string }> {
  const bytes = await readFile(file);
  return { role, file: role === 'geographic-evidence' ? file : path.basename(file), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function candidatePlacementSummary(candidate: AnchorMap, previous?: AnchorMap): { status: 'not-preserving' | 'pending-validation'; berths: string[]; count: number } {
  const previousBerths = new Set(previous?.anchors.map((anchor) => anchor.berth) ?? []);
  const berths = candidate.anchors.map((anchor) => anchor.berth).filter((berth) => !previousBerths.has(berth)).sort();
  return { status: previous ? 'pending-validation' : 'not-preserving', berths, count: berths.length };
}

interface ObservationKindCounts {
  step: number;
  interpose: number;
  cancel: number;
  snapshot: number;
  placeholderEvents: number;
  describedTrainEvents: number;
}

function observationInventory(recordings: RecordingEvent[][], area: string): { berth: string; observations: ObservationKindCounts }[] {
  const inventory = new Map<string, ObservationKindCounts>();
  const get = (berth: string): ObservationKindCounts => {
    let counts = inventory.get(berth);
    if (!counts) {
      counts = { step: 0, interpose: 0, cancel: 0, snapshot: 0, placeholderEvents: 0, describedTrainEvents: 0 };
      inventory.set(berth, counts);
    }
    return counts;
  };
  for (const recording of recordings) for (const { e } of recording) {
    if (e.area !== area) continue;
    if (e.kind === 'snapshot') {
      const berths = (e as RecordingEvent['e'] & { berths?: Record<string, unknown> }).berths ?? {};
      for (const [berth, descr] of Object.entries(berths)) {
        const counts = get(berth);
        counts.snapshot++;
        if (descr === NOT_A_TRAIN) counts.placeholderEvents++;
        else if (typeof descr === 'string' && descr) counts.describedTrainEvents++;
      }
      continue;
    }
    if (e.kind !== 'step' && e.kind !== 'interpose' && e.kind !== 'cancel') continue;
    const berths = e.kind === 'step' ? [e.from, e.to] : [e.kind === 'cancel' ? e.from : e.to];
    for (const berth of new Set(berths)) {
      if (!berth) continue;
      const counts = get(berth);
      counts[e.kind]++;
      if (e.descr === NOT_A_TRAIN) counts.placeholderEvents++;
      else if (typeof e.descr === 'string' && e.descr) counts.describedTrainEvents++;
    }
  }
  return [...inventory].sort(([a], [b]) => a.localeCompare(b)).map(([berth, observations]) => ({ berth, observations }));
}

function comparisonRow(label: string, map: AnchorMap, recordings: RecordingEvent[][]): string {
  const anchorCounts = counts(map.anchors.map((anchor) => anchor.kind), KINDS);
  const unmappedCounts = counts(map.unmapped.map((item) => item.reason), UNMAPPED_REASONS);
  const coverage = observedStepCoverage(recordings, map);
  return `| ${label} | ${map.anchors.length} (${KINDS.map((kind) => `${kind} ${anchorCounts[kind]}`).join(', ')}) | ${map.unmapped.length} (${UNMAPPED_REASONS.map((reason) => `${reason} ${unmappedCounts[reason]}`).join(', ')}) | ${coverage.valid} | ${coverageValue(coverage.destinationAnchored, coverage.valid)} | ${coverageValue(coverage.bothEndsAnchored, coverage.valid)} |`;
}

function auditCauseCounts(audits: BerthAudit[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const audit of audits) result.set(audit.cause, (result.get(audit.cause) ?? 0) + 1);
  return result;
}

function auditReportLines(audits: BerthAudit[]): string[] {
  const causes = auditCauseCounts(audits);
  return [
    '## Unmapped evidence audit',
    '',
    ...(causes.size
      ? [...causes].sort(([a], [b]) => a.localeCompare(b)).map(([cause, count]) => `- ${mdCell(cause)}: ${count} berths.`)
      : ['No unmapped berths to audit.']),
    '',
    'Only `no-evidence` and `conflict` berths receive chain analysis; nearby signal counts use YA reference signals within 250 m along the graph from the nearest anchor.',
    '',
    '| Berth | Reason | Cause | SMART pairs | SMART locations | SMART associations (name / STANOX) | Observed steps | Timed steps | Predecessors | Successors | Anchor path | Nearest anchor | YA ref signals ≤250 m on graph | Detail |',
    '| --- | --- | --- | ---: | --- | --- | ---: | ---: | --- | --- | --- | --- | ---: | --- |',
    ...(audits.length
      ? audits.map((audit) =>
        `| ${mdCell(audit.berth)} | ${mdCell(audit.reason)} | ${mdCell(audit.cause)} | ${audit.smartPairs} | ${mdCell(audit.smartLocations.join('; ') || '—')} | ${mdCell(audit.smartAssociations.map((association) => `${association.name || 'unnamed'} (STANOX ${association.stanox || 'unknown'})`).join('; ') || '—')} | ${audit.observedSteps} | ${audit.timedSteps} | ${mdCell(audit.predecessors.join(', ') || '—')} | ${mdCell(audit.successors.join(', ') || '—')} | ${mdCell(audit.anchorPath.join(' → ') || '—')} | ${mdCell(audit.nearestAnchor ? `${audit.nearestAnchor.berth} (${audit.nearestAnchor.steps} steps)` : '—')} | ${audit.nearbySignals} | ${mdCell(audit.detail)} |`,
        )
      : ['| — | — | — | 0 | — | — | 0 | 0 | — | — | — | — | 0 | No unmapped berths |']),
    '',
  ];
}

function signalIdentitySource(trial: SignalTrial): string {
  return trial.independent ? 'OSM YA reference' : 'topology-inferred signal identity (diagnostic only)';
}

function buildReport(
  map: AnchorMap,
  stepChecks: ReturnType<typeof analyseSteps>,
  signalTrials: SignalTrial[],
  explanations: string[],
  sourceNames: string[],
  generatedAt: string,
  recordings: RecordingEvent[][],
  previousMap?: AnchorMap,
  audits: BerthAudit[] = [],
  preservePositions = false,
  candidatePending = 0,
  geographicEvidence?: Omit<ReturnType<typeof reviewGeographicEvidence>, 'map'> & { source: string; sourceHash: Awaited<ReturnType<typeof sourceHash>> },
): string {
  const anchorCounts = counts(map.anchors.map((anchor) => anchor.kind), KINDS);
  const unmappedCounts = counts(map.unmapped.map((item) => item.reason), UNMAPPED_REASONS);
  const anchoredSteps = stepChecks.filter((step) =>
    map.anchors.some((anchor) => anchor.berth === step.from) && map.anchors.some((anchor) => anchor.berth === step.to),
  );
  const anchoredEvents = anchoredSteps.reduce((sum, step) => sum + step.count, 0);
  const implausible = stepChecks.filter((step) => step.issues.length > 0);
  const trialWarnings = signalTrialWarnings(signalTrials);
  const currentCoverage = observedStepCoverage(recordings, map);
  const signalWarning = signalTrials.length === 0
    ? 'WARNING: no leave-one-out signal trials were produced; signal placement and direction have no leave-one-out check.'
    : trialWarnings.length > 0
      ? `WARNING: ${trialWarnings.length} of ${signalTrials.length} leave-one-out signal trials missed placement, were unplaced, exceeded 15 m, had a direction mismatch, or were not trusted. Review every flagged trial below.`
      : `No leave-one-out signal warnings: all ${signalTrials.length} trials were placed, within 15 m, direction-correct, and trusted.`;

  const lines = [
    '# King’s Cross berth anchor evidence',
    '',
    `Generated ${generatedAt}. Area: ${mdCell(map.area)}.`,
    '',
    '## Sources',
    '',
    ...sourceNames.map((source) => `- ${mdCell(source)}`),
    '',
    '## Summary',
    '',
    `- Anchors: ${map.anchors.length} (${KINDS.map((kind) => `${kind} ${anchorCounts[kind]}`).join(', ')}).`,
    `- Unmapped berths: ${map.unmapped.length} (${UNMAPPED_REASONS.map((reason) => `${reason} ${unmappedCounts[reason]}`).join(', ')}).`,
    `- Transitions with both endpoints anchored: ${anchoredEvents} events across ${anchoredSteps.length} unique paths.`,
    `- Implausible paths: ${implausible.length}.`,
    `- Leave-one-out signals: ${signalTrials.filter((trial) => trial.trusted).length}/${signalTrials.length} trusted within 15 m.`,
    `- Observed TD step coverage: ${coverageValue(currentCoverage.destinationAnchored, currentCoverage.valid)} destination anchored; ${coverageValue(currentCoverage.bothEndsAnchored, currentCoverage.valid)} both ends anchored.`,
    '',
    '## Evidence notes',
    '',
    ...(explanations.length ? explanations.flatMap((paragraph) => [paragraph, '']) : ['No additional evidence notes were returned.', '']),
    '## Anchor map and observed step comparison',
    '',
    'Coverage counts Y9 step events with both berth ids and a train description; placeholder `****` events are excluded.',
    '',
    '| Map | Anchors by kind | Unmapped by reason | Valid TD steps | Destination anchored | Both ends anchored |',
    '| --- | --- | --- | ---: | ---: | ---: |',
    ...(previousMap ? [comparisonRow('Previous', previousMap, recordings)] : []),
    comparisonRow('Current', map, recordings),
    ...(previousMap ? [
      '',
      '## Drawn-position reconciliation',
      '',
      preservePositions
        ? `Runtime anchors use the previous map’s anchors unchanged. ${candidatePending} newly proposed candidate anchor(s) remain unmapped pending drawn-position validation. See drawn-position-diff.json and berths-report.json.`
        : 'The current candidate map is written to anchors.json. Review drawn-position-diff.json for any changed, new, or removed anchor geometry before using it as a runtime map.',
    ] : []),
    '',
    ...(geographicEvidence ? [
      '## Geographic evidence screening',
      '',
      'The default 50 m error is a conservative positional screening assumption, not surveyed accuracy. Exact YA four-digit references alone support these decisions; named locations and observed chains do not propagate a classification. Previous anchors remain frozen under --preserve-positions.',
      '',
      'Source provenance, summary, exact decisions and diagnostic named locations:',
      '',
      '```json',
      JSON.stringify(geographicEvidence, null, 2),
      '```',
      '',
    ] : []),
    '## Anchored berths',
    '',
    '| Berth | Kind | Track direction | Fraction | Point (m) | Error (m) | Platform | Evidence |',
    '| --- | --- | --- | ---: | --- | ---: | --- | --- |',
    ...map.anchors.map((anchor) =>
      `| ${mdCell(anchor.berth)} | ${mdCell(anchor.kind)} | ${anchor.from} → ${anchor.to} | ${number(anchor.t, 3)} | ${number(anchor.point[0])}, ${number(anchor.point[1])} | ${number(anchor.errorM)} | ${mdCell(anchor.platform)} | ${mdCell(anchor.evidence)} |`,
    ),
    '',
    '## Unmapped berths',
    '',
    '| Berth | Reason | Detail | Seen step events |',
    '| --- | --- | --- | ---: |',
    ...(map.unmapped.length
      ? map.unmapped.map((item) => `| ${mdCell(item.berth)} | ${mdCell(item.reason)} | ${mdCell(item.detail)} | ${item.seen} |`)
      : ['| — | — | No unmapped berths | 0 |']),
    '',
    ...auditReportLines(audits),
    '## Step analysis',
    '',
    '| Path | Events | Timed | Seconds | Length (m) | Speed (m/s) | Reversal | Issues |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ...(stepChecks.length
      ? stepChecks.map((step) =>
          `| ${mdCell(`${step.from} → ${step.to}`)} | ${step.count} | ${step.timed} | ${number(step.seconds)} | ${number(step.lengthM)} | ${number(step.speedMps, 2)} | ${step.reversal ? 'yes' : 'no'} | ${mdCell(step.issues.join('; ') || '—')} |`,
        )
      : ['| — | 0 | 0 | — | — | — | no | No step paths found |']),
    '',
    '## Implausible paths',
    '',
    ...(implausible.length
      ? implausible.map((step) =>
          `- **${mdCell(`${step.from} → ${step.to}`)}** — ${step.count} events; speed ${number(step.speedMps, 2)} m/s; reversal ${step.reversal ? 'yes' : 'no'}. ${mdCell(step.issues.join('; '))}`,
        )
      : ['No implausible paths were reported.']),
    '',
    '## Leave-one-out signal checks',
    '',
    signalWarning,
    '',
    '| Berth | Signal node | Role | Placement method | Independent oracle? | Identity source | Placed | Error (m) | Direction correct | Trusted (≤15 m) | Detail |',
    '| --- | ---: | --- | --- | --- | --- | --- | ---: | --- | --- | --- |',
    ...(signalTrials.length
      ? signalTrials.map((trial) =>
        `| ${mdCell(trial.berth)} | ${trial.signalId} | ${trial.role} | ${mdCell(trial.method)} | ${trial.independent ? 'yes' : 'no'} | ${mdCell(signalIdentitySource(trial))} | ${trial.placed ? 'yes' : 'no'} | ${number(trial.distanceM)} | ${trial.placed ? trial.directionOk ? 'yes' : 'no' : '—'} | ${trial.trusted ? 'yes' : 'no'} | ${mdCell(trial.detail)} |`,
        )
      : ['| — | — | — | — | no | — | no | — | — | no | No signal trials were returned |']),
    '',
  ];
  return lines.join('\n');
}

function printSummary(
  map: AnchorMap,
  stepChecks: ReturnType<typeof analyseSteps>,
  signalTrials: SignalTrial[],
  explanations: string[],
  outDir: string,
  recordings: RecordingEvent[][],
  previousMap?: AnchorMap,
  audits: BerthAudit[] = [],
  outputMap: AnchorMap = map,
  positionDiff?: DrawnPositionDiff,
  preservePositions = false,
): void {
  const anchorCounts = counts(map.anchors.map((anchor) => anchor.kind), KINDS);
  const unmappedCounts = counts(map.unmapped.map((item) => item.reason), UNMAPPED_REASONS);
  const anchorIds = new Set(map.anchors.map((anchor) => anchor.berth));
  const anchoredSteps = stepChecks.filter((step) => anchorIds.has(step.from) && anchorIds.has(step.to));
  const anchoredEvents = anchoredSteps.reduce((sum, step) => sum + step.count, 0);
  const implausible = stepChecks.filter((step) => step.issues.length > 0);
  const trialWarnings = signalTrialWarnings(signalTrials);
  const currentCoverage = observedStepCoverage(recordings, map);

  console.log(`berths: wrote anchors.json, anchors-candidate.json, berths-report.md, berths-report.json, and drawn-position-diff.json to ${outDir}`);
  console.log(`anchors by kind: ${KINDS.map((kind) => `${kind} ${anchorCounts[kind]}`).join(', ')}`);
  console.log(`unmapped by reason: ${UNMAPPED_REASONS.map((reason) => `${reason} ${unmappedCounts[reason]}`).join(', ')}`);
  console.log(`steps with both endpoints anchored: ${anchoredEvents} events, ${anchoredSteps.length} unique paths`);
  console.log(`observed TD step coverage (valid events exclude ****): ${currentCoverage.valid} valid events`);
  if (previousMap) {
    const previousCoverage = observedStepCoverage(recordings, previousMap);
    const previousAnchorCounts = counts(previousMap.anchors.map((anchor) => anchor.kind), KINDS);
    const previousUnmappedCounts = counts(previousMap.unmapped.map((item) => item.reason), UNMAPPED_REASONS);
    console.log(`previous anchors by kind: ${KINDS.map((kind) => `${kind} ${previousAnchorCounts[kind]}`).join(', ')}`);
    console.log(`previous unmapped by reason: ${UNMAPPED_REASONS.map((reason) => `${reason} ${previousUnmappedCounts[reason]}`).join(', ')}`);
    console.log(`previous coverage: destination anchored ${coverageValue(previousCoverage.destinationAnchored, previousCoverage.valid)}; both ends anchored ${coverageValue(previousCoverage.bothEndsAnchored, previousCoverage.valid)}`);
  }
  console.log(`current coverage: destination anchored ${coverageValue(currentCoverage.destinationAnchored, currentCoverage.valid)}; both ends anchored ${coverageValue(currentCoverage.bothEndsAnchored, currentCoverage.valid)}`);
  const outputCounts = mapCounts(outputMap, recordings);
  console.log(`runtime output counts: anchors ${outputCounts.anchors}, unmapped ${outputCounts.unmapped}; destination coverage ${coverageValue(outputCounts.observedSteps.destinationAnchored, outputCounts.observedSteps.valid)}; both ends ${coverageValue(outputCounts.observedSteps.bothEndsAnchored, outputCounts.observedSteps.valid)}`);
  if (preservePositions) {
    console.log(`preserved runtime anchor positions exactly; ${candidatePlacementSummary(map, previousMap).count} candidate-only anchor(s) remain unmapped pending drawn-position validation`);
  }
  if (positionDiff?.compared) {
    console.log(`drawn-position diff: same ${positionDiff.same.length}, new ${positionDiff.new.length}, removed ${positionDiff.removed.length}, moved ${positionDiff.moved.length}`);
    const changed = positionDiff.new.length + positionDiff.removed.length + positionDiff.moved.length;
    if (!preservePositions && changed > 0) {
      console.warn(`WARNING: ${changed} candidate anchor geometry change(s) versus --previous (${positionDiff.new.length} new, ${positionDiff.removed.length} removed, ${positionDiff.moved.length} moved); review drawn-position-diff.json before adopting them.`);
    }
  }
  if (implausible.length === 0) console.log('implausible paths: none');
  else {
    console.log(`implausible paths: ${implausible.length}`);
    for (const step of implausible) {
      console.log(
        `- ${step.from} → ${step.to}: ${step.count} events, ${number(step.speedMps, 2)} m/s, reversal ${step.reversal ? 'yes' : 'no'}; ${step.issues.join('; ')}`,
      );
    }
  }
  console.log(`leave-one-out signals: ${signalTrials.filter((trial) => trial.trusted).length}/${signalTrials.length} trusted within 15 m`);
  if (signalTrials.length === 0) {
    console.warn('WARNING: no leave-one-out signal trials were produced; signal placement and direction have no leave-one-out check.');
  } else if (trialWarnings.length > 0) {
    console.warn(
      `WARNING: ${trialWarnings.length} of ${signalTrials.length} leave-one-out signal trials missed placement, were unplaced, exceeded 15 m, had a direction mismatch, or were not trusted. Review the report table.`,
    );
    for (const trial of trialWarnings) {
      console.warn(
        `- berth ${trial.berth}, signal ${trial.signalId} (${trial.role}, ${trial.method}, ${signalIdentitySource(trial)}): placed ${trial.placed ? 'yes' : 'no'}, error ${number(trial.distanceM)} m, direction ${trial.placed ? trial.directionOk ? 'ok' : 'mismatch' : 'unknown (unplaced)'}, trusted ${trial.trusted ? 'yes' : 'no'}; ${trial.detail}`,
      );
    }
  } else {
    console.log(`leave-one-out signal warnings: none; all ${signalTrials.length} trials were placed, within 15 m, direction-correct, and trusted`);
  }
  const causes = auditCauseCounts(audits);
  console.log(`unmapped evidence audit (no-evidence/conflict): ${audits.length} berths${causes.size ? `; ${[...causes].sort(([a], [b]) => a.localeCompare(b)).map(([cause, count]) => `${cause} ${count}`).join(', ')}` : ''}`);
  console.log('| Berth | Reason | Cause | Observed steps | Timed steps | SMART pairs | Nearest anchor | YA refs ≤250 graph m |');
  for (const audit of audits) {
    const nearest = audit.nearestAnchor ? `${audit.nearestAnchor.berth} (${audit.nearestAnchor.steps} steps)` : '—';
    console.log(`| ${audit.berth} | ${audit.reason} | ${audit.cause} | ${audit.observedSteps} | ${audit.timedSteps} | ${audit.smartPairs} | ${nearest} | ${audit.nearbySignals} |`);
  }
  if (explanations.length) {
    console.log('why:');
    for (const paragraph of explanations) console.log(paragraph);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const recordingPaths = await Promise.all(args.recordings.map(inputPath));
  const smartPath = await inputPath(args.smart);
  const previousPath = args.previous ? await inputPath(args.previous) : undefined;
  const geographicPath = args.geographicEvidence ? await inputPath(args.geographicEvidence) : undefined;
  const graphPath = args.graph
    ? await inputPath(args.graph)
    : await realpath(path.join(packageRoot, 'web', 'src', 'data', 'kx-track.json'));
  const recordings = await Promise.all(recordingPaths.map(readRecording));
  const smartRows = await readSmart(smartPath);
  const previousMap = previousPath ? await readPreviousMap(previousPath) : undefined;
  const data = await readOsm(graphPath);
  const smartStat = await lstat(smartPath);
  const generatedAt = new Date().toISOString();
  const sources = [
    ...recordingPaths.map((file) => `Recording: ${path.basename(file)}`),
    `SMART: ${path.basename(smartPath)} (modified ${smartStat.mtime.toISOString()})`,
    `OSM: ${data.attribution}; graph ${path.basename(graphPath)}`,
  ];
  if (geographicPath) sources.push(`Geographic evidence: ${path.basename(geographicPath)} (raw Overpass JSON; 50 m conservative positional screening assumption, not surveyed accuracy)`);
  const reportSources = [...sources, ...(previousPath ? [`Previous map: ${path.basename(previousPath)}`] : [])];

  const geographicSourceHash = geographicPath ? await sourceHash(geographicPath, 'geographic-evidence') : undefined;
  const builtMap = buildAnchors(data, recordings, smartRows, { area: 'Y9', sources });
  const geographicReview = geographicPath
    ? reviewGeographicEvidence(data, builtMap, JSON.parse(await readFile(geographicPath, 'utf8')), { source: path.basename(geographicPath),
      seen: new Map(observationInventory(recordings, builtMap.area).map(({ berth, observations }) => [berth, observations.step])) })
    : undefined;
  const candidateMap = geographicReview?.map ?? builtMap;
  const geographicEvidence = geographicReview
    ? { source: geographicPath!, sourceHash: geographicSourceHash!, summary: geographicReview.summary, decisions: geographicReview.decisions, namedLocations: geographicReview.namedLocations }
    : undefined;
  const outputMap = args.preservePositions && previousMap
    ? preservePreviousAnchors(previousMap, candidateMap, recordings, path.basename(previousPath!))
    : candidateMap;
  const positionDiff = drawnPositionDiff(candidateMap, previousMap, previousPath ? path.basename(previousPath) : undefined);
  const candidatePending = candidatePlacementSummary(candidateMap, previousMap);
  const stepChecks = analyseSteps(data, recordings, candidateMap);
  const signalTrials = leaveOneOut(data, recordings, smartRows, { area: 'Y9', sources });
  const explanations = describeEvidence(data, recordings, smartRows, candidateMap);
  const candidateAudits = auditBerths(data, recordings, smartRows, candidateMap);
  const pendingCandidateSet = new Set(args.preservePositions ? candidatePending.berths : []);
  const outputAudits = args.preservePositions
    ? auditBerths(data, recordings, smartRows, outputMap).map((audit) => pendingCandidateSet.has(audit.berth)
      ? { ...audit, cause: 'candidate-position-review', detail: `${audit.detail}. Candidate placement is withheld pending drawn-position approval; see drawn-position-diff.json.` }
      : audit)
    : candidateAudits;
  const sourceHashes = await Promise.all([
    ...recordingPaths.map((file) => sourceHash(file, 'recording')),
    sourceHash(smartPath, 'smart'),
    sourceHash(graphPath, 'graph'),
    ...(geographicSourceHash ? [geographicSourceHash] : []),
    ...(previousPath ? [sourceHash(previousPath, 'previous-anchor-map')] : []),
  ]);
  const diffCounts = {
    same: positionDiff.same.length,
    new: positionDiff.new.length,
    removed: positionDiff.removed.length,
    moved: positionDiff.moved.length,
  };
  const reportJson = {
    schemaVersion: 1,
    generatedAt,
    area: candidateMap.area,
    summary: {
      preservePositions: args.preservePositions,
      ...(geographicEvidence ? { geographicEvidence: geographicEvidence.summary } : {}),
      counts: {
        before: previousMap ? mapCounts(previousMap, recordings) : null,
        candidate: mapCounts(candidateMap, recordings),
        after: mapCounts(outputMap, recordings),
      },
      candidatePlacement: { ...candidatePending, status: args.preservePositions ? 'pending-validation' as const : 'not-preserving' as const },
      drawnPositionDiff: diffCounts,
      auditDecisionCounts: {
        candidate: candidateAudits.length,
        after: outputAudits.length,
        noEvidence: outputAudits.filter((audit) => audit.reason === 'no-evidence').length,
        conflict: outputAudits.filter((audit) => audit.reason === 'conflict').length,
      },
    },
    anchors: outputMap.anchors,
    unmapped: outputMap.unmapped,
    candidateAnchors: candidateMap.anchors,
    candidateUnmapped: candidateMap.unmapped,
    auditDecisions: { candidate: candidateAudits, after: outputAudits },
    leaveOneOut: signalTrials,
    observationInventory: observationInventory(recordings, candidateMap.area),
    graphBounds: graphBounds(data),
    sourceHashes,
    ...(geographicEvidence ? { geographicEvidence } : {}),
  };
  const outDir = await ensureOutputDirectory(args.out);
  const outputs = [
    ['anchors.json', `${JSON.stringify(outputMap, null, 2)}\n`],
    ['anchors-candidate.json', `${JSON.stringify(candidateMap, null, 2)}\n`],
    ['berths-report.json', `${JSON.stringify(reportJson, null, 2)}\n`],
    ['drawn-position-diff.json', `${JSON.stringify(positionDiff, null, 2)}\n`],
    ['berths-report.md', buildReport(candidateMap, stepChecks, signalTrials, explanations, reportSources, generatedAt, recordings, previousMap, candidateAudits, args.preservePositions, candidatePending.count, geographicEvidence)],
  ] as const;
  await Promise.all(outputs.map(([name]) => checkOutputFile(outDir, name)));
  await Promise.all(outputs.map(([name, body]) => writeFile(path.join(outDir, name), body, { mode: 0o600 })));
  printSummary(candidateMap, stepChecks, signalTrials, explanations, outDir, recordings, previousMap, candidateAudits, outputMap, positionDiff, args.preservePositions);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown failure';
  console.error(`berths: ${message}`);
  process.exitCode = 1;
});
