import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage } from '../src/stage.js';
import { StageRun } from '../src/race.js';
const stage=buildStage();
function car(progress,longitudinalSpeed=20,speed=20,lateral=0){return{progress,longitudinalSpeed,speed,lateral};}

test('fast retry returns control in under two seconds',()=>{const run=new StageRun(stage);run.reset(false);let time=0;while(run.state==='countdown'&&time<3){run.update(car(0,0,0),1/120);time+=1/120;}assert.ok(time<2,`retry countdown=${time}`);assert.equal(run.state,'racing');});

test('finish cannot be obtained by skipping checkpoints',()=>{const run=new StageRun(stage);run.state='racing';run.update(car(stage.length),1/60);assert.notEqual(run.state,'finished');assert.equal(run.splits.length,1);run.update(car(stage.length),1/60);assert.notEqual(run.state,'finished');});

test('ordered forward checkpoint crossings complete the stage',()=>{const run=new StageRun(stage);run.state='racing';let prior=0;for(const split of stage.splits){run.lastProgress=prior;run.update(car(split+1),1);prior=split+1;}assert.equal(run.state,'finished');assert.equal(run.splits.length,3);assert.ok(run.finishedTime>0);});

test('reverse crossing does not trigger a split',()=>{const run=new StageRun(stage);run.state='racing';run.lastProgress=stage.splits[0]+10;run.update(car(stage.splits[0]-2,-8,8),1/60);assert.equal(run.splits.length,0);});

test('co-driver calls are predictive and based on authored targets',()=>{const run=new StageRun(stage);run.state='racing';const first=stage.notes[0];const events=run.update(car(first.at-90,22,22),1/60);const pace=events.find(e=>e.type==='pace');assert.ok(pace);assert.equal(pace.note.id,first.id);assert.ok(pace.distance>0);});


test('missing an old pace trigger cannot stall all later calls',()=>{
 const run=new StageRun(stage);run.state='racing';const second=stage.notes[1],events=run.update(car(second.at-20,20,20),1/60),pace=events.find(e=>e.type==='pace');
 assert.ok(pace);assert.equal(pace.note.id,second.id);assert.equal(run.nextNote,2);
});
