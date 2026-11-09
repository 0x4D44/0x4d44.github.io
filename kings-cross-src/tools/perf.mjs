// Startup timing, source-mapped CPU profile, two fixed replay cameras and a sweep of every fixed station camera.
// Build with --sourcemap; --self-test runs Node-only checks without Chrome or a build.
//
// Every measurement runs on the replay's busiest stretch, not its quiet start (a few trains). Before the measured Chrome opens, a Chrome
// of its own plays the whole recording at 120x and counts the trains drawn (tools/replay-peak.mjs); the recording is then served to the
// page restarted at the busiest window, from a snapshot of the trains in their berths, as a live connection delivers them. The report's
// replayPeak says where, and each camera says whether its median trains drawn reached the busy floor. --peak none keeps the old start at
// the beginning of the recording; --peak-start <replay clock ms> or --peak-from <earlier perf report> fix the start so that every cold/warm
// pair measures the same minutes (axis08-evidence.mjs passes the first pair's).
// The sweep (--stations all|none|<names>, --station-seconds 5): every fixed station camera of evidence.mjs, on a fresh load each, placed as
// the evidence pack places it, with the frame-time distribution (tools/frame-stats.mjs) and a steady-60 verdict. --no-legacy-cameras leaves
// out overview and shed (the 60 s axis 8 cameras) for the later pairs. The first-train-visible figure is in report.firstTrainVisible.
// --startup-only captures cold/warm/profile startup without camera FPS measurements.
// --check-build validates the actual bundle/maps and writes sizes without launching Chrome.
// --scene-ready also waits for cityLoaded, terrain/city geometry and their next submitted render.
// After the capped cameras (Chrome's frame limit on, about 60 FPS) it measures the same cameras again in a second Chrome started with
// --disable-gpu-vsync --disable-frame-rate-limit and reports the headroom: uncapped FPS over the 60 FPS target (--no-uncapped skips it;
// --uncapped-seconds sets its length, default min(--seconds, 20); --headroom-baseline <earlier perf json> adds the ratio to that run).
// --scene waverley measures Edinburgh Waverley instead: the frozen cameras wv-overview and wv-roof-from-north-bridge (evidence.mjs
// waverleyCameras), on a page loaded the way evidence.mjs --scene waverley loads it (trains=none), capped then uncapped with the same
// statistics and the same report shape. It needs no relay, no recording and no EB data, so it takes none of the London replay options
// (--relay, --peak*, --stations, --station-seconds, --no-legacy-cameras, --startup-only, --scene-ready) and measures no startup.
// Every page load carries the scene pin (--time <ISO instant with a zone>, --weather <name>, default midsummer noon, clear; --sky ref
// for the page's old fixed look), so a page that reads the pin shows the same sky every run and requests no weather.
//
//   node tools/perf.mjs [--scene kings-cross|waverley] [--dist <built dir>] [--out <output dir>] [--seconds 60]
//                       [--uncapped-seconds 20] [--time <ISO instant>] [--weather <name>]
//                       [--chrome <path>] [--relay http://127.0.0.1:8787]   (--relay is London only)
//
// Uses headless Chrome with ANGLE Metal requested, then records the WebGL renderer string so a
// SwiftShader fallback cannot be mistaken for a real-GPU result. Replay data comes only from the
// already-running relay. The local server serves the almanac back button, the built page, and a
// same-origin /relay proxy. No recording data or screenshots are copied out of the browser.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinParameters, scenePinFrom, withPin } from './scene-pin.mjs';
import { frameDistribution, steadyAt60 } from './frame-stats.mjs';
import { SCAN_SPEED, peakWindow, windowRecording } from './replay-peak.mjs';
import { sweepCameraList, sweepSummary } from './camera-sweep.mjs';

// Install before any app module runs. onAfterRender proves a train mesh passed renderer
// visibility/frustum checks and issued a draw; group.visible alone does not prove that.
export function startupObserver() {
  const observation = window.__kxStartup = { sceneRenderedMs: null, replayTrainsRenderedMs: null, trainDraws: 0 };
  const first = (name) => { if (observation[name] == null) observation[name] = performance.now(); };
  observation.fetches = [];
  observation.resources = [];
  if (typeof PerformanceObserver !== 'undefined') {
    new PerformanceObserver((list) => {
      for (const r of list.getEntries()) observation.resources.push({ url: r.name, initiatorType: r.initiatorType,
        startMs: r.startTime, headersMs: r.responseStart, endMs: r.responseEnd,
        transferBytes: r.transferSize, encodedBodyBytes: r.encodedBodySize, decodedBodyBytes: r.decodedBodySize,
        status: r.responseStatus ?? null });
    }).observe({ type: 'resource', buffered: true });
  }
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const row = { url: String(args[0]?.url ?? args[0]), startMs: performance.now() };
      observation.fetches.push(row);
      try {
        const response = await originalFetch.apply(this, args);
        row.headersMs = performance.now(); row.status = response.status;
        row.contentLengthBytes = Number(response.headers.get('content-length')) || null;
        for (const method of ['text', 'json']) {
          const originalBody = response[method];
          response[method] = async function (...bodyArgs) {
            row[`${method}StartMs`] = performance.now();
            try { return await originalBody.apply(this, bodyArgs); }
            finally { row[`${method}EndMs`] = performance.now(); }
          };
        }
        return response;
      } catch (error) { row.failedMs = performance.now(); row.error = error.name; throw error; }
    };
  }
  let current;
  Object.defineProperty(window, '__kx', {
    configurable: true,
    get: () => current,
    set(k) {
      current = k;
      if (!k?.renderer) return;
      first('sceneReadyMs');
      let cityComplete = false;
      k.cityLoaded?.then(() => { cityComplete = true; }, () => {});
      observation.replaySpeed = k.feed?.speed;
      let motion = k.motion;
      Object.defineProperty(k, 'motion', { configurable: true, enumerable: true, get: () => motion, set(value) {
        motion = value;
        if (!value) return;
        first('motionCreatedMs');
        for (const method of ['apply', 'advance']) {
          const originalMethod = value[method];
          if (typeof originalMethod !== 'function') continue;
          value[method] = function (...args) {
            first(method === 'apply' ? 'firstMotionApplyMs' : 'firstMotionAdvanceMs');
            // Initial dispatch runs before main assigns its feed variable, so its status
            // publishes timeMs=0. The first applied replay event carries the exact origin.
            if (method === 'apply' && k.feed?.mode === 'replay' && observation.replayTimeOriginMs == null && Number.isFinite(args[1])) observation.replayTimeOriginMs = args[1];
            return originalMethod.apply(this, args);
          };
        }
      } });
      if (motion) k.motion = motion;
      let connection = k.feed?.connection;
      if (k.feed) Object.defineProperty(k.feed, 'connection', { configurable: true, enumerable: true,
        get: () => connection, set(value) {
          connection = value;
          if (value === 'playing' || value === 'recording ended') first('replayClockStartedMs');
        } });
      let feedTime = k.feed?.timeMs;
      if (k.feed) Object.defineProperty(k.feed, 'timeMs', { configurable: true, enumerable: true,
        get: () => feedTime, set(value) {
          feedTime = value;
          if (observation.replayClockStartedMs != null && observation.replayTimeOriginMs == null && Number.isFinite(value) && value > 0) observation.replayTimeOriginMs = value;
        } });
      const milestone = (name) => {
        if (observation[name] != null) return;
        first(name);
        observation[name.replace(/Ms$/, 'ClockMs')] = k.feed?.timeMs ?? null;
      };
      const renderer = k.renderer, original = renderer.render;
      const hooked = new Map();
      let trainDraws = 0;
      renderer.render = function (...args) {
        trainDraws = 0;
        if (k.motionState?.length) milestone('firstMotionViewMs');
        if (observation.firstTrainGeometryReadyMs == null && k.feed?.mode === 'replay') {
          for (const train of k.trains ?? []) train.group?.traverseVisible((object) => {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            if (object.isMesh && materials.some((material) => material && material.visible !== false && material.opacity > 0)) milestone('firstTrainGeometryReadyMs');
          });
        }
        if (observation.replayTrainsRenderedMs === null && k.feed?.mode === 'replay') {
          for (const train of k.trains ?? []) train.group?.traverse((object) => {
            if ((!object.isMesh && !object.isLine && !object.isPoints) || hooked.has(object)) return;
            const previous = object.onAfterRender;
            hooked.set(object, previous);
            object.onAfterRender = function (...drawArgs) {
              const material = drawArgs[4];
              if (!material || material.opacity > 0) trainDraws++;
              return previous?.apply(this, drawArgs);
            };
          });
        }
        const result = original.apply(this, args);
        const now = performance.now();
        if (cityComplete && k.parts?.terrain && k.parts?.buildings && observation.fullSceneRenderedMs == null) observation.fullSceneRenderedMs = now;
        if (observation.sceneRenderedMs === null && renderer.info.render.frame > 0) observation.sceneRenderedMs = now;
        // Hooks survive frames where trains are hidden; reset their shared draw count each frame.
        if (k.feed?.mode === 'replay' && trainDraws > 0 && observation.replayTrainsRenderedMs === null) {
          observation.replayTrainsRenderedMs = now;
          observation.firstTrainRenderClockMs = k.feed?.timeMs ?? null;
          observation.trainDraws = trainDraws;
          for (const [object, previous] of hooked) object.onAfterRender = previous;
        }
        if (observation.replayTrainsRenderedMs != null && (!k.cityLoaded || observation.fullSceneRenderedMs != null)) renderer.render = original;
        return result;
      };
    },
  });
}
const observerSource = `(${startupObserver.toString()})()`;

export function extractTiming(state) {
  const observed = state?.observation;
  if (!(observed?.sceneRenderedMs > 0) || !(observed?.replayTrainsRenderedMs >= observed.sceneRenderedMs) || !(observed.trainDraws > 0)) return null;
  const simulationOffset = difference(observed.firstTrainRenderClockMs, observed.replayTimeOriginMs);
  const contentDelay = simulationOffset != null && observed.replaySpeed > 0 ? simulationOffset / observed.replaySpeed : null;
  return {
    navigationStartToSceneRenderedMs: observed.sceneRenderedMs,
    navigationStartToFullSceneRenderedMs: observed.fullSceneRenderedMs ?? null,
    navigationStartToReplayTrainsRenderedMs: observed.replayTrainsRenderedMs,
    appFirstFrameMs: state.firstFrameMs,
    replayTrainDrawsAtFirstRender: observed.trainDraws,
    sceneWithin3s: observed.sceneRenderedMs < 3000,
    navigationType: state.navigation?.type ?? null,
    resources: state.resources ?? [],
    phases: {
      sceneReadyMs: observed.sceneReadyMs ?? null,
      motionCreatedMs: observed.motionCreatedMs ?? null,
      firstMotionApplyMs: observed.firstMotionApplyMs ?? null,
      firstMotionAdvanceMs: observed.firstMotionAdvanceMs ?? null,
      replayClockStartedMs: observed.replayClockStartedMs ?? null,
      firstMotionViewMs: observed.firstMotionViewMs ?? null,
      firstTrainRenderedMs: observed.replayTrainsRenderedMs,
      firstTrainGeometryReadyMs: observed.firstTrainGeometryReadyMs ?? null,
      replayTimeOriginMs: observed.replayTimeOriginMs ?? null,
      firstMotionViewClockMs: observed.firstMotionViewClockMs ?? null,
      firstTrainGeometryReadyClockMs: observed.firstTrainGeometryReadyClockMs ?? null,
      firstTrainRenderClockMs: observed.firstTrainRenderClockMs ?? null,
      firstMotionViewSimOffsetMs: difference(observed.firstMotionViewClockMs, observed.replayTimeOriginMs),
      firstTrainGeometryReadySimOffsetMs: difference(observed.firstTrainGeometryReadyClockMs, observed.replayTimeOriginMs),
      firstTrainRenderSimOffsetMs: difference(observed.firstTrainRenderClockMs, observed.replayTimeOriginMs),
      firstTrainContentDelayMs: contentDelay,
      nonReplayElapsedToFirstTrainMs: difference(observed.replayTrainsRenderedMs, contentDelay),
      clockToViewMs: difference(observed.firstMotionViewMs, observed.replayClockStartedMs),
      clockToGeometryMs: difference(observed.firstTrainGeometryReadyMs, observed.replayClockStartedMs),
      geometryToFrustumDrawMs: difference(observed.replayTrainsRenderedMs, observed.firstTrainGeometryReadyMs),
      recordingParseMs: markDuration(state.marks, 'kx:recording-parse-start', 'kx:recording-parse-end'),
      sceneToFirstTrainMs: observed.replayTrainsRenderedMs - observed.sceneRenderedMs,
      clockToFirstTrainMs: observed.replayClockStartedMs == null ? null : observed.replayTrainsRenderedMs - observed.replayClockStartedMs,
    },
    marks: state.marks ?? [],
    fetches: (observed.fetches ?? []).map((row) => ({ ...row,
      phase: requestPhase(row.url),
      headersWaitMs: row.headersMs == null ? null : row.headersMs - row.startMs,
      bodyReadMs: row.textEndMs != null ? row.textEndMs - row.textStartMs : row.jsonEndMs != null ? row.jsonEndMs - row.jsonStartMs : null,
      measuredThrough: row.textEndMs != null || row.jsonEndMs != null ? 'body' : row.failedMs != null ? 'failure' : 'headers',
      totalMs: difference(row.textEndMs ?? row.jsonEndMs ?? row.failedMs ?? row.headersMs, row.startMs),
    })),
    resourceTimings: observed.resources ?? [],
  };
}

