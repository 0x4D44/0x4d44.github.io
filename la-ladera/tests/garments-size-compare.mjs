// The child / teen / adult size contact sheet: dev/garments/size-compare.html rendered in headless Chrome, saved with the measured sizes of every cell.
// CHROME_PATH=/path/to/chrome node la-ladera/tests/garments-size-compare.mjs [--out la-ladera/dev/garments/teen-evidence] [--gpu swiftshader]
import './nice.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { launch } from './chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const out = resolve(option('out', 'la-ladera/dev/garments/teen-evidence'));
await mkdir(out, { recursive: true });
let browser;
try {
  browser = await launch({ width: 1600, height: 1000, gpu: option('gpu', 'swiftshader') });
  const page = await browser.open('la-ladera/dev/garments/size-compare.html', { ready: false });
  await page.waitFor('!!window.__sizeCompare');
  const result = await page.eval('window.__sizeCompare');
  if (!result.ready) throw new Error(result.error);
  if (!result.dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('expected an actual rendered JPEG');
  const bytes = Buffer.from(result.dataUrl.split(',')[1], 'base64');
  if (bytes.length < 20000) throw new Error('suspiciously empty sheet');
  const problems = [...page.summary().errors, ...page.summary().netErrors, ...page.summary().consoleErrors];
  if (problems.length) throw new Error(`browser errors: ${problems.join('\n')}`);
  for (const c of result.cells) for (let i = 0; i < 2; i++) if (Math.abs(c.measuredCm[i] - c.dataCm[i]) > Math.max(0.6, 0.06 * c.dataCm[i])) throw new Error(`${c.key}: drawn ${c.measuredCm} cm, the data says ${c.dataCm} cm`);
  await writeFile(join(out, 'contact-sizes-all.jpg'), bytes);
  await writeFile(join(out, 'contact-sizes-all.json'), JSON.stringify({ renderer: await browser.renderer(), threeRevision: result.revision, pxPerMetre: result.pxPerMetre, cells: result.cells }, null, 2) + '\n');
  console.log(`PASS: ${result.cells.length} models at ${result.pxPerMetre} px per metre, ${bytes.length} bytes`);
} catch (error) { console.error(error.stack || String(error)); process.exitCode = 1; }
finally { await browser?.close(); }
