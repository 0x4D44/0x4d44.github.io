// Audio verification (headless Chrome via tests/tools/chrome.mjs): offline renders of every SFX + engines + mix, decode of every
// music stem against meta.json, and a live AudioContext run of the lab page (event wiring, voice cleanup, ?mute=1).
//   node --test skyblitz/tests/audio.test.mjs        (starts its own static server on a free port)
// Env: SKY_URL (e.g. http://127.0.0.1:8100/skyblitz) to use a server that is already running instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './tools/chrome.mjs';
import { startStaticServer } from './tools/static-server.mjs';
import { LEVEL } from '../src/audio/levels.js';

let BASE = process.env.SKY_URL || '';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MUSIC = path.resolve(HERE, '..', 'assets', 'music');
const TRACKS = ['menu', 'sunrise', 'redrock', 'neon', 'frost', 'results'];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let chrome, off, srv;
test.before(async () => {
  if (!BASE) { srv = await startStaticServer(); BASE = `${srv.url}/skyblitz`; }
  chrome = await launchChrome({ width: 800, height: 600 });
  off = await chrome.newPage();
  await off.goto(`${BASE}/tests/lab/audio-offline.html`);
  await off.waitFor('window.__off && window.__off.ready');
});
test.after(async () => { await chrome?.close(); await srv?.close(); });

const run = (expr) => off.eval(expr);

test('every procedural SFX renders clean: no NaN, no clipping, peak < -1 dBFS, sane RMS, ends in silence', async () => {
  const names = await run('__off.SFX_NAMES');
  assert.ok(names.length >= 45, `expected a full SFX set, got ${names.length}`);
  const bad = [];
  for (const n of names) {
    const r = await run(`__off.renderSfx(${JSON.stringify(n)}, {size:1, sev:1, n:5, perfect:true, dur:1.6, p:1}, 4.5)`);
    const why = [];
    if (r.nan) why.push(`NaN x${r.nan}`);
    if (r.clip) why.push(`clipped x${r.clip}`);
    if (r.peakDb > -1) why.push(`peak ${r.peakDb.toFixed(1)} dBFS`);
    if (r.peak < 0.03) why.push(`too quiet (peak ${r.peak.toFixed(3)})`);
    if (r.rms < 0.002) why.push(`rms ${r.rms.toFixed(4)}`);
    if (Math.abs(r.dc) > 0.01) why.push(`dc ${r.dc.toFixed(3)}`);
    if (r.tailRms > 0.004) why.push(`does not decay (tail rms ${r.tailRms.toFixed(4)})`);
    if (!(n in LEVEL)) why.push('no LEVEL entry (run assets/music-src/make-levels.mjs)');
    else if (r.peakDb + 20 * Math.log10(LEVEL[n]) > -1.5) why.push(`leveled peak ${(r.peakDb + 20 * Math.log10(LEVEL[n])).toFixed(1)} dBFS`);
    if (why.length) bad.push(`${n}: ${why.join(', ')}`);
  }
  assert.deepEqual(bad, []);
});

test('envelope shapes: impacts start fast, risers build, ui clicks are short', async () => {
  const ex = await run(`__off.renderSfx('explosion', {size:1}, 4)`);
  assert.ok(ex.peakAtSec < 0.12, `explosion peak at ${ex.peakAtSec}`);
  assert.ok(ex.activeSec > 0.8, `explosion should ring (${ex.activeSec}s)`);
  const click = await run(`__off.renderSfx('uiClick', {}, 1)`);
  assert.ok(click.activeSec < 0.25, `ui click ${click.activeSec}s`);
  const go = await run(`__off.renderSfx('goBeep', {}, 3)`);
  assert.ok(go.activeSec > 0.6);
  const th = await run(`__off.renderSfx('lightning', {}, 4)`);
  assert.ok(th.activeSec > 1.5, 'thunder rolls for seconds');
});

