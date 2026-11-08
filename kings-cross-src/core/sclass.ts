// Temporal evidence for S-class meanings, independent of the relay, clock and filesystem.
// Correlation can propose a signal-like bit; it cannot identify points or track circuits.
import { NOT_A_TRAIN } from './anchors.ts';
import type { AnchorMap } from './anchors.ts';

export type BitValue = 0 | 1;
export type SignalState = 'proceed' | 'danger' | 'unknown';
/** Expanded, numeric bytes, with canonical uppercase hex addresses (at least two digits). */
export type ByteState = Readonly<Record<string, number>>;

export interface TimedTdEvent {
  t: number;
  e: {
    kind: string;
    area: string;
    msgType?: string;
    address?: string;
    data?: string;
    descr?: string;
    from?: string;
    to?: string;
    sclass?: unknown;
  };
}

export interface BitTransition {
  t: number;
  address: string;
  /** Bit 0 is the least significant bit of the byte, independent of hex string order. */
  bit: number;
  /** A first observation establishes state; it is not evidence of an aspect change. */
  from: BitValue | null;
  to: BitValue;
}

export interface ByteUpdate {
  accepted: boolean;
  state: ByteState;
  transitions: BitTransition[];
}

export interface SclassTrace {
  state: ByteState;
  transitions: BitTransition[];
  acceptedMessages: number;
  rejectedMessages: number;
}

export interface SignalWindows {
  beforeMs: number;
  afterMs: number;
  /** S-class and C-class receipt order can differ slightly at the relay. */
  earlyMs?: number;
  /** Later release is route-like evidence, never an aspect. */
  routeAfterMs?: number;
}

// Fixed before seeing held-out results. Broad enough for approach/TD receipt jitter,
// short enough that a different train's clearing should not explain a passage.
export const SIGNAL_WINDOWS: Readonly<SignalWindows> = { beforeMs: 180_000, afterMs: 1_500, earlyMs: 1_500, routeAfterMs: 30_000 };
export const MIN_SUPPORT = 3;
export const MIN_PRECISION = 0.8;

export interface SignalEvidence {
  trials: number;
  support: number;
  contradictions: number;
  precision: number | null;
  /** Passage coverage; distinct from precision, which penalises false clearings. */
  recall?: number | null;
  /** Complete clear/danger cycles in the fold not matched to a passage of this berth. */
  unmatchedCycles: number;
}

export interface SignalHypothesis {
  id: string;
  address: string;
  bit: number;
  berth: string;
  /** Older tables without a kind contain proceed candidates only. */
  kind?: 'proceed' | 'route';
  to?: string;
  proceedValue: BitValue;
  training: SignalEvidence;
  heldOut: SignalEvidence;
  status: 'decoded' | 'unknown';
  reason: string;
}

export interface BitSummary {
  address: string;
  bit: number;
  initialValue: BitValue;
  finalValue: BitValue;
  changes: number;
  status: 'decoded' | 'unknown';
  hypothesisIds: string[];
}

export interface BerthSignalSummary {
  berth: string;
  anchored: boolean;
  status: 'decoded' | 'unknown';
  hypothesisIds: string[];
}

export interface SclassAnalysis {
  area: string;
  startMs: number;
  endMs: number;
  splitMs: number;
  folds: { startMs: number; splitMs: number; endMs: number }[];
  windows: SignalWindows;
  minimumSupport: number;
  minimumPrecision: number;
  steps: {
    total: number;
    training: number;
    heldOut: number;
    excludedAtEdges: number;
    ignoredNotATrain: number;
    ignoredIncomplete: number;
    duplicates: number;
  };
  trace: SclassTrace;
  hypotheses: SignalHypothesis[];
  bits: BitSummary[];
  berths: BerthSignalSummary[];
}

function addressKey(value: number): string { return value.toString(16).toUpperCase().padStart(2, '0'); }
function bitValue(byte: number, bit: number): BitValue { return ((byte >> bit) & 1) as BitValue; }

