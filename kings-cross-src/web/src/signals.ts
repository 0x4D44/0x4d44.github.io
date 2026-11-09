import * as THREE from 'three';
import { qualifiesSignalEvidence, signalStates, updateBytes } from '../../core/sclass.ts';
import type { ByteState, SignalEvidence, SignalHypothesis, SignalState, TimedTdEvent } from '../../core/sclass.ts';
import type { AnchorMap, BerthAnchor } from '../../core/anchors.ts';
import type { Graph } from '../../core/graph.ts';
import { isSurfacePlatform, longAxis, platformSouthEnd, stationPlatforms } from '../../core/station.ts';
import type { KxData, Platform } from '../../core/osm.ts';
import type { Pt } from '../../core/geo.ts';
import trackData from './data/kx-track.json' with { type: 'json' };

type SignalGraph = Pick<Graph, 'pos'> & Partial<Pick<Graph, 'edges'>>;

/** Follow the buffer's own rail to the OSM platform's north-end plane, not a nearby line. */
export function platformStarter(anchor: BerthAnchor, graph: SignalGraph, platform: Platform | undefined): BerthAnchor | undefined {
  if (!platform || !isSurfacePlatform(platform) || platform.pts.length < 3 || platform.pts.some(p => p.length !== 2 || !p.every(Number.isFinite))) return;
  const shape = longAxis(platform.pts);
  if (!Number.isFinite(shape.length) || shape.length < 30 || shape.length <= shape.width * 2) return;
  const axis: Pt = shape.axis[1] > 0 ? [-shape.axis[0], -shape.axis[1]] : shape.axis;
  if (axis[1] > -.5) return;
  const dot = (point: Pt): number => point[0] * axis[0] + point[1] * axis[1];
  const north = Math.max(...platform.pts.map(dot));
  const south = platformSouthEnd(platform.pts);
  if (Math.hypot(anchor.point[0] - south[0], anchor.point[1] - south[1]) > 30 || north - dot(anchor.point) < 30) return;
  const edges = graph.edges ?? [];
  const first = edges.find(e => !e.tunnel && ((e.a === anchor.from && e.b === anchor.to) || (e.a === anchor.to && e.b === anchor.from)));
  if (!first) return;
  const from = graph.pos.get(anchor.from), to = graph.pos.get(anchor.to);
  if (!from || !to) return;
  let edge = first, point = anchor.point;
  let node = dot(from) > dot(to) ? anchor.from : anchor.to;
  let behind = node === anchor.from ? anchor.to : anchor.from;
  let distance = 0;
  const visited = new Set<typeof first>();
  while (!visited.has(edge)) {
    visited.add(edge);
    const next = graph.pos.get(node), start = graph.pos.get(behind);
    if (!next || !start) return;
    const advance = dot(next) - dot(point), length = Math.hypot(next[0] - point[0], next[1] - point[1]);
    if (advance < -1e-6 || distance > shape.length + 60) return;
    if (advance > 0 && dot(next) >= north) {
      const fraction = (north - dot(point)) / advance;
      if (distance + length * fraction > shape.length + 60) return;
      const stop: Pt = [point[0] + (next[0] - point[0]) * fraction, point[1] + (next[1] - point[1]) * fraction];
      const across = (p: Pt): number => p[0] * -axis[1] + p[1] * axis[0];
      const sides = platform.pts.map(across), lateral = across(stop);
      if (lateral < Math.min(...sides) - 10 || lateral > Math.max(...sides) + 10 || next[1] >= start[1]) return;
      const length2 = (next[0] - start[0]) ** 2 + (next[1] - start[1]) ** 2;
      const t = ((stop[0] - start[0]) * (next[0] - start[0]) + (stop[1] - start[1]) * (next[1] - start[1])) / length2;
      return { ...anchor, from: behind, to: node, t, point: stop, evidence: `${anchor.evidence}; starter inferred at OSM platform north end` };
    }
    distance += length;
    const incoming: Pt = [next[0] - start[0], next[1] - start[1]];
    const norm = Math.hypot(...incoming);
    const onward = edges.filter(e => e !== edge && !e.tunnel && !visited.has(e) && (e.a === node || e.b === node)).flatMap(e => {
      const other = e.a === node ? e.b : e.a, target = graph.pos.get(other);
      if (!target || dot(target) <= dot(next) || target[1] >= next[1]) return [];
      const dx = target[0] - next[0], dz = target[1] - next[1];
      const alignment = (incoming[0] * dx + incoming[1] * dz) / (norm * Math.hypot(dx, dz));
      return alignment >= .7 ? [{ edge: e, other, alignment }] : [];
    }).sort((a, b) => b.alignment - a.alignment);
    // A fork without a clearly straighter continuation cannot identify this platform's rail.
    if (!onward.length || onward[1] && onward[0]!.alignment - onward[1].alignment < .1) return;
    point = next; behind = node; node = onward[0]!.other; edge = onward[0]!.edge;
  }
}

