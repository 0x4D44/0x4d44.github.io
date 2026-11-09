import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createStations, londonRoofCeiling } from '../src/stations.ts';
import type { KxData } from '../../core/osm.ts';

type Listener = (event: Event) => void;

class MockElement {
  readonly tagName: string;
  children: MockElement[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<Listener>>();
  parent: MockElement | null = null;
  ownerDocument: MockDocument | null = null;
  className = '';
  textContent = '';
  hidden = false;
  id = '';
  type = '';
  readonly style = { opacity: '1', setProperty: (_name: string, _value: string): void => {} };

  constructor(tagName: string) { this.tagName = tagName; }

  append(...children: MockElement[]): void {
    for (const child of children) { child.parent = this; this.children.push(child); }
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  addEventListener(type: string, listener: Listener): void {
    const group = this.listeners.get(type) ?? new Set<Listener>(); group.add(listener); this.listeners.set(type, group);
  }
  removeEventListener(type: string, listener: Listener): void { this.listeners.get(type)?.delete(listener); }
  dispatch(type: string): void {
    const event = { type, target: this } as unknown as Event;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  listenerCount(type: string): number { return this.listeners.get(type)?.size ?? 0; }
  getBoundingClientRect(): { bottom: number } { return { bottom: 96 }; }
}

class MockDocument {
  readonly body = new MockElement('body');
  readonly heading = new MockElement('h1');
  readonly app = new MockElement('main');
  readonly groundCredit = new MockElement('span');
  readonly bodyDataset: Record<string, string | undefined> = {};
  defaultView: MockWindow | null = null;

  constructor() {
    this.groundCredit.textContent = 'Contains Environment Agency information (synthetic London credit)';
    Object.defineProperty(this.body, 'dataset', { value: this.bodyDataset });
    Object.defineProperty(this.body, 'style', { value: { setProperty: (_name: string, _value: string): void => {} } });
  }
  createElement(tag: string): MockElement { const element = new MockElement(tag); element.ownerDocument = this; return element; }
  querySelector(selector: string): MockElement | null { return selector === 'h1' ? this.heading : null; }
  getElementById(id: string): MockElement | null { return id === 'app' ? this.app : id === 'ground-credit' ? this.groundCredit : null; }
}

class MockWindow extends MockElement {
  readonly location = new URL('https://example.test/kings-cross/?trains=replay&date=20261109&speed=8');
  readonly history = { pushes: [] as string[], pushState: (_state: unknown, _title: string, url?: string | URL | null): void => { if (url) this.history.pushes.push(String(url)); } };
  matchMedia(): { matches: boolean } { return { matches: false }; }
  constructor() { super('window'); }
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  disconnected = false;
  readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) { this.callback = callback; MockResizeObserver.instances.push(this); }
  observe(_target: Element): void {}
  unobserve(_target: Element): void {}
  disconnect(): void { this.disconnected = true; }
}

async function withResizeObserver<T>(run: () => T | Promise<T>): Promise<T> {
  const previous = globalThis.ResizeObserver;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  MockResizeObserver.instances = [];
  try { return await run(); }
  finally {
    if (previous) globalThis.ResizeObserver = previous;
    else Reflect.deleteProperty(globalThis, 'ResizeObserver');
  }
}

function fixture(data = {} as KxData, aspect = 1, search?: string, overrides: Partial<Parameters<typeof createStations>[0]> = {}) {
  const doc = new MockDocument();
  const win = new MockWindow(); doc.defaultView = win;
  if (search !== undefined) win.location.search = search;
  const canvas = new MockElement('canvas'); canvas.ownerDocument = doc;
  const meshGeometry = new THREE.BoxGeometry(2, 2, 2);
  const map = new THREE.Texture();
  const meshMaterial = new THREE.MeshBasicMaterial({ map });
  const londonMesh = new THREE.Mesh(meshGeometry, meshMaterial);
  const scene = new THREE.Scene(); scene.add(londonMesh); scene.environment = map;
  const camera = new THREE.PerspectiveCamera(50, aspect); camera.position.set(3, 4, 12);
  const controls = { target: new THREE.Vector3(0, 1, 0), update(): void {} } as unknown as OrbitControls;
  let renderListDisposals = 0, rendererDisposals = 0;
  const renderer = {
    domElement: canvas,
    renderLists: { dispose: (): void => { renderListDisposals++; } },
    dispose: (): void => { rendererDisposals++; },
  } as unknown as THREE.WebGLRenderer;
  const releases = { geometry: 0, material: 0, texture: 0 };
  meshGeometry.addEventListener('dispose', () => releases.geometry++);
  meshMaterial.addEventListener('dispose', () => releases.material++);
  map.addEventListener('dispose', () => releases.texture++);
  const replayClock = Object.freeze({ timeMs: 123456, date: '20261109', speed: 8 });
  const clockSnapshot = { ...replayClock };
  const options = {
    scene, camera, controls, renderer, ready: Promise.resolve(), data,
    kxObjects: () => [londonMesh], replayClock, ...overrides,
  } as unknown as Parameters<typeof createStations>[0];
  const stations = createStations(options);
  const nav = doc.body.children[0];
  const placeholder = doc.body.children[1];
  const stationButtons = nav.children[1].children;
  return {
    doc, win, canvas, scene, camera, londonMesh, meshGeometry, meshMaterial, map, controls, renderer,
    releases, replayClock, clockSnapshot, stations, nav, placeholder, stationButtons,
    observer: MockResizeObserver.instances[0],
    get renderListDisposals() { return renderListDisposals; },
    get rendererDisposals() { return rendererDisposals; },
    time: 10_000,
  };
}

async function switchAndFinish(rig: ReturnType<typeof fixture>, id: 'kings-cross' | 'edinburgh-waverley') {
  const before = rig.stations.activeScene();
  rig.stations.frame(rig.time);
  await rig.stations.select(id, false);
  assert.equal(rig.stations.state().phase, 'hopping');
  rig.stations.frame(rig.time + 299);
  assert.equal(rig.stations.activeScene(), before, 'the scene stays put before the midpoint');
  rig.stations.frame(rig.time + 300);
  rig.stations.frame(rig.time + 600);
  assert.equal(rig.stations.state().phase, 'ready');
  rig.time += 700;
}

test('Waverley map hops release London once and repeated returns keep the London graph and replay state', async () => {
  await withResizeObserver(async () => {
    const rig = fixture();
    const kxStatus = 'replay of 2026-11-09 at 8x · UTC feed remains active';

    await switchAndFinish(rig, 'edinburgh-waverley');
    const waverley = rig.stations.activeScene();
    assert.notEqual(waverley, rig.scene);
    assert.equal(waverley.children.length, 0, 'Waverley is a real empty placeholder scene');
    assert.ok(waverley.background instanceof THREE.Color);
    assert.deepEqual(rig.releases, { geometry: 1, material: 1, texture: 1 });
    assert.equal(rig.stations.accounting().londonGpuReleases, 1);
    assert.equal(rig.rendererDisposals, 0, 'station changes keep the page renderer alive');
    assert.equal(rig.renderer.domElement, rig.canvas);
    assert.equal(rig.stations.statusText(kxStatus), 'Edinburgh Waverley: model not built yet. Live trains not enabled.');

    await switchAndFinish(rig, 'kings-cross');
    assert.equal(rig.stations.activeScene(), rig.scene);
    assert.equal(rig.scene.children[0], rig.londonMesh, 'London CPU objects remain attached');
    assert.equal(rig.londonMesh.geometry, rig.meshGeometry);
    assert.equal(rig.londonMesh.material, rig.meshMaterial);
    assert.equal(rig.londonMesh.visible, true);
    assert.equal(rig.stations.statusText(kxStatus), kxStatus);

    await switchAndFinish(rig, 'edinburgh-waverley');
    assert.equal(rig.stations.activeScene().children.length, 0);
    assert.deepEqual(rig.releases, { geometry: 2, material: 2, texture: 2 });
    assert.equal(rig.stations.accounting().londonGpuReleases, 2);
    assert.equal(rig.rendererDisposals, 0);
    assert.deepEqual(rig.replayClock, rig.clockSnapshot, 'station navigation does not change replay UTC or speed');
    assert.equal(rig.renderListDisposals, 3, 'the renderer list cache is cleared once per scene swap');

    rig.stations.dispose();
    assert.equal(rig.doc.body.children.includes(rig.nav), false);
    assert.equal(rig.doc.body.children.includes(rig.placeholder), false);
    assert.equal(rig.doc.bodyDataset.station, undefined);
    assert.equal(rig.win.listenerCount('popstate'), 0);
    assert.equal(rig.win.listenerCount('resize'), 0);
    assert.equal(rig.observer.disconnected, true);
    assert.equal(rig.londonMesh.visible, true, 'dispose restores objects masked while Waverley was active');
    assert.equal(rig.canvas.style.opacity, '1');
    const wavButton = [...rig.stationButtons].find(button => button.textContent.includes('Waverley'))!;
    wavButton.dispatch('click');
    assert.equal(rig.win.history.pushes.length, 0, 'detached navigation cannot change the URL after disposal');
  });
});

test('disposing during a pending Waverley hop prevents a later frame from swapping scenes', async () => {
  await withResizeObserver(async () => {
    const rig = fixture();
    rig.stations.frame(rig.time);
    await rig.stations.select('edinburgh-waverley', false);
    assert.equal(rig.stations.state().phase, 'hopping');

    rig.stations.dispose();
    rig.stations.frame(rig.time + 1000);

    assert.equal(rig.stations.activeScene(), rig.scene, 'a disposed controller cannot run the pending scene swap');
    assert.deepEqual(rig.releases, { geometry: 0, material: 0, texture: 0 });
    assert.equal(rig.stations.accounting().londonGpuReleases, 0);
  });
});

test('London roof ceiling uses roofs and ignores the enclosing sky dome', () => {
  const scene = new THREE.Scene();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial());
  roof.position.y = 20;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5200, 8, 4), new THREE.MeshBasicMaterial());
  scene.add(roof, sky);
  assert.equal(londonRoofCeiling(scene), 23);
});

