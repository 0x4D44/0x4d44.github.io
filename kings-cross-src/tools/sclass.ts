// Analyse S-class bytes in a TD recording and write a private evidence report.
//   node tools/sclass.ts --recording <td.ndjson> --anchors <AnchorMap.json> --out ../.scratch/sclass
import { lstat, mkdir, open, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyseSclassRecordings, signalStates } from '../core/sclass.ts';
import type { SclassAnalysis, TimedTdEvent } from '../core/sclass.ts';
import type { AnchorMap } from '../core/anchors.ts';

interface CliArgs {
  recording: string[];
  anchors: string;
  out: string;
  dataDir?: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const repoRoot = path.resolve(packageRoot, '..');

function parseArgs(argv: string[]): CliArgs {
  const recording: string[] = [];
  let anchors: string | undefined;
  let out: string | undefined;
  let dataDir: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag !== '--recording' && flag !== '--anchors' && flag !== '--out' && flag !== '--data-dir') {
      throw new Error(`unknown option ${flag ?? ''}; ${usage()}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} needs a path; ${usage()}`);
    i += 1;
    if (flag === '--recording') {
      recording.push(value);
    } else if (flag === '--anchors') {
      if (anchors !== undefined) throw new Error('--anchors may be given once');
      anchors = value;
    } else if (flag === '--out') {
      if (out !== undefined) throw new Error('--out may be given once');
      out = value;
    } else {
      if (dataDir !== undefined) throw new Error('--data-dir may be given once');
      dataDir = value;
    }
  }
  if (!recording.length || !anchors || !out) throw new Error(usage());
  return { recording, anchors, out, dataDir };
}

function usage(): string {
  return 'usage: node tools/sclass.ts --recording <td.ndjson> [--recording <another.ndjson>] --anchors <AnchorMap.json> --out <dir-inside-worktree-.scratch> [--data-dir <private-KX_DATA_DIR>]';
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
  if (!isWithinOrEqual(scratchReal, outPath)) throw new Error(`output directory must be inside ${scratchReal}`);

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
  return await realpath(path.resolve(value));
}

function validateEvent(value: unknown, source: string, line: number): TimedTdEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${source}:${line}: expected a recording object`);
  const row = value as Record<string, unknown>;
  if (typeof row.t !== 'number' || !Number.isFinite(row.t)) throw new Error(`${source}:${line}: t must be a finite number`);
  if (!row.e || typeof row.e !== 'object' || Array.isArray(row.e)) throw new Error(`${source}:${line}: e must be an event object`);
  const event = row.e as Record<string, unknown>;
  if (typeof event.kind !== 'string' || typeof event.area !== 'string') {
    throw new Error(`${source}:${line}: event kind and area must be strings`);
  }
  for (const key of ['msgType', 'address', 'data', 'descr', 'from', 'to']) {
    if (event[key] !== undefined && typeof event[key] !== 'string') {
      throw new Error(`${source}:${line}: event ${key} must be a string when present`);
    }
  }
  return { t: row.t, e: event as TimedTdEvent['e'] };
}

async function readRecording(file: string): Promise<TimedTdEvent[]> {
  const contents = await readFile(file, 'utf8');
  const result: TimedTdEvent[] = [];
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

async function readAnchors(file: string): Promise<AnchorMap> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new Error(`${path.basename(file)} is not readable JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${path.basename(file)} must contain an AnchorMap object`);
  const map = parsed as Record<string, unknown>;
  if (typeof map.area !== 'string' || !Array.isArray(map.anchors) || !Array.isArray(map.unmapped) || !Array.isArray(map.sources)) {
    throw new Error(`${path.basename(file)} must contain area, sources, anchors, and unmapped fields`);
  }
  if (map.anchors.some((anchor) => !anchor || typeof anchor !== 'object' || Array.isArray(anchor) || typeof (anchor as Record<string, unknown>).berth !== 'string')) {
    throw new Error(`${path.basename(file)} anchors must be objects with berth ids`);
  }
  if (map.unmapped.some((item) => !item || typeof item !== 'object' || Array.isArray(item) || typeof (item as Record<string, unknown>).berth !== 'string')) {
    throw new Error(`${path.basename(file)} unmapped entries must be objects with berth ids`);
  }
  if (map.sources.some((source) => typeof source !== 'string')) throw new Error(`${path.basename(file)} sources must be strings`);
  return map as unknown as AnchorMap;
}

function mdCell(value: unknown): string {
  return String(value ?? '—').replaceAll('|', '\\|').replaceAll('\r', '').replaceAll('\n', '<br>');
}

function number(value: unknown, digits = 1): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function timestamp(value: number): string {
  return Number.isFinite(value) ? new Date(value).toISOString() : '—';
}

function precision(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(1)}%`;
}

