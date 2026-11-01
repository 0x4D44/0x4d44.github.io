// Prove each new named test's assertion fails on its independent deliberate input mutation.
// node la-ladera/tests/beach-textures-mutations.mjs [--out la-ladera/dev/beach-textures/verification]
import './nice.mjs';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const testFile = resolve(dirname(fileURLToPath(import.meta.url)), 'beach-textures.test.mjs');
const source = readFileSync(testFile, 'utf8');
const cases = [...source.matchAll(/^caseTest\('([a-z_]+)', '([^']+)'/gm)].map((m) => ({ id: m[1], title: m[2] }));
if (cases.length !== 18) throw new Error(`Expected 18 named mutation-covered tests; found ${cases.length}`);
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out')) throw new Error('Usage: beach-textures-mutations.mjs [--out DIR]');
const out = args.length ? resolve(args[1]) : null;
if (out) mkdirSync(out, { recursive: true });
const baseEnv = { ...process.env }; delete baseEnv.BEACH_SABOTAGE;
function run(env, logName) {
  // Direct native node:test execution keeps per-case TAP output on platforms where
  // the outer --test worker transport suppresses the child event stream. The
  // native reporter writes its own file; no inherited numeric stdio handles are
  // used (those can make libuv open a visible console on Windows).
  const scratch = mkdtempSync(resolve(tmpdir(), 'ladera-beach-mutations-')), tap = resolve(scratch, 'report.tap');
  try {
    const result = spawnSync(process.execPath, ['--test-reporter=tap', '--test-reporter-destination=' + tap, testFile], {
      env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
    });
    result.stdout = existsSync(tap) ? readFileSync(tap, 'utf8') : result.stdout;
    if (out) writeFileSync(resolve(out, logName), (result.stdout ?? '').replace(/[ \t]+$/gm, ''));
    return result;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
const green = run(baseEnv, 'tests.tap');
if (green.error || green.status !== 0 || !new RegExp(`^# tests ${cases.length}$`, 'm').test(green.stdout)
    || !new RegExp(`^# pass ${cases.length}$`, 'm').test(green.stdout)) {
  console.error(green.stdout, green.stderr);
  throw new Error(`Baseline is not green (${green.error?.message ?? green.status}); mutations cannot be trusted`);
}
console.log(`PASS baseline: ${cases.length}/${cases.length} tests under Node ${process.versions.node}`);
const red = run({ ...baseEnv, BEACH_SABOTAGE: 'all' }, 'mutations-red.tap');
if (red.error || red.status === 0) {
  console.error(red.stdout, red.stderr);
  throw new Error(`Mutation suite unexpectedly succeeded or failed to run (${red.error?.message ?? red.status})`);
}
const chunks = red.stdout.split(/(?=^# Subtest:)/m), missed = [];
for (const { id, title } of cases) {
  const block = chunks.find((text) => text.startsWith(`# Subtest: [${id}]`));
  const failed = block && new RegExp(`^not ok \\d+ - \\[${id}\\]`, 'm').test(block)
    && /code: ['"]ERR_ASSERTION['"]/.test(block);
  if (failed) console.log(`PASS mutation [${id}]: expected assertion red — ${title}`);
  else missed.push(id);
}
if (missed.length) {
  console.error(red.stdout, red.stderr);
  throw new Error(`No attributable assertion failure for: ${missed.join(', ')}`);
}
console.log(`MUTATIONS OK: ${cases.length}/${cases.length} intentionally broken inputs made their named tests fail; baseline remains unchanged`);
