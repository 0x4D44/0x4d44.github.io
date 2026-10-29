// V-16: sunrise rocks, sea stacks, cliff boulders, arches and bushes were flat-shaded blobs: a plain vertex-colour material, no surface detail at all.
// They now use the strata rock shader (world-space strata bands, a triplanar detail texture, albedo mottling and a derivative bump), so a close-up carries
// fine surface detail.
// Measured in a real (headless) browser, A/B on the very same geometry and view: the close-up of the nearest rock / boulder / sea stack / bush is rendered with
// the course's own material, then again with the old plain vertex-colour material; the mean luminance step between neighbouring pixels deep inside the object's
// silhouette (fine surface detail; the edges against sky and sea are excluded) must be clearly higher with the course's material. Also checks that the materials
// compile (no console errors) and that the arches are the strata kind too.
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/rock-relief.test.mjs      (own static server + headless Chrome, ~40 s)
// Env: SKY_URL / SKY_ROOT as in render-det.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launchChrome } from './tools/chrome.mjs';
import { startStaticServer } from './tools/static-server.mjs';

let BASE = process.env.SKY_URL || '';
// minimum detail ratio (course material / plain vertex colours) per family, set from measured values with a wide margin (see the diagnostics)
const MIN_RATIO = { stack: 1.5, big: 1.5, rock: 1.4, bush: 1.3 };

let chrome, srv, page;
test.before(async () => {
  if (!BASE) { srv = await startStaticServer({ root: process.env.SKY_ROOT || undefined }); BASE = `${srv.url}/skyblitz`; }
  chrome = await launchChrome({ width: 960, height: 540 });
  page = await chrome.newPage();
  await page.goto(`${BASE}/?` + new URLSearchParams({ manual: 1, autostart: 1, mute: 1, autopilot: 1, course: 'sunrise', seed: 7, laps: 1, bots: 7, craft: 'falcon', diff: 'normal', quality: 'low' }), { timeout: 90000 });
  await page.waitFor('window.__sky && __sky.ready && __sky.game.state==="race" && !!__sky.game.race && !!__sky.game.player', { timeout: 120000 });
  await page.eval('__sky.step(30, 6)');
  await page.eval('__sky.ui(false)');
  await page.eval(HELPERS);
});
test.after(async () => { await chrome?.close(); await srv?.close(); });

const J = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));