/** Public OSM review only. TD identities and learned byte associations never belong here. */
export interface PublicSignalReview {
  id: number; status: 'reviewed' | 'uncertain'; reviewedAt: string;
  point: [number, number]; wayId: number; from: number; to: number;
  direction: string; rawPosition: string | null; side: 'left' | 'right' | 'over-track' | 'uncertain';
  nodeVersion: number; wayVersion: number; latitude: number; longitude: number;
  adjoiningWays?: { id: number; version: number; role: string }[];
  evidence: string[]; reason: string; previousPost: [number, number];
}
export interface OverlaySignal {
  id: number;
  point: [number, number];
  ref?: string;
  direction?: string;
  kinds: string[];
  edge: { wayId: number; from: number; to: number; t: number; point: [number, number] };
  travel: [number, number];
  facing: [number, number];
  side: 'left' | 'right' | 'over-track';
  sideSource: 'osm' | 'assumed-left';
  berth?: string;
  review: 'osm-ref-match' | 'topology' | 'unreviewed';
  /** Geographic review is independent of the berth identity above. Heights/offsets remain schematic. */
  positionReview?: PublicSignalReview;
}
export interface SignalOverlay { attribution: string; signals: OverlaySignal[] }
export type SignalEvent = TimedTdEvent | { t: number; e: { kind: 'snapshot'; area: string; berths?: unknown; sclass?: unknown } };
export interface DrawnSignal {
  signal: OverlaySignal; group: THREE.Group; state: SignalState;
  inferredPosition: boolean;
  label: string;
  mappingSource?: 'reference' | 'nearby' | 'private-topology' | 'td-anchor';
}

/** A suffix is a signal variant, not a different TD berth. Foreign area prefixes stay separate. */
export function signalRefBerth(ref: string | undefined): string | undefined {
  return ref?.match(/^(?:YA\s*)?(\d{4})[A-Z]?$/i)?.[1];
}

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
function evidence(v: unknown): v is SignalEvidence {
  if (!object(v) || !count(v.trials) || !count(v.support) || !count(v.contradictions) || !count(v.unmatchedCycles) ||
      v.support + v.contradictions !== v.trials) return false;
  const raw = v as Record<string, unknown>;
  const legacy = raw.recall === undefined;
  const denominator = v.support + v.unmatchedCycles;
  const expectedPrecision = denominator === 0 ? null : v.support / denominator;
  const expectedRecall = v.trials === 0 ? null : v.support / v.trials;
  const precisionValid = v.precision === expectedPrecision || (typeof v.precision === 'number' && typeof expectedPrecision === 'number' &&
    Number.isFinite(v.precision) && Math.abs(v.precision - expectedPrecision) < 1e-12);
  const recallValid = legacy || raw.recall === expectedRecall || (typeof raw.recall === 'number' && typeof expectedRecall === 'number' &&
    Number.isFinite(raw.recall) && Math.abs(raw.recall - expectedRecall) < 1e-12);
  const legacyConsistent = !legacy || (v.unmatchedCycles === v.contradictions &&
    (v.trials === 0 ? v.precision === null : typeof v.precision === 'number' && Math.abs(v.precision - expectedRecall!) < 1e-12));
  return precisionValid && recallValid && legacyConsistent;
}
export function validatedSignalHypotheses(value: unknown, area = 'Y9'): SignalHypothesis[] {
  if (!object(value) || value.area !== area || !Array.isArray(value.hypotheses)) return [];
  const result: SignalHypothesis[] = [];
  for (const h of value.hypotheses) {
    if (!object(h) || typeof h.id !== 'string' || !h.id || typeof h.berth !== 'string' || !h.berth ||
        (h.kind !== undefined && h.kind !== 'proceed' && h.kind !== 'route') ||
        (h.to !== undefined && (typeof h.to !== 'string' || !h.to)) ||
        typeof h.address !== 'string' || !/^[\dA-F]{2,4}$/.test(h.address) ||
        h.address !== Number.parseInt(h.address, 16).toString(16).toUpperCase().padStart(2, '0') ||
        !Number.isInteger(h.bit) || (h.bit as number) < 0 || (h.bit as number) > 7 ||
        (h.proceedValue !== 0 && h.proceedValue !== 1) || (h.status !== 'decoded' && h.status !== 'unknown') ||
        typeof h.reason !== 'string' || !evidence(h.training) || !evidence(h.heldOut)) return [];
    result.push(structuredClone(h) as unknown as SignalHypothesis);
  }
  // A JSON status cannot resolve competing training associations. Proceed and route
  // candidates for one berth are distinct; route candidates are keyed by destination.
  const kind = (h: SignalHypothesis): 'proceed' | 'route' => h.kind ?? 'proceed';
  return result.map((h) => result.some((other) => other !== h && (
    (other.berth === h.berth && kind(other) === kind(h) && other.to === h.to) ||
    (other.address === h.address && other.bit === h.bit)
  )) ? { ...h, status: 'unknown' } : h);
}

