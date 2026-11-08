import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rmdir, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { axis04Options, renderAxis04Markdown, shellQuote, summarizeAxis04 } from '../axis04-summary.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const scratch = path.join(repoRoot, '.scratch');

function board(overrides: Record<string, unknown> = {}) {
  return {
    window: { fromISO: '2026-11-08T14:00:00.000Z', toISO: '2026-11-08T15:00:00.000Z', withinSeconds: 120, stepSeconds: 0.25 },
    summary: { fullyObserved: 4, boardAgreement: 3, agreementPercent: 99, medianLagSeconds: 2.5 },
    scheduleMatch: { observedHeadcodes: 4, matchedHeadcodes: 3, percent: 75, unmatchedHeadcodes: ['1Z04'], observedIntervals: 9, matchedIntervals: 7, intervalPercent: 77.7 },
    hourly: [
      { fromMs: Date.parse('2026-11-08T14:00:00Z'), toMs: Date.parse('2026-11-08T15:00:00Z'), fromISO: '2026-11-08T14:00:00.000Z', toISO: '2026-11-08T15:00:00.000Z', summary: { fullyObserved: 4, boardAgreement: 3, agreementPercent: 99, medianLagSeconds: 2.5 }, scheduleMatch: { observedHeadcodes: 4, matchedHeadcodes: 3, observedIntervals: 9, matchedIntervals: 7 } },
      { fromMs: Date.parse('2026-11-08T15:00:00Z'), toMs: Date.parse('2026-11-08T16:00:00Z'), fromISO: '2026-11-08T15:00:00.000Z', toISO: '2026-11-08T16:00:00.000Z', summary: { fullyObserved: 2, boardAgreement: 1, agreementPercent: 99, medianLagSeconds: 7 }, scheduleMatch: { observedHeadcodes: 2, matchedHeadcodes: 1, observedIntervals: 3, matchedIntervals: 1 } },
    ],
    reproduce: { cwd: repoRoot, command: 'node', args: ['kings-cross-src/tools/board-vs-trust.ts', '--recording', '/private/NR actual\'s ;$(echo no).ndjson', '--out', '/private/out'] },
    ...overrides,
  };
}

function live(overrides: Record<string, unknown> = {}) {
  return {
    passed: false, samples: 4, replaySamples: 4, sameTrainSetSeconds: 3,
    interval: { startMs: Date.parse('2026-11-08T14:26:37Z'), endMs: Date.parse('2026-11-08T14:31:38Z'), durationSeconds: 301 },
    positionDifferenceM: { median: 0.4, p95: 5.1, max: 9 },
    sameInitialSnapshotControl: { passed: true, samples: 4, sameTrainSetSeconds: 4, positionDifferenceM: { median: 0, p95: 0.1, max: 0.2 } },
    reproduce: { cwd: repoRoot, command: 'node', args: ['kings-cross-src/tools/live-vs-replay.ts', '--summarize', '/private/capture', '--out', '/private/recomputed'] },
    ...overrides,
  };
}

test('zero denominators stay null instead of becoming zero or NaN rates', () => {
  const summary = summarizeAxis04({
    out: path.join(scratch, 'axis04-zero-rate'),
    live: live({ samples: 0, replaySamples: 0, sameTrainSetSeconds: 0, passed: false, sameInitialSnapshotControl: undefined }),
    board: board({ summary: { fullyObserved: 0, boardAgreement: 0, agreementPercent: 100, medianLagSeconds: null },
      hourly: [{ fromISO: '2026-11-08T14:00:00.000Z', toISO: '2026-11-08T15:00:00.000Z', summary: { fullyObserved: 0, boardAgreement: 0, agreementPercent: 100, medianLagSeconds: null } }],
      scheduleMatch: { observedHeadcodes: 0, matchedHeadcodes: 0, percent: null, unmatchedHeadcodes: [], observedIntervals: 0, matchedIntervals: 0, intervalPercent: null } }),
  });
  assert.equal(summary.liveReplay?.sameTrainSetPercent, null);
  assert.equal(summary.boardAgreement?.agreementPercent, null);
  assert.equal(summary.boardAgreement?.medianLagSeconds, null);
  assert.equal(summary.hourly[0]?.agreementPercent, null);
  assert.equal(summary.scheduleMatch?.percent, null);
  assert.equal(summary.scheduleMatch?.intervalPercent, null);
  assert.match(summary.gaps.join('\n'), /denominator is zero/);
  assert.match(summary.gaps.join('\n'), /no headcodes were observed/);
});

