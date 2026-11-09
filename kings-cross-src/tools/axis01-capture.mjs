// Geometric rubric screenshots from a built page and the measured mesh report. No Chrome on import.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,realpath,mkdir,mkdtemp,stat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {manualFrames,cdpPipe} from './signal-capture.mjs';
import {createCaptureLifetime,cleanupCaptureBrowser} from './capture-runtime.mjs';
import {joinBounds} from './axis01-grid.mjs';

export function captureSpecification(report) {
  const refs=report?.platforms?.map(p=>p.ref).sort((a,b)=>+a-+b);
  if(!refs||JSON.stringify(refs)!==JSON.stringify(Array.from({length:11},(_,i)=>String(i)))||!report.inputs?.graph?.sha256||
    report.platforms.some(p=>!p.drawnTopSamples?.length))throw new Error('capture needs measured platforms 0–10 and drawn top samples');
  return {bounds:joinBounds(report.captureBounds.station,report.captureBounds.throat),views:[{id:'top',width:1280,height:1000},{id:'side',title:'26 m carriage longitudinal cutaway, platform height and rails',width:1280,height:600},{id:'arch',title:'Shed transverse arch cutaway',width:1280,height:800},{id:'portal',title:'Gasworks south portal opening',width:1280,height:650},{id:'terrain-section',title:'Drawn terrain section along throat',width:1600,height:600}]};
}
export function checkCapture(view,observed) {
  if((view!=='top'&&(!observed?.visibility?.extentM||observed.visibility.extentM.some(v=>!Number.isFinite(v)||v<=0)))||observed?.view!==view||!observed.visibility?.clear||!observed.rendered?.grid||(['top','side','arch'].includes(view)&&(!observed.rendered?.track||!observed.rendered?.platforms))||(view!=='top'&&!observed.rendered?.targets)||
    !/\bMetal\b/i.test(observed.renderer??'')||/SwiftShader|llvmpipe|software/i.test(observed.renderer??''))
    throw Object.assign(new Error(`invalid ${view} geometry capture: ${observed?.visibility?.reason??'missing real GPU render'}`),{details:observed});
  return true;
}
export async function runViews(views,capture) {
  const shots=[],failed=[];
  for(const view of views)try{shots.push(await capture(view));}catch(error){failed.push({view:view.id,reason:error.message,details:error.details??null});}
  const missing=views.map(v=>v.id).filter(id=>!shots.some(s=>s.view===id));return {shots,failed,missing,exitCode:missing.length?1:0};
}
export async function verifySources(root,report) {
  for(const source of [report.inputs.graph,...report.inputs.sources]) {
    const file=path.resolve(root,source.path),relative=path.relative(root,file);
    if(relative.startsWith('..')||path.isAbsolute(relative)||!/^[a-f0-9]{64}$/.test(source.sha256))throw new Error('invalid source fingerprint');
    if(createHash('sha256').update(await readFile(file)).digest('hex')!==source.sha256)throw new Error(`source changed since measurement: ${source.path}; regenerate report and build`);
  }
}
export async function main(args=process.argv.slice(2)) {
  const opts=new Map();for(let i=0;i<args.length;i+=2){if(!['--report','--dist','--out','--chrome'].includes(args[i])||!args[i+1]||opts.has(args[i]))throw new Error('usage: axis01-capture.mjs --report <axis01-evidence.json> --dist <built dist> --out <.scratch/shots> [--chrome none|path]');opts.set(args[i],args[i+1]);}
  const requirePath=n=>{if(!opts.has(n))throw new Error(`missing ${n}`);return path.resolve(opts.get(n));};
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),scratch=await realpath(path.join(root,'.scratch')),reportFile=requirePath('--report');
  const reportBytes=await readFile(reportFile),report=JSON.parse(reportBytes),spec=captureSpecification(report);
  await verifySources(root,report);
  const out=requirePath('--out'),inside=p=>{const r=path.relative(scratch,p);return !r.startsWith('..')&&!path.isAbsolute(r);};
  if(!inside(out))throw new Error('--out must be under worktree .scratch');
  let parent=out;for(;;){try{if(!inside(await realpath(parent)))throw new Error('output symlink escapes .scratch');break;}catch(e){if(e.code!=='ENOENT')throw e;parent=path.dirname(parent);}}
  const dist=await realpath(requirePath('--dist'));await mkdir(out,{recursive:true});
  const assets=await readdir(path.join(dist,'assets')),build=[];
  for(const name of ['index.html',...assets.map(n=>'assets/'+n)])build.push({file:name,sha256:createHash('sha256').update(await readFile(path.join(dist,name))).digest('hex')});
  if(opts.get('--chrome')==='none'){console.log(JSON.stringify({inputsVerified:true,views:spec.views,bounds:spec.bounds,gridM:10,build}));return;}
  const chromePath=opts.get('--chrome')??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';await stat(chromePath);
  let browser,cdp,profile,server,cleanup,result;
  const lifetime=createCaptureLifetime({timeoutMs:180000,onStop:()=>cdp?.close()});
  try {
    server=createServer(async(req,res)=>{try{
      const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
      if(u.pathname.startsWith('/relay/')){res.writeHead(404,{'content-type':'application/json'}).end('{"error":"offline geometry capture"}');return;}
      let file;if(u.pathname==='/capture/axis01-grid.mjs')file=path.join(root,'kings-cross-src/tools/axis01-grid.mjs');else if(u.pathname==='/capture/three.core.js')file=path.join(root,'kings-cross-src/node_modules/three/build/three.core.js');else if(u.pathname==='/almanac-back.js')file=path.join(root,'almanac-back.js');else if(['/kings-cross/','/kings-cross'].includes(u.pathname))file=path.join(dist,'index.html');else if(u.pathname.startsWith('/kings-cross/')){file=path.resolve(dist,decodeURIComponent(u.pathname.slice(13)));if(!file.startsWith(dist+path.sep))throw new Error('path escape');}
      if(!file){res.writeHead(404).end();return;}const bytes=await readFile(file);res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'}).end(bytes);
    }catch{res.writeHead(404).end();}});
    await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
    profile=await mkdtemp(path.join(scratch,'axis01-chrome-'));
    browser=spawn(chromePath,['--headless=new','--remote-debugging-pipe',`--user-data-dir=${profile}`,'--no-sandbox','--no-first-run','--no-default-browser-check','--disable-breakpad','--disable-crash-reporter','--noerrdialogs','--use-mock-keychain','--password-store=basic','--no-proxy-server','--ignore-gpu-blocklist','--use-angle=metal','--enable-gpu-rasterization','about:blank'],{detached:true,stdio:['ignore','ignore','ignore','pipe','pipe']});
    lifetime.attach(browser);
    cdp=cdpPipe(browser);const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
    const send=(m,p)=>{lifetime.check();return cdp.send(m,p,sessionId);},evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:`(${manualFrames.toString()})();window.__captureDocument=location.href;`});
    result=await runViews(spec.views,async view=>{
      await send('Emulation.setDeviceMetricsOverride',{width:view.width,height:view.height,deviceScaleFactor:1,mobile:false});
      const url=`http://127.0.0.1:${server.address().port}/kings-cross/?trains=${view.id==='side'?'demo':'none'}&signals=0&board=0&tooltip=0&capture=${view.id}`;
      await send('Page.navigate',{url});const deadline=Date.now()+60000;
      for(;;){let ready=false;try{ready=await evaluate(`window.__captureDocument===${JSON.stringify(url)}&&!!window.__kx?.ready`);}catch(error){if(!/context|navigat/i.test(error.message))throw error;}
        if(ready)break;if(Date.now()>deadline)throw new Error('geometry page startup timed out');await new Promise(r=>setTimeout(r,100));}
      const prepared=await evaluate(`(async()=>{const k=window.__kx;await k.cityLoaded;window.__signalFrame(0);if(!k.parts.terrain)throw new Error('drawn terrain unavailable');const T=await import('/capture/three.core.js'),F=await import('/capture/axis01-grid.mjs');const evidence=${view.id!=='top'}?F.prepareSideEvidence(T,k.scene,${JSON.stringify(view.id)},${JSON.stringify(report)},k.parts.terrain,k.trains):null;const bounds=evidence?.bounds??${JSON.stringify(spec.bounds)},projection=evidence?.projection??'top',hidden=evidence?.hidden??F.prepareGeometryScene(k.scene,'top'),plan=F.gridPlan(bounds,projection);const labelFactory=label=>{const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='rgba(255,255,255,.9)';ctx.fillRect(0,0,256,64);ctx.fillStyle='#12334a';ctx.font='32px monospace';ctx.textAlign='center';ctx.fillText(label.text,128,44);const texture=new T.CanvasTexture(c),sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,depthWrite:false}));sprite.position.set(...label.position);sprite.scale.set(24,6,1);sprite.renderOrder=10001;return sprite;};const grid=F.addGrid(T,k.scene,plan,labelFactory),framed=F.geometryCamera(T,bounds,projection,${view.width},${view.height},k.parts.terrain);const camera=framed.camera;if(evidence?.view==='side'){camera.near=camera.position.x-(evidence.bounds.x[1]+.1);camera.updateProjectionMatrix();framed.metadata.frustum.near=camera.near;}grid.userData.draws=0;grid.traverse(o=>{if(o.isLineSegments)o.onAfterRender=()=>grid.userData.draws++;});for(const name of ['track','platforms']){const g=k.scene.getObjectByName(name);g.userData.draws=0;g.traverse(o=>{if(o.isMesh)o.onAfterRender=()=>g.userData.draws++;});}if(evidence){evidence.draws=0;for(const name of evidence.targetNames){const target=k.scene.getObjectByName(name);target?.traverse(o=>{if(o.isMesh||o.isLine)o.onAfterRender=()=>evidence.draws++;});}}const legend=document.createElement('div');legend.textContent=${JSON.stringify('10 m reference grid · '+(view.title??'station and throat top')+' · equal metre scale · y=0 rail datum')};legend.style.cssText='position:fixed;top:54px;right:16px;max-width:min(340px,calc(100vw - 32px));background:#fff;color:#12334a;padding:8px 12px;font:14px monospace;z-index:900';document.body.append(legend);k.renderer.render(k.scene,camera);window.__geometryCapture={T,F,grid,plan,camera,bounds,evidence};return {title:${JSON.stringify(view.title??'Station and throat top')},camera:framed.metadata,hidden,evidence,grid:{spacingM:plan.spacingM,meaning:plan.meaning,lineCount:plan.lines.length}};})()`);
      const inspect=()=>evaluate(`(()=>{const k=window.__kx,{T,F,grid,plan,camera,bounds,evidence}=window.__geometryCapture,g=k.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {view:${JSON.stringify(view.id)},renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),rendered:{targets:evidence?evidence.draws>0:null,grid:grid.userData.draws>0,track:k.scene.getObjectByName('track').userData.draws>0,platforms:k.scene.getObjectByName('platforms').userData.draws>0},visibility:F.inspectGeometryFrame(T,k.scene,camera,grid,plan,bounds,${JSON.stringify(report.platforms)},${view.width},${view.height},evidence)};})()`);
      const observed=await inspect();checkCapture(view.id,observed);const png=await send('Page.captureScreenshot',{format:'png'});checkCapture(view.id,await inspect());
      const file=`axis01-${view.id}-10m.png`,shot={view:view.id,file,url,viewport:view,...prepared,observed,inputs:report.inputs,build,reportSha256:createHash('sha256').update(reportBytes).digest('hex'),capturedAt:new Date().toISOString()};
      await writeFile(path.join(out,file),Buffer.from(png.data,'base64'),{flag:'wx',mode:0o600});await writeFile(path.join(out,file+'.json'),JSON.stringify(shot,null,2)+'\n',{flag:'wx',mode:0o600});return shot;
    });
  }finally{cdp?.close();cleanup=await cleanupCaptureBrowser(browser,profile);lifetime.dispose();server?.closeAllConnections();if(server?.listening)await new Promise(r=>server.close(r));}
  await writeFile(path.join(out,'captures.json'),JSON.stringify({...result,cleanup},null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({shots:result.shots.length,missing:result.missing,failed:result.failed,out,cleanup}));process.exitCode=result.exitCode;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.stack??e.message);process.exitCode=1;});
