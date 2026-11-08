import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotion } from '../motion.ts';
import { buildGraph } from '../graph.ts';
import type { AnchorMap } from '../anchors.ts';

const graph = buildGraph({ nodes: [[1, 0, -1000], [2, 1000, -1000]],
  rails: [{ id: 1, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 }] });
const anchors: AnchorMap = { area: 'TEST', sources: ['invented'], unmapped: [], anchors: [
  { berth: 'A', kind: 'signal', from: 1, to: 2, t: 0.5, point: [500, -1000], errorM: 1, evidence: 'invented' },
] };
const motion = () => {
  const m = createMotion(graph, anchors, { quietMs: 1000, fadeSeconds: 1 });
  m.apply({ kind: 'interpose', area: 'TEST', descr: 'SYN1', to: 'A' }, 0);
  m.advance(0.9);
  return m;
};

test('an occupied TD berth survives quiet time while its own area remains active, until explicit cancel', () => {
  const m = motion();
  m.apply({ kind: 'sclass', area: 'TEST' }, 900);
  m.advance(0.6);
  assert.equal(m.trains().length, 1);
  assert.equal(m.trains()[0]!.state, 'held');
  m.apply({ kind: 'cancel', area: 'TEST', descr: 'SYN1', from: 'A' }, 1500);
  assert.equal(m.trains()[0]!.state, 'fading');
  m.advance(1.1);
  assert.equal(m.trains().length, 0);
});

test('traffic in another area does not keep a stale train alive', () => {
  const m = motion();
  m.apply({ kind: 'sclass', area: 'OTHER' }, 900);
  m.advance(0.6);
  assert.equal(m.trains()[0]!.state, 'fading');
  m.advance(0.6);
  assert.equal(m.trains().length, 0);
});

test('active area traffic does not preserve an old train after its TD berth is vacated', () => {
  const m = motion();
  m.apply({ kind: 'step', area: 'TEST', descr: 'SYN2', from: 'A', to: 'OUT' }, 900);
  m.advance(0.6);
  assert.equal(m.trains().find((t) => t.description === 'SYN1')!.state, 'fading');
  m.advance(0.6);
  assert.equal(m.trains().some((t) => t.description === 'SYN1'), false);
});

test('a complete snapshot replaces old berth ownership instead of extending stale aliases', () => {
  const m = motion();
  const snapshot = { kind: 'snapshot', area: 'TEST', berths: {} };
  m.apply(snapshot, 900);
  m.advance(0.6);
  assert.equal(m.trains()[0]!.state, 'fading');
});
