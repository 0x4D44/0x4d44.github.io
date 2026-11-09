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

export interface SummaryOptions { out: string; boardReport?: string; boardReports?: string[]; liveReport?: string; replayReport?: string; relay?: string }

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
  const boardReports: string[] = [];
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!['--out', '--board-report', '--live-report', '--replay-report', '--relay'].includes(key!) || !value || value.startsWith('--') || (key !== '--board-report' && values.has(key!))) {
      throw new Error('usage: axis04-summary.ts --out <.scratch/dir> [--board-report <json> ...] [--live-report <json>] [--replay-report <json>] [--relay <loopback-origin>]');
    }
    if (key === '--board-report') boardReports.push(value);
    else values.set(key!, value);
  }
  if (!values.has('--out')) throw new Error('--out is required');
  const out = path.resolve(values.get('--out')!);
  if (out === scratchRoot || !isWithin(scratchRoot, out)) throw new Error('--out must be beneath the worktree .scratch');
  const relay = values.has('--relay') ? loopbackRelay(values.get('--relay')!) : undefined;
  return {
    out,
    ...(boardReports.length ? { boardReport: path.resolve(boardReports[0]!), boardReports: boardReports.map((report) => path.resolve(report)) } : {}),
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

function sumComplete(values: Array<number | null>): number | null {
  return values.every((value) => value !== null) ? values.reduce<number>((sum, value) => sum + value!, 0) : null;
}

function aggregateScheduleMatches(matches: Array<ReturnType<typeof normalizeScheduleMatch>>): ReturnType<typeof normalizeScheduleMatch> | null {
  if (!matches.length) return null;
  const present = matches.filter((match): match is NonNullable<typeof match> => match !== null);
  if (!present.length) return null;
  const observedHeadcodes = sumComplete(present.map((match) => match.observedHeadcodes));
  const matchedHeadcodes = sumComplete(present.map((match) => match.matchedHeadcodes));
  const observedIntervals = sumComplete(present.map((match) => match.observedIntervals));
  const matchedIntervals = sumComplete(present.map((match) => match.matchedIntervals));
  return {
    observedHeadcodes, matchedHeadcodes, percent: percent(matchedHeadcodes, observedHeadcodes),
    unmatchedHeadcodes: [...new Set(present.flatMap((match) => match.unmatchedHeadcodes))],
    headcodeMatchMeaning: present.length > 1
      ? 'per-report headcode counts; the aggregate denominator counts recording-date/headcode pairs, so a headcode can count once on each date'
      : 'distinct observed headcodes with a timetable UID match at least once',
    observedIntervals, matchedIntervals, intervalPercent: percent(matchedIntervals, observedIntervals),
  };
}

function finiteRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(object(value)).flatMap(([key, item]) => {
    const number = finite(item);
    return number === null ? [] : [[key, number]];
  }));
}

function boardDate(report: Record<string, unknown> | undefined, reportPath: string | undefined): string | null {
  const fromISO = object(report?.window).fromISO;
  if (typeof fromISO === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fromISO)) return fromISO.slice(0, 10);
  return reportPath ? /(?:^|[\\/])board-(\d{4}-\d{2}-\d{2})(?:[\\/]|$)/.exec(reportPath)?.[1] ?? null : null;
}

function aggregateBoardAgreements(
  reports: Array<Record<string, unknown>>,
  expectedReports: number,
): Record<string, unknown> | null {
  if (!reports.length) return null;
  const fullyObserved = sumComplete(reports.map((report) => nonnegativeInteger(report.fullyObserved)));
  const boardAgreement = sumComplete(reports.map((report) => nonnegativeInteger(report.boardAgreement)));
  const agreementPercent = fullyObserved === 0 ? null : boardAgreement !== null && fullyObserved !== null
    ? percent(boardAgreement, fullyObserved) : reports.length === 1 ? finite(reports[0]!.agreementPercent) : null;
  const fromDates = reports.map((report) => report.fromISO).filter((value): value is string => typeof value === 'string').sort();
  const toDates = reports.map((report) => report.toISO).filter((value): value is string => typeof value === 'string').sort();
  return {
    fromISO: fromDates[0] ?? null,
    toISO: toDates.at(-1) ?? null,
    agreementPercent,
    medianLagSeconds: reports.length === 1 ? finite(reports[0]!.medianLagSeconds) : null,
    fullyObserved, boardAgreement,
    reports: reports.length, expectedReports, complete: reports.length === expectedReports,
  };
}

