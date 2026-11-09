// Public geometry is derived exclusively from OSM. Private anchors only produce a
// separate review sidecar, never a public berth, position, or review promotion.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph, components, snap } from '../core/graph.ts';
import { dist } from '../core/geo.ts';
import { stationPlatforms, platformSouthEnd } from '../core/station.ts';
import type { Pt } from '../core/geo.ts';
import type { KxData, RawElement } from '../core/osm.ts';
import type { AnchorMap } from '../core/anchors.ts';
import type { SignalOverlay, OverlaySignal, PublicSignalReview } from '../web/src/signals.ts';
import publicReviews from '../web/src/data/kx-signal-review.json' with { type: 'json' };

export interface SignalBuildOptions { raw?: RawElement[]; anchors?: AnchorMap; reviews?: readonly PublicSignalReview[] }
interface ReviewNote { id: number; ref?: string; classification: string[]; notes: string[]; snapM?: number }
type BuiltOverlaySignal = Omit<OverlaySignal, 'positionReview' | 'facing'> & {
  facing: [number, number]; positionReview?: PublicSignalReview;
};

/** Keep the human review pinned to the same public OSM geometry and raw position tag. */
export function publicSignalReviewMatches(signal: OverlaySignal, reviewed: PublicSignalReview,
  rawPosition: string | null | undefined, checkRawPosition = true): boolean {
  return dist(reviewed.point, signal.edge.point) < .01 && reviewed.wayId === signal.edge.wayId &&
    reviewed.from === signal.edge.from && reviewed.to === signal.edge.to && reviewed.direction === signal.direction &&
    (!checkRawPosition || reviewed.rawPosition === rawPosition) &&
    (reviewed.status === 'uncertain' || (rawPosition === 'left' || rawPosition === 'right' ||
      !checkRawPosition && (reviewed.rawPosition === 'left' || reviewed.rawPosition === 'right')) && reviewed.side === signal.side);
}

