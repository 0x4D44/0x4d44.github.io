// Headless visual contact sheet of the actual shipped GLB nodes, using their runtime library materials.
// node la-ladera/tools/nice.mjs node la-ladera/tests/clutter-gallery.mjs [--out path.png]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { launch } from './chrome.mjs';

const args = process.argv.slice(2), at = args.indexOf('--out');
const output = resolve(at < 0 ? 'la-ladera/dev/clutter-review/catalogue.png' : args[at + 1]);
const browser = await launch({ width: 1280, height: 720 });
try {
  const page = await browser.open('la-ladera/index.html?autostart&manual&quality=high&audio=0');
  const result = await page.fn(async () => {
    const ctx = __ladera.ctx, T = ctx.THREE, keys = ctx.assets.names('clutter').sort();
    if (keys.length < 19 || !ctx.clutter?.types.size) throw new Error('The complete clutter library must actually be loaded');
    const sheet = document.createElement('canvas');
    sheet.width = 1280; sheet.height = Math.ceil(keys.length / 5) * 280;
    const d = sheet.getContext('2d'); d.fillStyle = '#e9e5dc'; d.fillRect(0, 0, sheet.width, sheet.height);
    const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setSize(248, 224); r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.25;
    const scene = new T.Scene(); scene.background = new T.Color('#e9e5dc');
    scene.add(new T.HemisphereLight(0xffffff, 0xa29a85, 2.1));
    const sun = new T.DirectionalLight(0xfff5e6, 3.0); sun.position.set(3, 6, 4); scene.add(sun);
    const camera = new T.PerspectiveCamera(34, 248 / 224, 0.01, 30);
    camera.position.set(2.6, 2.1, 3.5); camera.lookAt(0, 0.82, 0);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i], node = ctx.assets.instance(key), box = new T.Box3().setFromObject(node);
      const sz = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
      const scale = 1.65 / Math.max(sz.x, sz.y, sz.z);
      node.scale.setScalar(scale); node.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      scene.add(node); r.render(scene, camera);
      const x = (i % 5) * 256, y = Math.floor(i / 5) * 280;
      d.drawImage(r.domElement, x + 4, y);
      d.fillStyle = '#28332d'; d.font = 'bold 14px sans-serif'; d.textAlign = 'center';
      d.fillText(key.replace('clutter_', '').replaceAll('_', ' '), x + 128, y + 245);
      const meta = ctx.assets.meta(key), low = ctx.assets.meta(meta.lod1);
      d.font = '12px sans-serif'; d.fillStyle = '#5c665f';
      d.fillText(`${meta.triangles} triangles / LOD ${low.triangles}`, x + 128, y + 264);
      scene.remove(node);
    }
    r.dispose();
    return { png: sheet.toDataURL('image/png'), keys };
  });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(result.png.split(',')[1], 'base64'));
  console.log(JSON.stringify({ output, assets: result.keys.length, diagnostics: page.summary() }, null, 2));
} finally {
  await browser.close();
}
