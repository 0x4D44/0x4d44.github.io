// The garment library's numbers as the module the furnishing code imports.
//   node la-ladera/tools/garments_data.mjs > la-ladera/js/interiors/garments_data.js        (after rebuilding the garment manifests)
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-garments.test.mjs checks that the committed module is exactly what this prints (the drift guard).
// Pure functions: `garmentsDataModule(modelsDir)` returns the text of js/interiors/garments_data.js.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MODELS = resolve(HERE, '..', 'assets', 'models');
const STATES = ['flat', 'folded', 'hung'];
const LIBRARIES = [
  { manifest: 'manifest.garments.json', sizeTag: 'adult', palette: 'garments/palette.json', atlas: 'garments/prints.png' },
  { manifest: 'manifest.garments-child.json', sizeTag: 'child', palette: 'garments/palette.json', atlas: 'garments/prints.png' },
  // The teen library keeps every state in one GLB, owns its palette and fabric atlas, and makes each style in two sizes. A size is a design of its own here (id `<style>_<small|big>`),
  // so its record, catalogue key and node all read garment_<style>_<size>_<state> and nothing downstream needs a second index.
  { manifest: 'manifest.garments_teen.json', sizeTag: 'teen', palette: 'garments/teen/palette.json', atlas: 'garments/teen/fabrics.png', sizeClasses: ['small', 'big'] },
];
const m3 = (v) => Math.round(v * 1000) / 1000;
const hex = (s) => '0x' + s.replace('#', '').toLowerCase();

