// Run fresh independent acceptance without changing any existing repository gate.
// Node 22.16.0: node la-ladera/tools/groundsky_verify.mjs
import '../tests/nice.mjs';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const logDir=resolve(root,'la-ladera/dev/groundsky/verification');
mkdirSync(logDir,{recursive:true});
if(process.versions.node !== '22.16.0') throw new Error(`Use the requested Node 22.16.0; found ${process.versions.node}`);
const jobs=[
  ['validator.log',[process.execPath,'la-ladera/tools/groundsky_validate.mjs','--complete','--json']],
  ['tests.log',[process.execPath,'--test','--test-concurrency=1','la-ladera/tests/groundsky-assets.test.mjs']],
  ['mutations.log',[process.execPath,'la-ladera/tests/groundsky-mutations.mjs','--out','la-ladera/dev/groundsky/verification']],
  ['payload-after.log',[process.execPath,'la-ladera/tests/payload.mjs']],
  ['git-diff-check.log',['git','diff','--check']],
];
const evidence=[];
for(const [name,args] of jobs){
  const start=new Date().toISOString();
  console.log(`RUN ${name}: ${args.join(' ')}`);
  const result=spawnSync(args[0],args.slice(1),{cwd:root,encoding:'utf8',windowsHide:true,
    env:{...process.env,LADERA_PRIO:'idle'},timeout:900000,maxBuffer:32*1024*1024});
  const output=`UTC ${start}\n$ ${args.join(' ')}\n${result.stdout??''}${result.stderr??''}\n[exit ${result.status}]\n`;
  writeFileSync(resolve(logDir,name),output);
  evidence.push({name,command:args,start,exitCode:result.status,error:result.error?.message??null});
  console.log(output.length>3000?output.slice(-3000):output);
  if(result.error||result.status!==0){
    writeFileSync(resolve(logDir,'commands.json'),JSON.stringify(evidence,null,2)+'\n');
    process.exit(result.status??1);
  }
}
const manifest=JSON.parse(readFileSync(resolve(root,'la-ladera/assets/models/manifest.groundsky.json'),'utf8'));
const allowed=/^la-ladera\/(?:assets\/textures\/groundsky\/|assets\/models\/manifest\.groundsky\.json$|tools\/groundsky(?:_[^/]+\.(?:py|mjs)|\.catalog\.json)$|tests\/groundsky(?:-[^/]+\.test\.mjs|-mutations\.mjs)$|dev\/groundsky\/)/;
const git=spawnSync('git',['diff','--name-status','origin/main'],{cwd:root,encoding:'utf8'});
const untracked=spawnSync('git',['ls-files','--others','--exclude-standard'],{cwd:root,encoding:'utf8'});
if(git.status!==0||untracked.status!==0) throw new Error('Scope check could not read git status');
const changes=git.stdout.trim().split('\n').filter(Boolean).map(row=>row.split('\t'));
for(const [status,path]of changes) if(status!=='A'||!allowed.test(path)) throw new Error(`Non-additive or out-of-scope change: ${status} ${path}`);
for(const path of untracked.stdout.trim().split('\n').filter(Boolean)) if(!allowed.test(path)) throw new Error(`Out-of-scope untracked file: ${path}`);
const scope={ok:true,trackedAdditions:changes.length,untrackedAdditions:untracked.stdout.trim().split('\n').filter(Boolean).length,
  base:spawnSync('git',['rev-parse','origin/main'],{cwd:root,encoding:'utf8'}).stdout.trim(),
  note:'Only additions in the requested namespaces; no existing runtime, registry, test or budget changes.'};
writeFileSync(resolve(logDir,'scope.json'),JSON.stringify(scope,null,2)+'\n');
writeFileSync(resolve(logDir,'commands.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({ok:true,scope,totals:manifest.totals},null,2));
