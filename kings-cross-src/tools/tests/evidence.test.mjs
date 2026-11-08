import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AXES, cdpPipe, createEvidenceServer, commandResult, optionsFrom, proxyTarget, realMetal, relayUrl, safeFile, safeOutputDirectory, writePrivateFile, stationCameras, trainCameras, within } from '../evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const scratch = path.join(root, '.scratch/evidence13-tests');
await mkdir(scratch, { recursive: true });

test('evidence options reject unsafe relay origins dates speeds and output paths', () => {
  for (const value of ['https://outside.invalid', 'file:///tmp/relay', 'http://fake:secret@127.0.0.1:8787', 'http://127.0.0.1/path']) assert.throws(() => relayUrl(value));
  assert.equal(relayUrl('http://127.0.0.1:8787').origin, 'http://127.0.0.1:8787');
  for (const args of [['--date','20260230'], ['--date','2026010/'], ['--speed','0'], ['--speed','NaN'], ['--signal-at','25:00:00'], ['--out', root], ['--out', `${scratch}/../../../escape`], ['--dist'], ['--wat']]) assert.throws(()=>optionsFrom(args));
  const o = optionsFrom(['--gpu', '--date', '20261109', '--speed','8', '--out',scratch]);
  assert.equal(o.gpu,true); assert.equal(o.date,'20261109'); assert.equal(o.speed,8);
});

test('only an actual Metal renderer qualifies for hardware evidence', () => {
  assert.equal(realMetal('ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)'),true);
  for (const renderer of ['unknown','SwiftShader','ANGLE Metal SwiftShader','llvmpipe Metal','Apple M3',null]) assert.equal(realMetal(renderer),false);
});

test('proxy paths preserve endpoint queries without accepting a client origin', () => {
  const relay = relayUrl('http://127.0.0.1:8787');
  assert.equal(proxyTarget(relay,'/relay/recording?date=20261109').href,'http://127.0.0.1:8787/recording?date=20261109');
  assert.equal(proxyTarget(relay,'/elsewhere'),null);
  assert.equal(proxyTarget(relay,'/relay/../outside'),null);
  assert.equal(within('/safe/root','/safe/root-sibling/a'),false);
});

