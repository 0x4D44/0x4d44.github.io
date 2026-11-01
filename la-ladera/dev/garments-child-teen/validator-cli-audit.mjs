// Exercise the merged --all CLI against isolated copies of the actual exports.
// Every contract also rejects a deliberately broken temporary CLI implementation.
//   nice -n 10 ionice -c 3 node la-ladera/dev/garments-child-teen/validator-cli-audit.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const MODELS = join(ROOT, 'assets/models'), TOOLS = join(ROOT, 'tools/blender');
const VALIDATOR = join(TOOLS, 'garments_validate.mjs');
const OUTPUT = resolve(process.argv[2] ?? join(HERE, `validator-cli-node-${process.versions.node}.json`));
const source = readFileSync(VALIDATOR, 'utf8');
const AGES = ['adult', 'child', 'teen'];
const manifests = { adult: 'manifest.garments.json', child: 'manifest.garments_child.json', teen: 'manifest.garments_teen.json' };
const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJSON = (path, value) => writeFileSync(path, JSON.stringify(value) + '\n');
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length - 1, 1, `unique source mutation: ${before}`);
  return text.replace(before, after);
};

function temporaryCLI(directory, mutate) {
  let code = mutate(source);
  code = replaceOnce(code, "'../../js/interiors/catalog.js'", JSON.stringify(pathToFileURL(join(ROOT, 'js/interiors/catalog.js')).href));
  code = replaceOnce(code, "'../../js/world/matdefs.js'", JSON.stringify(pathToFileURL(join(ROOT, 'js/world/matdefs.js')).href));
  code = replaceOnce(code, 'const HERE = dirname(fileURLToPath(import.meta.url));', `const HERE = ${JSON.stringify(TOOLS)};`);
  const path = join(directory, 'garments_validate.mjs'); writeFileSync(path, code); return path;
}

function fixture(directory) {
  const models = join(directory, 'models'); mkdirSync(models, { recursive: true });
  cpSync(join(MODELS, 'garments'), join(models, 'garments'), { recursive: true });
  for (const file of ['manifest.json', ...Object.values(manifests)]) cpSync(join(MODELS, file), join(models, file));
  return models;
}