/** One row per observed bit, including constant and undecoded bits. */
function addressTable(analysis: SclassAnalysis) {
  return analysis.bits.map(bit => {
    const candidates = analysis.hypotheses.filter(h => h.address === bit.address && h.bit === bit.bit);
    const h = candidates.find(h => h.status === 'decoded');
    const evidence = h ?? (candidates.length === 1 ? candidates[0] : undefined);
    return { address: bit.address, bit: bit.bit, decodedAs: !h ? 'unknown'
      : h.kind === 'route' ? `route ${h.berth} -> ${h.to}` : `signal ${/^\d+$/.test(h.berth) && analysis.area === 'Y9' ? 'YA' : ''}${h.berth} proceed`,
      supports: evidence?.heldOut.support ?? 0, precision: evidence?.heldOut.precision ?? null, recall: evidence?.heldOut.recall ?? null,
      hypothesisId: evidence?.id ?? null, candidates: candidates.map(h => ({ id: h.id, status: h.status, reason: h.reason,
        training: h.training, heldOut: h.heldOut })) };
  });
}

function aggregate(analysis: SclassAnalysis, kind?: 'proceed' | 'route') {
  const hypotheses = analysis.hypotheses.filter(h => h.status === 'decoded' && (!kind || h.kind === kind));
  const support = hypotheses.reduce((n, h) => n + h.heldOut.support, 0);
  const cycles = hypotheses.reduce((n, h) => n + h.heldOut.support + h.heldOut.unmatchedCycles, 0);
  const trials = hypotheses.reduce((n, h) => n + h.heldOut.trials, 0);
  return { bits: hypotheses.length, support, cycles, trials, precision: cycles ? support / cycles : null, recall: trials ? support / trials : null };
}

