// Current-body source provenance and explicit v2 payload/LOD release boundaries.
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, PEOPLE_WEAR_SOURCE_PATHS, peopleWearSourceInputs, checkPeopleWearSourceInputs, checkWearAuthoringReports } from '../tools/people_wear_data.mjs';
import { checkWearLodBudget, checkWearModelBudget, COMPRESSED_MODEL_BYTES } from '../tools/blender/people_wear_validate.mjs';

// Independent list from the rebase contract; do not derive this oracle from the
// product list because a missing source must fail rather than silently vanish.
const REQUIRED = [
  'assets/models/people/people.glb', 'assets/models/people/people_lod.glb',
  'assets/models/people/people_meta.json', 'assets/models/people/people_albedo.jpg',
  'assets/models/people/people_normal.jpg', 'assets/models/people/people_orm.jpg',
  'tools/blender/people_body.py', 'tools/blender/people_body_limbs.py',
  'tools/blender/people_tex.py', 'tools/blender/people_head.py',
  'tools/blender/people_build.py', 'tools/blender/people_cast.py',
  'assets/models/manifest.people.json', 'assets/models/manifest.json',
].sort();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const textPath = path => path.endsWith('.py') || path.endsWith('.json');

function fixture(t, eol = '\n') {
  const scratch = join(ROOT, '.scratch'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'wear-source-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const expected = REQUIRED.map(path => {
    const canonical = textPath(path) ? Buffer.from(`${path}\nsecond line\n`) : Buffer.from([0, 255, 13, 10, 128, 42]);
    const checkout = textPath(path) ? Buffer.from(canonical.toString('utf8').replace(/\n/g, eol)) : canonical;
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), checkout);
    return { path, form: textPath(path) ? 'LF' : 'bytes', bytes: canonical.length, sha256: digest(canonical) };
  });
  return { root, expected };
}

test('wear source inventory pins both bodies all texture pages six recipes and both protected manifests', t => {
  assert.deepEqual([...PEOPLE_WEAR_SOURCE_PATHS], REQUIRED);
  const { root, expected } = fixture(t);
  assert.deepEqual(peopleWearSourceInputs(root).map(row => row.path), expected.map(row => row.path));
});

test('wear source text pins use identical canonical LF bytes for LF and CRLF checkouts', t => {
  const lf = fixture(t), crlf = fixture(t, '\r\n');
  assert.deepEqual(peopleWearSourceInputs(lf.root), lf.expected);
  assert.deepEqual(peopleWearSourceInputs(crlf.root), lf.expected);
  assert.deepEqual(checkPeopleWearSourceInputs(lf.expected, crlf.root), lf.expected);
});

test('wear source binary pins preserve every byte including CRLF and non-UTF8 bytes', t => {
  const { root, expected } = fixture(t, '\r\n');
  const rows = peopleWearSourceInputs(root).filter(row => !textPath(row.path));
  assert.equal(rows.length, 5);
  assert.deepEqual(rows, expected.filter(row => !textPath(row.path)));
  writeFileSync(join(root, rows[0].path), Buffer.from([0, 255, 10, 128, 42]));
  assert.throws(() => checkPeopleWearSourceInputs(expected, root), /source fingerprints/);
});

test('wear source certificate rejects omitted reordered stale or extended rows and changed live sources', t => {
  const { root, expected } = fixture(t);
  assert.deepEqual(checkPeopleWearSourceInputs(structuredClone(expected), root), expected);
  const corruptions = [null, {}, [], expected.slice(1), [...expected].reverse(), [...expected, expected[0]]];
  for (const [key, value] of [['path', 'wrong.py'], ['form', 'bytes'], ['bytes', -1], ['sha256', '0'.repeat(64)], ['extra', true]]) {
    const rows = structuredClone(expected); rows[0][key] = value; corruptions.push(rows);
  }
  for (const rows of corruptions) assert.throws(() => checkPeopleWearSourceInputs(rows, root), /source fingerprints/);
  writeFileSync(join(root, 'tools/blender/people_head.py'), 'changed current head\n');
  assert.throws(() => checkPeopleWearSourceInputs(expected, root), /source fingerprints/);
});

test('wear far LOD accepts exactly forty percent and rejects one triangle above the boundary', () => {
  assert.equal(checkWearLodBudget(5, 2, 'boundary'), .4);
  assert.equal(checkWearLodBudget(1800, 600, 'below'), 1 / 3);
  assert.equal(checkWearLodBudget(3516, 812, 'body'), 812 / 3516);
  for (const [near, far] of [[5, 3], [1800, 721], [3516, 1407]])
    assert.throws(() => checkWearLodBudget(near, far, 'over-limit'), /over-limit: far LOD exceeds 40%/);
});

