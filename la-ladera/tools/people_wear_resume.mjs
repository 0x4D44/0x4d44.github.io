// Resume planning only. This does not issue a clearance certificate or sample
// any new pose. Every reusable part is checked by the unchanged report merger
// against a fresh complete structural/inventory scan of all current inputs.
import '../tests/nice.mjs';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { validateWear, mergeWearReports } from './blender/people_wear_validate.mjs';

const argv=process.argv.slice(2), option=name=>{const i=argv.indexOf('--'+name);return i<0?null:argv[i+1];};
if(process.version!=='v22.16.0') throw new Error('exact Node v22.16.0 is required');
if(!option('parts')||!option('report')) throw new Error('--parts and --report are required');
const folder=resolve(option('parts')), output=resolve(option('report'));
const expected=await validateWear({mode:'all',inventory:true,collision:false});
if(!expected.ok || !expected.inventoryVerified || expected.fits.length!==23 || expected.samplesPerFit!==7763 || expected.requiredClipCount!==32)
  throw new Error('resume requires all23 current structurally valid fits and the complete original pose plan');
const report={schema:1,node:process.version,checkedAt:new Date().toISOString(),complete:false,
  scope:'Cache admission only; the original full23-fit aggregator must still certify all complete parts.',
  currentInputs:expected.inputs,compatible:true,reusable:[],rerun:[],rejected:[]};
for(const fit of expected.fits){
  const file=resolve(folder,fit.id+'.json');
  if(!existsSync(file)){report.rerun.push({id:fit.id,reason:'missing report'});continue;}
  const bytes=readFileSync(file), pin={path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  let part;
  try{part=JSON.parse(bytes);}catch(error){report.rerun.push({id:fit.id,reason:'incomplete or malformed report',error:String(error),report:pin});continue;}
  // A stale source fingerprint never becomes a same-input retry. Preserve the
  // old reports and require a new output folder for the new source revision.
  if(part.inputs && JSON.stringify(part.inputs)!==JSON.stringify(expected.inputs)){
    report.compatible=false;report.rejected.push({id:fit.id,reason:'report belongs to different inputs; start a fresh full run in a new output folder',report:pin});continue;
  }
  try{
    // The original merger checks inventory, mode, every fingerprint, clip/pose
    // counts, raw rest, head checks, bounds and geometry summaries. Restricting
    // the expected fit list only admits this one cached part; its returned
    // complete flag is deliberately discarded and never published.
    mergeWearReports([part],{...expected,fits:[fit]});
    report.reusable.push({id:fit.id,report:pin,poses:part.fits[0].poses,inputSha256:part.inputs.sha256});
  }catch(error){report.rerun.push({id:fit.id,reason:String(error),report:pin});}
}
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({compatible:report.compatible,reusable:report.reusable.map(row=>row.id),rerun:report.rerun.map(row=>row.id),rejected:report.rejected.map(row=>row.id),complete:false}));
process.exitCode=report.compatible?0:1;
