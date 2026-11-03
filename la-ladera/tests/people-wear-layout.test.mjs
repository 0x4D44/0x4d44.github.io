import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cases = [
  ['exact-views', 'GLB layout groups semantic views while preserving all bytes descriptors and non-layout JSON'],
  ['strides-targets', 'GLB layout preserves shared strided attributes CPU targets and GPU payload'],
  ['alignment-idempotence', 'GLB layout is aligned deterministic and idempotent'],
  ['invalid-input', 'GLB layout rejects malformed container boundaries views and references'],
];

for (const [key, name] of cases) test(name, () => {
  const args = ['la-ladera/tools/blender/people_wear_layout_check.py', '--check', key];
  if (process.env.WEAR_LAYOUT_MUTATION) args.push('--mutation', process.env.WEAR_LAYOUT_MUTATION);
  const result = spawnSync(process.env.PYTHON ?? 'python', args, {
    cwd: root, windowsHide: true, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
  });
  assert.equal(result.status, 0, `${key}\n${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.check, key); assert.equal(report.pass, true);
});
