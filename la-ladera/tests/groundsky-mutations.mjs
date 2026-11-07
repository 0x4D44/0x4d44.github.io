// Run the green suite, then prove every named test fails on its own deliberate
// incorrect input. No generator, validator, existing test, or shipped asset changes.
import './nice.mjs';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const testFile = resolve(dirname(fileURLToPath(import.meta.url)), 'groundsky-assets.test.mjs');
const source = readFileSync(testFile, 'utf8');
const cases = [...source.matchAll(/^caseTest\('([a-z_]+)', '([^']+)'/gm)].map((m) => ({ id: m[1], title: m[2] }));
if (cases.length !== 34 || new Set(cases.map((c) => c.id)).size !== cases.length) throw new Error(`Expected 34 distinct named tests; found ${cases.length}`);
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out')) throw new Error('Usage: groundsky-mutations.mjs [--out DIR]');
const out = args.length ? resolve(args[1]) : null;
if (out) mkdirSync(out, { recursive: true });
const env = { ...process.env }; delete env.GROUNDSKY_SABOTAGE;
function run(environment, logName) {
  const scratch = mkdtempSync(resolve(tmpdir(), 'ladera-groundsky-mutations-')), tap = resolve(scratch, 'results.tap');
  try {
    const result = spawnSync(process.execPath, ['--test-reporter=tap', `--test-reporter-destination=${tap}`, testFile], {
      env: environment, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
    });
    result.stdout = existsSync(tap) ? readFileSync(tap, 'utf8') : result.stdout;
    if (out) writeFileSync(resolve(out, logName), (result.stdout ?? '').replace(/[ \t]+$/gm, ''));
    return result;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
const green = run(env, 'tests.tap');
if (green.error || green.status !== 0 || !new RegExp(`^# tests ${cases.length}$`, 'm').test(green.stdout)
  || !new RegExp(`^# pass ${cases.length}$`, 'm').test(green.stdout)) {
  console.error(green.stdout, green.stderr);
  throw new Error(`Baseline is not green: ${green.error?.message ?? green.status}`);
}
console.log(`PASS baseline: ${cases.length}/${cases.length} under Node ${process.versions.node}`);
const red = run({ ...env, GROUNDSKY_SABOTAGE: 'all' }, 'mutations-red.tap');
if (red.error || red.status === 0) {
  console.error(red.stdout, red.stderr);
  throw new Error(`Mutations failed to run or unexpectedly passed: ${red.error?.message ?? red.status}`);
}
const blocks = red.stdout.split(/(?=^# Subtest:)/m), missed = [];
for (const { id, title } of cases) {
  const block = blocks.find((text) => text.startsWith(`# Subtest: [${id}]`));
  if (block && new RegExp(`^not ok \\d+ - \\[${id}\\]`, 'm').test(block) && /code: ['"]ERR_ASSERTION['"]/.test(block))
    console.log(`PASS mutation [${id}]: attributable assertion failure — ${title}`);
  else missed.push(id);
}
if (missed.length) {
  console.error(red.stdout, red.stderr);
  throw new Error(`No attributable assertion failure: ${missed.join(', ')}`);
}
console.log(`MUTATIONS OK: ${cases.length}/${cases.length} named tests observed red on their wrong inputs; baseline unchanged`);
