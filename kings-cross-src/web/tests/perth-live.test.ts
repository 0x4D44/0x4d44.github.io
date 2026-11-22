import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { lampEnds } from '../src/train-lamp-pool.ts';
import type { EventStream } from '../src/feed.ts';
import type { WaverleyAnchorScene } from '../../core/waverley-anchors.ts';

const geometry: WaverleyAnchorScene = { attribution: 'synthetic', origin: { lat: 0, lon: 0 },
  rails: [{ id: 'synthetic/rail', tags: { railway: 'rail' }, path: [[0, -400], [0, 0], [0, 400], [400, 500]] }],
  platforms: [{ id: 'synthetic/platform', ref: '3', tags: {}, path: [[-2, -90], [2, -90], [2, -50], [-2, -50]] }],
};
function fixture() {
  const doc = { createElement: () => ({ style: {}, ownerDocument: doc, append() {}, remove() {} }) };
  const parent = { ownerDocument: doc, append() {} } as unknown as HTMLElement;
  return { geometry, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), parent,
    areas: ['ZZ', 'ZX'], date: '', speed: 1, hostname: 'localhost' };
}

test('Perth live places and lights a synthetic train on its own rail while reporting missing anchors in the second area', async () => {
  const { createPerthTdLive: createPerthLive } = await import('../src/perth-td-live.ts');
  const options = fixture(), urls: string[] = [], listeners = new Map<string, (event: MessageEvent<string>) => void>();
  const runtime = createPerthLive({ ...options, mode: 'live', fetchImpl: async input => {
    urls.push(String(input));
    if (String(input).endsWith('ZX')) return new Response(null, { status: 404 });
    return new Response(JSON.stringify({ area: 'ZZ', sources: ['synthetic'], unmapped: [], anchors: [
      { berth: 'XQ02', kind: 'inferred', from: 2, to: 1, t: .25, point: [0, -100], errorM: 30, evidence: 'synthetic' },
    ] }));
  }, liveDependencies: { source(url): EventStream { urls.push(url); return {
    onopen: null, onerror: null, addEventListener(kind, fn) { listeners.set(kind, fn); }, close() {},
  }; }, schedule: () => 1, unschedule() {} } })!;
  try {
    await runtime.load();
    assert.deepEqual(urls.sort(), ['/relay/anchors?area=ZX', '/relay/anchors?area=ZZ', '/relay/events?area=ZZ']);
    const deliver = (area: string) => listeners.get('snapshot')!(new MessageEvent('snapshot', { data: JSON.stringify({ area, berths: { XQ02: '9Z90' } }) }));
    deliver('ZX'); runtime.frame(0, true);
    assert.equal(runtime.lampTrains().length, 0);
    deliver('ZZ'); runtime.frame(0, true);
    const [train] = runtime.lampTrains();
    assert.ok(train);
    assert.equal(train.group.userData.area, 'ZZ');
    assert.deepEqual(runtime.state().areas[0]!.trains[0]!.leading.point, [0, -100]);
    assert.deepEqual(lampEnds(train.group).map(end => end.mode), ['head', 'tail']);
    assert.match(runtime.status(), /ZX anchors unavailable \(404\)/);
  } finally { runtime.dispose(); }
  assert.equal(options.scene.children.length, 0);
});

test('Perth capture modes, unconfigured areas and public hosting install no runtime or scene objects', async () => {
  const { createPerthTdLive: createPerthLive } = await import('../src/perth-td-live.ts');
  for (const overrides of [{ mode: 'none' }, { mode: 'demo' }, { mode: 'auto', areas: [] }, { mode: 'live', hostname: 'example.org' }] as const) {
    const options = fixture();
    assert.equal(createPerthLive({ ...options, ...overrides, fetchImpl: async () => { assert.fail('must not fetch'); } }), undefined);
    assert.equal(options.scene.children.length, 0);
  }
});
