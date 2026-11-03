import './nice.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = resolve(root, 'la-ladera/dev/wear/authoring-mutation-proof');
mkdirSync(out, { recursive: true });
const file = 'la-ladera/tests/people-wear-authoring.test.mjs';
const mutations = [
  ['legacy-topology', 'legacy hip refinement preserves its exact triangle topology guard'],
  ['legacy-geometry', 'legacy hip refinement preserves its strict coordinate fingerprint'],
  ['legacy-influences', 'legacy hip refinement rejects a fifth skin influence'],
  ['current-mesh', 'current hip guard pins every complete raw mesh stream'],
  ['source-text', 'current hip guard accepts LF and CRLF but rejects each changed body source'],
  ['unknown-version', 'body version dispatch preserves legacy refinement and unchanged current mesh'],
  ['normal-floor', 'small far facets and cancelling incident areas produce valid unit normals'],
  ['normal-cancellation', 'small far facets and cancelling incident areas produce valid unit normals'],
  ['normal-degenerate', 'small far facets and cancelling incident areas produce valid unit normals'],
];
const run = (args, env = {}) => spawnSync(process.execPath, args, {
  cwd: root, windowsHide: true, encoding: 'utf8', timeout: 120_000,
  env: { ...process.env, ...env, LADERA_PRIO: 'idle' },
});
// Direct node:test execution retains named TAP here; Node 22's isolated parent
// emitted only a file-level aggregate for these synchronous Python controls.
const positive = run([file]);
writeFileSync(resolve(out, 'positive.tap'), positive.stdout + positive.stderr);
if (positive.status !== 0 || !positive.stdout.includes('# pass 7') ||
    !mutations.every(([, name]) => positive.stdout.includes(` - ${name}`)))
  throw Error('Authoring positive control lacks seven named passes; see positive.tap');
const rows = [];
for (const [mutant, name] of mutations) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const negative = run([`--test-name-pattern=^${escaped}$`, file], { WEAR_AUTHOR_MUTATION: mutant });
  const output = negative.stdout + negative.stderr;
  writeFileSync(resolve(out, `${mutant}.tap`), output);
  const killed = negative.status !== 0 && new RegExp(`not ok \\d+ - ${escaped}`).test(output) &&
    output.includes(`WEAR_AUTHOR_MUTATION_APPLIED ${mutant}`) &&
    output.includes('"errorType": "AssertionError"') && !output.includes('Mutation anchor drifted');
  rows.push({ mutant, test: name, exit: negative.status, killed, log: `${mutant}.tap` });
  console.log(`${killed ? 'KILLED' : 'SURVIVED'} ${mutant}: ${name}`);
}
const report = { node: process.version, tests: new Set(mutations.map(row => row[1])).size,
  mutants: rows.length, killed: rows.filter(row => row.killed).length, positiveExit: positive.status,
  pass: rows.every(row => row.killed), results: rows };
writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (!report.pass) process.exitCode = 1;
