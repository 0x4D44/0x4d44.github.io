// Run from kings-cross-src: node tools/axis08-evidence.mjs [--dist DIR] [--runs 3]
// [--out ../.scratch/axis08-evidence] [--chrome PATH] [--relay URL] [--seconds 60]
// Omitting --dist builds with source maps into a fresh private .scratch directory.
// Full evidence exits successfully only with genuine, unthrottled Metal on both FPS cameras
// 60 FPS median/p5, warm first render <3 s, and app gzip below 2 MB; all-emitted including maps has its own explicit budget result.
// --check-build reports hardware and EVERY emitted file without claiming browser measurements.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const scratch = path.resolve(project, '..', '.scratch');
export const BUDGET_BYTES = 2_000_000;
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
  return { files, budgetBytes: BUDGET_BYTES, budgetDefinition: 'Strict < 2 MB (2000000 bytes), sum of each file independently gzipped. App payload includes geometry, lazy chunks and all non-map files. Source maps are explicitly separate but remain in all-emitted total. Excludes relay recording/network data and the shared external almanac-back.js.', allEmittedGzipBytes, appPayloadGzipBytes, sourceMapsGzipBytes: allEmittedGzipBytes - appPayloadGzipBytes, allEmittedWithinBudget: allEmittedGzipBytes < BUDGET_BYTES, appPayloadWithinBudget: appPayloadGzipBytes < BUDGET_BYTES };
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
      samples[name].push({ firstRenderMs, sceneReadyMs });
    }
  }
  const summarize = values => { const sorted = [...values].sort((a, b) => a - b); return { min: sorted[0], median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2, max: sorted.at(-1) }; };
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
  const targets = { fpsTarget: 60, warmFirstRenderLimitMs: 3000, warmFirstRenderStrict: true, frameBudgetMs: 1000 / 60,
    cameraTargets, warmFirstRenderWithin3s, fpsAtLeast60, passed: genuineMetal && warmFirstRenderWithin3s && fpsAtLeast60,
    definition: 'Both camera median and p5 FPS must be >=60; every warm first render must be strictly <3000 ms; genuine unthrottled Metal required. Frame p95/p99 comparisons are disclosed separately.' };
  return { samples, targets, gaps, aggregates: Object.fromEntries(Object.entries(samples).map(([name, rows]) => [name, { firstRenderMs: summarize(rows.map(row => row.firstRenderMs)), sceneReadyMs: summarize(rows.map(row => row.sceneReadyMs)) }])), cameras, genuineMetal, timingDefinition: 'Navigation-relative draw submission completion after renderer.render, not GPU completion/display presentation. First render is the initial visible-scene draw submission; full scene requires cityLoaded completion, terrain and city buildings present, and a subsequent render. Each cold/warm pair uses an independent clean Chrome profile; warm is the cache-enabled second navigation in that same profile. OS/filesystem caches are not flushed. Replay train drawing is also required by perf before collecting each sample.' };
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
    `All emitted gzip including maps: ${b.allEmittedGzipBytes} / ${b.budgetBytes} B: ${verdict(b.allEmittedWithinBudget)}. Source maps: ${b.sourceMapsGzipBytes} B.`, '',
    b.budgetDefinition, '', '| Emitted file | Classification | Bytes | Gzip bytes |', '| --- | --- | ---: | ---: |',
    ...b.files.map(row => `| ${cell(row.file)} | ${row.classification} | ${row.bytes} | ${row.gzipBytes} |`), ''];
  if (browser) {
    lines.push(browser.timingDefinition, '', browser.targets.definition, '',
      `Genuine unthrottled Metal: ${verdict(browser.genuineMetal)}. FPS target: ${verdict(browser.targets.fpsAtLeast60)}. All warm first renders <3 s: ${verdict(browser.targets.warmFirstRenderWithin3s)}.`, '',
      '| Profile | Pair | First render ms | Full scene ready ms |', '| --- | ---: | ---: | ---: |');
    for (const [name, rows] of Object.entries(browser.samples)) rows.forEach((row, index) => lines.push(`| ${name} | ${index + 1} | ${row.firstRenderMs} | ${row.sceneReadyMs} |`));
    lines.push('', '| Profile | Milestone | Min ms | Median ms | Max ms |', '| --- | --- | ---: | ---: | ---: |');
    for (const [name, measures] of Object.entries(browser.aggregates)) for (const [milestone, stats] of Object.entries(measures)) lines.push(`| ${name} | ${milestone} | ${stats.min} | ${stats.median} | ${stats.max} |`);
    lines.push('', '| Camera | Renderer | Median FPS | p5 FPS | p95 frame ms | p99 frame ms | Median >=60 | p5 >=60 | p95 <=16.667 ms | p99 <=16.667 ms |', '| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |');
    for (const name of ['overview', 'shed']) {
      const camera = browser.cameras[name], target = browser.targets.cameraTargets[name];
      lines.push(`| ${name} | ${cell(camera?.renderer)} | ${show(camera?.fps?.median)} | ${show(camera?.fps?.p5)} | ${show(camera?.frameMs?.p95)} | ${show(camera?.frameMs?.p99)} | ${verdict(target.medianFpsAtLeast60)} | ${verdict(target.p5FpsAtLeast60)} | ${verdict(target.p95FrameWithinBudget)} | ${verdict(target.p99FrameWithinBudget)} |`);
    }
  } else lines.push('Browser timing, FPS and genuine Metal: NOT MEASURED.');
  lines.push('', 'Limitations and gaps:', '',
    '- Draw submission timing does not establish GPU completion or actual display presentation. OS/filesystem caches are not flushed.',
    '- Each browser pair runs existing perf instrumentation; FPS is measured on the first pair only. Later pairs measure startup. CPU-profile loads are separate from timing loads.',
    '- Replay availability and local relay latency affect startup. Snapshots may differ between loads. No recording bodies, screenshots or raw CPU profiles are saved.',
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
function command(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: project, stdio: ['ignore', 'inherit', 'inherit'] });
    // Bound the complete subprocess, allowing perf's SIGTERM handler to clean Chrome up.
    let forceKill;
    const deadline = setTimeout(() => {
      child.kill('SIGTERM');
      forceKill = setTimeout(() => child.kill('SIGKILL'), 10_000);
    }, 15 * 60_000);
    const clearDeadline = () => { clearTimeout(deadline); clearTimeout(forceKill); };
    child.once('error', error => { clearDeadline(); reject(error); });
    child.once('exit', (code, signal) => { clearDeadline(); code === 0 ? resolve() : reject(new Error(`${path.basename(executable)} exited ${code ?? signal}`)); });
  });
}
export async function main(args = process.argv.slice(2)) {
  const allowed = new Set(['--dist', '--out', '--runs', '--seconds', '--chrome', '--relay', '--check-build']);
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
    if (!args.includes('--check-build')) report.browser = await collectRuns(runs, async (index, startupOnly) => {
      const runOut = path.join(out, `pair-${index + 1}`);
      const perfArgs = [path.join(here, 'perf.mjs'), '--dist', dist, '--out', runOut, '--scene-ready'];
      for (const name of ['--seconds', '--chrome', '--relay']) if (flag(name)) perfArgs.push(name, flag(name));
      if (startupOnly) perfArgs.push('--startup-only');
      await command(process.execPath, perfArgs);
      const files = (await readdir(runOut)).filter(file => /^perf-.*\.json$/.test(file) && !file.startsWith('perf-failure-'));
      if (files.length !== 1) throw new Error('expected exactly one perf report per pair');
      return JSON.parse(await readFile(path.join(runOut, files[0]), 'utf8'));
    });
    report.success = !args.includes('--check-build') && report.browser.targets.passed && report.build.appPayloadWithinBudget;
    report.status = args.includes('--check-build') ? 'build-only; browser timing/FPS/GPU not measured' : report.success ? 'pass: genuine Metal, >=60 median/p5 FPS, warm first render <3 s and app payload budget' : 'fail: GPU/FPS, warm startup or app payload budget requirement failed';
  } catch (error) { report.status = `incomplete: ${error.message}`; }
  const file = path.join(out, 'axis08-evidence.json');
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const markdown = path.join(out, 'axis08-evidence.md');
  await writeFile(markdown, evidenceMarkdown(report), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ report: file, markdown, status: report.status, appPayloadGzipBytes: report.build.appPayloadGzipBytes, allEmittedGzipBytes: report.build.allEmittedGzipBytes, budgetBytes: BUDGET_BYTES }, null, 2));
  return args.includes('--check-build') ? (report.build.appPayloadWithinBudget ? 0 : 1) : report.success ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