// In-page helpers. Families are found by geometry (the icosphere rocks are 92 vertices, canopy clumps 42) and mean instance scale, nearest instance to the
// slalom mark. detail(): mean |luminance step to the right-hand neighbour| over a window in the middle of the frame, 0-255 scale.
const HELPERS = `(()=>{ const g=__sky.game, T=g.THREE, c=g.course, ref=new T.Vector3(), f={}; c.frameAt(c.marks.slalom ?? c.marks.arch ?? 0, f); ref.copy(f.pos);
const m=new T.Matrix4(), p=new T.Vector3(), q=new T.Quaternion(), s=new T.Vector3(), fam={ rock:null, big:null, stack:null, bush:null }, archs=[];
c.group.traverse((o)=>{
  if (o.name==='rock-arch') { archs.push(o); return; }
  if (!o.isInstancedMesh || !o.geometry.attributes.color) return;
  let sx=0, sy=0; const n=Math.min(o.count,60); for (let i=0;i<n;i++) { o.getMatrixAt(i,m); m.decompose(p,q,s); sx+=s.x; sy+=s.y; } sx/=n; sy/=n;
  const verts=o.geometry.attributes.position.count, rocky=verts>=90 && verts<=100;
  const cls = sy>50 && rocky ? 'stack' : (verts<=60 && sx>=4 ? 'bush' : (sx>=10 && sx<=34 && rocky ? 'big' : (sx>=2.5 && sx<=12 && rocky ? 'rock' : null)));
  if (!cls) return;
  let best=-1, bd=1e9; for (let i=0;i<o.count;i++) { o.getMatrixAt(i,m); m.decompose(p,q,s); const d=Math.hypot(p.x-ref.x,p.z-ref.z); if (d<bd) { bd=d; best=i; } }
  if (!fam[cls] || bd < fam[cls].d) { o.getMatrixAt(best,m); m.decompose(p,q,s); fam[cls]={ mesh:o, d:bd, pos:p.clone(), scale:s.clone() }; }
});
const grab=()=>{ const gl=g.renderer.getContext(), w=gl.drawingBufferWidth, h=gl.drawingBufferHeight, px=new Uint8Array(w*h*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px); return { px, w, h }; };
const keyOf=(mat)=>mat.customProgramCacheKey ? String(mat.customProgramCacheKey()) : '';
window.__rr = {
  has: (k)=>!!fam[k],
  key: (k)=>keyOf(fam[k].mesh.material),
  archKeys: ()=>archs.map((a)=>keyOf(a.material)),
  view(k) {
    const F=fam[k], P=F.pos, size=Math.max(F.scale.x,F.scale.z,k==='stack'?F.scale.y*0.25:F.scale.y);
    const to=new T.Vector3(ref.x-P.x,0,ref.z-P.z); if (to.lengthSq()<1) to.set(1,0,0); to.normalize();
    const cam=P.clone().addScaledVector(to,size*(k==='bush'?3.2:k==='stack'?3.6:3.4)+14).add(new T.Vector3(0,size*(k==='stack'?1.5:0.7)+4,0));
    const look=P.clone().add(new T.Vector3(0,k==='stack'?F.scale.y*0.45:size*0.35,0)); __sky.cam(cam.toArray(),look.toArray(),55);
    for (let i=0;i<3;i++) g.renderFrame(1,1/60);
  },
  // Fine detail of the family's own surface: the mean |luminance step to the right-hand neighbour| over the pixels deep inside its silhouette (silhouette = the
  // pixels that change when the family is hidden, eroded by 3 px so the edges against sky and sea do not count), rendered with the course's material and then
  // with the old plain vertex-colour material. dt = 0 keeps the water and the sky still between the renders; each frame is read in the task that drew it.
  measure(k) {
    const mesh=fam[k].mesh;
    g.renderFrame(1,0); const A=grab(); mesh.visible=false; g.renderFrame(1,0); const B=grab(); mesh.visible=true;
    const { w, h } = A, mask=new Uint8Array(w*h), inner=new Uint8Array(w*h), R=3; let area=0;
    for (let i=0;i<w*h;i++) { const j=i*4; if (Math.abs(A.px[j]-B.px[j])+Math.abs(A.px[j+1]-B.px[j+1])+Math.abs(A.px[j+2]-B.px[j+2])>12) mask[i]=1; }
    for (let y=R;y<h-R;y++) for (let x=R;x<w-R;x++) { let ok=1; for (let dy=-R;dy<=R&&ok;dy+=R) for (let dx=-R;dx<=R;dx+=R) if (!mask[(y+dy)*w+x+dx]) { ok=0; break; } if (ok) { inner[y*w+x]=1; area++; } }
    const L=(P,a)=>0.3*P[a]+0.59*P[a+1]+0.11*P[a+2];
    const step=(P)=>{ let n=0, s=0; for (let y=0;y<h;y++) for (let x=0;x<w-1;x++) { const i=y*w+x; if (!inner[i]||!inner[i+1]) continue; s+=Math.abs(L(P,i*4)-L(P,i*4+4)); n++; } return n ? s/n : 0; };
    const course=step(A.px);
    const keep=mesh.material, plain=new T.MeshStandardMaterial({ vertexColors:true, roughness:0.92 });
    mesh.material=plain; g.renderFrame(1,0); const C=grab(); mesh.material=keep; plain.dispose(); g.renderFrame(1,0);
    return { course:+course.toFixed(3), plain:+step(C.px).toFixed(3), area };
  },
};
return 1; })()`;

test('sunrise arches use the strata rock material too', async () => {
  const keys = await J('__rr.archKeys()');
  assert.ok(keys.length >= 1, 'no arch mesh found in the sunrise scenery');
  assert.ok(keys.every((k) => /^sbstrata/.test(k)), `every arch uses the strata rock material: ${JSON.stringify(keys)}`);
});

for (const family of ['stack', 'big', 'rock', 'bush']) {
  test(`sunrise ${family}: a close-up carries fine surface detail, not a flat vertex-colour blob`, async (t) => {
    assert.ok(await J(`__rr.has(${JSON.stringify(family)})`), `no ${family} found in the sunrise scenery`);
    await page.eval(`__rr.view(${JSON.stringify(family)})`);
    const { course, plain, area } = await J(`__rr.measure(${JSON.stringify(family)})`), key = await J(`__rr.key(${JSON.stringify(family)})`);
    const ratio = course / Math.max(plain, 1e-6);
    t.diagnostic(`${family}: detail ${course} (course material) vs ${plain} (plain vertex colours) = x${ratio.toFixed(2)} over ${area} interior pixels; material key ${key}`);
    assert.ok(area >= 300, `${family}: only ${area} interior pixels in view, the measurement is meaningless`);
    assert.ok(/^sbstrata/.test(key), `the ${family} uses the strata rock material (cache key ${JSON.stringify(key)})`);
    assert.ok(ratio >= MIN_RATIO[family], `${family}: only x${ratio.toFixed(2)} the fine detail of a plain vertex-colour blob (needs x${MIN_RATIO[family]})`);
    assert.deepEqual(await J('__sky.errors'), [], 'no console errors (the shaders compile)');
  });
}
