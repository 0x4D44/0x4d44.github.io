import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { AnchorMap } from '../../core/anchors.ts';
import { ALL_KINDS, TRAIN_SPECS, trainLayout } from '../../core/train.ts';
import { createAxis03Report, measureCarEnvelope, motionReportInputPaths, renderAxis03Markdown } from '../axis03-evidence.ts';

const anchors: AnchorMap = { area: 'Y9', sources: ['synthetic anchors'], anchors: [{ berth: 'A', kind: 'signal', from: 1, to: 2, t: 0.5, point: [0, 0], errorM: 1, evidence: 'synthetic' }], unmapped: [] };
const recordings = [
  { path: 'synthetic-1.ndjson', sha256: 'recording-sha-1', bytes: 12 },
  { path: 'synthetic-2.ndjson', sha256: 'recording-sha-2', bytes: 34 },
];
const motionReport = {
  lengthPolicy: 'No schedule supplied; page birth resolver uses the description fallback.',
  reproducibility: { inputHashes: {
    anchors: { path: 'synthetic-anchors.json', capturedPath: 'frozen-anchors.json', sha256: 'anchors-sha' },
    recordings: recordings.map(({ sha256 }, i) => ({ path: `recording-${i + 1}.ndjson`, capturedPath: `frozen-recording-${i + 1}.ndjson`, sha256 })),
  } },
  recordings: recordings.map((input, i) => ({
    index: i + 1,
    input: { ...input, capturedPath: `frozen-recording-${i + 1}.ndjson` },
    audit: { trains: [{ id: i + 1, description: i ? '2SYN' : '1SYN', kind: i ? 'lner5' : 'lner9', lengthM: i ? 129.7 : 233.7, firstSeenSeconds: i * 10 }] },
  })),
};

function report(withMotion = false) {
  return createAxis03Report({
    anchors,
    anchorFingerprint: { path: 'synthetic-anchors.json', sha256: 'anchors-sha', bytes: 20 },
    recordings,
    ...(withMotion ? { motion: { path: 'synthetic-motion.json', sha256: 'motion-sha', bytes: 40, content: motionReport } } : {}),
  });
}

test('measures every ALL_KINDS coach body and roof envelope while excluding separate running gear', () => {
  const result = report();
  assert.deepEqual(result.kinds.map(({ kind }) => kind), ALL_KINDS);
  for (const item of result.kinds) {
    assert.equal(item.family, TRAIN_SPECS[item.kind].family);
    assert.equal(item.cars.length, trainLayout(item.kind).cars.length);
    for (const car of item.cars) {
      assert.equal(car.index, item.cars.indexOf(car));
      assert.ok(car.geometry.lengthM > 0 && car.geometry.widthM > 0 && car.geometry.heightAboveRailM > 0);
      assert.equal(car.model.vehicleLengthM, car.expected.lengthM.modelSpec.valueM);
      assert.equal(car.model.bodyWidthM, car.expected.widthM.modelSpec.valueM);
      assert.equal(car.model.bodyRoofHeightAboveRailM, car.expected.heightAboveRailM.modelSpec.valueM);
    }
  }
  const azuma = result.kinds.find(({ kind }) => kind === 'lner5')!.cars[0]!;
  assert.ok(Math.abs(azuma.geometry.lengthM - 25.849) < 0.002);
  assert.equal(azuma.geometry.widthM, 2.7);
  assert.equal(azuma.geometry.heightAboveRailM, 3.62);
  assert.equal(azuma.geometry.envelopeHeightM, 3.17);

  const synthetic = new THREE.Group();
  synthetic.name = 'synthetic-car';
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 5));
  body.name = 'body-detail';
  body.position.y = 3;
  const pan = new THREE.Mesh(new THREE.BoxGeometry(20, 100, 20));
  pan.name = 'pantograph-mesh';
  const bogie = new THREE.Mesh(new THREE.BoxGeometry(30, 200, 30));
  bogie.name = 'bogie-mesh';
  synthetic.add(body, pan, bogie);
  const envelope = measureCarEnvelope(synthetic);
  assert.equal(envelope.lengthM, 5);
  assert.equal(envelope.widthM, 2);
  assert.equal(envelope.heightAboveRailM, 4);
  assert.equal(envelope.minY, 2);
});

