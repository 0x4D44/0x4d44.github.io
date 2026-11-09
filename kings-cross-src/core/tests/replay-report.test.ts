import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { AnchorMap } from '../anchors.ts';
import type { KxData } from '../osm.ts';
import { buildGraph } from '../graph.ts';
import { DEFAULT_BUFFER_CLEARANCE_M } from '../motion.ts';
import { completeRecordingPrefix, platformStoppingPoint, replayReport } from '../../tools/replay-report.ts';
import type { ScheduleCall } from '../schedule.ts';
import { trainLayout } from '../train.ts';
import { parseRecording } from '../../web/src/feed.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const tool = process.env.REPLAY_REPORT_TEST_TOOL ?? resolve(root, 'kings-cross-src/tools/replay-report.ts');
// A failed CLI must never accidentally validate a report left by an earlier test run.
const scratch = resolve(root, '.scratch/replay-report-tests', String(process.pid));
const data: KxData = { attribution: 'invented', origin: { lat: 0, lon: 0 },
  nodes: [[1, 10, -200], [2, 10, -1200], [3, 40, -200], [4, 40, -1200]],
  rails: [1, 3].map((n) => ({ id: n, nodes: [n, n + 1], tunnel: false, bridge: false, layer: 0, service: 'main' })),
  platforms: [{ id: 20, ref: '0', pts: [[12, -200], [15, -200], [15, -300], [12, -300]] }], switches: [], signals: [], buffers: [], buildings: [] };
const a = (berth: string, t = 0): AnchorMap['anchors'][number] => ({ berth, kind: 'signal', from: 2, to: 1, t, point: [10, -1200 + 1000 * t], errorM: 1, evidence: 'invented' });
const map = (): AnchorMap => ({ area: 'TEST', sources: ['invented'], anchors: [a('A', 0.1), a('B', 0.5)], unmapped: [] });
const event = (kind: string, extra = {}) => ({ kind, area: 'TEST', descr: 'SYN1', ...extra });
async function run(name: string, anchors: AnchorMap, rows: unknown[]) {
  const dir = resolve(scratch, name); await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'anchors.json'), JSON.stringify(anchors));
  await writeFile(resolve(dir, 'graph.json'), JSON.stringify(data));
  await writeFile(resolve(dir, 'recording.ndjson'), rows.map((r) => JSON.stringify(r)).join('\n'));
  const child = spawnSync(process.execPath, [tool, '--anchors', resolve(dir, 'anchors.json'), '--recording', resolve(dir, 'recording.ndjson'), '--graph', resolve(dir, 'graph.json'), '--out', resolve(dir, 'out')], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(child.error, undefined);
  const report = JSON.parse(await readFile(resolve(dir, 'out/replay-report.json'), 'utf8'));
  return { status: child.status, report, dir };
}