test('static files refuse traversal malformed encoding and symlinks outside the mount', async () => {
  const dir = await mkdtemp(path.join(scratch,'static-'));
  try {
    await mkdir(path.join(dir,'public')); await writeFile(path.join(dir,'public','index.html'),'synthetic');
    await writeFile(path.join(dir,'private.txt'),'synthetic outside mount');
    await symlink(path.join(dir,'private.txt'), path.join(dir,'public','linked.txt'));
    assert.equal((await safeFile(path.join(dir,'public'),'/index.html')).body.toString(),'synthetic');
    for(const name of ['/../private.txt','/%2e%2e/private.txt','/%oops','/linked.txt']) assert.equal(await safeFile(path.join(dir,'public'),name),null);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('station cameras cover every requested landmark using finite world positions', async () => {
  const data = JSON.parse(await readFile(path.join(root,'kings-cross-src/web/src/data/kx-track.json'),'utf8'));
  const cameras = stationCameras(data);
  for(const key of ['south-front','front-oblique','shed-interior','platform-eye','concourse','western-range','roof-above','north-gable','great-northern-hotel','midland-grand-front','st-pancras-shed','gasworks-portals','top','side']) {
    assert.ok(cameras[key],key); const c=cameras[key]; assert.ok([...c.pos,...c.target].every(Number.isFinite)); assert.ok(Math.hypot(...c.pos.map((v,i)=>v-c.target[i]))>1); assert.ok(c.source.length>5);
  }
  assert.equal(cameras.top.grid,true); assert.equal(cameras.side.grid,true);
  assert.equal(AXES.length,9); assert.equal(cameras['platform-eye'].pos[1],2.5);
});

test('train closeups are three metres from the nose and coach side and include bogie gangway and 387', () => {
  const train = kind => ({kind,nose:[20,0,-10],h:0});
  const cameras = trainCameras(['lner9','lumo5','hull5','gn387x4'].map(train),{platforms:[]});
  assert.deepEqual(cameras['azuma-nose-3m'].pos,[20,1.7,-7]);
  assert.ok(Math.abs(cameras['coach-side-3m'].pos[0]-20-1.35-3)<1e-9);
  for (const name of ['gangway','bogie','great-northern-387','lumo','hull-trains']) assert.ok(cameras[name],name);
  assert.ok(!trainCameras([train('lner9')],{platforms:[]})['great-northern-387'],'missing 387 cannot be relabelled Azuma');
});

function fakeChrome() { const child = new EventEmitter(); child.stdio=[null,null,null,new PassThrough(),new PassThrough()]; return child; }
test('CDP handles fragmented pipe messages and rejects all promises when Chrome exits', async () => {
  const child=fakeChrome(), events=[], cdp=cdpPipe(child,e=>events.push(e));
  const first=cdp.send('Browser.getVersion');
  child.stdio[4].write('{"id":1,"res'); child.stdio[4].write('ult":{"product":"synthetic"}}\0{"method":"Page.loadEventFired"}\0');
  assert.deepEqual(await first,{product:'synthetic'}); assert.equal(events[0].method,'Page.loadEventFired');
  const pending=cdp.send('Runtime.evaluate'); const rejected=assert.rejects(pending,/Chrome exited/); child.emit('exit',1); await rejected;
  await assert.rejects(cdp.send('Browser.getVersion'),/Chrome exited/);
});

test('CDP commands and child checks are bounded and child input is closed', async () => {
  const child=fakeChrome(), cdp=cdpPipe(child);
  await assert.rejects(cdp.send('No.reply',{},undefined,20),/timed out/); cdp.close();
  const log=path.join(scratch,'bounded.log');
  const result=await commandResult(process.execPath,['-e','setInterval(()=>{},1000)'],root,log,80);
  assert.equal(result.timedOut,true); assert.notEqual(result.code,0);
  const eof=await commandResult(process.execPath,['-e',"process.stdin.resume();process.stdin.on('end',()=>console.log('EOF'));"],root,log,2000);
  assert.equal(eof.code,0); assert.equal((await readFile(log,'utf8')).trim(),'EOF');
});


test('proxy faults cut SSE and recover without stopping the upstream relay', async () => {
  const hosts = [], requests = [];
  const upstream = createServer((req, res) => {
    hosts.push(req.headers.host); requests.push(req.url);
    if(req.url === '/events') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: snapshot\ndata: {"synthetic":true}\n\n'); }
    else { res.writeHead(200, { 'content-type': 'application/json' }).end('{"synthetic":true}'); }
  });
  let proxy, reader;
  try {
    await new Promise((resolve,reject)=>{upstream.once('error',reject);upstream.listen(0,'127.0.0.1',resolve);});
    const relay=relayUrl(`http://127.0.0.1:${upstream.address().port}`);
    proxy=createEvidenceServer({ dist:scratch, relay });
    await new Promise((resolve,reject)=>{proxy.server.once('error',reject);proxy.server.listen(0,'127.0.0.1',resolve);});
    const base=`http://127.0.0.1:${proxy.server.address().port}`;
    assert.equal((await fetch(`${base}/relay/health`)).status,200);
    assert.equal(hosts[0],relay.host);
    const events=await fetch(`${base}/relay/events`); reader=events.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value),/snapshot/);
    proxy.setProxy(false);
    const ended=await reader.read().then(v=>v.done,()=>true);
    assert.equal(ended,true);
    assert.equal((await fetch(`${base}/relay/health`)).status,503);
    proxy.setProxy(true);
    const count=requests.length;
    assert.equal((await fetch(`${base}/relay/health`,{method:'POST'})).status,405);
    assert.equal(requests.length,count);
    assert.equal((await fetch(`${base}/relay/health`)).status,200);
    assert.equal(upstream.listening,true);
  } finally {
    await reader?.cancel().catch(()=>{}); await proxy?.close(); upstream.closeAllConnections();
    if(upstream.listening) await new Promise(resolve=>upstream.close(resolve));
  }
});


test('private output refuses symlinked directories and report files before writing', async () => {
  const dir=await mkdtemp(path.join(scratch,'output-'));
  try {
    const work=path.join(dir,'work'), outside=path.join(dir,'outside');
    await mkdir(work); await mkdir(outside);
    await symlink(outside,path.join(work,'.scratch'));
    await assert.rejects(safeOutputDirectory(work,path.join(work,'.scratch','pack')),/symlink/);
    const output=path.join(work,'safe'); await safeOutputDirectory(work,output);
    const protectedFile=path.join(outside,'protected.json'); await writeFile(protectedFile,'synthetic untouched');
    await symlink(protectedFile,path.join(output,'manifest.json'));
    await assert.rejects(writePrivateFile(path.join(output,'manifest.json'),'private synthetic data'));
    assert.equal(await readFile(protectedFile,'utf8'),'synthetic untouched');
  } finally { await rm(dir,{recursive:true,force:true}); }
});
