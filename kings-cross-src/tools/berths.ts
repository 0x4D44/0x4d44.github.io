// Derive berth anchors and a private evidence report from TD recordings and SMART data.
//
//   node tools/berths.ts --recording <td.ndjson> [--recording <td.ndjson> ...]
//     --smart <smart.json.gz> --out ../.scratch/berths
//
// The output directory is restricted to this worktree's .scratch tree because the report
// contains evidence derived from local recordings.
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { analyseSteps, buildAnchors, describeEvidence, leaveOneOut } from '../core/berths.ts';
import type { RecordingEvent, SignalTrial, SmartRow } from '../core/berths.ts';
import type { AnchorKind, AnchorMap } from '../core/anchors.ts';
import type { KxData } from '../core/osm.ts';

interface CliArgs {
  recordings: string[];
  smart: string;
  out: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const repoRoot = path.resolve(packageRoot, '..');
const KINDS: AnchorKind[] = ['platform', 'signal', 'smart', 'inferred'];
const UNMAPPED_REASONS = ['outside-network', 'no-evidence', 'conflict'] as const;

function parseArgs(argv: string[]): CliArgs {
  const recordings: string[] = [];
  let smart: string | undefined;
  let out: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag !== '--recording' && flag !== '--smart' && flag !== '--out') {
      throw new Error(`unknown option ${flag ?? ''}; ${usage()}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} needs a path; ${usage()}`);
    i += 1;
    if (flag === '--recording') recordings.push(value);
    else if (flag === '--smart') {
      if (smart !== undefined) throw new Error('--smart may be given once');
      smart = value;
    } else {
      if (out !== undefined) throw new Error('--out may be given once');
      out = value;
    }
  }

  if (recordings.length === 0 || !smart || !out) throw new Error(usage());
  return { recordings, smart, out };
}

function usage(): string {
  return 'usage: node tools/berths.ts --recording <td.ndjson> [--recording <td.ndjson> ...] --smart <smart.json.gz> --out <dir-inside-worktree-.scratch>';
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

  const physicalCwd = await realpath(process.cwd());
  const outPath = path.resolve(path.isAbsolute(outArg) ? outArg : path.join(physicalCwd, outArg));
  if (!isWithinOrEqual(scratchReal, outPath)) {
    throw new Error(`output directory must be inside ${scratchReal}`);
  }

  const relative = path.relative(scratchReal, outPath);
  let current = scratchReal;
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
    if (!isWithinOrEqual(scratchReal, actual)) throw new Error('output path resolves outside worktree .scratch');
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

async function readOsm(): Promise<KxData> {
  const file = path.join(packageRoot, 'web', 'src', 'data', 'kx-track.json');
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
    !trial.placed || trial.distanceM === null || !Number.isFinite(trial.distanceM) || trial.distanceM > 60 || !trial.directionOk || !trial.trusted,
  );
}

function counts<T extends string>(items: T[], keys: readonly T[]): Record<T, number> {
  const out = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return out;
}