function difference(end, start) { return end == null || start == null ? null : end - start; }

function markDuration(marks = [], start, end) {
  const a = marks.find((mark) => mark.name === start)?.startMs;
  const b = marks.find((mark) => mark.name === end)?.startMs;
  return a == null || b == null ? null : b - a;
}

// CDP request ids retain the URL even when loadingFailed has no response. No bodies/headers.
function captureNetwork(message, requests, errors) {
  const p = message.params;
  if (message.method === 'Network.requestWillBeSent') {
    requests.push({ requestId: p.requestId, url: p.request.url, startSeconds: p.timestamp, type: p.type });
  } else if (['Network.responseReceived', 'Network.loadingFinished', 'Network.loadingFailed'].includes(message.method)) {
    const row = requests.findLast((row) => row.requestId === p.requestId);
    if (!row) return;
    if (message.method === 'Network.responseReceived') Object.assign(row, { status: p.response.status, headersSeconds: p.timestamp,
      fromDiskCache: p.response.fromDiskCache ?? false, fromServiceWorker: p.response.fromServiceWorker ?? false });
    else Object.assign(row, { endSeconds: p.timestamp, encodedDataBytes: p.encodedDataLength ?? null,
      ...(p.errorText ? { error: p.errorText, canceled: p.canceled ?? false } : {}) });
  } else if (message.method === 'Log.entryAdded' && p.entry.level === 'error') {
    errors.push(`log: ${p.entry.text}${p.entry.url ? ` URL: ${p.entry.url}` : ''}`);
  }
}
function requestPhase(url) {
  const pathname = new URL(url, 'http://perf.invalid').pathname;
  return pathname.startsWith('/relay/') ? pathname.slice('/relay/'.length) : 'page/assets';
}
function requestSummary(requests) {
  const failed = requests.filter((row) => row.status >= 400 || row.error);
  return { count: requests.length, phaseCounts: requests.reduce((counts, row) => { const phase = requestPhase(row.url); counts[phase] = (counts[phase] ?? 0) + 1; return counts; }, {}), failedCount: failed.length, failedUrls: [...new Set(failed.map((row) => row.url))],
    statusCounts: requests.reduce((counts, row) => { const status = row.status ?? (row.error ? 'failed' : 'pending'); counts[status] = (counts[status] ?? 0) + 1; return counts; }, {}) };
}

function startupPhaseMarkdown(startup) {
  const cold = startup.coldFreshProfile, warm = startup.warmSecondLoadSameProfile;
  const value = (n) => n == null ? 'unavailable' : Number(n.toFixed(2));
  const phases = [
    ['Scene ready', 'sceneReadyMs'], ['Replay clock started', 'replayClockStartedMs'],
    ['Recording parse duration', 'recordingParseMs'], ['First motion view', 'firstMotionViewMs'],
    ['First complete-car geometry ready (before frustum)', 'firstTrainGeometryReadyMs'],
    ['First train frustum draw', 'firstTrainRenderedMs'], ['Clock → view duration', 'clockToViewMs'],
    ['Clock → geometry duration', 'clockToGeometryMs'], ['Geometry → frustum draw duration', 'geometryToFrustumDrawMs'],
    ['Motion view simulation offset', 'firstMotionViewSimOffsetMs'],
    ['Geometry simulation offset', 'firstTrainGeometryReadySimOffsetMs'], ['Draw simulation offset', 'firstTrainRenderSimOffsetMs'],
    ['Recorded travel at replay speed', 'firstTrainContentDelayMs'], ['Elapsed less recorded travel (includes rendering)', 'nonReplayElapsedToFirstTrainMs'],
  ];
  return ['| Phase (ms; navigation-relative unless duration/offset) | Cold | Warm |', '| --- | ---: | ---: |',
    ...phases.map(([label, key]) => `| ${label} | ${value(cold.phases[key])} | ${value(warm.phases[key])} |`), '',
    '| Fetch phase | Cold total ms | Warm total ms |', '| --- | ---: | ---: |',
    ...['anchors', 'recording', 'schedule'].map((phase) => `| ${phase} | ${value(cold.fetches.find((row) => row.phase === phase)?.totalMs)} | ${value(warm.fetches.find((row) => row.phase === phase)?.totalMs)} |`)];
}

/**
 * Which of a build's scripts the CPU profile needs a source map for. Rollup writes neither a map nor a `sourceMappingURL` comment for a
 * chunk that only re-exports (the multi-station split makes an 87 byte `landmarks-*.js` one): it has no code to profile, and any
 * samples in it stay under `[unmapped] <url>`. A script that declares a map which is missing, or a build in which no script has one
 * (made without --sourcemap), is still refused.
 * @param {{ file: string, mapped: boolean, declared: boolean }[]} scripts `mapped`: a readable map sits beside it; `declared`: it names one.
 */
export function sourceMapPlan(scripts) {
  if (!scripts.some((script) => script.mapped)) return { missing: scripts.map((script) => script.file), facades: [] };
  return {
    missing: scripts.filter((script) => !script.mapped && script.declared).map((script) => script.file),
    facades: scripts.filter((script) => !script.mapped && !script.declared).map((script) => script.file),
  };
}
// Source Map v3 Base64 VLQ, no runtime dependency. Columns and lines are zero based.
function decodeMappings(map) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let source = 0, originalLine = 0, originalColumn = 0, name = 0;
  return map.mappings.split(';').map((line) => {
    let generatedColumn = 0;
    return line.split(',').filter(Boolean).map((segment) => {
      const fields = []; let value = 0, shift = 0;
      for (const char of segment) {
        const digit = alphabet.indexOf(char);
        if (digit < 0) throw new Error('Invalid source map VLQ');
        value += (digit & 31) * 2 ** shift;
        if (digit & 32) shift += 5;
        else { fields.push(value & 1 ? -(value >> 1) : value >> 1); value = 0; shift = 0; }
      }
      if (shift || ![1, 4, 5].includes(fields.length)) throw new Error('Invalid source map segment');
      generatedColumn += fields[0];
      if (fields.length === 1) return { generatedColumn };
      source += fields[1]; originalLine += fields[2]; originalColumn += fields[3];
      if (fields.length === 5) name += fields[4];
      if (!map.sources[source] || originalLine < 0 || originalColumn < 0) throw new Error('Invalid source map location');
      return { generatedColumn, source: `${map.sourceRoot ? `${map.sourceRoot.replace(/\/$/, '')}/` : ''}${map.sources[source]}`, originalLine, originalColumn, name: fields.length === 5 ? map.names?.[name] : undefined };
    });
  });
}
function originalLocation(rows, line, column) {
  const segments = rows?.[line] ?? [];
  let low = 0, high = segments.length - 1, found;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid].generatedColumn <= column) { found = segments[mid]; low = mid + 1; }
    else high = mid - 1;
  }
  return found?.source ? found : null;
}
export function aggregateCpu(profile, maps) {
  const nodes = new Map((profile?.nodes ?? []).filter(Boolean).map((node) => [node.id, node]));
  const samples = profile?.samples ?? [];
  const files = new Map(), functions = new Map(), gaps = new Map();
  const gap = (code, detail) => {
    const entry = gaps.get(code) ?? { code, count: 0, detail };
    entry.count++; gaps.set(code, entry);
  };
  if (!samples.length) gap('samples-unavailable', 'V8 supplied no CPU samples; no self time can be measured.');
  let sampledUs = 0, mappedUs = 0;
  let timedSampleCount = 0;
  for (let i = 0; i < samples.length; i++) {
    const us = profile.timeDeltas?.[i];
    // Requested sampling intervals and profile wall duration cannot reconstruct the
    // missing per-sample weights. Keep other metrics without inventing CPU costs.
    if (!Number.isFinite(us) || us < 0) {
      gap('sample-time-unavailable', 'Missing/invalid timeDeltas; these samples are excluded from timed totals and percentages.');
      continue;
    }
    const node = nodes.get(samples[i]), frame = node?.callFrame;
    if (!node) gap('sample-node-unavailable', 'Timed sample has no node; retained as unattributed self time.');
    else if (!frame) gap('call-frame-unavailable', 'Timed node has no call frame; retained as unattributed self time.');
    const hasPosition = Number.isInteger(frame?.lineNumber) && frame.lineNumber >= 0 && Number.isInteger(frame?.columnNumber) && frame.columnNumber >= 0;
    if (frame?.url && !hasPosition) gap('source-position-unavailable', 'Missing source position; retained under the generated URL without guessing a source-map location.');
    const location = hasPosition ? originalLocation(maps?.get(frame.url), frame.lineNumber, frame.columnNumber) : null;
    const source = location?.source ?? (frame?.url ? `[unmapped] ${frame.url}` : frame ? `[runtime] ${frame.functionName || '(anonymous)'}` : '[unattributed] missing CPU node/call frame');
    if (location) mappedUs += us;
    sampledUs += us;
    timedSampleCount++;
    files.set(source, (files.get(source) ?? 0) + us);
    const key = `${source}:${location ? location.originalLine + 1 : hasPosition ? frame.lineNumber + 1 : '?'} ${location?.name ?? frame?.functionName ?? '(anonymous)'}`;
    functions.set(key, (functions.get(key) ?? 0) + us);
  }
  if ((profile?.timeDeltas?.length ?? 0) > samples.length) gap('unmatched-time-deltas', 'V8 supplied more deltas than samples; unmatched deltas cannot be attributed.');
  const rows = (entries, label) => [...entries].map(([key, us]) => ({ [label]: key, selfMs: us / 1000, percent: sampledUs ? us / sampledUs * 100 : 0 })).sort((a, b) => b.selfMs - a.selfMs);
  return { status: timedSampleCount ? gaps.size ? 'partial' : 'complete' : 'unavailable',
    sampleCount: samples.length, timedSampleCount, gaps: [...gaps.values()],
    sampledMs: timedSampleCount ? sampledUs / 1000 : null, mappedSelfMs: timedSampleCount ? mappedUs / 1000 : null,
    byOriginalSourceFile: rows(files, 'source'), byFunction: rows(functions, 'function') };
}

export function cpuProfileMarkdown(cpu) {
  const value = n => Number.isFinite(n) ? Number(n.toFixed(2)) : 'unavailable';
  return [`CPU profile: ${cpu?.status ?? 'unavailable'}; ${cpu?.timedSampleCount ?? 0}/${cpu?.sampleCount ?? 0} samples timed. CPU self ms: ${value(cpu?.sampledMs)}. Percentages cover only timed samples.`, '',
    ...(cpu?.gaps?.length ? cpu.gaps.map(gap => `- CPU gap: ${gap.code} (${gap.count}): ${gap.detail}`) : cpu?.status === 'complete' ? [] : ['- CPU gap: profile details unavailable.']), '',
    '| Original source / runtime | CPU self ms | Sample % |', '| --- | ---: | ---: |',
    ...(cpu?.byOriginalSourceFile ?? []).slice(0, 15).map(row => `| ${row.source.replaceAll('|', '\\|')} | ${value(row.selfMs)} | ${value(row.percent)} |`), ''];
}

