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
const localRefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]).filter(h => !h.startsWith('http') && !h.startsWith('#') && !h.startsWith('../'));
for (const ref of localRefs) {
  if (!existsSync(join(root, ref))) throw new Error(`broken local ref: ${ref}`);
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
