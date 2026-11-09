import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraph } from '../../core/graph.ts';
import { createMotion } from '../../core/motion.ts';
import { createReplayFeed } from '../src/feed.ts';
import { loadOfflineReplay } from '../src/offline-replay.ts';

const graph = buildGraph({ nodes: [[1, 0, 0], [2, 500, 0]], rails: [{ id: 1, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 }] });
const anchors = { area: 'SYN', sources: ['synthetic test'], anchors: [{ berth: 'SYN4', kind: 'smart', from: 1, to: 2, t: .8, point: [400, 0], errorM: 0, platform: '4', evidence: 'synthetic' }], unmapped: [] };
const recording = [
  { t: 1_000, e: { kind: 'snapshot', area: 'SYN', berths: { SYN4: 'SYN1' } } },
  { t: 11_000, e: { kind: 'snapshot', area: 'SYN', berths: { SYN4: 'SYN1' } } },
].map(row => JSON.stringify(row)).join('\n');
const date = '1970-01-01', base = 'https://example.test/kings-cross/';
const manifest = { anchors: 'anchors.json', recording: 'recording.ndjson' };
function mockFetch(overrides: Record<string, unknown> = {}) {
  const requests: { url: string; options?: RequestInit }[] = [];
  const docs: Record<string, unknown> = { '/fixture/manifest.json': manifest, '/fixture/anchors.json': anchors, '/fixture/recording.ndjson': recording, ...overrides };
  const fetchImpl: typeof fetch = async (input, options) => {
    const url = String(input); requests.push({ url, options });
    const doc = docs[new URL(url).pathname];
    return doc instanceof Response ? doc : new Response(typeof doc === 'string' ? doc : JSON.stringify(doc), { status: doc === undefined ? 404 : 200 });
  };
  return { requests, fetchImpl };
}

test('static bundle uses manifest-relative resources and drives the real replay without relay I/O', async () => {
  const io = mockFetch();
  const bundle = await loadOfflineReplay('/fixture/manifest.json', base, graph, date, io.fetchImpl);
  assert.deepEqual(io.requests.map(row => new URL(row.url).pathname), ['/fixture/manifest.json', '/fixture/anchors.json', '/fixture/recording.ndjson']);
  assert.ok(io.requests.every(row => row.options?.redirect === 'error' && row.options?.credentials === 'omit'));
  const motion = createMotion(graph, bundle.anchors);
  const feed = createReplayFeed(bundle.recording, 1, motion, () => {});
  feed.advance(1);
  assert.equal(feed.timeMs(), 2_000);
  assert.equal(motion.trains().length, 1);
  const schedule = await bundle.fetchSchedule(`/relay/schedule?date=${date}`);
  assert.equal((await schedule.json()).available, false);
  assert.equal(io.requests.length, 3, 'in-memory timetable reads never call network fetch');
});

test('bundle rejects cross-origin, credential, fragment, non-http and relay URLs before fetching', async () => {
  for (const candidate of ['https://elsewhere.test/a', 'https://u:p@example.test/a', '/a#fragment', 'file:///a', '/relay/recording', '/%72elay/recording']) {
    const io = mockFetch();
    await assert.rejects(loadOfflineReplay(candidate, base, graph, date, io.fetchImpl), /bundle URL/);
    assert.equal(io.requests.length, 0);
  }
});

test('manifest resource URLs and malformed documents cannot bypass validation', async () => {
  for (const doc of [null, {}, { ...manifest, recording: 'https://elsewhere.test/a' }, { ...manifest, anchors: '/relay/anchors' }]) {
    const io = mockFetch({ '/fixture/manifest.json': doc });
    await assert.rejects(loadOfflineReplay('/fixture/manifest.json', base, graph, date, io.fetchImpl));
  }
  for (const doc of [{ ...anchors, anchors: [{ ...anchors.anchors[0], from: 99 }] }, { ...anchors, anchors: [{ ...anchors.anchors[0], t: 2 }] }, { ...anchors, anchors: [{ ...anchors.anchors[0], point: [0, 0] }] }, { ...anchors, anchors: [...anchors.anchors, ...anchors.anchors] }]) {
    const io = mockFetch({ '/fixture/anchors.json': doc });
    await assert.rejects(loadOfflineReplay('/fixture/manifest.json', base, graph, date, io.fetchImpl), /anchors/);
  }
  for (const text of ['', 'not ndjson', JSON.stringify({ t: 1, e: { kind: 'snapshot', area: 'SYN', berths: null } })]) {
    const io = mockFetch({ '/fixture/recording.ndjson': text });
    await assert.rejects(loadOfflineReplay('/fixture/manifest.json', base, graph, date, io.fetchImpl), /recording/);
  }
});

test('bundle download rejects HTTP errors and both declared and streamed oversized bodies', async () => {
  for (const response of [new Response('missing', { status: 404 }), new Response('{}', { headers: { 'content-length': '65537' } }), new Response(' '.repeat(65537))]) {
    const io = mockFetch({ '/fixture/manifest.json': response });
    await assert.rejects(loadOfflineReplay('/fixture/manifest.json', base, graph, date, io.fetchImpl), /download|large/);
  }
});

test('bundle deadline bounds a stalled fetch and a stalled streaming body', async () => {
  const stalledFetch: typeof fetch = () => new Promise(() => {});
  await assert.rejects(loadOfflineReplay('/fixture/manifest.json', base, graph, date, stalledFetch, 20), /expired/);
  const stalledBody: typeof fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } }));
  await assert.rejects(loadOfflineReplay('/fixture/manifest.json', base, graph, date, stalledBody, 20), /expired/);
});

test('optional timetable validates its date and existing service contract', async () => {
  const docs = { '/fixture/manifest.json': { ...manifest, schedule: 'schedule.json' } };
  for (const schedule of [{ date: 'wrong', available: false }, { date, calls: [{}] }, { date, available: false, reason: 'synthetic unavailable' }, { date, calls: [] }]) {
    const io = mockFetch({ ...docs, '/fixture/schedule.json': schedule });
    if (schedule.date === 'wrong' || schedule.calls?.length) await assert.rejects(loadOfflineReplay('/fixture/manifest.json', base, graph, date, io.fetchImpl), /timetable/);
    else {
      const bundle = await loadOfflineReplay('/fixture/manifest.json', base, graph, date, io.fetchImpl);
      assert.deepEqual(await (await bundle.fetchSchedule(`/relay/schedule?date=${date}`)).json(), schedule);
      await assert.rejects(bundle.fetchSchedule('/relay/health'), /timetable/);
      assert.equal(io.requests.length, 4);
    }
  }
});

test('bundle failures expose fixed categories without reflecting input or fetch error text', async () => {
  const sentinel = 'PRIVATE_SYNTHETIC_SENTINEL';
  const failures: typeof fetch[] = [
    async () => { throw new Error(sentinel); },
    mockFetch({ '/fixture/manifest.json': `{"${sentinel}"` }).fetchImpl,
    async () => { const response = new Response('{}'); Object.defineProperty(response, 'url', { value: `https://elsewhere.test/${sentinel}` }); return response; },
  ];
  for (const fetchImpl of failures) {
    await assert.rejects(loadOfflineReplay('/fixture/manifest.json', base, graph, date, fetchImpl), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(sentinel));
      assert.match(error.message, /bundle/);
      return true;
    });
  }
});

test('bundle replay date must match its first recorded event day', async () => {
  await assert.rejects(loadOfflineReplay('/fixture/manifest.json', base, graph, '2026-11-08', mockFetch().fetchImpl), /recording date/);
});
