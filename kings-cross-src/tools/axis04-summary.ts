// Compact scorer-facing summary of axis 04 evidence. Reads reports only; never contacts the relay.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const scratchRoot = path.join(repoRoot, '.scratch');
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const nonnegativeInteger = (value: unknown): number | null => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
const percent = (numerator: number | null, denominator: number | null): number | null =>
  numerator !== null && denominator !== null && denominator > 0 ? numerator * 100 / denominator : null;

export interface SummaryOptions { out: string; boardReport?: string; liveReport?: string; replayReport?: string; relay?: string }

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function loopbackRelay(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('--relay must be a loopback HTTP origin'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('--relay must be a loopback HTTP origin without credentials or a path');
  }
  return url.origin;
}

export function axis04Options(args: string[]): SummaryOptions {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!['--out', '--board-report', '--live-report', '--replay-report', '--relay'].includes(key!) || !value || value.startsWith('--') || values.has(key!)) {
      throw new Error('usage: axis04-summary.ts --out <.scratch/dir> [--board-report <json>] [--live-report <json>] [--replay-report <json>] [--relay <loopback-origin>]');
    }
    values.set(key!, value);
  }
  if (!values.has('--out')) throw new Error('--out is required');
  const out = path.resolve(values.get('--out')!);
  if (out === scratchRoot || !isWithin(scratchRoot, out)) throw new Error('--out must be beneath the worktree .scratch');
  const relay = values.has('--relay') ? loopbackRelay(values.get('--relay')!) : undefined;
  return {
    out,
    ...(values.has('--board-report') ? { boardReport: path.resolve(values.get('--board-report')!) } : {}),
    ...(values.has('--live-report') ? { liveReport: path.resolve(values.get('--live-report')!) } : {}),
    ...(values.has('--replay-report') ? { replayReport: path.resolve(values.get('--replay-report')!) } : {}),
    ...(relay ? { relay } : {}),
  };
}

