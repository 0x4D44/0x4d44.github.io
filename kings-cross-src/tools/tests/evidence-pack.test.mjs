import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { mutationSummary, optionsFrom, runCommand, runEvidencePack } from '../evidence-pack.mjs';

const actualRoot = path.resolve(import.meta.dirname, '../../..');
const rubric = 'wrk_docs/2026.11.07 - KXLIVE - Scoring rubric and loop rules.md';
const now = new Date('2026-11-09T12:34:56Z');
const exists = async file => access(file).then(() => true, () => false);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const roots = [];
after(async () => { for (const root of roots) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const base = path.join(actualRoot, '.scratch', 'evidence-pack-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'case-'));
  roots.push(root);
  const home = path.join(root, 'home'), data = path.join(home, 'kx-data');
  for (const dir of ['.scratch', 'wrk_docs', 'kings-cross-src/tools/mutation', 'kings-cross-src/web/src/data', 'home/kx-data/recordings', 'home/kx-data/osm']) await mkdir(path.join(root, dir), { recursive: true });
  await copyFile(path.join(actualRoot, rubric), path.join(root, rubric));
  await copyFile(path.join(actualRoot, 'kings-cross-src/tools/mutation/README.md'), path.join(root, 'kings-cross-src/tools/mutation/README.md'));
  await writeFile(path.join(root, 'kings-cross-src/package.json'), '{"scripts":{"build":"vite build"}}');
  await writeFile(path.join(root, 'kings-cross-src/web/src/data/kx-track.json'), '{"nodes":[],"rails":[],"platforms":[]}');
  await writeFile(path.join(root, 'kings-cross-src/web/src/data/kx-signals.json'), '{"signals":[]}');
  await writeFile(path.join(data, 'anchors.json'), '{"area":"Y9","anchors":[],"unmapped":[]}');
  await writeFile(path.join(data, 'smart.json.gz'), gzipSync('{"berths":[]}'));
  await writeFile(path.join(data, 'sclass.json'), '{"area":"Y9","hypotheses":[]}');
  await writeFile(path.join(data, 'osm/kx-osm.json'), '{"elements":[]}');
  const row = JSON.stringify({ t: 1000, e: { area: 'Y9', kind: 'snapshot', berths: {} } }) + '\n';
  // Deliberately create reverse date order, and a growing incomplete last row.
  await writeFile(path.join(data, 'recordings/td-Y9-20261109.ndjson'), row + '{"t":');
  await writeFile(path.join(data, 'recordings/td-Y9-20261108.ndjson'), row);
  return { root, home, data, out: path.join(root, '.scratch', 'pack'), row };
}

async function filesBelow(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(file));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}

function fake(calls, intervene = () => null) {
  return async step => {
    calls.push(step);
    assert.ok(Number.isFinite(step.timeoutMs) && step.timeoutMs > 0, `bounded command ${step.id}`);
    assert.ok(!step.args.some(arg => /(?:^|\/)axis07-evidence\.mjs$/.test(arg)), 'manual keychain scanner must never execute');
    const overridden = await intervene(step);
    if (overridden) return overridden;
    for (const output of step.outputs ?? []) {
      assert.ok(path.isAbsolute(output.path));
      if (output.kind === 'directory') {
        await mkdir(output.path, { recursive: true });
        if (step.id.includes('build')) {
          await mkdir(path.join(output.path, 'assets'), { recursive: true });
          await writeFile(path.join(output.path, 'index.html'), '<html>synthetic build</html>');
          await writeFile(path.join(output.path, 'assets/index.js'), 'console.log(1);');
          await writeFile(path.join(output.path, 'assets/index.js.map'), '{"sources":[]}');
        } else await writeFile(path.join(output.path, 'synthetic-report.json'), '{"synthetic":true}');
      } else {
        await mkdir(path.dirname(output.path), { recursive: true });
        await writeFile(output.path, output.path.endsWith('.json') ? '{"synthetic":true}' : 'synthetic output\n');
      }
    }
    return { code: 0, stdout: 'KILLED: synthetic mutant\nSUMMARY: 1 killed, 0 survived\n', stderr: '', timedOut: false, durationMs: 2 };
  };
}

function invoke(f, args = [], runCommand = fake([])) {
  return runEvidencePack(['--out', f.out, ...args], { root: f.root, home: f.home, now, runCommand, print() {} });
}

test('options accept axis aliases and reject unknown axes, flags, and unsafe relay URLs', async () => {
  const f = await fixture();
  const parsed = optionsFrom(['--out', f.out, '--only', '1,axis-03,09'], { root: f.root, home: f.home, now });
  assert.ok(parsed && typeof parsed === 'object');
  for (const args of [['--only', '10'], ['--only', 'garbage'], ['--unknown'], ['--relay', 'https://example.com'], ['--relay', 'http://user:password@127.0.0.1:8787'], ['--relay', 'http://127.0.0.1:8787/private'], ['--relay', 'http://localhost:8787/?token=secret']]) {
    assert.throws(() => optionsFrom(['--out', f.out, ...args], { root: f.root, home: f.home, now }));
  }
});

test('dry-run discovers default data and creates no output or commands', async () => {
  const f = await fixture(), calls = [];
  const before = await filesBelow(f.root);
  const result = await invoke(f, ['--dry-run'], fake(calls));
  assert.equal(result.status, 'DRY_RUN');
  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 0);
  assert.equal(await exists(f.out), false);
  assert.deepEqual(await filesBelow(f.root), before);
  assert.ok(result.plan);
});

