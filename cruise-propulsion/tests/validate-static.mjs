import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = normalize(join(here, '..'));
const root = normalize(join(appDir, '..'));
const mustExist = ['index.html', 'styles.css', 'app.js'];

for (const file of mustExist) assert.ok(existsSync(join(appDir, file)), `${file} exists`);

const index = readFileSync(join(appDir, 'index.html'), 'utf8');
assert.match(index, /<link rel=\x22stylesheet\x22 href=\x22styles\.css\x22\s*\/>/, 'index links stylesheet');
assert.match(index, /<script type=\x22module\x22 src=\x22app\.js\x22><\/script>/, 'index loads module app');
assert.match(index, /id=\x22plant\x22/, 'plant section exists');
assert.match(index, /id=\x22pods\x22/, 'pods section exists');
assert.match(index, /id=\x22math\x22/, 'math section exists');
assert.match(index, /id=\x22sim\x22/, 'simulator section exists');

for (const match of index.matchAll(/(?:href|src)=\x22([^\x22]+)\x22/g)) {
  const ref = match[1];
  if (ref.startsWith('#') || ref === '../') continue;
  assert.ok(!/^(https?:)?\/\//.test(ref), `no runtime external URL: ${ref}`);
  assert.ok(existsSync(join(appDir, ref)), `index reference exists: ${ref}`);
}

const app = readFileSync(join(appDir, 'app.js'), 'utf8');
assert.match(app, /const SHIPS = \[/, 'scenario data exists');
assert.match(app, /Oasis-class diesel/, 'Oasis reference case exists');
assert.match(app, /amps\(/, 'current calculator exists');
assert.match(app, /propAt\(/, 'speed-power model exists');
assert.match(app, /requestAnimationFrame\(loop\)/, 'animation loop exists');
assert.match(app, /drawPower/, 'power chart exists');
assert.match(app, /drawLoss/, 'loss chart exists');
execFileSync(process.execPath, ['--check', join(appDir, 'app.js')], { stdio: 'pipe' });

for (const file of mustExist) {
  const text = readFileSync(join(appDir, file), 'utf8');
  assert.doesNotMatch(text, /https?:\/\//, `${file} has no runtime external URL`);
}

const data = readFileSync(join(root, 'data.js'), 'utf8');
assert.match(data, /slug: ['\x22]cruise-propulsion['\x22]/, 'almanac data contains cruise-propulsion slug');
assert.match(data, /url: ['\x22]https:\/\/0x4d44\.github\.io\/cruise-propulsion\/['\x22]/, 'almanac URL is absolute');

console.log('cruise-propulsion static validation passed');
