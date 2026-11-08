"""Semantic boundary mutations for synthetic berth tests.

Usage: python3 -I -u tools/mutation/berths.py <kings-cross-src> <worktree/.scratch>
Only core/ is copied. Each unique temporary tree is owned and removed by this run.
A kill requires a named assertion failure, not a compile error or timeout.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
scratch.mkdir(parents=True, exist_ok=True)

# Each wrapper introduces one observable domain fault at a public API boundary.
# Keeping the original implementation intact makes mutations independent of refactors.
M = [
    ('platform buffers displaced', 'build', "for (const a of result.anchors) if (a.kind === 'platform') a.point[0] += 20;"),
    ('foreign signal prefixes accepted', 'before', "data.signals.forEach(s => { if (s.ref) s.ref = s.ref.replace(/^(NL|AF|WH)/, 'YA'); });"),
    ('signal directions reversed', 'build', "for (const a of result.anchors) if (a.kind === 'signal') { [a.from,a.to]=[a.to,a.from]; a.t=1-a.t; }"),
    ('platform starter overrides platform', 'build', "for (const a of result.anchors) if (a.kind === 'platform') a.kind = 'signal';"),
    ('graph inference replaced with chord', 'build', "for (const a of result.anchors) if (a.kind === 'inferred') a.point = [50,50];"),
    ('residence weighting ignored', 'before', "recordings.forEach(r => r.forEach(e => { e.t=0; e.e.time=null; }));"),
    ('branch evidence erased', 'before', "recordings=recordings.map(r => r.filter(e => e.e.to !== '2199'));"),
    ('outside location evidence erased', 'before', "smart=smart.map(r => ({...r,STANOX:''}));"),
    ('unknown location treated as outside', 'before', "smart=smart.map(r => ({...r,STANOX:String(r.STANOX || '54238')}));"),
    ('cancel events omitted from inventory', 'before', "recordings=recordings.map(r => r.filter(e => e.e.kind !== 'cancel'));"),
    ('four-star descriptions count as trains', 'before', "recordings.forEach(r => r.forEach(e => { if(e.e.descr==='****') e.e.descr='1A01'; }));"),
    ('duplicate signals silently deduplicated', 'before', "data.signals=data.signals.filter((s,i,a)=>a.findIndex(x=>x.ref?.replace(/\\s/g,'')===s.ref?.replace(/\\s/g,''))===i);"),
    ('disconnected route has invented length', 'analyse', "for(const c of result) if(c.lengthM===null) {c.lengthM=0;c.issues=[];}"),
    ('same-edge distance ignores fractions', 'analyse', "for(const c of result) if(c.lengthM!==null)c.lengthM+=10;"),
    ('speed warnings suppressed', 'analyse', "for(const c of result)c.issues=c.issues.filter(s=>!/speed|50/.test(s));"),
    ('missing duration fabricated', 'analyse', "for(const c of result)if(c.seconds===null){c.seconds=1;c.speedMps=c.lengthM;c.timed=1;}"),
    ('reversal warnings suppressed', 'analyse', "for(const c of result){c.reversal=false;c.issues=c.issues.filter(s=>!/revers/i.test(s));}"),
    ('recording boundaries erased', 'before_analyse', 'args[1]=[args[1].flat()];'),
    ('cancellation timing reset erased', 'before_analyse', "args[1]=args[1].map(r=>r.filter(e=>e.e.kind!=='cancel'));"),
    ('fast observations hidden by median', 'analyse', "for(const c of result)if(c.speedMps!==null && c.speedMps<=50)c.issues=c.issues.filter(s=>!/speed|50/.test(s));"),
    ('zero-time warnings erased', 'analyse', "for(const c of result)c.issues=c.issues.filter(s=>!/zero.?time|co.timestamp/i.test(s));"),
    ('missing platform terminal clears valid matches', 'build', "if(data.platforms.length>data.buffers.length)result.anchors=result.anchors.filter(a=>a.kind!=='platform');"),
    ('disconnected inference downgraded to no evidence', 'build', "for(const u of result.unmapped)if(u.reason==='conflict')u.reason='no-evidence';"),
    ('fractional inference replaced by whole edge midpoint', 'build', "for(const a of result.anchors)if(a.kind==='inferred'){const p=data.nodes.find(n=>n[0]===a.from)!;const q=data.nodes.find(n=>n[0]===a.to)!;a.t=.5;a.point=[(p[1]+q[1])/2,(p[2]+q[2])/2];}"),
    ('platform dwell treated as travel time', 'source', '!platformBounded && '),
    ('all evidence discarded', 'build', "result.anchors=[];result.unmapped=[];"),
    ('step analysis discarded', 'analyse', "result=[];"),
]

PRELUDE = '''
export function buildAnchors(data: Parameters<typeof originalBuild>[0], recordings: Parameters<typeof originalBuild>[1], smart: Parameters<typeof originalBuild>[2], options?: Parameters<typeof originalBuild>[3]): ReturnType<typeof originalBuild> {
  data=structuredClone(data); recordings=structuredClone(recordings); smart=structuredClone(smart);
  BEFORE
  let result=originalBuild(data,recordings,smart,options);
  BUILD
  return result;
}
export function analyseSteps(...args: Parameters<typeof originalAnalyse>): ReturnType<typeof originalAnalyse> {
  args=structuredClone(args);
  BEFORE_ANALYSE
  let result=originalAnalyse(...args);
  ANALYSE
  return result;
}
'''

def run(work):
    return subprocess.run(['node', '--test', '--test-reporter=tap', '--test-force-exit', '--test-timeout=8000', 'core/tests/berths.test.ts'],
                          cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=30)

killed = 0
observed = set()
survivors = []
with tempfile.TemporaryDirectory(prefix='berths-mutations-', dir=scratch) as temporary:
    work = Path(temporary)
    shutil.copytree(src / 'core', work / 'core')
    original = (work / 'core/berths.ts').read_text()
    baseline = run(work)
    if baseline.returncode:
        print(baseline.stdout + baseline.stderr)
        sys.exit('Baseline must pass before mutation testing')
    expected = set(re.findall(r'^ok \d+ - (berths: .+)$', baseline.stdout, re.M))
    renamed = original.replace('export function buildAnchors(', 'function originalBuild(', 1).replace('export function analyseSteps(', 'function originalAnalyse(', 1)
    if renamed == original or 'function originalBuild(' not in renamed or 'function originalAnalyse(' not in renamed:
        sys.exit('Cannot identify public function declarations')
    for label, phase, mutation in M:
        wrapper = PRELUDE.replace('BEFORE_ANALYSE', mutation if phase == 'before_analyse' else '').replace('BEFORE', mutation if phase == 'before' else '').replace('BUILD', mutation if phase == 'build' else '').replace('ANALYSE', mutation if phase == 'analyse' else '')
        changed = renamed
        if phase == 'source':
            if mutation not in changed:
                survivors.append(label)
                print(f'[INVALID] {label}: internal guard missing', flush=True)
                continue
            changed = changed.replace(mutation, '', 1)
        (work / 'core/berths.ts').write_text(changed + wrapper)
        try:
            result = run(work)
        except subprocess.TimeoutExpired:
            survivors.append(label)
            print(f'[INVALID] {label}: timed out', flush=True)
            continue
        failed = set(re.findall(r'^not ok \d+ - (berths: .+)$', result.stdout, re.M))
        if failed:
            killed += 1
            observed.update(failed)
            print(f'[KILLED] {label}', flush=True)
            for name in sorted(failed): print(f'  {name}', flush=True)
        else:
            survivors.append(label)
            print(f'[SURVIVED/INVALID] {label}', flush=True)
            if result.returncode: print(result.stdout + result.stderr, flush=True)

print(f'\n{killed}/{len(M)} mutations caught; {len(observed & expected)}/{len(expected)} tests observed fail')
for name in sorted(expected - observed): print(f'NEVER RED: {name}')
for label in survivors: print(f'NOT CAUGHT: {label}')
sys.exit(1 if survivors or expected - observed else 0)
