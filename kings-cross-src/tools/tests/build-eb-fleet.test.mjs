import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFleetTable } from '../../core/edinburgh-diagrams.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const tool = path.join(root, 'kings-cross-src/tools/build-eb-fleet.ts');

// Invented diagrams and headcodes in the published layout. Nothing here is an operator's.
const TEXT = `
Vehicle Diagram Detail Report
Diagram ID ZZ ZZ101
Days SX
Date Notes Operates from 28th September
Class 385 - 3 Car EMU
Duration 16:15
Distance 338.8
Location Arr Dep Activity Train Distance Vehicle Cover
Sidings One 07:10 07:10 5A01LA 2.1 ZZ103 / ZZ101
Terminus One07:18 07:30 1A01LA 49.2 ZZ101 / ZZ103
Edinburgh 08:22 08:31½ 1A02LA 96.2 ZZ103 / ZZ101
Edinburgh
Diagram ID ZZ ZZ103
Days SX
Date Notes Operates from 28th September
Class 385 - 4 car EMU
Duration 01:00
Distance 0
Location Arr Dep Activity Train Distance Vehicle Cover
Sidings One Stabld 0
Sidings One
Diagram ID ZZ ZZ301
Days Sun
Class HST - 5 Coaches
Duration 05:00
Distance 90.0
Location Arr Dep Activity Train Distance Vehicle Cover
Edinburgh 14:03 14:20 1C01LA 50.0
Edinburgh
`;

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'kx-eb-fleet-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const text = path.join(dir, 'diagrams-may2026.txt');
  await writeFile(text, TEXT);
  return { dir, text };
}
const run = (args, env = {}) => spawnSync(process.execPath, [tool, ...args], { cwd: root, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
const missing = async p => access(p).then(() => false, () => true);

test('writes a validated 0600 table, atomically, and prints counts only', async t => {
  const { dir, text } = await fixture(t);
  const out = path.join(dir, 'private', 'areas', 'EB', 'fleet.json');
  const result = run(['--text', text, '--out', out]);
  assert.equal(result.status, 0, result.stderr);
  const table = validateFleetTable(JSON.parse(await readFile(out, 'utf8')));
  assert.equal(table.source, 'diagrams-may2026.txt');
  assert.deepEqual(table.workings.map(w => [w.headcode, w.days, w.from, w.edinburghMinutes]).sort(), [
    ['1A01', 'SX', '2026-09-28', [502]], ['1A02', 'SX', '2026-09-28', [511.5]], ['1C01', 'Sun', undefined, [860]],
  ].sort(), 'the year comes from the file name, so "from 28th September" is 2026-09-28');
  assert.deepEqual(table.workings.find(w => w.headcode === '1C01').units, [{ diagram: 'ZZ301', class: '43', cars: 7 }]);
  assert.equal((await stat(out)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(path.dirname(out)), ['fleet.json'], 'no temp file is left behind');
  // Counts, never rows: no headcode, diagram id or time appears in what the tool prints.
  assert.match(result.stdout, /3 workings call at Edinburgh/);
  assert.match(result.stdout, /385x3\+385x4 2/);
  assert.match(result.stdout, /43x7 1/);
  assert.doesNotMatch(result.stdout + result.stderr, /1A0\d|1C01|ZZ\d{3}|08:31|\b511\b/);
});

test('replaces an existing table in place and defaults to KX_DATA_DIR/areas/EB/fleet.json', async t => {
  const { dir, text } = await fixture(t);
  const out = path.join(dir, 'data', 'areas', 'EB', 'fleet.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, 'old');
  const result = run(['--text', text], { KX_DATA_DIR: path.join(dir, 'data') });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(validateFleetTable(JSON.parse(await readFile(out, 'utf8'))).workings.length, 3);
  assert.deepEqual(await readdir(path.dirname(out)), ['fleet.json']);
});

test('refuses an output inside a git repository, directly or through a symlink', async t => {
  const { dir, text } = await fixture(t);
  const repo = path.join(dir, 'clone');
  await mkdir(path.join(repo, '.git'), { recursive: true });
  await mkdir(path.join(repo, 'sub'));
  const worktree = path.join(dir, 'worktree'); // a linked worktree has a .git file, not a directory
  await mkdir(worktree);
  await writeFile(path.join(worktree, '.git'), 'gitdir: elsewhere\n');
  await symlink(path.join(repo, 'sub'), path.join(dir, 'link'));
  const here = path.join(root, 'kings-cross-src', 'fleet-test-output.json');
  for (const out of [path.join(repo, 'sub', 'fleet.json'), path.join(repo, 'new', 'deeper', 'fleet.json'), path.join(worktree, 'fleet.json'), path.join(dir, 'link', 'fleet.json'), here]) {
    const result = run(['--text', text, '--out', out]);
    assert.notEqual(result.status, 0, `${out} should be refused`);
    assert.match(result.stderr, /inside a git repository/);
    assert.equal(result.stdout, '');
  }
  assert.ok(await missing(here));
  assert.ok(await missing(path.join(repo, 'sub', 'fleet.json')));
  assert.ok(await missing(path.join(repo, 'new')), 'a refused path creates no directories');
  assert.ok(await missing(path.join(worktree, 'fleet.json')));
});

test('refuses an output that is a symlink or a directory, and leaves it untouched', async t => {
  const { dir, text } = await fixture(t);
  const target = path.join(dir, 'target.json');
  await writeFile(target, 'keep');
  await symlink(target, path.join(dir, 'link.json'));
  await mkdir(path.join(dir, 'a-directory'));
  for (const out of [path.join(dir, 'link.json'), path.join(dir, 'a-directory')]) {
    const result = run(['--text', text, '--out', out]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not a regular file/);
  }
  assert.equal(await readFile(target, 'utf8'), 'keep');
  assert.ok((await lstat(path.join(dir, 'link.json'))).isSymbolicLink());
  assert.deepEqual((await readdir(dir)).sort(), ['a-directory', 'diagrams-may2026.txt', 'link.json', 'target.json']);
});

test('refuses bad arguments and text that holds no Edinburgh workings, writing nothing', async t => {
  const { dir, text } = await fixture(t);
  const out = path.join(dir, 'fleet.json');
  const noYear = path.join(dir, 'diagrams.txt');
  await writeFile(noYear, TEXT);
  const empty = path.join(dir, 'empty-2026.txt');
  await writeFile(empty, 'Diagram ID ZZ ZZ101\nDays SX\nClass 385 - 3 Car EMU\nLocation Arr Dep Activity Train Distance Vehicle Cover\nGlasgow 07:00 07:10 1A01LA 1.0\n');
  const cases = [
    [[], /usage/], [['--text', text, '--bogus', 'x'], /Unknown option/], [['--text'], /Missing value/], [['--text', text, '--out'], /Missing value/],
    [['--text', text, '--text', text], /twice/], [['--text', text, '--year', '26'], /four-digit/],
    [['--text', noYear, '--out', out], /pass --year/], [['--text', empty, '--out', out], /no workings call at Edinburgh/],
    [['--text', path.join(dir, 'absent-2026.txt'), '--out', out], /ENOENT/],
  ];
  for (const [args, message] of cases) {
    const result = run(args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.match(result.stderr, message);
  }
  assert.ok(await missing(out));
  assert.equal(run(['--text', noYear, '--year', '2026', '--out', out]).status, 0, '--year supplies what the name lacks');
});
