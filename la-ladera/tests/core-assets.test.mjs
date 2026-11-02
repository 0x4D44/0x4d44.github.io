// The asset registry's manifest reading (js/core/assets.js, owner: A1). Review R2e-001: at 120 ms of latency the thirteen manifests were read one after another, ~2 s of the boot with the
// connection idle, and the first of them could not be asked for until the last module had run. Here: they are read together and merged in the listed order, a manifest that cannot be
// read costs only itself, and the ones index.html asked for early (window.__laderaPre) are handed over once.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-assets.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Assets, takePrefetched } from '../js/core/assets.js';

const SETS = {
  'manifest.json': { files: ['a.json', 'b.json', 'c.json'] },
  'a.json': { files: [{ glb: 'a/one.glb', assets: { chair: { tags: ['seat'] }, table: { node: 'tbl' } } }] },
  'b.json': { files: [{ glb: 'b/two.glb', assets: { chair: { tags: ['seat', 'b'] }, lamp: {} } }] },        // 'chair' again: the later manifest wins, as it did when they were read in turn
  'c.json': { files: [{ glb: 'c/three.glb', assets: { rug: {} } }] },
};

test('the listed manifests are all asked for before any answer arrives, and merged in the listed order', async () => {
  const a = new Assets({}), asked = [], resolvers = new Map();
  const read = (p) => { asked.push(p); return new Promise((r) => resolvers.set(p, () => r(SETS[p] ?? null))); };
  const done = a.init(read);
  await Promise.resolve();
  assert.deepEqual(asked, ['manifest.json'], 'the list itself first');
  resolvers.get('manifest.json')(); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(asked, ['manifest.json', 'a.json', 'b.json', 'c.json'], 'then every manifest it names at once, none waiting for another');
  for (const p of ['c.json', 'a.json', 'b.json']) resolvers.get(p)();                                      // they come back in any order
  await done;
  assert.deepEqual([...a.entries.keys()].sort(), ['chair', 'lamp', 'rug', 'table']);
  assert.equal(a.meta('chair').glb, 'b/two.glb', 'the later manifest in the list wins a name that two declare');
  assert.deepEqual(a.meta('chair').tags, ['seat', 'b']);
  assert.equal(a.meta('table').node, 'tbl'); assert.equal(a.meta('lamp').node, 'lamp', 'the node defaults to the name');
  assert.deepEqual([...a.entries.keys()], ['chair', 'table', 'lamp', 'rug'], 'insertion order is the listed order: furnishing picks from names() and must not change with the network');
});

test('a manifest that fails to read or is malformed costs only itself', async () => {
  const a = new Assets({}), warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try {
    const sets = { ...SETS, 'b.json': 'not an object', 'c.json': { files: [{ glb: 'x.glb', assets: null }] } };
    await a.init(async (p) => { if (p === 'a.json') throw new Error('boom'); return sets[p] ?? null; });
    assert.equal(a.entries.size, 0, 'a threw, b has no files list, c has no assets');
    assert.ok(warned >= 1, 'the failure is reported');
    const b = new Assets({});
    await b.init(async (p) => (p === 'a.json' ? { files: [{ glb: 'g.glb', assets: { ok: {} } }] } : p === 'manifest.json' ? { files: ['a.json', 'b.json'] } : (() => { throw new Error('x'); })()));
    assert.deepEqual([...b.entries.keys()], ['ok'], 'one manifest throwing does not stop the others');
  } finally { console.warn = warn; }
});

test('no manifest list is an empty registry, not an error', async () => {
  const a = new Assets({}); await a.init(async () => null); assert.equal(a.entries.size, 0);
  const b = new Assets({}); await b.init(async () => ({})); assert.equal(b.entries.size, 0);
});

test("a manifest index.html asked for early is taken once, with or without the './'", async () => {
  const saved = globalThis.__laderaPre;
  try {
    globalThis.__laderaPre = { 'assets/models/manifest.json': Promise.resolve({ files: ['a.json'] }), 'assets/models/a.json': Promise.resolve(SETS['a.json']) };
    const a = new Assets({}); await a.init();                                                              // the default reader: it must not touch fetch (there is none in node) for these two
    assert.deepEqual([...a.entries.keys()].sort(), ['chair', 'table']);
    assert.deepEqual(Object.keys(globalThis.__laderaPre), [], 'each answer is handed over once: a second init() asks again');
    globalThis.__laderaPre = { 'assets/textures/manifest.json': 'pending' };
    assert.equal(takePrefetched('./assets/textures/manifest.json'), 'pending');
    assert.equal(takePrefetched('./assets/textures/manifest.json'), null, 'and only once');
    assert.equal(takePrefetched('./assets/models/nothing.json'), null, 'what was not asked for is null: the caller fetches it');
  } finally { globalThis.__laderaPre = saved; }
});

test('an early request that came back empty is asked for again, once, by the default reader (review R2b-001)', async () => {
  const savedPre = globalThis.__laderaPre, savedFetch = globalThis.fetch, urls = [];
  try {
    globalThis.__laderaPre = { 'assets/models/manifest.json': Promise.resolve(null), 'assets/models/a.json': Promise.reject(new Error('socket')) };    // index.html's get() resolves null on failure
    globalThis.fetch = async (u) => { urls.push(String(u)); const k = String(u).split('/').pop(); return { ok: k in SETS, json: async () => SETS[k] }; };
    const a = new Assets({}); await a.init();
    assert.deepEqual(urls.slice(0, 2), ['./assets/models/manifest.json', './assets/models/a.json'], 'each failed early answer is fetched again');
    assert.deepEqual([...a.entries.keys()].sort(), ['chair', 'lamp', 'rug', 'table'], 'and the registry is whole');
  } finally { globalThis.__laderaPre = savedPre; globalThis.fetch = savedFetch; }
});
