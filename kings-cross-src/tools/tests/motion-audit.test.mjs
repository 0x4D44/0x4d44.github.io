import assert from 'node:assert/strict';
import test from 'node:test';
import { auditRecording, renderMotionAuditMarkdown } from '../motion-audit.ts';
import { PLATFORM_9_OUTLINE_BASIS } from '../../core/station.ts';

const data = {
  attribution: 'synthetic', origin: { lat: 0, lon: 0 },
  nodes: [[1, 0, -200], [2, 100, -200]],
  rails: [{ id: 10, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0, maxspeed: '10 mph' }],
  switches: [], buffers: [{ id: 2, x: 100, z: -200 }], signals: [],
  platforms: [{ id: 90, ref: '1', pts: [[10, -205], [100, -205], [100, -195], [10, -195]] }], buildings: [],
};
const anchors = {
  area: 'Y9', sources: ['synthetic'], unmapped: [],
  anchors: [
    { berth: 'S1', kind: 'signal', from: 1, to: 2, t: 1, point: [100, -200], errorM: 5, evidence: 'synthetic signal' },
    { berth: 'P1', kind: 'platform', platform: '1', from: 1, to: 2, t: 1, point: [100, -200], errorM: 5, evidence: 'synthetic platform' },
  ],
};
const edgePoint = (graph, x) => ({ edge: graph.edges[0], t: x / 100, point: [x, -200] });
const view = (graph, { id = 1, description = `T${id}`, x, speed = 0, heading = Math.PI / 2, from = Math.max(0, x - 10) / 100,
  to = x / 100, reversals = 0, targetBerth = '', state = speed > 0 ? 'moving' : 'held' } = {}) => ({
  id, description, leading: edgePoint(graph, x), heading, speed, lengthM: 10, occupiedLengthM: Math.abs(to - from) * 100,
  occupied: [{ edge: graph.edges[0], fromT: from, toT: to }], state, opacity: 1, targetBerth, lastBerth: targetBerth,
  blocked: false, distanceM: 0, reversals,
});
const scriptedFactory = (atSeconds) => (graph) => {
  let seconds = 0;
  return {
    apply() {},
    advance(dt) { seconds += dt; },
    trains() { return atSeconds(seconds, graph); },
  };
};
const rows = (endMs) => [{ t: 0, e: { kind: 'heartbeat', area: 'Y9' } }, { t: endMs, e: { kind: 'heartbeat', area: 'Y9' } }];

test('measures per-tick motion, occupied-track speed caps, same-track overlap and direction', () => {
  const frames = (seconds, graph) => {
    if (seconds < 0.05) return [view(graph, { x: 10, from: 0.05, to: 0.1 })];
    if (seconds < 0.15) return [
      view(graph, { x: 12, speed: 6, from: 0.12, to: 0.22 }),
      view(graph, { id: 2, x: 24, from: 0.17, to: 0.25 }),
    ];
    if (seconds < 0.25) return [
      view(graph, { x: 11, speed: 0, from: 0.11, to: 0.21 }),
      view(graph, { id: 2, x: 24, from: 0.17, to: 0.25 }),
    ];
    return [view(graph, { x: 11, speed: 6, from: 0.11, to: 0.21 })];
  };
  const report = auditRecording(rows(300), data, anchors, { createMotion: scriptedFactory(frames) });
  assert.equal(report.counts.maxSpeedMps, 6);
  assert.ok(report.counts.maxAccelerationMps2 >= 60);
  assert.ok(report.counts.maxDecelerationMps2 >= 60);
  assert.ok(report.counts.accelerationViolationTicks > 0);
  assert.ok(report.counts.decelerationViolationTicks > 0);
  assert.ok(report.counts.speedLimitViolationTicks > 0, '10 mph OSM cap applies to the occupied rail segment');
  assert.ok(report.counts.pointOverspeedTicks > 0);
  assert.ok(report.counts.teleportTicks > 0);
  assert.ok(report.counts.backwardTicks > 0);
  assert.ok(report.counts.maxSameTrackOverlapM > 0);
  assert.ok(report.counts.sameTrackOverlapTicks > 0);
});

