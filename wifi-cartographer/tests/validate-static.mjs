import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { validatorRoot } from './path.mjs';
const root = validatorRoot(import.meta.url);
const required = ['index.html', 'styles.css', 'app.js'];
for (const file of required) {
  if (!existsSync(join(root, file))) throw new Error(`missing ${file}`);
}
const html = readFileSync(join(root, 'index.html'), 'utf8');
const checks = [
  'Wi‑Fi Cartographer',
  'native Android',
  'Why native Android?',
  'Private by default',
  'Permissions, in context',
  'Android limitations',
  'JSONL',
  'CSV',
  'GeoJSON',
  'APK build artifacts',
  'no telemetry',
];
for (const text of checks) {
  if (!html.includes(text)) throw new Error(`missing required copy: ${text}`);
}
// A ref starting with "/" is site-absolute — it resolves against the repo root
// (which is what GitHub Pages serves), not against this document's directory.
const localRefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]).filter(h => !h.startsWith('http') && !h.startsWith('#') && !h.startsWith('../'));
for (const ref of localRefs) {
  const resolved = ref.startsWith('/') ? join(root, '..', ref.slice(1)) : join(root, ref);
  if (!existsSync(resolved)) throw new Error(`broken local ref: ${ref}`);
}

// The shared back button. Catalog links open in the same tab, so this pill is
// the reader's only way back to "/". It is defined once at the repo root and
// every document opts in with this one line — see CLAUDE.md, "Site navigation".
if (!/<script defer src="\/almanac-back\.js"><\/script>/.test(html)) {
  throw new Error('missing the shared /almanac-back.js include before </body>');
}
// ...and nothing of our own may sit under it. The pill is fixed at the top-left
// (roughly x max(10px,safe-area-left)..+102px, y 10..39) at a z-index nothing on
// the page can beat, so a control placed there is not merely obscured — it is
// untappable, and the tap navigates to the catalog instead (ALM-BUG-KILN-00039).
// This document's own duplicate "0x4D44 Almanac" breadcrumb link sat exactly there.
if (/<a[^>]+href="\.\.\/"/.test(html)) {
  throw new Error('the document must not ship its own back link: it duplicates the shared pill and sits under it');
}

const catalog = {};
runInNewContext(readFileSync(join(root, '..', 'data.js'), 'utf8'), { window: catalog });
const entry = catalog.ESSAYS.find(item => item.slug === 'wifi-cartographer');
if (!entry) throw new Error('wifi-cartographer is missing from the root catalog');
if (entry.url !== 'https://0x4d44.github.io/wifi-cartographer/') {
  throw new Error('wifi-cartographer catalog URL is incorrect');
}
const entryTags = entry.tags || (entry.tag ? [entry.tag] : []);
for (const tag of entryTags) {
  if (!catalog.TAGS.includes(tag)) throw new Error(`unknown wifi-cartographer catalog tag: ${tag}`);
}
if (!catalog.COLLECTIONS.some(collection => collection.slugs.includes(entry.slug))) {
  throw new Error('wifi-cartographer is missing from the curated shelves');
}

console.log('wifi-cartographer discovery page static validation passed');
