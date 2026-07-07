import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
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
console.log('wifi-cartographer discovery page static validation passed');
