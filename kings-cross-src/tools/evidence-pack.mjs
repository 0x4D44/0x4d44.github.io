// Private evidence orchestration. Imports never run a command, browser or keychain lookup.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUBRIC = 'wrk_docs/2026.11.07 - KXLIVE - Scoring rubric and loop rules.md';
const IDS = Array.from({ length: 9 }, (_, i) => String(i + 1).padStart(2, '0'));
const inside = (root, file) => { const r = path.relative(root, file); return r !== '' && r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r); };
const slash = p => p.split(path.sep).join('/');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const dateFor = file => /td-Y9-(\d{4})(\d{2})(\d{2})\.ndjson$/.exec(path.basename(file))?.slice(1).join('-');
const fileOutput = p => ({ path: p, kind: 'file' });
const dirOutput = p => ({ path: p, kind: 'directory' });

export function optionsFrom(args, { root = ROOT, home = homedir(), now = new Date() } = {}) {
  const values = new Map(), flags = new Set(['--dry-run', '--gpu', '--help']);
  const allowed = new Set(['--out', '--data-dir', '--only', '--relay', '--chrome', '--recording', '--anchors', '--smart', '--sclass', '--raw-osm', '--live-seconds', '--relay-log']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!flags.has(key) && !allowed.has(key)) throw new Error(`unknown option ${key}`);
    if (values.has(key) && !['--recording', '--relay-log'].includes(key)) throw new Error(`duplicate ${key}`);
    if (flags.has(key)) values.set(key, [true]);
    else { const v = args[++i]; if (!v || v.startsWith('--')) throw new Error(`${key} needs a value`); values.set(key, [...values.get(key) ?? [], v]); }
  }
  const only = [...new Set((values.get('--only')?.[0] ?? IDS.join(',')).split(',').map(value => {
    const m = /^(?:axis-?)?0?([1-9])$/.exec(value.trim()); if (!m) throw new Error('--only requires axes 1..9, comma separated'); return `0${m[1]}`;
  }))].sort();
  const dataDir = path.resolve(values.get('--data-dir')?.[0] ?? path.join(home, 'kx-data'));
  const out = path.resolve(values.get('--out')?.[0] ?? path.join(root, '.scratch', `evidence-pack-${new Date(now).toISOString().replace(/[:.]/g, '-')}`));
  if (!inside(path.join(root, '.scratch'), out)) throw new Error('--out must be beneath this worktree .scratch');
  let relay;
  try { relay = new URL(values.get('--relay')?.[0] ?? 'http://127.0.0.1:8787'); } catch { throw new Error('--relay must be a loopback HTTP origin'); }
  if (!['http:', 'https:'].includes(relay.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(relay.hostname) || relay.username || relay.password || relay.pathname !== '/' || relay.search || relay.hash)
    throw new Error('--relay must be a loopback HTTP origin without credentials or a path');
  const liveSeconds = Number(values.get('--live-seconds')?.[0] ?? 3600);
  if (!Number.isInteger(liveSeconds) || liveSeconds < 1 || liveSeconds > 3600) throw new Error('--live-seconds must be an integer from 1 to 3600');
  return { root: path.resolve(root), dataDir, out, only, relay: relay.origin, liveSeconds,
    gpu: values.has('--gpu'), dryRun: values.has('--dry-run'), help: values.has('--help'), chrome: values.get('--chrome')?.[0],
    recordings: values.get('--recording')?.map(p => path.resolve(p)), relayLogs: values.get('--relay-log')?.map(p => path.resolve(p)) ?? [],
    anchors: path.resolve(values.get('--anchors')?.[0] ?? path.join(dataDir, 'anchors.json')),
    smart: path.resolve(values.get('--smart')?.[0] ?? path.join(dataDir, 'smart.json.gz')),
    sclass: path.resolve(values.get('--sclass')?.[0] ?? path.join(dataDir, 'sclass.json')),
    rawOsm: path.resolve(values.get('--raw-osm')?.[0] ?? path.join(dataDir, 'osm/kx-osm.json')) };
}

