import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import type { ShedLayout } from '../../core/station.ts';
import { createAxis01Report, measureGauge, meshExtent, renderAxis01Markdown } from '../axis01-evidence.ts';

const layout: ShedLayout = { origin: [0, 0], heading: 0, width: 70, length: 243.84, aisle: 2.996, crown: 21.6408, springing: 5.6388 };
function fixture(): KxData {
  return { attribution: 'synthetic', origin: { lat: 0, lon: 0 },
    nodes: [[1, 10, -100], [2, 10, -400], [3, 10, -600], [4, 10, -700]],
    rails: [
      { id: 1, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0, ref: 'ECM1' },
      { id: 2, nodes: [2, 3], service: 'main', tunnel: true, bridge: false, layer: 0, ref: 'ECM1' },
      { id: 3, nodes: [3, 4], service: 'main', tunnel: false, bridge: false, layer: 0, ref: 'ECM1' },
    ], switches: [], buffers: [], signals: [], buildings: [],
    platforms: [{ id: 20, ref: '0', pts: [[15, -100], [20, -100], [20, -400], [15, -400]] },
      { id: 21, ref: '8', pts: [[0, -100], [5, -100], [5, -400], [0, -400]] },
      { id: 22, ref: '11', tunnel: true, pts: [[30, -100], [35, -100], [35, -400], [30, -400]] }],
  };
}

test('measures transformed mesh vertices and platform tops separately from operational lengths', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 10));
  mesh.scale.z = 3;
  assert.equal(meshExtent(mesh, new THREE.Vector3(0, 0, 1)), 30);
  const report = createAxis01Report(fixture(), layout, { graph: { sha256: 'synthetic' } });
  assert.equal(report.platforms[0]!.drawnLengthM, 300);
  assert.equal(report.platforms[0]!.publishedOperationalLengthM, 305);
  assert.equal(report.platforms[0]!.drawnMinusPublishedM, -5);
  assert.equal(report.platforms[0]!.withinOsmTolerance, true);
  assert.ok(report.platforms[0]!.drawnTopSamples.length >= 2);
  assert.ok(report.platforms[0]!.drawnTopSamples.every(p => Math.abs(p[1]! - 0.9) < 1e-6));
  assert.deepEqual(report.inputs, { graph: { sha256: 'synthetic' } });
});

test('rays measure actual inner rail faces and react to changed drawn gauge', () => {
  const report = createAxis01Report(fixture(), layout);
  assert.ok(report.gaugeSamples.length > 0);
  assert.ok(report.gaugeSamples.every(p => p.withinTolerance));
  assert.ok(report.gaugeSamples.every(p => p.innerFacePoints.length === 2));
  const positions: number[] = [];
  // Two inward-facing vertical planes 2 m apart: deliberately unlike the standard gauge.
  for (const x of [-1, 1]) positions.push(x, -.02, -10, x, .02, -10, x, .02, 10, x, -.02, -10, x, .02, 10, x, -.02, 10);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)));
  assert.equal(measureGauge(mesh, [0, 0], [0, 1]), 2);
  assert.equal(measureGauge(mesh, [0, 50], [0, 1]), null);
});

test('proves station surface refs exclude underground eleven and measures actual 26 metre car', () => {
  const report = createAxis01Report(fixture(), layout);
  assert.equal(report.platform11.drawn, false);
  assert.deepEqual(report.platform11.drawnStationRefs, ['0', '8']);
  assert.equal(report.sample26mCar.specLengthM, 26);
  assert.ok(Math.abs(report.sample26mCar.drawnCarLengthM - 26) < 0.001);
  assert.ok(report.captureBounds.station.x[1]! < 200);
  assert.ok(report.captureBounds.throat.z[0]! >= -600);
  const surfaceEleven = fixture(); surfaceEleven.platforms[2]!.tunnel = false;
  assert.equal(createAxis01Report(surfaceEleven, layout).platform11.drawn, true);
});

test('measures portal brick planes against OSM boundary nodes with throat tolerance', () => {
  const report = createAxis01Report(fixture(), layout);
  assert.ok(report.tunnels.length > 0);
  assert.ok(report.tunnels.every(t => Math.abs(t.setbackM - 1.2) < 0.001));
  assert.ok(report.tunnels.every(t => t.withinThroatTolerance));
  assert.ok(report.tunnels.every(t => t.osmWayIds.includes(2)));
  assert.equal(report.tolerances.platformM, 1);
  assert.equal(report.tolerances.throatM, 3);
  assert.equal(report.method.independentSurvey, false);
});


test('renders explicit numeric published flags and missing gauge evidence without claiming a survey', () => {
  const report = createAxis01Report(fixture(), layout);
  assert.equal(report.platforms[0]!.withinPublishedTolerance, false);
  assert.ok(report.flags.some(f => f.code === 'platform-published-tolerance' && f.detail.includes('Platform 0')));
  assert.equal(report.sample26mCar.withinTolerance, true);
  const markdown = renderAxis01Markdown(report);
  assert.match(markdown, /not an independent survey/);
  assert.match(markdown, /operational.*polygon extents differ/);
  assert.match(markdown, /\| 0 \| 300 \| 300 \| 305 \| -5 \| FLAG \|/);
  assert.match(markdown, /Gauge samples/);
  assert.match(markdown, /26 m intermediate car: drawn 25\.999998 m/);
  const empty = fixture(); empty.nodes = []; empty.rails = [];
  assert.ok(createAxis01Report(empty, layout).flags.some(f => f.code === 'gauge-samples-missing'));
});

test('compares the drawn concourse roof extent with Arup and flags a missing station footprint', async () => {
  const { readFileSync } = await import('node:fs');
  const { shedLayout } = await import('../../core/station.ts');
  const real: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
  const report = createAxis01Report(real, shedLayout(real));
  assert.ok(report.concourse !== null);
  assert.ok(Math.abs(report.concourse.drawnNorthSouthM - 138) <= 3, `${report.concourse.drawnNorthSouthM} m`);
  assert.equal(report.concourse.withinTolerance, true);
  assert.ok(!report.flags.some(f => f.code.startsWith('concourse-')));
  assert.match(renderAxis01Markdown(report), /Western Concourse overall N–S roof: 13\d\.\d+ m; .* PASS at 3 m/);
  const synthetic = createAxis01Report(fixture(), layout);
  assert.equal(synthetic.concourse, null);
  assert.ok(synthetic.flags.some(f => f.code === 'concourse-missing'));
  assert.match(renderAxis01Markdown(synthetic), /not measured \(no OSM station footprint\)\. FLAG/);
});

test('names the documented Platform 9 outline inference instead of an unexplained OSM mismatch', async () => {
  const { readFileSync } = await import('node:fs');
  const { shedLayout } = await import('../../core/station.ts');
  const real: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
  const report = createAxis01Report(real, shedLayout(real));
  const p9 = report.platforms.find(p => p.ref === '9')!;
  assert.ok(p9.outlineInference !== null && Math.abs(p9.drawnMinusPublishedM!) <= 1);
  assert.ok(report.flags.some(f => f.code === 'platform-outline-inferred' && f.detail.includes('Platform 9') && f.detail.includes('Sectional Appendix')));
  assert.ok(!report.flags.some(f => f.code === 'platform-osm-tolerance' && f.detail.includes('Platform 9:')));
  assert.ok(report.platforms.filter(p => p.ref !== '9').every(p => p.outlineInference === null));
});
