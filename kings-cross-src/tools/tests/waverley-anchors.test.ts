// Synthetic private files only: no live recording, SMART lookup or real berth fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, symlink, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const scratch = path.join(root, '.scratch');
async function fixture() {
  await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(path.join(scratch, 'eb-cli-'));
  const osm = path.join(dir, 'track.json'), smart = path.join(dir, 'smart.json.gz');
  await writeFile(osm, JSON.stringify({ attribution: 'Synthetic', origin: { lat: 0, lon: 0 }, rails: [], platforms: [] }));
  await writeFile(smart, gzipSync(JSON.stringify({ BERTHDATA: [] })));
  const run = (out: string, dataDir?: string) => spawnSync(process.execPath, [path.join(root, 'kings-cross-src/tools/waverley-anchors.ts'), '--geometry', osm, '--smart', smart, '--out', out, ...(dataDir ? ['--data-dir', dataDir] : [])], { encoding: 'utf8', timeout: 10000, input: '' });
  return { dir, run };
}
const event = (area: string, berth: string) => JSON.stringify({ t: 1, e: { kind: 'step', area, from: berth, to: 'ZZ99' } }) + '\n';

test('EB CLI reads actual ndjson recordings from data root and direct recordings folder', async () => {
  const { dir, run } = await fixture(), recordings = path.join(dir, 'recordings');
  await mkdir(recordings);
  await writeFile(path.join(recordings, 'td-EB-20990101.ndjson'), event('EB', 'UNKN'));
  await writeFile(path.join(recordings, 'td-EB-20990102.ndjson.gz'), gzipSync(event('EB', 'GZIP')));
  await writeFile(path.join(recordings, 'td-Y9-20990101.ndjson'), 'invalid ignored foreign file');
  await writeFile(path.join(recordings, 'unrelated.jsonl'), 'invalid ignored unrelated file');
  for (const [i, dataDir] of [dir, recordings].entries()) {
    const out = path.join(dir, `output-${i}`), result = run(out, dataDir);
    assert.equal(result.status, 0, result.stderr);
    const map = JSON.parse(await readFile(path.join(out, 'anchors.json'), 'utf8'));
    assert.deepEqual(map.unmapped.map((b: { berth: string }) => b.berth), ['GZIP', 'UNKN', 'ZZ99']);
    assert.equal(map.unmapped.find((b: { berth: string }) => b.berth === 'UNKN').reason, 'no-evidence');
    assert.ok(map.sources.some((s: string) => s.includes('td-EB-20990101.ndjson')));
  }
});

test('EB CLI validates selected files area and rejects foreign normalized events', async () => {
  const { dir, run } = await fixture();
  await writeFile(path.join(dir, 'td-EB-20990101.ndjson'), event('Y9', 'WRNG'));
  assert.notEqual(run(path.join(dir, 'out'), dir).status, 0);
});

test('EB CLI writes exclusive mode0600 files and rejects final file symlinks', async () => {
  const { dir, run } = await fixture(), out = path.join(dir, 'out');
  assert.equal(run(out).status, 0);
  for (const name of ['anchors.json', 'geometry.json', 'track.json']) assert.equal((await stat(path.join(out, name))).mode & 0o777, 0o600);
  assert.notEqual(run(out).status, 0, 'Existing output must never be overwritten');
  const linked = path.join(dir, 'linked'); await mkdir(linked);
  const target = path.join(dir, 'sentinel'); await writeFile(target, 'unchanged');
  await symlink(target, path.join(linked, 'anchors.json'));
  assert.notEqual(run(linked).status, 0);
  assert.equal(await readFile(target, 'utf8'), 'unchanged');
});

test('EB CLI rejects directory escape outside worktree scratch', async () => {
  const { dir, run } = await fixture();
  const link = path.join(dir, 'escape'); await symlink(root, link);
  const result = run(path.join(link, 'forbidden-eb-output'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside .scratch/);
  assert.notEqual(run(path.join(root, 'forbidden-eb-output')).status, 0);
});

test('EB CLI freezes complete lines while recording an unfinished tail and rejects malformed complete lines', async () => {
  const { dir, run } = await fixture();
  const file = path.join(dir, 'td-EB-20990101.ndjson');
  const tail = '{"t":2,"e":';
  await writeFile(file, event('EB', 'TAIL') + tail);
  const out = path.join(dir, 'tail-out'), result = run(out, dir);
  assert.equal(result.status, 0, result.stderr);
  const map = JSON.parse(await readFile(path.join(out, 'anchors.json'), 'utf8'));
  assert.ok(map.unmapped.some((b: { berth: string }) => b.berth === 'TAIL'));
  assert.ok(map.sources.some((s: string) => s.includes(`ignored incomplete tail: ${Buffer.byteLength(tail)} bytes`) && /sha256 [a-f0-9]{64}/.test(s)));
  assert.ok(map.sources.some((s: string) => /OSM input sha256 [a-f0-9]{64}/.test(s)));
  assert.ok(map.sources.some((s: string) => /SMART compressed input sha256 [a-f0-9]{64}/.test(s)));
  await writeFile(file, event('EB', 'TAIL') + '{broken}\n');
  assert.notEqual(run(path.join(dir, 'malformed-out'), dir).status, 0);
});
