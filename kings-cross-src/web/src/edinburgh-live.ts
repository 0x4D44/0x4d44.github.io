// EB is a separate local graph and train layer. No London positions or fleet defaults.
import * as THREE from 'three';
import type { AnchorMap } from '../../core/anchors.ts';
import { buildGraph } from '../../core/graph.ts';
import type { Graph } from '../../core/graph.ts';
import { createMotion } from '../../core/motion.ts';
import type { TrainView } from '../../core/motion.ts';
import type { Car } from '../../core/train.ts';
import { decodeWaverleyAnchorScene, waverleyTrackData } from '../../core/waverley-anchors.ts';
import { createEdinburghKinds } from '../../core/train-neutral.ts';
import type { EdinburghServiceEvidence } from '../../core/train-neutral.ts';
import { bookedSource, firstEvidence, matchBooked, validateFleetTable } from '../../core/edinburgh-diagrams.ts';
import { ptacSource, validatePtacStore } from '../../core/edinburgh-ptac.ts';
import type { PtacStore } from '../../core/edinburgh-ptac.ts';
import type { FleetTable } from '../../core/edinburgh-diagrams.ts';
import { buildNeutralTrain } from './train-neutral.ts';
import { EDINBURGH_FLEET, buildEdinburghTrain, disposeEdinburghTrain } from './edinburgh-fleet.ts';
import { carPoses } from './trains-live.ts';
import { createAreaReplay } from './area-replay.ts';
import { backoffMs, createLiveFeed, parseRecording, relayReachable } from './feed.ts';
import type { LiveDependencies, MotionSink, TrainFeed } from './feed.ts';

/** Through platforms must never inherit the KX buffer-stop marker. */
export function validateEdinburghAnchors(value: unknown, graph: Graph): AnchorMap {
  const map = value as AnchorMap & { platformAssociations?: { berth: string; platform: string }[] };
  if (!map || map.area !== 'EB' || !Array.isArray(map.anchors) || !Array.isArray(map.unmapped) || !Array.isArray(map.sources)) throw new Error('EB anchor map required');
  const platforms = new Map<string, Set<string>>();
  if (map.platformAssociations !== undefined && !Array.isArray(map.platformAssociations)) throw new Error('invalid EB platform alternatives');
  for (const a of map.platformAssociations ?? []) {
    if (!a || typeof a.berth !== 'string' || typeof a.platform !== 'string') throw new Error('invalid EB platform alternatives');
    const refs = platforms.get(a.berth) ?? new Set(); refs.add(a.platform); platforms.set(a.berth, refs);
  }
  const seen = new Set<string>();
  for (const a of map.anchors) {
    if (!a || typeof a !== 'object') throw new Error('invalid EB anchor');
    const from = graph.pos.get(a.from), to = graph.pos.get(a.to);
    if (!from || !to || typeof a.berth !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(a.berth) || seen.has(a.berth) ||
      !graph.adj.get(a.from)?.some(e => e.a === a.to || e.b === a.to) ||
      !Number.isFinite(a.t) || a.t < 0 || a.t > 1 || !Array.isArray(a.point) || a.point.length !== 2 ||
      a.point.some((v, i) => !Number.isFinite(v) || Math.abs(v - (from[i]! + (to[i]! - from[i]!) * a.t)) > .05) ||
      !Number.isFinite(a.errorM) || a.errorM < 0 || typeof a.evidence !== 'string' || !a.evidence.trim()) throw new Error('invalid EB anchor geometry');
    if (a.platform !== undefined) throw new Error('EB anchor must not claim terminal buffer semantics');
    if ((platforms.get(a.berth)?.size ?? 0) > 1) throw new Error('EB anchor retains conflicting platform alternatives');
    seen.add(a.berth);
  }
  return map;
}

export function createEdinburghMotion(geometry: unknown, value: unknown,
  serviceFor?: (description: string, atTime: number) => EdinburghServiceEvidence | undefined) {
  const data = waverleyTrackData(decodeWaverleyAnchorScene(geometry)), graph = buildGraph(data);
  const anchors = validateEdinburghAnchors(value, graph), kinds = createEdinburghKinds(serviceFor, { rows: EDINBURGH_FLEET });
  const motion = createMotion(graph, anchors, { lengthM: kinds.lengthM,
    // ASSUMED conservative station speed until a sourced local restriction table exists.
    defaultSpeedMps: 25 / 3.6, stationSpeedMps: 25 / 3.6, estimatedMotion: false });
  const sink: MotionSink = { advance: motion.advance, apply: (event, at, observed) => {
    if (event.area === 'EB') motion.apply(event, at, observed);
  } };
  return { data, graph, anchors, kinds, motion, sink };
}

