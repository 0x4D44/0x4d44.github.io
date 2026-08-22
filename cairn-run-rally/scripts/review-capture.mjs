import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root=new URL('../',import.meta.url),port=9444;
const output=new URL('../artifacts/review/',import.meta.url);
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
const candidates=[process.env.CHROME_BIN,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].filter(Boolean);
const chrome=candidates.find(existsSync);if(!chrome)throw new Error('Chromium required');
const profile=await mkdtemp(join(tmpdir(),'cairn-review-'));
const chromeArgs=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl',`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'--window-size=1280,720','about:blank'];
let command=chrome,args=chromeArgs;
if(process.platform==='linux'&&spawnSync('sh',['-lc','command -v xvfb-run'],{encoding:'utf8'}).status===0){command='xvfb-run';args=['-a',chrome,'--use-gl=angle','--use-angle=swiftshader',...chromeArgs];}else args=['--headless=new',...chromeArgs];
const child=spawn(command,args,{detached:process.platform!=='win32',stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',d=>stderr+=d);let ws;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let version=null;for(let i=0;i<80;i++){try{version=await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok?r.json():null);if(version)break;}catch{}await wait(250);}if(!version)throw new Error(stderr.slice(-1000));
 const html=(await readFile(new URL('index.html',root),'utf8')).replace(/<link[^>]+style\.css[^>]*>/,'').replace(/<script type="module"[^>]*><\/script>/,'');
 const css=await readFile(new URL('src/style.css',root),'utf8');
 const order=['math.js','stage.js','vehicle.js','race.js','renderer.js','world.js','input.js','audio.js','game.js','main.js'];let bundle='';
 for(const file of order){let code=await readFile(new URL(`src/${file}`,root),'utf8');code=code.replace(/^import .*?;\s*$/gm,'').replace(/\bexport\s+(?=(class|function|const|let|var)\b)/g,'');bundle+=`\n// ${file}\n${code}\n`;}
 bundle=bundle.replace('new CairnRunGame();','window.__game = new CairnRunGame();');
 const target=await fetch(`http://127.0.0.1:${port}/json/new`,{method:'PUT'}).then(r=>r.json());ws=new WebSocket(target.webSocketDebuggerUrl);let id=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 const tree=await send('Page.getFrameTree');await send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:html.replace('</head>',`<style>${css}</style></head>`)});
 const evaluated=await send('Runtime.evaluate',{expression:bundle,awaitPromise:true,userGesture:true});if(evaluated.exceptionDetails)throw new Error(evaluated.exceptionDetails.text);await wait(900);
 const shot=async name=>{const result=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await writeFile(new URL(`${name}.png`,output),Buffer.from(result.data,'base64'));};
 await shot('00-title');
 await send('Runtime.evaluate',{expression:'document.getElementById("settings-button").click()'});await wait(220);await shot('01-settings');
 await send('Runtime.evaluate',{expression:'document.getElementById("settings-back").click();window.__game.beginRun(false);window.__game.race.countdown=0;window.__game.race.state="racing";',awaitPromise:true,userGesture:true});await wait(320);
 const positions=[
  ['02-launch',300,28,0,null],['03-loose-tightens',1410,24,.18,4],['04-quarry-hairpin',1805,17,-.35,6],['05-moor-crest',2660,33,0,9],['06-right-left',3600,23,.22,12],['07-bridge-hairpin',4015,19,-.25,14],['08-pine-loose',4440,22,.18,15],['09-finish-run',5200,35,0,16]
 ];
 for(const [name,distance,speed,yawOffset,noteIndex] of positions){
  const expression=`(()=>{const g=window.__game,r=sampleStage(g.stage,${distance});g.mode='paused';g.ui.pause.classList.add('hidden');g.ui.result.classList.add('hidden');g.ui.title.classList.add('hidden');g.ui.settings.classList.add('hidden');g.ui.hud.classList.remove('hidden');g.ui.pace.classList.add('hidden');g.ui.countdown.classList.add('hidden');g.car.reset(${distance},true);g.car.yaw=r.heading+(${yawOffset});g.car.vx=Math.sin(r.heading)*${speed};g.car.vz=Math.cos(r.heading)*${speed};g.car.longitudinalSpeed=${speed};g.car.lateralSpeed=${Math.sin(yawOffset)*speed};g.car.slipAngle=${yawOffset};g.car.slipAmount=Math.min(1,Math.abs(${yawOffset})/.33);g.race.state='racing';g.race.elapsed=${distance}/22;g.race.activeNote=null;g.world.particles=[];g.camera.reset(g.car);${noteIndex==null?'':`g.showPace(g.stage.notes[${noteIndex}],120);`}g.updateHud();return true;})()`;
  await send('Runtime.evaluate',{expression});await wait(320);await shot(name);
 }
 await send('Runtime.evaluate',{expression:`(()=>{const g=window.__game;g.mode='paused';g.ui.pace.classList.add('hidden');g.ui.pause.classList.remove('hidden');g.ui.hud.classList.remove('hidden');return true;})()`});await wait(180);await shot('10-pause');
 await send('Runtime.evaluate',{expression:`(()=>{const g=window.__game;g.ui.pause.classList.add('hidden');g.finishRun({time:277.18,splits:[{distance:1800,time:89.16},{distance:3600,time:181.31},{distance:g.stage.length,time:277.18}]});return true;})()`});await wait(180);await shot('11-results');
 await send('Runtime.evaluate',{expression:'window.__game.returnToTitle()'});await send('Emulation.setDeviceMetricsOverride',{width:900,height:900,deviceScaleFactor:1.5,mobile:false});await wait(250);await shot('12-title-square-hidpi');
 console.log(`Review screenshots written to ${output.pathname}`);await send('Page.close');
}finally{try{ws?.close();}catch{}try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}await rm(profile,{recursive:true,force:true});}
