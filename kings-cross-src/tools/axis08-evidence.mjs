// Run from kings-cross-src: node tools/axis08-evidence.mjs [--dist DIR] [--runs 3]
// [--out ../.scratch/axis08-evidence] [--chrome PATH] [--relay URL] [--seconds 60]
// [--uncapped-seconds N] [--headroom-baseline PERF.json] [--time ISO] [--weather NAME | --sky ref]
// [--station-seconds N] [--stations all|none|NAMES]   (passed to perf.mjs: the first pair measures the two axis cameras and the
// uncapped FPS headroom; every pair measures startup and every fixed station camera; every page load carries the scene pin)
// Every pair measures on the replay's busiest stretch: the first pair scans the recording for it, the later pairs reuse its start (--peak-from).
// Omitting --dist builds with source maps into a fresh private .scratch directory.
// Full evidence exits successfully only with genuine, unthrottled Metal on both FPS cameras
// 60 FPS median/p5, warm first render <3 s, and app gzip below 2 MB (and, when the station sweep ran, every fixed station camera steady at
// 60 FPS in every pair, measured at the peak); all-emitted including maps has its own explicit budget result.
// --check-build reports hardware and EVERY emitted file without claiming browser measurements.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { headroomMarkdown, peakMarkdown } from './perf.mjs';
import { sweepAcrossPairs } from './camera-sweep.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const scratch = path.resolve(project, '..', '.scratch');
export const BUDGET_BYTES = 2_000_000;
// The project owner's ruling of 2026-11-09: only what ships counts against the size limit, and the published page has no source maps.
export const BUDGET_DEFINITION = 'Strict < 2 MB (2000000 bytes), sum of each file independently gzipped. Per the project owner\'s ruling of 2026-11-09, only what ships counts: the verdict applies to the app payload, which includes geometry, lazy chunks and every non-map file (the published page has no source maps). The all-emitted total adds the source maps, is reported for information only and carries no pass/fail verdict. Excludes relay recording/network data and the shared external almanac-back.js.';
export async function sizeReport(dist) {
  const files = [];
  async function walk(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        const body = await readFile(file);
        files.push({ file: path.relative(dist, file), classification: entry.name.endsWith('.map') ? 'source-map' : 'app-payload', bytes: body.length, gzipBytes: gzipSync(body).length });
      } else throw new Error(`dist contains unsupported non-regular entry: ${file}`);
    }
  }
  await walk(dist);
  if (!files.some(row => row.file === 'index.html')) throw new Error('dist must contain index.html');
  const total = rows => rows.reduce((sum, row) => sum + row.gzipBytes, 0);
  const allEmittedGzipBytes = total(files);
  const appPayloadGzipBytes = total(files.filter(row => row.classification === 'app-payload'));
  return { files, budgetBytes: BUDGET_BYTES, budgetDefinition: BUDGET_DEFINITION, allEmittedGzipBytes, appPayloadGzipBytes, sourceMapsGzipBytes: allEmittedGzipBytes - appPayloadGzipBytes, appPayloadWithinBudget: appPayloadGzipBytes < BUDGET_BYTES };
}

