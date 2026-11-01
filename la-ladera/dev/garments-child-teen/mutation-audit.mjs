// Prove every imported child/teen test detects its intended defect.
// Run headlessly at low priority with each supported Node executable:
//   nice -n 10 ionice -c 3 node la-ladera/dev/garments-child-teen/mutation-audit.mjs
// Positive tests receive damaged copies of the real exports. Negative tests
// receive a temporary copy of their test source with only the input corruption
// disabled; their original rejection assertions must then fail. No assertions
// are removed or changed, and production files are never mutated.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseGLB } from '../../tools/blender/garments_validate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const MODELS = join(ROOT, 'assets/models');
const OUTPUT = resolve(process.argv[2] ?? join(HERE, `mutations-node-${process.versions.node}`));
const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJSON = (path, value) => writeFileSync(path, JSON.stringify(value) + '\n');
const escapeRE = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function editManifest(f, edit) {
  const manifest = readJSON(f.manifest); edit(manifest); writeJSON(f.manifest, manifest);
}
function editGLB(f, edit) {
  const parsed = parseGLB(readFileSync(f.glb)); edit(parsed.json, parsed);
  const source = Buffer.from(JSON.stringify(parsed.json));
  const json = Buffer.alloc(Math.ceil(source.length / 4) * 4, 0x20); source.copy(json);
  const bin = parsed.bin, header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8);
  jh.writeUInt32LE(json.length); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(bin.length); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(f.glb, Buffer.concat([header, jh, json, bh, bin]));
}
function meshBelow(g, name) {
  const root = g.nodes.findIndex((node) => node.name === name);
  assert.ok(root >= 0, `mutation target ${name} exists`);
  const visit = (i) => g.nodes[i].mesh ?? (g.nodes[i].children ?? []).map(visit).find((n) => n !== undefined);
  const mesh = visit(root); assert.notEqual(mesh, undefined); return g.meshes[mesh];
}
function scaleChildren(g, name, factor) {
  const root = g.nodes.find((node) => node.name === name);
  assert.ok(root?.children?.length, `${name}: identity root has geometry children`);
  for (const index of root.children) {
    const node = g.nodes[index];
    if (node.matrix) {
      for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) node.matrix[col * 4 + row] *= factor;
    } else node.scale = (node.scale ?? [1, 1, 1]).map((v) => v * factor);
  }
}
function enlarge(f, name) {
  editGLB(f, (g) => {
    scaleChildren(g, name, 10);
  });
}
function overflowTriangles(f, name) {
  editGLB(f, (g, parsed) => {
    const mesh = meshBelow(g, name), batch = structuredClone(mesh.primitives[0]);
    const triangles = (batch.indices === undefined ? parsed.accessors[batch.attributes.POSITION].count : parsed.accessors[batch.indices].count) / 3;
    assert.ok(triangles > 0);
    for (let i = 0; i < Math.ceil(801 / triangles); i++) mesh.primitives.push(structuredClone(batch));
  });
}

const cases = [];
const positive = (suite, name, mutation, mutate, reason, unexpectedReason) => cases.push({ suite, name, mutation, mutate, reason, unexpectedReason, kind: 'damaged input' });
const negative = (suite, name, mutation, replacements) => cases.push({ suite, name, mutation, replacements, kind: 'disabled input corruption' });

positive('child', 'every required everyday garment key exists in both sizes and every applicable state',
  'Remove one required child state from the manifest.',
  (f) => editManifest(f, (m) => { delete m.files[0].assets.garment_tshirt_teal_small_flat; }));
positive('child', 'every piece stays inside its independent real dimension range in metres, including LOD',
  'Multiply real geometry below an identity GLB root by ten.', (f) => enlarge(f, 'garment_tshirt_teal_small_flat'), /actual longest side.*outside/);
positive('child', 'every piece stays inside its actual 800-triangle or 240-triangle LOD budget',
  'Append real triangle batches beyond the 800-triangle limit.', (f) => overflowTriangles(f, 'garment_tshirt_teal_small_flat'), /actual triangles exceed 800/);
