import './nice.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = resolve(root, 'la-ladera/dev/wear/layout-mutation-proof');
mkdirSync(out, { recursive: true });
const file = 'la-ladera/tests/people-wear-layout.test.mjs';
const mutations = [
  ['skip-order', 'GLB layout groups semantic views while preserving all bytes descriptors and non-layout JSON'],
  ['change-view-byte', 'GLB layout groups semantic views while preserving all bytes descriptors and non-layout JSON'],
  ['change-accessor', 'GLB layout groups semantic views while preserving all bytes descriptors and non-layout JSON'],
  ['change-json', 'GLB layout groups semantic views while preserving all bytes descriptors and non-layout JSON'],
  ['flatten-stride', 'GLB layout preserves shared strided attributes CPU targets and GPU payload'],
  ['cpu-target-gpu', 'GLB layout preserves shared strided attributes CPU targets and GPU payload'],
  ['skip-alignment', 'GLB layout is aligned deterministic and idempotent'],
  ['skip-view-bounds', 'GLB layout rejects malformed container boundaries views and references'],
  ['allow-external', 'GLB layout rejects malformed container boundaries views and references'],
  ['skip-container-length', 'GLB layout rejects malformed container boundaries views and references'],
];
const run = (args, env = {}) => spawnSync(process.execPath, args, {
  cwd: root, windowsHide: true, encoding: 'utf8', timeout: 120_000,
  env: { ...process.env, ...env, LADERA_PRIO: 'idle' },
});
const positive = run([file]);
writeFileSync(resolve(out, 'positive.tap'), positive.stdout + positive.stderr);
if (positive.status !== 0 || !positive.stdout.includes('# pass 4') ||
    !mutations.every(([, name]) => positive.stdout.includes(` - ${name}`)))
  throw Error('Layout positive control lacks four named passes; see positive.tap');
const rows = [];
for (const [mutant, name] of mutations) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const negative = run([`--test-name-pattern=^${escaped}$`, file], { WEAR_LAYOUT_MUTATION: mutant });
  const output = negative.stdout + negative.stderr;
  writeFileSync(resolve(out, `${mutant}.tap`), output);
  const killed = negative.status !== 0 && new RegExp(`not ok \\d+ - ${escaped}`).test(output) &&
    output.includes(`WEAR_LAYOUT_MUTATION_APPLIED ${mutant}`) &&
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
