// How much bare scalp shows through the hair, the way the GAME draws the people (tools/people_view.html: AnimCrowd, bodyfit.js fits included).
//   node tools/people_scalp.mjs [--base URL] [--lod 0|1] [--only a,b] [--save PREFIX]
//     --base  a server of the repo root (default http://127.0.0.1:8611; start one with: python3 -m http.server 8611 --bind 127.0.0.1)
//     --lod   1 = the far model (people_lod.glb), 0 = the full one (default)
//     --save  write the seven views of each person as PREFIX_<id>_<view>.png
// Per person: the skin is painted red, the hair (and the hair-coloured scalp cap) green, everything else hidden, the head cut off 2 cm above the eyes, and
// looked at from behind, both back quarters, both sides, above, and above-behind. The count is the red pixels (1.3 mm each) where hair should be: behind the
// face in the side and top views, everything in the back views. Ears' tops and a raised hand add a few hundred; a bald-sided ponytail is 25,000+.
// What it found and what was done about it: research/people-hair.md. It counts; it does not say whether a head looks right.
import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const lod = arg('--lod', '0'), only = arg('--only', null) ? arg('--only').split(',') : null, save = arg('--save', ''), BASE = arg('--base', 'http://127.0.0.1:8611');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 300, height: 300 } }); p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(BASE + '/glasgow-subway/tools/people_view.html?' + new URLSearchParams({ tint: '0', forcelod: lod, bg: '0000ff' })); await p.waitForFunction(() => window.__ready || window.__err, null, { timeout: 100000 });
let ids = await p.evaluate('window.__ids'); if (only) ids = ids.filter((i) => only.includes(i));
const rows = [];
for (const id of ids) {
  const res = await p.evaluate(({ id, save }) => {
    const r = window.__renderer, T = window.__THREE, scene = window.__scene; r.setAnimationLoop(null); r.setPixelRatio(1); r.setSize(256, 256, false); scene.background = new T.Color(0x0000ff);
    if (!window.__spawn(id, 'stand', 0.3, 0)) return null; const g = window.__crowd.group; g.updateMatrixWorld(true);
    let eye = null, head = null, hair = 0;
    const red = new T.MeshBasicMaterial({ color: 0xff0000 }); red.toneMapped = false;
    g.traverse((o) => { if (o.isBone && /^head(_\d+)?$/.test(o.name) && !head) head = o;
      if (o.isSkinnedMesh) { const n = (Array.isArray(o.material) ? o.material[0] : o.material).name || ''; if (/^eye_/.test(n)) eye = o; if (/^skin_/.test(n)) o.material = red; else if (/^alpha_hair|^scalp_/.test(n)) { hair++; const m0 = o.material; o.material = new T.MeshBasicMaterial({ color: 0x00ff00, side: T.DoubleSide, alphaTest: m0.map ? (m0.alphaTest || 0.5) : 0, map: m0.map || null }); o.material.toneMapped = false; } else o.visible = false; }
      else if (o.isMesh) o.visible = false; });
    if (!eye || !head) return { err: 'no eye/head' };
    eye.computeBoundingBox(); const eb = eye.boundingBox.clone().applyMatrix4(eye.matrixWorld), ec = eb.getCenter(new T.Vector3()), hp = head.getWorldPosition(new T.Vector3());
    const f = new T.Vector3(ec.x - hp.x, 0, ec.z - hp.z).normalize(), side = new T.Vector3(f.z, 0, -f.x), C = ec.clone().addScaledVector(f, -0.085); C.y += 0.035;
    const cam = new T.OrthographicCamera(-0.17, 0.17, 0.17, -0.17, 0.01, 3), gl = r.getContext(), px = new Uint8Array(256 * 256 * 4);
    r.clippingPlanes = [new T.Plane(new T.Vector3(0, 1, 0), -(ec.y + 0.02))]; const out = { hair, views: {} }; let tot = 0, hairPx = 0; const shots = {};
    const V = { back: [f.clone().multiplyScalar(-1), 'y'], backL: [f.clone().multiplyScalar(-1).addScaledVector(side, 1).normalize(), 'y'], backR: [f.clone().multiplyScalar(-1).addScaledVector(side, -1).normalize(), 'y'], left: [side.clone(), 'yb'], right: [side.clone().multiplyScalar(-1), 'yb'], top: [new T.Vector3(0, 1, 0), 'b'], topBack: [f.clone().multiplyScalar(-1).add(new T.Vector3(0, 1, 0)).normalize(), 'all'] };
    for (const k in V) { const [d, rule] = V[k]; cam.position.copy(C).addScaledVector(d, 1); cam.up.set(0, 1, 0); if (k === 'top') cam.up.copy(f); cam.lookAt(C); cam.updateMatrixWorld(true);
      r.render(scene, cam); gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // pixel -> world: x right = cam right, y up = cam up
      const R = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), U = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 1); let n = 0, h = 0;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const i = (y * 256 + x) * 4, sk = px[i] > 200 && px[i + 1] < 60 && px[i + 2] < 60, bg = px[i + 2] > 200 && px[i] < 60 && px[i + 1] < 60, ha = !sk && !bg; if (bg) continue;
        const u = (x + 0.5) / 256 * 0.34 - 0.17, v = (y + 0.5) / 256 * 0.34 - 0.17, wy = C.y + R.y * u + U.y * v, wf = (R.x * u + U.x * v) * f.x + (R.z * u + U.z * v) * f.z;   // height, and how far forward of the middle of the head
        let inR = true; if (rule.includes('y') && wy < ec.y + 0.02) inR = false; if (rule.includes('b') && wf > -0.015) inR = false;
        if (!inR) continue; if (sk) n++; else h++; }
      out.views[k] = n; tot += n; hairPx += h; if (save) shots[k] = r.domElement.toDataURL('image/png'); }
    r.clippingPlanes = []; out.tot = tot; out.hairPx = hairPx; out.shots = shots; return out; }, { id, save });
  if (!res) { rows.push({ id, err: 1 }); continue; }
  if (save && res.shots) for (const k in res.shots) fs.writeFileSync(`${save}_${id}_${k}.png`, Buffer.from(res.shots[k].split(',')[1], 'base64'));
  delete res.shots; rows.push(Object.assign({ id }, res));
}
rows.sort((a, b) => (b.tot || 0) - (a.tot || 0));
for (const r of rows) console.log(r.id.padEnd(22), 'hair', r.hair, 'scalp', String(r.tot).padStart(6), 'hairpx', String(r.hairPx).padStart(6), JSON.stringify(r.views));
await b.close();