/** Pure build hook. No private input is read while constructing the public overlay. */
export function buildSignalOverlay(data: KxData, options: SignalBuildOptions = {}) {
  const g = buildGraph(data);
  const platforms = [...stationPlatforms(data).values()].filter((p) => /^(?:[0-9]|10)$/.test(p.ref ?? ''));
  const seeds = new Set([...g.adj].filter(([id, edges]) => edges.length === 1 && !edges[0]!.tunnel &&
    platforms.some((p) => dist(g.pos.get(id)!, platformSouthEnd(p.pts)) < 40)).map(([id]) => id));
  const serving = components(g).filter((c) => c.some((id) => seeds.has(id)));
  const reachable = new Set(serving.flat());
  const rawById = new Map((options.raw ?? []).filter((e) => e.type === 'node').map((e) => [e.id, e]));
  const signals: BuiltOverlaySignal[] = [];
  const included: ReviewNote[] = [];
  const excluded: ReviewNote[] = [];
  for (const signal of data.signals) {
    const classification = signal.kinds.filter((k) => !k.includes(':') && k !== 'position');
    const note: ReviewNote = { id: signal.id, ...(signal.ref ? { ref: signal.ref } : {}), classification, notes: [] };
    const forward = signal.direction !== 'backward';
    // At a way junction, nearest geometry alone may pick an oppositely ordered way.
    // Match core/berths.ts: outgoing edge for forward, incoming for backward.
    const incident = g.edges.filter((e) => e.a === signal.id || e.b === signal.id);
    const chosen = incident.find((e) => forward ? e.a === signal.id : e.b === signal.id) ?? incident[0];
    const s = snap(chosen ? { ...g, edges: [chosen] } : g, [signal.x, signal.z]);
    if (!s || s.distance > 25) {
      note.notes.push('Excluded: no rail snap within 25 m.');
      if (s) note.snapM = s.distance;
      excluded.push(note); continue;
    }
    note.snapM = s.distance;
    if (!reachable.has(s.edge.a)) {
      note.notes.push('Excluded: containing/nearest rail component does not serve a KGX platform.');
      excluded.push(note); continue;
    }
    const a = g.pos.get(s.edge.a)!;
    const b = g.pos.get(s.edge.b)!;
    const length = dist(a, b);
    if (!length) { note.notes.push('Excluded: zero-length rail edge.'); excluded.push(note); continue; }
    const directionKnown = signal.direction === 'forward' || signal.direction === 'backward';
    if (!directionKnown) note.notes.push(`Direction ${signal.direction ?? 'missing'}: way-forward assumed; unreviewed.`);
    const travel: Pt = [(b[0] - a[0]) / length * (forward ? 1 : -1), (b[1] - a[1]) / length * (forward ? 1 : -1)];
    const rawPosition = rawById.get(signal.id)?.tags?.['railway:signal:position'];
    const positionKnown = rawPosition === 'left' || rawPosition === 'right';
    // OSM position is relative to way order; the public renderer uses travel.
    const side = rawPosition === 'bridge' ? 'over-track' : positionKnown ? (forward ? rawPosition : rawPosition === 'left' ? 'right' : 'left') : 'left';
    if (rawPosition === 'bridge') note.notes.push('OSM gantry mounting: glyph over its governed rail, no invented side mast; height unmeasured.');
    else if (!positionKnown) note.notes.push(`${rawPosition === undefined ? 'Missing position' : `Unsupported position ${JSON.stringify(rawPosition)}`}: UK left-of-travel convention assumed; not a surveyed position.`);
    else if (!forward) note.notes.push('OSM way-relative side flipped for backward train travel.');
    const berth = signal.ref?.match(/^YA\s*(\d{4})$/)?.[1];
    const out: BuiltOverlaySignal = {
      id: signal.id, point: [signal.x, signal.z],
      ...(signal.ref ? { ref: signal.ref } : {}), ...(signal.direction ? { direction: signal.direction } : {}),
      kinds: [...signal.kinds], edge: { wayId: s.edge.wayId, from: s.edge.a, to: s.edge.b, t: s.t, point: s.point },
      travel, facing: [-travel[0], -travel[1]], side,
      sideSource: positionKnown || rawPosition === 'bridge' ? 'osm' : 'assumed-left',
      ...(berth ? { berth } : {}), review: berth && directionKnown ? 'osm-ref-match' : 'unreviewed',
    };
    const reviews = (options.reviews ?? publicReviews.signals as PublicSignalReview[]).filter(r => r.id === signal.id);
    const reviewed = reviews.length === 1 ? reviews[0] : undefined;
    // A human review is pinned to this track, direction and raw side evidence.
    // A later OSM rebuild cannot silently carry an old approval onto changed geometry.
    if (reviewed && publicSignalReviewMatches(out, reviewed, rawPosition ?? null)) {
      out.positionReview = structuredClone(reviewed);
    }
    if (signal.ref && !berth) note.notes.push('Non-YA reference retained; no public berth binding.');
    if (classification.includes('train_protection') && !classification.includes('main')) note.notes.push('Protection board retained; not classified as a main signal.');
    signals.push(out); included.push(note);
  }
  const overlay = { attribution: data.attribution, signals };
  const privateTrials = signals.filter((s) => !s.ref && s.kinds.includes('main')).map((s) => {
    const candidates = (options.anchors?.anchors ?? []).filter((a) => {
      if (a.kind !== 'inferred' && !(a.kind === 'signal' && a.evidence.startsWith('Topology'))) return false;
      if (!((a.from === s.edge.from && a.to === s.edge.to) || (a.from === s.edge.to && a.to === s.edge.from))) return false;
      const from = g.pos.get(a.from), to = g.pos.get(a.to);
      return from && to && (to[0] - from[0]) * s.travel[0] + (to[1] - from[1]) * s.travel[1] > 0 && dist(a.point, s.edge.point) <= 40;
    }).map((a) => ({ berth: a.berth, distanceM: dist(a.point, s.edge.point) }));
    return { signalId: s.id, candidates };
  });
  // An anchor compatible with two signals is not a unique signal identity.
  const privateSignals = privateTrials.map((trial) => {
    const unique = trial.candidates.length === 1 && privateTrials.filter((other) =>
      other.candidates.some((a) => a.berth === trial.candidates[0]!.berth)).length === 1;
    return { ...trial, review: unique ? 'topology' as const : 'unreviewed' as const };
  });
  const privateReview = {
    signalMappings: privateSignals.filter((s) => s.review === 'topology').map((s) => ({
      signalId: s.signalId, berth: s.candidates[0]!.berth, distanceM: s.candidates[0]!.distanceM, review: 'topology' as const,
    })), signals: privateSignals,
  };
  const count = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map((key) => [key, values.filter((v) => v === key).length]));
  const report = {
    source: 'OpenStreetMap only; no Network Rail data in public output',
    tolerances: { railSnapM: 25, platformTerminalSeedM: 40, privateTopologyM: 40 },
    assumptions: [
      'Serving components are seeded by non-tunnel terminal tracks within 40 m of the south end of KGX surface platforms 0–10.',
      'Prefer containing-way outgoing/incoming edge for forward/backward; otherwise nearest rail across all components before reachability filtering.',
      'Missing/both/unknown direction assumes way-forward and remains unreviewed.',
      'OSM railway:signal:position=left/right is relative to way direction (https://wiki.openstreetmap.org/wiki/Tag:railway%3Dsignal). Public side is relative to train travel, so backward signals flip left/right. Bridge mounting uses an over-track glyph without a side mast; elevation remains uncertain. Missing/other unsupported positions assume left of travel, explicitly marked assumed-left.',
      'Geographic approval comes only from the separate public OSM review ledger pinned to point, edge, direction and raw side tag. Reference and private topology identities do not approve a missing mast side. Offsets and heights remain schematic.',
      'Public berth strings come only from /^YA\\s*(\\d{4})$/ OSM refs; private topology never changes public JSON.',
      'Private topology candidates require an unreferenced main signal and either an inferred anchor or a signal anchor whose private evidence starts with Topology. Platform and direct OSM-reference anchors are excluded. Candidates require the same edge, compatible direction and distance <=40 m, and must be unique one-to-one or remain unreviewed.',
    ],
    inputSignals: data.signals.length, includedSignals: signals.length, excludedSignals: excluded.length,
    platformSeedNodes: [...seeds], servingComponents: serving.map((c) => c.length),
    counts: { publicReview: count(signals.map((s) => s.review)), side: count(signals.map((s) => s.sideSource)),
      classification: count(included.flatMap((n) => n.classification)),
      privateReview: options.anchors ? count(privateSignals.map((s) => s.review)) : {},
      effectiveReview: count(signals.map((s) => privateReview.signalMappings.some((m) => m.signalId === s.id) ? 'topology' : s.review)) }, included, excluded,
  };
  return { overlay, report, privateReview };
}