function makeBoardFallback(report: Record<string, unknown>, reportPath: string, out: string, date?: string | null): unknown {
  const window = object(report.window), inputsDir = path.join(path.dirname(reportPath), 'inputs');
  const fromISO = typeof window.fromISO === 'string' ? window.fromISO : null;
  const toISO = typeof window.toISO === 'string' ? window.toISO : null;
  if (!fromISO || !toISO) return null;
  const args = ['kings-cross-src/tools/board-vs-trust.ts', '--recording', path.join(inputsDir, 'recording.ndjson'),
    '--schedule', path.join(inputsDir, 'schedule.json'), '--anchors', path.join(inputsDir, 'anchors.json'),
    '--from', fromISO, '--to', toISO];
  if (finite(window.withinSeconds) !== null) args.push('--within-seconds', String(window.withinSeconds));
  if (finite(window.stepSeconds) !== null) args.push('--step-seconds', String(window.stepSeconds));
  args.push('--out', path.join(out, date ? `board-recomputed-${date}` : 'board-recomputed'));
  if (Array.isArray(report.hourly)) args.push('--hourly');
  return { cwd: repoRoot, command: 'node', args };
}

function makeLiveFallback(reportPath: string, out: string): unknown {
  return { cwd: repoRoot, command: 'node', args: ['kings-cross-src/tools/live-vs-replay.ts', '--summarize', path.dirname(reportPath), '--out', path.join(out, 'live-recomputed')] };
}

