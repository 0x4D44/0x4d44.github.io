import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { buildAnchors } from '../../core/berths.ts';
import { buildGraph } from '../../core/graph.ts';
import { createMotion, DEFAULT_BUFFER_CLEARANCE_M } from '../../core/motion.ts';
import type { KxData } from '../../core/osm.ts';
import { longAxis, platformFormationLimits, shedLayout, stationPlatforms } from '../../core/station.ts';
import { ALL_KINDS, trainLayout } from '../../core/train.ts';
import { buildPlatforms } from '../src/furniture.ts';
import { createLiveTrains } from '../src/trains-live.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));

function extent(object: THREE.Object3D, axis: THREE.Vector3): [number, number] {
  object.updateWorldMatrix(true, true);
  let lo = Infinity, hi = -Infinity;
  const point = new THREE.Vector3();
  object.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const vertices = node.geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const t = point.fromBufferAttribute(vertices, i).applyMatrix4(node.matrixWorld).dot(axis);
      lo = Math.min(lo, t); hi = Math.max(hi, t);
    }
  });
  return [lo, hi];
}

test('every platform contains its longest permitted formation at the replay buffer stop, including the eight-car 387 on P9', () => {
  const graph = buildGraph(data), anchors = buildAnchors(data, [], [], { calibrate: false });
  const limits = platformFormationLimits(data, DEFAULT_BUFFER_CLEARANCE_M);
  for (const [ref, platform] of stationPlatforms(data)) {
    if (!limits.has(ref)) continue;
    const kind = ALL_KINDS.filter(k => trainLayout(k).length <= limits.get(ref)!)
      .sort((a, b) => trainLayout(b).length - trainLayout(a).length)[0]!;
    if (ref === '9') assert.equal(kind, 'gn387x8', 'retain the real eight-car formation');
    const layout = trainLayout(kind), anchor = anchors.anchors.find(a => a.platform === ref)!;
    const motion = createMotion(graph, anchors, { lengthM: layout.length });
    motion.apply({ kind: 'interpose', area: 'Y9', descr: '2SYN', to: anchor.berth, time: 0 }, 0);
    const train = motion.trains()[0]!;
    assert.equal(train.state, 'held');
    // Clearance is measured along rail, so a chord across a node can be slightly shorter.
    const chord = Math.hypot(train.leading.point[0] - anchor.point[0], train.leading.point[1] - anchor.point[1]);
    assert.ok(chord > DEFAULT_BUFFER_CLEARANCE_M - 0.01 && chord <= DEFAULT_BUFFER_CLEARANCE_M + 1e-6);
    const scene = new THREE.Group(), layer = createLiveTrains(graph, scene, () => kind);
    try {
      layer.update([train]);
      const axis2 = longAxis(platform.pts).axis;
      const axis = new THREE.Vector3(axis2[0], 0, axis2[1]).multiplyScalar(axis2[1] > 0 ? -1 : 1);
      const drawnPlatform = buildPlatforms({ ...data, platforms: [platform] }, shedLayout(data));
      const slab = extent(drawnPlatform.getObjectByName('platform-tops')!, axis);
      const body = extent(layer.trains()[0]!.group, axis);
      assert.ok(body[0] >= slab[0] - 0.001, `P${ref} ${kind}: body beyond buffer end by ${slab[0] - body[0]} m`);
      assert.ok(body[1] <= slab[1] + 0.001, `P${ref} ${kind}: body beyond throat end by ${body[1] - slab[1]} m`);
    } finally { layer.dispose(); }
  }
});
