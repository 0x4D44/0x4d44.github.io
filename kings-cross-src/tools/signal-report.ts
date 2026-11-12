// Private rubric evidence from the same controller the page uses. No learned table is bundled.
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../core/graph.ts';
import { MIN_PRECISION, MIN_SUPPORT, qualifiesSignalEvidence, revalidateSignalHypotheses, SIGNAL_WINDOWS, trackSclass } from '../core/sclass.ts';
import type { LooValidation, SignalHypothesis, SignalState, SignalWindows, TimedTdEvent } from '../core/sclass.ts';
import type { Aspect } from '../core/signal-aspects.ts';
import type { AnchorMap } from '../core/anchors.ts';
import type { KxData, RawElement } from '../core/osm.ts';
import { createSignals, signalRefBerth, validatedSignalHypotheses } from '../web/src/signals.ts';
import type { OverlaySignal, PublicSignalReview, SignalEvent, SignalOverlay } from '../web/src/signals.ts';
import { buildSignalOverlay, publicSignalReviewMatches } from './build-signals.ts';
import publicReviews from '../web/src/data/kx-signal-review.json' with { type: 'json' };

export const CAPTURE_STATES: readonly SignalState[] = ['proceed', 'danger', 'unknown'];
export interface SignalInterval { headId: number; berth: string; state: Aspect; startMs: number; endMs: number }
export function capturePlan(intervals: readonly SignalInterval[]) {
  return CAPTURE_STATES.map(state => {
    // Prefer an OSM head and its earliest complete interval: less replay work, same evidence.
    const interval = intervals.filter(i => i.state === state && i.endMs - i.startMs >= 2)
      .sort((a, b) => Number(b.headId > 0) - Number(a.headId > 0) || a.startMs - b.startMs)[0];
    return interval ? { ...interval, timeMs: interval.startMs + Math.min(500, (interval.endMs - interval.startMs) / 2) } : null;
  }).filter((v): v is NonNullable<typeof v> => v !== null);
}
const admitted = (h: SignalHypothesis) => h.status === 'decoded' && qualifiesSignalEvidence(h.training) && qualifiesSignalEvidence(h.heldOut);
const pct = (v: number | null) => v === null ? '—' : `${(100 * v).toFixed(2)}%`;
const cell = (v: unknown) => String(v ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
type FixedOutcome = 'insufficient-support' | 'below-precision-or-recall' | 'meets-acceptance';
type FixedEvidence = { support: number; trials: number; cycles: number; precision: number | null; recall: number | null };
function fixedEvidence(h: SignalHypothesis): FixedEvidence {
  return { support: h.heldOut.support, trials: h.heldOut.trials, cycles: h.heldOut.support + h.heldOut.unmatchedCycles,
    precision: h.heldOut.precision, recall: h.heldOut.recall ?? null };
}
function fixedOutcome(e: FixedEvidence): FixedOutcome {
  if (e.support < MIN_SUPPORT) return 'insufficient-support';
  if (e.precision === null || e.precision < MIN_PRECISION || e.recall === null || e.recall < MIN_PRECISION) return 'below-precision-or-recall';
  return 'meets-acceptance';
}
function aggregateFixed(items: readonly { heldOut: FixedEvidence }[]) {
  const support = items.reduce((n, h) => n + h.heldOut.support, 0);
  const trials = items.reduce((n, h) => n + h.heldOut.trials, 0);
  const cycles = items.reduce((n, h) => n + h.heldOut.cycles, 0);
  return { mappings: items.length, support, trials, cycles, precision: cycles ? support / cycles : null, recall: trials ? support / trials : null };
}
function outcomeCounts(items: readonly { heldOut: FixedEvidence }[]) {
  const counts = { insufficientSupport: 0, belowPrecisionOrRecallThreshold: 0, meetsAcceptance: 0 };
  for (const item of items) {
    const outcome = fixedOutcome(item.heldOut);
    if (outcome === 'insufficient-support') counts.insufficientSupport += 1;
    else if (outcome === 'below-precision-or-recall') counts.belowPrecisionOrRecallThreshold += 1;
    else counts.meetsAcceptance += 1;
  }
  return counts;
}
function tableFoldRelation(folds: unknown, startMs: number | null, endMs: number | null): string {
  if (startMs === null || endMs === null || !Array.isArray(folds)) return 'unknown-folds';
  const valid = folds.filter((fold): fold is { startMs: number; splitMs: number; endMs: number } =>
    fold !== null && typeof fold === 'object' && Number.isFinite(fold.startMs) && Number.isFinite(fold.splitMs) && Number.isFinite(fold.endMs) &&
    fold.startMs <= fold.splitMs && fold.splitMs <= fold.endMs);
  if (!valid.length) return 'unknown-folds';
  const training = valid.some(f => f.startMs < f.splitMs && endMs >= f.startMs && startMs < f.splitMs);
  const heldOut = valid.some(f => f.splitMs < f.endMs && endMs >= f.splitMs && startMs <= f.endMs);
  if (training && heldOut) return 'overlaps-training-and-held-out';
  if (training) return 'overlaps-training';
  if (heldOut) return 'overlaps-held-out';
  return 'outside-table-folds-independence-unknown';
}

export const OSM_REVIEW_RADIUS_M = 40;
export type OsmHeadReviewOutcome = 'unique-osm-main-candidate' | 'no-compatible-osm-main-signal';
export interface OsmHeadReview {
  outcome: OsmHeadReviewOutcome;
  reason: string;
  nearby: { id: number; ref: string | null; distanceM: number; sameWay: boolean; sameDirection: boolean; main: boolean; refBerth: string | null }[];
}

/**
 * Review an inferred head's position against public OSM signal nodes. Only a unique OSM
 * main signal on the same way, facing the same way, within the radius, whose ref does not
 * name another berth could locate it; anything else leaves the position uncertain. The
 * review never moves a head or invents a position.
 */
export function osmHeadReview(head: { berth: string; point: readonly number[]; travel: readonly number[]; wayId: number | null },
  signals: readonly OverlaySignal[], claimed: ReadonlySet<number> = new Set(), radiusM = OSM_REVIEW_RADIUS_M): OsmHeadReview {
  const nearby = signals.map(s => {
    const distanceM = Math.hypot(s.edge.point[0] - head.point[0]!, s.edge.point[1] - head.point[1]!);
    const dot = s.travel[0] * head.travel[0]! + s.travel[1] * head.travel[1]!;
    return { id: s.id, ref: s.ref ?? null, distanceM: Math.round(distanceM * 10) / 10, sameWay: head.wayId !== null && s.edge.wayId === head.wayId,
      sameDirection: dot > 0.9, main: (s.kinds ?? []).includes('main'), refBerth: signalRefBerth(s.ref) ?? null };
  }).filter(s => s.distanceM <= radiusM).sort((a, b) => a.distanceM - b.distanceM);
  const fits = nearby.filter(s => s.sameWay && s.sameDirection && s.main && !claimed.has(s.id) && (s.ref === null || s.refBerth === head.berth));
  if (fits.length === 1) return { outcome: 'unique-osm-main-candidate', nearby,
    reason: `OSM main signal ${fits[0]!.id} is the only same-way, same-direction candidate within ${radiusM} m; identity still needs a private topology review before any rebinding` };
  const why = !nearby.length ? `no OSM railway=signal node within ${radiusM} m`
    : fits.length > 1 ? `${fits.length} same-way, same-direction OSM main signals within ${radiusM} m; none is distinguished`
    : nearby.map(s => `${s.id}${s.ref ? ` (${s.ref})` : ''} ${s.distanceM} m: ${[
      !s.main && 'not a main signal', !s.sameWay && 'other way', !s.sameDirection && 'faces the other way',
      s.ref !== null && s.refBerth !== head.berth && 'ref names another signal', claimed.has(s.id) && 'already bound to another berth',
    ].filter(Boolean).join(', ')}`).join('; ');
  return { outcome: 'no-compatible-osm-main-signal', nearby, reason: `Position left uncertain: ${why}` };
}

/** Includes every observed bit, every drawn head, and every decoded but unpositioned berth. */
export function signalReport(recordings: readonly (readonly TimedTdEvent[])[], data: KxData, overlay: SignalOverlay,
  anchors: AnchorMap, table: unknown, raw?: RawElement[], reviews: readonly PublicSignalReview[] = publicReviews.signals as PublicSignalReview[]) {
  const hypotheses = validatedSignalHypotheses(table, anchors.area);
  const metadata = table && typeof table === 'object' && !Array.isArray(table) ? table as Record<string, unknown> : {};
  const tableWindows = metadata.windows === undefined || metadata.windows === null ? undefined : metadata.windows as SignalWindows;
  const decoded = hypotheses.filter(admitted);
  const proceed = decoded.filter(h => (h.kind ?? 'proceed') === 'proceed');
  const rawById = new Map((raw ?? []).filter(e => e.type === 'node').map(e => [e.id, e]));
  const publicReviewById = new Map<number, PublicSignalReview>();
  for (const signal of overlay.signals) {
    const marker = signal.positionReview;
    if (!marker) continue;
    const candidates = reviews.filter(review => review.id === signal.id);
    if (candidates.length !== 1 || candidates[0]!.status !== marker.status) continue;
    const rawPosition = raw === undefined ? undefined : rawById.get(signal.id)?.tags?.['railway:signal:position'] ?? null;
    if (publicSignalReviewMatches(signal, candidates[0]!, rawPosition, raw !== undefined))
      publicReviewById.set(signal.id, candidates[0]!);
  }
  const layer = createSignals(overlay, new THREE.Scene(), { area: anchors.area, platforms: data.platforms });
  const graph = buildGraph(data);
  layer.setAnchors(anchors, graph); layer.setTable(table);
  const records = layer.signals();
  // OSM nodes already standing for a berth cannot also locate an inferred head.
  const boundOsm = new Set(records.filter(r => !r.inferredPosition && r.group.userData.berth).map(r => r.signal.id));
  const headRows = records.map(r => {
    const berth = r.group.userData.berth as string | undefined;
    const source = r.mappingSource ?? 'osm-unbound';
    const anchor = anchors.anchors.find(a => a.berth === berth);
    const aspect = proceed.find(h => h.berth === berth);
    const rail = graph.edges.find(e => (e.a === r.signal.edge.from && e.b === r.signal.edge.to) || (e.a === r.signal.edge.to && e.b === r.signal.edge.from));
    const positionReview = !r.inferredPosition && publicReviewById.has(r.signal.id) ? publicReviewById.get(r.signal.id)! : {
      status: 'uncertain' as const, evidence: rail ? [`https://www.openstreetmap.org/way/${rail.wayId}`] : [] as string[],
      reason: r.inferredPosition ? `No public evidence identifies a signal position or side here; OSM way ${rail?.wayId ?? 'unavailable'} supports the rail only; ${r.label}; ${anchor?.evidence ?? 'anchor evidence unavailable'}`
        : 'No public review of this head\'s track position and side. Berth/reference identity alone cannot establish the mast side.',
    };
    const osmReview = r.inferredPosition && berth ? osmHeadReview({ berth, point: r.signal.edge.point, travel: r.signal.travel, wayId: rail?.wayId ?? null },
      overlay.signals, boundOsm) : null;
    if (osmReview) positionReview.reason = `${positionReview.reason}. OSM review: ${osmReview.reason}`;
    const previousPost = publicReviewById.get(r.signal.id)?.previousPost;
    const facing = r.signal.facing ?? [-r.signal.travel[0], -r.signal.travel[1]];
    return { id: r.signal.id, ref: r.signal.ref ?? null, berth: berth ?? null, decoded: Boolean(aspect),
      hypothesisId: aspect?.id ?? null, positionSource: source,
      review: source === 'reference' ? 'osm-ref-match' : source === 'nearby' || source === 'private-topology' ? 'topology' : 'unreviewed',
      inferred: r.inferredPosition, point: [...r.signal.edge.point], post: [r.group.position.x, r.group.position.y, r.group.position.z],
      facing: [...facing], travel: [...r.signal.travel], side: r.signal.side,
      positionReview, postDeltaM: previousPost ? [r.group.position.x - previousPost[0], r.group.position.z - previousPost[1]] : null,
      errorM: source === 'reference' ? 0 : anchor?.errorM ?? null,
      positionReason: source === 'reference' ? `OSM reference ${r.signal.ref} uniquely names the berth`
        : source === 'private-topology' ? 'Private one-to-one, same-edge, direction-compatible topology review within 40 m'
        : source === 'nearby' ? `Unique same-edge, direction-compatible OSM main signal within 20 m; ${anchor?.evidence ?? ''}`
        : r.inferredPosition ? `${r.label}; ${anchor?.evidence ?? 'anchor evidence unavailable'}`
        : 'OSM position retained; no admitted proceed identity for this head',
      osmReview, observedStates: [] as Aspect[], heldOut: aspect?.heldOut ?? null };
  });
  const decodedHeads = proceed.map(h => {
    const positions = headRows.filter(r => r.berth === h.berth && r.decoded);
    const unmapped = anchors.unmapped.find(a => a.berth === h.berth);
    const rawRefs = (raw ?? []).filter(e => e.type === 'node' && e.tags?.railway === 'signal' && signalRefBerth(e.tags.ref) === h.berth)
      .map(e => ({ id: e.id, ref: e.tags!.ref, inOverlay: overlay.signals.some(s => s.id === e.id) }));
    return { berth: h.berth, hypothesisId: h.id, address: h.address, bit: h.bit, heldOut: h.heldOut,
      headIds: positions.map(p => p.id), positionSource: positions[0]?.positionSource ?? null,
      reason: positions[0]?.positionReason ?? (unmapped ? `${unmapped.reason}: ${unmapped.detail}`
        : anchors.anchors.some(a => a.berth === h.berth) ? 'Anchor exists, but the controller could not establish a trustworthy head position'
        : 'No graph anchor or unique OSM reference identifies this berth'), rawRefs };
  });
  const seen = new Map<string, { address: string; bit: number; changes: number }>();
  const intervals: (SignalInterval & { recording: number })[] = [];
  for (const [recording, input] of recordings.entries()) {
    const rows = [...input].sort((a, b) => a.t - b.t);
    for (const change of trackSclass(rows, anchors.area).transitions) {
      const key = `${change.address}:${change.bit}`;
      const bit = seen.get(key) ?? { address: change.address, bit: change.bit, changes: 0 };
      if (change.from !== null) bit.changes++;
      seen.set(key, bit);
    }
    layer.reset();
    const current = new Map<number, SignalInterval>();
    const finish = (interval: SignalInterval, endMs: number) => {
      if (endMs > interval.startMs) intervals.push({ ...interval, endMs, recording });
    };
    for (let index = 0; index < rows.length;) {
      const t = rows[index]!.t;
      do { layer.apply(rows[index++] as SignalEvent); } while (index < rows.length && rows[index]!.t === t);
      for (const record of layer.signals()) {
        const head = headRows.find(h => h.id === record.signal.id);
        if (!head) continue;
        if (!head.observedStates.includes(record.state)) head.observedStates.push(record.state);
        if (!head.decoded || !head.berth) continue;
        const previous = current.get(head.id);
        if (previous?.state === record.state) continue;
        if (previous) finish(previous, t);
        current.set(head.id, { headId: head.id, berth: head.berth, state: record.state, startMs: t, endMs: t });
      }
    }
    for (const interval of current.values()) finish(interval, rows.at(-1)?.t ?? interval.startMs);
  }
  layer.dispose();
  const bits = [...seen.values()].sort((a, b) => Number.parseInt(a.address, 16) - Number.parseInt(b.address, 16) || a.bit - b.bit).map(bit => {
    const candidates = hypotheses.filter(h => h.address === bit.address && h.bit === bit.bit);
    const accepted = candidates.find(admitted);
    const measured = accepted ?? (candidates.length === 1 ? candidates[0] : undefined);
    return { ...bit, decoded: Boolean(accepted), kind: accepted?.kind ?? (accepted ? 'proceed' : 'unknown'),
      berth: accepted?.berth ?? null, headIds: accepted ? headRows.filter(h => h.berth === accepted.berth).map(h => h.id) : [],
      candidates: candidates.map(h => ({ id: h.id, berth: h.berth, to: h.to ?? null, kind: h.kind ?? 'proceed',
        decoded: admitted(h), heldOut: h.heldOut, reason: h.reason })),
      precision: measured?.heldOut.precision ?? null, recall: measured?.heldOut.recall ?? null,
      drivesAspect: Boolean(accepted && (accepted.kind ?? 'proceed') === 'proceed'),
      positionSources: accepted ? [...new Set(headRows.filter(h => h.berth === accepted.berth).map(h => h.positionSource))] : [] };
  });
  const total = (items: SignalHypothesis[]) => {
    const support = items.reduce((s, h) => s + h.heldOut.support, 0), cycles = items.reduce((s, h) => s + h.heldOut.support + h.heldOut.unmatchedCycles, 0);
    const trials = items.reduce((s, h) => s + h.heldOut.trials, 0);
    return { support, cycles, trials, precision: cycles ? support / cycles : null, recall: trials ? support / trials : null };
  };
  const fixed = hypotheses.filter(admitted);
  const excluded = hypotheses.filter(h => !admitted(h)).map(h => ({ hypothesisId: h.id, address: h.address, bit: h.bit,
    berth: h.berth, status: h.status, reason: h.reason }));
  const fixedRecordings = recordings.map((input, recording) => {
    const areaRows = input.filter(row => row.e.area === anchors.area);
    const range = areaRows.reduce((r, row) => ({ start: Math.min(r.start, row.t), end: Math.max(r.end, row.t) }),
      { start: Number.POSITIVE_INFINITY, end: Number.NEGATIVE_INFINITY });
    const startMs = areaRows.length ? range.start : null, endMs = areaRows.length ? range.end : null;
    const revalidated = revalidateSignalHypotheses(input, fixed, { area: anchors.area, windows: tableWindows });
    const mappings = revalidated.map(h => {
      const evidence = fixedEvidence(h);
      return { hypothesisId: h.id, address: h.address, bit: h.bit, berth: h.berth, kind: h.kind ?? 'proceed',
        to: h.to ?? null, proceedValue: h.proceedValue, heldOut: evidence, outcome: fixedOutcome(evidence) };
    });
    const proceedMappings = mappings.filter(h => h.kind === 'proceed');
    return { recording, rowCount: input.length, areaRowCount: areaRows.length, startMs, endMs,
      spanMs: startMs === null || endMs === null ? null : endMs - startMs,
      spanCoverage: 'captured-span-only', partialDayLimitation: 'May be a partial day; completeness is not established.',
      tableFoldRelation: tableFoldRelation(metadata.folds, startMs, endMs), mappings,
      all: aggregateFixed(mappings), proceed: aggregateFixed(proceedMappings), outcomes: outcomeCounts(mappings) };
  });
  const fixedPairs = fixedRecordings.flatMap(recording => recording.mappings);
  const fixedRevalidation = {
    method: 'Fixed revalidation of mappings admitted by the supplied table; no discovery or admission changes.',
    windows: tableWindows ?? SIGNAL_WINDOWS, minimumSupport: MIN_SUPPORT, minimumPrecision: MIN_PRECISION, minimumRecall: MIN_PRECISION,
    admittedMappingCount: fixed.length, excludedUnknownMappings: excluded.filter(h => h.status === 'unknown'), excludedMappings: excluded,
    recordings: fixedRecordings,
    aggregate: { all: aggregateFixed(fixedPairs), proceed: aggregateFixed(fixedPairs.filter(h => h.kind === 'proceed')),
      outcomes: outcomeCounts(fixedPairs) },
  };
  const captures = recordings.map((_, recording) => ({ recording, cases: capturePlan(intervals.filter(i => i.recording === recording)) }));
  const reviewCounts = (items: { review: string }[]) => Object.fromEntries([...new Set(items.map(h => h.review))].sort().map(review => [review, items.filter(h => h.review === review).length]));
  return { area: anchors.area, states: CAPTURE_STATES, unsupportedStates: ['caution'],
    validation: metadata.validation ?? null, loo: (metadata.loo ?? null) as LooValidation | null, windows: metadata.windows ?? null, folds: metadata.folds ?? null,
    evidencePolicy: 'Supplied table held-out evidence; >=3 supports and precision/recall >=0.8 in both folds. Route bits never drive an aspect. No re-learning or synthetic hypotheses.',
    positionPolicy: 'Public review covers horizontal track position, tagged direction and side, independently of berth identity. Topology-only positions remain uncertain. Lateral offsets and head heights are schematic; no survey accuracy or inferred mast side is claimed.',
    counts: { addresses: new Set(bits.map(b => b.address)).size, bits: bits.length, decodedBits: bits.filter(b => b.decoded).length,
      unknownBits: bits.filter(b => !b.decoded).length, decodedProceedBits: proceed.length, decodedRouteBits: decoded.filter(h => h.kind === 'route').length,
      drawnHeads: headRows.length, positionedDecodedHeads: headRows.filter(h => h.decoded).length,
      unpositionedDecodedHeads: decodedHeads.filter(h => !h.headIds.length).length, positionedUndecodedHeads: headRows.filter(h => !h.decoded).length,
      reviewedDecodedHeads: headRows.filter(h => h.decoded && h.review !== 'unreviewed').length,
      positionReviewedDecodedHeads: headRows.filter(h => h.decoded && h.positionReview.status === 'reviewed').length,
      positionUncertainDecodedHeads: headRows.filter(h => h.decoded && h.positionReview.status !== 'reviewed').length,
      positionReview: {
        reviewed: headRows.filter(h => h.positionReview.status === 'reviewed').length,
        topology: headRows.filter(h => h.positionReview.status !== 'reviewed' && h.review === 'topology').length,
        uncertain: headRows.filter(h => h.positionReview.status !== 'reviewed' && h.review !== 'topology').length,
      },
      publicOverlayReview: reviewCounts(overlay.signals), effectiveOverlayReview: reviewCounts(headRows.filter(h => !h.inferred)), drawnHeadReview: reviewCounts(headRows) },
    heldOut: { all: total(decoded), proceed: total(proceed) }, fixedRevalidation, bits, heads: headRows, decodedHeads, captures, intervals };
}

function looLines(loo: unknown): string[] {
  const value = loo as LooValidation | null | undefined;
  if (!value || !Array.isArray(value.nested)) return [];
  return ['## Leave-one-recording-out held-out recall', '', `${value.rule}. Sessions split at receipt gaps over ${value.sessionGapMs / 60_000} min. Each row repeats the admission without that session, then scores the mappings it admits on that session only.`, '',
    '| Session | Span | Admitted without it | All precision / recall | Proceed precision / recall |', '|---:|---|---:|---:|---:|',
    ...value.nested.map(n => `| ${n.recording} | ${new Date(n.startMs).toISOString()} to ${new Date(n.endMs).toISOString()} | ${n.admitted} | ${pct(n.all.precision)} / ${pct(n.all.recall)} (${n.all.support}/${n.all.trials}) | ${pct(n.proceed.precision)} / ${pct(n.proceed.recall)} (${n.proceed.support}/${n.proceed.trials}) |`), ''];
}

export function signalReportMarkdown(report: ReturnType<typeof signalReport>): string {
  const lines = ['# Signals evidence', '', report.evidencePolicy, '', `Counts: ${JSON.stringify(report.counts)}`,
    report.positionPolicy,
    'Legacy publicOverlayReview/effectiveOverlayReview/drawnHeadReview and reviewedDecodedHeads count identity evidence, not geographic approval. Use positionReview and positionReviewedDecodedHeads for positions.',
    `Validation: ${cell(report.validation)}; windows (ms): ${JSON.stringify(report.windows)}; folds: ${JSON.stringify(report.folds)}.`,
    `Held-out micro precision ${pct(report.heldOut.all.precision)}, recall ${pct(report.heldOut.all.recall)}.`,
    'Caution is unsupported by this decoder; no caution screenshot or aspect is claimed.', '',
    ...looLines(report.loo),
    '## Fixed mapping revalidation', '',
    `${report.fixedRevalidation.method} Per-recording scores use the supplied table windows, or the core defaults when absent. Revalidation does not change table admission or rendered head states.`,
    `Acceptance requires support >= ${report.fixedRevalidation.minimumSupport} and precision and recall >= ${pct(report.fixedRevalidation.minimumPrecision)}.`,
    `Outcomes: insufficient (<${report.fixedRevalidation.minimumSupport} support) ${report.fixedRevalidation.aggregate.outcomes.insufficientSupport}; below precision/recall threshold ${report.fixedRevalidation.aggregate.outcomes.belowPrecisionOrRecallThreshold}; meets acceptance ${report.fixedRevalidation.aggregate.outcomes.meetsAcceptance}. Excluded unknown mappings: ${report.fixedRevalidation.excludedUnknownMappings.length}.`,
    'Recording spans describe captured rows only and may cover a partial day. Fold overlap is shown below; outside the reported fold bounds means independence is unknown, not assumed.',
    '', '| Recording | Rows (area rows) | Captured span | Table fold relation | All precision / recall | Proceed precision / recall |', '|---:|---:|---|---|---:|---:|'];
  const timeLabel = (value: number | null) => value === null ? '—' : new Date(value).toISOString();
  for (const r of report.fixedRevalidation.recordings) lines.push(`| ${r.recording} | ${r.rowCount} (${r.areaRowCount}) | ${timeLabel(r.startMs)} to ${timeLabel(r.endMs)}; ${r.spanMs === null ? 'span unknown' : `${(r.spanMs / 60_000).toFixed(1)} min`} | ${r.tableFoldRelation} | ${pct(r.all.precision)} / ${pct(r.all.recall)} | ${pct(r.proceed.precision)} / ${pct(r.proceed.recall)} |`);
  lines.push('', '| Recording | Address.bit | Fixed mapping | Kind | Support / trials | Cycles | Precision | Recall | Outcome |', '|---:|---|---|---|---:|---:|---:|---:|---|');
  for (const r of report.fixedRevalidation.recordings) for (const h of r.mappings)
    lines.push(`| ${r.recording} | ${h.address}.${h.bit} | ${cell(`${h.hypothesisId}: ${h.berth}=${h.proceedValue}${h.to ? ` → ${h.to}` : ''}`)} | ${h.kind} | ${h.heldOut.support} / ${h.heldOut.trials} | ${h.heldOut.cycles} | ${pct(h.heldOut.precision)} | ${pct(h.heldOut.recall)} | ${h.outcome} |`);
  if (!report.fixedRevalidation.recordings.some(r => r.mappings.length)) lines.push('| — | — | no admitted fixed mappings | — | — | — | — | — | — |');
  lines.push('',
    '| Address | Bit | Meaning | Berth | Head(s) | Position source | Held-out precision | Recall |', '|---|---:|---|---|---|---|---:|---:|');
  for (const b of report.bits) lines.push(`| ${b.address} | ${b.bit} | ${b.decoded ? b.kind : 'unknown'} | ${cell(b.berth)} | ${b.headIds.join(', ') || 'unpositioned'} | ${b.positionSources.join(', ') || 'none'} | ${pct(b.precision)} | ${pct(b.recall)} |`);
  lines.push('', '## Every decoded proceed head', '', '| Berth | Head(s) | Source | Held-out precision | Recall | Recorded position reason |', '|---|---|---|---:|---:|---|');
  for (const h of report.decodedHeads) lines.push(`| ${h.berth} | ${h.headIds.join(', ') || 'unpositioned'} | ${cell(h.positionSource)} | ${pct(h.heldOut.precision)} | ${pct(h.heldOut.recall ?? h.heldOut.precision)} | ${cell(h.reason)} |`);
  lines.push('', '## Decoded heads with an uncertain position', '',
    `Each decoded head without a reviewed position, checked against public OSM railway=signal nodes within ${OSM_REVIEW_RADIUS_M} m. A head is never moved by this review.`, '',
    '| Head | Berth | Identity source | Outcome | Reason |', '|---|---|---|---|---|');
  const uncertain = report.heads.filter(h => h.decoded && h.positionReview.status !== 'reviewed');
  for (const h of uncertain) lines.push(`| ${h.id} | ${cell(h.berth)} | ${h.positionSource} | ${h.osmReview?.outcome ?? 'osm-node-side-untagged'} | ${cell(h.osmReview?.reason ?? h.positionReview.reason)} |`);
  if (!uncertain.length) lines.push('| — | — | — | — | every decoded head has a reviewed position |');
  lines.push('', '## Every drawn head: position and side review', '',
    'Identity/topology and geographic review are separate. An OSM reference does not establish a missing mast side; unknown aspects are independent of uncertain positions. Deltas compare with the public overlay before this review; private inferred positions have no public baseline.', '',
    '| Head / ref | Identity source | Geographic review | Track point (x,z) | Side drawn | Post change (dx,dz), m | Evidence and limits |', '|---|---|---|---|---|---|---|');
  for (const h of report.heads) lines.push(`| ${h.id} / ${cell(h.ref)} | ${h.positionSource} | ${h.positionReview.status} | ${h.point.join(', ')} | ${h.side} | ${h.postDeltaM?.map(n => n.toFixed(3)).join(', ') ?? 'no public baseline'} | ${cell(h.positionReview.reason)} ${h.positionReview.evidence.join(' ')} |`);
  lines.push('', '## Every positioned head without a decoded proceed aspect', '', '| Head | Ref | Berth | Position source | Reason |', '|---|---|---|---|---|');
  for (const h of report.heads.filter(h => !h.decoded)) lines.push(`| ${h.id} | ${cell(h.ref)} | ${cell(h.berth)} | ${h.positionSource} | ${cell(h.positionReason)} |`);
  return `${lines.join('\n')}\n`;
}

export async function main(args = process.argv.slice(2)) {
  const values = new Map<string, string[]>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]!, value = args[i + 1];
    if (!['--recording', '--anchors', '--table', '--raw', '--out'].includes(flag) || !value || value.startsWith('--')) throw new Error('usage: signal-report.ts --recording <ndjson> [--recording <ndjson>] --anchors <json> --table <json> [--raw <osm.json>] --out <worktree/.scratch/dir>');
    if (flag !== '--recording' && values.has(flag)) throw new Error(`duplicate ${flag}`);
    values.set(flag, [...values.get(flag) ?? [], value]);
  }
  const one = (name: string) => { const v = values.get(name)?.[0]; if (!v) throw new Error(`missing ${name}`); return resolve(v); };
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const out = one('--out'), scratch = await realpath(resolve(root, '.scratch'));
  const inside = (p: string) => { const r = relative(scratch, p); return r === '' || !r.startsWith('..') && !isAbsolute(r); };
  if (!inside(out)) throw new Error('--out must be under worktree .scratch');
  // Canonicalise existing ancestors before creating anything, so symlinks cannot export private data.
  let ancestor = out;
  for (;;) { try { if (!inside(await realpath(ancestor))) throw new Error('output resolves outside .scratch'); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; ancestor = dirname(ancestor); } }
  await mkdir(out, { recursive: true });
  const frozen = await realpath(out);
  const save = async (name: string, content: string | Buffer) => {
    const file = resolve(frozen, name);
    // Exclusive creation refuses existing files, symlinks and hardlinks alike.
    await writeFile(file, content, { flag: 'wx', mode: 0o600 });
    return { file: name, sha256: createHash('sha256').update(content).digest('hex') };
  };
  const json = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
  const data = await json(resolve(root, 'kings-cross-src/web/src/data/kx-track.json')) as KxData;
  const overlay = await json(resolve(root, 'kings-cross-src/web/src/data/kx-signals.json')) as SignalOverlay;
  const anchorsBytes = await readFile(one('--anchors')), tableBytes = await readFile(one('--table'));
  const anchors = JSON.parse(anchorsBytes.toString()) as AnchorMap, table = JSON.parse(tableBytes.toString());
  const raw = values.has('--raw') ? await json(one('--raw')) : undefined;
  const recordings: TimedTdEvent[][] = [], sources = [];
  for (const [index, input] of (values.get('--recording') ?? []).entries()) {
    const bytes = await readFile(resolve(input));
    // The active recorder can append during a read; freeze only complete NDJSON lines.
    const complete = bytes.subarray(0, bytes.lastIndexOf(10) + 1);
    const rows = complete.toString().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as TimedTdEvent);
    if (!rows.length || rows.some(r => !Number.isFinite(r.t) || !r.e || typeof r.e.area !== 'string' || typeof r.e.kind !== 'string')) throw new Error('invalid or empty recording');
    recordings.push(rows); sources.push(await save(`recording-${index}.ndjson`, complete));
  }
  if (!recordings.length) throw new Error('missing --recording');
  const rawElements = raw === undefined ? undefined : raw.elements ?? raw;
  const privateReview = buildSignalOverlay(data, { raw: rawElements, anchors }).privateReview;
  const reviewedTable = { ...table, signalMappings: privateReview.signalMappings };
  const report = signalReport(recordings, data, overlay, anchors, reviewedTable, rawElements);
  const inputs = { anchors: await save('anchors.json', anchorsBytes), table: await save('sclass.json', JSON.stringify(reviewedTable)), recordings: sources,
    overlaySha256: createHash('sha256').update(JSON.stringify(overlay)).digest('hex') };
  await save('private-topology.json', JSON.stringify(privateReview, null, 2));
  await save('signal-report.json', JSON.stringify({ ...report, inputs }, null, 2));
  await save('signal-report.md', signalReportMarkdown(report));
  console.log(JSON.stringify({ ...report.counts, heldOut: report.heldOut, out: frozen }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error((error as Error).message); process.exitCode = 1; });
