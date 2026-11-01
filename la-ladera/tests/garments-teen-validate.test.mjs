// The one validator for the adult, child and teen garment libraries (tools/blender/garments_validate.mjs): `--all`, each library against its own caps, the adult scan's narrow
// exemption for the teen files that sit inside garments/, and the teen library's complete-mode checks. The teen export's own bytes are held by garments-teen.test.mjs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/garments-teen-validate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateGarments, validateTeenGarments } from '../tools/blender/garments_validate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = join(ROOT, 'assets', 'models');
const VALIDATE = join(ROOT, 'tools', 'blender', 'garments_validate.mjs');
const TEEN_CATALOGUE = join(ROOT, 'tools', 'blender', 'garments_teen.catalog.json');
const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'));
const editJSON = (path, fn) => { const j = readJSON(path); fn(j); writeFileSync(path, JSON.stringify(j) + '\n'); };
const cli = (...args) => spawnSync(process.execPath, [VALIDATE, ...args], { encoding: 'utf8', timeout: 240_000, windowsHide: true });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const unlisted = (name) => new RegExp(`unlisted GLB '${name.replace(/[./]/g, (c) => (c === '/' ? '[\\\\/]' : '\\.'))}'`);   // (the message names the path with the platform's separator)

const scratch = (t) => { const dir = mkdtempSync(join(tmpdir(), 'ladera-garments-all-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };
/** A models directory of just the garment libraries (all three, or the adult and child only), to damage. */
function models(t, { teen = true } = {}) {
  const to = join(scratch(t), 'models');
  mkdirSync(to, { recursive: true });
  for (const f of ['manifest.garments.json', 'manifest.garments-child.json']) cpSync(join(MODELS, f), join(to, f));
  cpSync(join(MODELS, 'garments'), join(to, 'garments'), { recursive: true });
  cpSync(join(MODELS, 'garments-child'), join(to, 'garments-child'), { recursive: true });
  if (teen) cpSync(join(MODELS, 'manifest.garments_teen.json'), join(to, 'manifest.garments_teen.json'));
  else { rmSync(join(to, 'garments', 'garments_teen.glb')); rmSync(join(to, 'garments', 'teen'), { recursive: true }); }
  return to;
}

// ---------------------------------------------------------------- the CLI
test('--all --complete: the three libraries in one run, each against its own caps, each report the one its own run makes', (t) => {
  const json = join(scratch(t), 'all.json'), r = cli('--all', '--complete', '--json', json);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n').map((l) => l.replace(/:.*/, '')), ['PASS garments (complete)', 'PASS garments-child (complete)', 'PASS garments_teen (complete)']);
  const all = readJSON(json);
  assert.equal(all.ok, true);
  assert.deepEqual([all.adult, all.child, all.teen].map((x) => x.runtimeBudgetBytes), [2_000_000, 2_500_000, 700_000], 'each library is held to its own byte cap');
  for (const x of [all.adult, all.child, all.teen]) assert.ok(x.runtimeBytes <= x.runtimeBudgetBytes && x.errors.length === 0, `${x.set ?? x.sizeTag ?? 'adult'}: ${x.runtimeBytes} of ${x.runtimeBudgetBytes}`);
  assert.equal(all.child.sizeTag, 'child');
  assert.equal(all.child.gpuTextureBudgetBytes, 6_000_000);
  assert.deepEqual([all.teen.set, all.teen.assets, all.teen.catalogueGarments, all.teen.sizeClasses], ['garments_teen', 162, 29, 2]);
  assert.ok(all.teen.maxTriangles <= 800 && all.teen.maxLodTriangles <= 240);
  assert.ok(same(all.adult, validateGarments({ complete: true })), 'the adult report differs from the adult validator\'s own');
  assert.ok(same(all.child, validateGarments({ complete: true, child: true })), 'the child report differs from the child validator\'s own');
  assert.ok(same(all.teen, validateTeenGarments({ complete: true })), 'the teen report differs from the teen validator\'s own');
});

test('--teen and the bare command: the teen library alone, and the adult library as before', () => {
  const teen = cli('--teen', '--complete'), adult = cli('--complete');
  assert.equal(teen.status, 0, teen.stdout + teen.stderr);
  assert.match(teen.stdout, /^PASS garments_teen \(complete\): 162 states, 29 garments, \d+\/700000 bytes, max \d+\/\d+ high\/LOD triangles\n$/);
  assert.equal(adult.status, 0, adult.stdout + adult.stderr);
  assert.match(adult.stdout, /^PASS garments \(complete\): \d+ states, \d+ garments, \d+\/2000000 bytes/);
  assert.equal(adult.stdout.split('\n').filter(Boolean).length, 1, 'the bare command validates the adult library only');
});

test('arguments: one library at a time, --all takes no catalogue, unknown options and missing paths are errors, --help says what there is', () => {
  const refuses = (args, message) => { const r = cli(...args); assert.equal(r.status, 1, `${args.join(' ')}: exit ${r.status}`); assert.match(r.stderr, message, args.join(' ')); assert.equal(r.stdout, '', `${args.join(' ')} printed a verdict`); };
  refuses(['--child', '--teen'], /--child, --teen and --all may be given once and are mutually exclusive/);
  refuses(['--teen', '--teen'], /mutually exclusive/);
  refuses(['--all', '--teen'], /mutually exclusive/);
  refuses(['--all', '--catalogue', TEEN_CATALOGUE], /--catalogue names one library's catalogue/);
  refuses(['--teen', '--bogus'], /unknown option '--bogus'/);
  refuses(['--all', '--root'], /--root requires a path/);
  refuses(['--teen', '--json', '--complete'], /--json requires a path/);
  const help = cli('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage: garments_validate\.mjs \[--child\|--teen\|--all\] \[--complete\]/);
});

test('--all: a failing library fails the run and the others still report', (t) => {
  const dir = models(t), glb = join(dir, 'garments', 'garments_teen.glb'), json = join(dir, '..', 'all.json');
  const bytes = readFileSync(glb); bytes[bytes.length - 1] ^= 0xff; writeFileSync(glb, bytes);
  const r = cli('--all', '--complete', '--root', dir, '--json', json);
  assert.equal(r.status, 1);
  assert.deepEqual(r.stdout.trim().split('\n').map((l) => l.replace(/:.*/, '')), ['PASS garments (complete)', 'PASS garments-child (complete)', 'FAIL garments_teen (complete)']);
  assert.match(r.stderr, /ERROR garments\/garments_teen\.glb: SHA-256 differs from the manifest/);
  const all = readJSON(json);
  assert.deepEqual([all.ok, all.adult.ok, all.child.ok, all.teen.ok], [false, true, true, false]);
});

// ---------------------------------------------------------------- the adult scan and the teen files inside garments/
test('the adult and child reports are the same with the teen files in the tree as without them', (t) => {
  const withTeen = models(t), without = models(t, { teen: false });
  assert.ok(same(validateGarments({ modelsDir: withTeen, complete: true }), validateGarments({ modelsDir: without, complete: true })), 'the teen files change the adult report (they are a library of their own)');
  assert.ok(same(validateGarments({ modelsDir: withTeen, complete: true, child: true }), validateGarments({ modelsDir: without, complete: true, child: true })), 'the teen files change the child report');
  assert.equal(validateGarments({ modelsDir: withTeen, complete: true }).ok, true);
  assert.equal(validateTeenGarments({ modelsDir: without, complete: true }).ok, false, 'a tree without the teen library passes the teen validator');
});

test('the exemption is only for a teen library that its manifest declares: otherwise the teen files count against the adult cap and an unlisted GLB fails', (t) => {
  for (const [label, damage] of [
    ['a manifest of another set', (dir) => editJSON(join(dir, 'manifest.garments_teen.json'), (m) => { m.set = 'garments'; })],
    ['an adult-only manifest', (dir) => editJSON(join(dir, 'manifest.garments_teen.json'), (m) => { m.adultOnly = true; })],
    ['a manifest of another GLB', (dir) => editJSON(join(dir, 'manifest.garments_teen.json'), (m) => { m.files[0].glb = 'garments/elsewhere.glb'; })],
    ['no assets in the manifest', (dir) => editJSON(join(dir, 'manifest.garments_teen.json'), (m) => { m.files[0].assets = {}; })],
    ['no manifest', (dir) => rmSync(join(dir, 'manifest.garments_teen.json'))],
  ]) {
    const dir = models(t);
    damage(dir);
    const r = validateGarments({ modelsDir: dir, complete: true });
    assert.equal(r.ok, false, `${label}: the adult validator let the teen GLB through`);
    assert.match(r.errors.join('\n'), unlisted('garments/garments_teen.glb'), label);
    assert.match(r.errors.join('\n'), /runtime library is \d+ bytes, exceeding 2000000/, `${label}: the teen bytes are not counted against the adult cap`);
  }
});

test('the exemption is narrow: a stray GLB or a lookalike directory in garments/ still fails, stray bytes still count against the adult cap, and teen ballast does not', (t) => {
  const stray = (rel, bytes) => (dir) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), Buffer.alloc(bytes)); };
  for (const [label, damage, pattern] of [
    ['a stray GLB', stray('garments/stray.glb', 16), unlisted('garments/stray.glb')],
    ['a second teen-looking GLB', stray('garments/garments_teen2.glb', 16), unlisted('garments/garments_teen2.glb')],
    ['a lookalike directory', stray('garments/teen-extra/x.glb', 16), unlisted('garments/teen-extra/x.glb')],
    ['a GLB in a directory named like the file', stray('garments/garments_teen.glb.d/x.glb', 16), unlisted('garments/garments_teen.glb.d/x.glb')],
    ['ballast beside the teen files', stray('garments/ballast.bin', 1_200_000), /runtime library is \d+ bytes, exceeding 2000000/],
  ]) {
    const dir = models(t);
    damage(dir);
    const r = validateGarments({ modelsDir: dir, complete: true });
    assert.equal(r.ok, false, `${label}: the adult validator passed`);
    assert.match(r.errors.join('\n'), pattern, label);
  }
  const dir = models(t), clean = validateGarments({ modelsDir: dir, complete: true });
  stray('garments/teen/ballast.bin', 800_000)(dir);                                               // inside the teen library's own directory: the adult cap does not see it, the teen cap does
  assert.ok(same(validateGarments({ modelsDir: dir, complete: true }), clean), 'ballast in garments/teen/ changed the adult report');
  const teen = validateTeenGarments({ modelsDir: dir, complete: true });
  assert.equal(teen.ok, false);
  assert.match(teen.errors.join('\n'), /teen runtime library is \d+ bytes, exceeding 700000/);
  assert.equal(teen.runtimeBudgetBytes, 700_000, 'the teen library does not borrow the adult cap');
  editJSON(join(dir, 'manifest.garments_teen.json'), (m) => { m.limits.runtimeBytes = 2_000_000; });   // and the teen manifest cannot raise it
  const raised = validateTeenGarments({ modelsDir: dir, complete: true });
  assert.equal(raised.ok, false);
  assert.match(raised.errors.join('\n'), /teen manifest limit 'runtimeBytes' is missing or exceeds 700000/);
  assert.match(raised.errors.join('\n'), /teen runtime library is \d+ bytes, exceeding 700000/);
  assert.equal(raised.runtimeBudgetBytes, 700_000);
});

// ---------------------------------------------------------------- the teen library's complete-mode checks
test('teen --complete: provenance ids, the reason for every omitted state, the whole key set and the style list are checked in a complete run only; the GLB\'s hash in every run', (t) => {
  const dir = models(t), cat = join(scratch(t), 'catalogue.json'), empty = join(dirname(cat), 'sources.md');
  writeFileSync(empty, '# nothing cited\n');
  cpSync(TEEN_CATALOGUE, cat);
  const run = (o = {}) => validateTeenGarments({ modelsDir: dir, cataloguePath: cat, complete: true, ...o });
  assert.equal(run().ok, true);
  // sources: every style's sourceIds must be rows of the provenance document
  const noSources = run({ sourcesPath: empty });
  assert.equal(noSources.errors.filter((e) => /sourceIds must resolve to the provenance document/.test(e)).length, 29);
  assert.equal(run({ complete: false, sourcesPath: empty }).ok, true, 'a partial run reads no provenance');
  assert.equal(run({ sourcesPath: join(dirname(cat), 'missing.md') }).ok, false, 'a missing provenance document is an error in a complete run');
  // omitted states: each needs its physical reason
  editJSON(cat, (c) => { c.garments.find((g) => g.id === 'cap').notApplicable.folded = 'n/a'; });
  const reasonless = run();
  assert.match(reasonless.errors.join('\n'), /cap: the omitted folded state needs a physical reason/);
  assert.equal(run({ complete: false }).ok, true, 'a partial run does not ask for the reasons');
  cpSync(TEEN_CATALOGUE, cat);
  editJSON(cat, (c) => { delete c.garments.find((g) => g.id === 'school_shoes_pair').notApplicable; });
  assert.match(run().errors.join('\n'), /school_shoes_pair: the omitted (folded|hung) state needs a physical reason/);
  cpSync(TEEN_CATALOGUE, cat);
  // the hash of the GLB
  editJSON(join(dir, 'manifest.garments_teen.json'), (m) => { m.files[0].sha256 = '0'.repeat(64); });
  assert.match(run().errors.join('\n'), /garments\/garments_teen\.glb: SHA-256 differs from the manifest/);
  assert.match(run({ complete: false }).errors.join('\n'), /SHA-256 differs/, 'the hash is checked in a partial run too');
  // the key set: the manifest may not drop a state, in a complete run
  cpSync(join(MODELS, 'manifest.garments_teen.json'), join(dir, 'manifest.garments_teen.json'));
  editJSON(join(dir, 'manifest.garments_teen.json'), (m) => { delete m.files[0].assets.garment_cap_small_hung; });
  assert.match(run().errors.join('\n'), /missing required teen state garment_cap_small_hung/);
  assert.doesNotMatch(run({ complete: false }).errors.join('\n'), /missing required teen state/, 'a partial run does not ask for every state');
  // a style the catalogue does not list
  cpSync(join(MODELS, 'manifest.garments_teen.json'), join(dir, 'manifest.garments_teen.json'));
  editJSON(cat, (c) => { c.garments = c.garments.filter((g) => g.id !== 'cap'); });
  assert.match(run().errors.join('\n'), /complete teen catalogue must cover exactly the 29 requested garment styles/);
});
