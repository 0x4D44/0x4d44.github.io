import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

// Exercise Vite's actual optional-glob transform: injected loaders alone would miss
// a runtime typeof guard which wrongly hides an installed production chunk.
test('production Waverley loader discovers an installed lazy model and retains the missing-module fallback', async () => {
  const pkg = path.resolve(import.meta.dirname, '../..'), root = path.dirname(pkg);
  const scratch = path.join(root, '.scratch'); await mkdir(scratch, { recursive: true });
  const fixture = await mkdtemp(path.join(scratch, 'waverley-bundle-'));
  let source = await readFile(path.join(pkg, 'web/src/waverley.ts'), 'utf8');
  source = source.replaceAll("'./station-resources.ts'", JSON.stringify(path.join(pkg, 'web/src/station-resources.ts')))
    .replaceAll("'../../core/waverley-anchors.ts'", JSON.stringify(path.join(pkg, 'core/waverley-anchors.ts')));
  for (const installed of [false, true]) {
    const dir = path.join(fixture, String(installed)); await mkdir(dir);
    await writeFile(path.join(dir, 'waverley.ts'), source);
    if (installed) {
      await mkdir(path.join(dir, 'data'));
      await writeFile(path.join(dir, 'waverley-scene.ts'), "import {Group} from 'three'; export function buildWaverleyScene(){const group=new Group();group.name='synthetic-public-model';return {group,dispose(){group.removeFromParent();}};}");
      await writeFile(path.join(dir, 'data/waverley-scene.json'), JSON.stringify({ origin: { lat: 0, lon: 0 }, attribution: 'synthetic', rails: [], platforms: [] }));
    }
    const dist = path.join(dir, 'dist');
    const built = await build({ configFile: false, root: dir, logLevel: 'silent',
      resolve: { alias: { three: path.join(pkg, 'node_modules/three/build/three.module.js') } },
      build: { outDir: dist, minify: false, target: 'es2022', lib: { entry: path.join(dir, 'waverley.ts'), formats: ['es'], fileName: () => 'entry.mjs' },
        rolldownOptions: { output: { chunkFileNames: '[name]-[hash].mjs' } } } });
    const module = await import(pathToFileURL(path.join(dist, 'entry.mjs')).href);
    const view = await module.loadWaverleyScene();
    assert.equal(view.placeholder, !installed, 'production default loader did not discover installed optional chunks');
    assert.equal(view.scene.children[0]?.name, installed ? 'synthetic-public-model' : undefined);
    if (installed) assert.ok((Array.isArray(built) ? built : [built]).flatMap(b => b.output).some(c => c.type === 'chunk' && c.isDynamicEntry && c.moduleIds.some(id => id.endsWith('/waverley-scene.ts'))), 'model is a genuine lazy entry');
    view.dispose();
  }
});