function buildReport(analysis: SclassAnalysis, anchors: AnchorMap, currentStates: Record<string, string>, generatedAt: string, sources: string[]): string {
  const decodedBits = analysis.bits.filter((bit) => bit.status === 'decoded').length;
  const unknownBits = analysis.bits.length - decodedBits;
  const decodedHypotheses = analysis.hypotheses.filter((hypothesis) => hypothesis.status === 'decoded').length;
  const decodedBerths = analysis.berths.filter((berth) => berth.status === 'decoded').length;
  const anchoredBerths = analysis.berths.filter((berth) => berth.anchored).length;
  const decodedAnchoredBerths = analysis.berths.filter((berth) => berth.anchored && berth.status === 'decoded').length;
  const states = Object.values(currentStates);
  const stateCounts = {
    proceed: states.filter((state) => state === 'proceed').length,
    danger: states.filter((state) => state === 'danger').length,
    unknown: states.filter((state) => state === 'unknown').length,
  };
  const lines = [
    `# King’s Cross S-class temporal evidence (${mdCell(analysis.area)})`,
    '',
    `Generated ${generatedAt}.`,
    '',
    '## Sources',
    '',
    ...sources.map((source) => `- ${mdCell(source)}`),
    '',
    '## Summary',
    '',
    `- S-class messages: ${analysis.trace.acceptedMessages} accepted, ${analysis.trace.rejectedMessages} rejected.`,
    `- Expanded bytes and bits: ${Object.keys(analysis.trace.state).length} bytes, ${analysis.bits.length} observed bits (${analysis.bits.filter((bit) => bit.changes === 0).length} constant, ${analysis.bits.filter((bit) => bit.changes > 0).length} changing).`,
    `- Bit hypotheses: ${decodedBits} decoded, ${unknownBits} unknown; ${decodedHypotheses} hypotheses passed the held-out oracle.`,
    ...(['proceed', 'route'] as const).map(kind => {
      const s = aggregate(analysis, kind);
      return `- ${kind === 'route' ? 'Route-like' : 'Proceed'} bits: ${s.bits}; held-out supports ${s.support}, precision ${precision(s.precision)}, recall ${precision(s.recall)} (micro-average).`;
    }),
    `- Berths: ${decodedBerths} decoded, ${analysis.berths.length - decodedBerths} unknown; among ${anchoredBerths} anchored berths, ${decodedAnchoredBerths} decoded and ${anchoredBerths - decodedAnchoredBerths} unknown.`,
    `- Current anchored signal states: ${stateCounts.proceed} proceed, ${stateCounts.danger} danger, ${stateCounts.unknown} unknown.`,
    '',
    'These are temporal correlations in this recording. They do not identify signal positions, track circuits, or routes, and they are not an authoritative signalling diagram. A weekday peak can add repeated passages and route diversity, but correlation still cannot establish circuit or route identity.',
    '',
    '## Recording window and split',
    '',
    `- Recording: ${timestamp(analysis.startMs)} to ${timestamp(analysis.endMs)}.`,
    ...analysis.folds.map((fold, i) => `- Recording ${i + 1}: ${timestamp(fold.startMs)} to ${timestamp(fold.endMs)}; first-half learning / second-half hold-out split ${timestamp(fold.splitMs)}.`),
    `- Proceed: set within ${number(analysis.windows.beforeMs / 1000, 1)} s before the TD step; reset from ${number((analysis.windows.earlyMs ?? 0) / 1000, 1)} s before to ${number(analysis.windows.afterMs / 1000, 1)} s after it. Route-like: set before, reset later, by ${number((analysis.windows.routeAfterMs ?? analysis.windows.afterMs) / 1000, 1)} s after. These windows are fixed for all bits; held-out data never selects timings.`,
    `- Deduplicated valid steps: ${analysis.steps.total}; training ${analysis.steps.training}, held-out ${analysis.steps.heldOut}, excluded at fold edges ${analysis.steps.excludedAtEdges}.`,
    `- Excluded from step analysis: ${analysis.steps.ignoredNotATrain} non-train placeholder steps, ${analysis.steps.ignoredIncomplete} incomplete steps, ${analysis.steps.duplicates} duplicate steps.`,
    `- S-class trace: ${analysis.trace.transitions.length} bit transitions across ${analysis.trace.acceptedMessages} accepted messages; ${analysis.trace.rejectedMessages} messages were rejected by the byte decoder.`,
    '',
    '## Berths and current states',
    '',
    'Current state is reported only for anchored berths with one unambiguous decoded hypothesis and an available final byte. Other states remain unknown.',
    '',
    '| Berth | Anchored | Temporal association | Current state | Hypotheses |',
    '| --- | --- | --- | --- | --- |',
    ...(analysis.berths.length
      ? analysis.berths.map((berth) => `| ${mdCell(berth.berth)} | ${berth.anchored ? 'yes' : 'no'} | ${berth.status} | ${berth.anchored ? currentStates[berth.berth] ?? 'unknown' : 'unknown'} | ${mdCell(berth.hypothesisIds.join(', ') || '—')} |`)
      : ['| — | no | unknown | unknown | No berths observed |']),
    '',
    `Anchor map entries: ${anchors.anchors.length} anchored, ${anchors.unmapped.length} unmapped.`,
    '',
    '## Observed expanded byte bits',
    '',
    'Bit 0 is the least significant bit of each byte. Constant bits are included when their byte was first observed.',
    '',
    '| Address | Bit | Decoded as | Held-out supports | Precision | Recall |',
    '| --- | ---: | --- | ---: | ---: | ---: |',
    ...addressTable(analysis).map(bit => `| ${bit.address} | ${bit.bit} | ${mdCell(bit.decodedAs)} | ${bit.supports} | ${precision(bit.precision)} | ${precision(bit.recall)} |`),
    '',
    '## Training hypotheses and held-out oracle',
    '',
    'A supported passage needs a complete observed set/reset cycle inside the fixed timing windows above. Full windows must fit inside the same chronological fold. First byte observations and reconnect snapshots establish state without counting as changes; each cycle supports at most one passage of a berth.',
    '',
    `Training candidates and the strict held-out oracle each require at least ${analysis.minimumSupport} supports, precision and recall ≥ ${precision(analysis.minimumPrecision)}. Precision = matched cycles / all complete cycles; recall = matched passages / all eligible passages. The held-out score accepts or rejects training candidates; ambiguity is determined from training evidence only. Route-like bits never drive a signal lamp.`,
    '',
    'Unmatched complete clear/danger cycles are false positives in precision. Unmatched passages reduce recall. First observations and cycles across recording/fold boundaries are not evidence. Occupancy-like bits that set only after passage cannot be proceed evidence. Route-like means temporal route release, not an identified interlocking route.',
    '',
    '| Hypothesis | Kind | Status | Training support / trials | Training precision / recall | Training unmatched cycles | Held-out support / trials | Held-out precision / recall | Held-out unmatched cycles | Reason |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...(analysis.hypotheses.length
      ? analysis.hypotheses.map((hypothesis) => `| ${mdCell(`${hypothesis.address}.${hypothesis.bit}=${hypothesis.proceedValue} → ${hypothesis.berth}`)} | ${hypothesis.kind} | ${hypothesis.status} | ${hypothesis.training.support} / ${hypothesis.training.trials} | ${precision(hypothesis.training.precision)} / ${precision(hypothesis.training.recall ?? null)} | ${hypothesis.training.unmatchedCycles} | ${hypothesis.heldOut.support} / ${hypothesis.heldOut.trials} | ${precision(hypothesis.heldOut.precision)} / ${precision(hypothesis.heldOut.recall ?? null)} | ${hypothesis.heldOut.unmatchedCycles} | ${mdCell(hypothesis.reason)} |`)
      : ['| — | unknown | 0 / 0 | — | 0 | 0 / 0 | — | 0 | No training hypothesis qualified |']),
    '',
  ];
  return lines.join('\n');
}

