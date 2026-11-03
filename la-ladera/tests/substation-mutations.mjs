// Run every new test against its deliberate bad-input variant. A mutant is
// killed only by a real failure of its exact named Node test; process crashes,
// timeouts and missing tests are rejected as invalid mutation evidence.
import './nice.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const suites = ['substation-assets.test.mjs', 'substation-catenary.test.mjs'].map((p) => resolve(HERE, p)).filter(existsSync);
const report = { runtime: process.version, tests: 0, killed: 0, failures: [] };
const isolation = Number(process.versions.node.split('.')[0]) < 24 ? '--experimental-test-isolation=none' : '--test-isolation=none';
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--only')) { console.error('usage: node substation-mutations.mjs [--only id,id,...]'); process.exit(2); }
const selected = args.length ? new Set(args[1].split(',')) : null;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const suite of suites) {
  const listing = spawnSync(process.execPath, [suite, '--list-mutations'], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  if (listing.error || listing.status !== 0) { report.failures.push(`cannot list mutations: ${suite}: ${listing.error?.message ?? listing.stderr}`); continue; }
  let cases; try { cases = JSON.parse(listing.stdout); } catch { report.failures.push(`invalid mutation list: ${suite}`); continue; }
  for (const { id, name } of cases) {
    if (selected && !selected.has(id)) continue;
    report.tests++;
    const result = spawnSync(process.execPath, ['--test', isolation, '--test-reporter=tap', `--test-name-pattern=^${escape(name)}$`, suite], {
      encoding: 'utf8', windowsHide: true, timeout: 120_000, env: { ...process.env, SUBSTATION_MUTANT: id }, maxBuffer: 8 * 1024 * 1024,
    });
    const out = result.stdout ?? '';
    const namedFailure = out.split('\n').some((line) => line.startsWith('not ok ') && line.includes(name));
    const assertionFailure = /code: 'ERR_ASSERTION'/.test(out);
    // Positive geometry/PNG fixtures can fail with the validator's descriptive
    // error; the named test still has to execute and fail in the TAP stream.
    const expectedInputFailure = /error: .*GLB|error: .*PNG|error: .*atlas|error: .*metre|error: .*non-finite|error: .*catenary|error: .*sag|error: .*span/i.test(out);
    if (!result.error && result.status === 1 && !result.signal && namedFailure && (assertionFailure || expectedInputFailure)) {
      report.killed++; console.log(`KILLED ${id}: ${name}`);
    } else {
      const reason = `${id}: status=${result.status} signal=${result.signal ?? 'none'} namedFailure=${namedFailure}; ${(result.stderr || out).slice(-1500)}`;
      report.failures.push(reason); console.error(`FAIL ${reason}`);
    }
  }
}
console.log(`MUTATIONS: ${report.killed}/${report.tests} killed under ${report.runtime}`);
if (report.failures.length) console.error(report.failures.join('\n'));
process.exitCode = report.tests > 0 && report.killed === report.tests && report.failures.length === 0 ? 0 : 1;