/** serviceFor for createEdinburghMotion: the booked table as it stands at each birth (absent: no evidence, so neutral). */
export const bookedServiceFor = (table: () => FleetTable | undefined) =>
  (description: string, atMs: number): EdinburghServiceEvidence | undefined => { const t = table(); return t ? matchBooked(t, description, atMs) : undefined; };

/** serviceFor with PTAC ahead of the booked diagrams, each as it stands at each birth; an absent source is skipped. */
export const fleetServiceFor = (ptac: () => PtacStore | undefined, table: () => FleetTable | undefined) =>
  (description: string, atMs: number): EdinburghServiceEvidence | undefined => {
    const p = ptac(), t = table();
    return firstEvidence(p && ptacSource(p), t && bookedSource(t))(description, atMs);
  };

/**
 * Reads GET /fleet's {booked, ptac} document. Each section is checked on its own: an invalid one is dropped and
 * named in the note, the other still counts. Throws when the body is not that document.
 */
export function readFleetDocument(body: unknown): { booked?: FleetTable; ptac?: PtacStore; note: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body) || !('booked' in body) || !('ptac' in body) || Object.keys(body).length !== 2) throw new Error('fleet document required');
  const doc = body as { booked: unknown; ptac: unknown };
  let booked: FleetTable | undefined, ptac: PtacStore | undefined;
  const bad: string[] = [];
  if (doc.booked !== null) { try { booked = validateFleetTable(doc.booked); } catch { bad.push('booked table invalid'); } }
  if (doc.ptac !== null) { try { ptac = validatePtacStore(doc.ptac); } catch { bad.push('PTAC store invalid'); } }
  const found = [ptac && `PTAC allocation (${Object.keys(ptac.trains).length} trains)`, booked && `booked diagrams (${booked.workings.length} workings)`].filter(Boolean);
  if (!found.length) throw new Error('no valid fleet section');
  return { booked, ptac, note: `fleet: ${found.join(' + ')}${bad.length ? ` (${bad.join(', ')})` : ''}` };
}

export function edinburghLiveDependencies(deps: LiveDependencies = {}): LiveDependencies {
  const source = deps.source ?? (url => new EventSource(url));
  return { ...deps, source: () => source('/relay/events?area=EB') };
}