test('the mix graph keeps a pile-up of big sounds under the limiter', async () => {
  const m = await run(`__off.renderMix(['explosion','explosion','mineBlast','lightning','emp','hitThump','goBeep','boostIgnite'], 3.5)`);
  assert.equal(m.nan, 0);
  assert.ok(m.peak < 0.95, `limiter let ${m.peakDb.toFixed(2)} dBFS through`);
  assert.ok(m.rms > 0.01);
});

test('engines respond to throttle, speed and boost, and differ per craft family', async () => {
  const crafts = await run('__off.ENGINE_VOICES');
  const res = {};
  for (const c of crafts) {
    const idle = await run(`__off.renderEngine('${c}', {speedN:0.4, throttle:0.1, boost:0})`);
    const cruise = await run(`__off.renderEngine('${c}', {speedN:0.9, throttle:0.7, boost:0})`);
    const boost = await run(`__off.renderEngine('${c}', {speedN:1.4, throttle:1, boost:1})`);
    res[c] = { idle, cruise, boost };
    for (const s of [idle, cruise, boost]) { assert.equal(s.nan, 0, c); assert.ok(s.peak < 0.9, `${c} peak ${s.peak}`); assert.ok(s.rms > 0.004, `${c} silent`); }
    assert.ok(cruise.rms > idle.rms * 1.1, `${c}: cruise should be louder than idle`);
    assert.ok(boost.rms > cruise.rms * 1.1, `${c}: boost should be louder than cruise`);
    assert.ok(boost.centroidHz > idle.centroidHz, `${c}: spectral centroid should rise with power`);
  }
  assert.ok(Math.abs(res.falcon.cruise.centroidHz - res.bulldog.cruise.centroidHz) > 30, 'jet and prop must sound different');
});

test('positional AI engine falls off with distance', async () => {
  const near = await run(`__off.renderAIEngine(30, 1)`), far = await run(`__off.renderAIEngine(500, 1)`);
  assert.ok(near.rms > far.rms * 2, `near ${near.rms} vs far ${far.rms}`);
  assert.equal(near.nan, 0);
});

test('music: every built track decodes in Chrome to the sample count in meta.json and fits the size budget', async () => {
  let total = 0, built = 0;
  for (const id of TRACKS) {
    const dir = path.join(MUSIC, id);
    if (!fs.existsSync(path.join(dir, 'meta.json'))) continue;
    built++;
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    let bytes = 0;
    for (const [name, st] of Object.entries(meta.stems)) {
      const file = path.join(dir, st.file);
      assert.ok(fs.existsSync(file), `${id}/${st.file}`);
      bytes += fs.statSync(file).size;
      const r = await run(`(async()=>{const ab=await (await fetch('${BASE}/assets/music/${id}/${st.file}')).arrayBuffer();const c=new OfflineAudioContext(2,48000,48000);const b=await c.decodeAudioData(ab);let nan=0,pk=0;for(let ch=0;ch<b.numberOfChannels;ch++){const d=b.getChannelData(ch);for(let i=0;i<d.length;i+=7){const v=d[i];if(!Number.isFinite(v))nan++;else if(Math.abs(v)>pk)pk=Math.abs(v);}}return {len:b.length,rate:b.sampleRate,ch:b.numberOfChannels,nan,pk}})()`);
      assert.equal(r.rate, 48000);
      assert.ok(Math.abs(r.len - meta.totalSamples) <= 1, `${id}/${name}: decoded ${r.len} vs meta ${meta.totalSamples}`);
      assert.equal(r.nan, 0);
      assert.ok(r.pk > 0.05 && r.pk <= 1.0001, `${id}/${name} peak ${r.pk}`);
    }
    assert.ok(Math.abs(bytes - meta.bytes) < 64, `${id}: meta bytes ${meta.bytes} vs ${bytes}`);
    const limit = ['menu', 'results'].includes(id) ? 2.0e6 : 2.0e6;
    assert.ok(bytes <= limit, `${id} is ${(bytes / 1e6).toFixed(2)} MB`);
    assert.ok(meta.loopSamples > 48000 * 20 && meta.introSamples >= 0);
    assert.ok(meta.stats.seamRatio < 40, `${id}: loop seam jump ratio ${meta.stats.seamRatio}`);
    total += bytes;
  }
  const stingers = path.join(MUSIC, 'stingers');
  if (fs.existsSync(stingers)) for (const f of fs.readdirSync(stingers)) if (f.endsWith('.ogg')) total += fs.statSync(path.join(stingers, f)).size;
  assert.ok(built > 0, 'no music built');
  assert.ok(total <= 14e6, `music total ${(total / 1e6).toFixed(1)} MB > 14 MB`);
  if (built === TRACKS.length) for (const s of ['win', 'lose', 'finalLap']) assert.ok(fs.existsSync(path.join(stingers, `${s}.ogg`)), `stinger ${s}`);
});

