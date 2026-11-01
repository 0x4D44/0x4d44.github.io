// Contact sheet of every actual near/far vehicle, using the runtime material library and original external atlas.
// node la-ladera/tools/nice.mjs node la-ladera/tests/vehicles-gallery.mjs [--out path.jpg]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { launch } from './chrome.mjs';

const args = process.argv.slice(2), at = args.indexOf('--out');
const output = resolve(at < 0 ? '.scratch/vehicles/catalogue.jpg' : args[at + 1]);
const browser = await launch({ width: 1280, height: 720 });
try {
  const page = await browser.open('la-ladera/index.html?autostart&manual&quality=high&audio=0', { timeout: 600000 });
  const result = await page.fn(async () => {
    const ctx = __ladera.ctx, T = ctx.THREE, keys = [...(ctx.vehicleLibrary?.types.keys() ?? [])];
    if (keys.length !== 10 || ctx.vehicleLibrary?.types.size !== 10) throw new Error('All ten generated vehicle models must really load');
    const sheet = document.createElement('canvas'); sheet.width = 1800; sheet.height = 10 * 330 + 95;
    const d = sheet.getContext('2d'); d.fillStyle = '#ebe7de'; d.fillRect(0, 0, sheet.width, sheet.height);
    d.fillStyle = '#2d3c37'; d.font = 'bold 30px sans-serif'; d.fillText('LA LADERA / PARKED VEHICLE LIBRARY', 32, 45);
    d.font = '18px sans-serif'; d.fillText('Actual generated GLBs · near / rear / far LOD · shared vehicle_paint atlas', 32, 74);
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(560, 280); renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    const scene = new T.Scene(); scene.background = new T.Color('#ebe7de');
    scene.add(new T.HemisphereLight(0xe8f3ff, 0x75694f, 2.0));
    const sun = new T.DirectionalLight(0xfff2de, 3); sun.position.set(-3, 7, 6); scene.add(sun);
    const back = new T.DirectionalLight(0xa7c1dd, 1.4); back.position.set(4, 3, -4); scene.add(back);
    const camera = new T.PerspectiveCamera(32, 2, .01, 40);
    const rows = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i], meta = ctx.assets.meta(key), low = ctx.assets.meta(meta.lod1);
      const y = 95 + i * 330;
      d.fillStyle = i % 2 ? '#e3ded4' : '#ebe7de'; d.fillRect(0, y, 1800, 330);
      scene.background.set(i % 2 ? '#e3ded4' : '#ebe7de');
      for (let view = 0; view < 3; view++) {
        const node = ctx.assets.instance(view === 2 ? meta.lod1 : key);
        const box = new T.Box3().setFromObject(node), sz = box.getSize(new T.Vector3()), centre = box.getCenter(new T.Vector3());
        const scale = 3.4 / Math.max(sz.x, sz.y, sz.z);
        node.scale.setScalar(scale); node.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
        scene.add(node);
        camera.position.set(view === 1 ? -4.1 : 4.1, 2.4, view === 1 ? -5.3 : 5.3);
        camera.lookAt(0, sz.y * scale * .43, 0); renderer.render(scene, camera);
        d.drawImage(renderer.domElement, view * 600 + 20, y + 7);
        scene.remove(node);
      }
      d.fillStyle = '#263c34'; d.font = 'bold 20px sans-serif';
      d.fillText(key.replace('vehicle_', '').replaceAll('_', ' '), 26, y + 304);
      d.font = '16px sans-serif'; d.fillStyle = '#5c635b';
      d.fillText(`${meta.triangles.toLocaleString()} near / ${low.triangles} far triangles · ${meta.footprint[0]} × ${meta.footprint[1]} m footprint`, 470, y + 304);
      rows.push({ key, triangles: meta.triangles, far: low.triangles, footprint: meta.footprint });
    }
    renderer.dispose();
    return { image: sheet.toDataURL('image/jpeg', .94), rows };
  });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(result.image.split(',')[1], 'base64'));
  const diagnostics = page.summary();
  await writeFile(output.replace(/\.[^.]+$/, '.json'), JSON.stringify({ models: result.rows, diagnostics }, null, 2) + '\n');
  if (diagnostics.errors.length || diagnostics.consoleErrors.length || diagnostics.netErrors.length) throw new Error('Gallery contains browser/application failures');
  console.log(JSON.stringify({ output, assets: result.rows.length, diagnostics }, null, 2));
} finally { await browser.close(); }
