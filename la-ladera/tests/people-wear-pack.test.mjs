import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cases = [
  ['bounded-weld', 'body packing welds bounded far normals without changing triangle attribute bytes'],
  ['encoded-seams', 'body packing preserves exact position UV skin and extra attribute seams'],
  ['near-input', 'body packing preserves all near normals and caller owned arrays'],
  ['byte-angle', 'body packing measures uploaded normalized BYTE normals at the five degree boundary'],
  ['invalid-input', 'body packing rejects malformed encoded streams and triangle indices'],
];

for (const [key, name] of cases) test(name, () => {
  const args = ['la-ladera/tools/blender/people_wear_pack_check.py', '--check', key];
  if (process.env.WEAR_PACK_MUTATION) args.push('--mutation', process.env.WEAR_PACK_MUTATION);
  const result = spawnSync(process.env.PYTHON ?? 'python', args, {
    cwd: root, windowsHide: true, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
  });
  assert.equal(result.status, 0, `${key}\n${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.check, key); assert.equal(report.pass, true);
});
