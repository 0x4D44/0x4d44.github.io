"""Capture-only 10 m grid, camera and provenance checks. No Chrome or private data."""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
src=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve()
if not out.is_relative_to(src.parent/'.scratch'):raise SystemExit('output must be under worktree .scratch')
out.mkdir(parents=True,exist_ok=True)
C,F='tools/axis01-capture.mjs','tools/axis01-grid.mjs'
M=[
 ('missing side rail context accepted',F,'&&context.every(p=>p.clear)',''),
 ('side geometry height ignored',F,'const clear=count>0&&extentM.every((v,i)=>Number.isFinite(v)&&v>=evidence.minimumExtentM[i])&&extentPixels.every(v=>v>=24)&&context.every(p=>p.clear);','const clear=count>0;'),
 ('terrain profile flattened',F,'const y=terrain.heightAt(x,s);','const y=0;'),
 ('grid line vertices have half scale',F,'new T.Float32BufferAttribute(positions,3)','new T.Float32BufferAttribute(positions.map(v=>v*.5),3)'),
 ('grid metadata accepted instead of drawn scale',F,'gaps.some(p=>Math.abs(p-expected)>1e-4)','false'),
 ('top view south points up',F,'camera.up.set(0,0,-1)','camera.up.set(0,0,1)'),
 ('side camera ignores terrain',F,'Math.max(cy,Number.isFinite(groundY)?groundY+.5:cy)','cy'),
 ('cutaway hides the platforms',F,"'track','platforms','portals','terrain'","'track','portals','terrain'"),
 ('cutaway leaves hidden architecture',F,'o.visible=false;hidden.push','o.visible=true;hidden.push'),
 ('side section retains occluding terrain',F,"if(view==='side'){keep.delete('terrain');keep.delete('ground-outside-terrain');}",'if(false){}'),
 ('occluded tops accepted',F,"if(!results.some(r=>r.clear))",'if(false)'),
 ('wrong GPU accepted',C,"!/\\bMetal\\b/i.test(observed.renderer??'')",'false'),
 ('software GPU accepted',C,"/SwiftShader|llvmpipe|software/i.test(observed.renderer??'')",'false'),
 ('unrendered grid accepted',C,'!observed.rendered?.grid','false'),
 ('unrendered rails accepted',C,'!observed.rendered?.track','false'),
 ('missing platform accepted',C,'JSON.stringify(refs)!==JSON.stringify(Array.from({length:11},(_,i)=>String(i)))','false'),
 ('failed view aborts the other view',C,'catch(error){failed.push','catch(error){throw error;failed.push'),
 ('missing view exits zero',C,'exitCode:missing.length?1:0','exitCode:0'),
 ('stale source hash accepted',C,"!==source.sha256)throw",'!==source.sha256&&false)throw'),
]
def run(work):
 return subprocess.run(['node','--test','--test-reporter=tap','--test-timeout=20000','tools/tests/axis01-capture.test.mjs'],cwd=work,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=30)
with tempfile.TemporaryDirectory(prefix='axis01-capture-',dir=out) as directory:
 work=Path(directory)/'kings-cross-src'
 for name in ['tools','core','web']:shutil.copytree(src/name,work/name)
 shutil.copy2(src/'package.json',work/'package.json');(work/'node_modules').symlink_to(src/'node_modules',target_is_directory=True);(work.parent/'.scratch').mkdir()
 baseline=run(work)
 if baseline.returncode:raise SystemExit(baseline.stdout+baseline.stderr)
 names=set(re.findall(r'^ok \d+ - (.+)$',baseline.stdout,re.M));seen=set();survivors=[]
 for label,target,old,new in M:
  file=work/target;original=file.read_text()
  if old not in original:raise SystemExit('missing mutation pattern: '+label)
  file.write_text(original.replace(old,new,1));result=run(work);file.write_text(original)
  failed=set()
  for block in re.split(r'(?=^not ok \d+ - )',result.stdout,flags=re.M)[1:]:
   block=re.split(r'^(?:ok \d+ - |# Subtest:|1\.\.)',block,maxsplit=1,flags=re.M)[0];match=re.match(r'not ok \d+ - ([^\n]+)',block)
   if match and 'ERR_ASSERTION' in block:failed.add(match[1])
  all_failed=set(re.findall(r'^not ok \d+ - (.+)$',result.stdout,re.M));actual=set(re.findall(r'^(?:ok|not ok) \d+ - (.+)$',result.stdout,re.M))
  if result.returncode and failed and all_failed==failed and actual==names and not result.stderr:seen.update(failed);print('[CAUGHT] '+label,flush=True)
  else:survivors.append(label);(out/(str(len(survivors))+'.log')).write_text(result.stdout+result.stderr);print('[SURVIVED] '+label,flush=True)
 print(f'{len(M)-len(survivors)}/{len(M)} caught; survivors: {survivors}')
 print(f'{len(names&seen)}/{len(names)} tests observed failing; never failed: {sorted(names-seen)}')
 raise SystemExit(1 if survivors or names-seen else 0)
