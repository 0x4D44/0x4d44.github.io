import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { comparisonReproduction, summarizeCapture } from '../live-vs-replay.ts';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const sample=(description='1Z01')=>[{atMs:1000,trains:[{id:1,description,edge:[1,2,3],t:.5,point:[0,0]}]}];
async function fixture(dir:string,changed=false) {
  await writeFile(path.join(dir,'live-samples.json'),JSON.stringify(sample()));
  await writeFile(path.join(dir,'replay-samples.json'),JSON.stringify(sample(changed?'1Z02':'1Z01')));
  await writeFile(path.join(dir,'live-vs-replay.json'),JSON.stringify({interval:{startMs:1000,endMs:1000},passed:true,sameInitialSnapshotControl:{passed:true},explanation:'synthetic observed-source fixture'}));
}

test('saved live summary recomputes the primary samples without promoting a passing diagnostic',async()=>{
  const dir=await mkdtemp(path.join(root,'.scratch/live16-tests-'));
  try {
    await fixture(dir,true);
    const out=path.join(dir,'summary'),report=await summarizeCapture(dir,out);
    assert.equal(report.passed,false);assert.equal(report.sameTrainSetSeconds,0);
    assert.deepEqual(report.sameInitialSnapshotControl,{passed:true});
    assert.equal(report.recomputedFrom.files['live-samples.json'].length,64);
    assert.ok(report.reproduce.args.includes(out));
    const rerun=await summarizeCapture(out,path.join(dir,'again'));
    assert.equal(rerun.passed,false);assert.equal(rerun.liveOnlyTrainSamples,1);
    assert.match(await readFile(path.join(out,'live-vs-replay.md'),'utf8'),/Primary recorded-checkpoint comparison: FAIL/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('saved live summary CLI writes a passing result from valid samples without a relay',async()=>{
  const dir=await mkdtemp(path.join(root,'.scratch/live16-tests-'));
  try {
    await fixture(dir);
    const out=path.join(dir,'summary'),command=comparisonReproduction(dir,out);
    const child=spawnSync(process.execPath,command.args,{cwd:command.cwd,encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']});
    assert.equal(child.status,0,child.stderr);
    const report=JSON.parse(await readFile(path.join(out,'live-vs-replay.json'),'utf8'));
    assert.equal(report.passed,true);assert.equal(report.samples,1);assert.equal(report.positionDifferenceM.p95,0);
    assert.match(report.explanation,/synthetic/);
    assert.equal(command.args[1],'--summarize');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('saved live summary rejects malformed samples and output outside private scratch',async()=>{
  const dir=await mkdtemp(path.join(root,'.scratch/live16-tests-'));
  try {
    await fixture(dir);
    await writeFile(path.join(dir,'live-samples.json'),JSON.stringify([{atMs:1000,trains:[{id:1,description:'1Z01',point:[0],edge:[1,2,3]}]}]));
    await assert.rejects(summarizeCapture(dir,path.join(dir,'summary')),/invalid saved comparison/);
    await assert.rejects(summarizeCapture(dir,root),/beneath worktree .scratch/);
  } finally {await rm(dir,{recursive:true,force:true});}
});


test('round36: saved report names stationary transport agreement as an activity gap', async () => {
  const dir = await mkdtemp(path.join(root, '.scratch/live36-tests-'));
  try {
    await fixture(dir);
    const out = path.join(dir, 'summary');
    await summarizeCapture(dir, out);
    const markdown = await readFile(path.join(out, 'live-vs-replay.md'), 'utf8');
    assert.match(markdown, /Active-hour movement evidence: GAP/);
    assert.match(markdown, /no drawn train movement/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