test('wear LOD budgets reject zero fractional nonfinite unsafe and nonnumeric triangle counts', () => {
  for (const value of [0, -1, .5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '10', null, undefined]) {
    assert.throws(() => checkWearLodBudget(value, 1), /positive integers/);
    assert.throws(() => checkWearLodBudget(100, value), /positive integers/);
  }
});

test('wear compressed model budget accepts six million bytes and rejects one byte more', () => {
  assert.equal(COMPRESSED_MODEL_BYTES, 6000000);
  assert.equal(checkWearModelBudget(1), 1);
  assert.equal(checkWearModelBudget(6000000), 6000000);
  assert.throws(() => checkWearModelBudget(6000001), /6,000,000 bytes/);
});

test('wear model budget rejects zero negative fractional nonfinite and nonnumeric byte counts', () => {
  for (const value of [0, -1, .5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '42', null, undefined])
    assert.throws(() => checkWearModelBudget(value), /invalid/);
});

const AUTHORING_PHASES = [['restFit', 'rest'], ['faceFit', 'faces'], ['poseFit', 'seated']];
function authoringFixture(t, eol = '\n') {
  const scratch = join(ROOT, '.scratch'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'wear-authoring-source-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const reports = {
    rest: { id: 'm_don', authoringOnly: true, complete: false, converged: true,
      passes: [{ moved: 3 }, { moved: 1 }], movedVertices: 4, maxDisplacement: .012, boundedSearches: 2 },
    faces: { id: 'm_don', schema: 1, authoringOnly: true, complete: false, converged: true,
      passes: [{ moved: 3 }, { moved: 2 }, { moved: 0 }], checks: { history: [5, 2, 0], iterations: [1, 2] },
      maximumM: .023, pools: [{ label: 'near', passes: [1, 2] }, { label: 'far', passes: [1] }] },
    seated: { id: 'm_don', schema: 1, authoringOnly: true, complete: false, converged: true,
      passes: [1, 2], maximumTotalBindM: .031, maximumTotalPosedM: .039,
      staticRows: [{ label: 'near' }, { label: 'far' }], targets: [{ label: 'sit_idle', passes: [1, 2, 3] }] },
  };
  // These summaries are independent, explicit expectations. Do not call the
  // product compactor to create its own oracle.
  const fit = {
    restFit: { samples: 1, passes: 2, movedVertices: 4, maxDisplacementM: .012, boundedSearches: 2, unresolved: 0 },
    faceFit: { id: 'm_don', schema: 1, authoringOnly: true, complete: false, converged: true,
      passes: 3, checks: { history: 3, iterations: 2 }, maximumM: .023, poolCount: 2 },
    poseFit: { id: 'm_don', schema: 1, authoringOnly: true, complete: false, converged: true,
      passes: 2, maximumTotalBindM: .031, maximumTotalPosedM: .039, staticRowCount: 2, targetCount: 1,
      encoding: { fixture: 'the independent packed-target guard owns this descriptor' } },
  };
  function save(field, phase, report = reports[phase]) {
    const path = `dev/wear/authoring/m_don/${phase}.json`, canonical = Buffer.from(JSON.stringify(report, null, 2) + '\n');
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), canonical.toString('utf8').replace(/\n/g, eol));
    fit[field].report = { path, form: 'LF', bytes: canonical.length, sha256: digest(canonical) };
    return canonical;
  }
  for (const [field, phase] of AUTHORING_PHASES) save(field, phase);
  return { root, fit, reports, save, pins: AUTHORING_PHASES.map(([field]) => ({ ...fit[field].report })) };
}

test('wear authoring proofs preserve full LF fingerprints across CRLF checkouts without changing summaries', t => {
  const lf = authoringFixture(t), crlf = authoringFixture(t, '\r\n'), before = structuredClone(lf.fit);
  assert.deepEqual(checkWearAuthoringReports({}, 'm_don', lf.root), []);
  assert.deepEqual(checkWearAuthoringReports(lf.fit, 'm_don', lf.root), lf.pins);
  assert.deepEqual(checkWearAuthoringReports(crlf.fit, 'm_don', crlf.root), lf.pins);
  assert.deepEqual(lf.fit, before);
  // JSON key ordering changes neither proof meaning nor the compact summary.
  const reordered = Object.fromEntries(Object.entries(lf.fit).reverse().map(([field, summary]) => [field, Object.fromEntries(Object.entries(summary).reverse())]));
  assert.deepEqual(checkWearAuthoringReports(reordered, 'm_don', lf.root), lf.pins);
});

