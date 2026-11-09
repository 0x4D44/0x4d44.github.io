// GPU evidence from frozen recorded bytes and the real table; import-safe Node preflight/tests.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile, realpath, stat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export { captureCamera } from './signal-framing.mjs';

export function manualFrames() {
  let serial = 0, pending = new Map();
  window.requestAnimationFrame = fn => { pending.set(++serial, fn); return serial; };
  window.cancelAnimationFrame = id => pending.delete(id);
  window.__signalFrame = time => { const frame = pending; pending = new Map(); for (const callback of frame.values()) callback(time); };
}
export function verifyShot(expected, actual) {
  if (!actual || actual.id !== expected.headId || actual.berth !== expected.berth || actual.state !== expected.state ||
      actual.timeMs !== expected.timeMs || !actual.rendered || !actual.visibility?.clear || (expected.post && (!actual.post || expected.post.some((v,i)=>Math.abs(v-actual.post[i])>1e-6)))) {
    const view=actual?.visibility, blocker=view?.occluder?` by ${view.blocker} at ${view.occluder.distanceM} m`:'';
    throw Object.assign(new Error(`Rendered head, recorded clock, aspect or unobstructed view disagrees with capture plan${view?.reason ? ': '+view.reason+blocker : ''}`),{details:view??null});
  }
  return true;
}
/** Chrome can keep writing after kill(). Wait for exit, then retry deletion; cleanup never loses good shots. */
export async function cleanupBrowser(child, profile, { remove = rm, warn = console.warn, timeoutMs = 5000 } = {}) {
  const warnings = [];
  const note = message => { warnings.push(message); warn(message); };
  let exited = !child || child.exitCode != null || child.signalCode != null || child.pid === undefined;
  try {
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      if (exited) break;
      exited = await new Promise(resolve => {
        const finish = value => { clearTimeout(timer); child.removeListener('exit', done); child.removeListener('error', done); resolve(value); };
        const done = () => finish(true);
        const timer = setTimeout(() => finish(false), timeoutMs);
        child.once('exit', done); child.once('error', done);
        try { child.kill(signal); } catch { finish(false); }
      });
    }
    if (!exited) note(`Chrome did not exit; temporary profile retained at ${profile}`);
    else if (profile) {
      try { await remove(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
      catch (error) { note(`Temporary profile cleanup failed (${error.code ?? error.message}); retained at ${profile}`); }
    }
  } catch (error) { note(`Browser cleanup failed (${error.code ?? error.message}); temporary profile retained at ${profile}`); }
  return { exited, profileRetained: profile && (!exited || warnings.length) ? profile : null, warnings };
}
export function validatePack(report) {
  if (!report?.inputs?.anchors || !report.inputs.table || !Array.isArray(report.inputs.recordings) || !Array.isArray(report.captures) ||
      !Array.isArray(report.heads) || !Array.isArray(report.intervals) || !Array.isArray(report.states)) throw new Error('invalid signal report');
  const plans = report.captures.flatMap(group => group.cases.map(c => ({ ...c, recording: group.recording })));
  if (!plans.length) throw new Error('no observed decoded-head states to capture');
  for (const plan of plans) {
    const head = report.heads.find(h => h.id === plan.headId && h.berth === plan.berth && h.decoded);
    if (!head || !report.states.includes(plan.state) || !Number.isFinite(plan.timeMs) || plan.timeMs <= plan.startMs || plan.timeMs >= plan.endMs ||
        !Number.isSafeInteger(plan.recording) || !report.inputs.recordings[plan.recording] ||
        !report.intervals.some(i => i.headId === plan.headId && i.berth === plan.berth && i.state === plan.state && i.recording === plan.recording &&
          i.startMs === plan.startMs && i.endMs === plan.endMs)) throw new Error('capture case lacks a recorded interval and positioned decoded head');
  }
  // Required proof comes from observed intervals, not from the cases a plan chose
  // to retain. A state never observed in a decoded head must not be invented.
  for (const interval of report.intervals) {
    if (!report.states.includes(interval.state) || !Number.isFinite(interval.startMs) || !Number.isFinite(interval.endMs) ||
        interval.endMs - interval.startMs < 2 || !report.heads.some(h=>h.id===interval.headId && h.berth===interval.berth && h.decoded)) continue;
    if (!plans.some(p=>p.recording===interval.recording && p.state===interval.state))
      throw new Error(`recording ${interval.recording} observed ${interval.state} has no capture case`);
  }
  return plans;
}
/** Try another genuinely observed head for the same state; never manufacture a byte or aspect. */
export function captureAlternatives(report, preferred) {
  const candidates = report.intervals.filter(i => i.recording === preferred.recording && i.state === preferred.state &&
    i.endMs - i.startMs >= 2 && report.heads.some(h => h.id === i.headId && h.berth === i.berth && h.decoded))
    .sort((a,b) => Number(b.headId > 0)-Number(a.headId > 0) || a.startMs-b.startMs);
  const seen = new Set([preferred.headId]), result = [preferred];
  for (const i of candidates) if (!seen.has(i.headId)) {
    seen.add(i.headId);result.push({...i,timeMs:i.startMs+Math.min(500,(i.endMs-i.startMs)/2)});
  }
  return result;
}
export async function runCapturePlans(report, capture) {
  const plans = validatePack(report), shots = [], failed = [];
  for (const preferred of plans) for (const plan of captureAlternatives(report, preferred)) {
    try {
      const shot=await capture(plan);
      if (!shot || ['recording','headId','berth','state','timeMs','startMs','endMs'].some(key=>shot[key]!==plan[key]))
        throw new Error('capture result does not match the recorded case');
      shots.push(shot); break;
    }
    catch (error) { failed.push({ ...plan, reason: error.message, details: error.details ?? null }); }
  }
  const required = plans.filter((p,i)=>plans.findIndex(other=>other.recording===p.recording && other.state===p.state)===i);
  const missingCases = required.filter(p=>!shots.some(s=>s.recording===p.recording && s.state===p.state)).map(p=>({recording:p.recording,state:p.state}));
  const missingStates = [...new Set(missingCases.map(p=>p.state))];
  const coverage = report.inputs.recordings.map((_,recording)=>({recording,
    observedStates:required.filter(p=>p.recording===recording).map(p=>p.state),
    capturedStates:[...new Set(shots.filter(s=>s.recording===recording).map(s=>s.state))],
    missingStates:missingCases.filter(p=>p.recording===recording).map(p=>p.state)}));
  return { shots, failed, missingStates, missingCases, coverage, exitCode: missingStates.length ? 1 : 0 };
}
export async function checkedInput(pack, entry) {
  if (!entry || typeof entry.file !== 'string' || path.basename(entry.file) !== entry.file || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('invalid frozen input');
  const file = path.join(pack, entry.file), bytes = await readFile(file);
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`frozen input hash mismatch: ${entry.file}`);
  return bytes;
}
export function frozenEndpoint(url, frozen) {
  const u = new URL(url, 'http://127.0.0.1');
  if (u.pathname === '/relay/anchors') return { type:'application/json', body:frozen.anchors };
  if (u.pathname === '/relay/sclass') return { type:'application/json', body:frozen.table };
  if (u.pathname === '/relay/recording') return { type:'application/x-ndjson', body:frozen.recording };
  if (u.pathname.startsWith('/relay/')) return { status:404, type:'application/json', body:'{"error":"not in frozen signal pack"}' };
}
// A dedicated pipe keeps this script independent of another worker's evidence harness.
export function cdpPipe(child) {
  let id=0, buffer='', closed=false; const pending=new Map(), writer=child.stdio[3], reader=child.stdio[4];
  const close=()=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP closed'));}pending.clear();};
  reader.setEncoding('utf8');reader.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);let m;try{m=JSON.parse(raw);}catch{continue;}const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}});
  child.once('error',close);child.once('exit',close);reader.once('error',close);writer.once('error',close);
  return {close,send(method,params={},sessionId){return new Promise((resolve,reject)=>{if(closed){reject(new Error('CDP closed'));return;}const serial=++id,timer=setTimeout(()=>{pending.delete(serial);reject(new Error(`CDP timeout: ${method}`));},60000);pending.set(serial,{resolve,reject,timer});writer.write(JSON.stringify({id:serial,method,params,...(sessionId?{sessionId}:{})})+'\0');});}};
}
export async function main(args=process.argv.slice(2)) {
  const options=new Map();
  for(let i=0;i<args.length;i+=2){if(!['--pack','--dist','--out','--chrome'].includes(args[i])||!args[i+1]||options.has(args[i]))throw new Error('usage: signal-capture.mjs --pack <signal-report.json> --dist <built dist> --out <worktree/.scratch/shots> [--chrome <path>]');options.set(args[i],args[i+1]);}
  const required=name=>{if(!options.has(name))throw new Error(`missing ${name}`);return path.resolve(options.get(name));};
  const packFile=required('--pack'),pack=path.dirname(packFile),dist=await realpath(required('--dist')),out=required('--out');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),scratch=await realpath(path.join(root,'.scratch'));
  const inside=p=>{const r=path.relative(scratch,p);return r===''||!r.startsWith('..')&&!path.isAbsolute(r);};
  if(!inside(out))throw new Error('--out must be in worktree .scratch');
  let parent=out;for(;;){try{if(!inside(await realpath(parent)))throw new Error('output symlink escapes .scratch');break;}catch(e){if(e.code!=='ENOENT')throw e;parent=path.dirname(parent);}}
  await mkdir(out,{recursive:true});
  const report=JSON.parse(await readFile(packFile,'utf8')),plans=validatePack(report);
  const frozen={anchors:await checkedInput(pack,report.inputs.anchors),table:await checkedInput(pack,report.inputs.table),recording:null};
  const recordings=await Promise.all(report.inputs.recordings.map(e=>checkedInput(pack,e)));
  const overlay=JSON.parse(await readFile(path.join(root,'kings-cross-src/web/src/data/kx-signals.json'),'utf8'));
  if(createHash('sha256').update(JSON.stringify(overlay)).digest('hex')!==report.inputs.overlaySha256)throw new Error('overlay changed; regenerate the report and build');
  // --chrome none validates the real frozen inputs without launching a browser.
  if(options.get('--chrome')==='none'){console.log(JSON.stringify({plans:plans.length,states:[...new Set(plans.map(p=>p.state))],inputsVerified:true}));return;}
  const chromePath=options.get('--chrome')??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';await stat(chromePath);
  let chrome,cdp,profile,server,cleanup,result;
  try {
    server=createServer(async(req,res)=>{try{
      const endpoint=frozenEndpoint(req.url,frozen);if(endpoint){res.writeHead(endpoint.status??200,{'content-type':endpoint.type,'cache-control':'no-store'}).end(endpoint.body);return;}
      const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
      let file;if(u.pathname==='/capture/signal-framing.mjs')file=path.join(root,'kings-cross-src/tools/signal-framing.mjs');else if(u.pathname==='/capture/three.core.js')file=path.join(root,'kings-cross-src/node_modules/three/build/three.core.js');else if(u.pathname==='/almanac-back.js')file=path.join(root,'almanac-back.js');else if(u.pathname==='/kings-cross/'||u.pathname==='/kings-cross')file=path.join(dist,'index.html');else if(u.pathname.startsWith('/kings-cross/')){file=path.resolve(dist,decodeURIComponent(u.pathname.slice('/kings-cross/'.length)));if(!file.startsWith(dist+path.sep))throw new Error('path escape');}
      if(!file){res.writeHead(404).end();return;}const bytes=await readFile(file);const type=/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.html')?'text/html':'application/octet-stream';res.writeHead(200,{'content-type':type}).end(bytes);
    }catch{res.writeHead(404).end();}});
    await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
    profile=await mkdtemp(path.join(scratch,'signal-capture-chrome-'));
    chrome=spawn(chromePath,['--headless=new','--remote-debugging-pipe',`--user-data-dir=${profile}`,'--no-sandbox','--no-first-run','--no-default-browser-check','--disable-breakpad','--disable-crash-reporter','--noerrdialogs','--use-mock-keychain','--password-store=basic','--no-proxy-server','--ignore-gpu-blocklist','--use-angle=metal','--enable-gpu-rasterization','about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
    cdp=cdpPipe(chrome);const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});const send=(method,params)=>cdp.send(method,params,sessionId);
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`(${manualFrames.toString()})();`});
    result=await runCapturePlans(report,async plan=>{
      frozen.recording=recordings[plan.recording];const rows=frozen.recording.toString().trim().split('\n').map(JSON.parse),start=rows.reduce((s,r)=>Math.min(s,r.t),Infinity);
      const date=new Date(plan.timeMs).toISOString().slice(0,10).replaceAll('-','');const url=`http://127.0.0.1:${server.address().port}/kings-cross/?trains=replay&date=${date}&speed=1&signals=1&board=0&tooltip=0`;
      await send('Page.navigate',{url});const deadline=Date.now()+60000;
      while(!await evaluate("!!window.__kx?.motion && window.__kx.feed.connection==='playing'")){if(Date.now()>deadline)throw new Error('replay startup timed out');await new Promise(r=>setTimeout(r,100));}
      const head=report.heads.find(h=>h.id===plan.headId);
      const framed=await evaluate(`(async()=>{const k=window.__kx;await k.cityLoaded;await k.signals.loadTable();for(const p of [k.parts?.shed,k.parts?.buildings])if(p)p.visible=false;const r=k.signals.signals().find(r=>r.signal.id===${plan.headId});if(!r)throw new Error('planned head missing');r.group.userData.signalCaptureDraws=0;r.group.getObjectByName('aspect').onAfterRender=()=>r.group.userData.signalCaptureDraws++;window.__signalFrame(0);window.__signalFrame(${plan.timeMs-start});const T=await import('/capture/three.core.js'),F=await import('/capture/signal-framing.mjs');window.__signalFraming={T,F};try{const view=F.frameSignalView(T,k.scene,k.camera,k.controls,r.group,k.parts?.terrain);window.__signalFrame(${plan.timeMs-start});return {ok:true,view};}catch(error){return {ok:false,reason:error.message,details:error.details??null};}})()`);
      if(!framed.ok)throw Object.assign(new Error(framed.reason),{details:framed.details});
      const camera=framed.view;
      const inspect=()=>evaluate(`(()=>{const k=window.__kx,r=k.signals.signals().find(r=>r.signal.id===${plan.headId}),{T,F}=window.__signalFraming;return r?{id:r.signal.id,berth:r.group.userData.berth,state:r.state,timeMs:k.feed.timeMs,rendered:r.group.userData.signalCaptureDraws>0,post:[r.group.position.x,r.group.position.y,r.group.position.z],visibility:F.inspectSignalFrame(T,k.scene,k.camera,r.group,k.parts?.terrain)}:null;})()`);
      const before=await inspect();verifyShot({...plan,post:head.post},before);
      const renderer=await evaluate("(()=>{const g=window.__kx.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);})()");
      if(!/Metal/i.test(renderer)||/SwiftShader|llvmpipe|software/i.test(renderer))throw new Error(`real Metal GPU required: ${renderer}`);
      const png=await send('Page.captureScreenshot',{format:'png'});verifyShot({...plan,post:head.post},await inspect());
      const file=`recording-${plan.recording}-${plan.state}-head-${plan.headId}.png`;await writeFile(path.join(out,file),Buffer.from(png.data,'base64'),{flag:'wx',mode:0o600});
      const shot={...plan,utc:new Date(plan.timeMs).toISOString(),file,camera,url,renderer,observed:before,input:report.inputs.recordings[plan.recording],table:report.inputs.table,positionSource:head.positionSource,positionReason:head.positionReason,cutaway:'shed and city hidden to expose the existing head; no signal or byte changed'};
      await writeFile(path.join(out,file+'.json'),JSON.stringify(shot,null,2)+'\n',{flag:'wx',mode:0o600});return shot;
    });
  }finally{cdp?.close();cleanup=await cleanupBrowser(chrome,profile);server?.closeAllConnections();if(server?.listening)await new Promise(r=>server.close(r));}
  await writeFile(path.join(out,'captures.json'),JSON.stringify({...result,unsupportedStates:report.unsupportedStates,cleanup},null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({shots:result.shots.length,failed:result.failed.length,missingStates:result.missingStates,out,cleanup}));
  process.exitCode=result.exitCode;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
