import test from 'node:test';
import assert from 'node:assert/strict';
import { createMultiAreaMotion } from '../motion.ts';
import { buildGraph } from '../graph.ts';
import { parseRecording, createReplayFeed, createLiveFeed } from '../../web/src/feed.ts';
import type { EventStream } from '../../web/src/feed.ts';
import type { AnchorMap } from '../anchors.ts';

// Entirely invented areas, berths, descriptions and graph; no recordings or SMART.
function fixture(area: string) {
  const graph = buildGraph({ nodes: [[1, 0, -1000], [2, 3000, -1000]], rails: [
    { id: 1, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 },
  ] });
  const anchors: AnchorMap = { area, sources: ['synthetic'], unmapped: [], anchors: [
    { berth: 'A', kind: 'signal', from: 1, to: 2, t: 0.3, point: [900, -1000], errorM: 0, evidence: 'synthetic' },
    { berth: 'B', kind: 'signal', from: 1, to: 2, t: 0.8, point: [2400, -1000], errorM: 0, evidence: 'synthetic' },
  ] };
  return { graph, anchors };
}
test('repeated local identities coexist; cancel and snapshot activity remain area local', () => {
  const motion = createMultiAreaMotion([fixture('AA'), fixture('BB')]);
  for (const area of ['AA', 'BB']) motion.apply({ kind: 'interpose', area, descr: 'SYN1', to: 'A' }, 0);
  const before = motion.trains();
  assert.equal(before.length, 2);
  assert.equal(new Set(before.map(t => t.key)).size, 2);
  assert.equal(new Set(before.map(t => t.descriptionKey)).size, 2);
  assert.equal(new Set(before.map(t => t.lastBerthKey)).size, 2);
  assert.deepEqual(before.map(t => t.id), [1, 1]);
  motion.apply({ kind: 'step', area: 'AA', descr: 'SYN1', from: 'A', to: 'B' }, 0);
  motion.apply({ kind: 'snapshot', area: 'AA', berths: {} }, 0);
  motion.advance(1);
  assert.equal(motion.trains().find(t => t.area === 'BB')!.distanceM, 0);
  assert.ok(motion.trains().find(t => t.area === 'AA')!.distanceM > 0);
  motion.apply({ kind: 'cancel', area: 'AA', descr: 'SYN1', from: 'B' }, 1000);
  assert.equal(motion.trains().find(t => t.area === 'BB')!.state, 'held');
});
test('replay composition is deterministic and rejects ambiguous area registration', () => {
  const run = () => {
    const motion = createMultiAreaMotion([fixture('BB'), fixture('AA')]);
    for (const area of ['AA', 'BB']) motion.apply({ kind: 'step', area, descr: 'SYN1', from: 'A', to: 'B' }, 0);
    motion.advance(2);
    return motion.trains().map(t => [t.key, t.distanceM]);
  };
  assert.deepEqual(run(), run());
  assert.throws(() => createMultiAreaMotion([fixture('AA'), fixture('AA')]), /duplicate/i);
});


class SyntheticStream implements EventStream {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  listeners = new Map<string, (event: MessageEvent<string>) => void>();
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void { this.listeners.set(type, listener); }
  close(): void {}
  emit(type: string, packet: unknown): void { this.listeners.get(type)?.({ data: JSON.stringify(packet) } as MessageEvent<string>); }
}
test('parsed two-area snapshots preserve shared identities through live and replay prefixes', () => {
  // Invented recording written inline, never loaded from a private capture.
  const rows = [
    { t: 0, e: { kind: 'snapshot', area: 'AA', berths: { A: 'SYN1' } } },
    { t: 0, e: { kind: 'snapshot', area: 'BB', berths: { A: 'SYN1' } } },
    { t: 1000, e: { kind: 'step', area: 'AA', descr: 'SYN1', from: 'A', to: 'B' } },
    { t: 2000, e: { kind: 'snapshot', area: 'AA', berths: {} } },
    { t: 20_000, e: { kind: 'step', area: 'BB', descr: 'SYN1', from: 'A', to: 'B' } },
  ];
  const parse = (input: typeof rows) => parseRecording(input.map(row => JSON.stringify(row)).join('\n'));
  const make = () => createMultiAreaMotion([fixture('AA'), fixture('BB')]);
  const liveMotion = make(), replayMotion = make(), prefixMotion = make();
  const stream = new SyntheticStream();
  const live = createLiveFeed(liveMotion, () => {}, { source: () => stream, epochMs: 0,
    now: () => 0, schedule: () => ({}), unschedule: () => {} });
  const replay = createReplayFeed(parse(rows), 1, replayMotion, () => {});
  const prefix = createReplayFeed(parse(rows.slice(0, 4)), 1, prefixMotion, () => {});
  const picture = (motion: ReturnType<typeof make>) => motion.trains().map(train => ({
    key: train.key, descriptionKey: train.descriptionKey, berth: train.lastBerthKey,
    state: train.state, distanceM: train.distanceM, opacity: train.opacity,
  }));
  let at = 0;
  try {
    for (const row of rows.slice(0, 4)) {
      const dt = (row.t - at) / 1000;
      live.advance(dt);
      if (row.e.kind === 'snapshot') stream.emit('snapshot', { t: row.t, ...row.e });
      else stream.emit('td', row);
      replay.advance(dt); prefix.advance(dt); at = row.t;
      // Replay constructor immediately consumes both zero-time snapshots.
      if (row !== rows[0]) {
        assert.deepEqual(picture(replayMotion), picture(liveMotion));
        assert.deepEqual(picture(prefixMotion), picture(liveMotion));
      }
    }
    live.advance(6); replay.advance(6); prefix.advance(6);
    assert.deepEqual(picture(replayMotion), picture(liveMotion));
    assert.deepEqual(picture(prefixMotion), picture(liveMotion), 'future recorded steps do not teach the prefix');
    assert.equal(liveMotion.trains().some(train => train.area === 'AA'), false);
    const bb = liveMotion.trains().find(train => train.area === 'BB');
    assert.ok(bb, 'empty AA snapshot must not cancel identical BB description');
    assert.equal(bb.state, 'held');
    assert.equal(bb.distanceM, 0);
  } finally { live.dispose(); replay.dispose(); prefix.dispose(); }
});
