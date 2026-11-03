// Current-body source provenance and explicit v2 payload/LOD release boundaries.
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, PEOPLE_WEAR_SOURCE_PATHS, peopleWearSourceInputs, checkPeopleWearSourceInputs } from '../tools/people_wear_data.mjs';
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
