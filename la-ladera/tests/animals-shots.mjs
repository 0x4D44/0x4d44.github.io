// Real WebGL evidence for the committed animal library; quiet Chrome wrapper only.
//   node la-ladera/tests/animals-shots.mjs [outDir]
//   CHROME_PATH=/path/to/chrome node la-ladera/tests/animals-shots.mjs
// Each animal gets two different sampled poses for each clip and a far silhouette.
// A labelled contact sheet and JSON report preserve the exact GLB paths, clip times,
// material names and measured skinned-vertex motion. Screenshots do not establish an aesthetic score.
import { launch, REPO } from './chrome.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';

const outDir = resolve(process.argv[2] ?? resolve(REPO, 'la-ladera/dev/evidence/animals'));
const keys = ['dog', 'cat', 'pigeon', 'hen', 'mule', 'parrot_caged', 'canary_caged'];
const clips = ['idle', 'walk', 'eat'];
const report = { kind: 'actual WebGL animal GLB pose captures', manifest: 'la-ladera/assets/models/manifest.animals.json', shots: [], motion: [], assets: {}, checks: {} };
let browser;
await mkdir(outDir, { recursive: true });
try {
  const manifestBytes = await readFile(resolve(REPO, report.manifest));
  report.manifestSHA256 = createHash('sha256').update(manifestBytes).digest('hex');
  const manifest = JSON.parse(manifestBytes);
  for (const key of keys) {
    const entry = manifest.animals[key];
    assert.ok(entry, `${key}: manifest entry missing`);
    report.assets[key] = {};
    for (const field of ['glb', 'lod']) {
      const bytes = await readFile(resolve(REPO, 'la-ladera/assets/models', entry[field]));
      report.assets[key][field] = { path: entry[field], bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
  }
  browser = await launch({ width: 960, height: 760, gpu: process.env.ANIMALS_GPU ?? 'swiftshader' });
  const p = await browser.open('la-ladera/labs/animals.html', { ready: false });
  await p.waitFor('!!window.__animals?.ready');
  report.boot = await p.eval('window.__animals.ready');
  assert.deepEqual(report.boot.keys, keys);
  report.renderer = await browser.renderer();
  await p.eval('window.__animals.capture(true)');
  const contactPhases = {};
  for (const key of keys) {
    contactPhases[key] = {};
    const near = await p.fn((k) => window.__animals.setAnimal(k), key);
    assert.ok(near.triangles > 0 && near.triangles <= 3000, `${key}: near triangle budget`);
    assert.ok(near.materials.length > 0, `${key}: no materials`);
    report.assets[key].near = near;
    for (const clip of clips) {
      const motion = await p.fn((c) => window.__animals.sampleClip(c), clip);
      assert.notEqual(motion.signatures[0], motion.signatures[1], `${key}/${clip}: animation does not change visible vertices`);
      assert.ok(motion.maxDisplacementMetres > 1e-6, `${key}/${clip}: animation is static`);
      report.motion.push(motion);
      contactPhases[key][clip] = motion.phases[1];
      const hashes = [];
      for (let i = 0; i < motion.phases.length; i++) {
        const label = i === 0 ? 'pose A' : 'pose B';
        const pose = await p.fn((c, phase, text) => window.__animals.setPose(c, phase, text), clip, motion.phases[i], label);
        await p.eval('window.__animals.render()');
        const file = `${key}-${clip}-${i === 0 ? 'a' : 'b'}.jpg`;
        const fullPath = resolve(outDir, file);
        await p.pageShot(fullPath);
        const jpeg = await readFile(fullPath), sha256 = createHash('sha256').update(jpeg).digest('hex');
        assert.ok(jpeg.length > 1000, `${file}: empty screenshot`);
        hashes.push(sha256);
        report.shots.push({ ...pose, sourceGLB: pose.file, file, sha256, bytes: jpeg.length });
      }
      assert.notEqual(hashes[0], hashes[1], `${key}/${clip}: identical screenshot files`);
    }
    const far = await p.fn((k) => window.__animals.setAnimal(k, 'far'), key);
    assert.ok(far.triangles > 0 && far.triangles <= 300, `${key}: far triangle budget`);
    report.assets[key].far = far;
    await p.eval('window.__animals.render()');
    const file = `${key}-far.jpg`;
    await p.pageShot(resolve(outDir, file));
    report.shots.push({ ...far, sourceGLB: far.file, file });
  }
  await p.viewport(1440, 2130);
  report.contact = await p.fn((phases) => window.__animals.contact(phases), contactPhases);
  await p.eval('window.__animals.render()');
  const layout = await p.eval('({height: document.querySelector("main").getBoundingClientRect().bottom, viewport: innerHeight, cards: document.querySelectorAll("figure").length})');
  assert.equal(layout.cards, 21, 'Contact sheet must show all 7 animals × 3 clips');
  assert.ok(layout.height <= layout.viewport, `Contact sheet is clipped (${layout.height} > ${layout.viewport})`);
  await p.pageShot(resolve(outDir, 'contact-sheet.jpg'));
  report.shots.push({ file: 'contact-sheet.jpg', cards: 21, width: 1440, height: 2130 });
  report.counters = await p.eval('window.__animals.counters()');
  report.page = p.summary();
  assert.deepEqual(report.counters.materialWarnings, [], 'Unknown material names');
  assert.deepEqual(report.page.errors, [], 'Browser exceptions');
  assert.deepEqual(report.page.netErrors, [], 'Failed network requests');
  assert.deepEqual(report.page.consoleErrors, [], 'Browser console errors');
  report.checks = { allSevenAnimals: true, allThreeClipsMoveGeometry: true, twoDifferentPosesPerClip: true, nearBudget: true, farBudget: true, completeContactSheet: true, cleanBrowser: true };
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.fatal = error.stack ?? String(error);
} finally {
  await browser?.close();
  await writeFile(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ ok: report.ok, output: relative(REPO, outDir), shots: report.shots.length, animatedClips: report.motion.length, renderer: report.renderer, checks: report.checks, ...(report.fatal ? { fatal: report.fatal } : {}) }, null, 2));
if (!report.ok) process.exitCode = 1;