// ---- Uncapped headroom -----------------------------------------------------------------------------------------------
// The capped figure (Chrome's default frame limit, about 60) only says whether the page keeps up; it cannot say by how much.
// The headroom run measures the same cameras in a second Chrome with the frame limit and GPU vsync switched off, so the
// frames per second it reaches is what the page can render, and a wave that makes the scene dearer shows as lost headroom.
/** Chrome flags for the headroom run. Flags only take effect at launch, so it is a second browser; the capped one keeps the defaults. */
export const UNCAPPED_FLAGS = Object.freeze(['--disable-gpu-vsync', '--disable-frame-rate-limit']);
export const HEADROOM_FPS_TARGET = 60;
/** A trivial repainting page must run this many times faster uncapped than capped, or the flags did nothing and the run measures no headroom. */
export const UNCAPPED_CONTROL_RATIO = 1.5;
const finiteNumber = value => typeof value === 'number' && Number.isFinite(value);
const roundTo = (value, digits) => Number(value.toFixed(digits));

/**
 * Headroom per camera from a capped and an uncapped run of the same cameras. `capped` and `uncapped` are each
 * `{ control, cameras }`: the repainting-page control (`medianFps`) and the per-camera results perf.mjs measures (`fps`, `frameMs`, `realMetal`).
 * Headroom is the uncapped median FPS over the 60 FPS target: 1 is exactly enough, 2 is twice what the target needs.
 */
export function headroomReport(capped, uncapped) {
  const gaps = [], cameras = {};
  const controlCapped = capped?.control?.medianFps, controlUncapped = uncapped?.control?.medianFps;
  const flagsEffective = finiteNumber(controlCapped) && controlCapped > 0 && finiteNumber(controlUncapped) && controlUncapped >= controlCapped * UNCAPPED_CONTROL_RATIO;
  if (!flagsEffective) gaps.push(`The uncapped flags did not lift the frame limit: a page that only repaints a small canvas ran at ${controlUncapped ?? 'no'} FPS uncapped against ${controlCapped ?? 'no'} FPS capped (at least ${UNCAPPED_CONTROL_RATIO}x needed), so the camera figures are not headroom.`);
  for (const [name, c] of Object.entries(capped?.cameras ?? {})) {
    const u = uncapped?.cameras?.[name];
    if (!u) { gaps.push(`${name}: no uncapped measurement.`); continue; }
    const median = u.fps?.median, p5 = u.fps?.p5;
    cameras[name] = {
      cappedMedianFps: c.fps?.median ?? null, cappedP5Fps: c.fps?.p5 ?? null,
      uncappedMedianFps: median ?? null, uncappedP5Fps: p5 ?? null, uncappedFrameMs: { p50: u.frameMs?.p50 ?? null, p95: u.frameMs?.p95 ?? null },
      headroom: finiteNumber(median) ? roundTo(median / HEADROOM_FPS_TARGET, 2) : null, headroomP5: finiteNumber(p5) ? roundTo(p5 / HEADROOM_FPS_TARGET, 2) : null,
      frameCostMs: finiteNumber(median) && median > 0 ? roundTo(1000 / median, 3) : null, realMetal: u.realMetal === true,
    };
  }
  const rows = Object.values(cameras), headrooms = rows.map(row => row.headroom).filter(finiteNumber);
  if (!rows.length) gaps.push('No camera was measured uncapped.');
  else if (!rows.every(row => row.realMetal)) gaps.push('An uncapped camera did not run on a real Metal renderer.');
  return {
    fpsTarget: HEADROOM_FPS_TARGET, flags: [...UNCAPPED_FLAGS], flagsEffective, control: { cappedFps: controlCapped ?? null, uncappedFps: controlUncapped ?? null },
    cameras, worstHeadroom: headrooms.length ? Math.min(...headrooms) : null, gaps,
    valid: flagsEffective && rows.length > 0 && rows.every(row => row.realMetal && finiteNumber(row.headroom)),
    definition: `Headroom is the uncapped median frames per second over the ${HEADROOM_FPS_TARGET} FPS target, measured in a second Chrome started with ${UNCAPPED_FLAGS.join(' ')}, on the same cameras and replay as the capped run. Frames are counted when the draw is submitted (requestAnimationFrame callbacks), not when the GPU finishes or the display presents them, so it is an upper bound on what a display would show. It is valid only if a page that repaints a small canvas every frame runs at least ${UNCAPPED_CONTROL_RATIO}x faster uncapped than capped, and every camera ran on real Metal.`,
  };
}

/** Compare a headroom report with an earlier one (the baseline): per camera, the uncapped median FPS now over then. Below 1 is slower. */
export function headroomVsBaseline(headroom, baseline) {
  const cameras = {};
  for (const [name, row] of Object.entries(headroom?.cameras ?? {})) {
    const before = baseline?.cameras?.[name]?.uncappedMedianFps;
    if (!finiteNumber(before) || before <= 0 || !finiteNumber(row.uncappedMedianFps)) continue;
    cameras[name] = { baselineFps: before, fps: row.uncappedMedianFps, ratio: roundTo(row.uncappedMedianFps / before, 3) };
  }
  const ratios = Object.values(cameras).map(row => row.ratio);
  return { cameras, worstRatio: ratios.length ? Math.min(...ratios) : null, definition: 'Uncapped median FPS of this run over the baseline run, per camera; below 1 is slower than the baseline.' };
}

export function headroomMarkdown(headroom, title = 'Headroom') {
  if (!headroom) return [`${title}: not measured (uncapped run skipped).`, ''];
  const value = n => finiteNumber(n) ? Number(n.toFixed(2)) : 'n/a';
  return [`${title} (uncapped, ${headroom.flags.join(' ')}): ${headroom.valid ? 'valid' : 'NOT VALID'}. Repainting-page control ${value(headroom.control.cappedFps)} FPS capped, ${value(headroom.control.uncappedFps)} FPS uncapped.`, '',
    ...headroom.gaps.map(gap => `- Headroom gap: ${gap}`), ...(headroom.gaps.length ? [''] : []),
    '| Camera | Capped median FPS | Uncapped median FPS | Uncapped p5 FPS | Headroom x60 | Frame cost ms | Uncapped p95 frame ms |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...Object.entries(headroom.cameras).map(([name, row]) => `| ${name} | ${value(row.cappedMedianFps)} | ${value(row.uncappedMedianFps)} | ${value(row.uncappedP5Fps)} | ${value(row.headroom)} | ${value(row.frameCostMs)} | ${value(row.uncappedFrameMs.p95)} |`), '',
    ...(headroom.vsBaseline ? [`Against the baseline run: ${Object.entries(headroom.vsBaseline.cameras).map(([name, row]) => `${name} ${row.fps} / ${row.baselineFps} = ${row.ratio}x`).join(', ') || 'no camera in common'}.`, ''] : [])];
}

// ---- The replay peak, the camera sweep and the first train -------------------------------------------------------------------------
// The first seconds of the recorded replay show one or two trains, which says little about a busy evening. The perf tool therefore
// scans the replay once at SCAN_SPEED for the stretch that keeps the most trains drawn (tools/replay-peak.mjs), serves the recording to
// its own Chrome restarted there, and measures every fixed station camera on it, in every cold/warm pair.

/**
 * The same-origin /relay route of the perf server, as `(req, res) => handled`. Everything is forwarded to the relay, except that while
 * `replayWindow.startMs` is set a GET of /relay/recording is answered with the recording restarted at that replay time (windowRecording),
 * so the page starts at the peak. The recording is held in memory only. A relay that is down, or answers anything but 200 for the
 * recording, is passed through as it is.
 */
export function createRelayRoute(relayBase, replayWindow = { startMs: null }) {
  return (req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname !== '/relay' && !requestUrl.pathname.startsWith('/relay/')) return false;
    const target = new URL(relayBase);
    target.pathname = `${target.pathname.replace(/\/$/, '')}${requestUrl.pathname.replace(/^\/relay(?=\/|$)/, '')}` || '/';
    target.search = requestUrl.search;
    const windowed = req.method === 'GET' && requestUrl.pathname === '/relay/recording' && replayWindow.startMs != null;
    const unavailable = () => { if (!res.headersSent) res.writeHead(502); res.end('relay unavailable'); };
    const relayRequest = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, {
      method: req.method,
      headers: { host: target.host, accept: req.headers.accept ?? '*/*' },
      timeout: 35_000,
    }, (relayResponse) => {
      if (!windowed || relayResponse.statusCode !== 200) {
        res.writeHead(relayResponse.statusCode ?? 502, relayResponse.headers);
        relayResponse.pipe(res);
        return;
      }
      const chunks = [];
      relayResponse.on('data', (chunk) => chunks.push(chunk));
      relayResponse.on('error', unavailable);
      relayResponse.on('end', () => {
        let body;
        try { body = Buffer.from(windowRecording(Buffer.concat(chunks).toString('utf8'), replayWindow.startMs).text); }
        catch { if (!res.headersSent) res.writeHead(502); res.end('recording could not be restarted at the peak'); return; }
        res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'content-length': body.length });
        res.end(body);
      });
    });
    relayRequest.on('timeout', () => relayRequest.destroy(new Error('relay request timed out')));
    relayRequest.on('error', unavailable);
    req.pipe(relayRequest);
    return true;
  };
}

/**
 * The "first train visible" figure: navigation start to the first draw of a replay train mesh, on the cold load and on the warm second load
 * of the same profile. `warm.ms` is the headline. On a replay restarted at its peak the trains are in their berths from the first
 * frame, so the time is the page's own work; on an unrestarted replay it also waits for the recording's first train
 * (`waitForRecordedTravelMs`), which says nothing about the page.
 */
export function firstTrainVisible(startup, peak) {
  const pick = timing => timing ? {
    ms: timing.navigationStartToReplayTrainsRenderedMs ?? null, sceneRenderedMs: timing.navigationStartToSceneRenderedMs ?? null,
    afterSceneMs: timing.phases?.sceneToFirstTrainMs ?? null, trainDrawsAtFirstRender: timing.replayTrainDrawsAtFirstRender ?? null,
    waitForRecordedTravelMs: timing.phases?.firstTrainContentDelayMs ?? null,
  } : null;
  return {
    startsAtPeak: peak?.mode === 'scan' || peak?.mode === 'given', cold: pick(startup?.coldFreshProfile), warm: pick(startup?.warmSecondLoadSameProfile),
    definition: 'Milliseconds from navigation start to the first draw of a train mesh in replay mode, on the fresh-profile load (cold) and on the second load of the same profile with the HTTP cache (warm). Draw submission, not display. When the replay starts at its peak the page is given the trains in their berths, as a live connection gives them, so the figure is the page\'s own work; otherwise it also includes the wait for the recording\'s first train (waitForRecordedTravelMs).',
  };
}

const fixed = (n, digits = 1) => finiteNumber(n) ? Number(n.toFixed(digits)) : 'n/a';

/** The replay peak as Markdown lines. */
export function peakMarkdown(peak) {
  if (!peak || peak.mode === 'none') return ['Replay peak: not used; the replay starts at the beginning of the recording.', ''];
  const trains = `trains drawn in the window min ${fixed(peak.minShown, 0)}, median ${fixed(peak.medianShown, 0)}, max ${fixed(peak.maxShown, 0)}; a camera counts as busy at a median of ${fixed(peak.busyFloor, 0)} or more`;
  return [`Replay peak (${peak.mode === 'scan' ? `scanned at ${peak.scan?.speed}x` : `given by ${peak.from ?? '--peak-start'}`}): the replay starts at ${peak.startISO} (clock ${peak.startMs}), restarted from a snapshot of the trains in their berths; the window is ${fixed(peak.windowMs / 60000)} minutes of replay; ${trains}.`,
    ...(peak.scan ? [`The scan saw at most ${peak.scan.maxShown} trains drawn, at ${peak.scan.maxShownISO}, over ${peak.scan.samples} samples of a recording from ${peak.scan.firstISO} to ${peak.scan.lastISO}.`] : []), ''];
}