/** SF changes one byte; SG/SH refresh four bytes, in ascending address order. */
export function updateBytes(state: ByteState, row: TimedTdEvent, area = 'Y9'): ByteUpdate {
  const e = row.e;
  const width = e.msgType === 'SF' ? 1 : e.msgType === 'SG' || e.msgType === 'SH' ? 4 : 0;
  if (e.kind !== 'sclass' || e.area !== area || !Number.isFinite(row.t) || width === 0 ||
      !/^[\da-f]{1,4}$/i.test(e.address ?? '') ||
      !(width === 1 ? /^[\da-f]{2}$/i : /^[\da-f]{8}$/i).test(e.data ?? '')) {
    return { accepted: false, state, transitions: [] };
  }
  const first = Number.parseInt(e.address!, 16);
  if (first + width - 1 > 0xffff) return { accepted: false, state, transitions: [] };
  const next = { ...state };
  const transitions: BitTransition[] = [];
  for (let offset = 0; offset < width; offset += 1) {
    const address = addressKey(first + offset);
    const value = Number.parseInt(e.data!.slice(offset * 2, offset * 2 + 2), 16);
    const previous = state[address];
    next[address] = value;
    for (let bit = 0; bit < 8; bit += 1) {
      const from = previous === undefined ? null : bitValue(previous, bit);
      const to = bitValue(value, bit);
      if (from !== to) transitions.push({ t: row.t, address, bit, from, to });
    }
  }
  return { accepted: true, state: next, transitions };
}

function ordered(events: readonly TimedTdEvent[]): TimedTdEvent[] {
  if (events.some((row) => !Number.isFinite(row.t))) throw new Error('TD receipt times must be finite');
  return [...events].sort((a, b) => a.t - b.t);
}

export function trackSclass(events: readonly TimedTdEvent[], area = 'Y9'): SclassTrace {
  const result: SclassTrace = { state: {}, transitions: [], acceptedMessages: 0, rejectedMessages: 0 };
  for (const row of ordered(events)) {
    if (row.e.area !== area) continue;
    if (row.e.kind === 'snapshot') {
      // A checkpoint/reconnect establishes a fresh picture, never a change in aspect.
      result.state = {};
      const picture = row.e.sclass as { addresses?: unknown; data?: unknown } | undefined;
      if (!picture || !picture.data || typeof picture.data !== 'object' || Array.isArray(picture.data)) continue;
      const entries = Object.entries(picture.data);
      if (picture.addresses !== entries.length || entries.some(([address, value]) =>
        !/^[\da-f]{1,4}$/i.test(address) || typeof value !== 'string' || !/^[\da-f]{2}$/i.test(value)) ||
        new Set(entries.map(([address]) => addressKey(Number.parseInt(address, 16)))).size !== entries.length) continue;
      for (const [address, data] of entries) {
        const restored = updateBytes(result.state, { t: row.t, e: { kind: 'sclass', area, msgType: 'SF', address, data: data as string } }, area);
        result.state = restored.state; result.transitions.push(...restored.transitions);
      }
      continue;
    }
    if (row.e.kind !== 'sclass') continue;
    const update = updateBytes(result.state, row, area);
    if (!update.accepted) { result.rejectedMessages += 1; continue; }
    result.acceptedMessages += 1;
    result.state = update.state;
    result.transitions.push(...update.transitions);
  }
  return result;
}

interface Passage { t: number; berth: string; to: string }
interface Cycle { clear: number; danger: number }
interface Fold { start: number; end: number; inclusiveEnd: boolean }

function inFold(t: number, fold: Fold): boolean {
  return t >= fold.start && (fold.inclusiveEnd ? t <= fold.end : t < fold.end);
}

