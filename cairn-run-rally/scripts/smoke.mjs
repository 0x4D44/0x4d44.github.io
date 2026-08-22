import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root=new URL('../',import.meta.url),port=9333;
await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
const candidates=[process.env.CHROME_BIN,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
const chrome=candidates.find(existsSync);
if(!chrome)throw new Error('Chromium or Google Chrome is required for the browser smoke test.');
const profile=await mkdtemp(join(tmpdir(),'cairn-run-smoke-'));
const chromeArgs=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--allow-file-access-from-files',`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'--window-size=1280,720','about:blank'];
let command=chrome,args=chromeArgs;
if(process.platform==='linux'&&spawnSync('sh',['-lc','command -v xvfb-run'],{encoding:'utf8'}).status===0){command='xvfb-run';args=['-a',chrome,'--use-gl=angle','--use-angle=swiftshader',...chromeArgs];}else args=['--headless=new',...chromeArgs];
const child=spawn(command,args,{detached:process.platform!=='win32',stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',d=>stderr+=d);
let ws;
try{
 let version=null;for(let i=0;i<80;i++){try{version=await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok?r.json():null);if(version)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 if(!version)throw new Error(`Chrome debugging endpoint did not start. ${stderr.slice(-1000)}`);
 const html=(await readFile(new URL('index.html',root),'utf8')).replace(/<link[^>]+style\.css[^>]*>/,'').replace(/<script type="module"[^>]*><\/script>/,'');
 const css=await readFile(new URL('src/style.css',root),'utf8');
 const order=['math.js','contracts.js','content.js','stage.js','vehicle.js','race.js','renderer.js','world.js','input.js','audio.js','game.js','main.js'];let bundle='';
 for(const file of order){let code=await readFile(new URL(`src/${file}`,root),'utf8');code=code.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm,'').replace(/\bexport\s+(?=(class|function|const|let|var)\b)/g,'');bundle+=`\n// ${file}\n${code}\n`;}
 bundle=bundle.replace("new CairnRunGame();","window.__game = new CairnRunGame();");
 const target=await fetch(`http://127.0.0.1:${port}/json/new`,{method:'PUT'}).then(r=>r.json());ws=new WebSocket(target.webSocketDebuggerUrl);let id=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 await send('Page.enable');await send('Runtime.enable');await send('Performance.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 const tree=await send('Page.getFrameTree');await send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:html.replace('</head>',`<style>${css}</style></head>`)});
 const evaluated=await send('Runtime.evaluate',{expression:bundle,awaitPromise:true,userGesture:true});if(evaluated.exceptionDetails)throw new Error(`Browser exception: ${JSON.stringify(evaluated.exceptionDetails)}`);
 await new Promise(r=>setTimeout(r,1000));
 const shell=await send('Runtime.evaluate',{expression:'({titleVisible:!document.getElementById("title-screen").classList.contains("hidden"),startText:document.getElementById("start-button").textContent,mode:window.__game?.mode})',returnByValue:true});
 const titleShot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await writeFile(new URL('../artifacts/title.png',import.meta.url),Buffer.from(titleShot.data,'base64'));
 await send('Runtime.evaluate',{expression:`(()=>{window.__pad={id:'QA Virtual Pad',index:0,connected:true,mapping:'standard',timestamp:0,axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0}))};window.__padConnected=true;Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>window.__padConnected?[window.__pad]:[]});return true;})()`});
 const value=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
 const waitForValue=async(expression,predicate,label)=>{let current;for(let i=0;i<180;i++){current=await value(expression);if(predicate(current))return current;await new Promise(r=>setTimeout(r,100));}throw new Error(`${label}: ${JSON.stringify(current)}`);};
 const setPad=async(index,pressed)=>send('Runtime.evaluate',{expression:`window.__pad.buttons[${index}]={pressed:${pressed},touched:${pressed},value:${pressed?1:0}};window.__pad.timestamp+=1`});
 await setPad(0,true);await waitForValue('window.__game.mode',v=>v==='playing','gamepad A did not start');await setPad(0,false);await waitForValue('window.__game.input.lastPad.confirm',v=>v===false,'gamepad A release was not observed');
 const padStarted=await send('Runtime.evaluate',{expression:'({mode:window.__game.mode,raceState:window.__game.race.state})',returnByValue:true});
 await send('Runtime.evaluate',{expression:'window.__game.input.autopilot=true;window.__game.race.countdown=.18;true'});
 await setPad(9,true);const pausedValue=await waitForValue('window.__game.mode',v=>v==='paused','gamepad Start did not pause');await setPad(9,false);await waitForValue('window.__game.input.lastPad.start',v=>v===false,'gamepad Start release was not observed');const padPaused={result:{value:pausedValue}};
 await send('Runtime.evaluate',{expression:'window.__padConnected=false'});await waitForValue('window.__game.input.lastPad.start',v=>v===false,'disconnect did not clear pad state');await send('Runtime.evaluate',{expression:'window.__padConnected=true'});await new Promise(r=>setTimeout(r,120));
 await setPad(9,true);const resumedValue=await waitForValue('window.__game.mode',v=>v==='playing','gamepad Start did not resume');await setPad(9,false);await waitForValue('window.__game.input.lastPad.start',v=>v===false,'resume release was not observed');const padResumed={result:{value:resumedValue}};
 await waitForValue('window.__game.car.progress',v=>v>=30,'autopilot did not make progress');await new Promise(r=>setTimeout(r,300));await send('Runtime.evaluate',{expression:'window.__game.writeQA()'});
 const result=await send('Runtime.evaluate',{expression:'JSON.parse(document.getElementById("qa-status").textContent)',returnByValue:true});const qa=result.result.value;
 const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await writeFile(new URL('../artifacts/smoke.png',import.meta.url),Buffer.from(shot.data,'base64'));
 const metrics=await send('Performance.getMetrics'),metricMap=Object.fromEntries(metrics.metrics.map(item=>[item.name,item.value])),heapMB=Number(((metricMap.JSHeapUsedSize||0)/1048576).toFixed(2));
 await send('Emulation.setDeviceMetricsOverride',{width:900,height:900,deviceScaleFactor:1.5,mobile:false});await new Promise(r=>setTimeout(r,700));
 const resized=await send('Runtime.evaluate',{expression:'({canvas:[document.getElementById("game-canvas").width,document.getElementById("game-canvas").height],errors:window.__RALLY_QA__?.errors||[]})',returnByValue:true});
 await send('Runtime.evaluate',{expression:'(()=>{const q=document.getElementById("quality-setting");q.value="low";q.dispatchEvent(new Event("input",{bubbles:true}));return true;})()'});await new Promise(r=>setTimeout(r,500));
 const lowQuality=await send('Runtime.evaluate',{expression:'({canvas:[document.getElementById("game-canvas").width,document.getElementById("game-canvas").height],quality:window.__game.renderer.quality,errors:window.__RALLY_QA__?.errors||[]})',returnByValue:true});
 await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'r',code:'KeyR',windowsVirtualKeyCode:82});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'r',code:'KeyR',windowsVirtualKeyCode:82});await new Promise(r=>setTimeout(r,650));
 const restarted=await send('Runtime.evaluate',{expression:'({progress:window.__game.car.progress,countdown:window.__game.race.countdown,state:window.__game.race.state})',returnByValue:true});
 const failures=[];if(!shell.result.value.titleVisible||shell.result.value.mode!=='title')failures.push('title screen was not the initial usable state');if(!/START STAGE/.test(shell.result.value.startText))failures.push('start action was not discoverable');if(padStarted.result.value.mode!=='playing')failures.push(`gamepad A did not start: ${JSON.stringify(padStarted.result.value)}`);if(padPaused.result.value!=='paused'||padResumed.result.value!=='playing')failures.push(`gamepad Start pause/resume failed: ${padPaused.result.value}/${padResumed.result.value}`);if(!qa.booted)failures.push('game did not boot');if(qa.errors?.length)failures.push(`runtime errors: ${qa.errors.join('; ')}`);if(qa.frameCount<40)failures.push(`only ${qa.frameCount} frames`);if(qa.progress<25)failures.push(`autopilot progress ${qa.progress}m`);if(qa.cpuFrameMs>16.7)failures.push(`CPU frame ${qa.cpuFrameMs}ms`);if(qa.drawCalls>40)failures.push(`draw calls ${qa.drawCalls}`);if(qa.triangles>50000)failures.push(`triangles ${qa.triangles}`);if(resized.result.value.canvas[0]<1200||resized.result.value.canvas[1]<1200||resized.result.value.errors.length)failures.push(`high-DPI resize failed: ${JSON.stringify(resized.result.value)}`);if(lowQuality.result.value.quality!=='low'||lowQuality.result.value.canvas[0]>=resized.result.value.canvas[0]||lowQuality.result.value.errors.length)failures.push(`low-quality fallback failed: ${JSON.stringify(lowQuality.result.value)}`);if(heapMB>256)failures.push(`heap use ${heapMB} MB`);if(restarted.result.value.progress>25||restarted.result.value.countdown>1)failures.push(`keyboard restart was not immediate: ${JSON.stringify(restarted.result.value)}`);
 console.log(JSON.stringify({shell:shell.result.value,gamepad:{started:padStarted.result.value,paused:padPaused.result.value,resumed:padResumed.result.value,disconnectReconnect:true},gameplay:{...qa,heapMB},resized:resized.result.value,lowQuality:lowQuality.result.value,restarted:restarted.result.value},null,2));if(failures.length)throw new Error(failures.join(', '));console.log('Browser smoke test passed; screenshots: artifacts/title.png, artifacts/smoke.png');
 await send('Page.close');ws.close();
}finally{
 try{ws?.close();}catch{}
 try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}
 await rm(profile,{recursive:true,force:true});
}