test('keeps the Class 802 transfer explicitly assumed and selects the Class 180 fleet owner’s dimensions', () => {
  const result = report();
  const hullDriving = result.kinds.find(({ kind }) => kind === 'hull5')!.cars[0]!;
  assert.equal(hullDriving.type, 'DPTS');
  assert.equal(hullDriving.model.vehicleLengthM, 25.85);
  assert.equal(hullDriving.expected.lengthM.published.values[0]?.valueM, 25.7);
  assert.equal(hullDriving.expected.lengthM.published.status, 'reported');
  assert.equal(hullDriving.expected.lengthM.modelSpec.basis, 'assumed');
  assert.match(hullDriving.expected.lengthM.published.note ?? '', /25\.85/);
  assert.equal(hullDriving.expected.lengthM.published.values[0]?.sources[0]?.url, 'https://en.wikipedia.org/wiki/British_Rail_Class_802');

  const gcMiddle = result.kinds.find(({ kind }) => kind === 'gc180x5')!.cars[1]!;
  assert.equal(gcMiddle.expected.lengthM.published.status, 'source-conflict');
  assert.equal(gcMiddle.model.vehicleLengthM, 23.02);
  assert.deepEqual(gcMiddle.expected.lengthM.published.values.map(({ valueM }) => valueM), [23.02, 23.03]);
  assert.equal(gcMiddle.expected.lengthM.published.values[0]?.sources[0]?.url, 'https://angeltrains.co.uk/fleet/class-180/');
  assert.ok(gcMiddle.expected.lengthM.published.values.every(({ sources }) => sources[0]?.url.startsWith('https://')));
});

test('joins motion birth kinds only when recording and anchor hashes match', () => {
  assert.deepEqual(motionReportInputPaths(motionReport), {
    anchors: 'frozen-anchors.json', recordings: ['frozen-recording-1.ndjson', 'frozen-recording-2.ndjson'],
  });
  const result = report(true);
  assert.equal(result.inputs.anchors.sha256, 'anchors-sha');
  assert.deepEqual(result.inputs.recordings.map(({ sha256 }) => sha256), recordings.map(({ sha256 }) => sha256));
  assert.equal(result.drawnKinds.available, true);
  assert.equal(result.drawnKinds.recordings[0]?.trainCount, 1);
  assert.equal(result.drawnKinds.recordings[0]?.countsByKind.find(({ kind }) => kind === 'lner9')?.births, 1);
  assert.equal(result.drawnKinds.recordings[1]?.countsByKind.find(({ kind }) => kind === 'lner5')?.births, 1);

  const wrongRecordingReport = structuredClone(motionReport);
  wrongRecordingReport.recordings[0]!.input.sha256 = 'other-recording';
  assert.throws(() => createAxis03Report({
    anchors,
    anchorFingerprint: { path: 'synthetic-anchors.json', sha256: 'anchors-sha', bytes: 20 },
    recordings,
    motion: { path: 'synthetic-motion.json', sha256: 'motion-sha', bytes: 40, content: wrongRecordingReport },
  }), /recording 1 hash/);

  const wrongAnchorReport = structuredClone(motionReport);
  wrongAnchorReport.reproducibility.inputHashes.anchors.sha256 = 'other-anchors';
  assert.throws(() => createAxis03Report({
    anchors,
    anchorFingerprint: { path: 'synthetic-anchors.json', sha256: 'anchors-sha', bytes: 20 },
    recordings,
    motion: { path: 'synthetic-motion.json', sha256: 'motion-sha', bytes: 40, content: wrongAnchorReport },
  }), /anchor hash/);
});

test('labels missing source dimensions and model-derived measurements as non-independent', () => {
  const result = report();
  const sevenHundred = result.kinds.find(({ kind }) => kind === 'tl700x8')!.cars[0]!;
  const azuma = result.kinds.find(({ kind }) => kind === 'lner5')!.cars[0]!;
  assert.equal(sevenHundred.expected.heightAboveRailM.modelSpec.basis, 'assumed');
  assert.equal(sevenHundred.expected.heightAboveRailM.published.status, 'not-published');
  assert.ok(sevenHundred.expected.lengthM.modelSpec.sources.some(({ url }) => url === 'https://news.siemens.co.uk/resources/desiro-city-datasheet-high-res'));
  assert.equal(azuma.expected.heightAboveRailM.modelSpec.sources[0]?.url, 'https://gbtrains.uk/stock/800/');
  assert.equal(result.method.independentVerification, false);
  assert.match(result.method.comparisonMeaning, /not independent verification/);
  assert.match(renderAxis03Markdown(result), /Pantograph meshes and all bogie\/wheel meshes are excluded/);
  assert.match(renderAxis03Markdown(result), /not independent verification/);
});
