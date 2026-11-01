// Prove every integration test detects a real regression in an isolated source tree.
//   node la-ladera/dev/garments-child-teen/registry-mutation-audit.mjs [node-executable] [output-dir]
import '../../tests/nice.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const NODE = process.argv[2] || process.execPath;
const OUT = resolve(process.argv[3] || join(ROOT, 'dev/garments-child-teen/registry-mutations'));
const temp = mkdtempSync(join(tmpdir(), 'ladera-registry-mutation-'));
const testFile = 'tests/garments-integration.test.mjs';
const hash = (s) => createHash('sha256').update(s).digest('hex');
const cases = [
  { id: 'generated-age', name: 'sized data preserves every age, size, state, palette and original source root',
    file: 'js/interiors/garments_data.js', before: '"age":"child"', after: '"age":"teen"' },
  { id: 'age-namespace', name: 'manifest loading keeps overlapping child and teen source keys distinct',
    file: 'js/core/asset-keys.js', before: "? `garment_${age}_${key.slice('garment_'.length)}` : key", after: '? key : key' },
  { id: 'page-startup', name: 'page startup loads both sized libraries once and draws their measured LOD roots',
    file: 'js/interiors/index.js', before: ', loadSizedGarmentAssets(ctx)]', after: ']' },
  { id: 'cached-detail-parts', name: 'page startup loads both sized libraries once and draws their measured LOD roots',
    file: 'js/interiors/garments-sized.js', before: 'a.partCache?.delete(key);', after: '/* mutation: retain cached detail parts */' },
  { id: 'failed-download-retry', name: 'missing libraries fall back independently and a failed download can be retried',
    file: 'js/core/assets.js', before: 'this.inflight.delete(path);', after: '/* mutation: retain failed downloads */' },
  { id: 'named-lod-readiness', name: 'a missing named LOD root cannot be reported as a loaded garment',
    file: 'js/interiors/garments-sized.js', before: 'if (glbParts(ctx, key).length)', after: 'if (true)' },
  { id: 'garments-off', name: 'garments off clears sized readiness without requesting either library',
    file: 'js/interiors/garments-sized.js', before: 'if (garmentsOff() || !a?.entries || !a.preload)', after: 'if (!a?.entries || !a.preload)' },
  { id: 'duplicate-generator-key', name: 'the generator rejects duplicate sized keys instead of overwriting garments',
    file: 'tools/garments_data.mjs', before: 'if (sized.has(key))', after: 'if (false)' },
];
const originals = new Map(cases.map((c) => [c.file, readFileSync(join(ROOT, c.file), 'utf8')]));
function run(name) {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const pattern = '^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
  return spawnSync(NODE, ['--import', './tests/register.mjs', '--test', '--test-reporter=tap', '--test-concurrency=1', '--test-name-pattern', pattern, testFile],
    { cwd: temp, encoding: 'utf8', env, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
}
const summaries = [];
try {
  mkdirSync(OUT, { recursive: true });
  for (const dir of ['js', 'assets', 'vendor']) cpSync(join(ROOT, dir), join(temp, dir), { recursive: true });
  for (const file of [testFile, 'tests/nice.mjs', 'tests/register.mjs', 'tests/hooks.mjs', 'tools/garments_data.mjs']) {
    mkdirSync(dirname(join(temp, file)), { recursive: true }); cpSync(join(ROOT, file), join(temp, file));
  }
  const version = spawnSync(NODE, ['--version'], { encoding: 'utf8' });
  assert.equal(version.status, 0, version.stderr || version.error?.message); console.log(`Node ${version.stdout.trim()}`);
  for (const c of cases) {
    const baseline = run(c.name), good = baseline.stdout + baseline.stderr;
    assert.equal(baseline.status, 0, `baseline ${c.id} failed: ${good}`);
    assert.match(good, new RegExp(`ok [0-9]+ - ${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\r?\\n|$)`), `baseline did not execute ${c.name}`);
    const source = originals.get(c.file); assert.ok(source.includes(c.before), `missing mutation anchor ${c.id}`);
    writeFileSync(join(temp, c.file), source.replace(c.before, c.after));
    let result;
    try { result = run(c.name); } finally { writeFileSync(join(temp, c.file), source); }
    const output = result.stdout + result.stderr;
    writeFileSync(join(OUT, `${c.id}.tap`), output.replace(/[ \t]+$/gm, ''));
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 1, `${c.id}: mutant must fail the selected test, not crash or pass\n${output}`);
    assert.match(output, new RegExp(`not ok [0-9]+ - ${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\r?\\n|$)`), `${c.id}: named assertion must fail`);
    assert.match(output, /ERR_ASSERTION/, `${c.id}: failure must be an assertion`);
    assert.doesNotMatch(output, /bad option|ERR_MODULE_NOT_FOUND|SyntaxError|EACCES|EPERM/, `${c.id}: infrastructure failures are not mutation evidence`);
    summaries.push({ id: c.id, test: c.name, file: c.file, status: result.status, outcome: 'killed' });
    console.log(`KILLED ${c.id}: ${c.name}`);
  }
  for (const [file, original] of originals) assert.equal(hash(readFileSync(join(ROOT, file))), hash(original), `source file changed: ${file}`);
  const namedTests = new Set(cases.map((c) => c.name)).size;
  const report = { node: version.stdout.trim(), namedTests, passedBaselines: cases.length, killed: summaries.length, total: cases.length, sourceUnchanged: true, cases: summaries };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`REGISTRY MUTATION AUDIT OK: ${summaries.length}/${cases.length} regressions rejected across ${namedTests} named tests; source files unchanged.`);
} finally { rmSync(temp, { recursive: true, force: true }); }
