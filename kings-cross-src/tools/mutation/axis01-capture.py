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
C,F,P='tools/axis01-capture.mjs','tools/axis01-grid.mjs','tools/axis01-pixels.mjs'
M=[
 ('dark grid blue mistaken for rail profile',P,'rail:([r,g,b])=>b>130&&b>r+50&&b>g+45','rail:([r,g,b])=>b>r+35&&b>g+35'),
 ('blue profile concealed by ground',F,"name==='axis01-rail-section'?9001:9000",'9000'),
 ('exaggerated height labels lose true-metre units',F,"${verticalScale!==1?' true':''}",''),
 ('schematic tunnel depth falsely flattened','core/scene.ts','export const TUNNEL_DEPTH = -4;','export const TUNNEL_DEPTH = 0;'),
 ('grid lost to distant scene fog',F,'depthWrite:false,fog:false,toneMapped:false','depthWrite:false,fog:true,toneMapped:false'),
 ('profiles lost to distant scene fog',F,'opacity:1,depthTest:false,depthWrite:false,fog:false','opacity:1,depthTest:false,depthWrite:false,fog:true'),
 ('profile rendered before transparent grid',F,'color,transparent:true,opacity:1','color,transparent:false,opacity:1'),
 ('profile grid covers rail datum',F,'plan.chainage?8000:10000','10000'),
 ('PNG oracle bypassed',C,'if(requirePixels&&!observed?.pixels?.clear)','if(false)'),
 ('fog coloured background accepted as grid',P,'const stroke=!contrast||[-3,3].every','const stroke=true||[-3,3].every'),
 ('PNG filters ignored',P,'filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):pa<=pb&&pa<=pc?a:pb<=pc?b:c','0'),
 ('unsupported PNG interlace accepted',P,'||data[12]',''),
 ('PNG grid accepted without coloured pixels',P,'''const gridClear=axes.length===2&&axes.every(axis=>{
    const available=grid.filter(p=>p.axis===axis&&p.samples>=5);
    return available.length>0&&available.filter(p=>p.fraction>=.35).length>=Math.min(2,available.length);
  });''','const gridClear=true;'),
 ('PNG geometry difference ignored',P,'const geometryClear=changed>=100&&geometry.extentPx[0]>=24&&geometry.extentPx[1]>=16;','const geometryClear=true;'),
 ('PNG section accepts missing line colours',P,"const profileClear=plan.view!=='terrain-section'||profiles.length===2&&profiles.every(p=>p.samples>=100&&p.fraction>=.65&&p.bins.length>=8);",'const profileClear=true;'),
 ('geometry baseline leaves real surfaces',F,'if(o!==grid&&!o.isLight&&!o.isCamera)o.visible=false','if(false)o.visible=false'),
 ('geometry baseline does not restore visibility',F,'finally {for(const [o,visible] of state)o.visible=visible;}','finally {}'),
 ('profile pixel projection mirrored',F,'(v.x+1)*width/2','(1-v.x)*width/2'),
 ('section crosses throat in reverse',C,'const north={...graph,adj:new Map([...graph.adj].map(([id,edges])=>[id,edges.filter(e=>graph.pos.get(e.a===id?e.b:e.a)[1]<=graph.pos.get(id)[1]+.25)]))};','const north=graph;'),
 ('label overlap accepted',F,'if(overlaps(r,geometry))','if(false)'),
 ('clipped labels accepted',F,'r.left<4||r.right>width-4||r.top<48||r.bottom>height-24','false'),
 ('oversized label font accepted',F,'label.fontPx<11||label.fontPx>16','false'),
 ('capture accepts missing label evidence',C,'!observed.visibility.labels?.clear','false'),
 ('terrain route truncated',F,'for(const segment of route.segments){','for(const segment of route.segments.slice(0,1)){'),
 ('profile samples off the actual ECML',F,'terrain.heightAt(x,z)','terrain.heightAt(0,z)'),
 ('rail profile invented at zero',F,'y:rail.y,source:rail.source','y:0,source:rail.source'),
 ('neighbouring rail line included in ECML section',C,"r.ref==='ECM1'",'true'),
 ('height exaggeration omitted from plotted rails',F,'p.y*section.verticalScale','p.y'),

 ('missing side rail context accepted',F,'&&context.every(p=>p.clear)',''),
 ('side geometry height ignored',F,'const clear=count>0&&extentM.every((v,i)=>Number.isFinite(v)&&v>=evidence.minimumExtentM[i])&&extentPixels.every(v=>v>=24)&&context.every(p=>p.clear);','const clear=count>0;'),
 ('terrain profile flattened',F,'const y=terrain.heightAt(x,z);','const y=0;'),
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
