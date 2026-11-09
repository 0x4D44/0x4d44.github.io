// Station focus owns cameras and scene residency, never the UTC feed or replay clock.
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STATIONS } from '../../core/station-config.ts';
import type { StationId } from '../../core/station-config.ts';
import type { KxData } from '../../core/osm.ts';
import { barlowPlan, midlandGrandPlan } from '../../core/landmarks.ts';
import { shedToWorld, worldToShed } from '../../core/station.ts';
import { createStationSelection, stationFromSearch, stationHref, stationMessage } from './station-selection.ts';
import { bindStationFlightCancellation, sampleStationFlight } from './station-transition.ts';
import type { StationView } from './station-transition.ts';
import { releaseSceneGpu } from './station-resources.ts';
import { kingsCrossView } from './station-framing.ts';

export const STATION_CSS = `
.station-switcher{position:fixed;top:48px;left:16px;right:16px;max-width:660px;z-index:30;box-sizing:border-box;color:var(--fg);font:13px/1.4 system-ui,sans-serif}
.station-buttons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.station-buttons button{min-width:0;min-height:44px;padding:6px;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:inherit;font:inherit;cursor:pointer;overflow-wrap:anywhere}
.station-buttons button[aria-pressed=true]{border-color:#e4b65b;background:#394354;color:#fff}
.station-buttons button:focus-visible{outline:3px solid #ffd077;outline-offset:2px}
.station-notice{margin:6px 0 0;padding:5px 8px;border-radius:6px;background:var(--panel);font-size:12px}
.station-placeholder{position:fixed;inset:0;display:grid;place-content:center;padding:150px 24px 110px;box-sizing:border-box;text-align:center;pointer-events:none;z-index:2;color:var(--fg)}
.station-placeholder[hidden]{display:none}.station-placeholder p{max-width:560px;margin:8px auto}.station-placeholder h2{margin:0;font-size:24px}
body[data-station] .kx-board{top:calc(var(--station-nav-bottom,140px) + 8px)!important;max-height:calc(100dvh - var(--station-nav-bottom,140px) - 8px - var(--board-bottom,100px))!important}
body[data-station]:not([data-station=kings-cross]) .kx-board,body[data-station]:not([data-station=kings-cross]) .kx-tip{display:none!important}
@media(prefers-reduced-motion:reduce){.station-switcher *{scroll-behavior:auto}}
`;

/** Same OSM-derived oblique as the fixed station evidence camera; no invented station geometry. */
export function stPancrasView(data: KxData, aspect: number): StationView {
  const plan = barlowPlan(data), hotel = midlandGrandPlan(data);
  const east = Math.max(...hotel.outline.map(point => worldToShed(plan, point).u));
  const point = (u: number, v: number, y: number): [number, number, number] => {
    const [x, z] = shedToWorld(plan, u, v); return [x, y, z];
  };
  const target = point(plan.width / 2, plan.barlowLength * .48, plan.rise * .48);
  const eye = point(east + plan.width * 3.3, -plan.width * .4, plan.rise * 6);
  // ASSUMED framing margin: narrow screens need a larger stand-off to retain the whole shed.
  const scale = Math.max(1, 1.3 / Math.max(.2, aspect));
  return { eye: eye.map((v, i) => target[i] + (v - target[i]) * scale) as [number, number, number], target };
}

/** Measure the drawn roofs after lazy London loads; exclude the sky dome and distant ground. */
export function londonRoofCeiling(scene: THREE.Scene): number {
  scene.updateMatrixWorld(true);
  let top = 0;
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const box = new THREE.Box3().setFromObject(object);
    // The enclosing sky is kilometres high. Camera safety concerns the built scene below it.
    if (box.max.y < 1000) top = Math.max(top, box.max.y);
  });
  return top;
}

