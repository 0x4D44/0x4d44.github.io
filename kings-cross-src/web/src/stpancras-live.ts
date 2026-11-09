// MML only. All operational placement comes from the private WH anchor endpoint.
// SMART reporting offsets and a headcode's first digit never choose a position or fleet.
import * as THREE from 'three';
import type { AnchorMap } from '../../core/anchors.ts';
import { buildGraph } from '../../core/graph.ts';
import type { Graph } from '../../core/graph.ts';
import { createMotion } from '../../core/motion.ts';
import type { MotionEvent, TrainView } from '../../core/motion.ts';
import type { KxData } from '../../core/osm.ts';
import { emrTrainLayout } from '../../core/train-emr.ts';
import type { EmrKind } from '../../core/train-emr.ts';
import { buildEmrTrain, disposeEmrTrain } from './train-emr.ts';
import { carPoses } from './trains-live.ts';
import { backoffMs, createLiveFeed, parseRecording, relayReachable } from './feed.ts';
import type { LiveDependencies, MotionSink, RecordedEvent, TrainFeed } from './feed.ts';
import { createAreaReplay } from './area-replay.ts';

export const MML_AREA = 'WH';
export const ASSUMED_MML_KIND: EmrKind = 'emr222x5';
export const MML_ALLOCATION_NOTE = 'EMR Class 222 · 5 cars · assumed fleet; allocation unavailable';

/** Refuse another station's map, invalid edges and platform labels outside MML 1–4. */
export function validateMmlAnchors(value: unknown, graph: Graph): AnchorMap {
  const map = value as AnchorMap;
  if (!map || map.area !== MML_AREA || !Array.isArray(map.anchors) || !Array.isArray(map.unmapped) || !Array.isArray(map.sources)) throw new Error('WH anchor map required');
  const seen = new Set<string>();
  for (const a of map.anchors) {
    if (!a || typeof a !== 'object') throw new Error('invalid WH anchor geometry or MML platform');
    const from = graph.pos.get(a.from), to = graph.pos.get(a.to);
    if (!a || typeof a.berth !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(a.berth) || seen.has(a.berth) ||
      !['platform', 'signal', 'smart', 'inferred'].includes(a.kind) || !Number.isFinite(a.errorM) || a.errorM < 0 ||
      typeof a.evidence !== 'string' || !a.evidence.trim() || !from || !to ||
      !graph.adj.get(a.from)?.some(e => e.a === a.to || e.b === a.to) ||
      !Number.isFinite(a.t) || a.t < 0 || a.t > 1 || !Array.isArray(a.point) || a.point.length !== 2 ||
      a.point.some((v, i) => !Number.isFinite(v) || Math.abs(v - (from[i]! + (to[i]! - from[i]!) * a.t)) > .05) ||
      (a.platform !== undefined && !/^[1-4]$/.test(a.platform))) throw new Error('invalid WH anchor geometry or MML platform');
    seen.add(a.berth);
  }
  return map;
}

/** The area's URL is fixed here; it can never be supplied as a path by page input. */
export function mmlLiveDependencies(deps: LiveDependencies = {}): LiveDependencies {
  const source = deps.source ?? (url => new EventSource(url));
  return { ...deps, source: () => source('/relay/events?area=WH') };
}

/** Use the existing reconciliation/timeline, but seek both areas to the same UTC clock. */
export function createMmlReplay(rows: readonly RecordedEvent[], sink: MotionSink, speed = 1) {
  return createAreaReplay(MML_AREA, rows, sink, speed);
}

export function createMmlMotion(data: KxData, value: unknown) {
  const graph = buildGraph(data, { curves: true }), anchors = validateMmlAnchors(value, graph);
  const layout = emrTrainLayout(ASSUMED_MML_KIND);
  const motion = createMotion(graph, anchors, { lengthM: layout.length,
    // ASSUMED conservative MML station limit, pending a sourced local speed table.
    defaultSpeedMps: 25 / 3.6, stationSpeedMps: 25 / 3.6,
    wayMaxspeed: new Map(data.rails.filter(r => r.maxspeed).map(r => [r.id, r.maxspeed!])) });
  const sink: MotionSink = { advance: motion.advance, apply: (event: MotionEvent, at, received) => {
    if (event.area === MML_AREA) motion.apply(event, at, received);
  } };
  return { graph, anchors, motion, sink, kind: ASSUMED_MML_KIND, layout };
}

