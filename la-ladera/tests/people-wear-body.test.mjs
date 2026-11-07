// Current-source native anatomy and body LOD proof, separate from clip clearance.
// LADERA_PRIO=idle node --import ./la-ladera/tests/register.mjs la-ladera/tests/people-wear-body.test.mjs
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
async function proof(check) {
  const { code, output, errors } = await new Promise((done, reject) => {
    const child = spawn(process.env.PYTHON ?? 'python', ['la-ladera/tools/blender/people_wear_body_check.py', '--check', check],
      { cwd: ROOT, env: { ...process.env, LADERA_PRIO: 'idle' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { errors += data; });
    child.on('error', reject);
    child.on('close', code => done({ code, output, errors }));
  });
  // Forward actual loader markers, not a synthetic success marker from the test.
  for (const line of errors.split('\n')) if (line.startsWith('[wear-mutation-applied:')) process.stderr.write(line + '\n');
  assert.equal(code, 0, errors);
  assert.ok(output.trim(), 'the body proof process must produce its actual measurements');
  const report = JSON.parse(output); assert.equal(report.ok, true); assert.equal(report.check, check);
  return report;
}

test('native body provenance pins all six current source files in LF form', async () => {
  const report = await proof('sources');
  assert.equal(report.fits, 23); assert.equal(report.sourceForm, 'LF');
  assert.ok(report.results.every(row => row.sourcePins === 6));
});

test('native hands legs and sandal skin retain every current source surface triangle', async () => {
  const report = await proof('native');
  assert.equal(report.fits, 23);
  assert.ok(report.results.every(row => row.nativeComponentViews === 10 && row.nativeTriangles > 2000));
});

test('every new body component is closed and consistently oriented after Float32 export', async () => {
  const report = await proof('topology');
  assert.equal(report.fits, 23);
  assert.ok(report.results.every(row => row.closedComponentViews >= 40));
});

test('every regenerated far body is at most forty percent of its near triangles', async () => {
  const report = await proof('lod');
  assert.equal(report.fits, 23);
  assert.ok(report.results.every(row => row.nearTriangles > 0 && row.farTriangles > 0 && row.ratio <= .4));
});

test('native source fingerprints are identical for LF and CRLF checkout bytes', async () => {
  const report = await proof('lf'); assert.equal(report.comparisons, 2);
});

test('native body weights use the current source recipe instead of the garment callback at every vertex', async () => {
  const report = await proof('weights'); assert.equal(report.fits, 23);
  assert.ok(report.results.every(row => row.weightedVertices > 2000 && row.sourceParts >= 12 && row.distinctFromGarmentCallback === row.weightedVertices));
});

test('all shipped native body triangle corners retain current source positions and quantized skin weights in both LODs', async () => {
  const report = await proof('exported'); assert.equal(report.fits, 23);
  assert.ok(report.results.every(row => row.lods === 2 && row.positionsExact && row.weightsU8Exact && row.nearTriangles > 0 && row.farTriangles > 0 && row.triangleCorners === 3 * (row.nearTriangles + row.farTriangles)));
});