function run(cli, models, args, reportFile) {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [cli, ...args, '--root', models, '--json', reportFile], {
    encoding: 'utf8', env, windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.doesNotMatch(result.stderr, /SyntaxError|ERR_MODULE_NOT_FOUND|ENOENT|bad option/, 'launcher/import errors do not prove a CLI contract');
  return result;
}

function allContract(age = null) {
  return (cli, models, dir) => {
    if (age) {
      const path = join(models, manifests[age]), manifest = readJSON(path);
      Object.values(manifest.files[0].assets)[0].triangles += 1;
      writeJSON(path, manifest);
    }
    const reportFile = join(dir, 'report.json'), result = run(cli, models, ['--all', '--complete'], reportFile);
    assert.equal(result.status, age ? 1 : 0, `${age ?? 'healthy'}: CLI exit status must reflect the combined result`);
    const report = readJSON(reportFile);
    assert.deepEqual(Object.keys(report).sort(), ['ok', ...AGES].sort(), '--all must report adult, child and teen exactly once');
    assert.equal(report.ok, !age, 'aggregate result must reflect every set');
    for (const name of AGES) {
      assert.equal(report[name].ok, name !== age, `${name}: only the deliberately damaged set may fail`);
      assert.equal(report[name].mode, 'complete', `${name}: --complete must reach every validator`);
      assert.ok(report[name].assets > 0, `${name}: report must come from actual exported assets`);
    }
    const lines = result.stdout.trim().split(/\r?\n/);
    assert.equal(lines.length, 3, 'all three sets must appear in human-readable output even when one fails');
    for (const [index, name] of AGES.entries()) {
      assert.match(lines[index], new RegExp(`^${name === age ? 'FAIL' : 'PASS'} garments${name === 'adult' ? '' : `_${name}`} \\(complete\\):`));
    }
    if (age) assert.match(report[age].errors.join('\n'), /declared triangle count differs from GLB/, 'metadata damage must be the failure reason');
    else assert.equal(result.stderr, '');
    return { exit: result.status, statuses: Object.fromEntries(AGES.map((name) => [name, report[name].ok])), output: lines };
  };
}

const cases = [{
  name: 'healthy --all --complete reports all three complete libraries', contract: allContract(),
  mutation: 'drop teen from the --all target list',
  mutate: (text) => replaceOnce(text, "target === 'all' ? Object.keys(validators) : [target]", "target === 'all' ? Object.keys(validators).filter((name) => name !== 'teen') : [target]"),
}];
for (const age of AGES) cases.push({
  name: `${age} metadata damage fails only ${age} while all three results remain visible`, contract: allContract(age),
  mutation: 'force successful exit status despite failed report',
  mutate: (text) => replaceOnce(text, 'process.exitCode = report.ok ? 0 : 1;', 'process.exitCode = 0;'),
});
cases.push({
  name: 'conflicting or repeated target flags are rejected',
  contract: (cli, models, dir) => {
    const pairs = [['--child', '--teen'], ['--child', '--all'], ['--teen', '--all'], ['--child', '--child'], ['--teen', '--teen'], ['--all', '--all']];
    for (const [index, flags] of pairs.entries()) {
      const result = run(cli, models, [...flags, '--complete'], join(dir, `flags-${index}.json`));
      assert.equal(result.status, 1, `${flags.join(' ')} must fail`);
      assert.match(result.stderr, /may be supplied only once and are mutually exclusive/);
    }
    return { exit: 1, rejectedFlagPairs: pairs };
  },
  mutation: 'disable mutually exclusive target validation',
  mutate: (text) => replaceOnce(text, "demand(target === 'adult', '--child, --teen and --all may be supplied only once and are mutually exclusive');", "demand(true, '--child, --teen and --all may be supplied only once and are mutually exclusive');"),
}, {
  name: '--all rejects a single-set --catalogue override',
  contract: (cli, models, dir) => {
    const result = run(cli, models, ['--all', '--complete', '--catalogue', join(TOOLS, 'garments.catalog.json')], join(dir, 'catalogue.json'));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--catalogue requires a single adult or teen set/);
    assert.equal(result.stdout, '', 'ambiguous catalogue must be rejected before validation');
    return { exit: 1, reason: result.stderr.trim() };
  },
  mutation: 'allow catalogue override for --all',
  mutate: (text) => replaceOnce(text, "demand(!options.cataloguePath || ['adult', 'teen'].includes(target),", 'demand(true,'),
});

const temporary = mkdtempSync(join(tmpdir(), 'ladera-validator-cli-audit-')), rows = [];
try {
  for (const [index, entry] of cases.entries()) {
    const baseline = join(temporary, `${index}-baseline`), mutant = join(temporary, `${index}-mutant`);
    mkdirSync(baseline); mkdirSync(mutant);
    const evidence = entry.contract(VALIDATOR, fixture(baseline), baseline);
    const cli = temporaryCLI(mutant, entry.mutate);
    let reason;
    try { entry.contract(cli, fixture(mutant), mutant); }
    catch (error) {
      assert.equal(error.code, 'ERR_ASSERTION', 'a mutation must fail a contract assertion, not crash the audit');
      reason = String(error.message).replaceAll(temporary, '<isolated-fixture>');
    }
    assert.ok(reason, `mutation survived: ${entry.name}`);
    rows.push({ test: entry.name, baseline: 'PASS', mutation: entry.mutation, mutant: 'KILLED', reason, evidence });
    console.log(`PASS + KILLED ${index + 1}/${cases.length} ${entry.name}`);
    for (const line of evidence.output ?? []) console.log('  ' + line);
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
writeJSON(OUTPUT, { node: process.version, validatorSha256: createHash('sha256').update(source).digest('hex'), tests: rows.length,
  passed: rows.length, mutationsKilled: rows.length, mutationsSurvived: 0, results: rows });
console.log(`Validator CLI audit ${process.version}: ${rows.length}/${rows.length} contracts passed; ${rows.length}/${rows.length} mutations killed; source assets untouched.`);