test('wear authoring proofs reject redirected phase paths and non-LF pin forms', t => {
  const f = authoringFixture(t);
  for (const [field, phase] of AUTHORING_PHASES) {
    const redirected = structuredClone(f.fit), other = `dev/wear/authoring/another-fixture/${phase}.json`;
    mkdirSync(dirname(join(f.root, other)), { recursive: true });
    writeFileSync(join(f.root, other), JSON.stringify(f.reports[phase], null, 2) + '\n');
    redirected[field].report.path = other;
    assert.throws(() => checkWearAuthoringReports(redirected, 'm_don', f.root), /missing .* authoring report pin/);
    for (const form of ['bytes', 'CRLF', undefined]) {
      const invalid = structuredClone(f.fit); invalid[field].report.form = form;
      assert.throws(() => checkWearAuthoringReports(invalid, 'm_don', f.root), /missing .* authoring report pin/);
    }
  }
});

test('wear authoring proofs reject stale byte counts hashes and changed full report bytes', t => {
  const f = authoringFixture(t);
  for (const [field, phase] of AUTHORING_PHASES) {
    for (const [key, value] of [['bytes', f.fit[field].report.bytes + 1], ['sha256', '0'.repeat(64)]]) {
      const invalid = structuredClone(f.fit); invalid[field].report[key] = value;
      assert.throws(() => checkWearAuthoringReports(invalid, 'm_don', f.root), /authoring report bytes changed/);
    }
    const bytes = f.save(field, phase);
    // Valid JSON with unchanged semantics still changes the certified bytes.
    writeFileSync(join(f.root, f.fit[field].report.path), Buffer.concat([bytes, Buffer.from('\n')]));
    assert.throws(() => checkWearAuthoringReports(f.fit, 'm_don', f.root), /authoring report bytes changed/);
    f.save(field, phase);
  }
});

test('wear authoring proofs require the claimed resident authoring-only status and convergence even after repinning', t => {
  const f = authoringFixture(t);
  for (const [field, phase] of AUTHORING_PHASES) for (const [key, value] of [['id', 'w_vecina'], ['authoringOnly', false], ['converged', false]]) {
    const original = structuredClone(f.fit[field]), report = structuredClone(f.reports[phase]); report[key] = value;
    // Keep the compact summary internally consistent so only the proof's
    // identity/finality guard can reject this independently re-pinned fixture.
    if (field !== 'restFit') f.fit[field][key] = value;
    f.save(field, phase, report);
    assert.throws(() => checkWearAuthoringReports(f.fit, 'm_don', f.root), /incomplete or belongs to another fit/);
    f.fit[field] = original; f.save(field, phase);
  }
});

test('wear authoring compact summaries reject omitted extra or changed values from their pinned full proofs', t => {
  const f = authoringFixture(t);
  for (const [field, key] of [['restFit', 'movedVertices'], ['faceFit', 'poolCount'], ['poseFit', 'targetCount']]) {
    for (const change of ['changed', 'omitted', 'extra']) {
      const invalid = structuredClone(f.fit);
      if (change === 'changed') invalid[field][key]++;
      else if (change === 'omitted') delete invalid[field][key];
      else invalid[field].inventedSummary = true;
      assert.throws(() => checkWearAuthoringReports(invalid, 'm_don', f.root), /authoring summary differs from its full proof/);
    }
  }
  const nested = structuredClone(f.fit); nested.faceFit.checks.history = 4;
  assert.throws(() => checkWearAuthoringReports(nested, 'm_don', f.root), /authoring summary differs from its full proof/);
});

test('wear authoring full proofs require actual pass pool and target arrays rather than length-shaped objects', t => {
  const f = authoringFixture(t);
  for (const [field, phase, key] of [['restFit', 'rest', 'passes'], ['faceFit', 'faces', 'pools'], ['poseFit', 'seated', 'staticRows'], ['poseFit', 'seated', 'targets']]) {
    const report = structuredClone(f.reports[phase]); report[key] = { length: report[key].length };
    f.save(field, phase, report);
    assert.throws(() => checkWearAuthoringReports(f.fit, 'm_don', f.root), new RegExp(`malformed ${phase} authoring proof`));
    f.save(field, phase);
  }
});
