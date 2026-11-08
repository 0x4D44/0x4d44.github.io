import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { localFile, requestFailure, startEventHeartbeat, startRelay } from '../relay.mjs';
import { createStaticStore } from '../static.mjs';

const scratch=fileURLToPath(new URL('../../../.scratch/security17-tests/',import.meta.url));
await mkdir(scratch,{recursive:true});
async function temp(t) {const dir=await mkdtemp(path.join(scratch,'case-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('Origin guard refuses hostile browser origins while accepting loopback dev proxies',()=>{
  for(const origin of ['https://evil.example','null','http://localhost.evil:5173','http://user:password@localhost:5173','http://localhost:5173/path','file:///tmp/page',[]])
    assert.equal(requestFailure('127.0.0.1:8787',8787,'GET',origin),403);
  for(const origin of [undefined,'http://localhost:5173','http://127.0.0.1:5190','https://[::1]:5173'])
    assert.equal(requestFailure('127.0.0.1:8787',8787,'GET',origin),null);
});

test('SSE heartbeat reports upstream state and drops a slow consumer without growing a write queue',()=>{
  const req=new EventEmitter();let tick,cleared=0,destroyed=0,writes=0,data;
  startEventHeartbeat(req,{write:text=>{writes++;data=text;return false;},destroy:()=>destroyed++},{now:()=>2000,metadata:()=>({feed:'disconnected',lastEventAt:500}),schedule:fn=>{tick=fn;return{};},unschedule:()=>cleared++});
  tick();tick();
  assert.match(data,/"feed":"disconnected","lastEventAt":500/);
  assert.equal(destroyed,1);assert.equal(cleared,1);assert.equal(writes,1);
});

test('recording and cache symlinks cannot select data outside the configured directory',async t=>{
  const dir=await temp(t),dataDir=path.join(dir,'data');await mkdir(path.join(dataDir,'recordings'),{recursive:true});
  await writeFile(path.join(dir,'outside.ndjson'),'SYNTHETIC-OUTSIDE-CONTENT');
  await symlink(path.join(dir,'outside.ndjson'),path.join(dataDir,'recordings','td-Y9-20010101.ndjson'));
  const response=await localFile(new URL('http://localhost/recording?date=20010101'),{dataDir,area:'Y9'});
  assert.equal(response.status,404);assert.ok(!response.body.includes('SYNTHETIC-OUTSIDE'));
  await writeFile(path.join(dir,'outside.gz'),gzipSync('{"BERTHDATA":[{"TD":"Y9"}]}'));
  await symlink(path.join(dir,'outside.gz'),path.join(dataDir,'smart.json.gz'));
  const store=createStaticStore({dataDir,readCredentials:()=>assert.fail('must not read a login')});
  await assert.rejects(store.smartRows({td:'Y9'}),/reference data unavailable/);
});

test('recordings stream with backpressure and oversized JSON cache files are refused before reading',async t=>{
  const dir=await temp(t);await mkdir(path.join(dir,'recordings'));
  await writeFile(path.join(dir,'recordings','td-Y9-20010101.ndjson'),'synthetic\n');
  const response=await localFile(new URL('http://localhost/recording?date=20010101'),{dataDir:dir,area:'Y9',streamRecording:true});
  assert.equal(response.body,undefined);assert.ok(response.stream);
  let body='';for await(const chunk of response.stream)body+=chunk;assert.equal(body,'synthetic\n');
  await writeFile(path.join(dir,'anchors.json'),'');await truncate(path.join(dir,'anchors.json'),16*1024*1024+1);
  const large=await localFile(new URL('http://localhost/anchors'),{dataDir:dir,area:'Y9'});
  assert.equal(large.status,413);assert.deepEqual(JSON.parse(large.body),{error:'file too large'});
});

test('reference downloads reject malformed gzip without caching it and can recover on retry',async t=>{
  const dir=await temp(t);let calls=0;
  const store=createStaticStore({dataDir:dir,readCredentials:async()=>({account:'synthetic',secret:'synthetic'}),fetchImpl:async()=>new Response(++calls===1?Buffer.from([31,139,0,0]):gzipSync('{"BERTHDATA":[null,{"TD":"Y9"}]}'))});
  await assert.rejects(store.smartRows({td:'Y9'}),/reference data unavailable/);
  assert.equal((await readdir(dir)).includes('smart.json.gz'),false);
  assert.deepEqual(await store.smartRows({td:'Y9'}),[{TD:'Y9'}]);
  await assert.rejects(store.get('__proto__'),/unknown file/);
});

test('HTTP errors and logs never echo private paths or upstream exception text',async t=>{
  const dir=await temp(t),logs=[];let handler;
  const server=new EventEmitter();server.listen=(_port,host,done)=>{assert.equal(host,'127.0.0.1');done();};server.address=()=>({port:43210,address:'127.0.0.1'});server.close=done=>done();server.closeAllConnections=()=>{};
  t.mock.method(http,'createServer',fn=>{handler=fn;return server;});
  const relay=await startRelay({area:'Y9',dataDir:dir,feedEnabled:false,log:text=>logs.push(text),readCredentials:async()=>{throw new Error('SYNTHETIC-SECRET /Users/synthetic/private upstream-body');}});
  t.after(()=>relay.close());
  const req=new EventEmitter();Object.assign(req,{method:'GET',url:'/static/smart?td=Y9',headers:{host:'127.0.0.1:43210'}});
  let body='',code;const res={writeHead:n=>{code=n;},end:text=>body+=text};await handler(req,res);
  assert.equal(code,502);assert.deepEqual(JSON.parse(body),{error:'upstream or internal error'});
  assert.ok(!JSON.stringify({body,logs}).match(/SYNTHETIC-SECRET|Users|upstream-body/));
  req.headers.origin='https://evil.example';req.url='/health';await handler(req,res);assert.equal(code,403);
});