test('records a deterministic 1 s profile and excludes a stationary cab reversal from point jumps', () => {
  const cabData = { ...data, buffers: [{ id: 2, x: 20, z: -200 }],
    platforms: [{ id: 90, ref: '1', pts: [[0, -205], [20, -205], [20, -195], [0, -195]] }] };
  const cabAnchors = { ...anchors, anchors: anchors.anchors.map((a) => ({ ...a, t: 0.2, point: [20, -200] })) };
  const frames = (seconds, graph) => [view(graph, seconds < 0.15
    ? { x: 20, from: 0.1, to: 0.2, targetBerth: 'P1' }
    : seconds < 0.25
      ? { x: 10, from: 0.2, to: 0.1, heading: -Math.PI / 2, reversals: 1, targetBerth: 'P1' }
      : { x: 10, from: 0.2, to: 0.1, heading: -Math.PI / 2, reversals: 1, targetBerth: 'P1' })];
  const options = { createMotion: scriptedFactory(frames) };
  const first = auditRecording(rows(2200), cabData, cabAnchors, options);
  const second = auditRecording(rows(2200), cabData, cabAnchors, options);
  assert.deepEqual(first, second);
  assert.deepEqual(first.trains[0].profile.map((sample) => sample.seconds), [0, 1, 2]);
  assert.equal(first.counts.stationaryCabReversals, 1);
  assert.equal(first.counts.maxPointJumpM, 0);
  assert.equal(first.counts.teleportTicks, 0);
  assert.equal(first.counts.distanceUnderSpeedTicks, 0);
  assert.equal(first.counts.backwardTicks, 0);
  assert.equal(first.counts.reversalsOutsidePlatform, 0);
});

test('reports a reversal counter change away from a selected surface platform', () => {
  const frames = (seconds, graph) => [view(graph, seconds < 0.05
    ? { id: 3, x: 4, from: 0, to: 0.04, targetBerth: '' }
    : { id: 3, x: 4, from: 0.04, to: 0, reversals: 1, targetBerth: '' })];
  const report = auditRecording(rows(100), data, anchors, { createMotion: scriptedFactory(frames) });
  assert.equal(report.counts.reversalsOutsidePlatform, 1);
  assert.equal(report.violations.filter((v) => v.kind === 'reversal-outside-platform').length, 1);
});

test('keeps the station cap while the train nose is outside the station but its body still occupies it', () => {
  const splitData = { ...data, nodes: [[1, 100, -200], [2, 150, -200], [3, 200, -200]],
    rails: [
      { id: 11, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0, maxspeed: '100 km/h' },
      { id: 12, nodes: [2, 3], service: 'main', tunnel: false, bridge: false, layer: 0, maxspeed: '100 km/h' },
    ], buffers: [], platforms: [] };
  const noAnchors = { area: 'Y9', sources: ['synthetic'], anchors: [], unmapped: [] };
  const factory = (graph) => ({
    apply() {}, advance() {},
    trains() {
      const [stationEdge, approachEdge] = graph.edges;
      return [{ id: 1, description: 'T1', leading: { edge: approachEdge, t: 0.4, point: [170, -200] }, heading: Math.PI / 2,
        speed: 10, lengthM: 10, occupiedLengthM: 70,
        occupied: [{ edge: stationEdge, fromT: 0, toT: 1 }, { edge: approachEdge, fromT: 0, toT: 0.4 }],
        state: 'moving', opacity: 1, targetBerth: '', lastBerth: '', blocked: false, distanceM: 0, reversals: 0 }];
    },
  });
  const report = auditRecording(rows(100), splitData, noAnchors, { createMotion: factory });
  assert.ok(report.counts.speedLimitViolationTicks > 0, 'the occupied station edge still caps the whole train at 25 km/h');
  assert.equal(report.maxSpeedByZone.approach.maxMps, 10, 'the leading cab has cleared the station zone');
});

test('counts only a long stationary hold outside every anchor; a body covering a berth is anchored', () => {
  const frames = (_seconds, graph) => [
    view(graph, { id: 1, x: 50, from: 0.4, to: 0.5, targetBerth: '' }),
    view(graph, { id: 2, x: 100, from: 0.8, to: 1, targetBerth: 'S1' }),
  ];
  const report = auditRecording(rows(120200), data, anchors, { createMotion: scriptedFactory(frames) });
  assert.equal(report.counts.heldOutsideAnchorViolations, 1);
  assert.equal(report.violations.filter((v) => v.kind === 'held-too-long-outside-anchor').length, 1);
  assert.equal(report.violations[0].description, 'T1');
  assert.ok(report.maxHeldOutsideAnchorSeconds > 120);
});

test('reports nose clearance from the physical buffer and the train body beyond the platform polygon', () => {
  const frames = (_seconds, graph) => [
    view(graph, { x: 98, from: 0.05, to: 0.98, targetBerth: 'P1' }),
    view(graph, { id: 2, x: 4, from: 0, to: 0.04, targetBerth: 'P1' }),
  ];
  const report = auditRecording(rows(100), data, anchors, { createMotion: scriptedFactory(frames) });
  const stop = report.trains[0].platformStops[0];
  assert.equal(stop.minimumBufferClearanceM, 2);
  assert.equal(stop.maximumBodyOutsidePlatformM, 5);
  assert.equal(report.counts.platformBufferClearanceViolations, 1);
  assert.equal(report.counts.platformBodyContainmentViolations, 1);
  assert.equal(report.trains[1].platformStops.length, 0, 'a held approach train does not inherit its platform target as a platform stop');
});