export function createEdinburghLive(options: {
  geometry: unknown; scene: THREE.Scene; camera: THREE.Camera; parent: HTMLElement;
  mode: 'auto' | 'live' | 'replay' | 'demo' | 'none'; date: string; speed: number; hostname: string;
  fetchImpl?: typeof fetch; liveDependencies?: LiveDependencies;
}) {
  const group = new THREE.Group(); group.name = 'edinburgh-eb-trains'; options.scene.add(group);
  const labels = options.parent.ownerDocument.createElement('div'); labels.className = 'edinburgh-train-labels';
  labels.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;overflow:hidden'; options.parent.append(labels);
  const drawn = new Map<number, { group: THREE.Group; label: HTMLSpanElement }>();
  let session: ReturnType<typeof createEdinburghMotion> | undefined, feed: TrainFeed | undefined;
  let replay: ReturnType<typeof createAreaReplay> | undefined, disposed = false, loading = false, retryAt = 0, attempt = 0;
  let connection = 'live trains unavailable; private EB anchors required', error: string | undefined;
  // The fleet evidence (private, from the relay): PTAC allocations first, then the booked diagrams. Without either every
  // train is the neutral assumed fleet.
  let fleet: FleetTable | undefined, ptac: PtacStore | undefined, fleetNote = 'fleet: no evidence; neutral';
  const fetchImpl = options.fetchImpl ?? fetch, abort = new AbortController();
  const loadFleet = async (): Promise<void> => {
    fleet = undefined; ptac = undefined; fleetNote = 'fleet: no evidence; neutral';
    try {
      const response = await fetchImpl('/relay/fleet?area=EB', { cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10_000)]) });
      if (!response.ok) { fleetNote = `fleet: no evidence (${response.status === 404 ? 'no table' : response.status}); neutral`; return; }
      const doc = readFleetDocument(await response.json());
      fleet = doc.booked; ptac = doc.ptac; fleetNote = doc.note;
    } catch { fleetNote = 'fleet: no evidence (table unreadable or invalid); neutral'; }
  };
  const load = async (): Promise<void> => {
    if (disposed || loading || session || ['none', 'demo'].includes(options.mode) || !relayReachable(options.hostname)) return;
    loading = true;
    try {
      const response = await fetchImpl('/relay/anchors?area=EB', { cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10_000)]) });
      if (!response.ok) throw new Error(`EB anchors unavailable (${response.status})`);
      // serviceFor reads the table as it stands at each birth; the fleet is fetched below, before any train can be born.
      const candidate = createEdinburghMotion(options.geometry, await response.json(), fleetServiceFor(() => ptac, () => fleet));
      if (!candidate.anchors.anchors.length) throw new Error('EB positions/headings unresolved; no placed anchors');
      await loadFleet();
      if (options.mode === 'replay') {
        const recording = await fetchImpl(`/relay/recording?area=EB&date=${encodeURIComponent(options.date)}`, { cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)]) });
        if (!recording.ok) throw new Error(`EB recording unavailable (${recording.status})`);
        replay = createAreaReplay('EB', parseRecording(await recording.text()), candidate.sink, options.speed);
      }
      if (disposed) return;
      session = candidate; error = undefined;
      if (replay) connection = 'frozen EB replay';
      else feed = createLiveFeed(candidate.sink, text => { connection = text; }, edinburghLiveDependencies(options.liveDependencies));
    } catch (err) {
      if (!disposed) { error = (err as Error).message; connection = `live trains unavailable; ${error}`; retryAt = performance.now() + backoffMs(attempt++); }
    } finally { loading = false; }
  };
  const disposeTrain = (train: THREE.Group): void => {
    // Each builder shares plain()/bogies and owns its other geometry; its row says how to free it.
    disposeEdinburghTrain(train);
  };
  const update = (views: TrainView[]): void => {
    const present = new Set(views.map(v => v.id));
    for (const [id, item] of drawn) if (!present.has(id)) { item.group.removeFromParent(); item.label.remove(); disposeTrain(item.group); drawn.delete(id); }
    for (const view of views) {
      const choice = session!.kinds.formationFor(view)!;
      let item = drawn.get(view.id);
      if (!item) {
        const train = buildEdinburghTrain(choice) ?? buildNeutralTrain();
        const label = labels.ownerDocument.createElement('span'); label.style.cssText = 'position:absolute;font:11px system-ui;color:white;background:#27323cdd;padding:3px 5px;border-radius:4px;white-space:nowrap;transform:translate(-50%,-100%)';
        Object.assign(train.userData, { area: 'EB', id: view.id, kind: choice.kind, allocation: choice.allocation, length: view.lengthM });
        group.add(train); labels.append(label); item = { group: train, label }; drawn.set(view.id, item);
      }
      Object.assign(item.group.userData, { description: view.description, formationNote: choice.note });
      item.label.textContent = `${view.description} · ${choice.label}`;
      for (const car of item.group.children) car.visible = false;
      for (const pose of carPoses<Pick<Car, 'index' | 'end' | 'bogies'>>(session!.graph, view, choice.layout)) {
        const car = item.group.getObjectByName(`car-${pose.car.index}`)!;
        car.visible = true; car.position.set(pose.position[0], 0, pose.position[1]); car.rotation.y = pose.rotationY; car.scale.z = pose.scaleZ;
        for (const [k, sample] of [pose.frontBogie, pose.rearBogie].entries()) {
          const bogie = car.getObjectByName(`bogie-${pose.car.index}-${k}`);
          if (bogie) bogie.rotation.y = Math.atan2(sample.back[0], sample.back[1]) - pose.rotationY;
        }
      }
      const p = new THREE.Vector3(view.leading.point[0], 5, view.leading.point[1]).project(options.camera);
      item.label.hidden = !group.visible || Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || p.z < -1 || p.z > 1;
      item.label.style.left = `${(p.x + 1) * 50}%`; item.label.style.top = `${(1 - p.y) * 50}%`;
      item.group.visible = view.opacity > 0;
    }
  };
  return {
    group, load, timeMs: () => replay?.timeMs() ?? 0,
    state: () => ({ area: 'EB', ready: !!session, connection, error, anchors: session?.anchors, trains: session?.motion.trains() ?? [] }),
    status: (): string => `Edinburgh Waverley: ${connection}${session ? ` · ${drawn.size} trains · ${fleetNote} · provisional berth positions/headings` : ''}`,
    frame(dt: number, selected: boolean, utcMs?: number): void {
      group.visible = selected; labels.hidden = !selected;
      if (selected && performance.now() >= retryAt) void load();
      feed?.advance(dt); replay?.frame(dt, utcMs && utcMs > 0 ? utcMs : undefined);
      if (session) update(session.motion.trains());
    },
    dispose(): void { disposed = true; abort.abort(); feed?.dispose(); for (const item of drawn.values()) { disposeTrain(item.group); item.label.remove(); } drawn.clear(); group.removeFromParent(); labels.remove(); },
  };
}
