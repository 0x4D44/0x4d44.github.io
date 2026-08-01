'use strict';

const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const here = __dirname;
const repoRoot = join(here, '..');
const dataSource = readFileSync(join(repoRoot, 'data.js'), 'utf8');
const indexSource = readFileSync(join(here, 'index.html'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(dataSource, context, { filename: 'data.js' });

const entry = context.window.ESSAYS.find(item => item.slug === 'stratego');
const gameShelf = context.window.COLLECTIONS.find(collection => collection.id === 'games');

test('Stratego is registered once as a published games/history entry', () => {
  assert.equal(context.window.ESSAYS.filter(item => item.slug === 'stratego').length, 1);
  assert.ok(entry);
  assert.equal(entry.url, 'https://0x4d44.github.io/stratego/');
  assert.equal(entry.illustration, 'ill-cards');
  assert.equal(entry.real, true);
  assert.deepEqual(Array.from(entry.tags), ['games', 'history']);
});

test('Stratego is explicitly placed in The Games Room', () => {
  assert.ok(gameShelf, 'Games Room collection is missing');
  assert.equal(gameShelf.slugs.filter(slug => slug === 'stratego').length, 1);
  assert.equal(gameShelf.slugs[0], 'stratego');
});

test('the document is self-contained and opts into shared Almanac navigation', () => {
  for (const path of ['index.html', 'styles.css', 'stratego-core.js', 'stratego-ai.js', 'app.js']) {
    assert.equal(existsSync(join(here, path)), true, `${path} is missing`);
  }
  assert.match(indexSource, /<script defer src="\/almanac-back\.js"><\/script>/);
  assert.doesNotMatch(indexSource, /<(?:script|link|img|audio|video|source)[^>]+(?:src|href)=["']https?:\/\//i);
  assert.doesNotMatch(indexSource, /target=["']_blank["']/i);
});

test('catalog slugs remain unique and every collection reference resolves', () => {
  const slugs = context.window.ESSAYS.map(item => item.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  const known = new Set(slugs);
  for (const collection of context.window.COLLECTIONS) {
    for (const slug of collection.slugs) assert.equal(known.has(slug), true, `${collection.id} references unknown slug ${slug}`);
  }
});