function main() {
  const args = process.argv.slice(2);
  const option = (name: string): string | undefined => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    return value;
  };
  for (let i = 0; i < args.length; i += 2) if (!['--raw', '--anchors', '--out'].includes(args[i]!)) throw new Error(`Unknown option ${args[i]}`);
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const scratch = resolve(repo, '.scratch');
  const out = resolve(option('--out') ?? resolve(scratch, 'signals-round6'));
  const within = relative(scratch, out);
  if (within.startsWith('..') || isAbsolute(within)) throw new Error('--out must remain inside the repository .scratch directory');
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
  const rawPath = option('--raw');
  const raw = rawPath ? read(rawPath) : undefined;
  const anchorsPath = option('--anchors');
  const result = buildSignalOverlay(read(resolve(repo, 'kings-cross-src/web/src/data/kx-track.json')), {
    raw: raw?.elements ?? raw, anchors: anchorsPath ? read(anchorsPath) : undefined,
  });
  mkdirSync(out, { recursive: true });
  const runtimeOverlay: SignalOverlay = { ...result.overlay, signals: result.overlay.signals.map(signal => {
    const { positionReview, ...fields } = signal;
    const compact = { ...fields, ...(positionReview ? { positionReview: { status: positionReview.status } } : {}) };
    delete (compact as Partial<OverlaySignal>).point;
    delete (compact as Partial<OverlaySignal>).facing;
    return compact;
  }) };
  writeFileSync(resolve(repo, 'kings-cross-src/web/src/data/kx-signals.json'), JSON.stringify(runtimeOverlay, null, 2) + '\n');
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(result.report, null, 2) + '\n');
  if (anchorsPath) writeFileSync(resolve(out, 'private-topology.json'), JSON.stringify(result.privateReview, null, 2) + '\n');
  console.log(JSON.stringify(result.report.counts));
  console.log(`Signals: ${result.report.includedSignals} included, ${result.report.excludedSignals} excluded; report ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
