// Runs every acceptance test green, then selects its real bad-input mutation
// and requires exactly that test to turn red. Production files are never edited.
import './nice.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const tests = fileURLToPath(new URL('./beach-props-assets.test.mjs', import.meta.url));
const options = { encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 5_000_000 };
function run(args, env = {}) {
  const result = spawnSync(process.execPath, args, { ...options, env: { ...process.env, BEACH_PROPS_MUTANT: '', ...env } });
  if (result.error) throw result.error;
  return { ...result, output: result.stdout + result.stderr };
}
const discovery = run([tests, '--list-mutations']);
if (discovery.status !== 0) throw new Error(discovery.output);
const cases = JSON.parse(discovery.stdout);
console.log(`Node ${process.versions.node}; ${cases.length} beach-props acceptance tests with individually selected input mutations`);
// Like vehicles-assets.test.mjs, execute the node:test file directly. This also
// preserves named TAP cases on hosts whose --test subprocess transport wraps
// the entire module as a single file-level case.
const baseline = run([tests]);
process.stdout.write(baseline.output);
if (baseline.status !== 0) throw new Error('Unmutated acceptance suite must pass before mutation checking');
let killed = 0;
for (const entry of cases) {
  const result = run([`--test-name-pattern=\\[${entry.id}\\]`, tests], { BEACH_PROPS_MUTANT: entry.id });
  const namedFailure = new RegExp(`not ok [^\\n]*\\[${entry.id}\\]`).test(result.output);
  const exactlyOne = /# fail 1(?:\r?\n|$)/.test(result.output);
  if (result.status === 0 || !namedFailure || !exactlyOne) {
    process.stdout.write(result.output); throw new Error(`SURVIVED or failed incorrectly: ${entry.id}`);
  }
  killed++; console.log(`KILLED [${entry.id}]: ${entry.broken}`);
}
console.log(`MUTATION PASS: ${killed}/${cases.length}; every new test passed valid input and failed its selected corrupted input.`);