export function createStations(options: {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; renderer: THREE.WebGLRenderer;
  ready: Promise<unknown>; data: KxData; kxObjects(): THREE.Object3D[];
}) {
  const { scene: london, camera, controls, renderer } = options;
  const doc = renderer.domElement.ownerDocument, win = doc.defaultView!;
  const initial: StationView = { eye: camera.position.toArray(), target: controls.target.toArray() };
  const nav = doc.createElement('nav'); nav.className = 'station-switcher'; nav.setAttribute('aria-label', 'Stations');
  const style = doc.createElement('style'); style.textContent = STATION_CSS;
  const buttons = doc.createElement('div'); buttons.className = 'station-buttons';
  const notice = doc.createElement('p'); notice.className = 'station-notice'; notice.id = 'station-notice';
  notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  const placeholder = doc.createElement('section'); placeholder.className = 'station-placeholder'; placeholder.hidden = true;
  const heading = doc.createElement('h2'); heading.textContent = 'Edinburgh Waverley';
  const explanation = doc.createElement('p'); explanation.textContent = stationMessage('edinburgh-waverley');
  const hopLabel = doc.createElement('p'); hopLabel.textContent = 'Map hop · separate station scene';
  placeholder.append(heading, explanation, hopLabel); nav.append(style, buttons, notice); doc.body.append(nav, placeholder);
  const stationButtons = new Map<StationId, HTMLButtonElement>();
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const masked = new Map<THREE.Object3D, boolean>();
  let activeScene = london, active: StationId = 'kings-cross', lastTime = performance.now(), roofCeiling = 0;
  let flight: { start: number; from: StationView; to: StationView } | null = null;
  let hop: { start: number; to: StationId; swap: () => void; swapped: boolean } | null = null;
  let placeholderScene: ReturnType<typeof import('./waverley.ts')['createWaverleyPlaceholderScene']> | null = null;
  let disposed = false, releases = 0;
  let viewportAspect = camera.aspect;
  let cancelInput = (): void => {};
  const viewOf = (id: StationId): StationView => id === 'st-pancras' ? stPancrasView(options.data, camera.aspect)
    : id === 'kings-cross' ? kingsCrossView(options.data, initial, camera.aspect) : initial;
  const pose = (view: StationView): void => { camera.position.fromArray(view.eye); controls.target.fromArray(view.target); controls.update(); };
  const sizeNav = (): void => { doc.body.style.setProperty('--station-nav-bottom', `${nav.getBoundingClientRect().bottom}px`); };
  const maskKx = (): void => {
    if (selection.state().selected === 'kings-cross') { for (const [object, visible] of masked) object.visible = visible; masked.clear(); }
    else {
      const objects = new Set(options.kxObjects());
      for (const object of masked.keys()) if (!objects.has(object)) masked.delete(object);
      for (const object of objects) { if (!masked.has(object)) masked.set(object, object.visible); object.visible = false; }
    }
  };
  const selection = createStationSelection({
    load: async (id) => {
      if (id === 'edinburgh-waverley') return await import('./waverley.ts');
      await options.ready; roofCeiling = londonRoofCeiling(london); return null;
    },
    activate: (id, module) => {
      cancelInput(); flight = null; hop = null; renderer.domElement.style.opacity = '1';
      const destination = viewOf(id);
      if (id === 'edinburgh-waverley' || activeScene !== london) {
        const swap = (): void => {
          if (id === 'edinburgh-waverley') {
            if (activeScene === london) { releaseSceneGpu(london); ++releases; }
            placeholderScene?.dispose();
            placeholderScene = module!.createWaverleyPlaceholderScene(); activeScene = placeholderScene.scene;
            pose({ eye: [0, 2, 10], target: [0, 0, 0] });
          } else {
            placeholderScene?.dispose(); placeholderScene = null; activeScene = london; pose(viewOf(id));
          }
          renderer.renderLists.dispose(); active = id; placeholder.hidden = id !== 'edinburgh-waverley';
        };
        if (reduced.matches) { swap(); return 'ready'; }
        hop = { start: lastTime, to: id, swap, swapped: false }; return 'hopping';
      }
      active = id;
      if (reduced.matches) { pose(destination); return 'ready'; }
      flight = { start: lastTime, from: { eye: camera.position.toArray(), target: controls.target.toArray() }, to: destination };
      cancelInput = bindStationFlightCancellation({ controls, canvas: renderer.domElement, keyboardTarget: win }, () => {
        if (flight) { flight = null; selection.finish(); }
      });
      return 'flying';
    },
    change: state => {
      doc.body.dataset.station = state.selected;
      doc.querySelector('h1')!.textContent = STATIONS[state.selected].name;
      doc.getElementById('app')?.setAttribute('aria-label', `${STATIONS[state.selected].name} station view`);
      nav.setAttribute('aria-busy', String(state.phase === 'loading'));
      notice.textContent = state.phase === 'hopping' ? `Map hop · ${state.message}` : state.message;
      for (const [id, button] of stationButtons) {
        button.setAttribute('aria-pressed', String(id === state.selected));
        button.textContent = STATIONS[id].name + (id === state.selected && state.phase === 'loading' ? ' · Loading…' : '');
      }
      sizeNav(); maskKx();
    },
  });
  const select = async (id: StationId, history = true): Promise<void> => {
    if (disposed) return;
    await selection.select(id);
    if (history && selection.state().selected === id) win.history.pushState(null, '', stationHref(win.location.href, id));
  };
  for (const station of Object.values(STATIONS)) {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = station.name;
    button.setAttribute('aria-pressed', String(station.id === 'kings-cross')); button.setAttribute('aria-describedby', notice.id);
    button.addEventListener('click', () => { void select(station.id); }); buttons.append(button); stationButtons.set(station.id, button);
  }
  const onPop = (): void => { void select(stationFromSearch(win.location.search), false); };
  win.addEventListener('popstate', onPop); win.addEventListener('resize', sizeNav);
  const observer = new ResizeObserver(sizeNav); observer.observe(nav);
  doc.body.dataset.station = 'kings-cross'; notice.textContent = stationMessage('kings-cross'); sizeNav();
  const initialId = stationFromSearch(win.location.search);
  if (initialId !== 'kings-cross') void select(initialId, false);
  else pose(viewOf(initialId));
  return {
    select, state: selection.state, activeScene: () => activeScene,
    statusText: (kx: string): string => selection.state().selected === 'kings-cross' ? kx : stationMessage(selection.state().selected),
    accounting: () => ({ londonGpuReleases: releases, scene: active, placeholder: !!placeholderScene }),
    frame(time: number): void {
      if (disposed) return;
      lastTime = time;
      if (camera.aspect !== viewportAspect) {
        viewportAspect = camera.aspect;
        const state = selection.state();
        if (activeScene === london && state.selected !== 'edinburgh-waverley' && state.phase !== 'loading') {
          const to = viewOf(state.selected);
          if (flight) flight = { start: time, from: { eye: camera.position.toArray(), target: controls.target.toArray() }, to };
          else pose(to);
        }
      }
      if (flight) {
        const t = reduced.matches ? 1 : (time - flight.start) / 1800;
        pose(sampleStationFlight(flight.from, flight.to, t, roofCeiling));
        if (t >= 1) { cancelInput(); flight = null; selection.finish(); }
      }
      if (hop) {
        const t = reduced.matches ? 1 : Math.max(0, (time - hop.start) / 600);
        if (t >= .5 && !hop.swapped) { hop.swap(); hop.swapped = true; }
        renderer.domElement.style.opacity = String(Math.min(1, Math.abs(t * 2 - 1)));
        if (t >= 1) { hop = null; renderer.domElement.style.opacity = '1'; selection.finish(); }
      }
      maskKx();
    },
    dispose(): void {
      if (disposed) return; disposed = true; flight = null; hop = null; selection.dispose(); cancelInput(); observer.disconnect();
      win.removeEventListener('popstate', onPop); win.removeEventListener('resize', sizeNav);
      placeholderScene?.dispose(); for (const [object, visible] of masked) object.visible = visible;
      nav.remove(); placeholder.remove(); delete doc.body.dataset.station; renderer.domElement.style.opacity = '1';
    },
  };
}