positive('child', 'the generated child GLB and child manifest together stay within 700000 bytes',
  'Add valid GLB extras exceeding the payload limit.',
  (f) => editGLB(f, (g) => { g.asset.extras = { deliberateBudgetProbe: 'x'.repeat(700_000) }; }), /child files use.*700000 bytes/);
positive('child', 'small and big assets carry the declared age bands and approximately 55/75 percent sizing',
  'Mislabel one child asset as adult.', (f) => editManifest(f, (m) => { m.files[0].assets.garment_tshirt_teal_small_flat.ageGroup = 'adult'; }));
positive('child', 'the child set reuses the adult fabric palette and atlas without embedded textures',
  'Point the manifest at a different print atlas.', (f) => editManifest(f, (m) => { m.atlas.file = 'garments/wrong-prints.png'; }), /garments\/wrong-prints\.png/);
positive('child', 'the child library remains an object-only companion registered exactly once in the main manifest',
  'Remove the child companion registration.', (f) => {
    const path = join(f.models, 'manifest.json'), registration = readJSON(path);
    registration.files = registration.files.filter((name) => name !== 'manifest.garments_child.json'); writeJSON(path, registration);
  }, /register the child companion exactly once/);
positive('child', 'the checked-in child library passes the complete validator with actual generated files',
  'Raise the manifest triangle limit beyond the immutable cap.', (f) => editManifest(f, (m) => { m.limits.triangles = 801; }),
  /child manifest limit 'triangles'.*exceeds 800/, /runtime child library.*exceeding 700000/);

negative('child', 'an oversized binary mesh fails the real-size gate even after its metadata is refreshed',
  'Neutralize the oversized-geometry mutation.', [['scaleBinaryPositions(f, target, 10);', 'scaleBinaryPositions(f, target, 1);']]);
negative('child', 'an undersized binary mesh fails the lower real-size bound with accurate metadata',
  'Neutralize the undersized-geometry mutation.', [["scaleBinaryPositions(f, 'garment_tshirt_teal_small_flat', 0.25);", "scaleBinaryPositions(f, 'garment_tshirt_teal_small_flat', 1);"]]);
negative('child', 'an extra valid high-detail triangle batch fails the 800-triangle gate',
  'Do not append high-detail triangles.', [["addTriangleBatch(f, 'garment_tshirt_teal_small_flat', 800);", 'void f;']]);
negative('child', 'an extra valid LOD triangle batch fails the 240-triangle gate',
  'Do not append LOD triangles.', [["addTriangleBatch(f, 'garment_tshirt_teal_small_flat_lod', 240);", 'void f;']]);
negative('child', 'a missing required key fails independently of the remaining GLB geometry',
  'Keep the required key in the negative fixture.', [['delete f.manifest.files[0].assets.garment_school_polo_big_hung;', 'void f.manifest;']]);
negative('child', 'valid extra GLB payload fails the combined file-size gate',
  'Do not add the over-budget payload.', [["deliberateBudgetProbe: 'x'.repeat(700_000)", "deliberateBudgetProbe: ''"]]);
negative('child', 'child budget limits cannot be relaxed by editing manifest data',
  'Keep the valid manifest budget limits.', [['f.manifest.limits = { triangles: 801, lodTriangles: 241, runtimeBytes: 700_001 };', 'void f.manifest.limits;']]);
negative('child', 'declared child scale and age bands cannot contradict the fixed size contract',
  'Keep the valid scale and age-band declarations.', [
    ['f.manifest.sizes.small.scale = 0.9;', 'void f.manifest.sizes.small.scale;'],
    ['f.manifest.files[0].assets.garment_tshirt_teal_small_flat.ages = [18, 99];', 'void f.manifest.files[0].assets;'],
  ]);
negative('child', 'adult validation accepts its exact child companion but rejects an extra child-prefixed GLB',
  'Do not create the unlisted GLB.', [["cpSync(join(f.models, GLB), join(f.models, 'garments/garments_child_extra.glb'));", 'void f.models;']]);

positive('teen', 'teen acceptance: every required key and LOD exists in the generated GLB',
  'Remove one required teen state from the manifest.',
  (f) => editManifest(f, (m) => { delete m.files[0].assets.garment_tshirt_cream_small_flat; }));
