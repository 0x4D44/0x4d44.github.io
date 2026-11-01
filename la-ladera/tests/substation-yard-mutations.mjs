/** Prove every yard/catenary test fails on its own explicitly broken input. */
import './nice.mjs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const mutations = [
  ['C01', 'symmetric analytic fixture: increase midpoint sag by 20%'],
  ['C02', 'unequal-height analytic fixture: raise end by 1 m'],
  ['C03', '3D fixture: change sag from 1.75 m to 2 m'],
  ['C04', 'finite-curve fixtures: supply a negative sag'],
  ['C05', 'instance fixture: permit 3 m segments instead of 0.6 m'],
  ['C06', 'reverse-span fixture: use a different sag'],
  ['C07', 'rejection fixture: replace NaN coordinate with valid input'],
  ['C08', 'allocation-rejection fixture: raise instance budget so it no longer rejects'],
  ['C09', 'renderer fixture: change conductor radius to 0.2 m'],
  ['C10', 'Colombia recipe fixture: replace 34.5 kV with 33 kV'],
  ['Y01', 'plan fixture: change metre units to centimetres'],
  ['Y02', 'inventory fixture: remove the second grid transformer'],
  ['Y03', 'parity fixture: move one Colombia equipment instance by 1 m'],
  ['Y04', 'anchor fixture: remove the chair seat slot'],
  ['Y05', 'route fixture: cut a waypoint through a transformer'],
  ['Y06', 'nav fixture: shrink live-transformer keep-out to 0.2 m'],
  ['Y07', 'entry fixture: start route away from the gate'],
  ['Y08', 'schema rejection fixture: replace invalid version with valid version'],
  ['Y09', 'intersection fixture: translate test polygon away from crossing segment'],
  ['Y10', 'regeneration fixture: move generated first transformer by 1 m'],
  ['Y11', 'line fixture: reference a nonexistent tower'],
];

const outputAt = process.argv.indexOf('--out');
const out = outputAt >= 0 ? resolve(process.argv[outputAt + 1]) : null;
if (out) mkdirSync(out, { recursive: true });
// An already-failing baseline cannot establish that a deliberate input change
// killed a test. Run both unchanged suites first, independently of caller setup.
for (const [file, count] of [['substation-catenary.test.mjs', 10], ['substation-yard.test.mjs', 11]]) {
  const env = { ...process.env }; delete env.SUBSTATION_TEST_MUTATION;
  const baseline = spawnSync(process.execPath, [resolve(HERE, file)], { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 8_000_000, env });
  const transcript = (baseline.stdout || '') + (baseline.stderr || '');
  if (out) writeFileSync(resolve(out, `${file}.baseline.tap`), transcript);
  if (baseline.error || baseline.status !== 0 || !transcript.includes(`# pass ${count}\n`) || !/# fail 0\b/.test(transcript)) {
    console.error(`BASELINE FAILED ${file}: ${baseline.error?.message || ''}\n${transcript.slice(-6000)}`);
    process.exit(1);
  }
  console.log(`BASELINE ${file}: ${count}/${count} passed`);
}
const results = [];
for (const [id, description] of mutations) {
  const testFile = resolve(HERE, id.startsWith('C') ? 'substation-catenary.test.mjs' : 'substation-yard.test.mjs');
  const result = spawnSync(process.execPath, ['--test-name-pattern', `^${id} `, testFile], {
    encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 8_000_000,
    env: { ...process.env, SUBSTATION_TEST_MUTATION: id },
  });
  const transcript = (result.stdout || '') + (result.stderr || '');
  const intended = new RegExp(`not ok \\d+ - ${id} `).test(transcript);
  const assertion = /ERR_ASSERTION|RangeError/.test(transcript);
  const killed = result.status === 1 && !result.error && intended && assertion && /# fail 1\b/.test(transcript);
  const record = { id, description, killed, exitCode: result.status, intendedTestFailed: intended, assertionFailure: assertion, subprocessError: result.error?.code || null };
  results.push(record);
  console.log(`${killed ? 'KILLED' : 'SURVIVED/ERROR'} ${id}: ${description}`);
  if (out) writeFileSync(resolve(out, `${id}.tap`), transcript);
  if (!killed) console.error((result.error ? `${result.error.message}\n` : '') + transcript.slice(-6000));
}
const summary = { node: process.version, total: results.length, killed: results.filter((r) => r.killed).length, results };
if (out) writeFileSync(resolve(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`Substation yard/catenary mutation check: ${summary.killed}/${summary.total} intended test failures under Node ${process.version}`);
if (summary.killed !== summary.total) process.exitCode = 1;
