import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createSclassJob, createSclassRunner } from '../sclass-job.mjs';

const day = '2026-11-08';
const instant = Date.parse(`${day}T12:00:00Z`);
const settleMs = 60_000;
const lockScratchRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.scratch/round15/sclass-job-lock-tests');

function fakeClock(startAt) {
  let time = startAt, nextId = 0;
  const timers = new Map();
  const history = new Map();
  const cancelled = [];
  return {
    now: () => time,
    timers,
    history,
    cancelled,
    schedule(callback, delay) {
      const id = ++nextId;
      const timer = { id, callback, delay, due: time + delay };
      timers.set(id, timer); history.set(id, timer);
      return id;
    },
    cancel(id) { cancelled.push(id); timers.delete(id); },
    async fire(id) {
      const timer = timers.get(id);
      assert.ok(timer, `timer ${id} is pending`);
      timers.delete(id);
      time = timer.due;
      timer.callback();
      await flush();
      return timer;
    },
    async fireNext() {
      const timer = [...timers.values()].sort((a, b) => a.due - b.due || a.id - b.id)[0];
      assert.ok(timer, 'a timer is pending');
      return await this.fire(timer.id);
    },
  };
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** No relearn history yet, without real disk I/O, so the fake clock's microtask flush covers the history check. */
const noHistory = async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); };

function makeJob(clock, options = {}) {
  return createSclassJob({ dataDir: '/private/kx-data', area: 'Y9', now: clock.now,
    schedule: clock.schedule.bind(clock), cancel: clock.cancel.bind(clock), settleMs, readFile: noHistory, ...options });
}

