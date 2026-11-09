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
import {inspectCapturePixels} from './axis01-pixels.mjs';
import {buildGraph,components,shortestPath} from '../core/graph.ts';

/** One continuous OSM ECML line, from a mapped buffer to the extract's northern edge. */
export function ecmlSectionRoute(data) {
  const graph=buildGraph({...data,rails:data.rails.filter(r=>r.ref==='ECM1')}),component=components(graph)[0]??[];
  const buffers=data.buffers.filter(b=>component.includes(b.id)).sort((a,b)=>graph.pos.get(b.id)[1]-graph.pos.get(a.id)[1]||a.id-b.id);
  if(!buffers.length)throw new Error('no connected OSM ECML buffer for section');
  // An undirected shortest path can zigzag back through throat crossovers to another line.
  const north={...graph,adj:new Map([...graph.adj].map(([id,edges])=>[id,edges.filter(e=>graph.pos.get(e.a===id?e.b:e.a)[1]<=graph.pos.get(id)[1]+.25)]))};
  const ends=component.filter(id=>graph.adj.get(id).length===1).sort((a,b)=>graph.pos.get(a)[1]-graph.pos.get(b)[1]);
  let selected;
  for(const to of ends){
    const choices=buffers.filter(b=>graph.pos.get(to)[1]<graph.pos.get(b.id)[1]).map(b=>({from:b.id,to,route:shortestPath(north,b.id,to)})).filter(c=>c.route);
    if(choices.length){selected=choices.sort((a,b)=>a.route.length-b.route.length)[0];break;}
  }
  const {from,to,route}=selected??{};
  if(!route||route.nodes.length<2)throw new Error('no continuous ECML section to northern edge');
  const segments=route.nodes.slice(1).map((id,i)=>{
    const previous=route.nodes[i],edge=graph.adj.get(previous).find(e=>e.a===id||e.b===id);
    return {from:previous,to:id,a:graph.pos.get(previous),b:graph.pos.get(id),wayId:edge.wayId,tunnel:edge.tunnel};
  });
  return {from,to,lengthM:route.length,segments,basis:'Shortest northbound OSM ECM1 route from a mapped buffer to the northernmost reachable degree-one extract edge; no southbound throat reversals. Ends inside Copenhagen tunnel, not a surveyed north portal.'};
}