test('snapshots freeze both recordings in sorted order with SHA256 and omit the growing tail', async () => {
  const f = await fixture(), calls = [];
  const result = await invoke(f, ['--only', '4'], fake(calls));
  assert.deepEqual(result.inputs.filter(i => i.role.startsWith('recording:')).map(i => i.date), ['2026-11-08', '2026-11-09']);
  const frozen = await filesBelow(path.join(f.out, 'inputs'));
  const recordings = frozen.filter(file => file.endsWith('.ndjson'));
  assert.equal(recordings.length, 2);
  for (const file of recordings) assert.equal(await readFile(file, 'utf8'), f.row);
  const metadata = JSON.stringify(result.inputs);
  assert.ok(metadata.includes(digest(Buffer.from(f.row))));
  const toolCalls = calls.filter(step => step.args.some(arg => /axis05-evidence\.ts$/.test(arg)));
  assert.equal(toolCalls.length, 1);
  const args = toolCalls[0].args;
  const recordingArgs = args.flatMap((arg, i) => arg === '--recording' ? [args[i + 1]] : []);
  assert.equal(recordingArgs.length, 2);
  for (const file of recordingArgs) assert.ok(file.startsWith(path.join(f.out, 'inputs') + path.sep));
});

test('fresh output containment rejects existing, outside, and escaping symlink paths before commands', async () => {
  for (const kind of ['existing', 'outside', 'symlink']) {
    const f = await fixture(), calls = [];
    if (kind === 'existing') await mkdir(f.out);
    if (kind === 'outside') f.out = path.join(f.root, 'outside');
    if (kind === 'symlink') {
      await mkdir(path.join(f.root, 'outside'));
      await symlink(path.join(f.root, 'outside'), path.join(f.root, '.scratch', 'escape'));
      f.out = path.join(f.root, '.scratch', 'escape', 'pack');
    }
    await assert.rejects(() => invoke(f, ['--only', '4'], fake(calls)));
    assert.equal(calls.length, 0);
  }
});