export function shellQuote(value: string): string {
  if (value.includes('\0') || value.includes('\n') || value.includes('\r')) throw new Error('reproduction arguments cannot contain NUL or line breaks');
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export interface Reproduction {
  cwd: string;
  command: string;
  args: string[];
  shellCommand: string;
  source: 'report' | 'saved-report fallback' | 'new capture';
  label: string;
  historical: boolean;
}

function reproduction(value: unknown, label: string, source: Reproduction['source'], historical = true): Reproduction | null {
  const record = object(value), cwd = record.cwd, command = record.command, args = record.args;
  if (typeof cwd !== 'string' || typeof command !== 'string' || !command || !Array.isArray(args) ||
      args.some((arg) => typeof arg !== 'string')) return null;
  try {
    const argv = args as string[];
    const shellCommand = `cd ${shellQuote(cwd)} && ${[command, ...argv].map(shellQuote).join(' ')}`;
    return { cwd, command, args: argv, shellCommand, source, label, historical };
  } catch { return null; }
}

function reportSource(reportPath: string | undefined, out: string, loaded: boolean): { path: string | null; link: string | null; loaded: boolean } {
  if (!reportPath) return { path: null, link: null, loaded: false };
  const relative = path.relative(out, reportPath).split(path.sep).map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
  return { path: reportPath, link: relative || encodeURIComponent(path.basename(reportPath)), loaded };
}

function intervalLabel(item: Record<string, unknown>): { from: string | null; to: string | null } {
  const from = typeof item.fromISO === 'string' ? item.fromISO : finite(item.fromMs) === null ? null : new Date(item.fromMs as number).toISOString();
  const to = typeof item.toISO === 'string' ? item.toISO : finite(item.toMs) === null ? null : new Date(item.toMs as number).toISOString();
  return { from, to };
}

function normalizeScheduleMatch(value: unknown) {
  const source = object(value);
  const observedHeadcodes = nonnegativeInteger(source.observedHeadcodes), matchedHeadcodes = nonnegativeInteger(source.matchedHeadcodes);
  const observedIntervals = nonnegativeInteger(source.observedIntervals), matchedIntervals = nonnegativeInteger(source.matchedIntervals);
  if (matchedHeadcodes !== null && observedHeadcodes !== null && matchedHeadcodes > observedHeadcodes) return null;
  if (matchedIntervals !== null && observedIntervals !== null && matchedIntervals > observedIntervals) return null;
  const unmatchedHeadcodes = Array.isArray(source.unmatchedHeadcodes) ? source.unmatchedHeadcodes.filter((item): item is string => typeof item === 'string') : [];
  return {
    observedHeadcodes, matchedHeadcodes, percent: percent(matchedHeadcodes, observedHeadcodes), unmatchedHeadcodes,
    headcodeMatchMeaning: 'distinct observed headcodes with a timetable UID match at least once',
    observedIntervals, matchedIntervals, intervalPercent: percent(matchedIntervals, observedIntervals),
  };
}

function hourlyVariation(hours: Array<{ agreementPercent: number | null; medianLagSeconds: number | null }>) {
  const summarize = (values: Array<number | null>) => {
    const present = values.filter((value): value is number => value !== null);
    return present.length ? { min: Math.min(...present), max: Math.max(...present), range: Math.max(...present) - Math.min(...present) } : { min: null, max: null, range: null };
  };
  return {
    hours: hours.length,
    agreementPercent: summarize(hours.map((hour) => hour.agreementPercent)),
    medianLagSeconds: summarize(hours.map((hour) => hour.medianLagSeconds)),
  };
}

function makeBoardFallback(report: Record<string, unknown>, reportPath: string, out: string): unknown {
  const window = object(report.window), inputsDir = path.join(path.dirname(reportPath), 'inputs');
  const fromISO = typeof window.fromISO === 'string' ? window.fromISO : null;
  const toISO = typeof window.toISO === 'string' ? window.toISO : null;
  if (!fromISO || !toISO) return null;
  const args = ['kings-cross-src/tools/board-vs-trust.ts', '--recording', path.join(inputsDir, 'recording.ndjson'),
    '--schedule', path.join(inputsDir, 'schedule.json'), '--anchors', path.join(inputsDir, 'anchors.json'),
    '--from', fromISO, '--to', toISO];
  if (finite(window.withinSeconds) !== null) args.push('--within-seconds', String(window.withinSeconds));
  if (finite(window.stepSeconds) !== null) args.push('--step-seconds', String(window.stepSeconds));
  args.push('--out', path.join(out, 'board-recomputed'));
  if (Array.isArray(report.hourly)) args.push('--hourly');
  return { cwd: repoRoot, command: 'node', args };
}

function makeLiveFallback(reportPath: string, out: string): unknown {
  return { cwd: repoRoot, command: 'node', args: ['kings-cross-src/tools/live-vs-replay.ts', '--summarize', path.dirname(reportPath), '--out', path.join(out, 'live-recomputed')] };
}

export function summarizeAxis04(input: {
  board?: Record<string, unknown>;
  live?: Record<string, unknown>;
  replay?: Record<string, unknown>;
  boardPath?: string;
  livePath?: string;
  replayPath?: string;
  boardError?: string;
  liveError?: string;
  replayError?: string;
  out: string;
  relay?: string;
}) {
  const gaps: string[] = [];
  const boardSource = reportSource(input.boardPath, input.out, !!input.board);
  const liveSource = reportSource(input.livePath, input.out, !!input.live);
  const replaySource = reportSource(input.replayPath, input.out, !!input.replay);

  let liveReplay: Record<string, unknown> | null = null;
  let liveDiagnostic: Record<string, unknown> | null = null;
  if (!input.live) {
    gaps.push(input.liveError ? `Live/replay report unavailable: ${input.liveError}` : 'No live/replay report supplied; primary live/replay equivalence is unavailable.');
  } else {
    const primary = input.live;
    const samples = nonnegativeInteger(primary.samples), replaySamples = nonnegativeInteger(primary.replaySamples);
    const sameTrainSetSeconds = nonnegativeInteger(primary.sameTrainSetSeconds);
    const passed = typeof primary.passed === 'boolean' ? primary.passed : null;
    const position = object(primary.positionDifferenceM);
    const liveWindow = object(primary.interval), liveInterval = intervalLabel({ fromMs: liveWindow.startMs, toMs: liveWindow.endMs });
    liveReplay = {
      evidence: 'primary recorded-checkpoint live/replay comparison',
      status: passed === null ? 'UNAVAILABLE' : passed ? 'PASS' : 'FAIL',
      interval: { startISO: liveInterval.from, endISO: liveInterval.to, durationSeconds: finite(liveWindow.durationSeconds) },
      passed, samples, replaySamples, sameTrainSetSeconds,
      sameTrainSetPercent: percent(sameTrainSetSeconds, samples),
      positionDifferenceM: { median: finite(position.median), p95: finite(position.p95), max: finite(position.max) },
    };
    if (passed === null) gaps.push('Live/replay report has no primary top-level passed result.');
    if (liveInterval.from === null || liveInterval.to === null) gaps.push('Live/replay report has no UTC interval for the saved comparison.');
    if (samples === null || sameTrainSetSeconds === null) gaps.push('Live/replay report lacks a valid primary sample denominator or same-train count.');
    if (samples === 0) gaps.push('Primary live/replay sample denominator is zero; its same-train rate is unavailable.');
    const diagnostic = object(primary.sameInitialSnapshotControl);
    if (Object.keys(diagnostic).length) {
      const diagnosticPassed = typeof diagnostic.passed === 'boolean' ? diagnostic.passed : null;
      const diagnosticSamples = nonnegativeInteger(diagnostic.samples);
      const diagnosticSame = nonnegativeInteger(diagnostic.sameTrainSetSeconds);
      const diagnosticPosition = object(diagnostic.positionDifferenceM);
      liveDiagnostic = {
        label: 'sameInitialSnapshotControl (diagnostic only; never used for primary status)',
        status: diagnosticPassed === null ? 'UNAVAILABLE' : diagnosticPassed ? 'PASS' : 'FAIL',
        passed: diagnosticPassed, samples: diagnosticSamples, sameTrainSetSeconds: diagnosticSame,
        sameTrainSetPercent: percent(diagnosticSame, diagnosticSamples),
        positionDifferenceM: { median: finite(diagnosticPosition.median), p95: finite(diagnosticPosition.p95), max: finite(diagnosticPosition.max) },
      };
    }
  }

  let boardAgreement: Record<string, unknown> | null = null;
  let scheduleMatch: ReturnType<typeof normalizeScheduleMatch> | null = null;
  let hourly: Array<Record<string, unknown>> = [];
  let variation: ReturnType<typeof hourlyVariation> | null = null;
  if (!input.board) {
    gaps.push(input.boardError ? `Board comparison report unavailable: ${input.boardError}` : 'No board comparison report supplied; board agreement, hourly variation, and schedule match are unavailable.');
  } else {
    const summary = object(input.board.summary), window = object(input.board.window);
    const fullyObserved = nonnegativeInteger(summary.fullyObserved), boardAgreementCount = nonnegativeInteger(summary.boardAgreement);
    const agreementPercent = fullyObserved === 0 ? null : boardAgreementCount !== null && fullyObserved !== null
      ? percent(boardAgreementCount, fullyObserved) : finite(summary.agreementPercent);
    const medianLagSeconds = finite(summary.medianLagSeconds);
    boardAgreement = {
      fromISO: typeof window.fromISO === 'string' ? window.fromISO : null,
      toISO: typeof window.toISO === 'string' ? window.toISO : null,
      agreementPercent, medianLagSeconds, fullyObserved, boardAgreement: boardAgreementCount,
    };
    if (agreementPercent === null) gaps.push('Board agreement percent is unavailable (no fully observed movements or missing summary value).');
    if (medianLagSeconds === null) gaps.push('Board median lag is unavailable (no agreed observations or missing summary value).');

    if (Array.isArray(input.board.hourly) && input.board.hourly.length) {
      hourly = input.board.hourly.map((value) => {
        const item = object(value), hourSummary = object(item.summary), interval = intervalLabel(item);
        const hourlySchedule = normalizeScheduleMatch(item.scheduleMatch);
        const completeCount = nonnegativeInteger(hourSummary.fullyObserved), agreedCount = nonnegativeInteger(hourSummary.boardAgreement);
        const hourAgreement = completeCount === 0 ? null : agreedCount !== null && completeCount !== null
          ? percent(agreedCount, completeCount) : finite(hourSummary.agreementPercent);
        return {
          fromISO: interval.from, toISO: interval.to,
          agreementPercent: hourAgreement, medianLagSeconds: finite(hourSummary.medianLagSeconds),
          fullyObserved: completeCount, boardAgreement: agreedCount,
          scheduleMatchPercent: hourlySchedule?.percent ?? null,
        };
      });
      variation = hourlyVariation(hourly.map((hour) => ({ agreementPercent: hour.agreementPercent as number | null, medianLagSeconds: hour.medianLagSeconds as number | null })));
    } else {
      gaps.push('Board report has no hourly comparison data; hourly variation is unavailable.');
    }

    scheduleMatch = normalizeScheduleMatch(input.board.scheduleMatch);
    if (!scheduleMatch) gaps.push('Board report has no valid schedule match counts.');
    else if (scheduleMatch.observedHeadcodes === null) gaps.push('Schedule match denominator (observed headcodes) is unavailable.');
    else if (scheduleMatch.observedHeadcodes === 0) gaps.push('Schedule match share is unavailable because no headcodes were observed.');
  }

  let boardReproduction: Reproduction | null = null;
  if (input.board) {
    const fromReport = reproduction(input.board.reproduce, 'Recompute historical board comparison', 'report');
    const fallback = !fromReport && input.boardPath ? reproduction(makeBoardFallback(input.board, input.boardPath, input.out), 'Recompute board comparison from frozen inputs', 'saved-report fallback') : null;
    boardReproduction = fromReport ?? fallback;
    if (!boardReproduction) gaps.push('Board report has no usable exact reproduction command.');
  }

  let liveReproduction: Reproduction | null = null;
  if (input.live) {
    const fromReport = reproduction(input.live.reproduce, 'Recompute historical live/replay comparison', 'report');
    const fallback = !fromReport && input.livePath ? reproduction(makeLiveFallback(input.livePath, input.out), 'Recompute saved live/replay capture', 'saved-report fallback') : null;
    liveReproduction = fromReport ?? fallback;
    if (!liveReproduction) gaps.push('Live/replay report has no usable saved-capture reproduction command.');
  }

  let replayReproduction: Reproduction | null = null;
  if (input.replay) {
    replayReproduction = reproduction(object(input.replay.reproducibility).command, 'Recompute replay berth and motion report', 'report');
    if (!replayReproduction) gaps.push('Replay berth report has no usable exact reproduction command.');
  }

  const newCapture = input.relay ? reproduction({
    cwd: repoRoot, command: 'timeout', args: ['720', 'node', 'kings-cross-src/tools/live-vs-replay.ts', '--out', path.join(input.out, 'live-capture-60s'),
      '--seconds', '60', '--start', 'checkpoint', '--checkpoint-wait', '610', '--relay', input.relay],
  }, 'New 60-second live capture (new window; does not reproduce historical observations)', 'new capture', false) : null;

  let berthEvidence: Record<string, unknown> | null = null;
  if (!input.replay) {
    gaps.push(input.replayError ? `Replay berth report unavailable: ${input.replayError}` : 'No replay berth report supplied; berth inventory, step jumps, and placeholder draw evidence are unavailable.');
  } else {
    const coverage = object(input.replay.coverage), churn = object(input.replay.headcodeChurn), steps = object(input.replay.stepSummary);
    const motion = object(input.replay.motion), recordings = Array.isArray(input.replay.recordings) ? input.replay.recordings : [];
    const berths = Array.isArray(coverage.berths) ? coverage.berths.map(object) : [];
    const unmappedReasons: Record<string, number> = {};
    for (const berth of berths) if (berth.classification === 'unmapped' && typeof berth.reason === 'string') {
      unmappedReasons[berth.reason] = (unmappedReasons[berth.reason] ?? 0) + 1;
    }
    const platformRows = Array.isArray(input.replay.platforms) ? input.replay.platforms.map(object) : [];
    const reconciliation = object(input.replay.berthsReconciliation);
    const inputHashes = object(object(input.replay.reproducibility).inputHashes);
    const recordingInputs = Array.isArray(inputHashes.recordings) ? inputHashes.recordings.map(object) :
      Object.keys(object(input.replay.recordingInput)).length ? [object(input.replay.recordingInput)] : [];
    berthEvidence = {
      status: typeof input.replay.ok === 'boolean' ? input.replay.ok ? 'PASS' : 'FAIL' : 'UNAVAILABLE',
      recordingCount: recordings.length || recordingInputs.length || 1,
      coverage: { seen: nonnegativeInteger(coverage.seen), anchored: nonnegativeInteger(coverage.anchored), unmapped: nonnegativeInteger(coverage.unmapped), unmappedReasons },
      stepSummary: { physicalStepEvents: nonnegativeInteger(steps.physicalStepEvents), unmeasuredEndpointEvents: nonnegativeInteger(steps.unmeasuredEndpointEvents),
        mappedPairs: nonnegativeInteger(steps.mappedPairs), disconnectedPairs: nonnegativeInteger(steps.disconnectedPairs),
        reversalPairs: nonnegativeInteger(steps.reversalPairs), impliedSpeedFlagPairs: nonnegativeInteger(steps.impliedSpeedFlagPairs) },
      headcodeChurn: { physicalIds: nonnegativeInteger(churn.physicalIds), renames: nonnegativeInteger(churn.renames),
        idsWithMultipleDescriptions: nonnegativeInteger(churn.idsWithMultipleDescriptions) },
      platforms: { checked: platformRows.length, incorrectTargetTracks: platformRows.filter((item) => item.correctTargetTrack === false).length,
        wrongTrackHeldSamples: platformRows.reduce((n, item) => n + (nonnegativeInteger(item.actuallyHeldWrongTrackSamples) ?? 0), 0) },
      placeholderDraw: { starsDrawn: nonnegativeInteger(motion.starsDrawn), status: motion.starsDrawn === 0 ? 'PASS' : motion.starsDrawn === undefined ? 'UNAVAILABLE' : 'FAIL' },
      inputs: recordingInputs.map((record) => ({ path: typeof record.path === 'string' ? record.path : null,
        sha256: typeof record.sha256 === 'string' ? record.sha256 : null, bytes: nonnegativeInteger(record.capturedBytes) })),
      reconciliation: Object.keys(reconciliation).length ? {
        status: typeof reconciliation.status === 'string' ? reconciliation.status : 'UNAVAILABLE',
        candidatePlacement: object(reconciliation.candidatePlacement), artifacts: object(reconciliation.artifacts),
      } : null,
    };
    if (recordings.length > 0 && !Array.isArray(object(input.replay.unionInventory).berths)) {
      gaps.push('Replay multi-recording report has no union berth inventory.');
    }
  }

  return {
    schema: 1,
    axis: '04',
    sources: { board: boardSource, live: liveSource, replay: replaySource },
    liveReplay,
    liveDiagnostic,
    boardAgreement,
    hourly,
    hourlyVariation: variation,
    scheduleMatch,
    berthEvidence,
    reproductions: { board: boardReproduction, liveReplay: liveReproduction, replay: replayReproduction, newLiveCapture: newCapture },
    gaps,
  };
}

async function loadReport(reportPath: string | undefined): Promise<{ report?: Record<string, unknown>; error?: string }> {
  if (!reportPath) return {};
  try {
    const parsed: unknown = JSON.parse(await readFile(reportPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'JSON root is not an object' };
    return { report: parsed as Record<string, unknown> };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { error: reason };
  }
}

function markdownLink(label: string, link: string | null): string {
  return link ? `[${label}](<${link}>)` : `${label} (not supplied)`;
}

function mdTableCell(value: unknown): string {
  const display = typeof value === 'number' && Number.isFinite(value) ? String(Number(value.toFixed(3))) : String(value ?? '—');
  return display.replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');
}

function fenced(command: string): string {
  const longest = Math.max(0, ...[...command.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}sh\n${command}\n${fence}`;
}

export function renderAxis04Markdown(summary: ReturnType<typeof summarizeAxis04>): string {
  const lines = ['# Axis 04 — Live-data correctness', '',
    '## Primary live/replay equivalence', ''];
  if (!summary.liveReplay) lines.push('Unavailable: no usable live/replay report was supplied.', '');
  else {
    const live = summary.liveReplay;
    const interval = object(live.interval);
    lines.push(`**${live.status}** — recorded-checkpoint comparison; same-train seconds ${mdTableCell(live.sameTrainSetSeconds)}/${mdTableCell(live.samples)} (${mdTableCell(live.sameTrainSetPercent)}%). Window: ${mdTableCell(interval.startISO)} to ${mdTableCell(interval.endISO)} UTC (${mdTableCell(interval.durationSeconds)} s). Position difference median / p95 / max: ${mdTableCell(object(live.positionDifferenceM).median)} / ${mdTableCell(object(live.positionDifferenceM).p95)} / ${mdTableCell(object(live.positionDifferenceM).max)} m.`);
    if (summary.liveDiagnostic) {
      const diagnostic = summary.liveDiagnostic;
      lines.push('', `Diagnostic only, same live snapshot: **${diagnostic.status}**, ${mdTableCell(diagnostic.sameTrainSetSeconds)}/${mdTableCell(diagnostic.samples)} same-train seconds (${mdTableCell(diagnostic.sameTrainSetPercent)}%). This does not change the primary result.`);
    }
    lines.push('');
  }

  lines.push('## Board agreement and schedule match', '');
  if (!summary.boardAgreement) lines.push('Unavailable: no usable board comparison report was supplied.', '');
  else {
    const board = summary.boardAgreement;
    lines.push(`Board agreement: **${mdTableCell(board.boardAgreement)}/${mdTableCell(board.fullyObserved)} fully observed movements (${mdTableCell(board.agreementPercent)}%)**; median lag **${mdTableCell(board.medianLagSeconds)} s**. Window: ${mdTableCell(board.fromISO)} to ${mdTableCell(board.toISO)} UTC. Lag is the nearest qualifying board sample time minus TRUST actual; it measures label visibility, not board response latency.`, '');
    const schedule = summary.scheduleMatch;
    if (!schedule) lines.push('Schedule match share: unavailable.', '');
    else lines.push(`Schedule match: **${mdTableCell(schedule.matchedHeadcodes)}/${mdTableCell(schedule.observedHeadcodes)} distinct observed headcodes matched at least once (${mdTableCell(schedule.percent)}%)**; interval coverage ${mdTableCell(schedule.matchedIntervals)}/${mdTableCell(schedule.observedIntervals)} (${mdTableCell(schedule.intervalPercent)}%).`, '');
    if (summary.hourly.length) {
      lines.push('Hourly variation (UTC):', '', '| Hour | Board agreement % (agreed/complete) | Median lag s | Schedule headcodes matched % |', '| --- | ---: | ---: | ---: |');
      for (const hour of summary.hourly) {
        const source = summary.sources.board.link;
        const label = `${hour.fromISO ?? '?'} → ${hour.toISO ?? '?'}`;
        const linkedLabel = source ? markdownLink(label, source) : label;
        const complete = mdTableCell(hour.fullyObserved), agreed = mdTableCell(hour.boardAgreement);
        lines.push(`| ${linkedLabel} | ${mdTableCell(hour.agreementPercent)} (${agreed}/${complete}) | ${mdTableCell(hour.medianLagSeconds)} | ${mdTableCell(hour.scheduleMatchPercent)} |`);
      }
      const variation = summary.hourlyVariation;
      lines.push('', 'A board agreement dash means there were no fully observed TRUST movements in that hour; it is not evidence of 100% agreement. A median-lag dash means no qualifying board observation was available.',
        `Observed hourly range: board agreement ${mdTableCell(object(variation?.agreementPercent).min)}–${mdTableCell(object(variation?.agreementPercent).max)}% (spread ${mdTableCell(object(variation?.agreementPercent).range)} points); median lag ${mdTableCell(object(variation?.medianLagSeconds).min)}–${mdTableCell(object(variation?.medianLagSeconds).max)} s (spread ${mdTableCell(object(variation?.medianLagSeconds).range)} s).`, '');
    } else lines.push('Hourly variation: unavailable.', '');
  }

  lines.push('## Replay berth and motion evidence', '');
  if (!summary.berthEvidence) lines.push('Unavailable: no usable replay berth report was supplied.', '');
  else {
    const evidence = object(summary.berthEvidence), coverage = object(evidence.coverage), steps = object(evidence.stepSummary);
    const churn = object(evidence.headcodeChurn), placeholders = object(evidence.placeholderDraw), platforms = object(evidence.platforms);
    const reasons = object(coverage.unmappedReasons);
    const reasonText = Object.keys(reasons).sort().map((reason) => `${reason} ${reasons[reason]}`).join(', ') || 'none';
    lines.push(`**${mdTableCell(evidence.status)}** — ${mdTableCell(evidence.recordingCount)} recording(s); ${mdTableCell(coverage.seen)} unique seen berths, ${mdTableCell(coverage.anchored)} anchored and ${mdTableCell(coverage.unmapped)} unmapped (${reasonText}). Step jumps: ${mdTableCell(steps.mappedPairs)} mapped, ${mdTableCell(steps.unmeasuredEndpointEvents)} with an unmapped endpoint, ${mdTableCell(steps.impliedSpeedFlagPairs)} implied-speed flags. Headcode churn: ${mdTableCell(churn.renames)} renames over ${mdTableCell(churn.physicalIds)} recording-local physical ids. Platform targets: ${mdTableCell(platforms.incorrectTargetTracks)} incorrect, ${mdTableCell(platforms.wrongTrackHeldSamples)} wrong-track held samples. Placeholder draw check: **${mdTableCell(placeholders.status)}**, ${mdTableCell(placeholders.starsDrawn)} ` + '****' + ' drawn samples.', '');
    const reconciliation = object(evidence.reconciliation);
    if (Object.keys(reconciliation).length) lines.push(`Position-preserving candidate reconciliation: **${mdTableCell(reconciliation.status)}**; runtime anchors were compared with the candidate map. The full diff and candidate evidence are in the replay report.`, '');
  }

  lines.push('## Sources', '',
    `- ${markdownLink('Board comparison report', summary.sources.board.link)}`,
    `- ${markdownLink('Live/replay report', summary.sources.live.link)}`,
    `- ${markdownLink('Replay berth and motion report', summary.sources.replay.link)}`, '',
    '## Reproduction commands', '');
  const commands = [summary.reproductions.board, summary.reproductions.liveReplay, summary.reproductions.replay, summary.reproductions.newLiveCapture]
    .filter((value): value is Reproduction => value !== null);
  if (!commands.length) lines.push('No reproduction command is available.', '');
  for (const command of commands) lines.push(`### ${command.label}`, '', `Working directory: \`${command.cwd.replaceAll('`', '\\`')}\``, '', fenced(command.shellCommand), '');
  if (summary.gaps.length) lines.push('## Evidence gaps', '', ...summary.gaps.map((gap) => `- ${gap}`), '');
  return `${lines.join('\n').trimEnd()}\n`;
}

async function main(): Promise<void> {
  const options = axis04Options(process.argv.slice(2));
  const { safeOutputDirectory, writePrivateFile }: {
    safeOutputDirectory(root: string, directory: string): Promise<string>;
    writePrivateFile(file: string, body: string): Promise<void>;
  } = await import(new URL('./evidence.mjs', import.meta.url).href);
  await safeOutputDirectory(repoRoot, options.out);
  const [boardLoaded, liveLoaded, replayLoaded] = await Promise.all([loadReport(options.boardReport), loadReport(options.liveReport), loadReport(options.replayReport)]);
  const summary = summarizeAxis04({ board: boardLoaded.report, live: liveLoaded.report, boardPath: options.boardReport,
    livePath: options.liveReport, replay: replayLoaded.report, replayPath: options.replayReport,
    boardError: boardLoaded.error, liveError: liveLoaded.error, replayError: replayLoaded.error, out: options.out, relay: options.relay });
  await writePrivateFile(path.join(options.out, 'axis-04-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await writePrivateFile(path.join(options.out, 'axis-04-summary.md'), renderAxis04Markdown(summary));
  console.log(JSON.stringify({ out: options.out, primaryLiveReplay: summary.liveReplay?.status ?? 'UNAVAILABLE',
    boardAgreementPercent: summary.boardAgreement?.agreementPercent ?? null, gaps: summary.gaps.length }, null, 2));
}

if (process.argv.includes('--help')) {
  console.log('node tools/axis04-summary.ts --out .scratch/dir [--board-report <json>] [--live-report <json>] [--replay-report <json>] [--relay http://127.0.0.1:8787]');
} else if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`axis04-summary: ${(error as Error).message}`); process.exitCode = 1; });
}