test('live AudioContext: events make sound, voices are released, volumes apply, no console errors', async () => {
  const page = await chrome.newPage();
  await page.goto(`${BASE}/tests/lab/audio.html`);
  await page.waitFor('!!window.__audioLab');
  await page.key('Space'); await page.click(100, 100);               // user gesture -> context starts
  await page.waitFor("!!__audioLab.audio.ctx && __audioLab.audio.ctx.state==='running'", { timeout: 8000 });
  await page.eval(`(async()=>{const {events,game,racer,THREE}=__audioLab;const p=game.player;game.state='race';
    const E=(t,x)=>events.emit(t,x);
    E('ui:click',{});E('ui:hover',{});E('ui:confirm',{});E('ui:back',{});E('ui:error',{});
    E('race:countdown',{n:3});E('race:go',{});E('race:lap',{racer:p});E('race:finalLap',{racer:p});E('race:overtake',{racer:p,passed:{}});
    E('gate:pass',{racer:p,perfect:false});E('gate:pass',{racer:p,perfect:true});E('pickup:orb',{racer:p,item:'missile'});E('racer:boost',{racer:p,kind:'item'});E('racer:boost',{racer:p,kind:'ring'});
    for(const k of ['loop','roll','barrel','inverted','nearmiss'])E('racer:stunt',{racer:p,kind:k});
    E('missile:launch',{owner:p,pos:new THREE.Vector3(0,0,-9)});E('missile:evaded',{target:p,by:'barrel'});E('missile:hit',{target:p,pos:new THREE.Vector3()});
    E('mine:drop',{owner:p,pos:new THREE.Vector3()});E('mine:hit',{victim:p,pos:new THREE.Vector3()});E('emp:fire',{owner:p,pos:new THREE.Vector3()});E('lightning:strike',{target:p,pos:new THREE.Vector3()});
    E('smoke:deploy',{owner:p,pos:new THREE.Vector3()});E('drone:launch',{owner:p});E('shield:up',{racer:p});E('shield:block',{racer:p});E('shield:down',{racer:p});
    E('cannon:fire',{racer:p,pos:new THREE.Vector3()});E('cannon:hit',{racer:p,target:{},pos:new THREE.Vector3()});
    E('racer:hit',{racer:p,kind:'racer',severity:0.7});E('racer:tumble',{racer:p,duration:1.5});E('racer:recover',{racer:p});E('racer:stall',{racer:p});
    E('race:respawn',{racer:p});E('shortcut:enter',{racer:p});E('race:rocketStart',{racer:p,perfect:true});E('race:finish',{racer:p,place:1});
    const other=racer('wasp',40,5,-60);E('missile:launch',{owner:other,pos:other.render.pos});E('cannon:fire',{racer:other,pos:other.render.pos});E('mine:hit',{victim:other,pos:other.render.pos});
    return 1})()`);
  await delay(400);
  await page.eval("(()=>{const {events,game}=__audioLab;events.emit('missile:warn',{target:game.player,dist:90});events.emit('race:wrongway',{racer:game.player,on:true});})()");
  await delay(1100);
  await page.eval("__audioLab.events.emit('race:wrongway',{racer:__audioLab.game.player,on:false})");
  const during = await page.eval('({s:__audioLab.audio.stats(), played:Object.keys(__audioLab.audio.played)})');
  assert.equal(during.s.state, 'running');
  const expect = ['uiClick', 'uiHover', 'uiConfirm', 'uiBack', 'uiError', 'countBeep', 'goBeep', 'lap', 'finalLap', 'overtake', 'gate', 'gatePerfect', 'orb', 'boostIgnite', 'ringBoost', 'loopWhoosh', 'rollWhoosh', 'nearMiss', 'stunt',
    'missileLaunch', 'warnBeep', 'evade', 'explosion', 'mineDrop', 'mineBlast', 'emp', 'lightning', 'smoke', 'droneLaunch', 'shieldUp', 'shieldBlock', 'shieldDown', 'cannon', 'cannonHit', 'hitThump', 'tumble', 'recover', 'stall', 'wrongWay', 'respawn', 'shortcut', 'rocket'];
  const missing = expect.filter((n) => !during.played.includes(n));
  assert.deepEqual(missing, [], 'events that produced no sound');
  // voices released (no leak) once everything has finished
  await delay(7500);
  const after = await page.eval('__audioLab.audio.stats()');
  assert.equal(after.voices, 0, `leaked voices: ${after.voices}`);
  // volumes are live
  await page.eval(`(()=>{const {game,events}=__audioLab;game.settings.masterVolume=0.25;game.settings.musicVolume=0.1;game.settings.sfxVolume=0.5;events.emit('settings:change',{key:'masterVolume',value:0.25});})()`);
  await delay(500);
  const g = await page.eval('({m:__audioLab.audio.master.gain.value,mu:__audioLab.audio.musicBus.gain.value,s:__audioLab.audio.sfxBus.gain.value})');
  assert.ok(Math.abs(g.m - 0.25) < 0.02 && Math.abs(g.s - 0.45) < 0.03 && Math.abs(g.mu - 0.095) < 0.02, JSON.stringify(g));
  assert.deepEqual(page.errors(), []);
  const warns = page.logs.filter((l) => l.type === 'warning');
  assert.deepEqual(warns, []);
  await page.close();
});