function cyclesFor(changes: readonly BitTransition[], proceed: BitValue, fold: Fold): Cycle[] {
  const cycles: Cycle[] = [];
  for (let i = 0; i + 1 < changes.length; i += 1) {
    const clear = changes[i]!;
    const danger = changes[i + 1]!;
    // Unknown -> proceed is not a clearing: a refresh may have joined a long-held state.
    if (clear.from !== null && danger.from !== null && clear.to === proceed && danger.to !== proceed &&
        inFold(clear.t, fold) && inFold(danger.t, fold)) {
      cycles.push({ clear: clear.t, danger: danger.t });
    }
  }
  return cycles;
}

function score(passages: readonly Passage[], cycles: readonly Cycle[], windows: SignalWindows, kind: 'proceed' | 'route'): SignalEvidence {
  let support = 0;
  const used = new Set<number>();
  for (const passage of passages) {
    const index = cycles.findIndex((cycle, i) => !used.has(i) &&
      cycle.clear >= passage.t - windows.beforeMs && cycle.clear <= passage.t &&
      (kind === 'proceed'
        ? cycle.danger >= passage.t - (windows.earlyMs ?? 0) && cycle.danger <= passage.t + windows.afterMs
        : cycle.danger > passage.t + windows.afterMs && cycle.danger <= passage.t + (windows.routeAfterMs ?? windows.afterMs)));
    if (index >= 0) { support += 1; used.add(index); }
  }
  return { trials: passages.length, support, contradictions: passages.length - support,
    precision: cycles.length ? support / cycles.length : null, recall: passages.length ? support / passages.length : null,
    unmatchedCycles: cycles.length - used.size };
}

function qualifies(evidence: SignalEvidence): boolean {
  return evidence.support >= MIN_SUPPORT && evidence.precision !== null && evidence.precision >= MIN_PRECISION &&
    // Require passage coverage too: a rare coincidence must not identify a busy signal.
    (evidence.recall ?? evidence.precision) !== null && (evidence.recall ?? evidence.precision)! >= MIN_PRECISION;
}

// Geometry layers need the same admission rule before creating an inferred head.
export { qualifies as qualifiesSignalEvidence };

/**
 * Learn only first-half candidates; use the second half only to accept/reject them.
 * A supporting passage needs an observed clearing before it and a reset near passage.
 * One cycle cannot support two passages of the same berth. Missing state is a failure,
 * not an omitted trial. Full windows must fit inside their fold to prevent leakage.
 */
export function analyseSclass(events: readonly TimedTdEvent[], anchors: AnchorMap,
  options: { windows?: SignalWindows } = {}): SclassAnalysis {
  return analyseSclassRecordings([events], anchors, options);
}