function printSummary(analysis: SclassAnalysis, currentStates: Record<string, string>, outDir: string): void {
  const decodedBits = analysis.bits.filter((bit) => bit.status === 'decoded').length;
  const unknownBits = analysis.bits.length - decodedBits;
  const decodedHypotheses = analysis.hypotheses.filter((hypothesis) => hypothesis.status === 'decoded').length;
  const anchoredBerths = analysis.berths.filter((berth) => berth.anchored).length;
  const decodedBerths = analysis.berths.filter((berth) => berth.status === 'decoded').length;
  const decodedAnchoredBerths = analysis.berths.filter((berth) => berth.anchored && berth.status === 'decoded').length;
  const states = Object.values(currentStates);
  const proceed = states.filter((state) => state === 'proceed').length;
  const danger = states.filter((state) => state === 'danger').length;
  const unknown = states.filter((state) => state === 'unknown').length;
  console.log(`bits: ${decodedBits} decoded, ${unknownBits} unknown; hypotheses: ${decodedHypotheses}/${analysis.hypotheses.length} decoded`);
  console.log(`berths: ${decodedBerths} decoded, ${analysis.berths.length - decodedBerths} unknown; anchored: ${decodedAnchoredBerths} decoded, ${anchoredBerths - decodedAnchoredBerths} unknown`);
  console.log(`current anchored states: proceed ${proceed}, danger ${danger}, unknown ${unknown}`);
  console.log(`outputs: ${path.join(outDir, 'sclass.json')}; ${path.join(outDir, 'sclass-report.md')}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [recordingPaths, anchorsPath] = await Promise.all([Promise.all(args.recording.map(inputPath)), inputPath(args.anchors)]);
  if (new Set(recordingPaths).size !== recordingPaths.length) throw new Error('duplicate recording input');
  const [events, anchors] = await Promise.all([Promise.all(recordingPaths.map(readRecording)), readAnchors(anchorsPath)]);
  const analysis = analyseSclassRecordings(events, anchors);
  const states = signalStates(analysis.trace.state, analysis.hypotheses, anchors);
  const generatedAt = new Date().toISOString();
  const sources = [...recordingPaths.map(p => `Recording: ${path.basename(p)}`), `Anchor map: ${path.basename(anchorsPath)}`];
  const outDir = await ensureOutputDirectory(args.out);
  await checkOutputFile(outDir, 'sclass.json');
  await checkOutputFile(outDir, 'sclass-report.md');
  await checkOutputFile(outDir, 'sclass-table.json');
  const table = { area: analysis.area, generatedAt, sources, folds: analysis.folds,
    summary: { all: aggregate(analysis), proceed: aggregate(analysis, 'proceed'), route: aggregate(analysis, 'route') }, bits: addressTable(analysis) };
  const runtime = { ...analysis, currentStates: states, provenance: { generatedAt, sources } };
  await writeFile(path.join(outDir, 'sclass.json'), `${JSON.stringify(runtime, null, 2)}\n`, { mode: 0o600 });
  await writeFile(path.join(outDir, 'sclass-table.json'), `${JSON.stringify(table, null, 2)}\n`, { mode: 0o600 });
  await writeFile(path.join(outDir, 'sclass-report.md'), buildReport(analysis, anchors, states, generatedAt, sources), { mode: 0o600 });
  if (args.dataDir) {
    const dataDir = await inputPath(args.dataDir);
    if (isWithinOrEqual(await realpath(repoRoot), dataDir)) throw new Error('private data directory must be outside the repository');
    for (const [name, value] of [['sclass.json', runtime], ['sclass-table.json', table]] as const) {
      await checkOutputFile(dataDir, name);
      // Rename atomically so a relay fetch cannot observe a partially written table.
      const temp = path.join(dataDir, `.${name}.${process.pid}.tmp`);
      const handle = await open(temp, 'wx', 0o600);
      try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); } finally { await handle.close(); }
      await rename(temp, path.join(dataDir, name));
    }
  }
  printSummary(analysis, states, outDir);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown failure';
  console.error(`sclass: ${message}`);
  process.exitCode = 1;
});