test('one shared source-map build serves selected axes and motion precedes dimensions', async () => {
  const f = await fixture(), calls = [];
  await invoke(f, ['--only', '3,5'], fake(calls));
  const builds = calls.filter(step => step.command === 'npm' && step.args.includes('build'));
  assert.equal(builds.length, 1);
  assert.ok(builds[0].args.includes('--sourcemap'));
  assert.ok(builds[0].args.includes('--emptyOutDir'));
  assert.ok(builds[0].args.includes(path.join(f.out, 'dist')));
  const motion = calls.findIndex(step => step.args.some(arg => /axis05-evidence\.ts$/.test(arg)));
  const dimensions = calls.findIndex(step => step.args.some(arg => /axis03-evidence\.ts$/.test(arg)));
  assert.ok(motion >= 0 && dimensions > motion);
  assert.equal(calls.filter(step => step.args.some(arg => /axis05-evidence\.ts$/.test(arg))).length, 1);
  assert.ok(!calls.some(step => step.args.some(arg => /signal-report\.ts$/.test(arg))));
});

test('axis 05 keeps standard train capture and adds a separate portal capture with shared prerequisites', async () => {
  const f = await fixture(), calls = [];
  const result = await invoke(f, ['--only', '5', '--gpu'], fake(calls));
  const captures = calls.filter(step => step.args.some(arg => /train-capture\.mjs$/.test(arg)));
  assert.equal(captures.length, 2);
  const ordinary = captures.find(step => !step.args.includes('--mode'));
  const portal = captures.find(step => step.args.includes('--mode') && step.args[step.args.indexOf('--mode') + 1] === 'portal');
  assert.ok(ordinary, 'ordinary train capture remains enabled');
  assert.ok(portal, 'portal train capture is registered for axis 05');
  assert.equal(portal.id, '05-portal-capture');
  assert.equal(portal.axis, '05');
  assert.equal(portal.timeoutMs, 900000);
  assert.deepEqual(portal.needs, ordinary.needs);
  assert.deepEqual(portal.requires, ['build', '05-motion', '03-dimensions']);
  assert.deepEqual(portal.inputs, ['sclass']);
  assert.deepEqual(portal.outputs.map(output => output.path), [path.join(f.out, 'axis-05/portal-capture/captures.json')]);
  for (const flag of ['--motion', '--dimensions', '--sclass', '--dist']) {
    assert.equal(portal.args[portal.args.indexOf(flag) + 1], ordinary.args[ordinary.args.indexOf(flag) + 1], `${flag} is shared`);
  }
  assert.notEqual(portal.args[portal.args.indexOf('--out') + 1], ordinary.args[ordinary.args.indexOf('--out') + 1]);
  assert.ok(portal.args[portal.args.indexOf('--out') + 1].startsWith(path.join(f.out, 'axis-05') + path.sep));
  assert.equal(result.steps.filter(step => step.id === '05-motion').length, 1);
  assert.equal(result.steps.filter(step => step.id === '03-dimensions').length, 1);
  assert.equal(result.steps.find(step => step.id === portal.id).status, 'passed');
});

test('GPU evidence stays incomplete without opt-in and manual keychain commands never run', async () => {
  const f = await fixture(), calls = [];
  const result = await invoke(f, [], fake(calls));
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(result.exitCode, 0);
  assert.ok(!calls.some(step => step.args.some(arg => /(?:capture|perf)\.mjs$/.test(arg))));
  assert.ok(!calls.some(step => step.args.some(arg => /axis07-evidence\.mjs$/.test(arg))));
});

for (const failure of ['nonzero', 'timeout', 'missing-artifact']) {
  test(`required ${failure} fails the pack while independent axes continue`, async () => {
    const f = await fixture(), calls = [];
    const result = await invoke(f, ['--only', '4,9'], fake(calls, step => {
      if (!step.args.some(arg => /axis05-evidence\.ts$/.test(arg))) return null;
      return { code: failure === 'nonzero' ? 2 : 0, stdout: '', stderr: 'synthetic failure', timedOut: failure === 'timeout', durationMs: 1 };
    }));
    assert.equal(result.status, 'FAIL');
    assert.equal(result.exitCode, 1);
    const motionIndex = calls.findIndex(step => step.args.some(arg => /axis05-evidence\.ts$/.test(arg)));
    assert.ok(calls.some((step, index) => index > motionIndex && String(step.axis).replace(/^axis-/, '').replace(/^0/, '') === '9'), 'independent engineering commands continue');
    assert.ok(result.steps.length > 0);
  });
}

