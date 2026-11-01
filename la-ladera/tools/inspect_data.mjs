// The close-inspection library's numbers and its id bindings as the module the furnishing code imports.
//   node la-ladera/tools/inspect_data.mjs > la-ladera/js/interiors/inspect_data.js        (after the library was rebuilt, or js/interiors/inspect-bindings.json changed)
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-inspect-wiring.test.mjs checks that the committed module is exactly what this prints (the drift guard).
// Pure functions: `inspectDataModule(root)` returns the text of js/interiors/inspect_data.js.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');
const m4 = (v) => Math.round(v * 10000) / 10000;

export function inspectDataModule(root = ROOT) {
  const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  const man = read('assets/models/manifest.inspect.json'), bind = read('js/interiors/inspect-bindings.json');
  const assets = new Map();
  for (const f of man.files) for (const [key, a] of Object.entries(f.assets)) if (!a.lodOf) assets.set(key, a);
  const lines = [];
  lines.push('// INTERIORS (A3): the close-inspection library as plain data (assets/models/manifest.inspect.json, js/interiors/inspect-bindings.json), so the furnishing code, in node and in the page,');
  lines.push('// knows every model\'s size and which find, paper or ordinary thing of the game it stands for without fetching a manifest. GENERATED, do not edit by hand:');
  lines.push('//   node la-ladera/tools/inspect_data.mjs > la-ladera/js/interiors/inspect_data.js        (tests/interiors-inspect-wiring.test.mjs fails when the two differ)');
  lines.push('// Sizes are the models\' metres [w, h, d] as modelled (+Y up, +Z front, pivot at the centre of the box); `tris` and `calls` are the detail model\'s triangles and draw calls.');
  lines.push('');
  lines.push('/** asset key -> { s: [w, h, d], tris, calls }. */');
  lines.push('export const INSPECT = {');
  for (const key of [...assets.keys()].sort()) {
    const a = assets.get(key);
    lines.push(`  ${key}: { s: [${a.size.map(m4).join(', ')}], tris: ${a.triangles}, calls: ${a.drawCalls} },`);
  }
  lines.push('};');
  lines.push('');
  lines.push('/** id of a find (finds.js), a paper (papers.js) or an ordinary thing (props.js ITEMS) -> the asset that draws it. */');
  lines.push('export const BINDINGS = {');
  for (const id of Object.keys(bind.bindings).sort()) {
    const b = bind.bindings[id];
    if (!assets.has(b.asset)) throw new Error(`${id}: binds the unknown asset ${b.asset}`);
    lines.push(`  ${id}: '${b.asset}',`);
  }
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(inspectDataModule(process.argv[2] ? resolve(process.argv[2]) : ROOT));
