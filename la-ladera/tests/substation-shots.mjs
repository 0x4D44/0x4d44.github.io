// Actual exported GLBs; hidden browser, zero game boot, zero mouse/audio actions.
import './nice.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch } from './chrome.mjs';

const args = process.argv.slice(2), at = args.indexOf('--out');
const out = resolve(at < 0 ? 'la-ladera/dev/substation/contact-sheets' : args[at + 1]); mkdirSync(out, { recursive: true });
const browser = await launch({ width: 1280, height: 900, gpu: 'swiftshader', args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
const evidence = { renderer: 'Three.js r180; SwiftShader; hidden headless Chrome', cameraHeightMetres: 1.6, referenceFigureHeightMetres: 1.8, files: [], items: [] };
try {
  const page = await browser.open('la-ladera/dev/substation/gallery.html', { ready: false });
  await page.waitFor('!!window.substationGalleryReady', 30000);
  await page.eval('window.substationGalleryReady', 180000);
  evidence.sourcePins = await page.eval('window.substationGallery.sourcePins');
  const keys = await page.eval('window.substationGallery.keys');
  for (let start = 0; start < keys.length; start += 6) {
    const subset = keys.slice(start, start + 6), number = Math.floor(start / 6) + 1;
    const result = await page.fn((subset, number) => {
      const sheet = document.createElement('canvas'); sheet.width = 1680; sheet.height = 110 + subset.length * 390;
      const d = sheet.getContext('2d'); d.fillStyle = '#e8e8dd'; d.fillRect(0, 0, sheet.width, sheet.height);
      d.fillStyle = '#213b39'; d.font = 'bold 28px system-ui'; d.fillText(`SUBSTATION LIBRARY / CONTACT SHEET ${number}`, 30, 42);
      d.font = '17px system-ui'; d.fillText('Near detail at 1.6 m eye height     /     Near beside a 1.8 m figure     /     Far LOD beside the same figure', 30, 78);
      const rows = [];
      return (async () => {
        for (let row = 0; row < subset.length; row++) {
          const key = subset[row], variant = key.startsWith('substation_uk_') ? 'uk' : 'co', y = 110 + row * 390;
          for (let view = 0; view < 3; view++) {
            const shot = window.substationGallery.item(key, variant, view === 0 ? 'eye' : 'scale', view === 2);
            const image = new Image(); image.src = shot.image; await image.decode(); d.drawImage(image, 20 + view * 560, y, 520, 330);
            if (view === 0) rows.push({ ...shot, image: undefined });
          }
          d.fillStyle = '#213b39'; d.font = 'bold 17px system-ui'; d.fillText(key, 30, y + 350);
          d.font = '15px system-ui'; const a = window.substationGallery.catalogue.assets[key]; d.fillText(`${a.size.join(' × ')} m / ${variant.toUpperCase()}`, 30, y + 374);
        }
        return { image: sheet.toDataURL('image/jpeg', .92), rows };
      })();
    }, subset, number);
    const name = `items-${String(number).padStart(2, '0')}.jpg`; writeFileSync(resolve(out, name), Buffer.from(result.image.split(',')[1], 'base64')); evidence.files.push(name); evidence.items.push(...result.rows); console.log(`${name}: ${subset.length} designs, eye/figure/far`);
  }
  const compare = await page.fn(async () => {
    const subjects = ['grid_transformer', 'distribution_transformer', 'tower_suspension', 'pole_mv', 'fence_panel', 'building_shell'];
    const sheet = document.createElement('canvas'); sheet.width = 1600; sheet.height = 100 + subjects.length * 450; const d = sheet.getContext('2d');
    d.fillStyle = '#e8e8dd'; d.fillRect(0, 0, sheet.width, sheet.height); d.fillStyle = '#213b39'; d.font = 'bold 29px system-ui'; d.fillText('UNITED KINGDOM / 132–33–11 kV', 25, 45); d.fillText('COLOMBIA / 115–34.5–13.2 kV', 825, 45);
    for (let i = 0; i < subjects.length; i++) for (const [col, variant] of ['uk', 'co'].entries()) {
      const shared = i < 2, key = `substation_${shared ? '' : variant + '_'}${subjects[i]}`;
      const shot = window.substationGallery.item(key, variant, 'scale', false, 750, 400), image = new Image(); image.src = shot.image; await image.decode(); d.drawImage(image, 20 + col * 800, 80 + i * 450);
      d.fillStyle = '#213b39'; d.font = 'bold 18px system-ui'; d.fillText(subjects[i].replaceAll('_', ' '), 30 + col * 800, 510 + i * 450);
    }
    return sheet.toDataURL('image/jpeg', .94);
  });
  writeFileSync(resolve(out, 'uk-colombia.jpg'), Buffer.from(compare.split(',')[1], 'base64')); evidence.files.push('uk-colombia.jpg');
  for (const variant of ['uk', 'co']) {
    const r = await page.fn(v => window.substationGallery.overview(v), variant); const name = `yard-${variant}.jpg`;
    writeFileSync(resolve(out, name), Buffer.from(r.image.split(',')[1], 'base64')); evidence.files.push(name); evidence[variant] = { ...r, image: undefined }; console.log(`${name}: ${r.equipmentInstances} plan instances`);
  }
  evidence.diagnostics = page.summary();
  evidence.rendererString = await browser.renderer();
  evidence.reviewMemoryAudit = await page.eval('window.substationGallery.finishReview()');
  evidence.renderMemory = evidence.reviewMemoryAudit.after;
  if (evidence.renderMemory.textures !== 5) throw new Error('Both variants must share five GPU texture images');
  if (evidence.diagnostics.errors.length || evidence.diagnostics.consoleErrors.length || evidence.diagnostics.netErrors.length) throw new Error(JSON.stringify(evidence.diagnostics));
  writeFileSync(resolve(out, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  await page.eval('window.substationGallery.dispose()'); console.log(`SUBSTATION SHOTS OK: ${keys.length} designs, ${evidence.files.length} sheets`);
} catch (error) { console.error(JSON.stringify(browser.page?.summary?.() ?? {}, null, 2)); throw error; }
finally { await browser.close(); }
