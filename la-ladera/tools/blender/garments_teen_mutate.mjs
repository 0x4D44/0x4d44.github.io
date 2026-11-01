// Prove that every teen test detects a real damaged export or missing validator
// gate. Every mutant is an isolated copy; checked-in source/assets are read-only.
//   node la-ladera/tools/blender/garments_teen_mutate.mjs --json report.json
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseGLB } from './garments_validate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = 'assets/models/manifest.garments-teen.json';
const VALIDATOR = 'tools/blender/garments_validate.mjs';
const TEST = 'tests/garments-teen.test.mjs';
const requiredFiles = [VALIDATOR, TEST,
  'tools/blender/garments.catalog.json', 'tools/blender/garments-child.catalog.json', 'tools/blender/garments_teen.catalog.json',
  'tools/blender/GARMENTS-SOURCES.md', 'tools/blender/GARMENTS-CHILD-SOURCES.md', 'tools/blender/GARMENTS-TEEN-SOURCES.md',
  'js/interiors/catalog.js', 'js/interiors/goods-catalog.js', 'js/interiors/garments_data.js', 'js/world/matdefs.js',
  'assets/models/manifest.garments.json', 'assets/models/manifest.garments-child.json', MANIFEST];
const directories = ['assets/models/garments', 'assets/models/garments-child', 'assets/models/garments-teen'];
const filesBelow = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? filesBelow(join(dir, entry.name)) : [join(dir, entry.name)]);
const fingerprint = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const protectedFiles = [...requiredFiles.map((f) => join(ROOT, f)), ...directories.flatMap((d) => filesBelow(join(ROOT, d)))];
const protectedBefore = Object.fromEntries(protectedFiles.map((f) => [f.slice(ROOT.length + 1), fingerprint(f)]));
const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJSON = (p, value) => writeFileSync(p, JSON.stringify(value) + '\n');
const editJSON = (dir, path, edit) => { const value = readJSON(join(dir, path)); edit(value); writeJSON(join(dir, path), value); };
const flatFile = (lod = false) => `assets/models/garments-teen/garments_flat${lod ? '_lod' : ''}.glb`;
const flatKey = (lod = false) => `garment_teen_tshirt_cream_small_flat${lod ? '_lod' : ''}`;
function editGLB(dir, rel, edit) {
  const path = join(dir, rel), parsed = parseGLB(readFileSync(path));
  edit(parsed.json, parsed);
  const content = Buffer.from(JSON.stringify(parsed.json)), json = Buffer.alloc(Math.ceil(content.length / 4) * 4, 0x20);
  content.copy(json);
  const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8), bin = parsed.bin;
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8);
  jh.writeUInt32LE(json.length); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(bin.length); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(path, Buffer.concat([header, jh, json, bh, bin]));
}
function rescale(dir, rel, key, factor) {
  editGLB(dir, rel, (g) => {
    const root = g.nodes.find((n) => n.name === key);
    assert.ok(root?.children?.length);
    for (const index of root.children) {
      const node = g.nodes[index];
      if (node.matrix) for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) node.matrix[col * 4 + row] *= factor;
      else node.scale = (node.scale ?? [1, 1, 1]).map((n) => n * factor);
    }
  });
}
function excessTriangles(dir, lod = false) {
  editGLB(dir, flatFile(lod), (g, parsed) => {
    let mesh;
    const visit = (index) => { const node = g.nodes[index]; if (node.mesh !== undefined) mesh ??= g.meshes[node.mesh]; for (const c of node.children ?? []) visit(c); };
    visit(g.nodes.findIndex((n) => n.name === flatKey(lod)));
    assert.ok(mesh);
    const batch = structuredClone(mesh.primitives[0]);
    const tris = (batch.indices === undefined ? parsed.accessors[batch.attributes.POSITION].count : parsed.accessors[batch.indices].count) / 3;
    for (let i = 0; i < Math.ceil(((lod ? 240 : 800) + 1) / tris); i++) mesh.primitives.push(structuredClone(batch));
  });
}
function replaceGate(dir, from, to) {
  const path = join(dir, VALIDATOR), original = readFileSync(path, 'utf8');
  // Limit mutations to the new teen validator or CLI, preserving adult/child.
  const boundary = original.indexOf('/** Teen companion set,');
  const before = original.slice(0, boundary), teen = original.slice(boundary);
  assert.equal(teen.split(from).length, 2, `mutation must target exactly one real gate: ${from}`);
  writeFileSync(path, before + teen.replace(from, to));
}
const names = {
  keys: 'teen acceptance: every required key and LOD exists in the generated GLB',
  size: 'teen acceptance: every piece is inside its real dimension range',
  tris: 'teen acceptance: every piece stays within its high and LOD triangle budgets',
  bytes: 'teen acceptance: complete generated payload stays under 3500000 bytes',
  validator: 'the checked-in teen library satisfies the extended independent validator',
  lengths: 'dress lengths, size classes, sock pair states and single-state shoe pairs remain explicit',
  missing: 'removing a real key makes the key acceptance test fail',
  highSize: 'oversize real high piece makes the size acceptance test fail',
  lowSize: 'oversize real LOD piece makes the size acceptance test fail',
  highTris: 'extra real high triangle batches make the triangle acceptance test fail',
  lowTris: 'extra real LOD triangle batches make the triangle acceptance test fail',
  overBytes: 'extra payload makes the same byte-budget acceptance test fail',
  limits: 'mutable catalogue and manifest cannot relax independent dimensions or budgets',
  unlisted: 'unlisted teen GLBs are rejected instead of hiding inside the payload budget',
  variants: 'malformed variant lists are reported without aborting validation',
  cli: 'complete CLI validates all three libraries by default and honors explicit size selectors',
  recipes: 'teen recipes cover both sizes with drawers, wardrobes and school lockers',
  textures: 'extra teen texture pages are rejected even when the byte budget still passes',
};
const mutants = [];
const add = (id, test, defect, mutate) => mutants.push({ id, test: names[test], defect, mutate });
add('missing-key', 'keys', 'Delete the exported cream small flat tee binding.', (dir) => editJSON(dir, MANIFEST, (m) => {
  delete m.files.find((f) => f.glb.endsWith('/garments_flat.glb')).assets[flatKey()];
}));
for (const lod of [false, true]) {
  add(`${lod ? 'lod' : 'high'}-oversize`, 'size', `Triple a real ${lod ? 'LOD' : 'high'} mesh transform.`, (dir) => rescale(dir, flatFile(lod), flatKey(lod), 3));
  add(`${lod ? 'lod' : 'high'}-triangles`, 'tris', `Duplicate real ${lod ? 'LOD' : 'high'} index batches past the cap.`, (dir) => excessTriangles(dir, lod));
}
add('runtime-payload', 'bytes', 'Ship an accidental 3.5 MB file.', (dir) => writeFileSync(join(dir, 'assets/models/garments-teen/teen/accidental.bin'), Buffer.alloc(3_500_000)));
add('wrong-scope', 'validator', 'Claim the object-only library has a different scope.', (dir) => editJSON(dir, MANIFEST, (m) => { m.scope = 'wearable'; }));
add('collapsed-dress-length', 'lengths', 'Halve the long dress so the four garment lengths no longer increase.', (dir) =>
  rescale(dir, 'assets/models/garments-teen/garments_hung.glb', 'garment_teen_dress_maxi_small_hung', 0.5));
