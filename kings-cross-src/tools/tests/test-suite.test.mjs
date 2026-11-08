import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('the documented suite discovers relay core web and both tool test extensions without filters', async () => {
  const packageFile = new URL('../../package.json', import.meta.url);
  const { scripts } = JSON.parse(await readFile(packageFile, 'utf8'));
  const command = scripts.test.split(/\s+/);
  assert.deepEqual(command.slice(0, 2), ['node', '--test']);
  assert.deepEqual(command.slice(2).sort(), ['relay/tests/*.test.mjs', 'core/tests/*.test.ts',
    'web/tests/*.test.ts', 'tools/tests/*.test.mjs', 'tools/tests/*.test.ts'].sort());
  const root = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
  assert.equal(root.scripts['test:kings-cross'], 'npm --prefix kings-cross-src test');
});