async function runMultiple(name: string, anchors: AnchorMap, recordings: unknown[][], graph = data, smart?: Buffer, schedules: Array<{date: string; calls: ScheduleCall[]}> = []) {
  const dir = resolve(scratch, name); await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'anchors.json'), JSON.stringify(anchors));
  await writeFile(resolve(dir, 'graph.json'), JSON.stringify(graph));
  const files = await Promise.all(recordings.map(async (rows, index) => {
    const file = resolve(dir, `recording-${index + 1}.ndjson`);
    await writeFile(file, rows.map((r) => JSON.stringify(r)).join('\n'));
    return file;
  }));
  const recordingArgs = files.flatMap((file) => ['--recording', file]);
  const args = [tool, ...recordingArgs, '--anchors', resolve(dir, 'anchors.json'), '--graph', resolve(dir, 'graph.json'), '--out', resolve(dir, 'out')];
  if (smart) { const smartPath = resolve(dir, 'smart.json.gz'); await writeFile(smartPath, smart); args.push('--smart', smartPath); }
  for (let index = 0; index < schedules.length; index++) {
    const path = resolve(dir, `schedule-${index}.json`); await writeFile(path, JSON.stringify(schedules[index])); args.push('--schedule', path);
  }
  const child = spawnSync(process.execPath, args,
    { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(child.error, undefined);
  let reportText: string;
  try { reportText = await readFile(resolve(dir, 'out/replay-report.json'), 'utf8'); }
  catch { assert.fail(`replay-report CLI wrote no report (exit ${child.status}): ${child.stderr}`); }
  const report = JSON.parse(reportText!);
  return { status: child.status, report, dir };
}

test('CLI inventory includes cancel, snapshot and placeholder-only berths and rejects missing classification', async () => {
  const m = map(); m.unmapped.push({ berth: 'OUT', seen: 0, reason: 'outside-network', detail: 'invented boundary' });
  const { status, report } = await run('missing', m, [{ t: 0, e: event('interpose', { to: 'A' }) },
    { t: 100, e: event('cancel', { from: 'OUT' }) }, { t: 200, e: event('snapshot', { berths: { MISSING: '****' } }) }]);
  assert.equal(status, 1);
  assert.deepEqual(report.coverage.berths.map((b: { berth: string }) => b.berth), ['A', 'MISSING', 'OUT']);
  assert.match(report.violations.join(';'), /missing berth classification: MISSING/);
});

test('CLI rejects duplicate anchor/unmapped classifications', async () => {
  const m = map(); m.unmapped.push({ berth: 'A', seen: 1, reason: 'conflict', detail: 'invented conflict' });
  const { status, report } = await run('duplicate', m, [{ t: 0, e: event('interpose', { to: 'A' }) }]);
  assert.equal(status, 1);
  assert.match(report.violations.join(';'), /duplicate berth classification: A/);
});

test('CLI counts placeholder inventory without drawing bodies or treating hops as route evidence', async () => {
  const { status, report } = await run('placeholder', map(), [{ t: 0, e: event('step', { from: 'A', to: 'B', descr: '****' }) }]);
  assert.equal(status, 0);
  assert.equal(report.coverage.seen, 2);
  assert.equal(report.coverage.placeholderObservations, 1);
  assert.equal(report.headcodeChurn.physicalIds, 0);
  assert.equal(report.motion.starsDrawn, 0);
  assert.equal(report.stepSummary.mappedPairs, 0);
});

test('CLI rejects platform metadata that assigns the correct number to the wrong OSM track', async () => {
  const m = map(); m.anchors.push({ ...a('1000', 1), from: 4, to: 3, point: [40, -200], platform: '0', kind: 'platform' });
  const { status, report } = await run('wrong-platform', m, [{ t: 0, e: event('interpose', { to: '1000' }) }]);
  assert.equal(status, 1);
  assert.equal(report.platforms[0].correctTargetTrack, false);
  assert.ok(report.platforms[0].actuallyHeldWrongTrackSamples > 0);
});

test('CLI recognizes a completed platform arrival at the cab clearance point', async () => {
  const m = map(); m.anchors.push({ ...a('1000', 1), platform: '0', kind: 'platform' });
  const { status, report } = await run('completed-platform', m, [
    { t: 0, e: event('interpose', { to: 'B' }) },
    { t: 20000, e: event('step', { from: 'B', to: '1000' }) },
    { t: 200000, e: event('heartbeat') },
  ]);
  assert.equal(status, 0);
  assert.equal(report.platforms[0].correctTargetTrack, true);
  assert.ok(report.platforms[0].reachedSamples > 0);
  assert.equal(report.platforms[0].actuallyHeldWrongTrackSamples, 0);
  assert.equal(report.platformStepSummary.reachedCorrectTrack, 1);
  assert.equal(report.platformSteps[0].resolution, 'reached-correct-track');
});

test('platform cab clearance follows the rail across a short reversed terminal edge', () => {
  const graph = buildGraph({ nodes: [[1, 10, -300], [2, 10, -201], [3, 10, -200]],
    rails: [{ id: 1, nodes: [3, 2, 1], tunnel: false, bridge: false, layer: 0, service: 'main' }] });
  const anchor = { ...a('1000', 1), from: 2, to: 3, point: [10, -200] as [number, number], platform: '0', kind: 'platform' as const };
  const stop = platformStoppingPoint(graph, anchor);
  assert.ok(stop);
  assert.equal(stop.edge, graph.edges[1]);
  const from = graph.pos.get(stop.edge.a)!, to = graph.pos.get(stop.edge.b)!;
  assert.ok(Math.abs(from[1] + (to[1] - from[1]) * stop.t - (anchor.point[1] - DEFAULT_BUFFER_CLEARANCE_M)) < 1e-8);
});

test('CLI distinguishes pending moving platform authority from a reached platform nose', async () => {
  const m = map(); m.anchors.push({ ...a('1000', 1), platform: '0', kind: 'platform' });
  const { status, report } = await run('authority', m, [{ t: 0, e: event('interpose', { to: 'A' }) },
    { t: 20000, e: event('step', { from: 'A', to: '1000' }) }]);
  assert.equal(status, 0);
  assert.equal(report.platforms[0].correctTargetTrack, true);
  assert.equal(report.platforms[0].reachedSamples, 0);
  assert.ok(report.platforms[0].movingSamples > 0);
  assert.equal(report.platforms[0].actuallyHeldWrongTrackSamples, 0);
  assert.equal(report.stepSummary.mappedPairs, 1);
  assert.equal(report.platformStepSummary.total, 1);
  assert.equal(report.platformStepSummary.reachedCorrectTrack, 0);
  assert.equal(report.platformStepSummary.unresolved, 1);
  assert.equal(report.platformSteps[0].resolution, 'pending');
  assert.equal(report.platformSteps[0].physicalId, 1);
});

test('CLI counts description replacement by physical id and includes fades in sampled train-seconds', async () => {
  const { status, report } = await run('churn', map(), [{ t: 0, e: event('interpose', { to: 'A' }) },
    { t: 100, e: event('interpose', { to: 'A', descr: 'SYN2' }) },
    { t: 100, e: event('interpose', { to: 'A', descr: 'SYN3' }) },
    { t: 200, e: event('cancel', { from: 'A', descr: 'SYN3' }) }]);
  assert.equal(status, 0);
  assert.equal(report.headcodeChurn.physicalIds, 1);
  assert.equal(report.headcodeChurn.idsWithMultipleDescriptions, 1);
  assert.equal(report.headcodeChurn.renames, 2);
  assert.equal(report.headcodeChurn.unattributedRenames, 0);
  assert.equal(report.headcodeChurn.byPhysicalId[0].renameCount, 2);
  assert.equal(report.headcodeChurn.byPhysicalId[0].descriptionsCount, 3);
  assert.equal(report.headcodeChurn.maxRenamesPerPhysicalId, 2);
  assert.equal(report.headcodeChurn.medianDescriptionsPerPhysicalId, 3);
  assert.ok(report.drawnTime.fadingTrainSeconds > 4.8);
  assert.ok(report.drawnTime.anchoredTrainSeconds > report.drawnTime.fadingTrainSeconds);
  assert.equal(report.drawnTime.estimatedTrainSeconds, 0);
});

test('CLI rejects a mapped step with no graph route', async () => {
  const m = map(); m.anchors[1] = { ...a('B', 0.5), from: 4, to: 3, point: [40, -700] };
  const { status, report } = await run('disconnected', m, [{ t: 0, e: event('step', { from: 'A', to: 'B' }) }]);
  assert.equal(status, 1);
  assert.equal(report.stepSummary.disconnectedPairs, 1);
  assert.match(report.violations.join(';'), /mapped step disconnected/);
});

test('CLI rejects matched residence implying more than 50 m/s', async () => {
  const { status, report } = await run('fast-step', map(), [{ t: 0, e: event('interpose', { to: 'A' }) },
    { t: 1000, e: event('step', { from: 'A', to: 'B' }) }]);
  assert.equal(status, 1);
  assert.equal(report.stepSummary.impliedSpeedFlagPairs, 1);
  assert.match(report.violations.join(';'), /mapped step implied-speed/);
  assert.equal(report.stepJumps[0].speedMps, 400);
});

test('growing recording capture omits only an incomplete final JSON line', () => {
  const complete = Buffer.from('{"t":1,"e":{"kind":"heartbeat","area":"TEST"}}\n');
  const partial = Buffer.concat([complete, Buffer.from('{"t":2,"e":{"kind":"heartbeat","area":"TEST"}')]);
  const cut = completeRecordingPrefix(partial, true);
  assert.deepEqual(cut.bytes, complete);
  assert.equal(cut.trailingBytesOmitted, partial.length - complete.length);
  const validFinal = completeRecordingPrefix(Buffer.from('{"t":1,"e":{"kind":"heartbeat","area":"TEST"}}'), true);
  assert.equal(validFinal.trailingBytesOmitted, 0);
  const malformed = Buffer.from('{"t":1,"e":]');
  const keptMalformed = completeRecordingPrefix(malformed, true);
  assert.equal(keptMalformed.trailingBytesOmitted, 0);
  assert.throws(() => parseRecording(keptMalformed.bytes.toString('utf8')), /invalid recording line/);
});

test('optional SMART reconciliation classifies candidates before replay metrics and keeps positions pending', async () => {
  const previous = map(); previous.area = 'Y9'; previous.anchors = [a('A', 0.1)]; previous.unmapped = [];
  const smart = gzipSync(Buffer.from(JSON.stringify({ BERTHDATA: [] })));
  const { status, report } = await runMultiple('preserve-position-map', previous,
    [[{ t: 0, e: event('interpose', { area: 'Y9', to: 'NEW' }) }],
      [{ t: 0, e: event('interpose', { area: 'Y9', to: 'NEW', descr: 'SYN2' }) }]], data, smart);
  assert.equal(status, 0);
  assert.equal(report.berthsReconciliation.status, 'COMPLETE');
  assert.equal(report.berthsReconciliation.candidatePlacement.status, 'pending-validation');
  const candidate = report.coverage.berths.find((berth: { berth: string }) => berth.berth === 'NEW');
  assert.equal(candidate.classification, 'unmapped');
  assert.equal(candidate.reason, 'no-evidence');
  assert.equal(report.recordings[0].metrics.coverage.berths.find((berth: { berth: string }) => berth.berth === 'NEW').classification, 'unmapped');
  assert.equal(report.violations.some((violation: string) => violation.includes('missing berth classification: NEW')), false);
  assert.match(report.reproducibility.inputHashes.effectiveAnchors.sha256, /^[a-f0-9]{64}$/);
});

test('CLI combines multiple recordings with union reasons, per-recording measures and bounded input hashes', async () => {
  const multiData: KxData = { ...data, platforms: [
    { id: 20, ref: '0', pts: [[42, -200], [45, -200], [45, -300], [42, -300]] },
    { id: 21, ref: '1', pts: [[12, -200], [15, -200], [15, -300], [12, -300]] }] };
  const m = map();
  m.anchors.push({ ...a('1000', 1), from: 4, to: 3, point: [40, -200], platform: '0', kind: 'platform' });
  m.anchors.push({ ...a('1001', 1), from: 2, to: 1, point: [10, -200], platform: '1', kind: 'platform' });
  m.unmapped.push({ berth: 'OUT', seen: 1, reason: 'outside-network', detail: 'synthetic boundary outside the graph' });
  const { status, report, dir } = await runMultiple('multi-recording', m, [
    [{ t: 0, e: event('interpose', { to: 'A' }) },
      { t: 100, e: event('interpose', { to: 'A', descr: 'SYN2' }) },
      { t: 40000, e: event('step', { from: 'A', to: 'B', descr: 'SYN2' }) },
      { t: 40100, e: event('step', { from: 'B', to: 'OUT', descr: '****' }) }],
    [{ t: 0, e: event('interpose', { to: '1000', descr: 'SYN3' }) },
      { t: 20000, e: event('interpose', { to: '1001', descr: 'SYN4' }) }],
  ], multiData);
  assert.equal(status, 0);
  assert.ok(Array.isArray(report.recordings), 'a report that combines recordings lists each one');
  assert.equal(report.recordings.length, 2);
  assert.equal(report.recordings[0].metrics.headcodeChurn.renames, 1);
  assert.equal(report.recordings[0].metrics.stepSummary.mappedPairs, 1);
  assert.equal(report.recordings[1].metrics.platforms.find((p: { berth: string }) => p.berth === '1000').platform, '0');
  assert.equal(report.recordings[1].metrics.platforms.find((p: { berth: string }) => p.berth === '1001').platform, '1');
  assert.equal(report.coverage.seen, 5);
  assert.equal(report.coverage.anchored, 4);
  assert.equal(report.coverage.unmapped, 1);
  assert.deepEqual(report.coverage.berths.find((b: { berth: string }) => b.berth === 'OUT'), {
    berth: 'OUT', observations: 1, classification: 'unmapped', reason: 'outside-network', detail: 'synthetic boundary outside the graph',
  });
  assert.equal(report.motion.starsDrawn, 0);
  assert.equal(report.headcodeChurn.renames, 1);
  assert.equal(report.stepJumps[0].from, 'A');
  assert.equal(report.stepJumps[0].to, 'B');
  assert.ok(report.recordings.every((r: { input: { sha256: string; capturedBounds: { byteStart: number; byteEndExclusive: number; firstEventTimeMs: number; lastEventTimeMs: number } } }) =>
    /^[a-f0-9]{64}$/.test(r.input.sha256) && r.input.capturedBounds.byteStart === 0 && r.input.capturedBounds.byteEndExclusive > 0 &&
    Number.isFinite(r.input.capturedBounds.firstEventTimeMs) && Number.isFinite(r.input.capturedBounds.lastEventTimeMs)));
  assert.equal(report.reproducibility.inputHashes.anchors.sha256.length, 64);
  assert.equal(report.reproducibility.inputHashes.graph.sha256.length, 64);
  const md = await readFile(resolve(dir, 'out/replay-report.md'), 'utf8');
  assert.match(md, /Union berth inventory/);
  assert.match(md, /synthetic boundary outside the graph/);
  assert.match(md, /Placeholder draw check:\*\* PASS — 0 \*\*\*\* samples drawn across all recordings/);
  assert.match(md, /1000 \| 0 \| yes/);
  const command = report.reproducibility.command;
  const reproduced = spawnSync(command.executable, command.args, { cwd: command.cwd, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(reproduced.status, 0, reproduced.stderr);
  const reproducedOut = command.args[command.args.indexOf('--out') + 1];
  const rerun = JSON.parse(await readFile(resolve(reproducedOut!, 'replay-report.json'), 'utf8'));
  assert.equal(rerun.coverage.seen, report.coverage.seen);
  assert.deepEqual(rerun.reproducibility.inputHashes.recordings.map((input: { sha256: string }) => input.sha256),
    report.reproducibility.inputHashes.recordings.map((input: { sha256: string }) => input.sha256));
});


function shortCall(date: string, at: number): ScheduleCall {
  return { uid: 'INVENTED', headcode: '1SYN', operator: 'GN', category: 'XX', date, serviceDate: date, stp: 'P',
    startDate: date, endDate: date, platform: null, origin: 'MORGATE', destination: 'INVENTED', arrival: null, departure: null,
    publicArrival: null, publicDeparture: null, arrivalMs: at, departureMs: null, publicArrivalMs: null, publicDepartureMs: null };
}
test('replay uses the page birth formation and explicitly reports missing-timetable fallback', () => {
  const date = '2026-01-15', at = Date.parse(`${date}T12:00:00Z`), m = map();
  m.anchors.push({ ...a('1000', 1), platform: '0', kind: 'platform' });
  const rows = parseRecording(JSON.stringify({t: at, e: event('step', {from: 'A', to: '1000', descr: '1SYN'})}));
  const scheduled = replayReport(data, rows, m, {schedule: {date, calls: [shortCall(date, at)]}});
  const assumed = replayReport(data, rows, m);
  assert.equal(scheduled.platformSteps[0].formation?.kind, 'gn717x6');
  assert.equal(scheduled.platformSteps[0].lengthM, trainLayout('gn717x6').length);
  assert.equal(scheduled.platformSteps[0].formationBasis, 'timetable-matched');
  assert.equal(assumed.platformSteps[0].lengthM, trainLayout('lner9').length);
  assert.equal(assumed.platformSteps[0].formationBasis, 'assumed-fallback');
  assert.match(assumed.timetable.note, /assumed fallback/i);
  assert.equal(scheduled.platformSteps[0].firstObservedAtMs, at);
  assert.ok(scheduled.platformSteps[0].lastObservedAtMs !== undefined);
  assert.ok(scheduled.platformSteps[0].lastObservedAtMs >= at);
  assert.ok(typeof scheduled.platformSteps[0].terminalReason === 'string');
  assert.match(scheduled.platformSteps[0].terminalReason, /recording.*ended|replay.*ended/i);
});
test('CLI pairs repeated frozen schedule inputs by date and writes every incoming event in Markdown', async () => {
  const dates = ['2026-01-15','2026-01-16','2026-01-17'];
  const times = dates.map(d => Date.parse(`${d}T12:00:00Z`)), m=map();
  m.anchors.push({ ...a('1000', 1), platform: '0', kind: 'platform' });
  const recordings=times.map(t => [{t,e:event('step',{from:'A',to:'1000',descr:'1SYN'})}]);
  const result=await runMultiple('scheduled-dates',m,recordings,data,undefined,
    [ {date:dates[1],calls:[shortCall(dates[1],times[1])]}, {date:dates[0],calls:[shortCall(dates[0],times[0])]} ]);
  const r=result.report;
  assert.deepEqual(r.recordings.map((x:any)=>x.metrics.platformSteps[0].formation.kind), ['gn717x6','gn717x6','lner9']);
  assert.equal(r.recordings[2].metrics.platformSteps[0].formationBasis,'assumed-fallback');
  assert.match(r.recordings[2].metrics.timetable.note,/assumed fallback/i);
  assert.equal(r.reproducibility.inputHashes.schedules.length,2);
  assert.equal(r.reproducibility.command.args.filter((x:string)=>x==='--schedule').length,2);
  for(const input of r.reproducibility.inputHashes.schedules){
    assert.equal(await readFile(input.capturedPath,'utf8'),await readFile(input.path,'utf8'));
    assert.match(input.sha256,/^[a-f0-9]{64}$/);
  }
  const md=await readFile(resolve(result.dir,'out/replay-report.md'),'utf8');
  assert.match(md,/Event index/); assert.match(md,/Body id/); assert.match(md,/Formation/); assert.match(md,/assumed.fallback/i);
  for(const date of dates)assert.ok(md.includes(date));
});

test('incoming rows retain explicit empty or replacement snapshot evidence without inferring arrival', () => {
  const m=map();m.anchors.push({...a('1000',1),platform:'0',kind:'platform'});
  for(const berths of [{}, {1000:'REPLACEMENT'}]){
    const rows=parseRecording([
      {t:0,e:event('step',{from:'A',to:'1000'})},
      {t:1000,e:event('snapshot',{berths})},
    ].map(x=>JSON.stringify(x)).join('\n'));
    const step=replayReport(data,rows,m).platformSteps[0];
    assert.deepEqual(step.sourceEvidence,{eventIndex:1,atMs:1000,kind:'snapshot',empty:Object.keys(berths).length===0,
      physicalDescriptionPresent:false,stepDescriptionPresent:false, ...(Object.keys(berths).length ? {targetBerthOwner: 'REPLACEMENT'} : {})});
    assert.equal(step.reachedAtMs,undefined);
    assert.ok(typeof step.terminalReason === 'string');
    if (Object.keys(berths).length === 0) {
      assert.match(step.terminalReason,/linked body disappeared after observed fading/i);
      assert.deepEqual(step.terminalSourceEvent,step.sourceEvidence);
    } else {
      assert.match(step.terminalReason,/replay ended.*moving/i);
      assert.equal(step.terminalSourceEvent,undefined);
    }
  }
});

test('co-located platform alias observations remain distinct from physical incoming arrivals', () => {
  const m=map();
  m.anchors.push({...a('1000',1),platform:'0',kind:'platform'}, {...a('ALIAS',1),platform:'0',kind:'platform'});
  const rows=parseRecording([
    {t:0,e:event('interpose',{to:'1000'})},
    {t:100,e:event('step',{from:'1000',to:'B'})},
    {t:488,e:event('step',{from:'ALIAS',to:'1000'})},
  ].map(x=>JSON.stringify(x)).join('\n'));
  const r=replayReport(data,rows,m), step=r.platformSteps[0];
  assert.equal(step.observationKind,'same-stop-transfer');
  assert.equal(step.resolution,'same-stop-transfer');
  assert.ok(typeof step.terminalReason === 'string');
  assert.match(step.terminalReason,/same-stop transfer after departure/);
  assert.equal(step.routeRefused,true);
  assert.equal(r.platformStepSummary.total,1);
  assert.equal(r.platformStepSummary.incoming,0);
  assert.equal(r.platformStepSummary.sameStopTransfers,1);
  assert.equal(r.platformStepSummary.reachedCorrectTrack,0);
  assert.equal(r.platformStepSummary.unresolved,0);
});