function buildReport(
  map: AnchorMap,
  stepChecks: ReturnType<typeof analyseSteps>,
  signalTrials: SignalTrial[],
  explanations: string[],
  sourceNames: string[],
  generatedAt: string,
): string {
  const anchorCounts = counts(map.anchors.map((anchor) => anchor.kind), KINDS);
  const unmappedCounts = counts(map.unmapped.map((item) => item.reason), UNMAPPED_REASONS);
  const anchoredSteps = stepChecks.filter((step) =>
    map.anchors.some((anchor) => anchor.berth === step.from) && map.anchors.some((anchor) => anchor.berth === step.to),
  );
  const anchoredEvents = anchoredSteps.reduce((sum, step) => sum + step.count, 0);
  const implausible = stepChecks.filter((step) => step.issues.length > 0);
  const trialWarnings = signalTrialWarnings(signalTrials);
  const signalWarning = signalTrials.length === 0
    ? 'WARNING: no leave-one-out signal trials were produced; signal placement and direction have no leave-one-out check.'
    : trialWarnings.length > 0
      ? `WARNING: ${trialWarnings.length} of ${signalTrials.length} leave-one-out signal trials missed placement, were unplaced, exceeded 60 m, had a direction mismatch, or were not trusted. Review every flagged trial below.`
      : `No leave-one-out signal warnings: all ${signalTrials.length} trials were placed, within 60 m, direction-correct, and trusted.`;

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
    `- Leave-one-out signals: ${signalTrials.filter((trial) => trial.trusted).length}/${signalTrials.length} trusted within 60 m.`,
    '',
    '## Evidence notes',
    '',
    ...(explanations.length ? explanations.flatMap((paragraph) => [paragraph, '']) : ['No additional evidence notes were returned.', '']),
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
    '| Berth | Signal node | Role | Placed | Error (m) | Direction correct | Trusted (≤60 m) | Detail |',
    '| --- | ---: | --- | --- | ---: | --- | --- | --- |',
    ...(signalTrials.length
      ? signalTrials.map((trial) =>
        `| ${mdCell(trial.berth)} | ${trial.signalId} | ${trial.role} | ${trial.placed ? 'yes' : 'no'} | ${number(trial.distanceM)} | ${trial.placed ? trial.directionOk ? 'yes' : 'no' : '—'} | ${trial.trusted ? 'yes' : 'no'} | ${mdCell(trial.detail)} |`,
        )
      : ['| — | — | — | no | — | — | no | No signal trials were returned |']),
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
): void {
  const anchorCounts = counts(map.anchors.map((anchor) => anchor.kind), KINDS);
  const unmappedCounts = counts(map.unmapped.map((item) => item.reason), UNMAPPED_REASONS);
  const anchorIds = new Set(map.anchors.map((anchor) => anchor.berth));
  const anchoredSteps = stepChecks.filter((step) => anchorIds.has(step.from) && anchorIds.has(step.to));
  const anchoredEvents = anchoredSteps.reduce((sum, step) => sum + step.count, 0);
  const implausible = stepChecks.filter((step) => step.issues.length > 0);
  const trialWarnings = signalTrialWarnings(signalTrials);

  console.log(`berths: wrote anchors.json and berths-report.md to ${outDir}`);
  console.log(`anchors by kind: ${KINDS.map((kind) => `${kind} ${anchorCounts[kind]}`).join(', ')}`);
  console.log(`unmapped by reason: ${UNMAPPED_REASONS.map((reason) => `${reason} ${unmappedCounts[reason]}`).join(', ')}`);
  console.log(`steps with both endpoints anchored: ${anchoredEvents} events, ${anchoredSteps.length} unique paths`);
  if (implausible.length === 0) console.log('implausible paths: none');
  else {
    console.log(`implausible paths: ${implausible.length}`);
    for (const step of implausible) {
      console.log(
        `- ${step.from} → ${step.to}: ${step.count} events, ${number(step.speedMps, 2)} m/s, reversal ${step.reversal ? 'yes' : 'no'}; ${step.issues.join('; ')}`,
      );
    }
  }
  console.log(`leave-one-out signals: ${signalTrials.filter((trial) => trial.trusted).length}/${signalTrials.length} trusted within 60 m`);
  if (signalTrials.length === 0) {
    console.warn('WARNING: no leave-one-out signal trials were produced; signal placement and direction have no leave-one-out check.');
  } else if (trialWarnings.length > 0) {
    console.warn(
      `WARNING: ${trialWarnings.length} of ${signalTrials.length} leave-one-out signal trials missed placement, were unplaced, exceeded 60 m, had a direction mismatch, or were not trusted. Review the report table.`,
    );
    for (const trial of trialWarnings) {
      console.warn(
        `- berth ${trial.berth}, signal ${trial.signalId} (${trial.role}): placed ${trial.placed ? 'yes' : 'no'}, error ${number(trial.distanceM)} m, direction ${trial.placed ? trial.directionOk ? 'ok' : 'mismatch' : 'unknown (unplaced)'}, trusted ${trial.trusted ? 'yes' : 'no'}; ${trial.detail}`,
      );
    }
  } else {
    console.log(`leave-one-out signal warnings: none; all ${signalTrials.length} trials were placed, within 60 m, direction-correct, and trusted`);
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
  const recordings = await Promise.all(recordingPaths.map(readRecording));
  const smartRows = await readSmart(smartPath);
  const data = await readOsm();
  const smartStat = await lstat(smartPath);
  const generatedAt = new Date().toISOString();
  const sources = [
    ...recordingPaths.map((file) => `Recording: ${path.basename(file)}`),
    `SMART: ${path.basename(smartPath)} (modified ${smartStat.mtime.toISOString()})`,
    `OSM: ${data.attribution}`,
  ];

  const map = buildAnchors(data, recordings, smartRows, { area: 'Y9', sources });
  const stepChecks = analyseSteps(data, recordings, map);
  const signalTrials = leaveOneOut(data, recordings, smartRows, { area: 'Y9', sources });
  const explanations = describeEvidence(data, recordings, smartRows, map);
  const outDir = await ensureOutputDirectory(args.out);
  await checkOutputFile(outDir, 'anchors.json');
  await checkOutputFile(outDir, 'berths-report.md');
  await writeFile(path.join(outDir, 'anchors.json'), `${JSON.stringify(map, null, 2)}\n`, { mode: 0o600 });
  await writeFile(path.join(outDir, 'berths-report.md'), buildReport(map, stepChecks, signalTrials, explanations, sources, generatedAt), { mode: 0o600 });
  printSummary(map, stepChecks, signalTrials, explanations, outDir);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown failure';
  console.error(`berths: ${message}`);
  process.exitCode = 1;
});
