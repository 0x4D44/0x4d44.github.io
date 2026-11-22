import * as THREE from 'three';
import { createPerthTrack, planPerthTrains } from '../../core/perth-motion.ts';
import type { PerthCall, PerthReport } from '../../core/perth-motion.ts';
import { neutralTrainLayout } from '../../core/train-neutral.ts';
import { validDate } from '../../core/schedule.ts';
import { backoffMs, relayReachable } from './feed.ts';
import type { ThroughLiveOptions } from './edinburgh-live.ts';
import { TrainLampLights } from './train-lamp-pool.ts';
import type { LampTrain } from './train-lamp-pool.ts';
import { buildNeutralTrain, disposeNeutralTrain } from './train-neutral.ts';
import { carPoses } from './trains-live.ts';

const POLL_MS = 4000;

interface PerthSnapshot {
  date: string; scheduleAvailable: boolean; feed: string; calls: PerthCall[]; reports: PerthReport[];
}

function readSnapshot(value: unknown): PerthSnapshot {
  const doc = value as PerthSnapshot;
  if (!doc || typeof doc.date !== 'string' || !validDate(doc.date) || typeof doc.scheduleAvailable !== 'boolean' ||
      typeof doc.feed !== 'string' || !Array.isArray(doc.calls) || !Array.isArray(doc.reports) || doc.calls.length > 10_000 || doc.reports.length > 1000) {
    throw new Error('invalid relay reply');
  }
  const id = (v: unknown) => typeof v === 'string' && /^[0-9][A-Z][0-9]{2}$/.test(v);
  const time = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 8.64e15;
  const maybeTime = (v: unknown) => v === null || time(v);
  const direction = (v: unknown) => [null, 'north', 'east', 'south'].includes(v as string | null);
  const platform = (v: unknown) => v === null || (typeof v === 'string' && /^[A-Z0-9]{1,8}$/.test(v));
  if (!doc.calls.every(c => c && id(c.headcode) && typeof c.uid === 'string' && /^[A-Z0-9]{1,12}$/.test(c.uid) && platform(c.platform) &&
      direction(c.from) && direction(c.to) && [c.arrivalMs, c.departureMs, c.passMs].every(maybeTime)) ||
      !doc.reports.every(r => r && id(r.headcode) && ['ARRIVAL', 'DEPARTURE', 'PASS'].includes(r.eventType) && platform(r.platform) &&
        maybeTime(r.plannedMs) && time(r.actualMs) && time(r.receivedAtMs))) throw new Error('invalid relay reply');
  return doc;
}