test('primary recorded-checkpoint failure remains failure when the diagnostic passes', () => {
  const summary = summarizeAxis04({ out: path.join(scratch, 'axis04-primary'), board: board(), live: live() });
  assert.equal(summary.liveReplay?.status, 'FAIL');
  assert.equal(summary.liveReplay?.passed, false);
  assert.equal(summary.boardAgreement?.agreementPercent, 75);
  assert.equal(summary.liveDiagnostic?.status, 'PASS');
  assert.match(renderAxis04Markdown(summary), /Primary live\/replay equivalence[\s\S]*\*\*FAIL\*\*/);
  assert.match(renderAxis04Markdown(summary), /2026-11-08T14:26:37\.000Z to 2026-11-08T14:31:38\.000Z UTC/);
  assert.match(renderAxis04Markdown(summary), /diagnostic only[\s\S]*does not change the primary result/i);
});

test('hourly links and reproduction commands safely encode apostrophes and shell metacharacters', () => {
  const out = path.join(scratch, 'axis04 links \' $(false)');
  const source = path.join(out, 'board #1; $(touch nope) \' report.json');
  const specialInput = "/private/NR 'actual';$(echo no).ndjson";
  const summary = summarizeAxis04({ out, boardPath: source,
    board: board({ reproduce: { cwd: repoRoot, command: 'node', args: ['tool.ts', '--recording', specialInput, '--out', out] } }), live: live() });
  const md = renderAxis04Markdown(summary);
  const command = summary.reproductions.board?.shellCommand ?? '';
  assert.match(md, /board%20%231%3B%20%24%28touch%20nope%29%20%27%20report\.json/);
  assert.match(md, /\[2026-11-08T14:00:00\.000Z[^|]*\]\(<[^>]+>\)/);
  assert.ok(command.includes("'\/private\/NR '\\''actual'\\'';$(echo no).ndjson'"));
  assert.ok(command.includes("'--out' '"));
  assert.equal(shellQuote("a'b ;$(touch nope)"), "'a'\\''b ;$(touch nope)'");
});

test('missing evidence produces explicit gaps and unavailable sections', () => {
  const summary = summarizeAxis04({ out: path.join(scratch, 'axis04-missing') });
  assert.equal(summary.liveReplay, null);
  assert.equal(summary.boardAgreement, null);
  assert.equal(summary.scheduleMatch, null);
  assert.ok(summary.gaps.some((gap) => gap.includes('No live/replay report supplied')));
  assert.ok(summary.gaps.some((gap) => gap.includes('No board comparison report supplied')));
  const md = renderAxis04Markdown(summary);
  assert.match(md, /Primary live\/replay equivalence[\s\S]*Unavailable/);
  assert.match(md, /Evidence gaps/);
});