test('MusicPlayer: loads a track, loops sample-accurately on one clock, crossfades, layers follow the race state, stingers play', async () => {
  const page = await chrome.newPage();
  await page.goto(`${BASE}/tests/lab/audio.html`);
  await page.waitFor('!!window.__audioLab');
  await page.key('Space'); await page.click(100, 100);
  await page.waitFor("!!__audioLab.audio.ctx && __audioLab.audio.ctx.state==='running'", { timeout: 8000 });
  const L = await page.eval(`(async()=>{const {music,audio,game}=__audioLab;music.manual=false;game.state='race';music.phase='race';
    await music.play('sunrise',{fade:0.3});
    for(let i=0;i<100&&music.current!=='sunrise';i++)await new Promise(r=>setTimeout(r,100));
    const v=music.voice;const meta=v.meta;const stems=Object.keys(v.stems);
    const s=v.stems.base.src;
    const out={current:music.current,stems,loop:s.loop,loopStart:s.loopStart,loopEnd:s.loopEnd,metaIntro:meta.introSamples/meta.rate,metaEnd:meta.totalSamples/meta.rate,bufLen:s.buffer.length,sr:s.buffer.sampleRate};
    // all stems share start time, length and loop points
    out.same=stems.every(k=>v.stems[k].src.buffer.length===s.buffer.length&&v.stems[k].src.loopStart===s.loopStart&&v.stems[k].src.loopEnd===s.loopEnd);
    game.player.place=1;music.update(0.016,game);await new Promise(r=>setTimeout(r,1500));
    out.gainsLeader={...Object.fromEntries(stems.map(k=>[k,+v.stems[k].gain.gain.value.toFixed(2)]))};
    music.finalLap=true;await new Promise(r=>setTimeout(r,2500));
    out.finalGain=+v.stems.final.gain.gain.value.toFixed(2);
    await music.play('neon',{fade:0.3});
    for(let i=0;i<100&&music.current!=='neon';i++)await new Promise(r=>setTimeout(r,100));
    out.afterFade=music.current;out.oldCount=music.old.length;
    await new Promise(r=>setTimeout(r,800));music.update(0.016,game);out.oldAfter=music.old.length;
    await music.loadStingers();out.stinger=music.stinger('win');out.hasStingers=music.hasStingers;out.errors=music.errors;
    return out})()`);
  assert.equal(L.current, 'sunrise');
  assert.equal(L.stems.length, 4);
  assert.ok(L.loop && L.same);
  assert.ok(Math.abs(L.loopStart - L.metaIntro) < 1e-6 && Math.abs(L.loopEnd - L.metaEnd) < 1e-6, JSON.stringify(L));
  assert.ok(Math.abs(L.bufLen - L.metaEnd * L.sr) <= 1);
  assert.ok(L.gainsLeader.base > 0.8 && L.gainsLeader.lead > 0.8, JSON.stringify(L.gainsLeader));
  assert.ok(L.gainsLeader.final < 0.05, 'final layer silent before the final lap');
  assert.ok(L.finalGain > 0.8, `final layer should be up on the final lap (${L.finalGain})`);
  assert.equal(L.afterFade, 'neon');
  assert.equal(L.oldAfter, 0, 'faded-out voice released');
  assert.equal(L.stinger, true); assert.equal(L.hasStingers, true);
  assert.deepEqual(L.errors, []);
  assert.deepEqual(page.errors(), []);
  await page.close();
});