add('missing-state-gate', 'missing', 'Remove the per-key completeness rejection.', (dir) => replaceGate(dir,
  'for (const key of keys) check(assets.has(key), `missing required teen state ${key}`);',
  'for (const key of keys) check(true, `missing required teen state ${key}`);'));
for (const kind of ['highSize', 'lowSize']) add(`dimension-gate-${kind}`, kind, 'Bypass the independent real-dimension range gate.', (dir) => replaceGate(dir,
  'if (range) check(longest >= range[0] - EPS && longest <= range[1] + EPS,', 'if (range) check(true,'));
for (const kind of ['highTris', 'lowTris']) add(`triangle-gate-${kind}`, kind, 'Bypass actual triangle-cap enforcement.', (dir) => replaceGate(dir,
  'check(actual.triangles <= cap, `${key}: ${actual.triangles} triangles exceed ${cap}`);',
  'check(true, `${key}: ${actual.triangles} triangles exceed ${cap}`);'));
add('byte-gate', 'overBytes', 'Bypass the measured full-directory byte cap.', (dir) => replaceGate(dir,
  'check(runtimeBytes <= cap, `teen runtime library is ${runtimeBytes} bytes, exceeding ${cap}`);',
  'check(true, `teen runtime library is ${runtimeBytes} bytes, exceeding ${cap}`);'));
add('reference-dimension-gate', 'limits', 'Trust mutable reference dimensions instead of the independent contract.', (dir) => replaceGate(dir,
  'check(Number.isFinite(c.width) && Number.isFinite(c.length) && Math.abs(c.width - expected.width) < 1e-6 && Math.abs(c.length - expected.length) < 1e-6,',
  'check(true,'));
add('manifest-limit-gate', 'limits', 'Permit mutable manifest limits to raise independent caps.', (dir) => replaceGate(dir,
  'check(Number.isInteger(manifest.limits?.[name]) && manifest.limits[name] > 0 && manifest.limits[name] <= cap,', 'check(true,'));
add('unlisted-glb-gate', 'unlisted', 'Stop rejecting an unreferenced shipped GLB.', (dir) => replaceGate(dir,
  "if (complete && path.endsWith('.glb')) check(glbs.has(rel), `unlisted teen GLB '${rel}'`);", ''));
add('variant-list-gate', 'variants', 'Stop validating catalogue variant-list structure.', (dir) => replaceGate(dir,
  'check(Array.isArray(c.variants) && c.variants.length > 0 && new Set(c.variants).size === c.variants.length, `${c.id}: invalid teen variants`);',
  'check(true, `${c.id}: invalid teen variants`);'));
