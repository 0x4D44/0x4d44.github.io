import * as THREE from 'three';
import { signalStates, updateBytes } from '../../core/sclass.ts';
import type { ByteState, SignalEvidence, SignalHypothesis, SignalState, TimedTdEvent } from '../../core/sclass.ts';
import type { AnchorMap } from '../../core/anchors.ts';

export interface OverlaySignal {
  id: number;
  point: [number, number];
  ref?: string;
  direction?: string;
  kinds: string[];
  edge: { wayId: number; from: number; to: number; t: number; point: [number, number] };
  travel: [number, number];
  facing: [number, number];
  side: 'left' | 'right';
  sideSource: 'osm' | 'assumed-left';
  berth?: string;
  review: 'osm-ref-match' | 'topology' | 'unreviewed';
}
export interface SignalOverlay { attribution: string; signals: OverlaySignal[] }
export type SignalEvent = TimedTdEvent | { t: number; e: { kind: 'snapshot'; area: string; berths?: unknown; sclass?: unknown } };
export interface DrawnSignal { signal: OverlaySignal; group: THREE.Group; state: SignalState }

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
function evidence(v: unknown): v is SignalEvidence {
  if (!object(v) || !count(v.trials) || !count(v.support) || !count(v.contradictions) || !count(v.unmatchedCycles) ||
      v.support + v.contradictions !== v.trials) return false;
  return v.trials === 0 ? v.precision === null : typeof v.precision === 'number' && Number.isFinite(v.precision) &&
    Math.abs(v.precision - v.support / v.trials) < 1e-12;
}
function validated(value: unknown, area: string): SignalHypothesis[] {
  if (!object(value) || value.area !== area || !Array.isArray(value.hypotheses)) return [];
  const result: SignalHypothesis[] = [];
  for (const h of value.hypotheses) {
    if (!object(h) || typeof h.id !== 'string' || !h.id || typeof h.berth !== 'string' || !h.berth ||
        typeof h.address !== 'string' || !/^[\dA-F]{2,4}$/.test(h.address) ||
        h.address !== Number.parseInt(h.address, 16).toString(16).toUpperCase().padStart(2, '0') ||
        !Number.isInteger(h.bit) || (h.bit as number) < 0 || (h.bit as number) > 7 ||
        (h.proceedValue !== 0 && h.proceedValue !== 1) || (h.status !== 'decoded' && h.status !== 'unknown') ||
        typeof h.reason !== 'string' || !evidence(h.training) || !evidence(h.heldOut)) return [];
    result.push(structuredClone(h) as unknown as SignalHypothesis);
  }
  // A JSON status cannot resolve competing training associations.
  return result.map((h) => result.some((other) => other !== h && (other.berth === h.berth ||
    (other.address === h.address && other.bit === h.bit))) ? { ...h, status: 'unknown' } : h);
}

/** Node-safe geometry and a conservative, local-relay-only byte controller. Fetch is explicit. */
export function createSignals(overlay: SignalOverlay, parent: THREE.Object3D,
  options: { fetchImpl?: typeof fetch; area?: string } = {}) {
  const area = options.area ?? 'Y9';
  const records: DrawnSignal[] = [];
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  const lamps = new Map<DrawnSignal, THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>>();
  const questions = new Map<DrawnSignal, THREE.Group>();
  let bytes: ByteState = {}, table: SignalHypothesis[] = [], disposed = false, generation = 0;
  const anchors: AnchorMap = { area, sources: [overlay.attribution], anchors: [], unmapped: [] };
  const directAnchors: AnchorMap['anchors'] = [];
  const runtimeBerths = new Map<DrawnSignal, string>();
  const matches = new Map<string, number>();
  for (const s of overlay.signals) if (s.berth) matches.set(s.berth, (matches.get(s.berth) ?? 0) + 1);
  function mesh(geometry: THREE.BufferGeometry, color: number): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({ color });
    resources.add(geometry); resources.add(material);
    return new THREE.Mesh(geometry, material);
  }
  for (const signal of overlay.signals) {
    const group = new THREE.Group(); group.name = `signal-${signal.id}`;
    const side = signal.side === 'left' ? 1 : -1;
    group.position.set(signal.edge.point[0] + side * 2 * signal.travel[1], 0,
      signal.edge.point[1] - side * 2 * signal.travel[0]);
    group.rotation.y = Math.atan2(signal.facing[0], signal.facing[1]);
    const post = mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.7, 6), 0x999999); post.position.y = 1.85; group.add(post);
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
    const record: DrawnSignal = { signal, group, state: 'unknown' }; records.push(record); lamps.set(record, lamp); questions.set(record, question);
    if (signal.kinds.includes('main') && signal.berth && /^\d+$/.test(signal.berth) &&
        /^YA\s*\d+$/i.test(signal.ref ?? '') && (signal.ref ?? '').replace(/^YA\s*/i, '') === signal.berth && matches.get(signal.berth) === 1) {
      anchors.anchors.push({ berth: signal.berth, kind: 'signal', from: signal.edge.from, to: signal.edge.to,
        t: signal.edge.t, point: [...signal.edge.point], errorM: 0, evidence: 'OSM signal overlay' });
    }
    if (anchors.anchors.at(-1)?.berth === signal.berth) runtimeBerths.set(record, signal.berth!);
    parent.add(group);
  }
  directAnchors.push(...anchors.anchors);
  function install(value: unknown): void {
    table = validated(value, area);
    anchors.anchors = [...directAnchors];
    runtimeBerths.clear();
    for (const record of records) if (directAnchors.some((a) => a.berth === record.signal.berth)) runtimeBerths.set(record, record.signal.berth!);
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
        const signal = record.signal; runtimeBerths.set(record, mapping.berth);
        anchors.anchors.push({ berth: mapping.berth, kind: 'signal', from: signal.edge.from, to: signal.edge.to, t: signal.edge.t,
          point: [...signal.edge.point], errorM: 40, evidence: 'Private topology review' });
      }
    }
    refresh();
  }
  function refresh(): void {
    if (disposed) return;
    const states = signalStates(bytes, table, anchors);
    for (const record of records) {
      record.state = record.signal.kinds.includes('main') ? states[runtimeBerths.get(record) ?? ''] ?? 'unknown' : 'unknown';
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
    setTable(value: unknown): void { generation += 1; install(value); },
    async loadTable(): Promise<void> {
      const request = ++generation; table = []; refresh();
      try {
        const response = await (options.fetchImpl ?? fetch)('/relay/sclass');
        const value: unknown = response.ok ? await response.json() : null;
        if (!disposed && request === generation) { install(value); }
      } catch { if (!disposed && request === generation) { table = []; refresh(); } }
    },
    signals(): DrawnSignal[] { return [...records]; },
    counts(): { drawn: number; decoded: number } { return { drawn: records.length, decoded: records.filter((r) => r.state !== 'unknown').length }; },
    dispose(): void { if (disposed) return; disposed = true; generation += 1; for (const record of records) record.group.removeFromParent(); for (const resource of resources) resource.dispose(); },
  };
}