positive('teen', 'teen acceptance: every piece is inside its real dimension range',
  'Multiply real geometry below an identity GLB root by ten.', (f) => enlarge(f, 'garment_tshirt_cream_small_flat'), /longest side.*outside expected/);
positive('teen', 'teen acceptance: every piece stays within its high and LOD triangle budgets',
  'Append real triangle batches beyond the 800-triangle limit.', (f) => overflowTriangles(f, 'garment_tshirt_cream_small_flat'), /triangles exceed 800/);
positive('teen', 'teen acceptance: complete generated payload stays under 700000 bytes',
  'Add an unbudgeted payload file.', (f) => writeFileSync(join(f.models, 'garments/teen/accidental-payload.bin'), Buffer.alloc(700_000)), /teen runtime payload.*exceeds 700000 bytes/);
positive('teen', 'the checked-in teen library satisfies the extended independent validator',
  'Raise the manifest triangle limit beyond the immutable cap.', (f) => editManifest(f, (m) => { m.limits.triangles = 801; }),
  /teen manifest limit 'triangles'.*exceeds 800/, /teen runtime library.*exceeding 700000/);
positive('teen', 'dress lengths, size classes, sock pair states and single-state shoe pairs remain explicit',
  'Make the knee dress shorter than the short dress.', (f) => editGLB(f, (g) => {
    scaleChildren(g, 'garment_dress_knee_small_hung', 0.1);
  }), /four visibly different dress lengths are required/);

negative('teen', 'removing a real key makes the key acceptance test fail',
  'Keep the required key in the negative fixture.', [['delete manifest.files[0].assets.garment_tshirt_cream_small_flat;', 'void manifest.files[0].assets;']]);
for (const detail of ['high', 'LOD']) negative('teen', `oversize real ${detail} piece makes the size acceptance test fail`,
  `Neutralize the ${detail} geometry scaling.`, [
    ['child.matrix[col * 4 + row] *= 3;', 'child.matrix[col * 4 + row] *= 1;'],
    ['.map((x) => x * 3);', '.map((x) => x * 1);'],
  ]);
for (const detail of ['high', 'LOD']) negative('teen', `extra real ${detail} triangle batches make the triangle acceptance test fail`,
  `Do not append ${detail} triangle batches.`, [['i < Math.ceil((cap + 1) / batchTriangles)', 'i < 0']]);
negative('teen', 'extra payload makes the same byte-budget acceptance test fail',
  'Replace the excess payload with an empty file.', [['Buffer.alloc(700_000)', 'Buffer.alloc(0)']]);
negative('teen', 'mutable catalogue and manifest cannot relax independent dimensions or budgets',
  'Keep the original dimensions and budgets.', [
    ['manifest.limits = { triangles: 8000, lodTriangles: 2400, runtimeBytes: 7_000_000 };', 'void manifest.limits;'],
    ['catalogue.garments[0].width *= 10;', 'catalogue.garments[0].width *= 1;'],
  ]);
negative('teen', 'unlisted teen GLBs are rejected instead of hiding inside the payload budget',
  'Do not create the unlisted teen GLB.', [["writeFileSync(join(f.models, 'garments/teen/unlisted.glb'), Buffer.alloc(16));", 'void f.models;']]);
negative('teen', 'malformed variant lists are reported without aborting validation',
  'Keep the valid catalogue and manifest variant lists.', [
    ['catalogue.garments[0].variants = {};', 'void catalogue.garments[0].variants;'],
    ['manifest.files[0].assets.garment_tshirt_cream_small_flat.variants = {};', 'void manifest.files[0].assets;'],
  ]);

