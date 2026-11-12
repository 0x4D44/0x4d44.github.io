// Aspects inferred from occupancy on a synthetic line. Synthetic data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraph } from '../graph.ts';
import { combineAspect, inferAspects } from '../signal-aspects.ts';
import type { AspectHead, OccupiedSpan } from '../signal-aspects.ts';
import type { KxData } from '../osm.ts';

// Nodes 1..6 every 100 m along +x; a branch 3 -> 7 leaves node 3 toward (300, 30).
function line(branch = false) {
  const nodes: KxData['nodes'] = [[1, 0, 0], [2, 100, 0], [3, 200, 0], [4, 300, 0], [5, 400, 0], [6, 500, 0], [7, 300, 30]];
  const rails: KxData['rails'] = [{ id: 1, nodes: [1, 2, 3, 4, 5, 6], service: 'main', tunnel: false, bridge: false, layer: 0 }];
  if (branch) rails.push({ id: 2, nodes: [3, 7], service: 'main', tunnel: false, bridge: false, layer: 0 });
  return buildGraph({ nodes, rails });
}
// Heads facing trains travelling +x, halfway along edges 1-2, 2-3, 3-4 and 4-5 (x = 50, 150, 250, 350).
const heads = (fourAspect = false): AspectHead[] => [[1, 2], [2, 3], [3, 4], [4, 5]].map(([from, to], i) =>
  ({ id: i + 1, from: from!, to: to!, t: 0.5, forward: true, fourAspect }));
const train = (a: number, b: number, fromT: number, toT: number): OccupiedSpan => ({ a, b, fromT, toT });
const at = (occupied: OccupiedSpan[] | undefined, fourAspect = false, graph = line()) => Object.fromEntries(inferAspects(graph, heads(fourAspect), occupied));

test('a clear line shows green where three sections are known, and a head whose first section leaves the track is unknown', () => {
  assert.deepEqual(at([]), { 1: 'proceed', 2: 'proceed', 3: 'caution', 4: 'unknown' });
  // head 3: one clear section to head 4, then off the modelled track: never more permissive than the evidence
  assert.deepEqual(at([], true), { 1: 'proceed', 2: 'preliminary', 3: 'caution', 4: 'unknown' });
});

test('no occupancy known: every head unknown', () => {
  assert.deepEqual(at(undefined), { 1: 'unknown', 2: 'unknown', 3: 'unknown', 4: 'unknown' });
});

test('red, single yellow and double yellow step back from an occupied section', () => {
  const occupied = [train(3, 4, 0.6, 0.9)]; // x 260..290: in the section after head 3
  assert.deepEqual(at(occupied), { 1: 'proceed', 2: 'caution', 3: 'danger', 4: 'unknown' });
  assert.deepEqual(at(occupied, true), { 1: 'preliminary', 2: 'caution', 3: 'danger', 4: 'unknown' }, 'double yellow only on a four-aspect head');
});

test('a train standing over a head, or reported in either order along the edge, occupies that head\'s section', () => {
  assert.equal(at([train(2, 3, 0.7, 0.3)])[2], 'danger');
  assert.equal(at([train(3, 2, 0.6, 0.2)])[2], 'danger', 'the same track described from the other node');
  assert.equal(at([train(2, 3, 0.1, 0.4)])[2], 'proceed', 'a train wholly behind the head is not ahead of it');
  assert.equal(at([train(2, 3, 0.1, 0.4)])[1], 'danger');
});

test('heads facing the other way bound no section, and a head facing -x reads the track toward lower x', () => {
  const graph = line();
  const back: AspectHead[] = [{ id: 9, from: 3, to: 4, t: 0.5, forward: false, fourAspect: false }, { id: 10, from: 2, to: 1, t: 0.2, forward: true, fourAspect: false }];
  // head 10 stands at x 80 facing -x: section to node 1 (off track) is its first section
  const result = Object.fromEntries(inferAspects(graph, [...heads(), ...back], [train(1, 2, 0.1, 0.2)]));
  assert.equal(result[9], 'caution', 'head 9 (x 250 facing -x) meets head 10 at x 80, then the train at x 10..20');
  assert.equal(result[10], 'danger');
  assert.equal(result[2], 'proceed', 'head 9 faces the other way: it does not cut head 2\'s sections');
});

test('a head at a node is met on arrival', () => {
  const graph = line(), list: AspectHead[] = [{ id: 1, from: 1, to: 2, t: 0.5, forward: true, fourAspect: false },
    { id: 2, from: 3, to: 4, t: 0, forward: true, fourAspect: false }];
  assert.equal(Object.fromEntries(inferAspects(graph, list, [train(4, 5, 0.1, 0.2)]))[1], 'caution');
});

test('at a facing junction every onward route counts, and the most restrictive wins', () => {
  const graph = line(true);
  assert.equal(at([train(3, 7, 0.4, 0.6)], false, graph)[2], 'danger', 'a train on the branch reds the head before the junction');
  assert.equal(at([], false, graph)[2], 'unknown', 'the branch leaves the modelled track in the first section');
  // with a head on the branch too, both routes are known
  const withBranchHead = [...heads(), { id: 5, from: 3, to: 7, t: 0.5, forward: true, fourAspect: false }];
  assert.equal(Object.fromEntries(inferAspects(graph, withBranchHead, [train(3, 7, 0.8, 0.9)]))[2], 'caution');
  assert.equal(Object.fromEntries(inferAspects(graph, withBranchHead, [train(3, 4, 0.1, 0.2)]))[2], 'danger', 'the main route is occupied, the branch is not: red');
});

test('the feed\'s red always wins; its not-red caps the inference at single yellow', () => {
  assert.equal(combineAspect('danger', 'proceed'), 'danger');
  assert.equal(combineAspect('proceed', 'danger'), 'caution');
  assert.equal(combineAspect('proceed', 'unknown'), 'caution');
  assert.equal(combineAspect('proceed', 'preliminary'), 'preliminary');
  assert.equal(combineAspect('unknown', 'preliminary'), 'preliminary');
  assert.equal(combineAspect('unknown', 'unknown'), 'unknown');
});
