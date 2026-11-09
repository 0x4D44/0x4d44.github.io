import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { waitForGpu, verifyMemoryReturn, verifyViewport, synchronizeCaptureViewport, inspectStationPixels, stationPlaceholder } from '../station-capture.mjs';

test('capture waits for an occupied GPU with bounded polling before allowing launch', async () => {
  let time = 0, checks = 0;
  const waits = [];
  await waitForGpu({ hold: 'peer-marker', exists: async p => { assert.equal(p, 'peer-marker'); return ++checks < 3; }, now: () => time, sleep: async ms => { waits.push(ms); time += ms; }, log: () => {} });
  assert.equal(checks, 3);
  assert.deepEqual(waits, [30000, 30000]);
});
test('capture refuses an uncleared GPU hold and propagates filesystem failures', async () => {
  let time = 0;
  await assert.rejects(waitForGpu({ exists: async () => true, now: () => time, timeoutMs: 45000, sleep: async ms => { assert.ok(ms <= 30000); time += ms; }, log: () => {} }), /GPU hold did not clear/);
  assert.equal(time, 45000);
  await assert.rejects(waitForGpu({ exists: async () => { throw new Error('permission denied'); } }), /permission denied/);
});
test('GPU memory comparison detects cumulative retained resources, not merely a stable last cycle', () => {
  const baseline = { geometries: 100, textures: 8 };
  assert.equal(verifyMemoryReturn(baseline, { geometries: 100, textures: 8 }), true);
  assert.equal(verifyMemoryReturn(baseline, { geometries: 95, textures: 7 }), true);
  assert.throws(() => verifyMemoryReturn(baseline, { geometries: 101, textures: 8 }), /geometries retained/);
  assert.throws(() => verifyMemoryReturn(baseline, { geometries: 100, textures: 9 }), /textures retained/);
  assert.throws(() => verifyMemoryReturn(baseline, { geometries: 100 }), /missing GPU memory counter/);
});
test('capture catches hidden controls, duplicate canvases and either scroll direction', () => {
  const view = { canvases: 1, overflowX: 0, overflowY: 0, covered: [] };
  assert.equal(verifyViewport(view), true);
  for (const change of [{ canvases: 2 }, { overflowX: 2 }, { overflowY: 2 }, { covered: ['station switch'] }]) assert.throws(() => verifyViewport({ ...view, ...change }), /viewport invariant failed/);
});

const readySize = { viewportWidth: 390, viewportHeight: 844, cssWidth: 390, cssHeight: 844, bufferWidth: 390, bufferHeight: 844, canvasWidth: 390, canvasHeight: 844, pixelRatio: 1, resizeSerial: 1 };
test('resize capture waits for event, CSS and drawing buffer before the final render', async () => {
  const events = []; let probes = 0, time = 0;
  const states = [
    { ...readySize, viewportWidth: 1440, resizeSerial: 0 },
    { ...readySize, bufferWidth: 1440, canvasWidth: 1440 },
    { ...readySize, resizeSerial: 0 }, readySize, readySize,
  ];
  await synchronizeCaptureViewport({ width: 390, height: 844, previous: { viewportWidth: 1440, viewportHeight: 1000, resizeSerial: 0 },
    setMetrics: async () => { events.push('metrics'); },
    probe: async () => { events.push('probe'); return states[Math.min(probes++, states.length - 1)]; },
    render: async () => { assert.ok(probes >= 4, 'render ran before the browser resize handler and buffers agreed'); events.push('render'); },
    now: () => time, sleep: async ms => { time += ms; events.push('yield'); },
  });
  assert.equal(events[0], 'metrics'); assert.equal(events.at(-1), 'render'); assert.equal(events.filter(e => e === 'render').length, 1);
});
test('resize capture times out rather than rendering with a stale drawing buffer', async () => {
  let time = 0, rendered = false;
  await assert.rejects(synchronizeCaptureViewport({ width: 390, height: 844, setMetrics: async () => {}, probe: async () => ({ ...readySize, bufferWidth: 1440 }), render: async () => { rendered = true; }, now: () => time, sleep: async ms => { time += ms; }, timeoutMs: 100 }), /resize.*synchron/i);
  assert.equal(rendered, false);
});
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
  for (const b of body) { crc ^= b; for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; }
  const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4); return out;
}
function stationPng(colour) {
  const width = 80, height = 100, header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rows = [];
  for (let y = 0; y < height; y++) { const row = Buffer.alloc(width * 3 + 1); for (let x = 0; x < width; x++) row.set(colour(x, y), 1 + x * 3); rows.push(row); }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.concat(rows))), pngChunk('IEND', Buffer.alloc(0))]);
}
const pixelPlan = { canvas: { left: 0, top: 0, right: 80, bottom: 100 }, excluded: [{ left: 0, top: 0, right: 80, bottom: 20 }] };
test('PNG detector rejects label-only dark canvas despite bright varied DOM overlays', () => {
  const image = stationPng((x,y) => y < 20 ? [x * 3, 255 - x * 3, y * 10] : [14,18,24]);
  const result = inspectStationPixels(image, pixelPlan);
  assert.equal(result.clear, false); assert.match(result.reason, /canvas.*(?:black|blank)/i); assert.equal(result.nonblackFraction, 0); assert.equal(result.standardDeviation, 0);
});
test('PNG detector accepts scene variation but refuses an empty bright London scene', () => {
  const scene = stationPng((x,y) => [40 + x, 40 + y, 90]);
  assert.equal(inspectStationPixels(scene, pixelPlan).clear, true);
  assert.equal(inspectStationPixels(stationPng(() => [51,68,88]), pixelPlan).clear, false);
});
test('Waverley permits its specified solid background while still rejecting a black canvas', () => {
  const plan = { ...pixelPlan, placeholder: true };
  assert.equal(inspectStationPixels(stationPng(() => [51,68,88]), plan).clear, true);
  assert.equal(inspectStationPixels(stationPng(() => [14,18,24]), plan).clear, false);
});

test('installed Waverley models require rendered scene variation rather than the placeholder background exception', () => {
  const real = { state: { selected: 'edinburgh-waverley' }, accounting: { placeholder: false } };
  assert.equal(stationPlaceholder(real), false);
  assert.equal(inspectStationPixels(stationPng(() => [51,68,88]), { ...pixelPlan, placeholder: stationPlaceholder(real) }).clear, false);
  const empty = { ...real, accounting: { placeholder: true } };
  assert.equal(stationPlaceholder(empty), true);
  assert.equal(inspectStationPixels(stationPng(() => [51,68,88]), { ...pixelPlan, placeholder: stationPlaceholder(empty) }).clear, true);
  assert.equal(stationPlaceholder({ state: { selected: 'kings-cross' } }), false);
  assert.throws(() => stationPlaceholder({ state: { selected: 'edinburgh-waverley' } }), /scene accounting/);
});