test('all nine README files quote the exact frozen rubric Evidence paragraphs and link evidence', async () => {
  const f = await fixture();
  await invoke(f, [], fake([]));
  const files = await filesBelow(f.out);
  const readmes = files.filter(file => path.basename(file) === 'README.md');
  const paragraphs = (await readFile(path.join(f.root, rubric), 'utf8')).match(/^- Evidence:.*(?:\n {2}[^\n]*)*/gm);
  assert.equal(paragraphs.length, 9);
  const contents = await Promise.all(readmes.map(file => readFile(file, 'utf8')));
  for (const paragraph of paragraphs) assert.ok(contents.some(body => body.includes(paragraph)), `missing exact quote: ${paragraph}`);
  assert.ok(contents.filter(body => paragraphs.some(paragraph => body.includes(paragraph))).length >= 9);
  assert.ok(contents.every(body => /\]\([^)]*\)/.test(body)), 'README evidence links');
  const manifests = files.filter(file => /manifest\.json$/.test(file));
  assert.ok(manifests.length > 0);
  const manifest = JSON.parse(await readFile(manifests[0], 'utf8'));
  assert.ok(JSON.stringify(manifest).includes('durationMs'));
});

test('manual security instruction is indexed even when GPU execution is enabled', async () => {
  const f = await fixture(), calls = [];
  await invoke(f, ['--only', '7', '--gpu'], fake(calls));
  assert.ok(!calls.some(step => step.args.some(arg => /axis07-evidence\.mjs$/.test(arg))));
  const markdown = await Promise.all((await filesBelow(f.out)).filter(file => file.endsWith('.md')).map(file => readFile(file, 'utf8')));
  assert.ok(markdown.some(body => body.includes('axis07-evidence.mjs')));
});

test('the loopback adapter writes a parseable report without accessing the keychain', async () => {
  const f = await fixture();
  await writeFile(path.join(f.root, 'kings-cross-src/tools/axis07-relay.mjs'), 'export async function probeRelaySecurity() { return {status:"PASS",checks:[]}; }');
  const calls = [], fallback = fake(calls);
  const result = await invoke(f, ['--only', '7'], step => step.id === '07-refusals' ? runCommand(step) : fallback(step));
  const probe = result.steps.find(s => s.id === '07-refusals');
  assert.equal(probe.status, 'passed', probe.reason ?? 'the loopback adapter must succeed');
  assert.equal(JSON.parse(await readFile(path.join(f.out, 'axis-07/relay-probe.json'), 'utf8')).status, 'PASS');
});

test('the command deadline kills a stalled child and reports timeout with no interactive stdin', async () => {
  const f = await fixture();
  const stalled = await runCommand({ command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], cwd: f.root, timeoutMs: 100 });
  assert.equal(stalled.timedOut, true); assert.notEqual(stalled.code, 0); assert.ok(stalled.durationMs < 5000);
  const stdin = await runCommand({ command: process.execPath, args: ['-e', 'process.stdin.on("end",()=>console.log("closed"));process.stdin.resume();'], cwd: f.root, timeoutMs: 5000 });
  assert.equal(stdin.code, 0); assert.match(stdin.stdout, /closed/);
});