/** One pair's station sweep as Markdown lines: a row per fixed station camera. */
export function sweepMarkdown(stationCameras, summary, title = 'Fixed station cameras at the replay peak') {
  const rows = Object.entries(stationCameras ?? {});
  if (!rows.length) return [`${title}: not measured.`, ''];
  const yes = flag => flag === true ? 'yes' : flag === false ? 'NO' : 'n/a';
  return [`${title}: ${summary.steadyAt60} of ${summary.cameras} cameras steady at 60 FPS (median second >= 60 and at most 1% of frames later than 20 ms); ${summary.busy} of ${summary.cameras} measured at the peak (median trains drawn at or above the busy floor).`, '',
    '| Camera | Trains drawn (min/median/max) | Median FPS | p5 FPS | Frame ms p50 | p95 | p99 | max | Slow frames % | Missed slots | Steady 60 | At peak |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ...rows.map(([name, c]) => `| ${name}${c.view?.grid ? ' (grid view)' : ''} | ${c.trainsShown.min}/${c.trainsShown.median}/${c.trainsShown.max} | ${fixed(c.fps.median, 0)} | ${fixed(c.fps.p5, 0)} | ${fixed(c.frameDistribution.p50)} | ${fixed(c.frameDistribution.p95)} | ${fixed(c.frameDistribution.p99)} | ${fixed(c.frameDistribution.max)} | ${fixed(c.frameDistribution.slowShare * 100, 2)} | ${c.frameDistribution.missedSlots} | ${yes(c.steady60)} | ${yes(c.busy)} |`), ''];
}

// ---- The scene: London (default) or Edinburgh Waverley -------------------------------------------------------------------------------
export const PERF_SCENES = Object.freeze(['kings-cross', 'waverley']);
/** The frozen Waverley cameras measured: the whole station from above, and the roof from the North Bridge. Their poses are evidence.mjs's. */
export const WAVERLEY_PERF_VIEWS = Object.freeze(['wv-overview', 'wv-roof-from-north-bridge']);
/** London-only options: they feed the relay, the recording and the replay peak, which a Waverley run (trains=none) does not have. */
export const WAVERLEY_REFUSED_FLAGS = Object.freeze(['--relay', '--peak', '--peak-start', '--peak-from', '--stations', '--station-seconds', '--no-legacy-cameras', '--startup-only', '--scene-ready']);

/** `--scene` from the argument list: kings-cross when absent. Throws on a missing or unknown value, and on a London-only option beside waverley. */
export function sceneFrom(args) {
  const index = args.indexOf('--scene');
  if (index < 0) return 'kings-cross';
  const scene = args[index + 1];
  if (!PERF_SCENES.includes(scene)) throw new Error(`--scene must be ${PERF_SCENES.join(' or ')}`);
  if (scene === 'waverley') {
    const refused = WAVERLEY_REFUSED_FLAGS.filter((name) => args.includes(name));
    if (refused.length) throw new Error(`--scene waverley measures the two frozen Waverley cameras with no relay or recording; remove ${refused.join(', ')}`);
  }
  return scene;
}

/**
 * The Waverley cameras to measure, as perf's camera list wants them: the named frozen cameras of evidence.mjs (waverleyCameras, a copy of
 * FROZEN_WAVERLEY_CAMERAS), with the fov and near plane evidence.mjs shoots them at when the frozen camera gives none. Not copied here.
 */
export async function waverleyPerfCameras() {
  const { waverleyCameras } = await import('./evidence.mjs');
  const frozen = waverleyCameras();
  return WAVERLEY_PERF_VIEWS.map((name) => {
    const { pos, target, fov = 50, near = 0.1 } = frozen[name];
    return { name, pos, target, fov, near, waverley: true };
  });
}

async function selfTest() {
  assert.equal(extractTiming({ observation: { sceneRenderedMs: 5, replayTrainsRenderedMs: null, trainDraws: 0 } }), null);
  assert.equal(extractTiming({ observation: { sceneRenderedMs: 5, replayTrainsRenderedMs: 8, trainDraws: 2 }, firstFrameMs: 5 }).navigationStartToReplayTrainsRenderedMs, 8);
  assert.equal(extractTiming({ observation: { sceneRenderedMs: 2999, replayTrainsRenderedMs: 4000, trainDraws: 1 } }).sceneWithin3s, true);
  assert.equal(extractTiming({ observation: { sceneRenderedMs: 3000, replayTrainsRenderedMs: 4000, trainDraws: 1 } }).sceneWithin3s, false);
  const map = { sources: ['materials.ts', 'merge.ts'], names: ['texture'], mappings: 'AAAAA,UCAA;AACA' };
  const rows = decodeMappings(map);
  assert.equal(originalLocation(rows, 0, 9).source, 'materials.ts');
  assert.equal(originalLocation(rows, 0, 10).source, 'merge.ts');
  assert.equal(originalLocation(rows, 1, 0).originalLine, 1);
  assert.equal(originalLocation(decodeMappings({ ...map, mappings: 'AAAA,K' }), 0, 6), null);
  assert.throws(() => decodeMappings({ ...map, mappings: '!' }), /VLQ/);
  const profile = { nodes: [
    { id: 1, callFrame: { url: 'bundle.js', lineNumber: 0, columnNumber: 0, functionName: 'a' } },
    { id: 2, callFrame: { url: 'bundle.js', lineNumber: 0, columnNumber: 10, functionName: 'b' } },
    { id: 3, callFrame: { url: '', lineNumber: -1, columnNumber: -1, functionName: 'JSON.parse' } },
  ], samples: [1, 2, 1, 3], timeDeltas: [1000, 2000, 3000, 500] };
  const cpu = aggregateCpu(profile, new Map([['bundle.js', rows]]));
  assert.equal(cpu.sampledMs, 6.5);
  assert.deepEqual(cpu.byOriginalSourceFile.map((row) => [row.source, row.selfMs]), [['materials.ts', 4], ['merge.ts', 2], ['[runtime] JSON.parse', 0.5]]);
  assert.equal(cpu.byFunction[0].function, 'materials.ts:1 texture');
  // Execute the exact injected script against a fake renderer. Invisible trains never
  // invoke onAfterRender; a later frame does, including an object hooked in an earlier frame.
  let now = 12;
  const window = { fetch: async () => ({ status: 200, headers: { get: () => '4096' }, text: async () => { now = 20; return 'recording'; }, json: async () => ({ ok: true }) }) };
  const context = { window, performance: { now: () => now }, WeakSet };
  vm.runInNewContext(observerSource, context);
  let draw = false, opacity = 0;
  const mesh = { isMesh: true, material: { opacity: 0 }, onAfterRender() {} };
  const renderer = { info: { render: { frame: 0 } }, render() { this.info.render.frame++; if (draw) mesh.onAfterRender(null, null, null, null, { opacity }); } };
  window.__kx = { renderer, feed: { mode: 'replay', speed: 30, timeMs: 0 }, trains: [{ group: { traverse(callback) { callback(mesh); }, traverseVisible(callback) { callback(mesh); } } }] };
  renderer.render();
  assert.equal(window.__kxStartup.sceneRenderedMs, 12);
  assert.equal(window.__kxStartup.replayTrainsRenderedMs, null);
  draw = true; renderer.render();
  assert.equal(window.__kxStartup.replayTrainsRenderedMs, null, 'zero-alpha train draws are not visible trains');
  const motion = { apply() { return 7; }, advance() { return 8; } };
  window.__kx.motion = motion;
  assert.equal(motion.apply({}, 100000), 7);
  assert.equal(motion.advance(), 8);
  window.__kx.feed.connection = 'playing';
  window.__kx.motionState = [{ id: 'train' }];
  window.__kx.feed.timeMs = 0;
  assert.equal(window.__kxStartup.replayTimeOriginMs, 100000, 'initial status time zero must not replace first event origin');
  window.__kx.feed.timeMs = 100000;
  window.__kx.feed.timeMs = 100650;
  renderer.render();
  assert.equal(window.__kxStartup.firstMotionViewClockMs, 100650);
  assert.equal(window.__kxStartup.firstTrainGeometryReadyMs, undefined, 'zero-alpha mesh is not geometry ready');
  now = 14; draw = false; mesh.material.opacity = 1;
  window.__kx.feed.timeMs = 100933;
  renderer.render();
  assert.equal(window.__kxStartup.firstTrainGeometryReadyMs, 14);
  assert.equal(window.__kxStartup.replayTrainsRenderedMs, null, 'offscreen complete car is ready before a frustum draw');
  now = 18; opacity = 1; draw = true; window.__kx.feed.timeMs = 104616;
  renderer.render();
  assert.equal(window.__kxStartup.replayTrainsRenderedMs, 18);
  assert.equal(window.__kxStartup.trainDraws, 1);
  assert.equal(renderer.render.name, 'render');
  assert.equal(mesh.onAfterRender.name, 'onAfterRender');
  assert.equal(originalLocation(decodeMappings({ ...map, sourceRoot: '/src' }), 0, 0).source, '/src/materials.ts');
  const response = await window.fetch('/relay/recording?date=20261107');
  assert.equal(await response.text(), 'recording');
  const fetchRow = window.__kxStartup.fetches[0];
  assert.equal(fetchRow.url, '/relay/recording?date=20261107');
  assert.equal(fetchRow.headersMs, 18);
  assert.equal(fetchRow.textEndMs, 20);
  assert.equal(fetchRow.contentLengthBytes, 4096);
  const timing = extractTiming({ observation: window.__kxStartup, marks: [
    { name: 'kx:recording-parse-start', startMs: 6 }, { name: 'kx:recording-parse-end', startMs: 9 } ] });
  assert.equal(timing.phases.recordingParseMs, 3);
  assert.equal(timing.fetches[0].phase, 'recording');
  assert.equal(timing.fetches[0].bodyReadMs, 2);
  assert.equal(timing.fetches[0].totalMs, 2);
  const headersOnly = extractTiming({ observation: { ...window.__kxStartup, fetches: [{ url: '/relay/schedule', status: 404, startMs: 1, headersMs: 4 }] } });
  assert.equal(headersOnly.fetches[0].totalMs, 3, 'an absent timetable finishes awaiting at headers even when its body is unused');
  assert.equal(headersOnly.fetches[0].measuredThrough, 'headers');
  assert.equal(timing.phases.geometryToFrustumDrawMs, 4);
  assert.equal(timing.phases.firstTrainContentDelayMs, 4616 / 30);
  assert.equal(timing.phases.nonReplayElapsedToFirstTrainMs, 18 - 4616 / 30);
  assert.equal(timing.phases.firstMotionViewSimOffsetMs, 650);
  assert.equal(timing.phases.firstTrainGeometryReadySimOffsetMs, 933);
  assert.equal(timing.phases.firstTrainRenderSimOffsetMs, 4616);
  assert.equal(timing.phases.firstMotionAdvanceMs, 12);
  assert.equal(timing.phases.firstMotionApplyMs, 12);
  assert.equal(timing.phases.firstMotionViewMs, 12);
  assert.equal(timing.phases.replayClockStartedMs, 12);
  const phaseMarkdown = startupPhaseMarkdown({ coldFreshProfile: timing, warmSecondLoadSameProfile: timing }).join('\n');
  assert.match(phaseMarkdown, /Geometry → frustum draw duration \| 4 \| 4/);
  assert.match(phaseMarkdown, /Draw simulation offset \| 4616 \| 4616/);
  assert.equal(markDuration([], 'a', 'b'), null);
  const requests = [], errors = [];
  captureNetwork({ method: 'Network.requestWillBeSent', params: { requestId: 'a', timestamp: 1, request: { url: 'http://test/missing.svg' } } }, requests, errors);
  captureNetwork({ method: 'Network.responseReceived', params: { requestId: 'a', timestamp: 2, response: { status: 404 } } }, requests, errors);
  captureNetwork({ method: 'Network.loadingFinished', params: { requestId: 'a', timestamp: 3, encodedDataLength: 80 } }, requests, errors);
  captureNetwork({ method: 'Network.requestWillBeSent', params: { requestId: 'b', timestamp: 4, request: { url: 'http://test/unreachable' } } }, requests, errors);
  captureNetwork({ method: 'Network.loadingFailed', params: { requestId: 'b', timestamp: 5, errorText: 'net::ERR_FAILED' } }, requests, errors);
  captureNetwork({ method: 'Log.entryAdded', params: { entry: { level: 'error', text: 'missing', url: 'http://test/missing.svg' } } }, requests, errors);
  assert.deepEqual(requestSummary(requests).failedUrls, ['http://test/missing.svg', 'http://test/unreachable']);
  assert.equal(requestSummary(requests).failedCount, 2);
  assert.equal(requests[0].encodedDataBytes, 80);
  assert.equal(requests[1].error, 'net::ERR_FAILED');
  assert.equal(errors[0], 'log: missing URL: http://test/missing.svg');
  console.log('perf self-test passed: timing phases, fetch body timing, request failure URLs, source-map boundaries, CPU self time, actual-train draw observer');
}
// Import the pure profile helpers in Node tests without starting Chrome.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
if (process.argv.includes('--self-test')) { await selfTest(); process.exit(0); }

const args = process.argv.slice(2);
const scene = sceneFrom(args);
const waverley = scene === 'waverley';
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const dist = path.resolve(flag('--dist', path.join(repoRoot, '.scratch', 'perf-dist')));
const out = path.resolve(flag('--out', path.join(repoRoot, '.scratch', 'round12-perf')));
const seconds = Number(flag('--seconds', '60'));
// The headroom run needs a throughput, not a long soak: 20 s of per-second buckets unless told otherwise.
const uncappedSeconds = Number(flag('--uncapped-seconds', String(Math.min(seconds, 20))));
// The sweep of every fixed station camera: a short window each, since there are many; --stations none leaves only overview and shed.
const stationSeconds = Number(flag('--station-seconds', '5'));
const stationsSpec = flag('--stations', 'all');
const legacyCameras = !args.includes('--no-legacy-cameras');
// Where the replay starts. auto: scan the recording for its busiest stretch. none: the recording's first row (a few trains).
// --peak-start <replay clock ms> or --peak-from <earlier perf report> fix the start, so every pair measures the same minutes.
const peakMode = flag('--peak', 'auto');
const peakStartFlag = flag('--peak-start');
const peakFromPath = flag('--peak-from');
// The scene pin (tools/scene-pin.mjs): a page that reads ?time and ?weather shows the same sky every run and asks for no weather.
const pin = scenePinFrom({ time: flag('--time'), weather: flag('--weather'), sky: flag('--sky') });
const headroomBaselinePath = flag('--headroom-baseline');
const headroomBaseline = headroomBaselinePath ? JSON.parse(await readFile(path.resolve(headroomBaselinePath), 'utf8')) : null;
if (headroomBaseline && !headroomBaseline.headroom?.cameras) throw new Error('--headroom-baseline must be an earlier perf report that has a headroom section');
const relayBase = new URL(flag('--relay', 'http://127.0.0.1:8787'));
const replayDate = '20261107';
const replaySpeed = 30;
const viewport = { width: 1280, height: 800 };
const cameras = {
  overview: { pos: [260, 220, 90], target: [45, 5, -140] },
  shed: { pos: [48, 7.5, -16], target: [52, 6, -160] },
};

if (!Number.isFinite(seconds) || seconds < 1 || seconds > 300) {
  throw new Error('--seconds must be between 1 and 300');
}
if (!Number.isFinite(uncappedSeconds) || uncappedSeconds < 1 || uncappedSeconds > 300) {
  throw new Error('--uncapped-seconds must be between 1 and 300');
}
if (!Number.isFinite(stationSeconds) || stationSeconds < 1 || stationSeconds > 60) throw new Error('--station-seconds must be between 1 and 60');
if (!['auto', 'none'].includes(peakMode)) throw new Error('--peak must be auto or none');
if (peakMode === 'none' && (peakStartFlag || peakFromPath)) throw new Error('--peak none cannot be combined with --peak-start or --peak-from');
if (peakStartFlag && peakFromPath) throw new Error('--peak-start and --peak-from fix the same thing: give one');
if (peakStartFlag !== undefined && !(Number(peakStartFlag) >= 0 && Number.isFinite(Number(peakStartFlag)))) throw new Error('--peak-start must be a replay clock time in epoch milliseconds');
if (!legacyCameras && stationsSpec === 'none' && !args.includes('--startup-only')) throw new Error('nothing to measure: --no-legacy-cameras with --stations none (use --startup-only for startup timing alone)');
const peakFrom = peakFromPath ? JSON.parse(await readFile(path.resolve(peakFromPath), 'utf8')).replayPeak : null;
if (peakFromPath && !(peakFrom?.startMs >= 0)) throw new Error('--peak-from must be an earlier perf report with a replayPeak section');
if (relayBase.protocol !== 'http:' && relayBase.protocol !== 'https:') {
  throw new Error('--relay must use http or https');
}
if (relayBase.username || relayBase.password) throw new Error('--relay must not contain credentials');
await stat(dist).catch(() => { throw new Error(`built page not found at ${dist}; build it before running perf`); });
await mkdir(out, { recursive: true });

const chromeCandidates = [flag('--chrome'), process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
let chromeBin;
for (const candidate of chromeCandidates) {
  try { await stat(candidate); chromeBin = candidate; break; } catch { /* try next candidate */ }
}
if (!chromeBin && !args.includes('--check-build')) throw new Error('no Chrome found; pass --chrome or set CHROME_PATH');

const MIME = {
  '.css': 'text/css', '.html': 'text/html', '.ico': 'image/x-icon', '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg', '.js': 'text/javascript', '.json': 'application/json', '.map': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};
const safeFile = async (root, pathname) => {
  const decoded = decodeURIComponent(pathname);
  const file = path.resolve(root, `.${decoded.startsWith('/') ? decoded : `/${decoded}`}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return null;
  try { return { body: await readFile(file), type: MIME[path.extname(file)] ?? 'application/octet-stream' }; }
  catch { return null; }
};

let staticServer;
let chrome;
let profile;
let cleanupPromise;
let chromeStdout = '';
let chromeStderr = '';
const consoleErrors = [];
const networkRequests = [];
const serverRequests = [];
const walk = async (dir) => {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
};
const buildFiles = (await walk(dist)).sort();
const buildEntries = await Promise.all(buildFiles.map(async (file) => {
  const [body, info] = await Promise.all([readFile(file), stat(file)]);
  return { file: path.relative(dist, file), bytes: body.length, gzipBytes: gzipSync(body).length, sha256: createHash('sha256').update(body).digest('hex'), modifiedAt: info.mtime.toISOString() };
}));
const decodedBuildMaps = new Map();
const buildScripts = await Promise.all(buildEntries.filter((entry) => entry.file.endsWith('.js')).map(async (entry) => {
  let map = null;
  try { map = JSON.parse(await readFile(path.join(dist, `${entry.file}.map`), 'utf8')); } catch { /* a refusal or a facade, decided below */ }
  return { file: entry.file, map, mapped: map !== null, declared: (await readFile(path.join(dist, entry.file), 'utf8')).includes('sourceMappingURL=') };
}));
const sourceMapChoice = sourceMapPlan(buildScripts);
if (sourceMapChoice.missing.length) throw new Error(`CPU profiling requires source maps: rebuild with --sourcemap (missing/invalid ${path.join(dist, `${sourceMapChoice.missing[0]}.map`)})`);
for (const script of buildScripts) if (script.mapped) decodedBuildMaps.set(script.file.split(path.sep).join('/'), decodeMappings(script.map));
const report = {
  when: new Date().toISOString(),
  machine: `${os.type()} ${os.release()}, ${os.cpus()[0]?.model ?? 'unknown cpu'} x${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB`,
  chrome: chromeBin,
  cdpTransport: 'Chrome remote debugging pipe (file descriptors 3/4)',
  requestedGpu: 'ANGLE Metal (--use-angle=metal --enable-gpu-rasterization)',
  build: {
    dist,
    newestFileTime: buildEntries.reduce((newest, file) => Math.max(newest, Date.parse(file.modifiedAt)), 0),
    totalBytes: buildEntries.reduce((sum, file) => sum + file.bytes, 0),
    files: buildEntries,
    gzipBundleBytes: buildEntries.filter((file) => /\.(js|css)$/.test(file.file)).reduce((sum, file) => sum + file.gzipBytes, 0),
    gzipShippedBytes: buildEntries.filter((file) => !file.file.endsWith('.map')).reduce((sum, file) => sum + file.gzipBytes, 0),
    gzipBudgetBytes: 2_000_000,
    scriptsWithoutSourceMap: sourceMapChoice.facades,
  },
  ...(waverley
    ? { scene: 'edinburgh-waverley', trains: 'none', relay: null, secondsPerCamera: seconds, warmupSeconds: 2 }
    : { replay: { date: replayDate, speed: replaySpeed, relay: relayBase.origin, warmupSeconds: 2, secondsPerCamera: seconds, stationSecondsPerCamera: stationSeconds } }),
  scenePin: { ...pin, parameters: pinParameters(pin), note: 'Added to every page address. A page built before the sky and weather work ignores it; a page that reads it shows this clock and weather and requests none.' },
  viewport,
  frameBudgetMs: 1000 / 60,
  cameras: {},
  consoleErrors, networkRequests, serverRequests,
};
report.build.gzipBundleWithinBudget = report.build.gzipBundleBytes < report.build.gzipBudgetBytes;
report.build.newestFileTime = report.build.newestFileTime ? new Date(report.build.newestFileTime).toISOString() : null;
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
if (args.includes('--check-build')) {
  const sourceFiles = new Set();
  for (const rows of decodedBuildMaps.values()) for (const row of rows) for (const segment of row) if (segment.source) sourceFiles.add(segment.source);
  const result = { mode: 'Node build preflight; Chrome not launched', build: report.build,
    sourceMaps: { files: decodedBuildMaps.size, originalSourceFiles: sourceFiles.size, scriptsWithoutSourceMap: sourceMapChoice.facades },
    startup: 'Not measured; run without --check-build on the GPU host.' };
  await writeFile(path.join(out, 'build-preflight.json'), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(path.join(out, 'build-preflight.md'), `# Performance build preflight\n\nJS/CSS gzip: ${report.build.gzipBundleBytes} / ${report.build.gzipBudgetBytes} bytes (${report.build.gzipBundleWithinBudget ? 'PASS' : 'FAIL'}).\n\n${decodedBuildMaps.size} source maps decoded; ${sourceFiles.size} original source files. First-render, CPU and FPS measurements require the Chrome run.\n`);
  console.log(JSON.stringify({ ...result, build: { ...report.build, files: undefined } }, null, 2));
  process.exit(report.build.gzipBundleWithinBudget ? 0 : 1);
}
// The fixed station cameras (evidence.mjs), loaded only for a run that measures them: the evidence module is heavy and a startup-only run needs none of it.
let stationList = [];
if (!waverley && !args.includes('--startup-only') && stationsSpec !== 'none') {
  const { stationCameras } = await import('./evidence.mjs');
  const { stationData } = await import('./station-scene.mjs');
  stationList = sweepCameraList(stationCameras(stationData().data), stationsSpec).map((camera) => ({ ...camera, station: true }));
}
// The camera sets in the order they are measured: the two axis 8 cameras at --seconds, then every station camera at --station-seconds.
// (--scene waverley: its two frozen cameras take the place of the two axis 8 cameras, at --seconds; there are no station cameras.)
const legacyList = waverley ? await waverleyPerfCameras()
  : legacyCameras && !args.includes('--startup-only') ? Object.entries(cameras).map(([name, camera]) => ({ name, ...camera })) : [];
const waverleyEvidence = waverley ? await import('./evidence.mjs') : null;
// How much replay one camera's page load can cover: the load, the two settling seconds and its window, at the replay speed. The peak must hold that long.
const peakWindowMs = (8 + 2 + Math.max(5, legacyList.length ? seconds : 0, stationList.length ? stationSeconds : 0)) * 1000 * replaySpeed;
const replayWindow = { startMs: null };
const relayRoute = waverley ? () => false : createRelayRoute(relayBase, replayWindow); // Waverley: nothing is forwarded, so a /relay request is a 404 and is reported
const cleanup = () => {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    if (chrome?.pid) {
      try { process.kill(-chrome.pid, 'SIGTERM'); } catch { /* already exited */ }
      await Promise.race([
        new Promise((resolve) => chrome.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* process tree is gone */ }
    }
    if (staticServer?.listening) {
      const closed = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 1500);
        staticServer.close(() => { clearTimeout(timer); resolve(true); });
      });
      if (!await closed) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 1500);
          staticServer.once('close', () => { clearTimeout(timer); resolve(); });
          staticServer.closeAllConnections?.();
        });
      }
    }
    if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
  })();
  return cleanupPromise;
};
process.once('SIGINT', () => { void cleanup().finally(() => process.exit(130)); });
process.once('SIGTERM', () => { void cleanup().finally(() => process.exit(143)); });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rounded = (n, digits = 2) => n == null ? null : Number(n.toFixed(digits));

