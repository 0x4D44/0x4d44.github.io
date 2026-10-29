// V-14 / V-34: the start platform.
//  V-14  At GO the chase camera swoops past the gantry (3-25 m from a leg) and a solid dark leg filled 15-23 % of the frame (25-30 % with the bloom) against the craft.
//        The legs now dither away inside ~34 m of the camera (fully solid beyond 90 m, so the countdown view is untouched).
//  V-34  The deck and gantry were the same navy hazard-striped steel on every course; each course now dresses its own start (wood pier, sandstone, glass, ice).
// Measured in a real (headless) browser: the share of the frame the two legs cover = pixels that change when the legs stop drawing (their shadows stay).
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/gantry.test.mjs          (own static server + headless Chrome, ~1.5 min)
// Env: GANTRY=sunrise,redrock,neon,frost to pick courses; SKY_URL / SKY_ROOT as in render-det.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launchChrome } from './tools/chrome.mjs';
import { startStaticServer } from './tools/static-server.mjs';

let BASE = process.env.SKY_URL || '';
const COURSES = (process.env.GANTRY || 'sunrise,redrock,neon,frost').split(',');
const THEME = { sunrise: 'wood pier', redrock: 'sandstone', neon: 'glass', frost: 'ice' };

let chrome, srv, page;
test.before(async () => {
  if (!BASE) { srv = await startStaticServer({ root: process.env.SKY_ROOT || undefined }); BASE = `${srv.url}/skyblitz`; }
  chrome = await launchChrome({ width: 960, height: 540 });
  page = await chrome.newPage();
});
test.after(async () => { await chrome?.close(); await srv?.close(); });

const J = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));

// In-page helpers. legs(): the two tower boxes (3 x 46 x 3). shareAt(d): put a free camera d metres behind the right leg, level with its middle, looking
// straight at it, and return the share of the frame (%) that changes when both legs are hidden.
const HELPERS = `(()=>{ const g=__sky.game, T=g.THREE;
window.__gt = {
  platform(){ let p=null; g.scene.traverse((o)=>{ if(o.name==='platform') p=o; }); return p; },
  legs(){ const out=[]; __gt.platform().traverse((o)=>{ if(o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.height===46) out.push(o); }); return out; },
  deck(){ let d=null; __gt.platform().traverse((o)=>{ if(o.isMesh && o.geometry && o.geometry.type==='PlaneGeometry' && !d && o.receiveShadow && !o.material.transparent) d=o; }); return d; },
  grab(){ const gl=g.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,px=new Uint8Array(w*h*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px); return px; },
  // share of the frame (%) the two legs cover at the current camera = pixels that change when they stop drawing. They stay in the scene (they keep casting
  // their shadow, which is not what blocks the view): only their colour / depth writes are switched off. Quality low renders straight to the screen, so no
  // bloom or blur spreads the legs' light over pixels they do not cover.
  legShare(){
    const legs=__gt.legs(); g.renderFrame(1,0);
    const a=__gt.grab(), mats=[...new Set(legs.map((l)=>l.material))]; mats.forEach((m)=>{ m.colorWrite=false; m.depthWrite=false; });
    g.renderFrame(1,0); const b=__gt.grab(); mats.forEach((m)=>{ m.colorWrite=true; m.depthWrite=true; }); g.renderFrame(1,0);
    let big=0; const n=a.length/4; for(let i=0;i<n;i++){const k=i*4; if(Math.abs(a[k]-b[k])+Math.abs(a[k+1]-b[k+1])+Math.abs(a[k+2]-b[k+2])>10) big++;}
    return +(big/n*100).toFixed(2);
  },
  // a free camera d metres behind the right leg, level with its middle, looking straight at it
  shareAt(d){
    const legs=__gt.legs(), c=g.course, f=c.startFrame;
    const fwd=new T.Vector3(f.tangent.x,0,f.tangent.z).normalize(), leg=legs[1].getWorldPosition(new T.Vector3());
    __sky.cam(leg.clone().addScaledVector(fwd,-d).toArray(), leg.toArray(), 60);
    return __gt.legShare();
  },
  // the real thing: run the countdown to GO, then sample the leg share every 0.1 s of the chase camera's swoop through the gantry (GO .. GO+2.4 s)
  swoop(){
    const r=g.race; let n=0; while(r.state!=='racing' && n<600){ g.fixedUpdate(); if(n%3===0) g.renderFrame(1,3/60); n++; }
    const out=[]; for(let k=0;k<=24;k++){ if(k>0) __sky.step(6,3); out.push(__gt.legShare()); } return out;
  },
  avg(tex){ try{ const im=tex&&tex.image; if(!im) return null; const c=document.createElement('canvas'); c.width=c.height=8; const x=c.getContext('2d'); x.drawImage(im,0,0,8,8); const d=x.getImageData(0,0,8,8).data; let r=0,gg=0,b=0; for(let i=0;i<d.length;i+=4){r+=d[i];gg+=d[i+1];b+=d[i+2];} const n=d.length/4; return [r,gg,b].map((v)=>Math.round(v/n/16)).join(','); }catch(e){ return null; } },
  look(){ const p=__gt.platform(), d=__gt.deck(); let hull=null; p.traverse((o)=>{ if(o.isMesh && o.geometry.type==='BoxGeometry' && o.geometry.parameters.height===5) hull=o; });
    return { theme:p.userData.theme||null, deckAvg:__gt.avg(d.material.map), deckColor:d.material.color.getHex(), deckRough:d.material.roughness, hullColor:hull?hull.material.color.getHex():null, legColor:__gt.legs()[0].material.color.getHex() }; },
};
return 1; })()`;

