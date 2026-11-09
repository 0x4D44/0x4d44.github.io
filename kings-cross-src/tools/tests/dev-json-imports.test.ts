// The dev server's JSON imports (vite.config.ts): the attribute that Node needs and the browser refuses from Vite's dev server (it serves a JSON module as JavaScript).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { devJsonImports, dropJsonImportAttributes } from '../../vite.config.ts';

const call = (args: string): string => `const [{ default: a }, { default: b }] = await Promise.all([import(${args}), import('./other.ts')]);`;

test('dropJsonImportAttributes: a dynamic import of a literal specifier loses { with: { type: "json" } }, however it is written, and nothing else changes', () => {
  const lines = [
    ["'./a.json',{with:{type:'json'}}", "'./a.json'"],
    ['"./a.json", { with: { type: "json" } }', '"./a.json"'],
    ["'./a.json' , {\n  with : {\n type : 'json' ,\n },\n},\n", "'./a.json'"],
    ["'./a.json', { with: { type: 'json' } },", "'./a.json'"],
  ] as const;
  for (const [args, kept] of lines) assert.equal(dropJsonImportAttributes(call(args)), call(kept), args);
  const two = `const [x, y] = await Promise.all([import('./a.json', { with: { type: 'json' } }), import('./b.json', { with: { type: 'json' } })]);\nexport const k = 1;`;
  assert.equal(dropJsonImportAttributes(two), `const [x, y] = await Promise.all([import('./a.json'), import('./b.json')]);\nexport const k = 1;`);
});

test('dropJsonImportAttributes: what is not a dynamic JSON import is left as written', () => {
  const same = [
    call("'./a.json'"), // (no attribute)
    call("'./a.css', { with: { type: 'css' } }"), // (another attribute)
    call("'./a.json', { with: { type: 'json', other: 'x' } }"), // (more than the one)
    call("'./a.json', { assert: { type: 'json' } }"),
    call("name, { with: { type: 'json' } }"), // (a specifier that is not a literal)
    call("`./${n}.json`, { with: { type: 'json' } }"),
    "import a from './a.json' with { type: 'json' };\nexport { a };", // (a static import: Vite drops its attribute itself)
    "const s = \"import('./a.json', { with: { type: 'json' } })\"; // import('./b.json', { with: { type: 'json' } })",
    'export const x = 1;',
  ];
  for (const code of same) assert.equal(dropJsonImportAttributes(code), code, code);
});

test('dropJsonImportAttributes: a second pass changes nothing', () => {
  const once = dropJsonImportAttributes(call("'./a.json', { with: { type: 'json' } }"));
  assert.equal(dropJsonImportAttributes(once), once);
});

test('devJsonImports: a dev-server plugin that runs after the transpile and before Vite reads the imports, for script files, and says nothing when it changes nothing', () => {
  const plugin = devJsonImports();
  assert.equal(plugin.apply, 'serve', 'the build keeps the attribute (rollup reads it and bundles the JSON)');
  assert.equal(plugin.enforce, 'post');
  const transform = plugin.transform as (this: unknown, code: string, id: string) => { code: string; map: null } | null;
  const src = call("'./a.json', { with: { type: 'json' } }");
  assert.deepEqual(transform.call({}, src, '/w/src/x.ts?t=1'), { code: call("'./a.json'"), map: null });
  assert.equal(transform.call({}, call("'./a.json'"), '/w/src/x.ts'), null);
  assert.equal(transform.call({}, src, '/w/src/x.css'), null, 'only script files');
  assert.equal(transform.call({ warn() {} }, 'import(', '/w/src/x.ts'), null, 'a file it cannot parse is left as it was');
});

test('the dev server serves waverley-scene.ts with no attribute on its JSON imports (the browser refuses a JSON import that arrives as JavaScript)', async () => {
  const server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../../web', import.meta.url)), // (the config's own root, 'web', is relative to the working directory)
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const served = await server.transformRequest('/src/waverley-scene.ts');
    assert.ok(served, 'waverley-scene.ts is served');
    const imports = [...served.code.matchAll(/import\(\s*"([^"]*\.json[^"]*)"([^)]*)\)/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(imports, [['/src/data/waverley-scene.json?import', ''], ['/src/data/waverley-terrain.json?import', '']], served.code.split('\n').find((l) => l.includes('.json')) ?? '');
    const data = await server.transformRequest('/src/data/waverley-terrain.json?import');
    assert.ok(/^export default /m.test(data?.code ?? ''), 'and the JSON arrives as a module with a default export, as the import reads it');
  } finally {
    await server.close();
  }
});
