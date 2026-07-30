import assert from 'node:assert/strict';
import test from 'node:test';
import { validatorRoot } from './path.mjs';

test('validatorRoot converts Windows file URLs to native filesystem paths', () => {
  const moduleUrl = 'file:///D:/worktrees/site/wifi-cartographer/tests/validate-static.mjs';
  assert.equal(
    validatorRoot(moduleUrl, { windows: true }),
    'D:\\worktrees\\site\\wifi-cartographer\\',
  );
});