export function garmentsDataModule(modelsDir = MODELS) {
  const read = (p) => JSON.parse(readFileSync(join(modelsDir, p), 'utf8'));
  const asr = read('garments/assortments.json');
  const byId = new Map(), files = {}, colours = new Map();
  for (const source of LIBRARIES) {
    const man = read(source.manifest), pal = read(source.palette), { sizeTag, sizeClasses } = source;
    files[sizeTag] = {};
    if (sizeTag === 'child' && man.sizeTag !== sizeTag) throw new Error(`${source.manifest}: expected sizeTag 'child'`);
    if (sizeTag === 'teen' && (man.set !== 'garments_teen' || man.ageGroup !== sizeTag)) throw new Error(`${source.manifest}: expected the garments_teen set of ageGroup 'teen'`);
    if (man.palette !== source.palette || man.atlas?.file !== source.atlas) throw new Error(`${source.manifest}: the library must use its ${sizeTag === 'teen' ? 'own' : 'shared garment'} palette and atlas (${source.palette}, ${source.atlas})`);
    for (const [id, v] of Object.entries(pal.variants)) {                                          // the colours of every library, one table (an id two libraries share must mean one colour)
      if (colours.has(id) && colours.get(id) !== hex(v.color)) throw new Error(`${source.manifest}: palette variant ${id} has two colours (${colours.get(id)} / ${hex(v.color)})`);
      colours.set(id, hex(v.color));
    }
    for (const f of man.files) for (const [key, a] of Object.entries(f.assets)) {
      const id = sizeClasses ? `${a.garment}_${a.sizeClass}` : a.garment;
      if (!/^[a-z][a-z0-9_]*$/.test(a.garment) || !STATES.includes(a.state) || (sizeClasses && !sizeClasses.includes(a.sizeClass)) || key !== `garment_${id}_${a.state}`) throw new Error(`${source.manifest}: invalid garment key ${key}`);
      if ((sizeTag === 'child' && a.sizeTag !== sizeTag) || (a.sizeTag !== undefined && a.sizeTag !== sizeTag)) throw new Error(`${key}: sizeTag must be '${sizeTag}'`);
      if (sizeTag === 'teen' && a.ageGroup !== sizeTag) throw new Error(`${key}: ageGroup must be '${sizeTag}'`);
      if (a.garment.startsWith('child_') !== (sizeTag === 'child')) throw new Error(`${key}: child_ IDs belong only to the child library`);
      if (!Array.isArray(a.size) || a.size.length !== 3 || a.size.some((n) => !Number.isFinite(n) || n <= 0)) throw new Error(`${key}: invalid measured dimensions`);
      if (!Array.isArray(a.variants) || !a.variants.length || a.variants.some((v) => !Object.hasOwn(pal.variants, v))) throw new Error(`${key}: unknown or empty palette variants`);
      if (typeof a.lod?.glb !== 'string' || !a.lod.glb.trim() || a.lod.node !== `${key}_lod` || !Number.isInteger(a.lod.triangles) || a.lod.triangles <= 0) throw new Error(`${key}: invalid LOD reference`);
      const previousFile = files[sizeTag][a.state];
      if (previousFile && previousFile !== a.lod.glb) throw new Error(`${sizeTag}/${a.state}: more than one LOD pack`);
      files[sizeTag][a.state] = a.lod.glb;
      const g = byId.get(id) ?? { sizeTag, ...(sizeClasses ? { sizeClass: a.sizeClass } : {}), v: a.variants, st: {} };
      if (g.sizeTag !== sizeTag || g.st[a.state]) throw new Error(`${key}: duplicate garment or state`);
      if (JSON.stringify(g.v) !== JSON.stringify(a.variants)) throw new Error(`${a.garment}: the variants differ between states (${g.v} / ${a.variants})`);
      g.st[a.state] = [...a.size.map(m3), a.lod.triangles];
      byId.set(id, g);
    }
    for (const state of STATES) if (!files[sizeTag][state]) throw new Error(`${source.manifest}: missing ${state} LOD pack`);
  }
  const lines = [];
  lines.push('// INTERIORS (A3): adult, child and teen garment manifests, their palettes and the adult assortments as plain data, so the furnishing code');
  lines.push('// in node and in the page knows every garment\'s size tag, dimensions, colours and stock recipes without fetching a manifest. GENERATED, do not edit by hand:');
  lines.push('//   node la-ladera/tools/garments_data.mjs > la-ladera/js/interiors/garments_data.js        (tests/interiors-garments.test.mjs fails when the two differ)');
  lines.push('// Sizes are the library\'s metres [w, h, d] of the model as it stands (a hung one hangs from its top edge: h is its drop) and the triangles of its LOD (the one the interiors draw).');
  lines.push('');
  lines.push(`export const STATES = [${STATES.map((s) => `'${s}'`).join(', ')}];`);
  lines.push('/** LOD packs by size tag and pose, taken from the manifests rather than inferred from an asset name (the teen library keeps all three poses in one file). */');
  lines.push('export const GARMENT_FILES = {');
  for (const { sizeTag } of LIBRARIES) lines.push(`  ${sizeTag}: { ${STATES.map((s) => `${s}: ${JSON.stringify(files[sizeTag][s])}`).join(', ')} },`);
  lines.push('};');
  lines.push('');
  lines.push('/** id -> { sizeTag: adult | child | teen, sizeClass: small | big (teen only: each size is its own id, <style>_<size>), v: colour variants, flat | folded | hung: [w, h, d, LOD triangles] }. Only applicable poses are present. */');
  lines.push('export const GARMENTS = {');
  for (const id of [...byId.keys()].sort()) {
    const g = byId.get(id), parts = [`sizeTag: '${g.sizeTag}'`, ...(g.sizeClass ? [`sizeClass: '${g.sizeClass}'`] : []), `v: ${JSON.stringify(g.v).replace(/"/g, "'").replace(/,/g, ', ')}`];
    for (const s of STATES) if (g.st[s]) parts.push(`${s}: [${g.st[s].join(', ')}]`);
    lines.push(`  ${id}: { ${parts.join(', ')} },`);
  }
  lines.push('};');
  lines.push('');
  lines.push('/** colour variant -> the tint a garment wears (the palettes\' `color`; the print and fabric atlases are not bound in the game). */');
  lines.push('export const VARIANTS = {');
  for (const [id, color] of colours) lines.push(`  ${id}: ${color},`);
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
