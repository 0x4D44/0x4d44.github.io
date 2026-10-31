// V-10 / R2-E-02, in a real browser: Low's light composer must keep the course grade pass, and a Low frame must keep High's colour balance.
// Before the fix Low rendered straight to the screen and skipped the grade (Neon walls saturated red, Sunrise purple cast, Frost lost its blue).
// Mutation: remove the grade pass from the Low branch of craft/post.js build() -> the structure check and the colour checks fail.
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/post-grade.test.mjs     (own static server; headless Chrome)
// Env: SKY_URL / SKY_ROOT as in render-det.test.mjs; SKY_GRADE_LOG=1 prints the measured numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launchChrome } from './tools/chrome.mjs';
import { startStaticServer } from './tools/static-server.mjs';

let BASE = process.env.SKY_URL || '';
let chrome, srv, page;
test.before(async () => {
  if (!BASE) { srv = await startStaticServer({ root: process.env.SKY_ROOT || undefined }); BASE = `${srv.url}/skyblitz`; }
  chrome = await launchChrome({ width: 640, height: 360 });
  page = await chrome.newPage();
});
test.after(async () => { await chrome?.close(); await srv?.close(); });

const J = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));

/** Fixed pose per course, one rendered frame: composer structure + mean colour (circular hue, saturation, value) of the frame. */
async function frame(course, quality) {
  await page.goto(`${BASE}/?` + new URLSearchParams({ manual: 1, autostart: 1, mute: 1, autopilot: 1, course, seed: 7, bots: 3, craft: 'falcon', quality }), { timeout: 90000 });
  await page.waitFor('window.__sky && __sky.ready && __sky.game.state==="race" && !!__sky.game.race', { timeout: 120000 });
  return J(`(()=>{const g=__sky.game,f={};g.fixedUpdate();g.course.frameAt(g.course.marks.avenue||200,f);
    const p=f.pos,t=f.tangent,u=f.up;__sky.cam([p.x-t.x*18+u.x*6,p.y-t.y*18+u.y*6,p.z-t.z*18+u.z*6],[p.x+t.x*60,p.y+t.y*60,p.z+t.z*60],72);
    g.renderFrame(1,0);g.renderFrame(1,0);
    const c=g.post.composer,passes=c?c.passes:[];
    const gl=g.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,px=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
    const mean=()=>{gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);let r=0,gg=0,b=0,n=0;for(let i=0;i<px.length;i+=16){r+=px[i];gg+=px[i+1];b+=px[i+2];n++}return [r/n,gg/n,b/n]};
    const on=mean(),grade=passes.find(q=>q.uniforms&&q.uniforms.uVig&&q.uniforms.uSat);
    let off=on;if(grade){grade.enabled=false;g.renderFrame(1,0);off=mean();grade.enabled=true}
    return {hasComposer:!!c,hasGrade:!!grade,on,off,ratio:on.map((v,i)=>v/off[i])}})()`);
}

const RATIO_TOL = 0.035;   // |Low ratio - High ratio| per channel; see the handoff for the measured numbers

for (const course of ['neon', 'sunrise']) {
  test(`${course}: Low keeps the course grade pass, and the grade shifts a Low frame like a High frame`, { timeout: 240000 }, async () => {
    const low = await frame(course, 'low'), high = await frame(course, 'high');
    if (process.env.SKY_GRADE_LOG) console.log(course, JSON.stringify({ low, high }));
    assert.ok(low.hasComposer && low.hasGrade, 'Low renders through a composer with the grade pass');
    assert.ok(high.hasComposer && high.hasGrade);
    // colour balance the grade adds (same frame, grade pass on / off), per channel: Low must match High
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(low.ratio[k] - high.ratio[k]) <= RATIO_TOL, `channel ${'RGB'[k]}: grade ratio low ${low.ratio[k].toFixed(3)} vs high ${high.ratio[k].toFixed(3)}`);
  });
}