export function summarizeAxis04(input: {
  board?: Record<string, unknown>;
  boardReports?: Array<{ board?: Record<string, unknown>; path?: string; error?: string }>;
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
      activity: { live: finiteRecord(object(primary.activity).live), replay: finiteRecord(object(primary.activity).replay) },
      coverageWarnings: Array.isArray(primary.coverageWarnings) ? primary.coverageWarnings.filter((warning): warning is string => typeof warning === 'string') : [],
      activeHourObserved: typeof primary.activeHourObserved === 'boolean' ? primary.activeHourObserved : null,
      positionDifferenceM: { median: finite(position.median), p95: finite(position.p95), max: finite(position.max) },
    };
    if (passed === null) gaps.push('Live/replay report has no primary top-level passed result.');
    if (liveInterval.from === null || liveInterval.to === null) gaps.push('Live/replay report has no UTC interval for the saved comparison.');
    if (samples === null || sameTrainSetSeconds === null) gaps.push('Live/replay report lacks a valid primary sample denominator or same-train count.');
    if (samples === 0) gaps.push('Primary live/replay sample denominator is zero; its same-train rate is unavailable.');
    if (liveReplay.activeHourObserved === null) gaps.push('Live/replay report has no active-hour movement coverage result; active-hour coverage is unknown.');
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
  const expectedBoardInputs = input.boardReports ?? (input.board || input.boardPath || input.boardError
    ? [{ board: input.board, path: input.boardPath, error: input.boardError }]
    : []);
  const boardReports: Array<{
    date: string | null;
    source: ReturnType<typeof reportSource>;
    boardAgreement: Record<string, unknown> | null;
    hourly: Array<Record<string, unknown>>;
    scheduleMatch: ReturnType<typeof normalizeScheduleMatch> | null;
    reproduction: Reproduction | null;
    error: string | null;
  }> = [];
  const boardAgreementReports: Array<Record<string, unknown>> = [];
  const scheduleReports: Array<ReturnType<typeof normalizeScheduleMatch>> = [];
  for (const boardInput of expectedBoardInputs) {
    const report = boardInput.board, reportPath = boardInput.path;
    const date = boardDate(report, reportPath);
    const dateLabel = date ? ` for ${date}` : '';
    const source = reportSource(reportPath, input.out, !!report);
    if (!report) {
      const reason = boardInput.error ?? (reportPath ? 'report file not found or could not be loaded' : 'no report supplied');
      gaps.push(`Board comparison report unavailable${dateLabel}: ${reason}`);
      boardReports.push({ date, source, boardAgreement: null, hourly: [], scheduleMatch: null, reproduction: null, error: reason });
      continue;
    }

    const summary = object(report.summary), window = object(report.window);
    const fullyObserved = nonnegativeInteger(summary.fullyObserved), boardAgreementCount = nonnegativeInteger(summary.boardAgreement);
    const agreementPercent = fullyObserved === 0 ? null : boardAgreementCount !== null && fullyObserved !== null
      ? percent(boardAgreementCount, fullyObserved) : finite(summary.agreementPercent);
    const medianLagSeconds = finite(summary.medianLagSeconds);
    const reportAgreement: Record<string, unknown> = {
      fromISO: typeof window.fromISO === 'string' ? window.fromISO : null,
      toISO: typeof window.toISO === 'string' ? window.toISO : null,
      agreementPercent, medianLagSeconds, fullyObserved, boardAgreement: boardAgreementCount,
    };
    boardAgreementReports.push(reportAgreement);
    const prefix = date ? `Board report ${date}: ` : 'Board report ';
    if (agreementPercent === null) gaps.push(`${prefix}agreement percent is unavailable (no fully observed movements or missing summary value).`);
    if (medianLagSeconds === null) gaps.push(`${prefix}median lag is unavailable (no agreed observations or missing summary value).`);

    const reportHourly: Array<Record<string, unknown>> = [];
    if (Array.isArray(report.hourly) && report.hourly.length) {
      for (const value of report.hourly) {
        const item = object(value), hourSummary = object(item.summary), interval = intervalLabel(item);
        const hourlySchedule = normalizeScheduleMatch(item.scheduleMatch);
        const completeCount = nonnegativeInteger(hourSummary.fullyObserved), agreedCount = nonnegativeInteger(hourSummary.boardAgreement);
        const hourAgreement = completeCount === 0 ? null : agreedCount !== null && completeCount !== null
          ? percent(agreedCount, completeCount) : finite(hourSummary.agreementPercent);
        reportHourly.push({
          reportDate: date,
          fromISO: interval.from, toISO: interval.to,
          agreementPercent: hourAgreement, medianLagSeconds: finite(hourSummary.medianLagSeconds),
          fullyObserved: completeCount, boardAgreement: agreedCount,
          scheduleMatchPercent: hourlySchedule?.percent ?? null,
          scheduleMatchObservedHeadcodes: hourlySchedule?.observedHeadcodes ?? null,
          scheduleMatchMatchedHeadcodes: hourlySchedule?.matchedHeadcodes ?? null,
          scheduleMatchObservedIntervals: hourlySchedule?.observedIntervals ?? null,
          scheduleMatchMatchedIntervals: hourlySchedule?.matchedIntervals ?? null,
        });
      }
    } else {
      gaps.push(`${prefix}has no hourly comparison data; hourly variation is unavailable.`);
    }

    const reportScheduleMatch = normalizeScheduleMatch(report.scheduleMatch);
    if (!reportScheduleMatch) gaps.push(`${prefix}has no valid schedule match counts.`);
    else {
      scheduleReports.push(reportScheduleMatch);
      if (reportScheduleMatch.observedHeadcodes === null) gaps.push(`${prefix}schedule match denominator (observed headcodes) is unavailable.`);
      else if (reportScheduleMatch.observedHeadcodes === 0) gaps.push(`${prefix}schedule match share is unavailable because no headcodes were observed.`);
    }

    const suffix = expectedBoardInputs.length > 1 && date ? ` (${date})` : '';
    const fromReport = reproduction(report.reproduce, `Recompute historical board comparison${suffix}`, 'report');
    const fallback = !fromReport && reportPath
      ? reproduction(makeBoardFallback(report, reportPath, input.out, date), `Recompute board comparison from frozen inputs${suffix}`, 'saved-report fallback')
      : null;
    const reportReproduction = fromReport ?? fallback;
    if (!reportReproduction) gaps.push(`${prefix}has no usable exact reproduction command.`);
    boardReports.push({ date, source, boardAgreement: reportAgreement, hourly: reportHourly,
      scheduleMatch: reportScheduleMatch, reproduction: reportReproduction, error: null });
  }

  if (!expectedBoardInputs.length) {
    gaps.push(input.boardError ? `Board comparison report unavailable: ${input.boardError}` : 'No board comparison report supplied; board agreement, hourly variation, and schedule match are unavailable.');
  }
  boardAgreement = aggregateBoardAgreements(boardAgreementReports, expectedBoardInputs.length);
  scheduleMatch = aggregateScheduleMatches(scheduleReports);
  const hourly = boardReports.flatMap((report) => report.hourly);
  const variation = hourly.length
    ? hourlyVariation(hourly.map((hour) => ({ agreementPercent: hour.agreementPercent as number | null, medianLagSeconds: hour.medianLagSeconds as number | null })))
    : null;
  const boardReproductions = boardReports.map((report) => report.reproduction).filter((value): value is Reproduction => value !== null);
  const boardSource = boardReports.find((report) => report.source.loaded)?.source ?? boardReports[0]?.source ?? reportSource(input.boardPath, input.out, false);

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
    const platformStepSummary = object(input.replay.platformStepSummary), platformStepOutcomes = object(platformStepSummary.outcomes);
    const platformOutcomeNames = ['reached-correct-track', 'blocked', 'pending', 'queued', 'route-refused', 'no-body',
      ...(nonnegativeInteger(platformStepOutcomes['same-stop-transfer']) !== null ? ['same-stop-transfer'] : [])];
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
      platformStepSummary: { total: nonnegativeInteger(platformStepSummary.total),
        ...(nonnegativeInteger(platformStepSummary.incoming) !== null ? {incoming: nonnegativeInteger(platformStepSummary.incoming)} : {}),
        ...(nonnegativeInteger(platformStepSummary.sameStopTransfers) !== null ? {sameStopTransfers: nonnegativeInteger(platformStepSummary.sameStopTransfers)} : {}),
        reachedCorrectTrack: nonnegativeInteger(platformStepSummary.reachedCorrectTrack), unresolved: nonnegativeInteger(platformStepSummary.unresolved),
        outcomes: Object.fromEntries(platformOutcomeNames.map((name) => [name, nonnegativeInteger(platformStepOutcomes[name])])) },
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
    sources: { board: boardSource, boardReports: boardReports.map(({ date, source, error }) => ({ date, ...source, error })), live: liveSource, replay: replaySource },
    liveReplay,
    liveDiagnostic,
    boardAgreement,
    boardReports,
    hourly,
    hourlyVariation: variation,
    scheduleMatch,
    berthEvidence,
    reproductions: { board: boardReproductions[0] ?? null, boardReports: boardReproductions, liveReplay: liveReproduction, replay: replayReproduction, newLiveCapture: newCapture },
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
    const activity = object(live.activity), liveActivity = object(activity.live), replayActivity = object(activity.replay);
    const activeHour = live.activeHourObserved === true ? 'OBSERVED' : live.activeHourObserved === false ? 'NOT OBSERVED' : 'UNKNOWN';
    lines.push(`**${live.status}** — recorded-checkpoint comparison; same-train seconds ${mdTableCell(live.sameTrainSetSeconds)}/${mdTableCell(live.samples)} (${mdTableCell(live.sameTrainSetPercent)}%). Window: ${mdTableCell(interval.startISO)} to ${mdTableCell(interval.endISO)} UTC (${mdTableCell(interval.durationSeconds)} s). Position difference median / p95 / max: ${mdTableCell(object(live.positionDifferenceM).median)} / ${mdTableCell(object(live.positionDifferenceM).p95)} / ${mdTableCell(object(live.positionDifferenceM).max)} m.`);
    lines.push('', `This is transport equivalence, not active-hour movement proof. Active-hour coverage: **${activeHour}**. Live moving transitions: ${mdTableCell(liveActivity.movingTransitions)}; replay moving transitions: ${mdTableCell(replayActivity.movingTransitions)}.`, '');
    if (Array.isArray(live.coverageWarnings) && live.coverageWarnings.length) {
      lines.push(`Coverage warnings: ${live.coverageWarnings.map((warning) => mdTableCell(warning)).join('; ')}`, '');
    }
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
    const multiDate = summary.boardReports.length > 1;
    const completeness = multiDate ? ` across ${mdTableCell(board.reports)}/${mdTableCell(board.expectedReports)} supplied date reports` : '';
    const lagText = multiDate ? 'Median lag is retained per date; no median is averaged across dates.' : `median lag **${mdTableCell(board.medianLagSeconds)} s**.`;
    lines.push(`Board agreement${completeness}: **${mdTableCell(board.boardAgreement)}/${mdTableCell(board.fullyObserved)} fully observed movements (${mdTableCell(board.agreementPercent)}%)**; ${lagText} Window: ${mdTableCell(board.fromISO)} to ${mdTableCell(board.toISO)} UTC. Lag is the nearest qualifying board sample time minus TRUST actual; it measures label visibility, not board response latency.`, '');
    const schedule = summary.scheduleMatch;
    if (!schedule) lines.push('Schedule match share: unavailable.', '');
    else {
      const scheduleUnit = multiDate ? 'headcode/date pairs' : 'distinct observed headcodes';
      lines.push(`Schedule match: **${mdTableCell(schedule.matchedHeadcodes)}/${mdTableCell(schedule.observedHeadcodes)} ${scheduleUnit} matched at least once (${mdTableCell(schedule.percent)}%)**; interval coverage ${mdTableCell(schedule.matchedIntervals)}/${mdTableCell(schedule.observedIntervals)} (${mdTableCell(schedule.intervalPercent)}%).`, '');
    }
    if (multiDate) {
      lines.push('Board and schedule metrics by recording date (counts remain separate; aggregate percentages are weighted by their observed counts):', '',
        '| Date | Report | Agreement % (agreed/complete) | Median lag s | Schedule headcodes matched | Schedule intervals matched |',
        '| --- | --- | ---: | ---: | ---: | ---: |');
      for (const report of summary.boardReports) {
        const dateLabel = report.date ?? 'unknown date';
        const reportLink = report.source.link ? markdownLink(dateLabel, report.source.link) : dateLabel;
        const dayBoard = object(report.boardAgreement), daySchedule = object(report.scheduleMatch);
        const agreement = report.boardAgreement ? `${mdTableCell(dayBoard.agreementPercent)} (${mdTableCell(dayBoard.boardAgreement)}/${mdTableCell(dayBoard.fullyObserved)})` : 'unavailable';
        const headcodes = report.scheduleMatch ? `${mdTableCell(daySchedule.matchedHeadcodes)}/${mdTableCell(daySchedule.observedHeadcodes)} (${mdTableCell(daySchedule.percent)}%)` : 'unavailable';
        const intervals = report.scheduleMatch ? `${mdTableCell(daySchedule.matchedIntervals)}/${mdTableCell(daySchedule.observedIntervals)} (${mdTableCell(daySchedule.intervalPercent)}%)` : 'unavailable';
        lines.push(`| ${mdTableCell(dateLabel)} | ${reportLink} | ${agreement} | ${mdTableCell(dayBoard.medianLagSeconds)} | ${headcodes} | ${intervals} |`);
      }
      lines.push('');
    }
    if (summary.hourly.length) {
      lines.push('Hourly variation (UTC):', '', '| Hour | Board agreement % (agreed/complete) | Median lag s | Schedule headcodes matched % |', '| --- | ---: | ---: | ---: |');
      for (const hour of summary.hourly) {
        const report = summary.boardReports.find((item) => item.date === hour.reportDate);
        const source = report?.source.link ?? summary.sources.board.link;
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
    const platformSteps = object(evidence.platformStepSummary), platformOutcomes = object(platformSteps.outcomes);
    const churn = object(evidence.headcodeChurn), placeholders = object(evidence.placeholderDraw), platforms = object(evidence.platforms);
    const reasons = object(coverage.unmappedReasons);
    const reasonText = Object.keys(reasons).sort().map((reason) => `${reason} ${reasons[reason]}`).join(', ') || 'none';
    lines.push(`**${mdTableCell(evidence.status)}** — ${mdTableCell(evidence.recordingCount)} recording(s); ${mdTableCell(coverage.seen)} unique seen berths, ${mdTableCell(coverage.anchored)} anchored and ${mdTableCell(coverage.unmapped)} unmapped (${reasonText}). Step jumps: ${mdTableCell(steps.mappedPairs)} mapped, ${mdTableCell(steps.unmeasuredEndpointEvents)} with an unmapped endpoint, ${mdTableCell(steps.impliedSpeedFlagPairs)} implied-speed flags. Headcode churn: ${mdTableCell(churn.renames)} renames over ${mdTableCell(churn.physicalIds)} recording-local physical ids. Platform targets: ${mdTableCell(platforms.incorrectTargetTracks)} incorrect, ${mdTableCell(platforms.wrongTrackHeldSamples)} wrong-track held samples. Placeholder draw check: **${mdTableCell(placeholders.status)}**, ${mdTableCell(placeholders.starsDrawn)} ` + '****' + ' drawn samples.', '');
    if (platformSteps.total !== null && platformSteps.total !== undefined) {
      const outcomeText = Object.entries(platformOutcomes).filter(([, count]) => typeof count === 'number' && count > 0)
        .map(([name, count]) => `${name.replaceAll('-', ' ')} ${mdTableCell(count)}`).join(', ') || 'none';
      const incoming = platformSteps.incoming ?? platformSteps.total;
      const transfers = platformSteps.sameStopTransfers === undefined ? '' : ` ${mdTableCell(platformSteps.sameStopTransfers)} same-stop transfers; ${mdTableCell(platformSteps.total)} TD platform observations total.`;
      lines.push(`Platform step arrivals: ${mdTableCell(platformSteps.reachedCorrectTrack)}/${mdTableCell(incoming)} reached the correct track; ${mdTableCell(platformSteps.unresolved)} unresolved.${transfers} Outcomes: ${outcomeText}.`, '');
    } else lines.push('Platform step arrival outcomes: unavailable in the saved replay report.', '');
    const reconciliation = object(evidence.reconciliation);
    if (Object.keys(reconciliation).length) lines.push(`Position-preserving candidate reconciliation: **${mdTableCell(reconciliation.status)}**; runtime anchors were compared with the candidate map. The full diff and candidate evidence are in the replay report.`, '');
  }

  lines.push('## Sources', '');
  if (summary.boardReports.length > 1) {
    for (const report of summary.boardReports) {
      lines.push(`- ${markdownLink(`Board comparison report ${report.date ?? '(date unknown)'}`, report.source.link)}`);
    }
  } else lines.push(`- ${markdownLink('Board comparison report', summary.sources.board.link)}`);
  lines.push(
    `- ${markdownLink('Live/replay report', summary.sources.live.link)}`,
    `- ${markdownLink('Replay berth and motion report', summary.sources.replay.link)}`, '',
    '## Reproduction commands', '');
  const boardCommands = summary.reproductions.boardReports.length ? summary.reproductions.boardReports : summary.reproductions.board ? [summary.reproductions.board] : [];
  const commands = [...boardCommands, summary.reproductions.liveReplay, summary.reproductions.replay, summary.reproductions.newLiveCapture]
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
  const [boardReports, liveLoaded, replayLoaded] = await Promise.all([
    Promise.all((options.boardReports ?? []).map(async (reportPath) => ({ path: reportPath, ...await loadReport(reportPath) }))),
    loadReport(options.liveReport), loadReport(options.replayReport),
  ]);
  const summary = summarizeAxis04({ boardReports: boardReports.map(({ path: reportPath, report, error }) => ({ path: reportPath, board: report, error })), live: liveLoaded.report,
    livePath: options.liveReport, replay: replayLoaded.report, replayPath: options.replayReport,
    liveError: liveLoaded.error, replayError: replayLoaded.error, out: options.out, relay: options.relay });
  await writePrivateFile(path.join(options.out, 'axis-04-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await writePrivateFile(path.join(options.out, 'axis-04-summary.md'), renderAxis04Markdown(summary));
  console.log(JSON.stringify({ out: options.out, primaryLiveReplay: summary.liveReplay?.status ?? 'UNAVAILABLE',
    boardAgreementPercent: summary.boardAgreement?.agreementPercent ?? null, gaps: summary.gaps.length }, null, 2));
}

if (process.argv.includes('--help')) {
  console.log('node tools/axis04-summary.ts --out .scratch/dir [--board-report <json> ...] [--live-report <json>] [--replay-report <json>] [--relay http://127.0.0.1:8787]');
} else if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`axis04-summary: ${(error as Error).message}`); process.exitCode = 1; });
}