/** Node-safe geometry and a conservative, local-relay-only byte controller. Fetch is explicit. */
export function createSignals(overlay: SignalOverlay, parent: THREE.Object3D,
  options: { fetchImpl?: typeof fetch; area?: string; platforms?: readonly Platform[] } = {}) {
  const area = options.area ?? 'Y9';
  const records: DrawnSignal[] = [];
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  const lamps = new Map<DrawnSignal, THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>>();
  const questions = new Map<DrawnSignal, THREE.Group>();
  let bytes: ByteState = {}, table: SignalHypothesis[] = [], disposed = false, generation = 0;
  let tableValue: unknown, privateAnchors: AnchorMap | undefined, anchorGraph: SignalGraph | undefined;
  const platforms = stationPlatforms({ platforms: [...(options.platforms ?? (trackData as unknown as KxData).platforms)] });
  const anchors: AnchorMap = { area, sources: [overlay.attribution], anchors: [], unmapped: [] };
  const directAnchors: AnchorMap['anchors'] = [];
  const directBerths = new Map<DrawnSignal, string>();
  const runtimeBerths = new Map<DrawnSignal, string>();
  const inferredHeads = new Map<string, DrawnSignal>();
  let nextInferredId = -1;
  // OSM reference identity does not depend on TD having located the berth.
  const matches = new Map<string, number>();
  for (const s of overlay.signals) {
    const berth = signalRefBerth(s.ref);
    if (berth) matches.set(berth, (matches.get(berth) ?? 0) + 1);
  }
  function mesh(geometry: THREE.BufferGeometry, color: number): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({ color });
    resources.add(geometry); resources.add(material);
    return new THREE.Mesh(geometry, material);
  }
  function pose(signal: OverlaySignal, group: THREE.Group): void {
    const side = signal.side === 'over-track' ? 0 : signal.side === 'left' ? 1 : -1;
    group.position.set(signal.edge.point[0] + side * 2 * signal.travel[1], 0,
      signal.edge.point[1] - side * 2 * signal.travel[0]);
    group.rotation.y = Math.atan2(signal.facing[0], signal.facing[1]);
  }
  function makeHead(signal: OverlaySignal, inferred = false): DrawnSignal {
    const group = new THREE.Group(); group.name = `signal-${signal.id}`;
    pose(signal, group);
    // OSM bridge denotes a gantry, not a freestanding mast on an assumed side.
    // Keep the glyph height schematic: no source measures the gantry's elevation.
    const post = signal.side === 'over-track' ? undefined : mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.7, 6), 0x999999);
    if (post) { post.name = 'post'; post.position.y = 1.85; group.add(post); }
    if (inferred) {
      const material = post!.material as THREE.MeshBasicMaterial; material.transparent = true; material.opacity = 0.45;
      const ringGeometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 49 }, (_, i) => {
        const angle = i / 48 * Math.PI * 2; return new THREE.Vector3(Math.cos(angle) * .8, .04, Math.sin(angle) * .8);
      }));
      const ringMaterial = new THREE.LineDashedMaterial({ color: 0xc3cbd4, dashSize: .18, gapSize: .12 });
      resources.add(ringGeometry); resources.add(ringMaterial);
      const ring = new THREE.Line(ringGeometry, ringMaterial); ring.name = 'inferred-position'; ring.computeLineDistances(); group.add(ring);
    }
    const head = mesh(new THREE.BoxGeometry(0.65, 1.15, 0.28), 0x15191c); head.position.y = 3.8; group.add(head);
    const lamp = mesh(new THREE.SphereGeometry(0.19, 8, 6), 0x666666) as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    lamp.name = 'aspect'; lamp.position.set(0, 3.95, 0.18); group.add(lamp);
    const question = new THREE.Group(); question.name = 'unknown';
    // White vector question mark, facing local +z. No canvas, textures or DOM.
    const points = [[-0.1, 0.08], [-0.1, 0.17], [0.1, 0.17], [0.1, 0.03], [0, -0.04], [0, -0.12]];
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff }); resources.add(lineGeometry); resources.add(lineMaterial);
    question.add(new THREE.Line(lineGeometry, lineMaterial));
    const dot = mesh(new THREE.SphereGeometry(0.025, 6, 4), 0xffffff); dot.position.y = -0.22; question.add(dot);
    question.position.set(0, 3.48, 0.16); group.add(question);
    const detail = signal.positionReview?.status === 'reviewed' ? 'reviewed track position and side; height/offset schematic'
      : signal.positionReview?.reason ?? (signal.side === 'over-track' ? 'bridge mounting; height unmeasured' : 'side not evidenced by a public position review');
    const label = inferred ? `Signal ${signal.berth} · position inferred from TD · uncertain position and side`
      : `Signal ${signal.ref ?? signal.id} · OSM position · ${signal.positionReview?.status === 'reviewed' ? '' : 'uncertain: '}${detail}`;
    if (inferred) group.name = label;
    group.userData.label = label; group.userData.inferredPosition = inferred;
    group.userData.positionReview = signal.positionReview?.status ?? 'uncertain';
    const record: DrawnSignal = { signal, group, state: 'unknown', inferredPosition: inferred, label };
    records.push(record); lamps.set(record, lamp); questions.set(record, question); parent.add(group);
    return record;
  }
  for (const signal of overlay.signals) {
    const record = makeHead(signal);
    const osmBerth = signalRefBerth(signal.ref);
    if (signal.kinds.includes('main') && osmBerth && (signal.berth === undefined || signal.berth === osmBerth) && matches.get(osmBerth) === 1) {
      anchors.anchors.push({ berth: osmBerth, kind: 'signal', from: signal.edge.from, to: signal.edge.to,
        t: signal.edge.t, point: [...signal.edge.point], errorM: 0, evidence: 'OSM signal overlay' });
      directBerths.set(record, osmBerth);
    }
  }
  directAnchors.push(...anchors.anchors);
  function install(value: unknown): void {
    table = validatedSignalHypotheses(value, area); tableValue = value;
    reconcilePositions(); refresh();
  }
  function removeInferred(berth: string, record: DrawnSignal): void {
    record.group.removeFromParent();
    record.group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        for (const resource of [object.geometry, ...(Array.isArray(object.material) ? object.material : [object.material])]) {
          if (resources.delete(resource)) resource.dispose();
        }
      }
    });
    records.splice(records.indexOf(record), 1); lamps.delete(record); questions.delete(record); inferredHeads.delete(berth);
  }
  function bind(record: DrawnSignal, anchor: BerthAnchor, source: DrawnSignal['mappingSource']): void {
    runtimeBerths.set(record, anchor.berth); record.mappingSource = source;
    record.group.userData.berth = anchor.berth; record.group.userData.mappingSource = source;
    record.group.userData.anchorKind = anchor.kind;
    if (!anchors.anchors.some(a => a.berth === anchor.berth)) anchors.anchors.push(anchor);
  }
  function reconcilePositions(): void {
    anchors.anchors = [...directAnchors];
    runtimeBerths.clear();
    for (const record of records) if (!record.inferredPosition) { record.mappingSource = undefined; delete record.group.userData.mappingSource; delete record.group.userData.berth; }
    for (const [record, berth] of directBerths) {
      runtimeBerths.set(record, berth); record.mappingSource = 'reference'; record.group.userData.mappingSource = 'reference'; record.group.userData.berth = berth;
    }
    const value = tableValue;
    if (table.length && object(value) && Array.isArray(value.signalMappings)) {
      const mappings = value.signalMappings;
      const valid = mappings.every((m) => object(m) && Number.isSafeInteger(m.signalId) && typeof m.berth === 'string' && /^[A-Z0-9]{1,8}$/.test(m.berth) &&
        typeof m.distanceM === 'number' && Number.isFinite(m.distanceM) && m.distanceM >= 0 && m.distanceM <= 40 && m.review === 'topology');
      if (valid) for (const m of mappings) {
        const mapping = m as { signalId: number; berth: string };
        const candidates = records.filter((r) => r.signal.id === mapping.signalId);
        const record = candidates[0];
        if (candidates.length !== 1 || !record || record.signal.ref || record.signal.berth || !record.signal.kinds.includes('main') ||
            mappings.filter((x) => x.signalId === mapping.signalId || x.berth === mapping.berth).length !== 1 || directAnchors.some((a) => a.berth === mapping.berth)) continue;
        const signal = record.signal;
        bind(record, { berth: mapping.berth, kind: 'signal', from: signal.edge.from, to: signal.edge.to, t: signal.edge.t,
          point: [...signal.edge.point], errorM: 40, evidence: 'Private topology review' }, 'private-topology');
      }
    }
    const proceedBerths = new Set(table.filter(h => (h.kind ?? 'proceed') === 'proceed' && h.status === 'decoded' &&
      qualifiesSignalEvidence(h.training) && qualifiesSignalEvidence(h.heldOut)).map(h => h.berth));
    // Missing OSM type tags do not erase an exact YA identity proven by the private decoder.
    for (const record of records.filter(r => !r.inferredPosition)) {
      const signal = record.signal, berth = signalRefBerth(signal.ref);
      if (signal.kinds.length === 0 && /^YA\s*\d{4}[A-Z]?$/i.test(signal.ref ?? '') && berth &&
          (signal.berth === undefined || signal.berth === berth) && matches.get(berth) === 1 && proceedBerths.has(berth))
        bind(record, { berth, kind: 'signal', from: signal.edge.from, to: signal.edge.to, t: signal.edge.t,
          point: [...signal.edge.point], errorM: 0, evidence: 'OSM YA reference with validated proceed evidence' }, 'reference');
    }
    const eligible = (privateAnchors?.anchors ?? []).filter(a => {
      if (!object(a) || typeof a.berth !== 'string' || !a.berth) return false;
      const from = anchorGraph?.pos.get(a.from), to = anchorGraph?.pos.get(a.to);
      return proceedBerths.has(a.berth) && privateAnchors!.anchors.filter(other => other?.berth === a.berth).length === 1 &&
        Array.isArray(a.point) && a.point.length === 2 && a.point.every(Number.isFinite) &&
        Number.isFinite(a.t) && a.t >= 0 && a.t <= 1 && from && to &&
        [...from, ...to].every(Number.isFinite) && Math.hypot(to[0] - from[0], to[1] - from[1]) > 0;
    });
    const heading = (a: BerthAnchor): [number, number] => {
      const from = anchorGraph!.pos.get(a.from)!, to = anchorGraph!.pos.get(a.to)!;
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
    };
    const bound = (a: BerthAnchor): boolean => [...runtimeBerths.values()].includes(a.berth);
    const osm = records.filter(r => !r.inferredPosition && r.signal.kinds.includes('main'));
    const located = eligible.filter(a => !bound(a)).flatMap(anchor => {
      if (anchor.kind !== 'platform') return [anchor];
      const ref = anchor.platform ?? (/^10\d{2}$/.test(anchor.berth) ? String(Number(anchor.berth) - 1000) : undefined);
      const starter = platformStarter(anchor, anchorGraph!, ref === undefined ? undefined : platforms.get(ref));
      return starter ? [starter] : [];
    });
    const proposals = located.map(anchor => {
      const direction = heading(anchor);
      const candidates = osm.filter(record => {
        const s = record.signal;
        return !runtimeBerths.has(record) && (!s.ref || signalRefBerth(s.ref) === anchor.berth) &&
          (s.berth === undefined || s.berth === anchor.berth) &&
          (s.direction === 'forward' || s.direction === 'backward') &&
          ((s.edge.from === anchor.from && s.edge.to === anchor.to) || (s.edge.from === anchor.to && s.edge.to === anchor.from)) &&
          Math.hypot(anchor.point[0] - s.edge.point[0], anchor.point[1] - s.edge.point[1]) <= 20 &&
          direction[0] * s.travel[0] + direction[1] * s.travel[1] > .95;
      });
      return { anchor, candidates };
    });
    for (const proposal of proposals) {
      const candidate = proposal.candidates[0];
      if (proposal.candidates.length === 1 && proposals.filter(p => p.candidates.includes(candidate!)).length === 1)
        bind(candidate!, proposal.anchor, 'nearby');
    }
    const inferred = located.filter(a => !bound(a));
    for (const [berth, record] of inferredHeads) if (!inferred.some(a => a.berth === berth)) removeInferred(berth, record);
    for (const anchor of inferred) {
      const travel = heading(anchor), old = inferredHeads.get(anchor.berth);
      const signal: OverlaySignal = { id: old?.signal.id ?? nextInferredId--, point: [...anchor.point], kinds: ['main'],
        edge: { wayId: 0, from: anchor.from, to: anchor.to, t: anchor.t, point: [...anchor.point] },
        travel, facing: [-travel[0], -travel[1]], side: 'left', sideSource: 'assumed-left', berth: anchor.berth, review: 'unreviewed' };
      const record = old ?? makeHead(signal, true); record.signal = signal; pose(signal, record.group);
      record.label = `Signal ${anchor.berth} · ${anchor.kind === 'platform' ? 'platform departure end · ' : ''}position inferred from TD · uncertain position and side`;
      record.group.userData.label = record.label; record.group.name = record.label;
      record.group.userData.platformStarter = anchor.kind === 'platform';
      inferredHeads.set(anchor.berth, record); bind(record, anchor, 'td-anchor');
    }
  }
  function refresh(): void {
    if (disposed) return;
    const proceed = table.filter((h) => (h.kind ?? 'proceed') === 'proceed');
    const states = signalStates(bytes, proceed, anchors);
    for (const record of records) {
      record.state = (record.signal.kinds.includes('main') || (record.signal.kinds.length === 0 && record.mappingSource === 'reference')) ? states[runtimeBerths.get(record) ?? ''] ?? 'unknown' : 'unknown';
      lamps.get(record)!.material.color.setHex(record.state === 'proceed' ? 0x35ff69 : record.state === 'danger' ? 0xff2929 : 0x666666);
      questions.get(record)!.visible = record.state === 'unknown';
    }
  }
  return {
    apply(row: SignalEvent): void {
      if (disposed) return;
      if (row.e.kind === 'snapshot') {
        if (row.e.area !== area) return;
        // Snapshots replace the whole byte picture atomically. Never merge with old bytes.
        bytes = {};
        const picture = row.e as { berths?: unknown; sclass?: unknown };
        if (Number.isFinite(row.t) && object(picture.berths) && Object.values(picture.berths).every((v) => typeof v === 'string') &&
            object(picture.sclass) && count(picture.sclass.addresses) && object(picture.sclass.data)) {
          const entries = Object.entries(picture.sclass.data);
          const restored: Record<string, number> = {};
          let valid = picture.sclass.addresses === entries.length;
          for (const [address, value] of entries) {
            // Legacy four-byte payloads lack their refresh ordering: fail closed rather than truncate.
            if (!/^[\da-f]{1,4}$/i.test(address) || typeof value !== 'string' || !/^[\da-f]{2}$/i.test(value)) { valid = false; break; }
            const key = Number.parseInt(address, 16).toString(16).toUpperCase().padStart(2, '0');
            if (restored[key] !== undefined) { valid = false; break; }
            restored[key] = Number.parseInt(value, 16);
          }
          if (valid) bytes = restored;
        }
      } else bytes = updateBytes(bytes, row as TimedTdEvent, area).state;
      refresh();
    },
    reset(): void { bytes = {}; refresh(); },
    setAnchors(map: AnchorMap, graph: SignalGraph): void {
      if (disposed) return;
      privateAnchors = map?.area === area && Array.isArray(map.anchors) ? structuredClone(map) : undefined;
      anchorGraph = graph;
      reconcilePositions(); refresh();
    },
    setTable(value: unknown): void { if (disposed) return; generation += 1; install(value); },
    async loadTable(): Promise<void> {
      const request = ++generation; table = []; reconcilePositions(); refresh();
      try {
        const response = await (options.fetchImpl ?? fetch)('/relay/sclass');
        const value: unknown = response.ok ? await response.json() : null;
        if (!disposed && request === generation) { install(value); }
      } catch { if (!disposed && request === generation) { table = []; reconcilePositions(); refresh(); } }
    },
    signals(): DrawnSignal[] { return [...records]; },
    counts(): { drawn: number; decoded: number } { return { drawn: records.length, decoded: records.filter((r) => r.state !== 'unknown').length }; },
    dispose(): void { if (disposed) return; disposed = true; generation += 1; for (const record of records) record.group.removeFromParent(); for (const resource of resources) resource.dispose(); },
  };
}
