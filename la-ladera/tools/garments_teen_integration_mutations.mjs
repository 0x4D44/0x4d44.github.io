// Prove each new integration contract detects a relevant data or code regression.
// Only isolated copies are mutated; no checked-in source or original asset is written.
// node la-ladera/tools/garments_teen_integration_mutations.mjs [--json report.json]
import '../tests/nice.mjs';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEST = join(ROOT, 'tests/interiors-garments-teen.test.mjs');
const temp = mkdtempSync(join(tmpdir(), 'ladera-teen-integration-proof-'));
const inputFiles = ['tools/garments_data.mjs', 'js/interiors/garments_data.js', 'js/interiors/garments.js',
  'js/interiors/catalog.js', 'js/interiors/build.js', 'tests/interiors-garments-teen.test.mjs'];
const hash = (file) => createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex');
const before = Object.fromEntries(inputFiles.map((file) => [file, hash(file)]));
const mutations = [
  ['registry size class', 'registry keeps 29 styles and both sizes without aliases', 'js/interiors/garments_data.js',
    "styleId: 'cap', sizeClass: 'small'", "styleId: 'cap', sizeClass: 'big'", /generated sizeClass/],
  ['palette tint', 'colours preserve both source palettes', 'js/interiors/garments_data.js',
    'sun_print: 0xe5dfcf', 'sun_print: 0x123456', /generated tint must match source palette/],
  ['loader size propagation', 'loader and catalogue retain sizes and resolve every LOD node', 'js/interiors/garments.js',
    'sizeClass: g.sizeClass', "sizeClass: 'wrong'", /loader sizeClass/],
  ['catalogue size propagation', 'loader and catalogue retain sizes and resolve every LOD node', 'js/interiors/catalog.js',
    'sizeClass: g.sizeClass', "sizeClass: 'wrong'", /catalogue sizeClass/],
  ['explicit teen preload', 'loader and catalogue retain sizes and resolve every LOD node', 'js/interiors/build.js',
    'const keys = garmentKeysFor(options.sizeTags);', 'const keys = garmentKeysFor();', /explicit teen load requests exactly/],
  ['stale teen mesh cleanup', 'loader and catalogue retain sizes and resolve every LOD node', 'js/interiors/build.js',
    'for (const k of ALL_GARMENT_KEYS)', 'for (const k of keys)', /switching size libraries disposes stale teen mesh parts/],
  ['manifest size guard', 'generator rejects wrong size metadata and aliases', 'tools/garments_data.mjs',
    "if (sizeTag !== 'adult' && man.sizeTag !== sizeTag)", "if (false && sizeTag !== 'adult' && man.sizeTag !== sizeTag)", /Missing expected exception.*wrong manifest size/],
  ['asset size guard', 'generator rejects wrong size metadata and aliases', 'tools/garments_data.mjs',
    "if ((sizeTag !== 'adult' && a.sizeTag !== sizeTag) || (a.sizeTag !== undefined && a.sizeTag !== sizeTag))",
    "if (false && ((sizeTag !== 'adult' && a.sizeTag !== sizeTag) || (a.sizeTag !== undefined && a.sizeTag !== sizeTag)))", /Missing expected exception.*wrong asset size/],
  ['size class guard', 'generator rejects wrong size metadata and aliases', 'tools/garments_data.mjs',
    "if (sizeTag === 'teen' && (!Object.hasOwn(TEEN_SIZES, a.sizeClass)", "if (false && sizeTag === 'teen' && (!Object.hasOwn(TEEN_SIZES, a.sizeClass)", /Missing expected exception.*wrong size class/],
  ['palette collision guard', 'generator rejects palette name collisions', 'tools/garments_data.mjs',
    'if (Object.hasOwn(variants, id) && JSON.stringify(variants[id]) !== JSON.stringify(variant))',
    'if (false && Object.hasOwn(variants, id) && JSON.stringify(variants[id]) !== JSON.stringify(variant))', /Missing expected exception.*a teen tint/],
];
const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
const run = (root, pattern) => spawnSync(process.execPath,
  ['--import', join(ROOT, 'tests/register.mjs'), '--test', '--test-concurrency=1', '--test-reporter=tap', ...(pattern ? [`--test-name-pattern=^teen integration: ${pattern}$`] : []), TEST],
  { env: { ...env, LADERA_TEEN_INTEGRATION_ROOT: root }, encoding: 'utf8', timeout: 60_000, windowsHide: true });
const rows = [];
try {
  const green = run(ROOT);
  assert.ifError(green.error); assert.equal(green.status, 0, green.stdout + green.stderr);
  assert.match(green.stdout, /# pass 5\b/); assert.match(green.stdout, /# fail 0\b/);
  for (const [index, [label, testName, path, oldText, newText, reason]] of mutations.entries()) {
    const fixture = join(temp, `mutant-${index}`);
    for (const dir of ['js', 'assets/models/garments', 'assets/models/garments-child', 'assets/models/garments-teen']) {
      cpSync(join(ROOT, dir), join(fixture, dir), { recursive: true });
    }
    mkdirSync(join(fixture, 'tools'), { recursive: true });
    cpSync(join(ROOT, 'tools/garments_data.mjs'), join(fixture, 'tools/garments_data.mjs'));
    writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n');
    for (const file of ['manifest.garments.json', 'manifest.garments-child.json', 'manifest.garments-teen.json']) {
      cpSync(join(ROOT, 'assets/models', file), join(fixture, 'assets/models', file));
    }
    const target = join(fixture, path), source = readFileSync(target, 'utf8');
    assert.equal(source.split(oldText).length - 1, 1, `${label}: mutation anchor must be unique`);
    writeFileSync(target, source.replace(oldText, newText));
    const child = run(fixture, testName), output = child.stdout + child.stderr;
    assert.ifError(child.error); assert.equal(child.status, 1, `${label}: expected a failing assertion, not an infrastructure error\n${output}`);
    assert.ok(output.split('\n').some((line) => /^not ok \d+ - teen integration: /.test(line) && line.endsWith(testName)), `${label}: named test did not execute\n${output}`);
    assert.match(output, reason, `${label}: failure must be caused by the intended defect`);
    const evidence = output.split('\n').filter((line) => /not ok|# (tests|pass|fail|skipped)|error:/.test(line));
    rows.push({ mutation: label, test: `teen integration: ${testName}`, exitCode: child.status, evidence });
    console.log(`KILLED ${label}: ${testName} (exit ${child.status})`);
    rmSync(fixture, { recursive: true, force: true });
  }
  const after = Object.fromEntries(inputFiles.map((file) => [file, hash(file)]));
  assert.deepEqual(after, before, 'original sources and tests remain unchanged');
  const report = { ok: true, node: process.version, tests: 5, mutants: rows.length, killed: rows.length,
    originalFilesUnchanged: true, hashes: before, results: rows };
  const arg = process.argv.indexOf('--json');
  if (arg >= 0) { assert.ok(process.argv[arg + 1], '--json requires a path'); writeFileSync(resolve(process.argv[arg + 1]), JSON.stringify(report, null, 2) + '\n'); }
  console.log(`PASS teen integration mutation proof: ${rows.length}/${rows.length} mutants killed across all 5 tests; original files unchanged`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
