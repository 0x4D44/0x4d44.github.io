import './nice.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = resolve(root, 'la-ladera/dev/wear/pack-mutation-proof');
mkdirSync(out, { recursive: true });
const file = 'la-ladera/tests/people-wear-pack.test.mjs';
const mutations = [
  ['disable-reuse', 'body packing welds bounded far normals without changing triangle attribute bytes'],
  ['wide-angle', 'body packing welds bounded far normals without changing triangle attribute bytes'],
  ['ignore-seams', 'body packing preserves exact position UV skin and extra attribute seams'],
  ['round-position', 'body packing preserves exact position UV skin and extra attribute seams'],
  ['write-near', 'body packing preserves all near normals and caller owned arrays'],
  ['mutate-input', 'body packing preserves all near normals and caller owned arrays'],
  ['byte-clamp', 'body packing measures uploaded normalized BYTE normals at the five degree boundary'],
  ['invalid-indices', 'body packing rejects malformed encoded streams and triangle indices'],
];
const run = (args, env = {}) => spawnSync(process.execPath, args, {
  cwd: root, windowsHide: true, encoding: 'utf8', timeout: 120_000,
  env: { ...process.env, ...env, LADERA_PRIO: 'idle' },
});
const positive = run([file]);
writeFileSync(resolve(out, 'positive.tap'), positive.stdout + positive.stderr);
if (positive.status !== 0 || !positive.stdout.includes('# pass 5') ||
    !mutations.every(([, name]) => positive.stdout.includes(` - ${name}`)))
  throw Error('Packing positive control lacks five named passes; see positive.tap');
const rows = [];
for (const [mutant, name] of mutations) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const negative = run([`--test-name-pattern=^${escaped}$`, file], { WEAR_PACK_MUTATION: mutant });
  const output = negative.stdout + negative.stderr;
  writeFileSync(resolve(out, `${mutant}.tap`), output);
  const killed = negative.status !== 0 && new RegExp(`not ok \\d+ - ${escaped}`).test(output) &&
    output.includes(`WEAR_PACK_MUTATION_APPLIED ${mutant}`) &&
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