async function outputDirectory(options, dryRun) {
  const root = await realpath(options.root), scratch = path.join(root, '.scratch');
  try { if ((await lstat(scratch)).isSymbolicLink()) throw new Error('.scratch must not be a symlink'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; if (!dryRun) await mkdir(scratch, { mode: 0o700 }); }
  if (!inside(scratch, options.out)) throw new Error('output escapes private .scratch');
  let current = scratch;
  for (const segment of path.relative(scratch, options.out).split(path.sep)) {
    current = path.join(current, segment);
    try {
      const s = await lstat(current);
      if (s.isSymbolicLink() || !s.isDirectory()) throw new Error('output ancestor is not a private directory (symlink refused)');
      if (current === options.out) throw new Error('output must be fresh; directory already exists');
    } catch (e) { if (e.code !== 'ENOENT') throw e; if (!dryRun) await mkdir(current, { mode: 0o700 }); }
  }
}

/** Capture the size observed at open; an active recorder cannot extend this read forever. */
export async function freezeInput(source, destination, recording = false) {
  if (!(await lstat(source)).isFile()) throw new Error('input must be a regular file, not a symlink');
  const input = await open(source, 'r'); let output;
  try {
    const before = await input.stat(), sourceHash = createHash('sha256');
    output = await open(destination, 'wx', 0o600);
    let offset = 0, lastNewline = -1;
    const buffer = Buffer.alloc(65536);
    while (offset < before.size) {
      const { bytesRead } = await input.read(buffer, 0, Math.min(buffer.length, before.size - offset), offset);
      if (!bytesRead) throw new Error('input shrank during capture');
      const chunk = buffer.subarray(0, bytesRead); sourceHash.update(chunk);
      if (recording && chunk.lastIndexOf(10) >= 0) lastNewline = offset + chunk.lastIndexOf(10);
      await output.writeFile(chunk); offset += bytesRead;
    }
    let omittedBytes = 0, appendedNewline = false;
    if (recording && lastNewline + 1 < offset) {
      const tailSize = offset - lastNewline - 1;
      let complete = false;
      if (tailSize <= 2 * 1024 * 1024) {
        const tail = Buffer.alloc(tailSize); await input.read(tail, 0, tailSize, lastNewline + 1);
        try { const row = JSON.parse(tail.toString('utf8')); complete = Number.isFinite(row?.t) && row.e && typeof row.e === 'object'; } catch { /* incomplete append */ }
      }
      if (complete) { await output.write(Buffer.from('\n')); appendedNewline = true; }
      else { omittedBytes = tailSize; await output.truncate(lastNewline + 1); }
    }
    const after = await input.stat();
    await output.close(); output = null;
    return { source, path: destination, sourceBytes: before.size, sourceBytesAfter: after.size,
      sourcePrefixSha256: sourceHash.digest('hex'), omittedBytes, appendedNewline, ...await fingerprint(destination) };
  } finally { await output?.close(); await input.close(); }
}

async function fingerprint(file) {
  const f = await open(file, 'r'); const hash = createHash('sha256'); let bytes = 0;
  try { for await (const chunk of f.createReadStream({ autoClose: false })) { hash.update(chunk); bytes += chunk.length; } }
  finally { await f.close(); }
  return { bytes, sha256: hash.digest('hex') };
}

async function inventory(options) {
  const root = options.root, p = path.join(root, 'kings-cross-src'), specs = [];
  const add = (role, source, name, optional = false) => specs.push({ role, source, path: path.join(options.out, 'inputs', name), optional });
  add('graph', path.join(p, 'web/src/data/kx-track.json'), 'graph.json');
  add('overlay', path.join(p, 'web/src/data/kx-signals.json'), 'signals.json');
  add('anchors', options.anchors, 'anchors.json'); add('smart', options.smart, 'smart.json.gz');
  add('sclass', options.sclass, 'sclass.json'); add('raw-osm', options.rawOsm, 'raw-osm.json');
  let recordings = options.recordings;
  if (!recordings) {
    try { recordings = (await readdir(path.join(options.dataDir, 'recordings'))).filter(n => /^td-Y9-\d{8}\.ndjson$/.test(n)).sort().map(n => path.join(options.dataDir, 'recordings', n)); }
    catch (e) { if (e.code !== 'ENOENT') throw e; recordings = []; }
  }
  if (new Set(recordings).size !== recordings.length) throw new Error('duplicate recording input');
  for (const [i, source] of recordings.entries()) {
    const date = dateFor(source), role = `recording:${i}`;
    add(role, source, `recording-${String(i + 1).padStart(2, '0')}.ndjson`); specs.at(-1).date = date;
    if (date) add(`schedule:${i}`, path.join(options.dataDir, `schedule-${date}.json`), `schedule-${String(i + 1).padStart(2, '0')}.json`, true);
  }
  return specs;
}

export function rubricAxes(text) {
  return IDS.map(id => {
    const number = Number(id), section = text.split(new RegExp(`^### ${number}\\. `, 'm'))[1]?.split(/^### |^## /m)[0];
    const evidence = section?.match(/^- Evidence:.*(?:\n {2}[^\n]*)*/m)?.[0];
    if (!evidence) throw new Error(`frozen rubric has no Evidence line for axis ${id}`);
    return { id, name: section.split('\n')[0].trim(), evidence };
  });
}

// The documented registry supplies argv, never shell code. Reject anything outside its narrow grammar.
export function mutationSpecs(text, options, rawOsm) {
  return text.split(/\r?\n/).filter(line => /^python3 -I -u kings-cross-src\/tools\/mutation\/[\w-]+\.py(?: |$)/.test(line)).map(line => {
    const parts = line.trim().split(/\s+/), name = path.basename(parts[3], '.py');
    return { name, command: 'python3', args: parts.slice(1).map(arg => {
      if (arg.startsWith('.scratch/')) return path.join(options.out, 'axis-09/mutation-work', name);
      if (arg.endsWith('/kx-osm.json')) return rawOsm;
      return arg.startsWith('kings-cross-src') ? path.join(options.root, arg) : arg;
    }) };
  });
}

/** Older drivers sometimes exit zero with survivors; preserve their counts and names. */
export function mutationSummary(stdout, name) {
  const ratios = [...stdout.matchAll(/(\d+)\/(\d+)\s+[^\n;]*?(?:caught|killed)/gi)];
  const ratio = ratios.at(-1);
  const counts = [...stdout.matchAll(/(\d+) killed[;,]\s*(\d+) survived[;,]\s*(\d+) timeouts/gi)].at(-1);
  const names = [...new Set([...stdout.matchAll(/^\s*(?:\[SURVIVED\]|NOT CAUGHT:|SURVIVED[: ]|SURVIVOR:)\s*(.+)$/gm)].map(m => m[1].trim()))];
  let caught = ratio ? Number(ratio[1]) : null, total = ratio ? Number(ratio[2]) : null;
  if (counts) { caught = Number(counts[1]); total = caught + Number(counts[2]) + Number(counts[3]); }
  if (caught === null) {
    const all = /All (\d+) [^\n]*mutations were caught\./.exec(stdout), summary = /SUMMARY: (\d+) killed, (\d+) survived/.exec(stdout);
    caught = all ? Number(all[1]) : summary ? Number(summary[1]) : [...stdout.matchAll(/^\[?KILLED\b/gm)].length;
    total = all ? caught : summary ? caught + Number(summary[2]) : caught + names.length;
  }
  const equivalent = name === 'station' ? names.filter(n => n === 'pointInPolygon: wrong side of the edge') : [];
  const survivors = Math.max(0, total - caught, names.length);
  return { caught, total, survivors, names, equivalent,
    passed: total > 0 && survivors === equivalent.length };
}

export function buildPlan(o, inputs, mutations = []) {
  const p = path.join(o.root, 'kings-cross-src'), axis = n => path.join(o.out, `axis-${n}`), dist = path.join(o.out, 'dist');
  const input = role => inputs.find(i => i.role === role)?.path;
  const recordings = inputs.filter(i => i.role.startsWith('recording:'));
  const recArgs = recordings.flatMap(i => ['--recording', i.path]);
  const selected = new Set(o.only), motionNeeded = ['03', '04', '05'].some(n => selected.has(n));
  const steps = [], add = (id, n, command, args, extra = {}) => {
    steps.push({ id, axis: n, command, args, cwd: o.root, timeoutMs: 300000, required: true, needs: [], requires: [], inputs: [], outputs: [], ...extra });
  };
  const node = (id, n, tool, args, extra) => add(id, n, process.execPath, [path.join(p, 'tools', tool), ...args], extra);
  const capture = ['GPU', 'Chrome', 'loopback'];
  const chrome = o.chrome ? ['--chrome', o.chrome] : [];
  add('build', '00', 'npm', ['--prefix', p, 'run', 'build', '--', '--sourcemap', '--outDir', dist, '--emptyOutDir'], { outputs: [dirOutput(dist)] });
  if (selected.has('01')) {
    const legacy = path.join(o.root, '.scratch/round21-geometry'), target = path.join(axis('01'), 'geometry');
    node('01-geometry', '01', 'axis01-evidence.ts', ['--graph', input('graph'), '--out', legacy], {
      inputs: ['graph'], outputs: ['json', 'md'].flatMap(ext => [fileOutput(path.join(legacy, `axis01-evidence.${ext}`)), fileOutput(path.join(target, `axis01-evidence.${ext}`))]),
      copies: ['json', 'md'].map(ext => ({ source: path.join(legacy, `axis01-evidence.${ext}`), target: path.join(target, `axis01-evidence.${ext}`) })),
      note: 'CLI fixes its output to .scratch/round21-geometry; fresh results are copied into this pack.' });
    node('01-fidelity', '01', 'fidelity.ts', ['--raw', input('raw-osm'), '--json'], { inputs: ['raw-osm'], stdoutArtifact: path.join(axis('01'), 'osm-fidelity.json') });
    node('01-capture', '01', 'axis01-capture.mjs', ['--report', path.join(target, 'axis01-evidence.json'), '--dist', dist, '--out', path.join(axis('01'), 'shots'), ...chrome], {
      needs: capture, requires: ['build', '01-geometry'], outputs: [fileOutput(path.join(axis('01'), 'shots/captures.json'))] });
  }
  if (selected.has('02')) node('02-station', '02', 'evidence.mjs', ['--gpu', '--dist', dist, '--out', path.join(axis('02'), 'station'), '--raw-osm', input('raw-osm'), ...chrome], {
    needs: capture, requires: ['build'], inputs: ['raw-osm'], timeoutMs: 1800000,
    outputs: [fileOutput(path.join(axis('02'), 'station/manifest.json')), fileOutput(path.join(axis('02'), 'station/index.md'))],
    note: 'The station tool also collects supporting axes/checks; their gaps are preserved, not claimed as station failures.' });
  const motionOut = path.join(axis('05'), 'motion'), motionJson = path.join(motionOut, 'axis05-evidence.json');
  if (motionNeeded) node('05-motion', '05', 'axis05-evidence.ts', [...recArgs, '--anchors', input('anchors'), '--graph', input('graph'), '--smart', input('smart'), '--out', motionOut], {
    inputs: ['recordings', 'anchors', 'graph', 'smart'], outputs: [fileOutput(motionJson), fileOutput(path.join(motionOut, 'axis05-evidence.md'))],
    note: 'Motion is a prerequisite of dimensions and train capture; it is measured once and indexed under both axes.' });
  if (selected.has('03') || selected.has('05')) {
    const dim = path.join(axis('03'), 'dimensions'), shots = path.join(axis('03'), 'shots');
    node('03-dimensions', '03', 'axis03-evidence.ts', ['--motion-report', motionJson, '--out', dim], {
      requires: ['05-motion'], outputs: [fileOutput(path.join(dim, 'axis03-evidence.json')), fileOutput(path.join(dim, 'axis03-evidence.md'))] });
    node('03-train-capture', '03', 'train-capture.mjs', ['--motion', motionJson, '--dimensions', path.join(dim, 'axis03-evidence.json'), '--sclass', input('sclass'), '--dist', dist, '--out', shots, ...chrome], {
      axes: ['03', '05'], needs: capture, requires: ['build', '05-motion', '03-dimensions'], inputs: ['sclass'], timeoutMs: 900000, outputs: [fileOutput(path.join(shots, 'captures.json'))] });
    if (selected.has('05')) node('05-portal-capture', '05', 'train-capture.mjs', ['--motion', motionJson, '--dimensions', path.join(dim, 'axis03-evidence.json'), '--sclass', input('sclass'), '--dist', dist, '--out', path.join(axis('05'), 'portal-capture'), '--mode', 'portal', ...chrome], {
      needs: capture, requires: ['build', '05-motion', '03-dimensions'], inputs: ['sclass'], timeoutMs: 900000,
      outputs: [fileOutput(path.join(axis('05'), 'portal-capture/captures.json'))],
      note: 'Portal entry uses the same frozen motion, dimensions, sclass and fresh build as the ordinary train capture, with an independent output directory.' });
  }
  if (selected.has('04')) {
    const replay = path.join(axis('04'), 'replay'), live = path.join(axis('04'), 'live');
    node('04-replay', '04', 'replay-report.ts', [...recArgs, '--anchors', input('anchors'), '--graph', input('graph'), '--smart', input('smart'), '--out', replay], {
      inputs: ['recordings', 'anchors', 'graph', 'smart'], outputs: [fileOutput(path.join(replay, 'replay-report.json')), fileOutput(path.join(replay, 'replay-report.md'))] });
    for (const [i, recording] of recordings.entries()) {
      const target = path.join(axis('04'), `board-${recording.date ?? i}`);
      node(`04-board-${i}`, '04', 'board-vs-trust.ts', ['--recording', recording.path, '--schedule', input(`schedule:${i}`) ?? path.join(o.out, `inputs/schedule-${i}.json`), '--anchors', input('anchors'), '--hourly', '--out', target], {
        required: false, inputs: [recording.role, `schedule:${i}`, 'anchors'], outputs: [fileOutput(path.join(target, 'board-vs-trust.json')), fileOutput(path.join(target, 'board-vs-trust.md'))],
        note: 'No cached timetable is an explicit gap, not fabricated board agreement.' });
    }
    node('04-live', '04', 'live-vs-replay.ts', ['--out', live, '--seconds', String(o.liveSeconds), '--start', 'checkpoint', '--checkpoint-wait', '610', '--relay', o.relay], {
      needs: ['loopback', 'running relay'], timeoutMs: (o.liveSeconds + 655) * 1000,
      outputs: [fileOutput(path.join(live, 'live-vs-replay.json')), fileOutput(path.join(live, 'live-vs-replay.md'))],
      note: 'Fresh live capture uses the relay state at capture time; its own anchors/schedule hashes are retained. It is distinct from the frozen historical inputs.' });
    const board = recordings.length ? path.join(axis('04'), `board-${recordings[0].date ?? 0}/board-vs-trust.json`) : null;
    node('04-summary', '04', 'axis04-summary.ts', ['--out', path.join(axis('04'), 'summary'), '--replay-report', path.join(replay, 'replay-report.json'), '--live-report', path.join(live, 'live-vs-replay.json'), ...(board ? ['--board-report', board] : []), '--relay', o.relay], {
      outputs: [fileOutput(path.join(axis('04'), 'summary/axis-04-summary.json')), fileOutput(path.join(axis('04'), 'summary/axis-04-summary.md'))],
      note: 'The summary records absent/failed inputs as gaps; later board dates are linked individually.' });
  }
  if (selected.has('06')) {
    const target = path.join(axis('06'), 'signals');
    node('06-signals', '06', 'signal-report.ts', [...recArgs, '--anchors', input('anchors'), '--table', input('sclass'), '--raw', input('raw-osm'), '--out', target], {
      inputs: ['recordings', 'anchors', 'sclass', 'raw-osm', 'graph', 'overlay'], outputs: [fileOutput(path.join(target, 'signal-report.json')), fileOutput(path.join(target, 'signal-report.md')), fileOutput(path.join(target, 'sclass.json'))] });
    node('06-capture', '06', 'signal-capture.mjs', ['--pack', path.join(target, 'signal-report.json'), '--dist', dist, '--out', path.join(axis('06'), 'shots'), ...chrome], {
      needs: capture, requires: ['build', '06-signals'], timeoutMs: 900000, outputs: [fileOutput(path.join(axis('06'), 'shots/captures.json'))] });
  }
  if (selected.has('07')) {
    const relayTests = path.join(p, 'relay/tests');
    add('07-relay-tests', '07', process.execPath, ['--test', '--test-timeout=20000', ...['*.test.mjs'].map(n => path.join(relayTests, n))], { needs: ['loopback'] });
    const mutation = mutations.find(m => m.name === 'relay');
    if (mutation) add('07-relay-mutations', '07', mutation.command, mutation.args, { needs: ['loopback'], mutation: mutation.name, timeoutMs: 1800000 });
    const probeFile = path.join(axis('07'), 'relay-probe.json');
    const code = `const {probeRelaySecurity}=await import(${JSON.stringify(pathToFileURL(path.join(p, 'tools/axis07-relay.mjs')).href)}); const fs=await import('node:fs/promises'); const r=await probeRelaySecurity({out:${JSON.stringify(path.join(axis('07'), 'probe'))}}); await fs.writeFile(${JSON.stringify(probeFile)},JSON.stringify(r,null,2)+'\\n',{mode:0o600}); process.exitCode=r.status==='PASS'?0:1;`;
    add('07-refusals', '07', process.execPath, ['--input-type=module', '-e', code], { needs: ['loopback'], outputs: [fileOutput(probeFile)] });
    node('07-browser', '07', 'axis07-browser.mjs', ['--gpu', '--dist', dist, '--out', path.join(axis('07'), 'browser'), ...chrome], {
      needs: capture, requires: ['build'], timeoutMs: 900000, outputs: [fileOutput(path.join(axis('07'), 'browser/axis07-browser.json'))] });
    node('07-recording-latency', '07', 'axis07-recording-latency.mjs', [...recArgs, '--out', path.join(axis('07'), 'recording-latency')], {
      inputs: ['recordings'], outputs: [fileOutput(path.join(axis('07'), 'recording-latency/recording-latency.json')), fileOutput(path.join(axis('07'), 'recording-latency/recording-latency.md'))] });
    node('07-loopback-latency', '07', 'axis07-latency.mjs', ['--count', '1000'], { needs: ['loopback'], stdoutArtifact: path.join(axis('07'), 'loopback-latency.json') });
    node('07-keychain-manual', '07', 'axis07-evidence.mjs', ['--dist', dist, '--out', path.join(axis('07'), 'arthur-security'), '--data-dir', o.dataDir,
      '--browser-report', path.join(axis('07'), 'browser/axis07-browser.json'),
      ...(o.relayLogs.length ? o.relayLogs : ['<actual-relay-log-path>']).flatMap(p => ['--relay-log', p])], {
      manual: true, required: false, needs: ['keychain (Arthur only)', 'loopback'], note: 'Never executed by this pack. Arthur supplies every relay log path; no account identifier is accepted by the pack.' });
  }
  if (selected.has('08')) node('08-performance', '08', 'axis08-evidence.mjs', ['--dist', dist, '--out', path.join(axis('08'), 'performance'), '--runs', '3', ...chrome], {
    needs: capture, requires: ['build'], timeoutMs: 1800000, outputs: [dirOutput(path.join(axis('08'), 'performance'))],
    note: 'Tool creates a fresh run-* directory: machine, per-file gzip size, cold/warm starts and FPS are linked recursively.' });
  if (selected.has('09')) {
    add('09-tests', '09', 'npm', ['run', 'test:kings-cross'], { needs: ['loopback'] });
    add('09-typecheck', '09', 'npm', ['--prefix', p, 'run', 'typecheck']);
    add('09-responsive', '09', process.execPath, [path.join(o.root, 'tests/responsive.test.mjs')], { needs: capture, timeoutMs: 600000,
      note: 'Existing responsive CLI tests the committed Pages tree, including kings-cross/, not the fresh dist. No slug/dist selector exists.' });
    add('09-catalog', '09', process.execPath, [path.join(o.root, 'tests/almanac-return.test.mjs')], { needs: capture, timeoutMs: 600000 });
    for (const m of mutations) {
      if (m.name === 'relay' && selected.has('07')) continue;
      add(`09-mutation-${m.name}`, '09', m.command, m.args, { needs: ['loopback'], mutation: m.name, timeoutMs: 1800000,
        inputs: m.name === 'station' ? ['raw-osm'] : [], note: 'Private isolated copies; drivers with fixed scratch roots retain their own scratch work outside the pack. Their complete logs stay here.' });
    }
  }
  return steps;
}

/** No shell, ignored stdin, bounded logs and a process-group deadline including Chrome children. */
export function runCommand(step) {
  return new Promise(resolve => {
    const started = performance.now(), child = spawn(step.command, step.args, { cwd: step.cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let stdout = '', stderr = '', truncated = false, timedOut = false, killTimer;
    const limit = 4 * 1024 * 1024;
    const collect = name => chunk => { if (name === 'out') { const left = Math.max(0, limit - stdout.length); stdout += chunk.toString().slice(0, left); if (chunk.length > left) truncated = true; }
      else { const left = Math.max(0, limit - stderr.length); stderr += chunk.toString().slice(0, left); if (chunk.length > left) truncated = true; } };
    child.stdout.on('data', collect('out')); child.stderr.on('data', collect('err'));
    const kill = signal => { try { if (process.platform !== 'win32') process.kill(-child.pid, signal); else child.kill(signal); } catch { /* already exited */ } };
    const timer = setTimeout(() => { timedOut = true; kill('SIGTERM'); killTimer = setTimeout(() => kill('SIGKILL'), 2000); killTimer.unref(); }, step.timeoutMs);
    let done = false;
    const finish = (code, signal, error) => { if (done) return; done = true; clearTimeout(timer); clearTimeout(killTimer); resolve({ code, signal, timedOut, stdout, stderr, truncated, error, durationMs: performance.now() - started }); };
    child.once('error', e => finish(127, null, e.code ?? 'spawn failed')); child.once('close', (code, signal) => finish(code, signal));
  });
}

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('artifact symlink refused');
    if (entry.isDirectory()) result.push(...await filesUnder(file)); else if (entry.isFile()) result.push(file);
  }
  return result.sort();
}

async function buildSources(root) {
  const pkg = path.join(root, 'kings-cross-src'), files = [];
  for (const name of ['core', 'web/src', 'tools']) {
    try { files.push(...(await filesUnder(path.join(pkg, name))).filter(f => /\.(?:ts|mjs|js|json|html|css)$/.test(f))); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  for (const name of ['package.json', 'package-lock.json', 'vite.config.ts', 'web/index.html']) {
    const file = path.join(pkg, name); try { if ((await lstat(file)).isFile()) files.push(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return Promise.all([...new Set(files)].sort().map(async file => ({ file: slash(path.relative(root, file)), ...await fingerprint(file) })));
}

async function safeArtifactAncestors(root, file) {
  const scratch = path.join(root, '.scratch');
  if (!inside(scratch, file)) throw new Error('command output escapes .scratch');
  let current = scratch;
  for (const name of path.relative(scratch, file).split(path.sep)) {
    current = path.join(current, name);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('command output ancestor is a symlink'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}

function commandText(step) { return [step.command, ...step.args].map(s => /^[\w./:=,-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`).join(' '); }
const link = (from, target) => slash(path.relative(from, target)).split('/').map(encodeURIComponent).join('/');
const md = text => String(text).replace(/[\r\n|]/g, ' ');

async function indexes(report, axes, options) {
  const save = async (file, text) => { await mkdir(path.dirname(file), { recursive: true, mode: 0o700 }); await writeFile(file, text, { mode: 0o600 }); };
  const inputTable = ['| Input | Bytes used | SHA-256 of used bytes |', '|---|---:|---|', ...report.inputs.map(i => `| ${md(i.role)} | ${i.bytes ?? '—'} | ${i.sha256 ?? md(i.error ?? 'not captured')} |`)];
  report.axes = axes.map(a => ({ ...a, selected: options.only.includes(a.id), steps: report.steps.filter(s => s.axis === a.id || s.axes?.includes(a.id)), readme: `axis-${a.id}/README.md` }));
  for (const a of report.axes) {
    const dir = path.join(options.out, `axis-${a.id}`), lines = [`# Axis ${a.id}: ${a.name}`, '', a.evidence, '',
      'This is the frozen rubric evidence requirement, quoted verbatim. Collection success is not a score or proof that every rubric condition passes.', '',
      `Selection: ${a.selected ? 'requested' : a.steps.length ? 'dependency of a requested axis' : 'not selected'}.`, '',
      '[Pack manifest and input hashes](../manifest.json). [Build](../dist/). All outputs are private; do not commit or publish this directory.', '',
      '| Step | Status | Exit | Duration (ms) | Requirements | Evidence |', '|---|---|---:|---:|---|---|'];
    for (const s of a.steps) {
      const artifacts = (s.artifacts ?? []).map(f => `[${md(path.basename(f))}](${link(dir, path.join(options.out, f))})`);
      if (s.log) artifacts.unshift(`[command log](${link(dir, path.join(options.out, s.log))})`);
      lines.push(`| ${s.id} | ${s.status ?? 'planned'} | ${s.code ?? '—'} | ${s.durationMs ?? '—'} | ${s.needs.join(', ') || 'Node / local inputs'} | ${artifacts.join(', ') || '—'} |`);
    }
    for (const s of a.steps) lines.push('', `## ${s.id}`, '', s.reason ?? s.note ?? '', '', ...(s.note && s.reason ? [s.note, ''] : []), `Working directory: ${s.cwd}`, '', '```sh', commandText(s), '```');
    if (a.id === '03' || a.id === '05') lines.push('', 'Train captures include standing/arrival/departure sequences; [shared motion inputs](../axis-05/motion/axis05-evidence.json) and [capture manifest](../axis-03/shots/captures.json). Motion auditing currently distinguishes original captured anchors from SMART-reconciled replay anchors; inspect both fingerprints in its report.');
    if (a.id === '06') lines.push('', 'The [reviewed decoded table](signals/sclass.json), [decoded/unknown address report](signals/signal-report.md) and [per-state captures](shots/captures.json) preserve unknowns and inferred-position labels.');
    if (a.id === '07') lines.push('', 'The keychain command above is MANUAL and is never invoked by this runner. Arthur must run it before claiming the account-name/history/build/recording/log sweep is clean. The runner does not accept or look up an account identifier.');
    if (a.id === '09') lines.push('', 'Per-axis mutation logs include killed counts and survivor details; counts are also in the manifest. The station driver documents one equivalent point-in-polygon survivor in tools/mutation/README.md. It is explicitly identified; every other survivor fails collection.');
    lines.push('', '## Frozen inputs', '', ...inputTable, '');
    await save(path.join(dir, 'README.md'), lines.join('\n'));
  }
  await save(path.join(options.out, 'inputs/input-hashes.json'), JSON.stringify(report.inputs, null, 2) + '\n');
  await save(path.join(options.out, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
  await save(path.join(options.out, 'README.md'), ['# King’s Cross scorer evidence pack', '',
    `Collection status: **${report.status}**; required failed/blocked steps: ${report.steps.filter(s => s.required && ['failed', 'blocked'].includes(s.status)).length}.`, '',
    'The pack contains private Network Rail-derived data. Keep it under .scratch; do not publish or commit it. All historical tools use the same frozen inputs. Fresh live capture records its own later interval and hashes. Keychain checks remain manual.', '',
    `[Machine-readable manifest, argv, statuses and input hashes](manifest.json). [Frozen rubric](rubric.md). [One fresh source-map build](dist/).`, '',
    ...report.axes.map(a => `- [${a.id}. ${a.name}](${a.readme}) — ${a.selected ? 'selected' : 'not selected / dependency only'}`), '',
    '## Input hashes', '', ...inputTable, '', '## Reproduce this collection', '', '```sh', report.reproduce, '```', ''].join('\n'));
}

export async function runEvidencePack(args = process.argv.slice(2), dependencies = {}) {
  const options = optionsFrom(args, dependencies), print = dependencies.print ?? (() => {});
  const rubric = await readFile(path.join(options.root, RUBRIC), 'utf8'), axes = rubricAxes(rubric);
  const registry = await readFile(path.join(options.root, 'kings-cross-src/tools/mutation/README.md'), 'utf8');
  const inputs = await inventory(options), mutations = mutationSpecs(registry, options, inputs.find(i => i.role === 'raw-osm').path);
  const plan = buildPlan(options, inputs, mutations);
  const undocumented = (await readdir(path.join(options.root, 'kings-cross-src/tools/mutation'))).filter(n => n.endsWith('.py') && !mutations.some(m => `${m.name}.py` === n)).sort();
  if (options.only.includes('09') && undocumented.length) plan.push({
    id: '09-mutation-registry', axis: '09', command: 'internal mutation command registry check', args: [], cwd: options.root,
    required: true, needs: [], requires: [], inputs: [], outputs: [], timeoutMs: 1,
    unavailableReason: `Mutation drivers without a documented command: ${undocumented.join(', ')}. Add their actual argv to tools/mutation/README.md; no arguments are guessed.`,
  });
  await outputDirectory(options, options.dryRun);
  if (options.dryRun) { const result = { out: options.out, status: 'DRY_RUN', exitCode: 0, inputs, axes, plan, steps: plan }; print(JSON.stringify(result, null, 2)); return result; }
  await mkdir(path.join(options.out, 'inputs'), { mode: 0o700 });
  await mkdir(path.join(options.out, 'logs'), { mode: 0o700 });
  // Only capture inputs actually consumed by selected steps. Never read the keychain or relay logs here.
  const used = new Set(plan.flatMap(s => s.inputs));
  for (const i of inputs) {
    if (!used.has(i.role) && !(used.has('recordings') && i.role.startsWith('recording:'))) { i.status = 'not used'; continue; }
    try { Object.assign(i, await freezeInput(i.source, i.path, i.role.startsWith('recording:')), { status: 'captured' }); }
    catch (e) { i.status = 'unavailable'; i.error = `input capture failed (${e.code ?? 'invalid file'})`; }
  }
  await writeFile(path.join(options.out, 'rubric.md'), rubric, { mode: 0o600 });
  const report = { schemaVersion: 1, generatedAt: new Date(dependencies.now ?? Date.now()).toISOString(), out: options.out, status: 'INCOMPLETE', exitCode: 0,
    inputs, rubricSha256: sha(rubric), mutationRegistrySha256: sha(registry), plan, steps: [], axes: [], build: { path: path.join(options.out, 'dist'), sourceMaps: true },
    reproduce: commandText({ command: 'node', args: [path.join(options.root, 'kings-cross-src/tools/evidence-pack.mjs'), ...args] }) };
  report.build.sourceInputs = await buildSources(options.root);
  // A source edit between freezing the graph and starting the build must not pair two geometries.
  for (const i of inputs.filter(i => ['graph', 'overlay'].includes(i.role) && i.status === 'captured')) {
    const source = report.build.sourceInputs.find(s => s.file === slash(path.relative(options.root, i.source)));
    if (source?.sha256 !== i.sha256) { i.status = 'unavailable'; i.error = 'source changed between input capture and build'; }
  }
  const execute = dependencies.runCommand ?? runCommand;
  for (const step of plan) {
    const result = { ...step, status: 'planned', code: null, durationMs: 0, artifacts: [] };
    const missing = step.inputs.filter(role => role === 'recordings' ? inputs.filter(i => i.role.startsWith('recording:') && i.status === 'captured').length < 2 : !inputs.some(i => i.role === role && i.status === 'captured'));
    const failedDependencies = step.requires.filter(id => report.steps.find(s => s.id === id)?.status !== 'passed');
    if (step.manual) { result.status = 'manual'; result.reason = 'Arthur only; this command is never executed by the pack.'; }
    else if (step.unavailableReason) { result.status = 'blocked'; result.reason = step.unavailableReason; }
    else if (step.needs.includes('GPU') && !options.gpu) { result.status = 'deferred'; result.reason = 'Pass --gpu on the real GPU host to collect this evidence.'; }
    else if (missing.length || failedDependencies.length) {
      result.status = step.required ? 'blocked' : 'gap'; result.reason = missing.length ? `Unavailable inputs: ${missing.join(', ')}` : `Required commands did not pass: ${failedDependencies.join(', ')}`;
    } else {
      const began = performance.now();
      try {
        // Directories are created only for explicit outputs; exclusive per-axis tools get fresh subdirectories.
        for (const output of step.outputs) { await safeArtifactAncestors(options.root, output.path); await mkdir(path.dirname(output.path), { recursive: true, mode: 0o700 }); }
        const value = await execute(step); Object.assign(result, value, { durationMs: value.durationMs ?? performance.now() - began });
        result.log = `logs/${step.id}.log`;
        await writeFile(path.join(options.out, result.log), `${commandText(step)}\n\n${value.stdout ?? ''}${value.stderr ?? ''}`, { mode: 0o600 });
        delete result.stdout; delete result.stderr;
        result.status = value.code === 0 && !value.timedOut ? 'passed' : 'failed';
        if (step.mutation) {
          result.mutations = mutationSummary(value.stdout ?? '', step.mutation);
          if (value.truncated || !result.mutations.passed) { result.status = 'failed'; result.reason = 'Mutation evidence is incomplete or contains unexpected survivors; inspect counts and command log.'; }
        }
        if (result.status === 'passed') {
          for (const copy of step.copies ?? []) { await mkdir(path.dirname(copy.target), { recursive: true }); await copyFile(copy.source, copy.target); }
          if (step.stdoutArtifact) { await mkdir(path.dirname(step.stdoutArtifact), { recursive: true }); await writeFile(step.stdoutArtifact, value.stdout ?? '', { mode: 0o600 }); result.artifacts.push(slash(path.relative(options.out, step.stdoutArtifact))); }
          for (const output of step.outputs) {
            const s = await lstat(output.path);
            if (s.isSymbolicLink() || (output.kind === 'directory' ? !s.isDirectory() : !s.isFile())) throw new Error('missing or unsafe command output');
            const files = s.isDirectory() ? await filesUnder(output.path) : path.basename(output.path) === 'captures.json' ? await filesUnder(path.dirname(output.path)) : [output.path];
            if (!files.length) throw new Error('command output directory is empty');
            for (const f of files) if (inside(options.out, f)) result.artifacts.push(slash(path.relative(options.out, f)));
          }
          if (step.id === 'build') {
            const files = await filesUnder(report.build.path);
            if (!files.some(f => f.endsWith('.map')) || !files.includes(path.join(report.build.path, 'index.html'))) throw new Error('fresh build is missing index.html or source maps');
            report.build.files = await Promise.all(files.map(async f => ({ path: slash(path.relative(options.out, f)), ...await fingerprint(f) })));
          }
        }
      } catch (e) { result.status = 'failed'; result.reason = `Command or artifact validation failed (${e.code ?? e.message})`; result.durationMs = performance.now() - began; }
    }
    report.steps.push(result);
    report.exitCode = report.steps.some(s => s.required && ['failed', 'blocked'].includes(s.status)) ? 1 : 0;
    report.status = report.exitCode ? 'FAIL' : report.steps.some(s => ['manual', 'deferred', 'gap'].includes(s.status)) ? 'INCOMPLETE' : 'PASS';
    await indexes(report, axes, options);
    print(`${result.id}: ${result.status}`);
  }
  const currentSources = await buildSources(options.root);
  report.build.sourcesUnchanged = JSON.stringify(report.build.sourceInputs) === JSON.stringify(currentSources);
  if (!report.build.sourcesUnchanged) {
    report.steps.push({ id: 'source-consistency', axis: '00', command: 'internal source fingerprint comparison', args: [], cwd: options.root,
      needs: [], required: true, status: 'failed', durationMs: 0, reason: 'Source changed during collection; reports may no longer describe the one built scene. Rerun on stable source.', artifacts: [] });
    report.exitCode = 1; report.status = 'FAIL';
  }
  await indexes(report, axes, options);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('node tools/evidence-pack.mjs [--gpu] [--dry-run] [--only 01,04,07] [--out .scratch/evidence-pack-DATE] [--data-dir ~/kx-data] [--relay http://127.0.0.1:8787] [--live-seconds 3600] [--chrome PATH] [--relay-log PATH]');
  else runEvidencePack(process.argv.slice(2), { print: console.log }).then(r => { process.exitCode = r.exitCode; if (r.status !== 'DRY_RUN') console.log(JSON.stringify({ out: r.out, status: r.status, exitCode: r.exitCode })); })
    .catch(e => { console.error(`evidence-pack: ${e.message}`); process.exitCode = 1; });
}
