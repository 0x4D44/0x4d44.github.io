import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Writable } from 'node:stream';
import { createRecorder } from '../recorder.mjs';
const dir = new URL('.', import.meta.url).pathname;
const event = { kind:'interpose', area:'Y9', to:'1234', descr:'1A23', time:946684800000 };
async function fixture(createStream) {
  let now = 946684800000;
  const snapshots = [];
  const recorder = await createRecorder({dir, area:'Y9', now:()=>now, createStream,
    onSnapshot: row=>snapshots.push(row), schedule:()=>({unref(){}}), unschedule(){} });
  return {recorder, snapshots, nextDay:()=>{now+=86400000;}};
}
test('recorder robustness: open and rollover errors are sanitized and close settles', async () => {
  for (const rollover of [false,true]) {
    const streams=[];
    const f=await fixture(()=>{const s=new Writable({write(_c,_e,done){done();}}); streams.push(s); return s;});
    if(rollover){f.nextDay(); f.recorder.append(event);}
    streams.at(-1).emit('error',new Error('/private/SENTINEL'));
    assert.equal(f.recorder.stats().state,'failed');
    assert.equal(f.recorder.stats().gap,true);
    assert.equal(f.recorder.stats().error,'write failed');
    assert.ok(!JSON.stringify(f.recorder.stats()).includes('SENTINEL'));
    f.recorder.append(event); f.recorder.checkpoint();
    assert.equal(f.snapshots.at(-1).e.berths['1234'],'1A23');
    await f.recorder.close();
  }
  const duringClose = await fixture(() => new Writable({write(_c,_e,done){done();}, final(done){done(new Error('/private/CLOSE'));}}));
  await duringClose.recorder.close();
  assert.equal(duringClose.recorder.stats().error,'write failed');
  const synchronous = await fixture(() => {throw new Error('/private/OPEN');});
  assert.equal(synchronous.recorder.stats().error,'write failed');
  await synchronous.recorder.close();
  let brokenDestroy;
  const destroying = await fixture(() => {brokenDestroy = new Writable({write(_c,_e,done){done();}}); brokenDestroy.destroy = () => {throw new Error('/private/DESTROY');}; return brokenDestroy;});
  assert.doesNotThrow(()=>brokenDestroy.emit('error',new Error('/private/WRITE')));
  await destroying.recorder.close();
  assert.equal(destroying.recorder.stats().error,'write failed');
});
test('recorder robustness: stalled disk buffer stays bounded and records a failure', async () => {
  let stream;
  const f=await fixture(()=>stream=new Writable({highWaterMark:1024,write(){}}));
  for(let i=0;i<60000;i++)f.recorder.append(event);
  const stats=f.recorder.stats();
  assert.equal(stats.state,'failed'); assert.equal(stats.error,'buffer overflow'); assert.equal(stats.gap,true);
  assert.ok(stream.writableLength<=stats.maxQueueBytes);
  assert.equal(stream.destroyed,true);
  await f.recorder.close();
});

test('recorder robustness: close bounds a blocked writer and cancels its deadline after flush', async (t) => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  let blocked;
  const f=await fixture(()=>blocked=new Writable({write(){}}));
  let settled=false;
  const closing=f.recorder.close().then(()=>{settled=true;});
  t.mock.timers.tick(4999); await Promise.resolve(); assert.equal(settled,false);
  t.mock.timers.tick(1);
  assert.equal(blocked.destroyed,true);
  await closing; assert.equal(settled,true);
  assert.equal(f.recorder.stats().error,'close timeout'); assert.equal(f.recorder.stats().gap,true);
  const flushed=await fixture(()=>new Writable({write(_c,_e,done){done();}}));
  await flushed.recorder.close();
  t.mock.timers.tick(10000);
  assert.equal(flushed.recorder.stats().state,'closed'); assert.equal(flushed.recorder.stats().gap,false);
});
