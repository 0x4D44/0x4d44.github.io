// Private rubric evidence from the same controller the page uses. No learned table is bundled.
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../core/graph.ts';
import { qualifiesSignalEvidence, trackSclass } from '../core/sclass.ts';
import type { SignalHypothesis, SignalState, TimedTdEvent } from '../core/sclass.ts';
import type { AnchorMap } from '../core/anchors.ts';
import type { KxData, RawElement } from '../core/osm.ts';
import { createSignals, signalRefBerth, validatedSignalHypotheses } from '../web/src/signals.ts';
import type { SignalEvent, SignalOverlay } from '../web/src/signals.ts';
import { buildSignalOverlay } from './build-signals.ts';

export const CAPTURE_STATES: readonly SignalState[] = ['proceed', 'danger', 'unknown'];
export interface SignalInterval { headId: number; berth: string; state: SignalState; startMs: number; endMs: number }
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

/** Includes every observed bit, every drawn head, and every decoded but unpositioned berth. */
export function signalReport(recordings: readonly (readonly TimedTdEvent[])[], data: KxData, overlay: SignalOverlay,
  anchors: AnchorMap, table: unknown, raw: RawElement[] = []) {
  const hypotheses = validatedSignalHypotheses(table, anchors.area);
  const decoded = hypotheses.filter(admitted);
  const proceed = decoded.filter(h => (h.kind ?? 'proceed') === 'proceed');
  const layer = createSignals(overlay, new THREE.Scene(), { area: anchors.area, platforms: data.platforms });
  layer.setAnchors(anchors, buildGraph(data)); layer.setTable(table);
  const records = layer.signals();
  const headRows = records.map(r => {
    const berth = r.group.userData.berth as string | undefined;
    const source = r.mappingSource ?? 'osm-unbound';
    const anchor = anchors.anchors.find(a => a.berth === berth);
    const aspect = proceed.find(h => h.berth === berth);
    return { id: r.signal.id, ref: r.signal.ref ?? null, berth: berth ?? null, decoded: Boolean(aspect),
      hypothesisId: aspect?.id ?? null, positionSource: source,
      review: source === 'reference' ? 'osm-ref-match' : source === 'nearby' || source === 'private-topology' ? 'topology' : 'unreviewed',
      inferred: r.inferredPosition, point: [...r.signal.edge.point], post: [r.group.position.x, r.group.position.y, r.group.position.z],
      facing: [...r.signal.facing], travel: [...r.signal.travel], side: r.signal.side,
      errorM: source === 'reference' ? 0 : anchor?.errorM ?? null,
      positionReason: source === 'reference' ? `OSM reference ${r.signal.ref} uniquely names the berth`
        : source === 'private-topology' ? 'Private one-to-one, same-edge, direction-compatible topology review within 40 m'
        : source === 'nearby' ? `Unique same-edge, direction-compatible OSM main signal within 20 m; ${anchor?.evidence ?? ''}`
        : r.inferredPosition ? `${r.label}; ${anchor?.evidence ?? 'anchor evidence unavailable'}`
        : 'OSM position retained; no admitted proceed identity for this head',
      observedStates: [] as SignalState[], heldOut: aspect?.heldOut ?? null };
  });
  const decodedHeads = proceed.map(h => {
    const positions = headRows.filter(r => r.berth === h.berth && r.decoded);
    const unmapped = anchors.unmapped.find(a => a.berth === h.berth);
    const rawRefs = raw.filter(e => e.type === 'node' && e.tags?.railway === 'signal' && signalRefBerth(e.tags.ref) === h.berth)
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
  const captures = recordings.map((_, recording) => ({ recording, cases: capturePlan(intervals.filter(i => i.recording === recording)) }));
  const metadata = table && typeof table === 'object' ? table as Record<string, unknown> : {};
  const reviews = (items: { review: string }[]) => Object.fromEntries([...new Set(items.map(h => h.review))].sort().map(review => [review, items.filter(h => h.review === review).length]));
  return { area: anchors.area, states: CAPTURE_STATES, unsupportedStates: ['caution'],
    validation: metadata.validation ?? null, windows: metadata.windows ?? null, folds: metadata.folds ?? null,
    evidencePolicy: 'Supplied table held-out evidence; >=3 supports and precision/recall >=0.8 in both folds. Route bits never drive an aspect. No re-learning or synthetic hypotheses.',
    counts: { addresses: new Set(bits.map(b => b.address)).size, bits: bits.length, decodedBits: bits.filter(b => b.decoded).length,
      unknownBits: bits.filter(b => !b.decoded).length, decodedProceedBits: proceed.length, decodedRouteBits: decoded.filter(h => h.kind === 'route').length,
      drawnHeads: headRows.length, positionedDecodedHeads: headRows.filter(h => h.decoded).length,
      unpositionedDecodedHeads: decodedHeads.filter(h => !h.headIds.length).length, positionedUndecodedHeads: headRows.filter(h => !h.decoded).length,
      reviewedDecodedHeads: headRows.filter(h => h.decoded && h.review !== 'unreviewed').length,
      publicOverlayReview: reviews(overlay.signals), effectiveOverlayReview: reviews(headRows.filter(h => !h.inferred)), drawnHeadReview: reviews(headRows) },
    heldOut: { all: total(decoded), proceed: total(proceed) }, bits, heads: headRows, decodedHeads, captures, intervals };
}

export function signalReportMarkdown(report: ReturnType<typeof signalReport>): string {
  const lines = ['# Signals evidence', '', report.evidencePolicy, '', `Counts: ${JSON.stringify(report.counts)}`,
    `Validation: ${cell(report.validation)}; windows (ms): ${JSON.stringify(report.windows)}; folds: ${JSON.stringify(report.folds)}.`,
    `Held-out micro precision ${pct(report.heldOut.all.precision)}, recall ${pct(report.heldOut.all.recall)}.`,
    'Caution is unsupported by this decoder; no caution screenshot or aspect is claimed.', '',
    '| Address | Bit | Meaning | Berth | Head(s) | Position source | Held-out precision | Recall |', '|---|---:|---|---|---|---|---:|---:|'];
  for (const b of report.bits) lines.push(`| ${b.address} | ${b.bit} | ${b.decoded ? b.kind : 'unknown'} | ${cell(b.berth)} | ${b.headIds.join(', ') || 'unpositioned'} | ${b.positionSources.join(', ') || 'none'} | ${pct(b.precision)} | ${pct(b.recall)} |`);
  lines.push('', '## Every decoded proceed head', '', '| Berth | Head(s) | Source | Held-out precision | Recall | Recorded position reason |', '|---|---|---|---:|---:|---|');
  for (const h of report.decodedHeads) lines.push(`| ${h.berth} | ${h.headIds.join(', ') || 'unpositioned'} | ${cell(h.positionSource)} | ${pct(h.heldOut.precision)} | ${pct(h.heldOut.recall ?? h.heldOut.precision)} | ${cell(h.reason)} |`);
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
  const raw = values.has('--raw') ? await json(one('--raw')) : { elements: [] };
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
  const privateReview = buildSignalOverlay(data, { raw: raw.elements ?? raw, anchors }).privateReview;
  const reviewedTable = { ...table, signalMappings: privateReview.signalMappings };
  const report = signalReport(recordings, data, overlay, anchors, reviewedTable, raw.elements ?? raw);
  const inputs = { anchors: await save('anchors.json', anchorsBytes), table: await save('sclass.json', JSON.stringify(reviewedTable)), recordings: sources,
    overlaySha256: createHash('sha256').update(JSON.stringify(overlay)).digest('hex') };
  await save('private-topology.json', JSON.stringify(privateReview, null, 2));
  await save('signal-report.json', JSON.stringify({ ...report, inputs }, null, 2));
  await save('signal-report.md', signalReportMarkdown(report));
  console.log(JSON.stringify({ ...report.counts, heldOut: report.heldOut, out: frozen }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error((error as Error).message); process.exitCode = 1; });