/** An independent group is masked at station selection; KX's model/resolver is untouched. */
export function createStPancrasLive(options: {
  data: KxData; scene: THREE.Scene; parent: HTMLElement; camera: THREE.Camera;
  mode: 'auto' | 'live' | 'replay' | 'demo' | 'none'; date: string; speed: number; hostname: string;
  fetchImpl?: typeof fetch; liveDependencies?: LiveDependencies;
}) {
  const group = new THREE.Group(); group.name = 'st-pancras-mml-trains'; group.visible = false; options.scene.add(group);
  const labels = options.parent.ownerDocument.createElement('div'); labels.className = 'mml-train-labels';
  labels.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;overflow:hidden'; options.parent.append(labels);
  const drawn = new Map<number, { group: THREE.Group; label: HTMLSpanElement }>();
  let session: ReturnType<typeof createMmlMotion> | undefined, feed: TrainFeed | undefined;
  let replay: ReturnType<typeof createMmlReplay> | undefined, disposed = false, loading = false, retryAt = 0, attempt = 0;
  let connection = 'live trains not yet enabled; WH anchors unavailable', error: string | undefined;
  const abort = new AbortController();
  const fetchImpl = options.fetchImpl ?? fetch;
  const load = async (): Promise<void> => {
    if (disposed || loading || session || options.mode === 'none' || options.mode === 'demo' || !relayReachable(options.hostname)) return;
    loading = true;
    try {
      const response = await fetchImpl('/relay/anchors?area=WH', { cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10_000)]) });
      if (!response.ok) throw new Error(`WH anchors unavailable (${response.status})`);
      const candidate = createMmlMotion(options.data, await response.json());
      if (!candidate.anchors.anchors.some(a => a.kind === 'platform')) throw new Error('WH platform anchors not yet reviewed');
      if (options.mode === 'replay') {
        const recording = await fetchImpl(`/relay/recording?area=WH&date=${encodeURIComponent(options.date)}`, { cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)]) });
        if (!recording.ok) throw new Error(`WH recording unavailable (${recording.status})`);
        replay = createMmlReplay(parseRecording(await recording.text()), candidate.sink, options.speed);
      }
      if (disposed) return;
      session = candidate; error = undefined;
      if (!replay) feed = createLiveFeed(candidate.sink, text => { connection = text; }, mmlLiveDependencies(options.liveDependencies));
      else connection = 'frozen WH replay';
    } catch (err) {
      if (!disposed) { error = (err as Error).message; connection = `live trains not yet enabled; ${error}`; retryAt = performance.now() + backoffMs(attempt++); }
    } finally { loading = false; }
  };
  const update = (views: TrainView[]): void => {
    const present = new Set(views.map(v => v.id));
    for (const [id, item] of drawn) if (!present.has(id)) {
      group.remove(item.group); item.label.remove(); disposeEmrTrain(item.group); drawn.delete(id);
    }
    for (const view of views) {
      let item = drawn.get(view.id);
      if (!item) {
        const train = buildEmrTrain(ASSUMED_MML_KIND), label = labels.ownerDocument.createElement('span');
        label.style.cssText = 'position:absolute;font:11px system-ui;color:white;background:#241a37d9;padding:3px 5px;border-radius:4px;white-space:nowrap;transform:translate(-50%,-100%)';
        Object.assign(train.userData, { area: MML_AREA, id: view.id, allocation: 'assumed fleet' });
        labels.append(label); group.add(train); item = { group: train, label }; drawn.set(view.id, item);
      }
      Object.assign(item.group.userData, { description: view.description, formationNote: MML_ALLOCATION_NOTE });
      item.label.textContent = `${view.description} · ${MML_ALLOCATION_NOTE}`;
      item.group.children.forEach(c => { c.visible = false; });
      for (const pose of carPoses(session!.graph, view, session!.layout)) {
        const car = item.group.getObjectByName(`car-${pose.car.index}`)!; car.visible = true;
        car.position.set(pose.position[0], 0, pose.position[1]); car.rotation.y = pose.rotationY; car.scale.z = pose.scaleZ;
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
    state: () => ({ area: MML_AREA, connection, error, ready: !!session, assumedFleet: MML_ALLOCATION_NOTE, anchors: session?.anchors, trains: session?.motion.trains() ?? [] }),
    status: (): string => `St Pancras: MML platforms 1–4 · ${connection}${session ? ` · ${drawn.size} trains · assumed fleet (EMR 222); allocations unavailable · provisional berth positions` : ''} · Thameslink/HS1 not yet enabled`,
    frame(dt: number, selected: boolean, utcMs?: number): void {
      group.visible = selected; labels.hidden = !selected;
      if (selected && performance.now() >= retryAt) void load();
      feed?.advance(dt); replay?.frame(dt, utcMs && utcMs > 0 ? utcMs : undefined);
      if (session) update(session.motion.trains());
    },
    dispose(): void { disposed = true; abort.abort(); feed?.dispose(); drawn.forEach(i => { disposeEmrTrain(i.group); i.label.remove(); }); drawn.clear(); group.removeFromParent(); labels.remove(); },
  };
}
