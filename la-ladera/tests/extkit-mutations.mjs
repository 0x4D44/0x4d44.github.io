// A mutant counts only when its exact named Node test executes and fails an
// assertion. Missing tests, timeouts, parser/process crashes and import errors
// are failures of the proof, not successful mutation kills.
import './nice.mjs';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const suites = readdirSync(HERE).filter((name) => /^extkit-.*\.test\.mjs$/.test(name)).sort().map((name) => resolve(HERE, name));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--only')) { console.error('usage: node extkit-mutations.mjs [--only id,id,...]'); process.exit(2); }
const selected = args.length ? new Set(args[1].split(',')) : null;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const report = { runtime: process.version, suites: suites.length, tests: 0, killed: 0, failures: [] };
const seen = new Set();
for (const suite of suites) {
  const listing = spawnSync(process.execPath, [suite, '--list-mutations'], { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  if (listing.error || listing.status !== 0) { report.failures.push(`cannot list mutations: ${suite}: ${listing.error?.message ?? listing.stderr}`); continue; }
  let cases;
  try { cases = JSON.parse(listing.stdout); } catch { report.failures.push(`invalid mutation list: ${suite}`); continue; }
  if (!Array.isArray(cases) || !cases.length) { report.failures.push(`suite has no mutation cases: ${suite}`); continue; }
  for (const { id, name } of cases) {
    if (typeof id !== 'string' || typeof name !== 'string' || !id || !name || seen.has(id)) { report.failures.push(`invalid or duplicate case: ${id}`); continue; }
    seen.add(id);
    if (selected && !selected.has(id)) continue;
    report.tests++;
    const result = spawnSync(process.execPath, ['--test', '--experimental-test-isolation=none', '--test-concurrency=1', '--test-reporter=tap', `--test-name-pattern=^${escape(name)}$`, suite], {
      encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, EXTKIT_MUTANT: id },
    });
    const output = result.stdout ?? '', lines = output.split('\n');
    const namedFailure = lines.filter((line) => line.startsWith('not ok ') && line.includes(name)).length === 1;
    const oneFailure = /^# fail 1\s*$/m.test(output);
    const assertionFailure = /code: 'ERR_ASSERTION'/.test(output);
    if (!result.error && result.status === 1 && !result.signal && namedFailure && oneFailure && assertionFailure) {
      report.killed++; console.log(`KILLED ${id}: ${name}`);
    } else {
      const reason = `${id}: status=${result.status} signal=${result.signal ?? 'none'} namedFailure=${namedFailure} oneFailure=${oneFailure} assertionFailure=${assertionFailure}; ${(result.stderr || output).slice(-1800)}`;
      report.failures.push(reason); console.error(`FAIL ${reason}`);
    }
  }
}
if (selected) for (const id of selected) if (!seen.has(id)) report.failures.push(`unknown requested mutation ${id}`);
console.log(`MUTATIONS: ${report.killed}/${report.tests} killed under ${report.runtime}`);
if (report.failures.length) console.error(report.failures.join('\n'));
console.log(JSON.stringify(report));
process.exitCode = report.tests > 0 && report.killed === report.tests && report.failures.length === 0 ? 0 : 1;
