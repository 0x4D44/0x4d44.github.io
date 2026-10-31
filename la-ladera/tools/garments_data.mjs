// The garment library's numbers as the module the furnishing code imports.
//   node la-ladera/tools/garments_data.mjs > la-ladera/js/interiors/garments_data.js        (after the library was rebuilt: manifest.garments.json, palette.json, assortments.json)
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-garments.test.mjs checks that the committed module is exactly what this prints (the drift guard).
// Pure functions: `garmentsDataModule(modelsDir)` returns the text of js/interiors/garments_data.js.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MODELS = resolve(HERE, '..', 'assets', 'models');
const STATES = ['flat', 'folded', 'hung'];
const m3 = (v) => Math.round(v * 1000) / 1000;
const hex = (s) => '0x' + s.replace('#', '').toLowerCase();

export function garmentsDataModule(modelsDir = MODELS) {
  const read = (p) => JSON.parse(readFileSync(join(modelsDir, p), 'utf8'));
  const man = read('manifest.garments.json'), pal = read('garments/palette.json'), asr = read('garments/assortments.json');
  const byId = new Map();
  for (const f of man.files) for (const a of Object.values(f.assets)) {
    const g = byId.get(a.garment) ?? { v: a.variants, st: {} };
    if (JSON.stringify(g.v) !== JSON.stringify(a.variants)) throw new Error(`${a.garment}: the variants differ between states (${g.v} / ${a.variants})`);
    g.st[a.state] = [...a.size.map(m3), a.lod.triangles];
    byId.set(a.garment, g);
  }
  const lines = [];
  lines.push('// INTERIORS (A3): the garment library as plain data (assets/models/manifest.garments.json, garments/palette.json, garments/assortments.json), so the furnishing code,');
  lines.push('// in node and in the page, knows every garment\'s size, colours and stock recipes without fetching a manifest. GENERATED, do not edit by hand:');
  lines.push('//   node la-ladera/tools/garments_data.mjs > la-ladera/js/interiors/garments_data.js        (tests/interiors-garments.test.mjs fails when the two differ)');
  lines.push('// Sizes are the library\'s metres [w, h, d] of the model as it stands (a hung one hangs from its top edge: h is its drop) and the triangles of its LOD (the one the interiors draw).');
  lines.push('');
  lines.push(`export const STATES = [${STATES.map((s) => `'${s}'`).join(', ')}];`);
  lines.push('/** id -> { v: colour variants the model may wear, flat | folded | hung: [w, h, d, LOD triangles] }. A stiff hat has no folded state. */');
  lines.push('export const GARMENTS = {');
  for (const id of [...byId.keys()].sort()) {
    const g = byId.get(id), parts = [`v: ${JSON.stringify(g.v).replace(/"/g, "'").replace(/,/g, ', ')}`];
    for (const s of STATES) if (g.st[s]) parts.push(`${s}: [${g.st[s].join(', ')}]`);
    lines.push(`  ${id}: { ${parts.join(', ')} },`);
  }
  lines.push('};');
  lines.push('');
  lines.push('/** colour variant -> the tint a garment wears (palette.json `color`; the prints atlas is not bound in the game). */');
  lines.push('export const VARIANTS = {');
  for (const [id, v] of Object.entries(pal.variants)) lines.push(`  ${id}: ${hex(v.color)},`);
  lines.push('};');
  lines.push('');
  lines.push('/** assortments.json: id, kind, the host catalogue keys, and the stock as [asset, variant, count]. */');
  lines.push('export const ASSORTMENTS = [');
  for (const b of asr.bindings) {
    const items = b.items.map((i) => `[${JSON.stringify(i.asset).replace(/"/g, "'")}, ${JSON.stringify(i.variant).replace(/"/g, "'")}, ${i.count}]`).join(', ');
    lines.push(`  { id: '${b.id}', kind: '${b.kind}', keys: ${JSON.stringify(b.catalogueKeys).replace(/"/g, "'").replace(/,/g, ', ')}, items: [${items}] },`);
  }
  lines.push('];');
  lines.push('');
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(garmentsDataModule(process.argv[2] ? resolve(process.argv[2]) : MODELS));