test('assesses platform 9 against the drawn 176 m extension and retains genuine overhang', () => {
  const basis = PLATFORM_9_OUTLINE_BASIS;
  const fixture = { ...data, nodes: [[basis.bufferNode, 0, -200], [2, 0, -450]],
    rails: [{ ...data.rails[0], nodes: [basis.bufferNode, 2] }],
    buffers: [{ id: basis.bufferNode, x: 0, z: -200 }],
    platforms: [{ id: basis.osmId, ref: '9', pts: [[-2, -200], [-2, -300], [2, -300], [2, -200]] }] };
  const map = { ...anchors, anchors: [{ berth: 'P9', kind: 'platform', platform: '9', from: basis.bufferNode, to: 2,
    t: 0, point: [0, -200], errorM: 5, evidence: 'synthetic physical buffer' }] };
  const run = (backM) => auditRecording(rows(100), fixture, map, { createMotion: scriptedFactory((_seconds, graph) => [{
    ...view(graph, { x: 3, targetBerth: 'P9' }), heading: 0, lengthM: backM - 3, occupiedLengthM: backM - 3,
    leading: { edge: graph.edges[0], t: 3 / 250, point: [0, -203] },
    occupied: [{ edge: graph.edges[0], fromT: 3 / 250, toT: backM / 250 }],
  }]) });
  const fit = run(175);
  assert.equal(fit.counts.platformBodyContainmentViolations, 0, 'body fits drawn extension despite exceeding raw 100 m polygon');
  assert.ok(fit.trains[0].platformStops[0].maximumBodyOutsidePlatformM <= 2);
  assert.equal(fit.counts.platformBufferClearanceViolations, 0);
  const outside = run(181);
  assert.equal(outside.counts.platformBodyContainmentViolations, 1, 'genuine overhang retains the existing 2 m tolerance');
  assert.ok(outside.trains[0].platformStops[0].maximumBodyOutsidePlatformM > 2);
  assert.equal(fixture.platforms[0].pts[1][1], -300, 'audit must not rewrite source geometry');
});


test('detects frozen body travel hidden by a plausible reported speed', () => {
  const frozen = auditRecording(rows(200), data, anchors, {
    createMotion: scriptedFactory((_seconds, graph) => [view(graph, { x: 50, speed: 4 })]),
  });
  assert.equal(frozen.counts.pointOverspeedTicks, 0);
  assert.equal(frozen.counts.accelerationViolationTicks, 0);
  assert.equal(frozen.counts.decelerationViolationTicks, 0);
  assert.equal(frozen.counts.distanceUnderSpeedTicks, 2);
  assert.equal(frozen.trains[0].distanceUnderSpeedTicks, 2);
  assert.equal(frozen.violations.filter(v => v.kind === 'distance-under-reported-speed').length, 1);
  assert.match(renderMotionAuditMarkdown(frozen), /Route distance below reported speed ticks \| 2/);
  const moving = auditRecording(rows(200), data, anchors, {
    createMotion: scriptedFactory((seconds, graph) => [{ ...view(graph, { x: 50 + 4 * seconds, speed: 4 }), distanceM: 4 * seconds }]),
  });
  assert.equal(moving.counts.distanceUnderSpeedTicks, 0);
  const curved = auditRecording(rows(1000), data, anchors, {
    createMotion: scriptedFactory((seconds, graph) => [{ ...view(graph, { x: 50, speed: 4 }),
      leading: { edge: graph.edges[0], t: .5, point: [50 + 4 * Math.sin(seconds), -200 + 4 * (1 - Math.cos(seconds))] }, distanceM: 4 * seconds }]),
  });
  assert.equal(curved.counts.distanceUnderSpeedTicks, 0, 'route odometer avoids curved-track chord ambiguity');
  const arrival = auditRecording(rows(7000), data, anchors, {
    createMotion: scriptedFactory((seconds, graph) => {
      const time = Math.min(seconds, 4 / .6), distanceM = 4 * time - .3 * time * time;
      return [{ ...view(graph, { x: 50 + distanceM, speed: Math.max(0, 4 - .6 * seconds) }), distanceM }];
    }),
  });
  assert.equal(arrival.counts.distanceUnderSpeedTicks, 0, 'bounded braking through arrival and hold stays clear');
});