export function captureSpecification(report) {
  const refs=report?.platforms?.map(p=>p.ref).sort((a,b)=>+a-+b);
  if(!refs||JSON.stringify(refs)!==JSON.stringify(Array.from({length:11},(_,i)=>String(i)))||!report.inputs?.graph?.sha256||
    report.platforms.some(p=>!p.drawnTopSamples?.length))throw new Error('capture needs measured platforms 0–10 and drawn top samples');
  return {bounds:joinBounds(report.captureBounds.station,report.captureBounds.throat),views:[{id:'top',width:1280,height:1000},{id:'side',title:'26 m carriage longitudinal cutaway, platform height and rails',width:1280,height:600},{id:'arch',title:'Shed transverse arch cutaway',width:1280,height:800},{id:'portal',title:'Gasworks south portal opening',width:1280,height:650},{id:'terrain-section',title:'ECML buffer to Copenhagen extract edge: orange ground, blue drawn rails; vertical exaggeration 10x',width:2000,height:700}]};
}
export function checkCapture(view,observed,{requirePixels=false}={}) {
  if(requirePixels&&!observed?.pixels?.clear)throw Object.assign(new Error(`invalid ${view} PNG: ${observed?.pixels?.reason??'pixel evidence missing'}`),{details:observed?.pixels});
  if((view!=='top'&&(!observed?.visibility?.extentM||observed.visibility.extentM.some(v=>!Number.isFinite(v)||v<=0)))||observed?.view!==view||!observed.visibility?.clear||!observed.visibility.labels?.clear||!observed.rendered?.grid||(['top','side','arch'].includes(view)&&(!observed.rendered?.track||!observed.rendered?.platforms))||(view!=='top'&&!observed.rendered?.targets)||
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
  report.sectionRoute=ecmlSectionRoute(JSON.parse(await readFile(path.resolve(root,report.inputs.graph.path),'utf8')));
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
      const prepared=await evaluate(`(async()=>{const k=window.__kx;await k.cityLoaded;window.__signalFrame(0);if(!k.parts.terrain)throw new Error('drawn terrain unavailable');const T=await import('/capture/three.core.js'),F=await import('/capture/axis01-grid.mjs');const evidence=${view.id!=='top'}?F.prepareSideEvidence(T,k.scene,${JSON.stringify(view.id)},${JSON.stringify(report)},k.parts.terrain,k.trains):null;const bounds=evidence?.bounds??${JSON.stringify(spec.bounds)},projection=evidence?.projection??'top',hidden=evidence?.hidden??F.prepareGeometryScene(k.scene,'top'),plan=F.gridPlan(bounds,projection,10,{verticalScale:evidence?.verticalScale??1,chainage:Boolean(evidence?.section)});const grid=F.addGrid(T,k.scene,plan),framed=F.geometryCamera(T,bounds,projection,${view.width},${view.height},evidence?.section?null:k.parts.terrain);const camera=framed.camera;if(evidence?.view==='side'){camera.near=camera.position.x-(evidence.bounds.x[1]+.1);camera.updateProjectionMatrix();framed.metadata.frustum.near=camera.near;}const layout=F.layoutGridLabels(T,camera,plan,bounds,${view.width},${view.height});const labelNodes=layout.labels.map(label=>{const node=document.createElement('div');node.textContent=label.text;node.dataset.axis=label.axis;node.style.cssText='position:fixed;pointer-events:none;box-sizing:border-box;white-space:nowrap;background:rgba(255,255,255,.93);color:#12334a;font:13px/20px monospace;padding:0 4px;z-index:950';node.style.left=label.rect.left+'px';node.style.top=label.rect.top+'px';node.style.width=(label.rect.right-label.rect.left)+'px';document.body.append(node);return node;});grid.userData.draws=0;grid.traverse(o=>{if(o.isLineSegments)o.onAfterRender=()=>grid.userData.draws++;});for(const name of ['track','platforms']){const g=k.scene.getObjectByName(name);g.userData.draws=0;g.traverse(o=>{if(o.isMesh)o.onAfterRender=()=>g.userData.draws++;});}if(evidence){evidence.draws=0;for(const name of evidence.targetNames){const target=k.scene.getObjectByName(name);target?.traverse(o=>{if(o.isMesh||o.isLine)o.onAfterRender=()=>evidence.draws++;});}}const legend=document.createElement('div');legend.textContent=${JSON.stringify('10 m reference grid · '+(view.title??'station and throat top')+(view.id==='terrain-section'?' · orange ground / blue rail geometry · surface y=0 m; schematic tunnel lines y=−4 m · y labels: TRUE metres; plotted height 10×':' · equal metre scale · y=0 rail datum'))};legend.style.cssText='position:fixed;top:54px;right:16px;max-width:min(340px,calc(100vw - 32px));background:#fff;color:#12334a;padding:8px 12px;font:14px monospace;z-index:900';document.body.append(legend);k.renderer.render(k.scene,camera);window.__geometryCapture={T,F,grid,plan,camera,bounds,evidence,labelNodes,legend};return {title:${JSON.stringify(view.title??'Station and throat top')},camera:framed.metadata,hidden,evidence,grid:{spacingM:plan.spacingM,meaning:plan.meaning,lineCount:plan.lines.length}};})()`);
      const inspect=()=>evaluate(`(()=>{const k=window.__kx,{T,F,grid,plan,camera,bounds,evidence,labelNodes,legend}=window.__geometryCapture,g=k.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');grid.userData.labelRects=labelNodes.map(node=>{const r=node.getBoundingClientRect();return {text:node.textContent,axis:node.dataset.axis,fontPx:parseFloat(getComputedStyle(node).fontSize),rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom}};});return {view:${JSON.stringify(view.id)},renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),rendered:{targets:evidence?evidence.draws>0:null,grid:grid.userData.draws>0,track:k.scene.getObjectByName('track').userData.draws>0,platforms:k.scene.getObjectByName('platforms').userData.draws>0},visibility:F.inspectGeometryFrame(T,k.scene,camera,grid,plan,bounds,${JSON.stringify(report.platforms)},${view.width},${view.height},evidence),pixelPlan:F.pixelSpecification(T,k.scene,camera,plan,bounds,${view.width},${view.height},evidence,[...grid.userData.labelRects.map(l=>l.rect),(()=>{const r=legend.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()])};})()`);
      const observed=await inspect();checkCapture(view.id,observed);
      const png=await send('Page.captureScreenshot',{format:'png'}),pngBytes=Buffer.from(png.data,'base64');
      await evaluate(`(()=>{const k=window.__kx,{F,camera,grid}=window.__geometryCapture;F.renderGridBaseline(k.renderer,k.scene,camera,grid);})()`);
      let baseline;
      try {baseline=await send('Page.captureScreenshot',{format:'png'});}
      finally {await evaluate(`(()=>{const k=window.__kx;k.renderer.render(k.scene,window.__geometryCapture.camera);})()`);}
      observed.pixels=inspectCapturePixels(pngBytes,Buffer.from(baseline.data,'base64'),observed.pixelPlan);
      observed.pixels.baselineSha256=createHash('sha256').update(Buffer.from(baseline.data,'base64')).digest('hex');
      checkCapture(view.id,observed,{requirePixels:true});checkCapture(view.id,await inspect());
      const file=`axis01-${view.id}-10m.png`,shot={view:view.id,file,url,viewport:view,...prepared,observed,inputs:report.inputs,build,reportSha256:createHash('sha256').update(reportBytes).digest('hex'),capturedAt:new Date().toISOString()};
      await writeFile(path.join(out,file),pngBytes,{flag:'wx',mode:0o600});await writeFile(path.join(out,file+'.json'),JSON.stringify(shot,null,2)+'\n',{flag:'wx',mode:0o600});return shot;
    });
  }finally{cdp?.close();cleanup=await cleanupCaptureBrowser(browser,profile);lifetime.dispose();server?.closeAllConnections();if(server?.listening)await new Promise(r=>server.close(r));}
  await writeFile(path.join(out,'captures.json'),JSON.stringify({...result,cleanup},null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({shots:result.shots.length,missing:result.missing,failed:result.failed,out,cleanup}));process.exitCode=result.exitCode;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.stack??e.message);process.exitCode=1;});
