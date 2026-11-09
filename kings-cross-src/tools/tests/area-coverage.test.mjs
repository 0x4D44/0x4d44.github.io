import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { smartCandidates, analyzeCoverage, ensureScratchOutput, main } from '../area-coverage.mjs';

const scratch = fileURLToPath(new URL('../../../.scratch/a42/coverage/', import.meta.url));
async function fixture() {
  await mkdir(scratch, { recursive: true });
  return mkdtemp(path.join(scratch, 'synthetic-'));
}
const smartRow = (fields = {}) => ({ TD: 'WH', STANME: 'STPANCRAS', EVENT: 'A', PLATFORM: '1', FROMBERTH: 'Q001', TOBERTH: 'Z001', ...fields });
const event = (kind, fields = {}) => ({ t: 1000, e: { area: 'WH', kind, ...fields } });

test('direction-selected candidates preserve competing platforms, deduplicate rows and isolate areas', () => {
  const rows = [smartRow(), smartRow(), smartRow({ EVENT: 'B', FROMBERTH: 'Z001', PLATFORM: '2' }),
    smartRow({ TD: 'CT' }), smartRow({ STANME: 'OTHER' })];
  const r = smartCandidates(rows, 'WH');
  assert.deepEqual({ rows: r.rows, endpoints: [...r.endpoints], associations: r.associations }, {
    rows: 3, endpoints: ['Q001', 'Z001'], associations: [
      { platform: '1', event: 'A', berth: 'Z001', role: 'arrival' },
      { platform: '2', event: 'B', berth: 'Z001', role: 'departure' }] });
});

test('blank Thameslink platforms stay unresolved and do not manufacture A/B', () => {
  const r = smartCandidates([smartRow({ TD: 'X0', STANME: 'STPANCA&B', PLATFORM: '' })], 'X0');
  assert.deepEqual([r.rows, r.endpoints.size, r.associations], [1, 2, []]);
});

test('current C-class evidence differs from snapshots; numeric identities and S-class receipt stay visible', () => {
  const r = analyzeCoverage([event('step', { from: 'Q001', to: 'Z001', descr: '1234' }),
    event('cancel', { from: 'N001', descr: '1A23' }), event('snapshot', { berths: { Z002: '2B34' }, sclass: { data: { '000A': '01' } } }),
    event('sclass', { address: '000A', data: '01FF', msgType: 'SF' }),
    { t: 1000, e: { area: 'CT', kind: 'step', from: 'Z001', to: 'Z002', descr: '9999' } }, event('step')], 'WH',
  smartCandidates([smartRow(), smartRow({ TOBERTH: 'Z002', PLATFORM: '2' })], 'WH'));
  assert.deepEqual({ headcodes: r.headcodes, missing: r.smart.missingPlatformCandidates, snapshot: r.snapshotOnlyBerths,
    unmapped: r.unmappedToStationCandidates, absent: r.absentFromAreaSmart, sclass: r.sclass.byteAddresses,
    invalid: r.invalidRows, other: r.otherAreaRows, platform: r.smart.platformAssociations.map(a => [a.platform, a.headcodes, a.snapshotOnly]) },
  { headcodes: ['1A23', '2B34', '1234'], missing: [], snapshot: ['Z002'], unmapped: ['N001'], absent: ['N001'],
    sclass: ['000A', '000B'], invalid: 1, other: 1, platform: [['1', ['1234'], false], ['2', ['2B34'], true]] });
});

test('quiet snapshot-only platforms retain actual headcodes without claiming C-class event delivery', () => {
  const r = analyzeCoverage([event('snapshot', { berths: { Z001: '1234' } })], 'WH', smartCandidates([smartRow()], 'WH'));
  assert.deepEqual({ headcodes: r.headcodes, eventHeadcodes: r.eventHeadcodes, missing: r.smart.missingPlatformCandidates,
    eventMissing: r.smart.missingEventPlatformCandidates, events: r.smart.eventObservedPlatformCandidateCount,
    snapshots: r.smart.snapshotOnlyPlatformCandidateCount, association: r.smart.platformAssociations[0] },
  { headcodes: ['1234'], eventHeadcodes: [], missing: [], eventMissing: ['Z001'], events: 0, snapshots: 1,
    association: { platform: '1', event: 'A', berth: 'Z001', role: 'arrival', observedEvents: 0, snapshotObservations: 1, headcodes: ['1234'], snapshotOnly: true } });
});

test('outputs reject traversal, prefix siblings and symlink components including .scratch', async () => {
  const dir = await fixture(), root = path.join(dir, 'repo');
  await mkdir(root); await mkdir(path.join(root, '.scratch'));
  await symlink(dir, path.join(root, '.scratch', 'escape'));
  const linkedRoot = path.join(dir, 'linked-root'); await mkdir(linkedRoot);
  await symlink(dir, path.join(linkedRoot, '.scratch'));
  const cases = [[path.join(root, '.scratch', '..', 'public'), root], [path.join(root, '.scratch-other'), root],
    [path.join(root, '.scratch', 'escape', 'new'), root], [path.join(linkedRoot, '.scratch', 'new'), linkedRoot]];
  const results = [];
  for (const [out, repoRoot] of cases) {
    try { await ensureScratchOutput(out, repoRoot); results.push('accepted'); } catch { results.push('rejected'); }
  }
  assert.deepEqual(results, ['rejected', 'rejected', 'rejected', 'rejected']);
});

test('CLI reads both recorder layouts, freezes complete lines, writes private reports and refuses output symlinks', async () => {
  const dir = await fixture(), recordings = path.join(dir, 'data', 'recordings'), areaRecordings = path.join(dir, 'data', 'areas', 'CT', 'recordings');
  await mkdir(recordings, { recursive: true }); await mkdir(areaRecordings, { recursive: true });
  const smart = path.join(dir, 'smart.json.gz'); await writeFile(smart, gzipSync(JSON.stringify({ BERTHDATA: [smartRow()] })));
  await writeFile(path.join(recordings, 'td-WH-20261101.ndjson'), JSON.stringify(event('interpose', { to: 'Z001', descr: '1234' })) + '\n{bad}\n{"t":');
  await writeFile(path.join(areaRecordings, 'td-CT-20261101.ndjson'), JSON.stringify({ t: 1000, e: { area: 'CT', kind: 'heartbeat' } }) + '\n');
  const out = path.join(dir, 'output');
  const report = await main(['--data-dir', path.join(dir, 'data'), '--smart', smart, '--out', out]);
  const protectedDir = path.join(dir, 'protected'); await mkdir(protectedDir);
  const target = path.join(dir, 'target'); await writeFile(target, 'unchanged');
  await symlink(target, path.join(protectedDir, 'area-coverage.json'));
  let rejected = false;
  try { await main(['--data-dir', path.join(dir, 'data'), '--smart', smart, '--out', protectedDir]); } catch (error) { rejected = error.code === 'EEXIST'; }
  const saved = JSON.parse(await readFile(path.join(out, 'area-coverage.json'), 'utf8'));
  assert.deepEqual({ areas: report.areas.map(r => [r.area, r.recordingFiles]), tail: report.sources.find(s => s.area === 'WH').ignoredTailBytes,
    malformed: report.sources.find(s => s.area === 'WH').malformedLines, hashes: report.sources.every(s => /^[a-f0-9]{64}$/.test(s.sha256)),
    private: saved.private, rejected, target: await readFile(target, 'utf8') },
  { areas: [['WH', 1], ['X0', 0], ['CT', 1], ['EB', 0]], tail: 5, malformed: 1, hashes: true, private: true, rejected: true, target: 'unchanged' });
});