assert.equal(cases.length, 32, 'audit all 17 child and 15 teen tests');
assert.equal(new Set(cases.map((entry) => `${entry.suite}/${entry.name}`)).size, cases.length);
mkdirSync(OUTPUT, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), 'ladera-garment-mutation-audit-'));
const rows = [];
try {
  for (const [index, entry] of cases.entries()) {
    const dir = join(scratch, String(index)), models = join(dir, 'models'); mkdirSync(models, { recursive: true });
    cpSync(join(MODELS, 'garments'), join(models, 'garments'), { recursive: true });
    for (const name of ['manifest.json', 'manifest.garments.json', 'manifest.garments_child.json', 'manifest.garments_teen.json']) {
      cpSync(join(MODELS, name), join(models, name));
    }
    const catalogue = join(dir, 'catalogue.json'); cpSync(join(ROOT, 'tools/blender/garments_teen.catalog.json'), catalogue);
    const f = { models, catalogue, manifest: join(models, `manifest.garments_${entry.suite}.json`), glb: join(models, `garments/garments_${entry.suite}.glb`) };
    const originalTest = join(ROOT, `tests/garments-${entry.suite}.test.mjs`);
    let testFile = originalTest;
    if (entry.mutate) entry.mutate(f);
    if (entry.replacements) {
      let source = readFileSync(originalTest, 'utf8');
      for (const [before, after] of entry.replacements) {
        assert.equal(source.split(before).length - 1, 1, `unique corruption mutation in ${entry.name}`);
        source = source.replace(before, after);
      }
      source = source.replace("'../tools/blender/garments_validate.mjs'", JSON.stringify(pathToFileURL(join(ROOT, 'tools/blender/garments_validate.mjs')).href));
      if (entry.suite === 'child') source = source.replace('const HERE = dirname(fileURLToPath(import.meta.url));', `const HERE = ${JSON.stringify(join(ROOT, 'tests'))};`);
      else source = source.replace("const ROOT = resolve(dirname(THIS_FILE), '..');", `const ROOT = ${JSON.stringify(ROOT)};`);
      testFile = join(dir, `garments-${entry.suite}.test.mjs`); writeFileSync(testFile, source);
    }
    const env = { ...process.env, GARMENTS_CHILD_MODELS_DIR: models, LADERA_TEEN_MODELS: models, LADERA_TEEN_CATALOGUE: catalogue };
    delete env.NODE_TEST_CONTEXT; delete env.GARMENTS_CHILD_PROOF_DIR; delete env.LADERA_TEEN_MUTANT;
    const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', `--test-name-pattern=^${escapeRE(entry.name)}$`, testFile], {
      encoding: 'utf8', env, timeout: 30_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024,
    });
    assert.ifError(run.error);
    const output = (run.stdout + run.stderr).replaceAll(scratch, '<isolated-fixture>').replaceAll(ROOT, '<la-ladera>');
    const log = `${String(index + 1).padStart(2, '0')}-${entry.suite}.tap`;
    writeFileSync(join(OUTPUT, log), output.replace(/[ \t]+$/gm, ''));
    assert.equal(run.status, 1, `${entry.name}: must reject the deliberate mutation; see ${log}`);
    assert.match(output, new RegExp(`not ok \\d+ - ${escapeRE(entry.name)}(?:\\r?\\n|$)`), `the intended named test must fail; see ${log}`);
    assert.match(output, /# fail 1\b/, `exactly the intended test must fail; see ${log}`);
    if (entry.reason) assert.match(output, entry.reason, `failure must report the intended invariant; see ${log}`);
    if (entry.unexpectedReason) assert.doesNotMatch(output, entry.unexpectedReason, `unrelated defects must not mask the mutation; see ${log}`);
    assert.doesNotMatch(output, /bad option|ERR_MODULE_NOT_FOUND|SyntaxError/, 'a launcher/import failure is not a mutation kill');
    rows.push({ suite: entry.suite, test: entry.name, mutation: entry.mutation, kind: entry.kind, exit: run.status, failedTests: 1, log });
    console.log(`KILLED ${String(index + 1).padStart(2, '0')}/32 ${entry.suite}: ${entry.name}`);
    rmSync(dir, { recursive: true, force: true });
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
const report = { node: process.version, total: cases.length, killed: rows.length, survived: cases.length - rows.length,
  childTests: rows.filter((row) => row.suite === 'child').length, teenTests: rows.filter((row) => row.suite === 'teen').length, results: rows };
writeFileSync(join(OUTPUT, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Mutation audit ${process.version}: ${rows.length}/${cases.length} killed; 17 child + 15 teen; 0 survived.`);
