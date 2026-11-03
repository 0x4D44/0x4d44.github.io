// Assets.extend (js/core/assets.js, round 7): a LATER sector merges a manifest list the boot did not read (the beach's props and water sports are not in manifest.json, so the boot neither
// fetches nor parses them) into a registry that is already serving the boot's own. init() is that call for manifest.json's list, so what core-assets.test.mjs holds for init holds for it;
// here: a later list adds to the registry and does not disturb it, its manifests are read together and merged in the listed order (the later declaration of a name wins), one that cannot
// be read costs only itself, and an empty list asks for nothing.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-assets-extend.test.mjs
// Each check has a deliberately wrong extend() selected by AE_SABOTAGE=<id>, and must then FAIL:
//   serial   the manifests are read one after another     replace  the registry is rebuilt from the new list     first  the earlier declaration of a name wins
//   throws   one unreadable manifest rejects the whole call     count  the merged count is not returned     empty  an empty list still asks for the root
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Assets } from '../js/core/assets.js';

const SAB = process.env.AE_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === id);
const BOOT = { 'manifest.json': { files: ['a.json'] }, 'a.json': { files: [{ glb: 'a/one.glb', assets: { chair: { tags: ['seat'] }, table: { node: 'tbl' } } }] } };
const LATER = {
  'd.json': { files: [{ glb: 'd/beach.glb', assets: { bench: { tags: ['beach-prop'] }, chair: { tags: ['beach-prop', 'seat'] } } }] },      // 'chair' again: the later manifest wins
  'e.json': { files: [{ glb: 'e/boats.glb', assets: { dinghy: {}, kayak: { node: 'kyk' } } }] },
};

const REAL = Assets.prototype.extend;

/** Deliberately wrong extend()s: what the real one must not do. */
const WRONG = {
  serial: async function (files, read) { let n = 0; for (const f of files) { const m = await read(f); for (const set of m?.files ?? []) for (const [name, meta] of Object.entries(set.assets ?? {})) { this.entries.set(name, { name, glb: set.glb, node: meta.node ?? name, ...meta }); n++; } } return n; },
  replace: async function (files, read) { this.entries.clear(); return REAL.call(this, files, read); },
  first: async function (files, read) { const before = new Map(this.entries); const n = await REAL.call(this, files, read); for (const [k, v] of before) this.entries.set(k, v); return n; },
  throws: async function (files, read) { const ms = await Promise.all(files.map((f) => read(f))); let n = 0; ms.forEach((m) => { for (const set of m?.files ?? []) for (const [name, meta] of Object.entries(set.assets ?? {})) { this.entries.set(name, { name, glb: set.glb, node: meta.node ?? name, ...meta }); n++; } }); return n; },
  count: async function (files, read) { await REAL.call(this, files, read); return 0; },
  empty: async function (files, read) { await read('manifest.json'); return REAL.call(this, files, read); },
};
if (WRONG[SAB]) Assets.prototype.extend = WRONG[SAB];

const booted = async () => { const a = new Assets({}); await a.init(async (p) => BOOT[p] ?? null); return a; };

test('a later list adds to a booted registry and does not disturb it: the later declaration of a name wins, the new names follow the old, and the call says how many it merged', async () => {
  const a = await booted();
  assert.deepEqual([...a.entries.keys()], ['chair', 'table']);
  const n = await a.extend(['d.json', 'e.json'], async (p) => LATER[p] ?? null);
  assert.equal(n, 4, 'four declarations merged: bench and chair from d.json, dinghy and kayak from e.json');
  assert.deepEqual([...a.entries.keys()], ['chair', 'table', 'bench', 'dinghy', 'kayak'], 'the boot\'s names stay, in their order, and the new ones are appended in the listed order');
  assert.equal(a.meta('table').node, 'tbl', 'an entry the list did not mention is untouched');
  assert.equal(a.meta('chair').glb, 'd/beach.glb', 'the later manifest wins a name that two declare');
  assert.deepEqual(a.names('beach-prop').sort(), ['bench', 'chair'], 'tags are searched over the merged registry');
  assert.equal(a.meta('kayak').node, 'kyk'); assert.equal(a.meta('dinghy').node, 'dinghy', 'the node defaults to the name');
});

test('the listed manifests are all asked for before any answer arrives, and merged in the listed order however they come back', async () => {
  const a = await booted(), asked = [], resolvers = new Map();
  const read = (p) => { asked.push(p); return new Promise((r) => resolvers.set(p, () => r(LATER[p] ?? null))); };
  const done = a.extend(['d.json', 'e.json'], read);
  await Promise.resolve(); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(asked, ['d.json', 'e.json'], 'every manifest it names at once, none waiting for another');
  for (const p of ['e.json', 'd.json']) resolvers.get(p)();                                  // they come back in the other order
  await done;
  assert.deepEqual([...a.entries.keys()], ['chair', 'table', 'bench', 'dinghy', 'kayak'], 'the order is the listed one, not the network\'s');
  assert.equal(a.meta('chair').glb, 'd/beach.glb');
});

test('a manifest that cannot be read costs only itself; an empty list asks for nothing and merges nothing', async () => {
  const a = await booted(), warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try {
    const n = await a.extend(['d.json', 'e.json'], async (p) => { if (p === 'd.json') throw new Error('boom'); return LATER[p] ?? null; });
    assert.equal(n, 2, 'e.json merged');
    assert.deepEqual([...a.entries.keys()], ['chair', 'table', 'dinghy', 'kayak'], 'and d.json cost nothing but itself');
    assert.equal(a.meta('chair').glb, 'a/one.glb', 'the boot\'s chair is the boot\'s, as d.json never arrived');
    assert.equal(warned, 1, 'the failure is reported once');
    let asked = 0;
    assert.equal(await a.extend([], async () => { asked++; return null; }), 0);
    assert.equal(asked, 0, 'an empty list reads no manifest at all');
  } finally { console.warn = warn; }
});

test('init is extend of the root\'s list: the boot reads manifest.json, then merges what it names through the same call', async () => {
  const a = new Assets({}); let got = null;
  const real = a.extend.bind(a);
  a.extend = (files, read) => { got = files; return real(files, read); };
  await a.init(async (p) => BOOT[p] ?? null);
  assert.deepEqual(got, ['a.json'], 'init hands the root\'s list to extend');
  assert.deepEqual([...a.entries.keys()], ['chair', 'table']);
});