test('a legacy geometry output symlink cannot export reports outside scratch', async () => {
  const f = await fixture(), calls = [];
  await mkdir(path.join(f.root, 'outside'));
  await symlink(path.join(f.root, 'outside'), path.join(f.root, '.scratch/round21-geometry'));
  const result = await invoke(f, ['--only', '1'], fake(calls));
  assert.equal(result.exitCode, 1);
  assert.ok(!calls.some(s => s.id === '01-geometry'));
  assert.deepEqual(await readdir(path.join(f.root, 'outside')), []);
});

test('source edits during collection invalidate the shared build evidence', async () => {
  const f = await fixture(), calls = [];
  const result = await invoke(f, ['--only', '9'], fake(calls, async step => {
    if (step.id === '09-tests') await writeFile(path.join(f.root, 'kings-cross-src/web/src/data/kx-track.json'), '{"nodes":[[1,0,0]]}');
  }));
  assert.equal(result.status, 'FAIL'); assert.equal(result.exitCode, 1);
  assert.equal(result.build.sourcesUnchanged, false);
});

test('mutation summaries retain counts and allow only the documented station equivalence', () => {
  for (const stdout of ['8/8 mutations caught', '8/8 planted Axis 07 relay mutations killed', '8 killed; 0 survived; 0 timeouts', 'All 8 Axis 07 browser/CSP mutations were caught.', '[KILLED] one\n[KILLED] two']) {
    const result = mutationSummary(stdout, 'relay');
    assert.equal(result.passed, true, stdout); assert.ok(result.caught > 0); assert.equal(result.total, result.caught);
  }
  const equivalent = '7/8 mutations caught\n  NOT CAUGHT: pointInPolygon: wrong side of the edge\n';
  assert.equal(mutationSummary(equivalent, 'station').passed, true);
  assert.equal(mutationSummary(equivalent, 'relay').passed, false);
  assert.equal(mutationSummary('7/8 mutations caught', 'station').passed, false);
  assert.equal(mutationSummary('7 killed; 0 survived; 1 timeouts', 'schedule').passed, false);
  assert.equal(mutationSummary('', 'relay').passed, false);
});

test('zero-exit mutations with survivors fail collection and keep the independent results', async () => {
  const f = await fixture(), calls = [];
  const result = await invoke(f, ['--only', '9'], fake(calls, step => step.mutation === 'relay' ? {
    code: 0, stdout: '1/2 mutations caught\n  NOT CAUGHT: Host guard\n', stderr: '', durationMs: 1,
  } : null));
  const step = result.steps.find(s => s.mutation === 'relay');
  assert.equal(step.status, 'failed'); assert.equal(step.mutations.survivors, 1);
  assert.equal(result.exitCode, 1); assert.ok(calls.at(-1).id !== step.id);
});

test('all automated axes use one build and complete under fake GPU and loopback commands', async () => {
  const f = await fixture(), calls = [];
  for (const date of ['2026-11-08', '2026-11-09']) await writeFile(path.join(f.data, `schedule-${date}.json`), '{"services":[]}');
  const result = await invoke(f, ['--gpu'], fake(calls));
  assert.equal(result.exitCode, 0);
  assert.equal(result.steps.filter(s => s.manual).length, 1);
  assert.ok(result.steps.every(s => s.status === (s.manual ? 'manual' : 'passed')), JSON.stringify(result.steps.filter(s => s.status !== 'passed').map(s => [s.id, s.status, s.reason])));
  assert.equal(calls.filter(s => s.id === 'build').length, 1);
  for (const axis of ['01','02','03','04','05','06','07','08','09']) assert.ok(calls.some(s => s.axis === axis));
});

test('an undocumented mutation driver is an explicit engineering gap rather than silently skipped', async () => {
  const f = await fixture();
  await writeFile(path.join(f.root, 'kings-cross-src/tools/mutation/undocumented.py'), '# synthetic driver');
  const result = await invoke(f, ['--only', '9'], fake([]));
  assert.equal(result.exitCode, 1);
  assert.match(result.steps.find(s => s.id === '09-mutation-registry').reason, /undocumented\.py/);
});