try {
  staticServer = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const requestRow = { url: req.url ?? '/', startMs: Date.now() };
    serverRequests.push(requestRow);
    res.once('finish', () => Object.assign(requestRow, { endMs: Date.now(), status: res.statusCode }));
    if (relayRoute(req, res)) return;
    let hit = null;
    try {
      if (requestUrl.pathname === '/' || requestUrl.pathname === '/kings-cross' || requestUrl.pathname === '/kings-cross/') {
        hit = await safeFile(dist, '/index.html');
      } else if (requestUrl.pathname === '/almanac-back.js') {
        hit = await safeFile(repoRoot, '/almanac-back.js');
      } else if (requestUrl.pathname.startsWith('/kings-cross/')) {
        hit = await safeFile(dist, requestUrl.pathname.slice('/kings-cross'.length));
      }
    } catch { /* malformed path */ }
    if (!hit) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': hit.type, 'content-length': hit.body.length, 'cache-control': 'public, max-age=3600' }).end(hit.body);
  });
  await new Promise((resolve, reject) => {
    staticServer.once('error', reject);
    staticServer.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${staticServer.address().port}`;

  // One Chrome session: a fresh profile and browser on a CDP pipe, the page domains enabled. The capped measurements and the startup
  // timings use the first; the headroom run closes it and opens a second with UNCAPPED_FLAGS (flags only apply at launch).
  const openSession = async (extraFlags = []) => {
    profile = await mkdtemp(path.join(out, 'chrome-profile-'));
    chrome = spawn(chromeBin, [
      '--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`,
      `--disk-cache-dir=${path.join(profile, 'cache')}`,
      '--no-sandbox', '--no-first-run', '--mute-audio', '--ignore-gpu-blocklist', '--enable-logging=stderr',
      '--disable-breakpad', '--disable-crash-reporter', '--noerrdialogs', '--use-mock-keychain', '--password-store=basic',
      '--use-angle=metal', '--enable-gpu-rasterization', ...extraFlags, 'about:blank',
    ], { detached: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] });
    let chromeSpawnError;
    chrome.stdout.setEncoding('utf8');
    chrome.stdout.on('data', (chunk) => { chromeStdout = `${chromeStdout}${chunk}`.slice(-2000); });
    chrome.stderr.setEncoding('utf8');
    chrome.stderr.on('data', (chunk) => { chromeStderr = `${chromeStderr}${chunk}`.slice(-4000); });
    chrome.once('error', (error) => { chromeSpawnError = error; });
    const pipeWriter = chrome.stdio[3];
    const pipeReader = chrome.stdio[4];
    if (!pipeWriter || !pipeReader) throw new Error('Chrome CDP pipe file descriptors were not created');
    let nextId = 0;
    const pending = new Map();
    const onMessage = (message) => {
      captureNetwork(message, networkRequests, consoleErrors);
      if (message.id && pending.has(message.id)) {
        const item = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(item.timer);
        if (message.error) item.reject(new Error(message.error.message ?? 'CDP command failed'));
        else item.resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        consoleErrors.push(`exception: ${details.text} ${details.exception?.description ?? ''}`.trim());
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(`console.error: ${message.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
      }
    };
    let pipeBuffer = '';
    pipeReader.setEncoding('utf8');
    pipeReader.on('data', (chunk) => {
      pipeBuffer += chunk;
      let end;
      while ((end = pipeBuffer.indexOf('\0')) >= 0) {
        const raw = pipeBuffer.slice(0, end);
        pipeBuffer = pipeBuffer.slice(end + 1);
        try { onMessage(JSON.parse(raw)); } catch { /* ignore non-protocol chunks */ }
      }
    });
    pipeReader.on('error', (error) => {
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
      pending.clear();
    });
    chrome.once('exit', (code, signal) => {
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(`Chrome exited during CDP (code ${code}, signal ${signal})\n${chromeStdout}${chromeStderr}`)); }
      pending.clear();
    });
    const send = (method, params = {}, sessionId, timeoutMs = 10_000) => new Promise((resolve, reject) => {
      if (chromeSpawnError) { reject(chromeSpawnError); return; }
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      pipeWriter.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    });
    await send('Browser.getVersion', {}, undefined, 12_000).catch((error) => {
      throw new Error(`${error.message}${chromeStderr ? `\n${chromeStderr}` : ''}`);
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (method, params, timeoutMs) => send(method, params, sessionId, timeoutMs);
    await S('Page.enable');
    await S('Runtime.enable');
    await S('Log.enable');
    await S('Network.enable');
    await S('Network.setCacheDisabled', { cacheDisabled: false });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: observerSource });
    await S('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
    // As evidence.mjs --scene waverley: reduced motion makes the station switch swap scenes at once, so no flight moves a posed camera.
    if (waverley) await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await S('Page.bringToFront');
    const evaluate = async (expression, timeoutMs = 10_000) => {
      const result = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
      if (result.exceptionDetails) throw new Error(`page evaluation failed: ${result.exceptionDetails.text}`);
      return result.result.value;
    };
    return { send, S, evaluate };
  };
  const closeSession = async () => {
    if (chrome?.pid) {
      try { process.kill(-chrome.pid, 'SIGTERM'); } catch { /* already exited */ }
      await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), delay(1500)]);
      try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* process tree is gone */ }
    }
    if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
    chrome = undefined;
    profile = undefined;
  };
  // Every page load carries the scene pin (tools/scene-pin.mjs), so the sky and weather are the same in every run and the page asks for no weather.
  const replayQuery = withPin(`?trains=replay&date=${replayDate}&speed=${replaySpeed}`, pin);
  // Waverley: the address evidence.mjs --scene waverley loads (the Edinburgh scene, no trains, no board or tooltip), pinned the same way.
  const waverleyQuery = waverley ? waverleyEvidence.waverleyAddress(pin) : null;
  const freshNavigationFor = ({ S, evaluate }) => async (url, beforeNavigate = async () => {}) => {
    await S('Page.navigate', { url: 'about:blank' });
    // Wait for the blank document to commit before requesting a fresh navigation.
    const blankDeadline = Date.now() + 5000;
    while (await evaluate('location.href').catch(() => null) !== 'about:blank') {
      if (Date.now() > blankDeadline) throw new Error('about:blank did not commit');
      await delay(25);
    }
    await beforeNavigate();
    await S('Page.navigate', { url });
  };
  // Waits for the replay page to be playing; returns what the page said. The camera sweeps and the peak scan share it.
  const awaitReplayPage = async (evaluate, label) => {
    const readyDeadline = Date.now() + 35_000;
    let pageState;
    while (Date.now() < readyDeadline) {
      pageState = await evaluate(`(() => {
        const k = window.__kx;
        if (!k?.ready) return null;
        return { firstFrameMs: k.firstFrameMs, mode: k.feed.mode, date: k.feed.date, speed: k.feed.speed, connection: k.feed.connection };
      })()`).catch(() => null);
      if (pageState?.firstFrameMs > 0 && pageState.mode === 'replay' && ['playing', 'recording ended'].includes(pageState.connection)) return pageState;
      await delay(150);
    }
    throw new Error(`${label}: replay page did not start within 35 seconds (${pageState?.connection ?? 'page not ready'})`);
  };

  // Waits for the Edinburgh Waverley scene to be loaded and on show, switching to it the way evidence.mjs --scene waverley does.
  const awaitWaverleyPage = async (evaluate) => {
    const waitFor = async (expression, timeoutMs, label) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await evaluate(expression).catch(() => false)) return;
        await delay(100);
      }
      throw new Error(`Waverley page: ${label} within ${timeoutMs / 1000} seconds`);
    };
    await waitFor('!!window.__kx?.ready', 60_000, 'the page was not ready');
    await evaluate(waverleyEvidence.WAVERLEY_SELECT_SCRIPT, 90_000);
    await waitFor(waverleyEvidence.WAVERLEY_READY_CONDITION, 120_000, 'the Edinburgh Waverley scene was not on show');
  };

  // The replay peak. One scan load of the whole recording at SCAN_SPEED, in a Chrome of its own that is closed before the measured one opens
  // (a scan in the measured profile would warm its cache and spoil the cold load), counting the trains drawn as the replay clock runs.
  const SCAN_TIMEOUT_MS = 240_000;
  const scanReplay = async (scanSession) => {
    await freshNavigationFor(scanSession)(`${base}/kings-cross/${withPin(`?trains=replay&date=${replayDate}&speed=${SCAN_SPEED}`, pin)}`);
    await awaitReplayPage(scanSession.evaluate, 'replay scan');
    const samples = [], deadline = Date.now() + SCAN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const state = await scanSession.evaluate(`(() => {
        const k = window.__kx, trains = k.trains ?? [];
        return { clockMs: k.feed.timeMs ?? null, connection: k.feed.connection,
          shown: trains.filter((train) => train.group?.visible && train.group.children.some((car) => car.visible)).length };
      })()`);
      if (state.clockMs > 0) samples.push({ clockMs: state.clockMs, shown: state.shown });
      if (state.connection === 'recording ended') return samples;
      await delay(250);
    }
    throw new Error(`the replay did not reach the end of the recording within ${SCAN_TIMEOUT_MS / 1000} s at ${SCAN_SPEED}x; give the peak with --peak-start`);
  };
  const resolvePeak = async () => {
    if (peakMode === 'none') return { mode: 'none' };
    if (peakStartFlag !== undefined || peakFrom) {
      const startMs = peakFrom ? peakFrom.startMs : Number(peakStartFlag);
      replayWindow.startMs = startMs;
      return { mode: 'given', from: peakFrom ? peakFromPath : '--peak-start', startMs, startISO: new Date(startMs).toISOString(), windowMs: peakWindowMs,
        busyFloor: peakFrom?.busyFloor ?? null, minShown: peakFrom?.minShown ?? null, medianShown: peakFrom?.medianShown ?? null, maxShown: peakFrom?.maxShown ?? null };
    }
    const scanSession = await openSession();
    let samples;
    try { samples = await scanReplay(scanSession); } finally { await closeSession(); }
    const window = peakWindow(samples, peakWindowMs);
    if (!window) throw new Error('the replay scan saw no clock time');
    replayWindow.startMs = window.startMs;
    const iso = (ms) => new Date(ms).toISOString();
    const top = samples.reduce((best, sample) => sample.shown > best.shown ? sample : best, samples[0]);
    const thin = Math.ceil(samples.length / 300);
    return { mode: 'scan', ...window, startISO: iso(window.startMs), endISO: iso(window.endMs),
      scan: { speed: SCAN_SPEED, samples: samples.length, firstMs: samples[0].clockMs, lastMs: samples.at(-1).clockMs, firstISO: iso(samples[0].clockMs), lastISO: iso(samples.at(-1).clockMs),
        maxShown: top.shown, maxShownAtMs: top.clockMs, maxShownISO: iso(top.clockMs), seriesClockShown: samples.filter((_, i) => i % thin === 0).map((sample) => [sample.clockMs, sample.shown]) } };
  };
  report.replayPeak = waverley ? { mode: 'none' } : await resolvePeak();
  if (!waverley) console.log(JSON.stringify({ replayPeak: { ...report.replayPeak, scan: report.replayPeak.scan && { ...report.replayPeak.scan, seriesClockShown: undefined } } }, null, 2));

  const session = await openSession();
  const { send, S, evaluate } = session;
  report.chromeVersion = await send('Browser.getVersion');
  // Frames per second of a blank page: the browser's own ceiling, which the camera figures are read against.
  const rafControl = (run) => run(`new Promise((resolve) => {
    const buckets = [0, 0]; let start, frames = 0;
    const frame = (now) => {
      if (start === undefined) start = now;
      const elapsed = now - start;
      if (elapsed >= 2000) {
        const sorted = [...buckets].sort((a, b) => a - b);
        resolve({ durationMs: elapsed, frames, buckets, medianFps: (sorted[0] + sorted[1]) / 2, p5Fps: sorted[0], visibility: document.visibilityState, focused: document.hasFocus() });
        return;
      }
      buckets[Math.min(1, Math.floor(elapsed / 1000))]++;
      frames++;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  })`, 8000);
  report.rafControl = await rafControl(evaluate);
  // A blank page forces no draw, so Chrome may hold its frames to the display rate whatever the flags say (the uncapped blank page
  // above read 57 FPS while the scene reached 438). This control repaints a small canvas every frame, so it runs at the frame limit
  // when the limit is on and far above it when the flags lift it: the headroom run is valid only if it does.
  const paintControl = (run) => run(`new Promise((resolve) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0' });
    document.body.append(canvas);
    const context = canvas.getContext('2d');
    const buckets = [0, 0]; let start, frames = 0;
    const frame = (now) => {
      if (start === undefined) start = now;
      const elapsed = now - start;
      if (elapsed >= 2000) {
        canvas.remove();
        const sorted = [...buckets].sort((a, b) => a - b);
        resolve({ durationMs: elapsed, frames, buckets, medianFps: (sorted[0] + sorted[1]) / 2, p5Fps: sorted[0] });
        return;
      }
      context.fillStyle = frames % 2 ? '#fff' : '#000';
      context.fillRect(0, 0, 64, 64);
      buckets[Math.min(1, Math.floor(elapsed / 1000))]++;
      frames++;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  })`, 8000);
  report.paintControl = await paintControl(evaluate);

  const startupUrl = `${base}/kings-cross/${replayQuery}`;
  const freshNavigation = freshNavigationFor(session);
  const startupLoad = async (profileCpu = false) => {
    let networkStart, serverStart;
    await freshNavigation(startupUrl, async () => {
      networkStart = networkRequests.length; serverStart = serverRequests.length;
      if (profileCpu) await S('Profiler.start');
    });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const state = await evaluate(`(() => {
        const k = window.__kx;
        if (!k) return null;
        const nav = performance.getEntriesByType('navigation')[0];
        return { observation: window.__kxStartup, firstFrameMs: k.firstFrameMs,
          navigation: nav ? { type: nav.type } : null,
          marks: performance.getEntriesByType('mark').filter(m => m.name.startsWith('kx:')).map(m => ({ name: m.name, startMs: m.startTime })),
          resources: performance.getEntriesByType('resource').filter(r => /\\.(js|css)(?:$|\\?)/.test(r.name)).map(r => ({
            path: new URL(r.name).pathname, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, durationMs: r.duration })) };
      })()`).catch(() => null);
      const timing = extractTiming(state);
      if (timing && (!args.includes('--scene-ready') || timing.navigationStartToFullSceneRenderedMs > 0)) {
        timing.networkRequests = networkRequests.slice(networkStart).map((row) => ({ ...row }));
        timing.serverRequests = serverRequests.slice(serverStart).map((row) => ({ ...row }));
        timing.requests = requestSummary(timing.networkRequests);
        return timing;
      }
      await delay(100);
    }
    throw new Error('Startup scene and actual replay train draws not observed within 60 seconds');
  };
  // Startup timing needs the London replay's first train; a Waverley run (trains=none) measures frame rate only.
  if (!waverley) {
    report.startup = {
      method: 'Three separate navigations: fresh Chrome profile cold load, same-profile second load with HTTP cache enabled, then an instrumented CPU profile load. Timings exclude the CPU profiler.',
      phaseDefinition: 'Navigation-relative wall milliseconds. Fetch start/headers and text/json body consumption include async waiting; measuredThrough identifies body completion, failure, or headers when the body is unused. Recorded travel at speed is simulation offset divided by replay speed; the remaining elapsed time includes setup and rendering and is not a CPU duration. ResourceTiming supplies transferred bytes and response end. Replay clock start is the first playing/recording-ended status during initial dispatch; motion apply/advance are sink entry, first motion view is sampled immediately before render. Geometry-ready requires a mesh under visible train/car ancestors with a visible nonzero-alpha material, independent of camera frustum; cars become visible only when complete. Simulation offsets use the first applied replay event timestamp as origin (initial playing status occurs before main assigns the feed); positive status time is a fallback. Geometry-to-draw is a wall interval, including travel toward the initial camera. Parse duration uses optional kx:recording-parse-start/end marks; null means unavailable. CDP request timestamps are monotonic seconds; server timestamps are Unix milliseconds. No response bodies or headers saved.',
      timingDefinition: 'performance.now() after renderer.render returns; milliseconds since navigation start. First replay train requires a mesh onAfterRender callback in replay mode.',
      limitations: 'Draw submission completion, not GPU completion or display presentation. Browser/OS filesystem caches are not flushed. Cold and warm replay availability includes local relay latency. Observer callbacks add small overhead to both timing loads. No claim of equal replay snapshots across loads.',
    };
    report.startup.coldFreshProfile = await startupLoad();
    report.startup.warmSecondLoadSameProfile = await startupLoad();
    await S('Profiler.enable');
    await S('Profiler.setSamplingInterval', { interval: 1000 });
    let cpuProfile;
    try { report.startup.profileLoad = await startupLoad(true); }
    finally { ({ profile: cpuProfile } = await S('Profiler.stop')); }
    const sourceMaps = new Map([...decodedBuildMaps].map(([file, map]) => [`${base}/kings-cross/${file}`, map]));
    report.startup.cpu = {
      ...aggregateCpu(cpuProfile, sourceMaps),
      samplingIntervalUs: 1000,
      caveat: 'Sampled leaf self time, not inclusive time or wall time. Separate warm third load with profiler overhead; ends after first replay train render is observed. Native/runtime samples remain named runtime buckets (including JSON.parse when exposed by V8); no guessed source attribution. Long uninterruptible native operations may be under-sampled. Source-map locations are function entry positions supplied by V8.',
    };
  }
  // Raw CPU profiles deliberately omitted: only aggregate source/function costs are saved.

  // The two axis 8 cameras keep the placement they have always had; a station camera is placed as the evidence pack places it (evidence.mjs
  // setCamera), so its frame rate is the frame rate of the view that was captured.
  const legacyCameraScript = (camera) => `(() => {
        const k = window.__kx;
        k.controls.maxDistance = 3000;
        k.camera.position.set(${camera.pos.join(',')});
        k.controls.target.set(${camera.target.join(',')});
        k.controls.update();
        return true;
      })()`;
  const stationCameraScript = (camera) => `(() => {
        const k = window.__kx;
        k.controls.minDistance = .05; k.controls.maxDistance = 20000; k.controls.maxPolarAngle = Math.PI;
        k.camera.far = 20000; k.camera.near = ${camera.near}; k.camera.fov = ${camera.fov}; k.camera.updateProjectionMatrix();
        k.camera.position.set(${camera.pos.join(',')});
        k.controls.target.set(${camera.target.join(',')});
        k.controls.update();
        return true;
      })()`;
  const busyFloor = report.replayPeak?.busyFloor ?? null;
  // Each camera of `cameraList` on a fresh load of the replay (restarted at the peak when there is one), for `measureSeconds` in the given
  // session's Chrome: per-second FPS buckets, the frame-time distribution, trains drawn and renderer load.
  // Results are written into `results` as each camera finishes, so a failure part-way through still leaves the cameras measured so far in the report.
  const measureCameras = async ({ S, evaluate }, controlFpsMedian, measureSeconds, label, cameraList, results = {}) => {
    const freshNavigation = freshNavigationFor({ S, evaluate });
    for (const camera of cameraList) {
      const cameraName = camera.name;
      await freshNavigation(`${base}/kings-cross/${camera.waverley ? waverleyQuery : replayQuery}`);
      if (camera.waverley) await awaitWaverleyPage(evaluate);
      else await awaitReplayPage(evaluate, cameraName);
      await evaluate(camera.station || camera.waverley ? stationCameraScript(camera) : legacyCameraScript(camera));
      await evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      await evaluate('new Promise((resolve) => setTimeout(resolve, 2000))', 5000);
      if (camera.waverley) {
        // The camera must still be the frozen one after the settling seconds (a flight or the controls must not have moved it): the same check evidence.mjs makes.
        const posed = await evaluate('(() => { const k = window.__kx; return { pos: k.camera.position.toArray(), target: k.controls.target.toArray(), fov: k.camera.fov }; })()');
        const departure = waverleyEvidence.cameraDeparture(camera, posed);
        if (departure.length) throw new Error(`camera ${cameraName} moved from its frozen value: ${departure.join('; ')}`);
      }

      const measurement = await evaluate(`(() => new Promise((resolve) => {
        const durationMs = ${measureSeconds * 1000};
        const k = window.__kx;
        const gl = k.renderer.getContext();
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const rendererString = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const hiddenAtStart = document.visibilityState !== 'visible';
        const focusedAtStart = document.hasFocus();
        const controlFpsMedian = ${controlFpsMedian};
        const startFeedMs = k.feed.timeMs ?? null;
        const dt = [], calls = [], triangles = [], shown = [], trainGroups = [], inMotion = [], moving = [];
        const movingIds = new Set(), startDistance = new Map(), maxTravel = new Map();
        const buckets = Array(Math.ceil(durationMs / 1000)).fill(0);
        let started, last;
        const done = (now) => {
          const quantile = (values, p) => {
            if (!values.length) return null;
            const sorted = [...values].sort((a, b) => a - b);
            return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
          };
          const feedTimeMs = k.feed.timeMs ?? null;
          const sortedBuckets = buckets.slice().sort((a, b) => a - b);
          const frameStats = (values) => ({ p5: quantile(values, 0.05), p50: quantile(values, 0.5), p95: quantile(values, 0.95), p99: quantile(values, 0.99) });
          const fpsMedian = quantile(sortedBuckets, 0.5);
          const fpsP5 = quantile(sortedBuckets, 0.05);
          const deltaP50 = quantile(dt, 0.5), deltaP95 = quantile(dt, 0.95), deltaP99 = quantile(dt, 0.99);
          const hidden = hiddenAtStart || document.visibilityState !== 'visible';
          const oneHzCadence = fpsMedian !== null && fpsMedian <= 2 && deltaP50 !== null && deltaP50 >= 400;
          const throttleReasons = [];
          if (hidden) throttleReasons.push('page hidden');
          if (oneHzCadence) throttleReasons.push('near-1-Hz rAF cadence');
          const movedIds = [...maxTravel.entries()].filter(([, distance]) => distance > 0.5).map(([id]) => id);
          return {
            durationSeconds: (now - started) / 1000,
            frames: dt.length + 1,
            renderer: rendererString,
            realMetal: /metal/i.test(rendererString) && !/swiftshader/i.test(rendererString),
            visibilityAtStart: hiddenAtStart ? 'hidden' : 'visible',
            focusedAtStart,
            visibilityAtEnd: document.visibilityState,
            focusedAtEnd: document.hasFocus(),
            blankPageControlFpsMedian: controlFpsMedian,
            rAFThrottleDetected: throttleReasons.length > 0,
            rAFThrottleReasons: throttleReasons,
            fpsBuckets: buckets,
            fps: { median: fpsMedian, p5: fpsP5, min: Math.min(...buckets), max: Math.max(...buckets) },
            frameMs: { p50: deltaP50, p95: deltaP95, p99: deltaP99, max: Math.max(...dt) },
            frameMsSamples: dt.map((value) => Math.round(value * 100) / 100),
            frameBudget: { targetFps: 60, budgetMs: 1000 / 60, p95WithinBudget: deltaP95 !== null && deltaP95 <= 1000 / 60, p99WithinBudget: deltaP99 !== null && deltaP99 <= 1000 / 60 },
            rendererCalls: frameStats(calls),
            triangles: frameStats(triangles),
            trainsShown: { min: Math.min(...shown), median: quantile(shown, 0.5), max: Math.max(...shown) },
            trainGroups: { min: Math.min(...trainGroups), median: quantile(trainGroups, 0.5), max: Math.max(...trainGroups) },
            motionTrains: { min: Math.min(...inMotion), median: quantile(inMotion, 0.5), max: Math.max(...inMotion) },
            trainMotion: { movingFrames: moving.filter(Boolean).length, movingTrainIds: [...movingIds], movedTrainIds: movedIds, maxTravelM: Math.max(0, ...maxTravel.values()) },
            replayProgress: { startMs: startFeedMs, endMs: feedTimeMs, advancedMs: startFeedMs === null || feedTimeMs === null ? null : feedTimeMs - startFeedMs, expectedMsAtSpeed: durationMs * ${replaySpeed}, connection: k.feed.connection },
          };
        };
        const frame = (now) => {
          if (started === undefined) { started = now; last = now; }
          const elapsed = now - started;
          if (now > last) dt.push(now - last);
          last = now;
          if (elapsed >= durationMs) { resolve(done(now)); return; }
          buckets[Math.min(buckets.length - 1, Math.floor(elapsed / 1000))]++;
          calls.push(k.renderer.info.render.calls);
          triangles.push(k.renderer.info.render.triangles);
          const trains = k.trains ?? [];
          trainGroups.push(trains.length);
          shown.push(trains.filter((train) => train.group?.visible && train.group.children.some((car) => car.visible)).length);
          const views = k.motionState ?? [];
          inMotion.push(views.length);
          let isMoving = false;
          for (const train of views) {
            if (train.state !== 'fading' && train.speed > 0.1) {
              isMoving = true;
              movingIds.add(train.id);
            }
            if (!startDistance.has(train.id)) startDistance.set(train.id, train.distanceM);
            maxTravel.set(train.id, Math.max(maxTravel.get(train.id) ?? 0, Math.abs(train.distanceM - startDistance.get(train.id))));
          }
          moving.push(isMoving);
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }))()`, measureSeconds * 1000 + 20_000);

      // The distribution is computed here from the frame times the page returned; the raw list is not kept in the report.
      const frameTimes = measurement.frameMsSamples;
      delete measurement.frameMsSamples;
      const distribution = frameDistribution(frameTimes);
      const normalized = {
        ...measurement,
        view: { pos: camera.pos, target: camera.target, ...(camera.station || camera.waverley ? { fov: camera.fov, near: camera.near, ...(camera.grid ? { grid: true } : {}) } : {}) },
        frameDistribution: distribution,
        steady60: steadyAt60(measurement.fps.median, distribution),
        busy: busyFloor === null ? null : measurement.trainsShown.median >= busyFloor,
        frameBudgetMs: rounded(measurement.frameBudget.budgetMs, 3),
        fps: Object.fromEntries(Object.entries(measurement.fps).map(([key, value]) => [key, rounded(value, 2)])),
        frameMs: Object.fromEntries(Object.entries(measurement.frameMs).map(([key, value]) => [key, rounded(value, 2)])),
        rendererCalls: Object.fromEntries(Object.entries(measurement.rendererCalls).map(([key, value]) => [key, rounded(value, 1)])),
        triangles: Object.fromEntries(Object.entries(measurement.triangles).map(([key, value]) => [key, rounded(value, 1)])),
        trainMotion: { ...measurement.trainMotion, maxTravelM: rounded(measurement.trainMotion.maxTravelM, 2) },
        replayProgress: {
          ...measurement.replayProgress,
          rateRatio: measurement.replayProgress.advancedMs === null ? null : rounded(measurement.replayProgress.advancedMs / measurement.replayProgress.expectedMsAtSpeed, 3),
        },
        frameBudget: { ...measurement.frameBudget, budgetMs: rounded(measurement.frameBudget.budgetMs, 3) },
      };
      normalized.fpsBuckets = measurement.fpsBuckets.map((fps) => rounded(fps, 2));
      results[cameraName] = normalized;
      if (camera.station) console.log(`${label} ${cameraName}: median ${normalized.fps.median} FPS (p5 ${normalized.fps.p5}), frame p99 ${distribution.p99} ms, ${distribution.slowFrames} slow of ${distribution.frames}, trains drawn ${normalized.trainsShown.min}/${normalized.trainsShown.median}/${normalized.trainsShown.max}, steady ${normalized.steady60}, busy ${normalized.busy}`);
      else console.log(JSON.stringify({ session: label, camera: cameraName, fps: normalized.fps, frameMs: normalized.frameMs, renderer: normalized.renderer, replayProgress: normalized.replayProgress, trainMotion: normalized.trainMotion }, null, 2));
    }
    return results;
  };
  const startupOnly = args.includes('--startup-only');
  if (!waverley) report.firstTrainVisible = firstTrainVisible(report.startup, report.replayPeak);
  if (!startupOnly) {
    if (legacyList.length) await measureCameras(session, report.rafControl.medianFps, seconds, 'capped', legacyList, report.cameras);
    if (stationList.length) {
      report.stationCameras = {};
      await measureCameras(session, report.rafControl.medianFps, stationSeconds, 'capped-stations', stationList, report.stationCameras);
      report.stationSweep = sweepSummary(report.stationCameras);
    }
  }

  // Headroom: the same cameras in a second Chrome with the frame limit and GPU vsync off (flags only apply at launch).
  if (!startupOnly && !args.includes('--no-uncapped')) {
    await closeSession();
    const uncappedSession = await openSession(UNCAPPED_FLAGS);
    const uncappedStationSeconds = Math.min(stationSeconds, uncappedSeconds);
    report.uncapped = { flags: [...UNCAPPED_FLAGS], secondsPerCamera: uncappedSeconds, stationSecondsPerCamera: uncappedStationSeconds, chromeVersion: await uncappedSession.send('Browser.getVersion') };
    report.uncapped.rafControl = await rafControl(uncappedSession.evaluate);
    report.uncapped.paintControl = await paintControl(uncappedSession.evaluate);
    if (legacyList.length) {
      report.uncapped.cameras = {};
      await measureCameras(uncappedSession, report.uncapped.rafControl.medianFps, uncappedSeconds, 'uncapped', legacyList, report.uncapped.cameras);
      report.headroom = headroomReport({ control: report.paintControl, cameras: report.cameras }, { control: report.uncapped.paintControl, cameras: report.uncapped.cameras });
      if (headroomBaseline) report.headroom.vsBaseline = { file: headroomBaselinePath, ...headroomVsBaseline(report.headroom, headroomBaseline.headroom) };
    }
    if (stationList.length) {
      report.uncapped.stationCameras = {};
      await measureCameras(uncappedSession, report.uncapped.rafControl.medianFps, uncappedStationSeconds, 'uncapped-stations', stationList, report.uncapped.stationCameras);
      report.stationHeadroom = headroomReport({ control: report.paintControl, cameras: report.stationCameras }, { control: report.uncapped.paintControl, cameras: report.uncapped.stationCameras });
      if (headroomBaseline?.stationHeadroom?.cameras) report.stationHeadroom.vsBaseline = { file: headroomBaselinePath, ...headroomVsBaseline(report.stationHeadroom, headroomBaseline.stationHeadroom) };
    }
  }

  report.requests = requestSummary(networkRequests);
  report.consoleErrors = consoleErrors;
  report.success = true;
  const file = path.join(out, `perf-${stamp()}.json`);
  // A Waverley run needs no relay: any /relay request the page made is listed (and was answered 404).
  if (waverley) report.relayRequests = serverRequests.filter((row) => row.url.startsWith('/relay')).map((row) => ({ url: row.url, status: row.status ?? null }));
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  const markdown = waverley ? [
    '# Edinburgh Waverley performance', '',
    `Scene: edinburgh-waverley, trains none; no relay, no recording, no EB data (nothing is forwarded to a relay; the page's own /relay requests, ${report.relayRequests.length} here, are answered 404 and are harmless). Cameras: ${legacyList.map((camera) => camera.name).join(', ')} (frozen, evidence.mjs).`,
    `JS/CSS gzip: ${report.build.gzipBundleBytes} / ${report.build.gzipBudgetBytes} bytes (${report.build.gzipBundleWithinBudget ? 'PASS' : 'FAIL'}, strict <2 MB).`, '',
    `Failed request URLs: ${report.requests.failedUrls.length ? report.requests.failedUrls.join(', ') : 'none'}.`, '',
    ...Object.entries(report.cameras).map(([name, camera]) => `${name}: median ${camera.fps.median} FPS (p5 ${camera.fps.p5}), p95 ${camera.frameMs.p95} ms, Metal ${camera.realMetal}, throttle detected ${camera.rAFThrottleDetected}.`), '',
    ...headroomMarkdown(report.headroom),
    `Scene pin: ${report.scenePin.parameters}.`, '',
  ].join('\n') : [
    '# King’s Cross performance', '',
    `Cold scene: ${rounded(report.startup.coldFreshProfile.navigationStartToSceneRenderedMs)} ms; replay trains: ${rounded(report.startup.coldFreshProfile.navigationStartToReplayTrainsRenderedMs)} ms.`,
    `Warm second load scene: ${rounded(report.startup.warmSecondLoadSameProfile.navigationStartToSceneRenderedMs)} ms (${report.startup.warmSecondLoadSameProfile.sceneWithin3s ? 'PASS' : 'FAIL'}, strict <3 s); replay trains: ${rounded(report.startup.warmSecondLoadSameProfile.navigationStartToReplayTrainsRenderedMs)} ms.`,
    `First train visible (navigation start to the first train draw): warm second load ${rounded(report.firstTrainVisible.warm.ms)} ms with ${report.firstTrainVisible.warm.trainDrawsAtFirstRender} train draws in that frame; cold ${rounded(report.firstTrainVisible.cold.ms)} ms${report.firstTrainVisible.startsAtPeak ? '' : '. The replay starts empty here, so this includes the wait for the recording\'s first train'}.`,
    `JS/CSS gzip: ${report.build.gzipBundleBytes} / ${report.build.gzipBudgetBytes} bytes (${report.build.gzipBundleWithinBudget ? 'PASS' : 'FAIL'}, strict <2 MB).`, '',
    ...peakMarkdown(report.replayPeak),
    ...startupPhaseMarkdown(report.startup), '',
    `Failed request URLs: ${report.requests.failedUrls.length ? report.requests.failedUrls.join(', ') : 'none'}.`, '',
    ...cpuProfileMarkdown(report.startup.cpu),
    ...Object.entries(report.cameras).map(([name, camera]) => `${name}: median ${camera.fps.median} FPS, p95 ${camera.frameMs.p95} ms, Metal ${camera.realMetal}, throttle detected ${camera.rAFThrottleDetected}.`), '',
    ...(report.stationCameras ? sweepMarkdown(report.stationCameras, report.stationSweep) : []),
    ...(startupOnly ? [] : [...(legacyList.length ? headroomMarkdown(report.headroom) : []), ...(stationList.length ? headroomMarkdown(report.stationHeadroom, 'Station camera headroom') : [])]),
    `Scene pin: ${report.scenePin.parameters}.`, '',
    report.startup.limitations, '', report.startup.cpu.caveat, '',
  ].join('\n');
  const markdownFile = file.replace(/\.json$/, '.md');
  await writeFile(markdownFile, markdown, { flag: 'wx' });
  console.log(JSON.stringify({ report: file, markdown: markdownFile, out, consoleErrors: report.consoleErrors }, null, 2));
} catch (error) {
  report.requests = requestSummary(networkRequests);
  report.consoleErrors = consoleErrors;
  report.success = false;
  report.failure = {
    message: String(error?.message ?? error).slice(0, 6000),
    stack: String(error?.stack ?? '').slice(0, 10_000),
  };
  report.chromeDiagnostics = {
    exitCode: chrome?.exitCode ?? null,
    signalCode: chrome?.signalCode ?? null,
    stdout: chromeStdout.slice(-2000),
    stderr: chromeStderr.slice(-4000),
  };
  const file = path.join(out, `perf-failure-${stamp()}.json`);
  try {
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    console.error(JSON.stringify({ failure: report.failure.message, report: file }, null, 2));
  } catch (writeError) {
    console.error(`Performance capture failed: ${report.failure.message}; failure report write also failed: ${writeError.message}`);
  }
  throw error;
} finally {
  await cleanup();
}
}
