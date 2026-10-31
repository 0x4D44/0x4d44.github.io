// Part A ships garment objects/data without registering them in the game.
// Prove the existing game still boots while garment GLBs are unavailable.
// This is an unchanged-game availability check, not a new loader integration test.
// Run through tools/nice.mjs; Chrome is always headless through chrome.mjs.
//   node la-ladera/tools/nice.mjs node la-ladera/tests/garments-fallback.mjs --json .scratch/garments/fallback.json
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { launch, REPO } from './chrome.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = argv.indexOf('--' + name);
  return at < 0 ? fallback : argv[at + 1];
};
const output = resolve(opt('json', '.scratch/garments/fallback.json'));
const report = {
  scope: 'Part A data-only library; the game does not register or request garment GLBs',
  unavailableMode: 'CDP Network.setBlockedURLs, applied before navigating the game',
  viewport: [800, 450],
  failures: [],
};
let browser;
try {
  const models = resolve(REPO, 'la-ladera/assets/models');
  const manifest = JSON.parse(await readFile(resolve(models, 'manifest.garments.json'), 'utf8'));
  const entry = manifest.files?.find((file) => typeof file.glb === 'string');
  if (!entry) throw new Error('The generated garment manifest has no GLB file; no availability proof is possible.');
  const assetPath = resolve(models, entry.glb);
  if (!assetPath.startsWith(models + sep)) throw new Error('Garment GLB must be inside assets/models.');
  const file = await stat(assetPath);
  if (!file.isFile() || file.size === 0) throw new Error('The positive-control garment GLB is missing or empty.');
  report.controlAsset = { glb: entry.glb, bytes: file.size };

  browser = await launch({ width: 800, height: 450 });
  report.renderer = await browser.renderer();
  const page = browser.page;
  // Preserve the harness's event processing while observing the protocol's
  // structured blockedReason. Some Chrome versions leave errorText empty.
  const loadingFailures = [];
  const harnessListener = page.b.listeners.get(page.sid);
  if (typeof harnessListener !== 'function') throw new Error('The Chrome harness has no page event listener.');
  page.b.listeners.set(page.sid, (message) => {
    if (message.method === 'Network.loadingFailed') loadingFailures.push(message.params);
    harnessListener(message);
  });
  const assetURL = browser.baseUrl + '/la-ladera/assets/models/' + entry.glb;
  report.blockedPatterns = ['*garments_*.glb', '*/assets/models/garments/*.glb', assetURL];
  await page.send('Network.setBlockedURLs', { urls: report.blockedPatterns });
  const started = Date.now();
  await page.goto(browser.baseUrl + '/la-ladera/index.html?autostart&manual&dpr=1');
  const state = await page.eval('__ladera.state()');
  const stateErrorDetails = await page.eval('__ladera.errors()');
  const summary = page.summary();
  const requests = [...page.reqs.values()];
  const isGarment = (url) => url.includes('/assets/models/garments/') || /garments_[^/]*\.glb(?:[?#]|$)/.test(url);
  report.boot = {
    ready: true,
    seconds: +((Date.now() - started) / 1000).toFixed(2),
    stateErrors: state.errors,
    stateErrorDetails,
    pageErrors: [...summary.errors],
    consoleErrors: [...summary.consoleErrors],
    consoleWarnings: [...summary.consoleWarnings],
    networkErrors: [...summary.netErrors],
    garmentRequests: requests.filter(isGarment),
    drawCalls: state.drawCalls,
    triangles: state.triangles,
  };
  if (state.errors !== 0 || summary.errors.length || summary.consoleErrors.length || summary.netErrors.length) {
    report.failures.push('The unchanged game produced a boot, console, or network error.');
  }
  if (!(state.drawCalls > 0 && state.triangles > 0)) report.failures.push('The ready game did not report a rendered initial frame.');
  if (report.boot.garmentRequests.length) report.failures.push('Part A unexpectedly caused the game to request garment GLBs.');

  // Challenge the block after taking the clean boot snapshot. The requested
  // file is present on disk, same-origin, and served by the existing harness.
  // Its intentional network/console failure is recorded separately from boot.
  const netBefore = page.netErrors.length;
  report.positiveControl = await page.eval(`fetch(${JSON.stringify(assetURL)}).then(
    (response) => ({ rejected: false, status: response.status }),
    (error) => ({ rejected: true, name: error.name, message: error.message })
  )`);
  report.positiveControl.networkErrors = page.netErrors.slice(netBefore);
  report.positiveControl.requestRecorded = [...page.reqs.values()].includes(assetURL);
  report.positiveControl.loadingFailures = loadingFailures
    .filter((failure) => page.reqs.get(failure.requestId) === assetURL)
    .map(({ errorText, blockedReason, canceled, type }) => ({ errorText, blockedReason, canceled, type }));
  report.positiveControl.blockedByInspector = report.positiveControl.loadingFailures.some((failure) =>
    failure.blockedReason === 'inspector' || String(failure.errorText ?? '').includes('ERR_BLOCKED_BY_CLIENT'));
  if (!report.positiveControl.rejected || !report.positiveControl.requestRecorded ||
      !report.positiveControl.blockedByInspector) {
    report.failures.push('The positive control did not demonstrate an unavailable garment GLB.');
  }
} catch (error) {
  report.failures.push(String(error?.stack ?? error));
} finally {
  if (browser) await browser.close();
}
report.passed = report.failures.length === 0;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