const seen = new Map();
for (const course of COURSES) {
  test(`${course}: the gantry legs dither away near the camera and stay solid at the countdown distance; the start is dressed per course`, { timeout: 240000 }, async (t) => {
    await page.goto(`${BASE}/?` + new URLSearchParams({ manual: 1, autostart: 1, mute: 1, autopilot: 1, course, seed: 7, laps: 1, bots: 7, craft: 'falcon', diff: 'normal', quality: 'low' }), { timeout: 90000 });
    await page.waitFor('window.__sky && __sky.ready && __sky.game.state==="race" && !!__sky.game.race && !!__sky.game.player', { timeout: 120000 });
    await page.eval(HELPERS);
    await page.eval('__sky.ui(false)');
    await page.eval('__sky.step(30, 6)');
    const swoop = await J('__gt.swoop()'), peak = Math.max(...swoop);           // the GO swoop first: it needs the chase camera, the checks below move a free one
    const near12 = await J('__gt.shareAt(12)'), near20 = await J('__gt.shareAt(20)'), far100 = await J('__gt.shareAt(100)');
    const look = await J('__gt.look()');
    seen.set(course, look);
    t.diagnostic(`${course}: legs cover at most ${peak} % of the frame during the GO swoop (${swoop.join(' ')}); ${near12} % at 12 m, ${near20} % at 20 m, ${far100} % at 100 m; ${JSON.stringify(look)}`);
    assert.ok(peak <= 3, `during the GO swoop a leg covers up to ${peak} % of the frame (V-14: it was 15-23 % hard against the craft)`);
    assert.ok(near12 <= 2 && near20 <= 4, `a leg 12 m / 20 m from the camera still covers ${near12} % / ${near20} % of the frame`);
    assert.ok(far100 >= 0.25, `the legs must stay solid at the countdown distance (100 m): they cover only ${far100} % of the frame`);
    assert.equal(look.theme, THEME[course], 'each course dresses its own start');
    assert.deepEqual(await J('__sky.errors'), [], 'no console errors');
  });
}

test('the four starts do not share one look (V-34: the same navy hazard deck everywhere)', () => {
  if (seen.size < 2) return;
  const key = (l) => `${l.deckColor}:${l.deckRough}:${l.hullColor}:${l.legColor}`;
  const keys = [...seen.values()].map(key);
  assert.equal(new Set(keys).size, keys.length, `deck / hull / leg materials must all differ: ${keys.join(' | ')}`);
  const avgs = [...seen.values()].map((l) => l.deckAvg);
  assert.ok(avgs.every(Boolean), `the deck texture must be readable: ${avgs.join(' | ')}`);
  assert.equal(new Set(avgs).size, seen.size, `each course has its own deck texture (mean colour per texture: ${avgs.join(' | ')})`);
});
