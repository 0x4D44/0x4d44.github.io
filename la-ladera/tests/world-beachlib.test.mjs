// The beach's props library as the world sees it BEFORE it is loaded (A5, js/world/beachlib.js, dev/FEATURE-BEACH.md): the size table the plan of the promenade and its colliders stand on is the
// manifest's, name for name. The library (assets/models/beach_props, manifest.beach_props.json) is a later sector, so its sizes are kept in code; this test is what makes that safe: a library
// that changes size fails here, not in a picture.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-beachlib.test.mjs
// Every check has a deliberately broken input selected by BL_SABOTAGE=<id>|all, and each must then FAIL:
//   size    one size in the table is a centimetre off         extra   the table names a prop the library does not have         missing   the table lacks one the library has
//   boot    the boot manifest lists the beach library         key     the asset key drops its prefix                       frozen   the table can be edited
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../tools/blender/beach_props_validate.mjs';
import { BEACH_MANIFESTS, SIZE, assetKey as realKey, sizeOf } from '../js/world/beachlib.js';

const SAB = process.env.BL_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const models = resolve(ROOT, 'assets/models');

/** The library's near props: { name (no `beach_` prefix) -> size rounded to the centimetre }. */
function libraryOf(file) {
  const out = {};
  for (const f of readJson(resolve(models, file)).files) for (const [id, a] of Object.entries(f.assets)) if (a.tags?.includes('beach-prop')) out[id.replace(/^beach_/, '')] = a.size.map((v) => +v.toFixed(2));
  return out;
}
const lib = libraryOf('manifest.beach_props.json');

/** The table the checks look at: the real one, or a broken copy when BL_SABOTAGE asks. */
function table() {
  const t = { ...SIZE };
  if (on('size')) { const k = Object.keys(t)[7]; t[k] = [t[k][0] + 0.01, t[k][1], t[k][2]]; }
  if (on('extra')) t.zz_not_in_the_library = [1, 1, 1];
  if (on('missing')) delete t[Object.keys(t)[11]];
  return t;
}
const assetKey = on('key') ? (name) => name : realKey;

test('the table is the manifest: every near prop of the library is in it, at the manifest\'s size, and nothing else is', () => {
  const t = table();
  assert.equal(Object.keys(lib).length, 97, 'the library has 97 near props (the Codex handoff)');
  assert.deepEqual(Object.keys(t).sort(), Object.keys(lib).sort(), 'the same names');
  for (const [name, size] of Object.entries(lib)) assert.deepEqual(t[name], size, `${name}: the table says ${t[name]}, the manifest ${size}`);
});

test('the asset key names the prop in ctx.assets, and sizeOf takes a name with or without the prefix', () => {
  const ids = new Set(); for (const f of readJson(resolve(models, 'manifest.beach_props.json')).files) for (const id of Object.keys(f.assets)) ids.add(id);
  for (const name of Object.keys(lib)) assert.ok(ids.has(assetKey(name)), `${name}: the manifest has no asset "${assetKey(name)}"`);
  assert.equal(realKey('kiosk'), 'beach_kiosk');
  assert.deepEqual(sizeOf('beach_kiosk'), sizeOf('kiosk'));
  assert.deepEqual(sizeOf('kiosk'), [3.2, 3, 3.2]);
});

test('the table is frozen, so no code can change a size the colliders were drawn from', () => {
  assert.ok(Object.isFrozen(on('frozen') ? { ...SIZE } : SIZE), 'SIZE is frozen');
  assert.ok(Object.isFrozen(BEACH_MANIFESTS), 'the manifest list is frozen');
});

test('the library is a later sector: its manifest is not in the boot manifest, and the list names one that exists', () => {
  const boot = readJson(resolve(models, 'manifest.json')).files ?? [];
  const listed = on('boot') ? [...boot, ...BEACH_MANIFESTS] : boot;
  for (const m of BEACH_MANIFESTS) {
    assert.ok(readJson(resolve(models, m)).files?.length, `${m} exists and lists files`);
    assert.ok(!listed.includes(m), `${m} must not be in assets/models/manifest.json: it loads once the page is playable (beachprops.js)`);
  }
});