export function createPerthLive(options: Omit<ThroughLiveOptions, 'signals' | 'signalOccupancyMs' | 'liveDependencies'> & { now?: () => number }) {
  // In both capture modes, leave the scene and DOM exactly as the station model installed them.
  if (options.mode === 'none' || options.mode === 'demo' || !relayReachable(options.hostname)) return undefined;
  const track = createPerthTrack(options.geometry), layout = neutralTrainLayout();
  const group = new THREE.Group(); group.name = 'perth-trains'; options.scene.add(group);
  const lights = new TrainLampLights(); options.scene.add(lights.group);
  const labels = options.parent.ownerDocument.createElement('div'); labels.className = 'perth-train-labels';
  labels.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;overflow:hidden'; options.parent.append(labels);
  const drawn = new Map<string, { train: THREE.Group; label: HTMLSpanElement }>();
  const lamps: LampTrain[] = [];
  const fetchImpl = options.fetchImpl ?? fetch, now = options.now ?? Date.now, abort = new AbortController();
  const replayDate = options.mode === 'replay' ? options.date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : null;
  let replayTime = replayDate ? Date.parse(`${replayDate}T12:00:00Z`) : 0;
  let snapshot: PerthSnapshot | undefined, plan: ReturnType<typeof planPerthTrains> | undefined;
  let views: ReturnType<NonNullable<typeof plan>['trainsAt']> = [];
  let disposed = false, loading = false, error = '', nextPoll = -Infinity, attempt = 0;
  async function load(): Promise<void> {
    if (disposed || loading || (replayDate && snapshot)) return;
    loading = true;
    try {
      const path = replayDate ? `/relay/perth?date=${encodeURIComponent(replayDate)}` : '/relay/perth';
      const response = await fetchImpl(path, { cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(6000)]) });
      if (!response.ok) throw new Error(response.status === 404 ? 'local Perth relay route disabled' : `relay HTTP ${response.status}`);
      const next = readSnapshot(await response.json());
      if (disposed) return;
      plan = planPerthTrains(track, next.calls, replayDate ? [] : next.reports);
      snapshot = next; error = ''; attempt = 0; nextPoll = now() + POLL_MS;
    } catch (cause) {
      if (!disposed) {
        error = cause instanceof Error && /^(local Perth relay route disabled|relay HTTP \d+|invalid relay reply)$/.test(cause.message) ? cause.message : 'local relay unavailable';
        nextPoll = now() + Math.max(POLL_MS, backoffMs(attempt++));
      }
    } finally { loading = false; }
  }
  function remove(item: { train: THREE.Group; label: HTMLSpanElement }) {
    item.train.removeFromParent(); item.label.remove(); disposeNeutralTrain(item.train);
  }
  return {
    group, load,
    timeMs: () => replayTime || 0,
    lampTrains: (): readonly LampTrain[] => lamps,
    state: () => ({ snapshot, trains: views, unresolvedPlatforms: plan?.unresolvedPlatforms, unresolvedRoutes: plan?.unresolvedRoutes }),
    status() {
      if (!snapshot?.scheduleAvailable) return `Perth: unavailable · ${error || 'private timetable unavailable'}`;
      const live = views.filter(v => v.source === 'live').length;
      const basis = live ? 'live from train reports' : 'scheduled';
      const detail = live && live < views.length ? ` · ${views.length - live} scheduled` : '';
      const feed = error ? ` · ${error} · showing cached data` : snapshot.feed !== 'connected' && !replayDate ? ` · TRUST ${snapshot.feed}` : '';
      const platform = plan?.unresolvedPlatforms.length ? ` · platform ${plan.unresolvedPlatforms.join(', ')} unresolved · timetable line used where available` : '';
      const route = plan?.unresolvedRoutes ? ` · ${plan.unresolvedRoutes} calls with unresolved routes` : '';
      const reports = plan?.unmatchedReports ? ` · ${plan.unmatchedReports} unmatched reports` : '';
      return `Perth: ${basis} · ${views.length} trains${detail}${feed}${platform}${route}${reports}`;
    },
    frame(dt: number, selected: boolean, utcMs?: number) {
      group.visible = selected; labels.hidden = !selected; lights.group.visible = selected; lamps.length = 0;
      if (!selected || disposed) return;
      const wall = now();
      if (wall >= nextPoll) void load();
      if (replayDate) replayTime = (utcMs && utcMs > 0) ? utcMs : replayTime + dt * options.speed * 1000;
      views = plan?.trainsAt(replayDate ? replayTime : wall) ?? [];
      const present = new Set(views.map(v => v.key));
      for (const [key, item] of drawn) if (!present.has(key)) { remove(item); drawn.delete(key); }
      lights.begin();
      for (const { key, view, platform, phase, source } of views) {
        let item = drawn.get(key);
        if (!item) {
          const train = buildNeutralTrain(layout, true), label = labels.ownerDocument.createElement('span');
          label.style.cssText = 'position:absolute;font:11px system-ui;color:white;background:#27323cdd;padding:3px 5px;border-radius:4px;white-space:nowrap;transform:translate(-50%,-100%)';
          group.add(train); labels.append(label); item = { train, label }; drawn.set(key, item);
        }
        Object.assign(item.train.userData, { description: view.description, platform, phase, source });
        for (const car of item.train.children) car.visible = false;
        for (const pose of carPoses(track.graph, view, layout)) {
          const car = item.train.getObjectByName(`car-${pose.car.index}`)!;
          car.visible = true; car.position.set(pose.position[0], 0, pose.position[1]); car.rotation.y = pose.rotationY; car.scale.z = pose.scaleZ;
          for (const [k, sample] of [pose.frontBogie, pose.rearBogie].entries()) {
            const bogie = car.getObjectByName(`bogie-${pose.car.index}-${k}`);
            if (bogie) bogie.rotation.y = Math.atan2(sample.back[0], sample.back[1]) - pose.rotationY;
          }
        }
        const p = new THREE.Vector3(view.leading.point[0], 5, view.leading.point[1]).project(options.camera);
        item.label.textContent = `${view.description} · ${source}${platform ? ` · platform ${platform}` : ''}`;
        item.label.hidden = Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || p.z < -1 || p.z > 1;
        item.label.style.left = `${(p.x + 1) * 50}%`; item.label.style.top = `${(1 - p.y) * 50}%`;
        lights.add(item.train); lamps.push({ group: item.train });
      }
      lights.commit();
    },
    dispose() {
      if (disposed) return;
      disposed = true; abort.abort();
      for (const item of drawn.values()) remove(item);
      drawn.clear(); lamps.length = 0; labels.remove(); lights.dispose(); group.removeFromParent();
    },
  };
}
