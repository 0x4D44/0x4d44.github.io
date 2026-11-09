"""Mutation checks for W1, the Waverley station element (web/src/waverley-station.ts, waverley-station-structure.ts, waverley-station-block.ts,
waverley-roof.ts); usage: waverley-station.py <kings-cross-src> <.scratch/output> [--check] [label text ...].

The tests run in a copy of the package with the real node_modules linked in (tools/mutation/lib/kxmut.py). The unmodified copy must pass first;
a mutant is killed only by a named test that fails by assertion, and every test of these files must be turned red by at least one mutation.
A mutation given as a list of (old, new) pairs applies them together. The mutations are of behaviour: a guard removed, a placement moved into
the train envelope, a height that pierces the glazing or drops into a train, a coplanar chord, a missing omit, a material not disposed.

`--check` only looks for every mutation's search text in the package (exactly once) and runs nothing. Label text on the command line runs only
the mutations whose label contains it; the 'never failed' accounting needs the whole list, so a partial run skips it."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

args = sys.argv[1:]
check_only = '--check' in args
args = [a for a in args if a != '--check']
if len(args) < 2:
    raise SystemExit(__doc__)

src = Path(args[0]).resolve()
scratch = Path(args[1]).resolve()
only = [a.lower() for a in args[2:]]
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')

STATION, STRUCT, BLOCK, ROOF = 'web/src/waverley-station.ts', 'web/src/waverley-station-structure.ts', 'web/src/waverley-station-block.ts', 'web/src/waverley-roof.ts'
TESTS = ['web/tests/waverley-station.test.ts', 'web/tests/waverley-roof.test.ts']

MUTATIONS = [
    # where the columns stand
    ('a column is not held under the roof', STRUCT, 'if(!underRoof(roof,p,S.roofMargin))continue;', ''),
    ('a column stands at the band edge, toward a track', STRUCT, 'const p=worldPoint(f,t,band.mid);', 'const p=worldPoint(f,t,band.s0-1);'),
    ('a girder jumps a missing column', STRUCT, 'if(Math.hypot(a.c.x-b.c.x,a.c.z-b.c.z)>S.maxSpan)continue;', ''),
    # furniture
    ('the lamps hang off the middle line', STRUCT, 'plan.lamps.push({x:mid[0],z:mid[1],', 'plan.lamps.push({x:mid[0]+4,z:mid[1]+4,'),
    ('no screens are hung', STRUCT, 'plan.screens.push({x:q[0],z:q[1],rotY,ref:f.ref});', ''),
    # ironwork heights
    ('the gutter girders pierce the glazing', STRUCT, 'gutterGirderTop:7.95,', 'gutterGirderTop:8.05,'),
    ('the gutter girders hang into the trains', STRUCT, 'gutterGirderDepth:1.0,', 'gutterGirderDepth:3.5,'),
    ('a platform girder chord is coplanar with a gutter chord', STRUCT, 'platformGirderTop:7.72,', 'platformGirderTop:7.77,'),
    ('the valance drops onto the block', STRUCT, 'valanceBottom:6.6,', 'valanceBottom:6.2,'),
    ('the column stops short of its girder', STRUCT, 'y3=underGirder-S.abacus,', 'y3=underGirder-S.abacus-.2,'),
    # the roof's solid strips
    ('the strips lie in the glazing', ROOF, 'export const WAVERLEY_ROOF_STRIP_LIFT=.03;', 'export const WAVERLEY_ROOF_STRIP_LIFT=0;'),
    ('the ridge capping is twice as wide', ROOF, '[r0,r1]=rising?[x0+half-bands.ridge,x0+half]', '[r0,r1]=rising?[x0+half-2*bands.ridge,x0+half]'),
    # platform edge bands
    ('the edge bands are laid outside the platform', STRUCT, 'return [o[0]+(i[0]-o[0])*f,y,o[1]+(i[1]-o[1])*f];', 'return [o[0]-(i[0]-o[0])*f,y,o[1]-(i[1]-o[1])*f];'),
    ('the tactile strip is 0.3 m deep', STRUCT, '{from:.6,to:1.0,color:0xd8b324}', '{from:.7,to:1.0,color:0xd8b324}'),
    # the central block
    ('the mapped block is still drawn by the city', STATION, 'WAVERLEY_STATION_OMIT_IDS:readonly string[]=[WAVERLEY_CENTRAL_BLOCK_ID];', 'WAVERLEY_STATION_OMIT_IDS:readonly string[]=[];'),
    ('the block top is a metre low', BLOCK, 'fillSurface(top,r,[],()=>y(h));', 'fillSurface(top,r,[],()=>y(h-1));'),
    ('upper windows run into the cornice', BLOCK, [('upperSill:.4,', 'upperSill:.8,'), ('if(y1>h-B.cornice-.1)continue;', '')]),
    ('a door sits behind the plinth', BLOCK, 'windowLift:.03,doorLift:.1,', 'windowLift:.03,doorLift:.05,'),
    # the station's bookkeeping
    ('the owned materials are not disposed', STATION, 'for(const m of owned)m.dispose();', ''),
]



def pairs_of(change):
    return change[0] if len(change) == 1 else [tuple(change)]


def check_anchors():
    """Every search text exactly once in the package it will be applied to; nothing is run."""
    bad = 0
    seen = set()
    for label, file, *change in MUTATIONS:
        if label in seen:
            print(f'DUPLICATE LABEL: {label}')
            bad += 1
        seen.add(label)
        path = src / file
        if not path.is_file():
            print(f'MISSING FILE: {file} ({label})')
            bad += 1
            continue
        text = path.read_text()
        for old, new in pairs_of(change):
            count = text.count(old)
            if count != 1:
                print(f'{"ABSENT" if count == 0 else f"{count} TIMES"}: {label}: {file}: {old[:100]!r}')
                bad += 1
            if old == new:
                print(f'NO CHANGE: {label}')
                bad += 1
    print(f'{len(MUTATIONS)} mutations; {bad} problem(s)')
    return 1 if bad else 0


if check_only:
    sys.exit(check_anchors())

selected = [m for m in MUTATIONS if not only or any(word in m[0].lower() for word in only)]
if not selected:
    raise SystemExit('no mutation label contains ' + ' / '.join(only))
scratch.mkdir(parents=True, exist_ok=True)
tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'waverley-station') as work:
    suite = kxmut.Suite(work, test_timeout_ms=30000, timeout=120)
    baseline = suite.baseline(TESTS)
    for label, file, *change in selected:
        try:
            with kxmut.mutated(work / file, pairs_of(change), unique=True):
                verdict, _run = suite.judge(TESTS, strict='any')
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
status = tally.finish()
if only:
    print('partial run: the tests-never-failed accounting needs the whole list')
    sys.exit(1 if status else 0)
unseen = baseline.passed - tally.red
print(f'{len(baseline.passed) - len(unseen)}/{len(baseline.passed)} tests observed failing')
for name in sorted(unseen):
    print('  NEVER FAILED:', name)
sys.exit(1 if status or unseen else 0)