add('cli-default-only-adult', 'cli', 'Default CLI accidentally drops child and teen validation.', (dir) => replaceGate(dir,
  "(options.cataloguePath ? 'adult' : 'all')", "(options.cataloguePath ? 'adult' : 'adult')"));
add('cli-breaks-legacy-builder', 'cli', 'Catalogue-only adult builder calls are accidentally treated as all sizes.', (dir) => replaceGate(dir,
  "(options.cataloguePath ? 'adult' : 'all')", "'all'"));
add('missing-locker-recipe', 'recipes', 'Drop all school-locker recipes.', (dir) => editJSON(dir, 'assets/models/garments-teen/assortments.json', (r) => {
  r.bindings = r.bindings.filter((b) => !b.roomKinds.includes('school_locker'));
}));
add('texture-page-gate', 'textures', 'Allow an accidental second teen texture page.', (dir) => replaceGate(dir,
  "if (/\\.(?:png|webp|jpe?g|ktx2?)$/i.test(path)) check(rel === 'garments-teen/teen/fabrics.png', `additional teen texture page '${rel}'`);", ''));

const scratch = mkdtempSync(join(tmpdir(), 'ladera-teen-test-proof-'));
const baseline = join(scratch, 'baseline'); mkdirSync(baseline);
const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; delete env.LADERA_TEEN_MODELS; delete env.LADERA_TEEN_CATALOGUE; delete env.LADERA_TEEN_MUTANT;
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const run = (dir, test) => {
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap',
    ...(test ? [`--test-name-pattern=^${escaped(test)}$`] : []), join(dir, TEST)], {
    encoding: 'utf8', timeout: 60_000, windowsHide: true, env, maxBuffer: 5 * 1024 * 1024,
  });
  assert.ifError(result.error);
  return { ...result, output: result.stdout + result.stderr };
};
const evidence = { node: process.version, mode: 'isolated-real-data-and-validator-gates', tests: Object.values(names).length, mutants: [], preserved: false };
try {
  writeFileSync(join(baseline, 'package.json'), '{"type":"module"}\n');
  for (const rel of requiredFiles) { mkdirSync(dirname(join(baseline, rel)), { recursive: true }); cpSync(join(ROOT, rel), join(baseline, rel)); }
  for (const rel of directories) cpSync(join(ROOT, rel), join(baseline, rel), { recursive: true });
  const green = run(baseline);
  assert.equal(green.status, 0, green.output);
  assert.match(green.output, /^# tests 18$/m);
  assert.match(green.output, /^# skipped 0$/m);
  evidence.baseline = green.output.split('\n').filter((line) => /^# (tests|pass|fail|skipped)/.test(line));
  for (const mutant of mutants) {
    const dir = join(scratch, mutant.id); cpSync(baseline, dir, { recursive: true });
    mutant.mutate(dir);
    const result = run(dir, mutant.test);
    const expected = new RegExp(`^not ok \\d+ - ${escaped(mutant.test)}$`, 'm');
    assert.equal(result.status, 1, `${mutant.id}: expected assertion failure\n${result.output}`);
    assert.match(result.output, expected, `${mutant.id}: exact target test must fail, not a loader/startup error`);
    const entry = { id: mutant.id, test: mutant.test, defect: mutant.defect, exitCode: result.status,
      failedTest: result.output.match(expected)[0],
      assertions: result.output.split('\n').filter((line) => /failureType:|code: 'ERR_ASSERTION'|^  error:|^# fail /.test(line)),
    };
    evidence.mutants.push(entry);
    console.log(`KILLED ${mutant.id}: ${entry.failedTest}`);
    rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual([...new Set(evidence.mutants.map((m) => m.test))].sort(), Object.values(names).sort(), 'every new test must have a killed meaningful mutant');
  const restored = run(baseline);
  assert.equal(restored.status, 0, restored.output);
  assert.match(restored.output, /^# skipped 0$/m);
  evidence.restored = restored.output.split('\n').filter((line) => /^# (tests|pass|fail|skipped)/.test(line));
  const after = Object.fromEntries(protectedFiles.map((f) => [f.slice(ROOT.length + 1), fingerprint(f)]));
  assert.deepEqual(after, protectedBefore, 'checked-in source and all three libraries must stay byte-identical throughout mutation testing');
  evidence.preserved = true; evidence.sourceHashes = after; evidence.ok = true;
  console.log(`PASS ${evidence.mutants.length}/${mutants.length} meaningful mutants killed; ${evidence.tests}/${evidence.tests} tests covered; restored suite green with no skips.`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
  const jsonFlag = process.argv.indexOf('--json');
  if (jsonFlag >= 0) { assert.ok(process.argv[jsonFlag + 1], '--json needs a path'); writeJSON(resolve(process.argv[jsonFlag + 1]), evidence); }
}