async function lockDataDir(t) {
  await mkdir(lockScratchRoot, { recursive: true });
  const dir = await mkdtemp(path.join(lockScratchRoot, 'lock-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function readTextOrMissing(file) {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function failingFakeRunner(pid, error = Object.assign(new Error('synthetic child failure'), { code: 1 })) {
  const child = { pid, exitCode: null, signalCode: null, kill() { return true; } };
  let callback;
  const run = createSclassRunner({ timeoutMs: 30_000, execFile: (_exe, _args, _options, done) => {
    callback = done;
    return child;
  } });
  return {
    child, run,
    finish({ exited = true } = {}) {
      if (exited) child.exitCode = 1;
      callback(error);
    },
  };
}

test('sclass job: startup catch-up and each UTC rollover run once after settling', async () => {
  const clock = fakeClock(instant), runs = [];
  const job = makeJob(clock, { run: async ({ date }) => { runs.push(date); } });
  job.start();
  const startup = [...clock.timers.values()].find(timer => timer.delay === settleMs);
  assert.ok(startup, 'startup catch-up is delayed for the recorder settle window');
  await clock.fire(startup.id);
  assert.deepEqual(runs, [day]);

  const rollover = [...clock.timers.values()][0];
  assert.ok(rollover, 'a UTC midnight timer remains armed');
  assert.equal(rollover.due, Date.parse('2026-11-09T00:01:00Z'));
  await clock.fire(rollover.id);
  assert.deepEqual(runs, [day, '2026-11-09']);
  await job.stop();
});

test('sclass job: a restart skips a day whose relearn already finished, published or refused, and runs the next day', async () => {
  for (const published of [true, false]) {
    const clock = fakeClock(instant), runs = [], logs = [], reads = [];
    const history = [{ date: '2026-11-07', validationDay: '20261106', published: true },
      { date: day, validationDay: '20261107', published, reasons: [] }];
    const job = makeJob(clock, { log: line => logs.push(line), run: async ({ date }) => { runs.push(date); },
      readFile: async (file) => {
        reads.push(file);
        if (runs.length) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return JSON.stringify(history);
      } });
    job.start();
    const startup = [...clock.timers.values()].find(timer => timer.delay === settleMs);
    await clock.fire(startup.id);
    assert.deepEqual(runs, [], `today's ${published ? 'published' : 'refused'} relearn is not repeated`);
    assert.deepEqual(logs, [`sclass relearn: already finished for ${day}; skipped`]);
    assert.equal(reads[0], '/private/kx-data/sclass-history.json');
    const rollover = [...clock.timers.values()][0];
    await clock.fire(rollover.id);
    assert.deepEqual(runs, ['2026-11-09'], 'the next UTC day has no finished run yet');
    await job.stop();
  }
});

test('sclass job: history with only earlier days, or unreadable history, still runs today', async () => {
  for (const text of [JSON.stringify([{ date: '2026-11-07', validationDay: '20261106', published: true }]), 'not json', '{}',
    JSON.stringify([{ date: day }])]) {
    const clock = fakeClock(instant), runs = [];
    const job = makeJob(clock, { run: async ({ date }) => { runs.push(date); }, readFile: async () => text });
    job.start();
    await clock.fire([...clock.timers.values()].find(timer => timer.delay === settleMs).id);
    assert.deepEqual(runs, [day], text);
    await job.stop();
  }
});

test('sclass job: startup near midnight waits for the new UTC day settle window', async () => {
  const startAt = Date.parse('2026-11-08T23:59:30Z');
  const clock = fakeClock(startAt), runs = [];
  const job = makeJob(clock, { run: async ({ date }) => { runs.push(date); } });
  job.start();
  const startup = [...clock.timers.values()].find(timer => timer.id === 1);
  assert.equal(startup.delay, 90_000);
  assert.equal(startup.due, Date.parse('2026-11-09T00:01:00Z'));
  await clock.fire(startup.id);
  assert.deepEqual(runs, ['2026-11-09']);

  await clock.fireNext();
  assert.deepEqual(runs, ['2026-11-09'], 'the rollover timer does not duplicate startup catch-up');
  await job.stop();
});

test('sclass job: a rollover during relearn queues the next day without overlap', async () => {
  const startAt = Date.parse('2026-11-08T23:58:30Z');
  const clock = fakeClock(startAt), runs = [], releases = [];
  let active = 0, maxActive = 0;
  const job = makeJob(clock, { run: ({ date }) => new Promise(resolve => {
    runs.push(date); active++; maxActive = Math.max(maxActive, active);
    releases.push(() => { active--; resolve(); });
  }) });
  job.start();
  await clock.fireNext();
  assert.deepEqual(runs, [day]);
  await clock.fireNext();
  assert.deepEqual(runs, [day], 'the daily request waits while the first run is active');
  releases.shift()();
  await flush();
  assert.deepEqual(runs, [day, '2026-11-09']);
  assert.equal(maxActive, 1);
  releases.shift()();
  await job.stop();
});

test('sclass job: stop clears timers, aborts active work, and makes stale callbacks inert', async () => {
  const clock = fakeClock(instant);
  let seenSignal;
  const job = makeJob(clock, { run: ({ signal }) => new Promise(resolve => {
    seenSignal = signal;
    signal.addEventListener('abort', resolve, { once: true });
  }) });
  job.start();
  const startup = [...clock.timers.values()].find(timer => timer.id === 1);
  const rollover = [...clock.timers.values()].find(timer => timer.id === 2);
  await clock.fire(startup.id);
  await job.stop();
  assert.ok(seenSignal, 'startup catch-up started the injected run');
  assert.equal(seenSignal.aborted, true);
  assert.equal(clock.timers.size, 0);
  assert.ok(clock.cancelled.includes(rollover.id));
  clock.history.get(rollover.id).callback();
  await flush();
  assert.equal(clock.timers.size, 0);

  const pendingClock = fakeClock(instant), pendingRuns = [];
  const pending = makeJob(pendingClock, { run: async ({ date }) => pendingRuns.push(date) });
  pending.start();
  const ids = [...pendingClock.timers.keys()];
  await pending.stop();
  assert.deepEqual([...pendingClock.timers.keys()], []);
  assert.deepEqual(pendingClock.cancelled.sort(), ids.sort());
  assert.deepEqual(pendingRuns, []);
});

test('sclass job: failure is contained, redacted, and does not stop the next day', async () => {
  const clock = fakeClock(instant), logs = [];
  let attempts = 0;
  const job = makeJob(clock, { log: line => logs.push(line), run: async () => {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('secret=private-value'), { code: 'ETIMEDOUT' });
  } });
  job.start();
  await clock.fireNext();
  assert.deepEqual(logs, [`sclass relearn: timed out for ${day}`]);
  assert.ok(!logs.join('\n').includes('private-value'));
  await clock.fireNext();
  assert.equal(attempts, 2);
  assert.deepEqual(logs, [`sclass relearn: timed out for ${day}`, 'sclass relearn: completed for 2026-11-09']);
  await job.stop();
});

test('sclass job: a child killed by the execFile timeout logs as killed, not a bare failure', async () => {
  const clock = fakeClock(instant), logs = [];
  // The shape node gives when execFile's timeout fires: code null, killed true, signal SIGTERM.
  const job = makeJob(clock, { log: line => logs.push(line), run: async () => {
    throw Object.assign(new Error('Command failed: secret=private-value'), { code: null, killed: true, signal: 'SIGTERM' });
  } });
  job.start();
  await clock.fireNext();
  assert.deepEqual(logs, [`sclass relearn: killed SIGTERM for ${day}`]);
  assert.ok(!logs.join('\n').includes('private-value'));
  await job.stop();
});

test('sclass job: a child killed by an outside signal logs the signal, not a bare failure', async () => {
  const clock = fakeClock(instant), logs = [];
  // The shape node gives when something other than the relay sends SIGTERM: code null, killed false.
  const job = makeJob(clock, { log: line => logs.push(line), run: async () => {
    throw Object.assign(new Error('Command failed: secret=private-value'), { code: null, killed: false, signal: 'SIGTERM' });
  } });
  job.start();
  await clock.fireNext();
  assert.deepEqual(logs, [`sclass relearn: signal SIGTERM for ${day}`]);
  assert.ok(!logs.join('\n').includes('private-value'));
  await job.stop();
});

test('sclass job: CLI results log only validated publish decisions, counts, and concise reasons', async () => {
  const clock = fakeClock(instant), logs = [];
  const results = [
    { date: day, validationDay: '20261107', published: true,
      candidate: { bits: 12, heads: 5, precision: 0.91, recall: 0.72 },
      incumbent: { bits: 10, heads: 4, precision: 0.86, recall: 0.68 }, reasons: ['candidate clears the evidence gate'] },
    { date: '2026-11-09', validationDay: '20261108', published: false,
      incumbent: { bits: 44, heads: 10, precision: null, recall: null },
      reasons: ['insufficient completed day: 20261108'] },
  ];
  let index = 0;
  const runner = createSclassRunner({ execFile: (_exe, args, _options, done) => {
    assert.deepEqual(args.slice(args.indexOf('tools/sclass.ts')), ['tools/sclass.ts', '--relearn', '--data-dir', '/private/kx-data', '--area', 'Y9'],
      'optional anchor and table arguments are omitted when their environment paths are absent');
    const child = { exitCode: null, signalCode: null, kill() { return true; } };
    const stdout = JSON.stringify(results[index++]);
    queueMicrotask(() => { child.exitCode = 0; done(null, stdout, 'secret stderr is ignored'); });
    return child;
  } });
  const job = makeJob(clock, { run: runner, log: line => logs.push(line) });
  job.start();
  await clock.fireNext();
  assert.deepEqual(logs, [`sclass relearn: published for ${day} (validation 20261107; candidate 12 bits/5 heads; incumbent 10 bits/4 heads; reasons: candidate clears the evidence gate)`]);
  await clock.fireNext();
  assert.deepEqual(logs, [
    `sclass relearn: published for ${day} (validation 20261107; candidate 12 bits/5 heads; incumbent 10 bits/4 heads; reasons: candidate clears the evidence gate)`,
    'sclass relearn: refused for 2026-11-09 (validation 20261108; incumbent 44 bits/10 heads; reasons: insufficient completed day: 20261108)',
  ]);
  assert.ok(!logs.join('\n').includes('secret stderr'));
  await job.stop();
});

test('sclass job: CLI runner passes private paths and bounds then escalates child shutdown', async () => {
  let callback, received;
  const signals = [];
  const child = { exitCode: null, signalCode: null, kill(signal) {
    signals.push(signal);
    if (signal === 'SIGKILL') {
      this.signalCode = signal;
      queueMicrotask(() => callback(Object.assign(new Error('closed'), { code: 'ETIMEDOUT' })));
    }
    return true;
  } };
  const runner = createSclassRunner({ timeoutMs: 500, killGraceMs: 1, platform: 'linux',
    execFile: (executable, args, options, done) => {
      received = { executable, args, options }; callback = done; return child;
    } });
  const controller = new AbortController();
  const result = runner({ dataDir: '/private/kx-data', area: 'Y9', anchorsPath: '/private/anchors.json',
    tablePath: '/private/sclass.json', signal: controller.signal });
  assert.equal(received.executable, '/usr/bin/nice');
  assert.deepEqual(received.args, ['-n', '19', process.execPath,
    'tools/sclass.ts', '--relearn', '--data-dir', '/private/kx-data', '--area', 'Y9',
    '--anchors', '/private/anchors.json', '--table', '/private/sclass.json']);
  assert.equal(received.options.timeout, 500);
  assert.equal(received.options.maxBuffer, 1024 * 1024);
  controller.abort();
  let watchdog;
  const outcome = await Promise.race([result.then(() => null, error => error),
    new Promise(resolve => { watchdog = setTimeout(() => resolve(null), 100); })]);
  clearTimeout(watchdog);
  assert.equal(outcome?.code, 'ETIMEDOUT', 'runner completes after escalating termination to SIGKILL');
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});

test('sclass job: the runner adds background QoS on macOS and runs node directly on Windows', async () => {
  const relearn = ['tools/sclass.ts', '--relearn', '--data-dir', '/private/kx-data', '--area', 'Y9'];
  for (const [platform, executable, prefix] of [
    ['darwin', '/usr/sbin/taskpolicy', ['-b', '/usr/bin/nice', '-n', '19', process.execPath]],
    ['linux', '/usr/bin/nice', ['-n', '19', process.execPath]],
    ['win32', process.execPath, []],
  ]) {
    let received;
    const runner = createSclassRunner({ platform, execFile: (exe, args, _options, done) => {
      received = { exe, args };
      const child = { exitCode: null, signalCode: null, kill() { return true; } };
      queueMicrotask(() => { child.exitCode = 0; done(null, JSON.stringify({ date: day, validationDay: null, published: false, reasons: [] })); });
      return child;
    } });
    await runner({ dataDir: '/private/kx-data', area: 'Y9' });
    assert.equal(received.exe, executable, platform);
    assert.deepEqual(received.args, [...prefix, ...relearn], platform);
  }
});

test('sclass job: CLI runner passes shared recordings and area-specific assets when configured', async () => {
  let callback, received;
  const child = { exitCode: null, signalCode: null, kill() {
    this.exitCode = 0;
    queueMicrotask(() => callback(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' })));
    return true;
  } };
  const runner = createSclassRunner({ timeoutMs: 500,
    execFile: (executable, args, options, done) => {
      received = { executable, args, options }; callback = done; return child;
    } });
  const controller = new AbortController();
  const result = runner({ dataDir: '/private/kx-data/areas/ZZ', area: 'ZZ',
    anchorsPath: '/private/kx-data/areas/ZZ/anchors.json', tablePath: '/private/kx-data/areas/ZZ/sclass.json',
    recordingsDir: '/private/kx-data/recordings', overlayPath: '/assets/eus-signals.json', trackPath: '/assets/eus-track.json',
    signal: controller.signal });
  assert.deepEqual(received.args.slice(received.args.indexOf('tools/sclass.ts')), ['tools/sclass.ts', '--relearn', '--data-dir', '/private/kx-data/areas/ZZ', '--area', 'ZZ',
    '--anchors', '/private/kx-data/areas/ZZ/anchors.json', '--table', '/private/kx-data/areas/ZZ/sclass.json',
    '--recordings-dir', '/private/kx-data/recordings', '--overlay', '/assets/eus-signals.json', '--track', '/assets/eus-track.json']);
  controller.abort();
  await assert.rejects(result);
});

test('sclass job: errored exited child removes only its own stale relearn lock', async t => {
  const dataDir = await lockDataDir(t), pid = 24681;
  const lockPath = path.join(dataDir, '.sclass-relearn.lock');
  const contents = JSON.stringify({ pid, startedAt: '2026-11-08T12:00:00.000Z' });
  await writeFile(lockPath, contents, { mode: 0o600 });
  const fake = failingFakeRunner(pid);
  const result = fake.run({ dataDir, area: 'Y9' });
  await flush();
  assert.equal(await readFile(lockPath, 'utf8'), contents, 'a running child does not have its lock reclaimed');
  fake.finish();
  await assert.rejects(result, error => error.code === 1);
  await assert.rejects(readFile(lockPath, 'utf8'), error => error.code === 'ENOENT');
});

test('sclass job: foreign-owner relearn lock survives a child error', async t => {
  const dataDir = await lockDataDir(t), childPid = 24681;
  const lockPath = path.join(dataDir, '.sclass-relearn.lock');
  const contents = JSON.stringify({ pid: 97531, startedAt: '2026-11-08T12:00:00.000Z' });
  await writeFile(lockPath, contents, { mode: 0o600 });
  const fake = failingFakeRunner(childPid);
  const result = fake.run({ dataDir, area: 'Y9' });
  fake.finish();
  await assert.rejects(result, error => error.code === 1);
  assert.equal(await readTextOrMissing(lockPath), contents);
});

test('sclass job: errored callback before child exit never removes a lock', async t => {
  const dataDir = await lockDataDir(t), pid = 24681;
  const lockPath = path.join(dataDir, '.sclass-relearn.lock');
  const contents = JSON.stringify({ pid, startedAt: '2026-11-08T12:00:00.000Z' });
  await writeFile(lockPath, contents, { mode: 0o600 });
  const fake = failingFakeRunner(pid);
  const result = fake.run({ dataDir, area: 'Y9' });
  fake.finish({ exited: false });
  await assert.rejects(result, error => error.code === 1);
  assert.equal(await readTextOrMissing(lockPath), contents);
});

test('sclass job: failed spawn without a PID leaves the existing lock untouched', async t => {
  const dataDir = await lockDataDir(t), lockPath = path.join(dataDir, '.sclass-relearn.lock');
  const contents = JSON.stringify({ pid: 24681, startedAt: '2026-11-08T12:00:00.000Z' });
  await writeFile(lockPath, contents, { mode: 0o600 });
  const fake = failingFakeRunner(undefined, Object.assign(new Error('spawn failed'), { code: 'ENOENT' }));
  fake.child.exitCode = -2;
  const result = fake.run({ dataDir, area: 'Y9' });
  fake.finish();
  await assert.rejects(result, error => error.code === 'ENOENT');
  assert.equal(await readTextOrMissing(lockPath), contents);
});