test('Axis 04 links a multi-recording berth report and carries its compact evidence summary', () => {
  const out = path.join(scratch, 'axis04-berth-evidence'), replayPath = path.join(out, 'replay report #1', 'replay-report.json');
  const replay = {
    ok: true,
    coverage: { seen: 5, anchored: 4, unmapped: 1, berths: [{ berth: 'OUT', classification: 'unmapped', reason: 'outside-network' }] },
    unionInventory: { berths: [{ berth: 'OUT', classification: 'unmapped', reason: 'outside-network' }] },
    stepSummary: { physicalStepEvents: 3, unmeasuredEndpointEvents: 1, mappedPairs: 2, disconnectedPairs: 0, reversalPairs: 0, impliedSpeedFlagPairs: 0 },
    headcodeChurn: { physicalIds: 4, renames: 1, idsWithMultipleDescriptions: 1 },
    platforms: [{ berth: '1000', correctTargetTrack: true, actuallyHeldWrongTrackSamples: 0 }],
    motion: { starsDrawn: 0 },
    recordings: [{ input: { path: '/private/td-20261107.ndjson', sha256: 'a'.repeat(64), capturedBytes: 100 }, metrics: {} },
      { input: { path: '/private/td-20261108.ndjson', sha256: 'b'.repeat(64), capturedBytes: 200 }, metrics: {} }],
    reproducibility: { inputHashes: { recordings: [] }, command: { cwd: repoRoot, command: process.execPath,
      args: ['kings-cross-src/tools/replay-report.ts', '--recording', '/private/captured.ndjson', '--out', path.join(out, 'recomputed')] } },
  };
  const summary = summarizeAxis04({ out, replay, replayPath });
  const md = renderAxis04Markdown(summary);
  assert.equal(summary.sources.replay.loaded, true);
  assert.ok(summary.reproductions.replay?.shellCommand.includes('kings-cross-src/tools/replay-report.ts'));
  assert.equal(summary.berthEvidence?.recordingCount, 2);
  assert.equal((summary.berthEvidence?.coverage as Record<string, unknown>).unmapped, 1);
  assert.match(md, /\[Replay berth and motion report\]\(<replay%20report%20%231\/replay-report\.json>\)/);
  assert.match(md, /outside-network 1/);
  assert.match(md, /Placeholder draw check: \*\*PASS\*\*, 0 \*\*\*\* drawn samples/);
  assert.match(md, /Recompute replay berth and motion report/);
});

test('CLI writes a compact private Markdown and JSON one-pager from synthetic reports', async () => {
  await mkdir(scratch, { recursive: true });
  const testRoot = await mkdtemp(path.join(scratch, 'axis04-summary-cli-'));
  const out = path.join(testRoot, 'output');
  const boardPath = path.join(testRoot, "board report ' $(echo no).json");
  const livePath = path.join(testRoot, 'live-report.json');
  try {
    await writeFile(boardPath, JSON.stringify(board()));
    await writeFile(livePath, JSON.stringify(live()));
    const result = spawnSync(process.execPath, ['kings-cross-src/tools/axis04-summary.ts', '--out', out,
      '--board-report', boardPath, '--live-report', livePath, '--relay', 'http://127.0.0.1:8787'],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(result.status, 0, result.stderr);
    const jsonPath = path.join(out, 'axis-04-summary.json'), mdPath = path.join(out, 'axis-04-summary.md');
    const jsonText = await readFile(jsonPath, 'utf8'), md = await readFile(mdPath, 'utf8');
    const parsed = JSON.parse(jsonText);
    assert.equal(parsed.liveReplay.status, 'FAIL');
    assert.equal(parsed.liveDiagnostic.status, 'PASS');
    assert.equal(parsed.scheduleMatch.percent, 75);
    assert.equal(parsed.hourlyVariation.agreementPercent.range, 25);
    assert.equal(parsed.reproductions.newLiveCapture.historical, false);
    assert.match(md, /new window; does not reproduce historical observations/);
    assert.match(md, /at least once/);
    assert.ok(Buffer.byteLength(md) < 6000, 'one-pager stays compact');
    assert.equal((await stat(jsonPath)).mode & 0o777, 0o600);
    assert.equal((await stat(mdPath)).mode & 0o777, 0o600);
    assert.ok((await readdir(out)).includes('axis-04-summary.md'));
  } finally {
    for (const file of [path.join(out, 'axis-04-summary.json'), path.join(out, 'axis-04-summary.md'), boardPath, livePath]) await unlink(file).catch(() => {});
    await rmdir(out).catch(() => {});
    await rmdir(testRoot).catch(() => {});
  }
});

test('CLI rejects output outside .scratch and symlinked output paths', async () => {
  assert.throws(() => axis04Options(['--out', path.join(repoRoot, '..', 'public-axis04')]));
  await mkdir(scratch, { recursive: true });
  const link = path.join(scratch, `axis04-summary-link-${process.pid}`);
  await symlink('/private/tmp', link);
  try {
    const result = spawnSync(process.execPath, ['kings-cross-src/tools/axis04-summary.ts', '--out', link],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symlink|output directory/i);
  } finally { await unlink(link); }
});