// The existing bundled map is OSM-only; no recording, schedule or learned mapping is used here.
const mapData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData;

test('King\'s Cross reframes on a portrait viewport change before the next resize event', async () => {
  await withResizeObserver(async () => {
    const rig = fixture(mapData);
    const desktop = rig.camera.position.clone();
    rig.stations.frame(rig.time);
    rig.camera.aspect = 390 / 844; // main's frame-size sync precedes the queued resize event
    rig.stations.frame(rig.time + 16);
    assert.ok(rig.camera.position.distanceTo(desktop) > 10, 'portrait must use its own station framing');
    assert.equal(rig.stations.state().phase, 'ready');
    rig.camera.aspect = 1.44; rig.stations.frame(rig.time + 32);
    assert.ok(rig.camera.position.distanceTo(desktop) < 1e-8, 'wide view retains the original desktop framing');
    rig.stations.dispose();
  });
});

test('default and explicit King\'s Cross bookmarks both start with the phone framing', async () => {
  await withResizeObserver(async () => {
    const defaultView = fixture(mapData, 390 / 844, '?trains=demo');
    const bookmark = fixture(mapData, 390 / 844, '?trains=demo&station=kings-cross');
    assert.deepEqual(defaultView.camera.position.toArray(), bookmark.camera.position.toArray());
    assert.ok(bookmark.camera.position.distanceTo(new THREE.Vector3(3, 4, 12)) > 10);
    assert.equal(bookmark.stations.state().selected, 'kings-cross');
    assert.equal(bookmark.stations.state().phase, 'ready');
    defaultView.stations.dispose(); bookmark.stations.dispose();
  });
});

