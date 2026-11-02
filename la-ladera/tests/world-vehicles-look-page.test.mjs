// R1-103 in the real page: a parked car's look (the tint on its main coat and the patches it wears) really reaches the screen. The library's records are set to a known look, the same car is
// rendered each time from the same spot, and the boxes round the door, the sill and the body are compared: tint moves the body's colour, a code that drops the two patches changes exactly the door
// and the sill, and the console stays clean (a shader error would show there). The numbers in the records (which colour, which codes) are tested in world-vehicles-look.test.mjs.
// Quiet box: the browser comes only from tests/chrome.mjs, headless.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-vehicles-look-page.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

const KIT = `window.__vl = (() => {
  const api = window.__ladera, c = api.ctx, T = c.THREE, lib = c.vehicleLibrary;
  const rec = lib.records.find((r) => /^vehicle_hatchback_/.test(r.key));
  const grab = () => { api.render(); const cv = c.renderer.domElement, t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height; const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0); return { g, W: cv.width, H: cv.height }; };
  let side = 1;
  const box = (g, W, H, local, r) => {
    const v = new T.Vector3(local[0] * side, local[1], local[2]).applyMatrix4(rec.matrix).project(c.camera);
    const x = Math.round((v.x + 1) / 2 * W), y = Math.round((1 - v.y) / 2 * H), x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), n = 2 * r + 1, d = g.getImageData(x0, y0, n, n).data;
    let R = 0, G = 0, B = 0, k = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
    R /= k; G /= k; B /= k;
    return { x, y, r: R, g: G, b: B, l: 0.2126 * R + 0.7152 * G + 0.0722 * B };
  };
  return {
    key: rec.key, look: JSON.parse(JSON.stringify(rec.look)),
    /** the camera 4 m off the car's side that has open air, looking at its middle */
    frame() {
      const ry = rec.yaw, rx = Math.cos(ry), rz = -Math.sin(ry);
      for (const s of [1, -1]) {
        const x = rec.x + rx * s * 4, z = rec.z + rz * s * 4, gy = c.plan.heightAt(x, z);
        if (c.physics._overlaps?.(x, z, gy + 0.05, 0.24, 1.64)) continue;
        const dx = rec.x - x, dz = rec.z - z, yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(c.plan.heightAt(rec.x, rec.z) + 0.8 - gy - 1.64, Math.hypot(dx, dz));
        api.setHour(14); api.teleport(x, z, { y: gy, yaw, pitch }); api.look(yaw, pitch); api.step(30); side = s;
        return { side: s, camera: [x, gy, z], car: [rec.x, rec.z] };
      }
      return null;
    },
    /** render with this look and measure: the door's two rust patches, the sill (the mud) and the plain body above them */
    measure(look) {
      rec.look.tint = look.tint; rec.look.code = look.code; lib.update(true);
      const f = grab();
      const e1 = box(f.g, f.W, f.H, [0.85, 0.68, 0.4], 6), e2 = box(f.g, f.W, f.H, [0.85, 0.68, -0.32], 6);      // the two rust patches of a door (the model puts them 0.4 m ahead of and 0.3 m behind the seam)
      const mean = (a, b) => ({ x: a.x, y: a.y, r: (a.r + b.r) / 2, g: (a.g + b.g) / 2, b: (a.b + b.b) / 2, l: (a.l + b.l) / 2 });
      return { door: mean(e1, e2), sill: box(f.g, f.W, f.H, [0.83, 0.4, 0], 6), body: box(f.g, f.W, f.H, [0.86, 0.86, -0.22], 8) };
    },
    errors: () => api.errors(),
  };
})()`;

let b, page, framed;
const E = (js) => page.eval(js);
const measure = (look) => E(`__vl.measure(${JSON.stringify(look)})`);

before(async () => {
  b = await launch({ width: 1280, height: 720 });
  page = await b.open('la-ladera/index.html?autostart&manual&quality=high&audio=0');
  await E(KIT);
  framed = await E('__vl.frame()');
});
after(async () => { await b?.close(); });

test('a parked hatchback is framed from open air, in the library, with a look', () => {
  assert.ok(framed, 'a spot beside the first hatchback with room for the camera');
});

test('the same look, rendered twice, is the same picture; the code that drops the patches changes the door and the sill and not the body', async () => {
  const plain = { tint: [1, 1, 1], code: 3 }, patched = { tint: [1, 1, 1], code: 0 };
  const a = await measure(plain), a2 = await measure(plain), p = await measure(patched);
  for (const k of ['door', 'sill', 'body']) assert.ok(Math.abs(a[k].l - a2[k].l) < 0.5, `${k}: a render is repeatable (${a[k].l.toFixed(2)} against ${a2[k].l.toFixed(2)})`);
  assert.ok(Math.abs(a.door.l - p.door.l) > 6, `the door's two rust patches show with code 0 and not with code 3: ${a.door.l.toFixed(1)} against ${p.door.l.toFixed(1)}`);
  assert.ok(Math.abs(a.sill.l - p.sill.l) > 4, `the sill's mud shows with code 0 and not with code 3: ${a.sill.l.toFixed(1)} against ${p.sill.l.toFixed(1)}`);
  assert.ok(Math.abs(a.body.l - p.body.l) < 1.5, `the plain body is the same either way: ${a.body.l.toFixed(1)} against ${p.body.l.toFixed(1)}`);
  const noRust = await measure({ tint: [1, 1, 1], code: 1 }), noMud = await measure({ tint: [1, 1, 1], code: 2 });
  assert.ok(Math.abs(noRust.door.l - a.door.l) < 1.5 && Math.abs(noRust.sill.l - p.sill.l) < 1.5, 'bit 1 drops the door patches and keeps the sill');
  assert.ok(Math.abs(noMud.sill.l - a.sill.l) < 1.5 && Math.abs(noMud.door.l - p.door.l) < 1.5, 'bit 2 drops the sill and keeps the door patches');
});

test('the tint moves the body\'s colour: a red tint is red, a dark tint is dark, and the instance is the only thing that changed', async () => {
  const base = await measure({ tint: [1, 1, 1], code: 3 }), red = await measure({ tint: [2, 0.25, 0.25], code: 3 }), dark = await measure({ tint: [0.2, 0.2, 0.2], code: 3 });
  assert.ok(red.body.r / (red.body.g + 1) > 1.8 * (base.body.r / (base.body.g + 1)) && red.body.r > red.body.b * 1.8, `red: ${red.body.r.toFixed(0)} ${red.body.g.toFixed(0)} ${red.body.b.toFixed(0)} against ${base.body.r.toFixed(0)} ${base.body.g.toFixed(0)} ${base.body.b.toFixed(0)}`);
  assert.ok(dark.body.l < 0.45 * base.body.l, `dark: ${dark.body.l.toFixed(1)} against ${base.body.l.toFixed(1)}`);
});

test('the console stays clean (no shader error from the paint program)', async () => {
  const sum = page.summary();
  assert.deepEqual([sum.errors, sum.consoleErrors, sum.consoleWarnings, sum.netErrors.filter((n) => !/favicon/.test(n))], [[], [], [], []]);
  assert.deepEqual(await E('__vl.errors()'), []);
});