/** Each recording contributes its first half to learning and its second half to validation. */
export function analyseSclassRecordings(recordings: readonly (readonly TimedTdEvent[])[], anchors: AnchorMap,
  options: { windows?: SignalWindows } = {}): SclassAnalysis {
  const windows = { ...(options.windows ?? SIGNAL_WINDOWS) };
  if (!Number.isFinite(windows.beforeMs) || windows.beforeMs <= 0 ||
      !Number.isFinite(windows.afterMs) || windows.afterMs <= 0 ||
      windows.earlyMs !== undefined && (!Number.isFinite(windows.earlyMs) || windows.earlyMs < 0) ||
      windows.routeAfterMs !== undefined && (!Number.isFinite(windows.routeAfterMs) || windows.routeAfterMs < windows.afterMs)) throw new Error('Signal windows must be positive finite durations');
  const sessions = recordings.map(events => ordered(events).filter(row => row.e.area === anchors.area));
  const rows = ordered(sessions.flat());
  const startMs = rows[0]?.t ?? 0;
  const endMs = rows.at(-1)?.t ?? startMs;
  const splitMs = startMs + (endMs - startMs) / 2;
  const folds = sessions.map(rows => {
    const startMs = rows[0]?.t ?? 0, endMs = rows.at(-1)?.t ?? startMs;
    return { startMs, endMs, splitMs: startMs + (endMs - startMs) / 2 };
  });
  // A fresh recording establishes byte state anew; overnight gaps are not bit cycles.
  const traces = sessions.map(rows => trackSclass(rows, anchors.area));
  const trace: SclassTrace = { state: traces.at(-1)?.state ?? {}, transitions: traces.flatMap(t => t.transitions),
    acceptedMessages: traces.reduce((n, t) => n + t.acceptedMessages, 0), rejectedMessages: traces.reduce((n, t) => n + t.rejectedMessages, 0) };
  const steps = { total: 0, training: 0, heldOut: 0, excludedAtEdges: 0,
    ignoredNotATrain: 0, ignoredIncomplete: 0, duplicates: 0 };
  const training: Passage[] = [];
  const heldOut: Passage[] = [];
  const seenSteps = new Set<string>();
  const berthNames = new Set([...anchors.anchors, ...anchors.unmapped].map((a) => a.berth));
  const anchored = new Set(anchors.anchors.map((a) => a.berth));
  for (const [index, session] of sessions.entries()) for (const row of session) {
    const bounds = folds[index]!;
    const trainFold: Fold = { start: bounds.startMs, end: bounds.splitMs, inclusiveEnd: false };
    const testFold: Fold = { start: bounds.splitMs, end: bounds.endMs, inclusiveEnd: true };
    const e = row.e;
    if (e.kind !== 'step') continue;
    if (e.descr === NOT_A_TRAIN) { steps.ignoredNotATrain += 1; continue; }
    if (!e.descr || !e.from || !e.to || e.from === e.to) { steps.ignoredIncomplete += 1; continue; }
    berthNames.add(e.from); berthNames.add(e.to);
    const key = JSON.stringify([row.t, e.from, e.to, e.descr]);
    if (seenSteps.has(key)) { steps.duplicates += 1; continue; }
    seenSteps.add(key); steps.total += 1;
    const passage = { t: row.t, berth: e.from, to: e.to };
    const fold = row.t < bounds.splitMs ? trainFold : testFold;
    if (!inFold(row.t - windows.beforeMs, fold) || !inFold(row.t + (windows.routeAfterMs ?? windows.afterMs), fold)) {
      steps.excludedAtEdges += 1; continue;
    }
    if (row.t < bounds.splitMs) { training.push(passage); steps.training += 1; }
    else { heldOut.push(passage); steps.heldOut += 1; }
  }
  const perBit = new Map<string, BitTransition[]>();
  for (const change of trace.transitions) {
    const key = `${change.address}:${change.bit}`;
    if (!perBit.has(key)) perBit.set(key, []);
    perBit.get(key)!.push(change);
  }
  const perBerth = new Map<string, { training: Passage[]; heldOut: Passage[] }>();
  for (const berth of berthNames) perBerth.set(berth, {
    training: training.filter((p) => p.berth === berth), heldOut: heldOut.filter((p) => p.berth === berth),
  });
  const hypotheses: SignalHypothesis[] = [];
  for (const changes of perBit.values()) {
    const { address, bit } = changes[0]!;
    for (const proceedValue of [0, 1] as const) {
      const trainCycles = folds.flatMap(f => cyclesFor(changes, proceedValue, { start: f.startMs, end: f.splitMs, inclusiveEnd: false }));
      const testCycles = folds.flatMap(f => cyclesFor(changes, proceedValue, { start: f.splitMs, end: f.endMs, inclusiveEnd: true }));
      for (const [berth, passages] of perBerth) {
        for (const kind of ['proceed', 'route'] as const) for (const to of kind === 'route' ? [...new Set(passages.training.map(p => p.to))] : [undefined]) {
          const train = to === undefined ? passages.training : passages.training.filter(p => p.to === to);
          const test = to === undefined ? passages.heldOut : passages.heldOut.filter(p => p.to === to);
          if (train.length < MIN_SUPPORT) continue;
          const evidence = score(train, trainCycles, windows, kind);
          if (!qualifies(evidence)) continue;
          const validation = score(test, testCycles, windows, kind);
          hypotheses.push({ id: `${address}:${bit}:${proceedValue}:${berth}:${kind}${to ? `:${to}` : ''}`, address, bit, berth, kind, ...(to ? { to } : {}), proceedValue,
            training: evidence, heldOut: validation, status: 'unknown', reason: '' });
        }
      }
    }
  }
  // Ambiguity is determined from training candidates only. Held-out data must not
  // choose between correlated bits, polarities, or neighbouring berth identities.
  for (const hypothesis of hypotheses) {
    const ambiguous = hypotheses.some((other) => other !== hypothesis &&
      (other.berth === hypothesis.berth && other.kind === hypothesis.kind && other.to === hypothesis.to || (other.address === hypothesis.address && other.bit === hypothesis.bit)));
    if (ambiguous) hypothesis.reason = 'Ambiguous training association: another bit or berth also fits; held-out data is not used to select one';
    else if (!qualifies(hypothesis.heldOut)) hypothesis.reason = 'Held-out oracle failed: requires at least 3 supporting steps and precision >= 0.8';
    else { hypothesis.status = 'decoded'; hypothesis.reason = 'Unique training association passed held-out precision and recall; temporal proceed/route hypothesis, not a signalling-diagram identification'; }
  }
  const bits = [...perBit.values()].map<BitSummary>((changes) => {
    const first = changes[0]!;
    const candidates = hypotheses.filter((h) => h.address === first.address && h.bit === first.bit);
    return { address: first.address, bit: first.bit, initialValue: first.to, finalValue: changes.at(-1)!.to,
      changes: changes.filter((c) => c.from !== null).length,
      status: candidates.some((h) => h.status === 'decoded') ? 'decoded' : 'unknown', hypothesisIds: candidates.map((h) => h.id) };
  }).sort((a, b) => Number.parseInt(a.address, 16) - Number.parseInt(b.address, 16) || a.bit - b.bit);
  const berths: BerthSignalSummary[] = [...berthNames].sort().map((berth) => {
    const candidates = hypotheses.filter((h) => h.berth === berth);
    return { berth, anchored: anchored.has(berth), status: candidates.some((h) => h.status === 'decoded') ? 'decoded' : 'unknown',
      hypothesisIds: candidates.map((h) => h.id) };
  });
  return { area: anchors.area, startMs, endMs, splitMs, folds, windows, minimumSupport: MIN_SUPPORT, minimumPrecision: MIN_PRECISION,
    steps, trace, hypotheses, bits, berths };
}

/** Missing bytes, rejected hypotheses, and any contradictory lookup table stay unknown. */
export function signalStates(state: ByteState, hypotheses: readonly SignalHypothesis[], anchors: AnchorMap): Record<string, SignalState> {
  const result: Record<string, SignalState> = {};
  for (const anchor of anchors.anchors) {
    const decoded = hypotheses.filter((h) => h.berth === anchor.berth && (h.kind === undefined || h.kind === 'proceed') && h.status === 'decoded' &&
      qualifies(h.training) && qualifies(h.heldOut));
    const h = decoded[0];
    const shared = h && hypotheses.some((other) => other !== h && other.status === 'decoded' &&
      other.address === h.address && other.bit === h.bit);
    const byte = h ? state[h.address] : undefined;
    result[anchor.berth] = decoded.length === 1 && !shared && byte !== undefined && Number.isInteger(byte) && byte >= 0 && byte <= 255 &&
      h!.bit >= 0 && h!.bit < 8 && Number.isInteger(h!.bit) ? (bitValue(byte, h!.bit) === h!.proceedValue ? 'proceed' : 'danger') : 'unknown';
  }
  return result;
}