test('real Waverley activation attaches only its EB runtime and removes the unavailable placeholder', async () => {
  await withResizeObserver(async () => {
    const { loadWaverleyScene } = await import('../src/waverley.ts');
    let attached = 0, disposed = 0;
    const model = await loadWaverleyScene({
      modelLoader: async () => ({ buildWaverleyScene: () => ({ group: new THREE.Group(), dispose: () => { ++disposed; } }) }),
      geometryLoader: async () => ({ default: { origin: { lat: 0, lon: 0 }, attribution: 'synthetic', rails: [],
        platforms: [{ id: 'synthetic', ref: '1', tags: {}, path: [[0, 0], [100, 0], [100, 5], [0, 5]] }] } }),
    });
    const rig = fixture(undefined, 1, undefined, { loadEdinburgh: async () => model, attachEdinburgh: view => {
      ++attached; assert.equal(view, model);
      view.live = { group: new THREE.Group(), frame() {}, dispose() {}, status: () => 'Edinburgh: assumed fleet', timeMs: () => 1000, load: async () => {}, state() {} };
    } });
    await switchAndFinish(rig, 'edinburgh-waverley'); rig.stations.frame(rig.time);
    assert.equal(attached, 1); assert.equal(rig.stations.activeScene(), model.scene);
    assert.equal(rig.stations.accounting().placeholder, false); assert.equal(rig.placeholder.hidden, true);
    assert.equal(rig.stations.statusText('KX trains'), 'Edinburgh: assumed fleet');
    assert.equal(rig.stations.state().message, 'Edinburgh: assumed fleet');
    assert.equal(rig.stations.edinburgh(), model);
    await switchAndFinish(rig, 'kings-cross'); assert.equal(disposed, 1); assert.equal(rig.stations.edinburgh(), null);
    rig.stations.dispose(); assert.equal(disposed, 1);
  });
});

test('disposing a Waverley hop before its midpoint releases the built pending model', async () => {
  await withResizeObserver(async () => {
    const { loadWaverleyScene } = await import('../src/waverley.ts'); let disposed = 0;
    const model = await loadWaverleyScene({ modelLoader: async () => ({ buildWaverleyScene: () => ({ group: new THREE.Group(), dispose: () => { ++disposed; } }) }),
      geometryLoader: async () => ({ default: { origin: { lat: 0, lon: 0 }, attribution: 'synthetic', rails: [], platforms: [] } }) });
    const rig = fixture(undefined, 1, undefined, { loadEdinburgh: async () => model });
    rig.stations.frame(rig.time); await rig.stations.select('edinburgh-waverley', false);
    rig.stations.dispose(); assert.equal(disposed, 1);
  });
});

