// Dump the furniture catalogue (js/interiors/catalog.js) to JSON for the Blender builders, so a model's size is the catalogue's size by construction.
//   node la-ladera/tools/blender/furn_dump_catalog.mjs <out.json>
// Every entry: { size:[w,h,d], arch, tags, mat, cols, seat?, wall?, ceil?, top?, y?, glass?, doors?, ... } (everything JSON-serialisable in the catalogue).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CATALOG } from '../../js/interiors/catalog.js';

export function catalogJson() { return JSON.stringify(CATALOG, null, 0); }

if (import.meta.url === new URL(process.argv[1], 'file://').href || process.argv[1]?.endsWith('furn_dump_catalog.mjs')) {
  const out = resolve(process.argv[2] ?? 'furn_catalog.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, catalogJson());
  console.log(`catalogue: ${Object.keys(CATALOG).length} keys -> ${out}`);
}