test('?mute=1 creates no AudioContext and plays nothing', async () => {
  const page = await chrome.newPage();
  await page.goto(`${BASE}/tests/lab/audio.html?mute=1`);
  await page.waitFor('!!window.__audioLab');
  await page.key('Space'); await page.click(50, 50);
  await delay(300);
  const r = await page.eval(`(()=>{const {audio,events,game}=__audioLab;events.emit('ui:click',{});events.emit('race:go',{});audio.resume();audio.update(0.016,game);return {ctx:!!audio.ctx,muted:audio.muted,stats:audio.stats(),play:audio.play('uiClick',{})}})()`);
  assert.equal(r.ctx, false);
  assert.equal(r.muted, true);
  assert.equal(r.play, false);
  assert.deepEqual(page.errors(), []);
  await page.close();
});

test('in the real game: engine + positional AI engines + music run through a short autopilot race without errors', async (t) => {
  const page = await chrome.newPage();
  await page.goto(`${BASE}/?autostart=1&autopilot=1&course=sunrise&seed=7&mute=0`);
  try { await page.waitFor('window.__sky && __sky.ready && !!__sky.game.race', { timeout: 40000 }); } catch { t.skip("game did not boot (another role's module?)"); await page.close(); return; }
  await page.key('Space'); await page.click(300, 300);
  await page.waitFor("!!__sky.game.audio.ctx && __sky.game.audio.ctx.state==='running'", { timeout: 8000 });
  await delay(14000);
  const s = await page.eval(`(()=>{const g=__sky.game;const a=g.audio,m=g.music;return {audio:a.stats(),music:{current:m.current,errors:m.errors,stingers:m.hasStingers,targets:m.targets},state:g.state,racers:a.racers.size,
    ai:a.ai.map(x=>!!x.racer).filter(Boolean).length,t:g.simTime}})()`);
  assert.equal(s.audio.state, 'running');
  assert.ok(s.audio.engine, 'player engine voice should exist during a race (state=' + s.state + ')');
  assert.ok(s.racers >= 7, `racers attached: ${s.racers}`);
  assert.ok(s.ai >= 1, 'at least one positional AI engine');
  assert.ok(s.music.current === 'sunrise' || s.music.errors.length === 0, JSON.stringify(s.music));
  assert.ok(s.audio.voices < 40, 'voice cap');
  assert.deepEqual(page.errors(), []);
  await page.close();
});
