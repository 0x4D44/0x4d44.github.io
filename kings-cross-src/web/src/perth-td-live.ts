import * as THREE from 'three';
import { STATIONS } from '../../core/station-config.ts';
import { buildGraph } from '../../core/graph.ts';
import { decodeWaverleyAnchorScene, waverleyTrackData } from '../../core/waverley-anchors.ts';
import { createThroughLive } from './edinburgh-live.ts';
import type { ThroughLiveOptions } from './edinburgh-live.ts';
import { relayReachable } from './feed.ts';

/** Parked TD-only prototype. Perth station has no open TD coverage; the page uses perth-live.ts. */
export function createPerthTdLive(options: ThroughLiveOptions & { areas?: readonly string[] }) {
  const areas = options.areas ?? STATIONS.perth.tdAreas;
  if (options.mode === 'none' || options.mode === 'demo' || !areas.length || !relayReachable(options.hostname)) return undefined;
  const data = waverleyTrackData(decodeWaverleyAnchorScene(options.geometry));
  const track = { data, graph: buildGraph(data) };
  const group = new THREE.Group(); group.name = 'perth-trains'; options.scene.add(group);
  const layers = areas.map(area => {
    const layer = createThroughLive(options, { area, track });
    group.add(layer.group);
    return layer;
  });
  const replayClock = () => layers.find(layer => layer.timeMs() > 0);
  return {
    group,
    async load() { await Promise.all(layers.map(layer => layer.load())); },
    timeMs: () => replayClock()?.timeMs() ?? 0,
    lampTrains: () => layers.flatMap(layer => layer.lampTrains()),
    state: () => ({ areas: layers.map(layer => layer.state()) }),
    status: () => `Perth · ${layers.map(layer => layer.status()).join(' · ')}`,
    frame(dt: number, selected: boolean, utcMs?: number) {
      const clock = replayClock();
      clock?.frame(dt, selected, utcMs);
      for (const layer of layers) if (layer !== clock) layer.frame(dt, selected, clock?.timeMs() ?? utcMs);
    },
    dispose() { for (const layer of layers) layer.dispose(); group.removeFromParent(); },
  };
}
