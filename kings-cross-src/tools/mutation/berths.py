"""Internal rule and semantic boundary mutations for synthetic berth tests.

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

# Boundary wrappers introduce observable domain faults. Source replacements also
# exercise the internal inference, validation and routing rules directly.
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
    ('shared junction clearance omitted', 'source_replace', ('const SETBACK_M = 25;', 'const SETBACK_M = 0;')),
    ('unreferenced main signal matching disabled', 'source_replace', ('if (signal.ref ||', 'if (true || signal.ref ||')),
    ('protection boards accepted as main signals', 'source_replace', (" || !signal.kinds.includes('main')", '')),
    ('foreign referenced signals accepted for topology', 'source_replace', ('if (signal.ref ||', 'if (')),
    ('unreferenced signal direction ignored', 'source_replace', ("const forward = signal.direction !== 'backward';", 'const forward = true;')),
    ('topology junction predictions misclassified as chain', 'source_replace', ("return a.evidence.startsWith('Topology ') ? 'topology' : a.evidence.startsWith('Boundary')", "return a.evidence.startsWith('Topology platform') ? 'topology' : a.evidence.startsWith('Boundary')")),
    ('unbounded branches accepted', 'source_replace', ('adjacent.every((b) => visit(b, [start]))', 'adjacent.some((b) => visit(b, [start]))')),
    ('branch agreement tolerance widened tenfold', 'source_replace', ('(routeBetween(g, a, b)?.length ?? Infinity) > 75', '(routeBetween(g, a, b)?.length ?? Infinity) > 750')),
    ('nominal speed option ignored', 'source_replace', ('options.nominalSpeedMps ?? 15', '15')),
    ('outside boundary proof disabled', 'source_replace', ('if (distance - error > path.length)', 'if (false)')),
    ('held out signal only loses its ref', 'source_replace', ('data.signals.filter((s) => s.id !== signal.id)', 'data.signals.map((s) => s.id === signal.id ? {...s, ref: undefined} : s)')),
    ('topology-inferred signal identities treated as independent oracles', 'source_replace', ('if (Number.isFinite(id) && !identities.has(id)) identities.set(id, { berth: a.berth, independent: false });', 'if (Number.isFinite(id) && !identities.has(id)) identities.set(id, { berth: a.berth, independent: true });')),
    ('failed inferred-identity trials calibrate their own topology', 'source_replace', ('filter((t) => t.independent && !t.trusted && t.method !== \'starter\')', 'filter((t) => !t.trusted && t.method !== \'starter\')')),
    ('leave-one-out trust tolerance widened to sixty metres', 'source_replace', ('const trusted = distanceM !== null && distanceM <= 15 && directionOk;', 'const trusted = distanceM !== null && distanceM <= 60 && directionOk;')),
    ('calibration withholding bypassed', 'source_replace', ('if (options.calibrate === false || references.length < 3)', 'if (true || options.calibrate === false || references.length < 3)')),
    ('directed routes replaced with unconstrained shortest path', 'source_replace', ('function directedRoute(g: Graph, a: BerthAnchor, b: BerthAnchor): TrackPath | null {', 'function directedRoute(g: Graph, a: BerthAnchor, b: BerthAnchor): TrackPath | null { return routeBetween(g, a, b);')),
    ('all evidence discarded', 'build', "result.anchors=[];result.unmapped=[];"),
    ('step analysis discarded', 'analyse', "result=result.map(c=>({...c,lengthM:0,seconds:0,speedMps:0,count:0,timed:0,reversal:false,issues:[]}));"),
    ('outside component anchor guard removed', 'source_replace', ('if (component.some((b) => anchored.has(b))) continue;', '')),
    ('unknown SMART seeds outside components', 'source_replace', ("text(row, 'TD') !== map.area || !isOutside(row)", "text(row, 'TD') !== map.area")),
    ('outside components use directed links', 'source_replacements', [
        ('links.get(step.to)!.add(step.from);', ''),
        ('const source = reached.get(berth)!;', 'const source = reached.get(berth); if (!source) continue;'),
    ]),
    ('outside component hop distance doubled', 'source_replace', ('steps: current.steps + 1', 'steps: current.steps + 2')),
    ('outside component seed distance starts at one', 'source_replace', ('{ ...source, steps: 0 }', '{ ...source, steps: 1 }')),
    ('outside component details invent seed identity', 'source_replace', ('${source.location} at berth ${source.berth}', 'Invented Town at berth XXXX')),
    ('outside component geography overrides conflicts', 'source_replace', ("if (!item || item.reason === 'conflict') continue;", 'if (!item) continue;')),
    ('outside component processing omitted before calibration bypass', 'source_replace', ('addNoEvidenceContext(map, observed, smart, new Map());\n    return applyOutsideComponents(map, observed, smart);', 'addNoEvidenceContext(map, observed, smart, new Map());\n    return map;')),
    ('outside component processing omitted after calibration', 'source_replace', ('addNoEvidenceContext(map, observed, smart, withheld);\n  return applyOutsideComponents(map, observed, smart);', 'addNoEvidenceContext(map, observed, smart, withheld);\n  return map;')),
    ('no-evidence observed-path distance is off by one', 'source_replace', ('steps: here.steps + 1', 'steps: here.steps + 2')),
    ('no-evidence path ignores reverse observed connectivity', 'source_replace', ('links.get(step.to)!.add(step.from);\n  }\n  const reached = new Map<string, ObservedReach>', '}\n  const reached = new Map<string, ObservedReach>')),
    ('unreachable SMART association outranks observed association', 'source_replacements', [
        ('associations.filter((association) => reached.has(association.berth))', 'associations'),
        ('steps: reached.get(association.berth)!.steps', 'steps: reached.get(association.berth)?.steps ?? -1'),
    ]),
    ('foreign SMART rows leak into the berth audit', 'source_replace', (
        "export function auditBerths(data: KxData, recordings: RecordingEvent[][], smart: SmartRow[], map: AnchorMap): BerthAudit[] {\n  const observed = observe(recordings, map.area), g = buildGraph(data);\n  const rows = smart.filter((r) => text(r, 'TD') === map.area);",
        "export function auditBerths(data: KxData, recordings: RecordingEvent[][], smart: SmartRow[], map: AnchorMap): BerthAudit[] {\n  const observed = observe(recordings, map.area), g = buildGraph(data);\n  const rows = smart;")),
    ('duplicate SMART directed pairs inflate the audit counter', 'source_replace', (
        "const smartPairs = new Set(touches.filter((r) => text(r, 'FROMBERTH') && text(r, 'TOBERTH'))\n      .map((r) => key(text(r, 'FROMBERTH'), text(r, 'TOBERTH')))).size;",
        'const smartPairs = touches.length;')),
    ('audit collapses one-sided evidence into an ambiguous chain', 'source_replace', (
        "else cause = !observedSteps ? 'no-train-steps' : !incoming || !outgoing ? 'one-sided-chain' : 'unbounded-or-ambiguous-chain';",
        "else cause = !observedSteps ? 'no-train-steps' : 'unbounded-or-ambiguous-chain';")),
    ('audit nearest-anchor path distance is off by one', 'source_replace', (
        "map((a) => ({ a, steps: reached.get(a.berth)!.steps }))",
        "map((a) => ({ a, steps: reached.get(a.berth)!.steps + 1 }))")),
    ('audit nearby-signal radius ignores the 250-metre limit', 'source_replace', (
        "routeBetween(g, nearest.a, s.point)?.length ?? Infinity) <= 250",
        "routeBetween(g, nearest.a, s.point)?.length ?? Infinity) <= 150")),
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
    return subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=8000', 'core/tests/berths.test.ts'],
                          cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=30)

def assertion_failures(output):
    failures = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        block = re.split(r'^(?:ok \d+ - |# Subtest:|1\.\.)', block, maxsplit=1, flags=re.M)[0]
        name = re.match(r'not ok \d+ - (berths: [^\n]+)', block)
        if name and re.search(r"^\s+code: ['\"]?ERR_ASSERTION", block, re.M):
            failures.add(name[1])
    return failures

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
    total = re.search(r'^# tests (\d+)$', baseline.stdout, re.M)
    if total is None or len(expected) != int(total[1]):
        sys.exit('Baseline TAP output is incomplete; cannot prove every test red')
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
        if phase in ('source_replace', 'source_replacements'):
            replacements = [mutation] if phase == 'source_replace' else mutation
            if any(old not in changed for old, _ in replacements):
                survivors.append(label)
                print(f'[INVALID] {label}: internal source pattern missing', flush=True)
                continue
            for old, new in replacements:
                changed = changed.replace(old, new, 1)
        (work / 'core/berths.ts').write_text(changed + wrapper)
        try:
            result = run(work)
        except subprocess.TimeoutExpired:
            survivors.append(label)
            print(f'[INVALID] {label}: timed out', flush=True)
            continue
        failed = assertion_failures(result.stdout)
        named_failures = set(re.findall(r'^not ok \d+ - (berths: .+)$', result.stdout, re.M))
        complete = re.search(r'^# tests (\d+)$', result.stdout, re.M)
        if failed and failed == named_failures and complete and int(complete[1]) == len(expected) and not result.stderr:
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