test('ground attribution follows the rendered station and restores the London credit on return', async () => {
  await withResizeObserver(async () => {
    const { loadWaverleyScene } = await import('../src/waverley.ts');
    const credit = 'Synthetic Scottish Government LiDAR attribution, OGL v3';
    const model = await loadWaverleyScene({ modelLoader: async () => ({ buildWaverleyScene: () => ({ group: new THREE.Group(), groundAttribution: credit, dispose() {} }) }),
      geometryLoader: async () => ({ default: { origin: { lat: 0, lon: 0 }, attribution: 'synthetic', rails: [], platforms: [{ id: 'synthetic', ref: '1', tags: {}, path: [[0,0],[100,0],[100,5],[0,5]] }] } }) });
    const rig = fixture(mapData, 1, undefined, { loadEdinburgh: async () => model });
    const london = rig.doc.groundCredit.textContent;
    rig.stations.frame(rig.time); await rig.stations.select('st-pancras', false); rig.stations.frame(rig.time + 2000);
    assert.equal(rig.doc.groundCredit.textContent, london, 'St Pancras uses London EA terrain');
    rig.time += 2100; await switchAndFinish(rig, 'edinburgh-waverley');
    assert.equal(rig.doc.groundCredit.textContent, credit, 'Edinburgh must show the loaded terrain source');
    await switchAndFinish(rig, 'kings-cross'); assert.equal(rig.doc.groundCredit.textContent, london);
    rig.stations.dispose();
  });
});

test('render presentation refresh publishes newly loaded replay status to the station notice', async () => {
  await withResizeObserver(async () => {
    const { loadWaverleyScene } = await import('../src/waverley.ts'); let text = 'EB: private anchors required';
    const model = await loadWaverleyScene({ modelLoader: async () => ({ buildWaverleyScene: () => ({ group: new THREE.Group(), dispose() {} }) }),
      geometryLoader: async () => ({ default: { origin: { lat: 0, lon: 0 }, attribution: 'synthetic', rails: [], platforms: [{ id: 'synthetic', ref: '1', tags: {}, path: [[0,0],[100,0],[100,5],[0,5]] }] } }) });
    const rig = fixture(undefined, 1, undefined, { loadEdinburgh: async () => model, attachEdinburgh: view => {
      view.live = { group: new THREE.Group(), frame() {}, dispose() {}, status: () => text, timeMs: () => 1, load: async () => {}, state() {} };
    } });
    await switchAndFinish(rig, 'edinburgh-waverley');
    text = 'EB: frozen replay · 2 trains';
    (rig.stations as typeof rig.stations & { refreshPresentation?(): void }).refreshPresentation?.();
    assert.equal(rig.nav.children[2].textContent, text, 'capture/app must refresh after the train runtime advances');
    assert.equal(rig.nav.children[2].textContent, rig.stations.statusText('KX status'));
    rig.stations.dispose();
  });
});


test('selected station sky text reaches both status lines with Edinburgh values and restores London on return', async () => {
  await withResizeObserver(async () => {
    const { loadWaverleyScene } = await import('../src/waverley.ts');
    const model = await loadWaverleyScene({ modelLoader: async () => ({ buildWaverleyScene: () => ({ group: new THREE.Group(), dispose() {} }) }),
      geometryLoader: async () => ({ default: { origin: { lat:0,lon:0 }, attribution:'synthetic',rails:[],platforms:[{ id:'synthetic',ref:'1',tags:{},path:[[0,0],[100,0],[100,5],[0,5]] }] } }) });
    const edinburgh = ' · sun 18° up (day) · weather: snow (synthetic Edinburgh)', london = ' · sun 24° up (day) · weather: clear sky (synthetic London)';
    const rig = fixture(undefined, 1, undefined, { loadEdinburgh: async () => model,
      stationSuffix: id => id === 'edinburgh-waverley' ? edinburgh : london,
      attachEdinburgh: view => { view.live = { group:new THREE.Group(),frame(){},dispose(){},status:()=> 'EB replay · 2 trains',timeMs:()=>1,load:async()=>{},state(){} }; } });
    await switchAndFinish(rig, 'edinburgh-waverley'); rig.stations.refreshPresentation();
    assert.equal(rig.stations.statusText('KX'), 'EB replay · 2 trains' + edinburgh);
    assert.equal(rig.nav.children[2].textContent, rig.stations.statusText('KX'));
    await switchAndFinish(rig, 'kings-cross');
    assert.equal(rig.stations.statusText('KX'), 'KX' + london);
    assert.doesNotMatch(rig.stations.statusText('KX'), /Edinburgh/);
    rig.stations.dispose();
  });
});
