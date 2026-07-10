'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const html = read('index.html');
const app = read('app.js');
const worker = read('sw.js');

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`✓ ${name}\n`);
  } catch (error) {
    process.stderr.write(`✗ ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

function matches(source, expression) {
  return Array.from(source.matchAll(expression), (match) => match[1]);
}

test('HTML has one copy of every id', () => {
  const ids = matches(html, /\sid=["']([^"']+)["']/g);
  assert(ids.length > 40, 'expected the complete application shell');
  assert.equal(new Set(ids).size, ids.length, 'duplicate id found');
});

test('every app id lookup resolves in the document', () => {
  const ids = new Set(matches(html, /\sid=["']([^"']+)["']/g));
  const queried = new Set(matches(app, /\$\('#([^']+)'\)/g));
  const missing = Array.from(queried).filter((id) => !ids.has(id));
  assert.deepEqual(missing, []);
});

test('all local document assets exist', () => {
  const references = matches(html, /\s(?:src|href)=["']([^"']+)["']/g)
    .filter((value) => !/^(?:https?:|data:|#|mailto:|\.\.\/)/.test(value));
  const missing = references
    .map((value) => value.split(/[?#]/, 1)[0])
    .filter(Boolean)
    .filter((value) => !fs.existsSync(path.join(ROOT, value)));
  assert.deepEqual(missing, []);
});

test('manifest describes a local standalone app', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'Tidecall');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert(Array.isArray(manifest.icons) && manifest.icons.length > 0);
});

test('service worker precaches every runtime file', () => {
  for (const asset of ['index.html', 'styles.css', 'engine.js', 'app.js', 'manifest.webmanifest', 'icon.svg']) {
    assert(worker.includes(`./${asset}`), `${asset} is not precached`);
  }
});

test('service worker only retires Tidecall caches', () => {
  assert.match(worker, /const CACHE_PREFIX = ['"]tidecall-['"]/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE/);
  assert.doesNotMatch(worker, /keys\.filter\(\(key\) => key !== CACHE\)/);
});

test('the page has no external runtime dependency', () => {
  const externalScripts = matches(html, /<script[^>]+src=["'](https?:\/\/[^"']+)["']/g);
  const externalStyles = matches(html, /<link[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*rel=["']stylesheet["']/g);
  assert.deepEqual(externalScripts, []);
  assert.deepEqual(externalStyles, []);
});

if (!process.exitCode) process.stdout.write('\nAll Tidecall static checks passed.\n');
