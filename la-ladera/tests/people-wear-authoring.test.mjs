import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cases = [
  ['legacy-topology', 'legacy hip refinement preserves its exact triangle topology guard'],
  ['legacy-geometry', 'legacy hip refinement preserves its strict coordinate fingerprint'],
  ['legacy-influences', 'legacy hip refinement rejects a fifth skin influence'],
  ['current-mesh', 'current hip guard pins every complete raw mesh stream'],
  ['source-text', 'current hip guard accepts LF and CRLF but rejects each changed body source'],
  ['versions', 'body version dispatch preserves legacy refinement and unchanged current mesh'],
  ['normals', 'small far facets and cancelling incident areas produce valid unit normals'],
];

for (const [key, name] of cases) test(name, () => {
  const args = ['la-ladera/tools/blender/people_wear_authoring_check.py', '--check', key];
  if (process.env.WEAR_AUTHOR_MUTATION) args.push('--mutation', process.env.WEAR_AUTHOR_MUTATION);
  const result = spawnSync(process.env.PYTHON ?? 'python', args, {
    cwd: root, windowsHide: true, encoding: 'utf8', timeout: 90_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1',
      PEOPLE_WEAR_PYSITE: process.env.PEOPLE_WEAR_PYSITE ?? resolve(root, 'la-ladera/.scratch/wear-v2-python') },
  });
  assert.equal(result.status, 0, `${key}\n${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.check, key); assert.equal(report.pass, true);
});