export async function hardwareReport(platform = os.platform(), execute = promisify(execFile)) {
  const hardware = { model: null, cpu: os.cpus()[0]?.model ?? null, logicalCpus: os.cpus().length, gpu: null, os: { platform, release: os.release(), version: os.version(), arch: os.arch() }, gaps: [] };
  if (platform === 'darwin') {
    try {
      const { stdout } = await execute('/usr/sbin/system_profiler', ['SPHardwareDataType', 'SPDisplaysDataType', '-json'], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
      const data = JSON.parse(stdout);
      hardware.model = data.SPHardwareDataType?.[0]?.machine_model ?? null;
      hardware.gpu = (data.SPDisplaysDataType ?? []).map(gpu => gpu.sppci_model ?? gpu._name).filter(Boolean);
    } catch { hardware.gaps.push('system_profiler unavailable; model/GPU not measured'); }
  } else hardware.gaps.push('Model/GPU inventory requires macOS system_profiler; GPU renderer still comes from perf');
  return hardware;
}

export function summarizeRuns(reports) {
  if (reports.length < 2) throw new Error('at least two independent cold/warm pairs required');
  const samples = { cold: [], warm: [] };
  const gaps = [];
  for (const report of reports) {
    if (report.success !== true) throw new Error('perf run did not succeed');
    if (report.consoleErrors?.length) gaps.push(`Pair ${reports.indexOf(report) + 1}: ${report.consoleErrors.length} console errors; see private perf report.`);
    if (report.requests?.failedUrls?.length) gaps.push(`Pair ${reports.indexOf(report) + 1}: ${report.requests.failedUrls.length} failed request URLs; see private perf report.`);
    for (const [name, key] of [['cold', 'coldFreshProfile'], ['warm', 'warmSecondLoadSameProfile']]) {
      const timing = report.startup?.[key];
      const firstRenderMs = timing?.navigationStartToSceneRenderedMs;
      const sceneReadyMs = timing?.navigationStartToFullSceneRenderedMs;
      if (!(firstRenderMs > 0) || !(sceneReadyMs >= firstRenderMs)) throw new Error('missing first-render/full-scene measurement');
      // The first train drawn after navigation start: the warm figure is the "first train visible" metric. Absent from reports that predate it.
      const firstTrainMs = timing?.navigationStartToReplayTrainsRenderedMs;
      samples[name].push({ firstRenderMs, sceneReadyMs, ...(firstTrainMs > 0 ? { firstTrainMs, firstTrainDraws: timing.replayTrainDrawsAtFirstRender ?? null } : {}) });
    }
  }
  const summarize = values => { const sorted = [...values].sort((a, b) => a - b); return { min: sorted[0], median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2, max: sorted.at(-1) }; };
  // Every fixed station camera in every pair (perf.mjs station sweep); null when no pair swept them.
  const sweep = sweepAcrossPairs(reports);
  const sweepComplete = sweep !== null && sweep.pairs === reports.length && sweep.everyCameraEveryPair;
  if (sweep && !sweepComplete) gaps.push(`The station sweep covers ${sweep.pairs} of ${reports.length} pairs${sweep.everyCameraEveryPair ? '' : ' and not every camera in each'}.`);
  if (sweep && sweep.notBusy.length) gaps.push(`Not measured at the replay peak (median trains drawn under the busy floor) in every pair: ${sweep.notBusy.join(', ')}.`);
  const cameras = reports[0].cameras ?? {};
  const genuineMetal = ['overview', 'shed'].every(name => cameras[name]?.realMetal === true && /metal/i.test(cameras[name]?.renderer ?? '') && !/swiftshader|software|llvmpipe/i.test(cameras[name]?.renderer ?? '') && cameras[name]?.rAFThrottleDetected === false);
  const finiteAtLeast = (value, minimum) => Number.isFinite(value) && value >= minimum;
  const cameraTargets = Object.fromEntries(['overview', 'shed'].map(name => [name, {
    medianFpsAtLeast60: finiteAtLeast(cameras[name]?.fps?.median, 60),
    p5FpsAtLeast60: finiteAtLeast(cameras[name]?.fps?.p5, 60),
    p95FrameWithinBudget: Number.isFinite(cameras[name]?.frameMs?.p95) && cameras[name].frameMs.p95 <= 1000 / 60,
    p99FrameWithinBudget: Number.isFinite(cameras[name]?.frameMs?.p99) && cameras[name].frameMs.p99 <= 1000 / 60,
  }]));
  const warmFirstRenderWithin3s = samples.warm.every(sample => sample.firstRenderMs < 3000);
  const fpsAtLeast60 = Object.values(cameraTargets).every(target => target.medianFpsAtLeast60 && target.p5FpsAtLeast60);
  // The station sweep joins the verdict when it ran: every fixed station camera steady at 60 FPS in every pair, each measured at the replay peak, on real Metal.
  const stationFpsAtLeast60 = sweep ? sweepComplete && sweep.allSteadyAt60 : null;
  const peakWasBusy = sweep ? sweep.allBusy : null;
  const stationRealMetal = sweep ? sweep.allRealMetal : null;
  const targets = { fpsTarget: 60, warmFirstRenderLimitMs: 3000, warmFirstRenderStrict: true, frameBudgetMs: 1000 / 60,
    cameraTargets, warmFirstRenderWithin3s, fpsAtLeast60, stationFpsAtLeast60, peakWasBusy, stationRealMetal,
    passed: genuineMetal && warmFirstRenderWithin3s && fpsAtLeast60 && stationRealMetal !== false && stationFpsAtLeast60 !== false && peakWasBusy !== false,
    definition: 'Both camera median and p5 FPS must be >=60; every warm first render must be strictly <3000 ms; genuine unthrottled Metal required. When the station sweep ran, every fixed station camera must also be steady at 60 FPS (median second >=60 and at most 1% of frames later than 20 ms) in every pair, and measured at the replay peak (median trains drawn at or above the busy floor). Frame p95/p99 comparisons for the two axis cameras are disclosed separately.' };
  return { samples, targets, gaps, aggregates: Object.fromEntries(Object.entries(samples).map(([name, rows]) => [name, { firstRenderMs: summarize(rows.map(row => row.firstRenderMs)), sceneReadyMs: summarize(rows.map(row => row.sceneReadyMs)),
      ...(rows.every(row => row.firstTrainMs > 0) ? { firstTrainMs: summarize(rows.map(row => row.firstTrainMs)) } : {}) }])), cameras, genuineMetal,
    // The warm-start "first train visible" metric, with whether the replay started at its peak (so the trains were there from the first frame).
    firstTrainVisible: samples.warm.every(row => row.firstTrainMs > 0) ? { warmMs: summarize(samples.warm.map(row => row.firstTrainMs)), coldMs: summarize(samples.cold.map(row => row.firstTrainMs)),
      warmTrainDraws: samples.warm.map(row => row.firstTrainDraws), startsAtPeak: reports.every(report => report.firstTrainVisible?.startsAtPeak === true) } : null,
    // Every fixed station camera in every pair on the replay peak (perf.mjs): per-camera spread of FPS and frame times; null when no pair swept them.
    stationSweep: sweep, replayPeak: reports[0].replayPeak ?? null,
    // Uncapped FPS headroom (perf.mjs): measured on the first pair with the cameras; null when that report predates it or the run skipped it.
    headroom: reports[0].headroom ?? null, stationHeadroom: reports[0].stationHeadroom ?? null, timingDefinition: 'Navigation-relative draw submission completion after renderer.render, not GPU completion/display presentation. First render is the initial visible-scene draw submission; full scene requires cityLoaded completion, terrain and city buildings present, and a subsequent render. Each cold/warm pair uses an independent clean Chrome profile; warm is the cache-enabled second navigation in that same profile. OS/filesystem caches are not flushed. Replay train drawing is also required by perf before collecting each sample.' };
}

/** The one-line status: what passed, or which targets failed. The station camera targets count only when the sweep ran. */
export function statusLine(browser, build) {
  const t = browser.targets;
  const failed = [!browser.genuineMetal && 'genuine unthrottled Metal on the axis cameras', !t.fpsAtLeast60 && '>=60 median/p5 FPS on the axis cameras',
    t.stationRealMetal === false && 'genuine unthrottled Metal on every station camera', t.stationFpsAtLeast60 === false && 'every station camera steady at 60 FPS in every pair',
    t.peakWasBusy === false && 'every station camera measured at a busy replay peak', !t.warmFirstRenderWithin3s && 'warm first render <3 s', !build.appPayloadWithinBudget && 'app payload budget'].filter(Boolean);
  if (failed.length) return `fail: ${failed.join('; ')}`;
  return `pass: genuine Metal, >=60 median/p5 FPS${t.stationFpsAtLeast60 === true ? ', every station camera steady at 60 FPS at the replay peak' : ''}, warm first render <3 s and app payload budget`;
}

/** The warm-start "first train visible" metric as Markdown lines. */
export function firstTrainMarkdown(firstTrain) {
  if (!firstTrain) return ['First train visible: not measured.', ''];
  const f = n => Number.isFinite(n) ? Number(n.toFixed(1)) : 'n/a';
  const spread = s => s.min === s.max ? `${f(s.median)} ms` : `${f(s.median)} ms (${f(s.min)}-${f(s.max)} over the pairs)`;
  return [`First train visible (navigation start to the first train draw): warm second load ${spread(firstTrain.warmMs)}, with ${firstTrain.warmTrainDraws.join('/')} train draws in that frame; cold fresh profile ${spread(firstTrain.coldMs)}. ${firstTrain.startsAtPeak ? 'The replay starts at its peak, so the trains are in their berths from the first frame and the figure is the page\'s own work.' : 'The replay starts at the beginning of the recording, so the figure includes the wait for its first train.'}`, ''];
}

/** The station sweep across the cold/warm pairs as Markdown lines: a row per fixed station camera. */
export function stationSweepMarkdown(sweep) {
  if (!sweep) return ['Fixed station cameras at the replay peak: not measured.', ''];
  const f = (n, digits = 1) => Number.isFinite(n) ? Number(n.toFixed(digits)) : 'n/a';
  const range = (s, digits = 0) => !s ? 'n/a' : s.min === s.max ? `${f(s.min, digits)}` : `${f(s.min, digits)}-${f(s.max, digits)}`;
  const yes = value => value ? 'yes' : 'NO';
  const held = sweep.cameraCount - sweep.notSteady.length, busy = sweep.cameraCount - sweep.notBusy.length;
  return [`Fixed station cameras at the replay peak, ${sweep.pairs} cold/warm pairs of ${sweep.cameraCount} cameras: ${held} steady at 60 FPS in every pair; ${busy} measured at the peak in every pair.${sweep.notSteady.length ? ` Not steady in every pair: ${sweep.notSteady.join(', ')}.` : ''}`, '', sweep.definition, '',
    '| Camera | Trains drawn: median (range over pairs) | Median FPS (range over pairs) | Worst p5 FPS | Worst p99 frame ms | Worst slow frames % | Worst missed slots | Steady 60 every pair | At peak every pair |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ...Object.entries(sweep.cameras).map(([name, c]) => `| ${name} | ${f(c.trainsShownMedian?.median, 0)} (${range(c.trainsShownMedian)}) | ${range(c.medianFps)} | ${f(c.p5Fps?.min, 0)} | ${f(c.p99FrameMs?.max)} | ${f(c.slowShare?.max * 100, 2)} | ${f(c.missedSlots?.max, 0)} | ${yes(c.steadyEveryPair)} | ${yes(c.busyEveryPair)} |`), ''];
}

export function evidenceMarkdown(report) {
  const show = value => value == null ? 'not measured' : String(value);
  const cell = value => show(value).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
  const verdict = value => value == null ? 'NOT MEASURED' : value ? 'PASS' : 'FAIL';
  const shellQuote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
  const { hardware: h, build: b, browser } = report;
  const lines = ['# Axis 08 performance evidence', '', `Status: ${report.status}.`, '',
    'Exact command (run from kings-cross-src):', '', '```sh', (report.invocation ?? []).map(shellQuote).join(' '), '```', '',
    `Model: ${cell(h.model)}. CPU: ${cell(h.cpu)} (${h.logicalCpus} logical CPUs). GPU: ${cell(h.gpu?.join(', '))}.`,
    `OS: ${cell(h.os.platform)} ${cell(h.os.release)}; ${cell(h.os.version)}; ${cell(h.os.arch)}.`, '',
    `App payload gzip: ${b.appPayloadGzipBytes} / ${b.budgetBytes} B: ${verdict(b.appPayloadWithinBudget)}.`,
    `All emitted gzip including maps (informational only, no verdict; the size limit counts only what ships, ruling of 2026-11-09): ${b.allEmittedGzipBytes} B. Source maps: ${b.sourceMapsGzipBytes} B.`, '',
    b.budgetDefinition, '', '| Emitted file | Classification | Bytes | Gzip bytes |', '| --- | --- | ---: | ---: |',
    ...b.files.map(row => `| ${cell(row.file)} | ${row.classification} | ${row.bytes} | ${row.gzipBytes} |`), ''];
  if (browser) {
    lines.push(browser.timingDefinition, '', browser.targets.definition, '',
      `Genuine unthrottled Metal: ${verdict(browser.genuineMetal)}. FPS target: ${verdict(browser.targets.fpsAtLeast60)}. All warm first renders <3 s: ${verdict(browser.targets.warmFirstRenderWithin3s)}.`,
      `Every station camera steady at 60 FPS in every pair: ${verdict(browser.targets.stationFpsAtLeast60)}. Replay peak busy for every camera: ${verdict(browser.targets.peakWasBusy)}. Station cameras on genuine unthrottled Metal: ${verdict(browser.targets.stationRealMetal)}.`, '',
      '| Profile | Pair | First render ms | Full scene ready ms | First train ms |', '| --- | ---: | ---: | ---: | ---: |');
    for (const [name, rows] of Object.entries(browser.samples)) rows.forEach((row, index) => lines.push(`| ${name} | ${index + 1} | ${row.firstRenderMs} | ${row.sceneReadyMs} | ${show(row.firstTrainMs)} |`));
    lines.push('', '| Profile | Milestone | Min ms | Median ms | Max ms |', '| --- | --- | ---: | ---: | ---: |');
    for (const [name, measures] of Object.entries(browser.aggregates)) for (const [milestone, stats] of Object.entries(measures)) lines.push(`| ${name} | ${milestone} | ${stats.min} | ${stats.median} | ${stats.max} |`);
    lines.push('', '| Camera | Renderer | Median FPS | p5 FPS | p95 frame ms | p99 frame ms | Median >=60 | p5 >=60 | p95 <=16.667 ms | p99 <=16.667 ms |', '| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |');
    for (const name of ['overview', 'shed']) {
      const camera = browser.cameras[name], target = browser.targets.cameraTargets[name];
      lines.push(`| ${name} | ${cell(camera?.renderer)} | ${show(camera?.fps?.median)} | ${show(camera?.fps?.p5)} | ${show(camera?.frameMs?.p95)} | ${show(camera?.frameMs?.p99)} | ${verdict(target.medianFpsAtLeast60)} | ${verdict(target.p5FpsAtLeast60)} | ${verdict(target.p95FrameWithinBudget)} | ${verdict(target.p99FrameWithinBudget)} |`);
    }
    lines.push('', ...headroomMarkdown(browser.headroom));
    lines.push(...firstTrainMarkdown(browser.firstTrainVisible), ...peakMarkdown(browser.replayPeak), ...stationSweepMarkdown(browser.stationSweep));
    if (browser.stationSweep) lines.push(...headroomMarkdown(browser.stationHeadroom, 'Station camera headroom'));
  } else lines.push('Browser timing, FPS and genuine Metal: NOT MEASURED.');
  lines.push('', 'Limitations and gaps:', '',
    '- Draw submission timing does not establish GPU completion or actual display presentation. OS/filesystem caches are not flushed.',
    '- Each browser pair runs the perf instrumentation. The first pair measures the two axis 8 cameras (60 s each) and the uncapped headroom; every pair measures startup and every fixed station camera on the replay peak. CPU-profile loads are separate from timing loads.',
    '- Replay availability and local relay latency affect startup. With the replay peak, every load restarts the recording at the same instant from a snapshot built from the recording itself (trains placed in their berths as a live connection places them), so the trains match between loads; without it, snapshots may differ between loads. No recording bodies, screenshots or raw CPU profiles are saved.',
    '- Hardware GPU inventory identifies installed hardware; genuine Metal is checked from both measured WebGL renderer strings and throttle detection.',
    ...(h.gaps ?? []).map(gap => `- ${cell(gap)}`),
    ...(browser?.gaps ?? []).map(gap => `- ${cell(gap)}`));
  return lines.join('\n') + '\n';
}

export async function collectRuns(runs, run) {
  const reports = [];
  for (let index = 0; index < runs; index++) reports.push(await run(index, index > 0));
  return summarizeRuns(reports);
}
/** One pair's perf run: the peak scan, startup, the axis cameras, the sweep of every station camera and the uncapped headroom take most of an hour. */
export const PERF_PAIR_LIMIT_MS = 75 * 60_000;
/**
 * The perf.mjs arguments for one pair. `flag(name)` gives the value of an option of this command. The first pair (`peakFrom` null) scans the
 * replay for its busiest stretch and measures the axis cameras and the uncapped headroom. A later pair measures the same stretch
 * (`--peak-from` the first pair's report) on its own fresh profile: startup and every station camera, not the 60 s axis cameras or the
 * headroom again. With --stations none there is no sweep, and a later pair is startup only, as it was before the sweep.
 */
export function pairPerfArgs({ perf, dist, runOut, flag, peakFrom = null }) {
  const perfArgs = [perf, '--dist', dist, '--out', runOut, '--scene-ready'];
  for (const name of ['--seconds', '--chrome', '--relay', '--time', '--weather', '--sky', '--uncapped-seconds', '--headroom-baseline', '--station-seconds', '--stations']) if (flag(name)) perfArgs.push(name, flag(name));
  if (peakFrom) perfArgs.push(...(flag('--stations') === 'none' ? ['--startup-only'] : ['--no-legacy-cameras', '--no-uncapped']), '--peak-from', peakFrom);
  return perfArgs;
}
function command(executable, args, limitMs = 15 * 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: project, stdio: ['ignore', 'inherit', 'inherit'] });
    // Bound the complete subprocess, allowing perf's SIGTERM handler to clean Chrome up.
    let forceKill;
    const deadline = setTimeout(() => {
      child.kill('SIGTERM');
      forceKill = setTimeout(() => child.kill('SIGKILL'), 10_000);
    }, limitMs);
    const clearDeadline = () => { clearTimeout(deadline); clearTimeout(forceKill); };
    child.once('error', error => { clearDeadline(); reject(error); });
    child.once('exit', (code, signal) => { clearDeadline(); code === 0 ? resolve() : reject(new Error(`${path.basename(executable)} exited ${code ?? signal}`)); });
  });
}
export async function main(args = process.argv.slice(2)) {
  const allowed = new Set(['--dist', '--out', '--runs', '--seconds', '--chrome', '--relay', '--check-build', '--time', '--weather', '--sky', '--uncapped-seconds', '--headroom-baseline', '--station-seconds', '--stations']);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`unknown option ${args[i]}`);
    if (args[i] !== '--check-build' && (!args[++i] || args[i].startsWith('--'))) throw new Error('option requires a value');
  }
  const flag = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const runs = Number(flag('--runs', '3'));
  if (!Number.isInteger(runs) || runs < 2 || runs > 20) throw new Error('--runs must be an integer from 2 to 20');
  await mkdir(scratch, { recursive: true, mode: 0o700 });
  const requested = path.resolve(flag('--out', path.join(scratch, 'axis08-evidence')));
  if (!requested.startsWith(`${scratch}${path.sep}`)) throw new Error('--out must be beneath worktree .scratch');
  // Verify existing ancestors before creating anything through a possible symlink.
  let ancestor = requested;
  while (true) { try { const actual = await realpath(ancestor); const root = await realpath(scratch); if (actual !== root && !actual.startsWith(`${root}${path.sep}`)) throw new Error('--out escapes private .scratch'); break; } catch (error) { if (error.code !== 'ENOENT') throw error; ancestor = path.dirname(ancestor); } }
  await mkdir(requested, { recursive: true, mode: 0o700 });
  const out = await mkdtemp(path.join(requested, 'run-'));
  const dist = flag('--dist') ? path.resolve(flag('--dist')) : path.join(out, 'dist');
  if (!flag('--dist')) await command(process.execPath, [path.join(project, 'node_modules/vite/bin/vite.js'), 'build', '--sourcemap', '--outDir', dist]);
  const invocation = ['node', 'tools/axis08-evidence.mjs', ...args];
  const report = { invocation, when: new Date().toISOString(), hardware: await hardwareReport(), build: await sizeReport(dist), browser: null, success: false };
  try {
    let firstPairReport;
    if (!args.includes('--check-build')) report.browser = await collectRuns(runs, async (index, laterPair) => {
      const runOut = path.join(out, `pair-${index + 1}`);
      const perfArgs = pairPerfArgs({ perf: path.join(here, 'perf.mjs'), dist, runOut, flag, peakFrom: laterPair ? firstPairReport.file : null });
      await command(process.execPath, perfArgs, PERF_PAIR_LIMIT_MS);
      const files = (await readdir(runOut)).filter(file => /^perf-.*\.json$/.test(file) && !file.startsWith('perf-failure-'));
      if (files.length !== 1) throw new Error('expected exactly one perf report per pair');
      const file = path.join(runOut, files[0]);
      const perfReport = JSON.parse(await readFile(file, 'utf8'));
      if (!laterPair) firstPairReport = { file, report: perfReport };
      return perfReport;
    });
    report.success = !args.includes('--check-build') && report.browser.targets.passed && report.build.appPayloadWithinBudget;
    report.status = args.includes('--check-build') ? 'build-only; browser timing/FPS/GPU not measured' : statusLine(report.browser, report.build);
  } catch (error) { report.status = `incomplete: ${error.message}`; }
  const file = path.join(out, 'axis08-evidence.json');
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const markdown = path.join(out, 'axis08-evidence.md');
  await writeFile(markdown, evidenceMarkdown(report), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ report: file, markdown, status: report.status, appPayloadGzipBytes: report.build.appPayloadGzipBytes, allEmittedGzipBytes: report.build.allEmittedGzipBytes, budgetBytes: BUDGET_BYTES }, null, 2));
  return args.includes('--check-build') ? (report.build.appPayloadWithinBudget ? 0 : 1) : report.success ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
