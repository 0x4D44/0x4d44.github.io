#!/usr/bin/env python3
"""Mutate only private copies; prove geographic decisions and every new test red."""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut  # only for run_process: the timeout, the memory cap and no orphaned test workers; the counting below is this driver's own

src = Path(__file__).resolve().parents[2]
scratch = src.parent / '.scratch'
scratch.mkdir(exist_ok=True)
MUTATIONS = [
    ('north cut uses south boundary', [('const northZ = Math.min(', 'const northZ = Math.max(')]),
    ('outside proof disabled', [('signal.northOfBoundaryM > errorM', 'false')]),
    ('touching uncertainty interval treated as outside', [('signal.northOfBoundaryM > errorM', 'signal.northOfBoundaryM >= errorM')]),
    ('conflicts immune to exact outside evidence', [('signal.northOfBoundaryM > errorM', "signal.northOfBoundaryM > errorM && before !== 'conflict'")]),
    ('contrary inferred anchor retained', [('remove.add(item.berth)', 'remove.delete(item.berth)')]),
    ('removed anchor loses observed step count', [('options.seen?.get(item.berth) ?? 0', '0')]),
    ('previous calibration evidence discarded', [('Previous evidence: ${prior}', 'Previous evidence discarded')]),
    ('platform buffer replaced by starter', [("'kind' in item && item.kind === 'platform'", 'false')]),
    ('K prefix treated as YA identity', [('^YA\\s*(\\d{4})$', '^(?:YA|K)\\s*(\\d{4})$')]),
    ('junctions counted as signal heads', [("const isSignal = e.tags.railway === 'signal';", "const isSignal = e.tags.railway === 'signal' || e.tags.railway === 'junction';")]),
    ('duplicate refs accepted', [('matching.length > 1', 'false'), ('matching.length === 1', 'matching.length >= 1')]),
    ('identical nodes not deduplicated', [('if (!prior) group.push(fact);', 'group.push(fact);')]),
    ('contradictory coordinates accepted', [('if (prior && (prior.lat', 'if (false && prior && (prior.lat')]),
    ('evidence limit removed', [('if (elements.length > 100000)', 'if (false)')]),
    ('invalid screening options accepted', [("if (!Number.isFinite(errorM) || errorM < 15 || !options.source?.trim())", 'if (false)')]),
    ('empty graph accepted', [('if (!Number.isFinite(northZ))', 'if (false)')]),
    ('incomplete Overpass result accepted', [('if ((document as { remark?: unknown }).remark)', 'if (false)')]),
    ('node identity and coordinate checks bypassed', [('if (!Number.isSafeInteger(e.id)', 'if (false && (!Number.isSafeInteger(e.id)'),
        ("Math.abs(e.lon) > 180) throw new Error('invalid geographic node", "Math.abs(e.lon) > 180)) throw new Error('invalid geographic node")]),
    ('runtime unmapped detail mutated', [('map.unmapped.map((item) => [item.berth, { ...item }])', 'map.unmapped.map((item) => [item.berth, item])')]),
    ('candidate removal filter ignored', [('map.anchors.filter((a) => !remove.has(a.berth))', 'map.anchors.filter(() => true)')]),
    ('in-envelope coordinate classified as outside', [("status = 'not-north-outside';", "status = 'outside-network';")]),
    ('source node inventory lost', [('status, signals: matching, detail', 'status, signals: [], detail')]),
    ('unmatched berths reported as outside', [("let status: GeographicDecision['status'] = 'no-matching-ref';", "let status: GeographicDecision['status'] = 'outside-network';")]),
    ('boundary overhang direction flipped', [("inward: (step === 1) === (direction === 'forward')", "inward: (step === 1) !== (direction === 'forward')")]),
    ('boundary anchor faces the wrong way at the graph end', [('const forward = inward ? edge.a === node : edge.b === node;', 'const forward = inward ? edge.b === node : edge.a === node;')]),
    ('boundary overhang allowance widened to 50 m', [('const OVERHANG_LIMIT_M = 25;', 'const OVERHANG_LIMIT_M = 50;')]),
    ('boundary overhang allowance narrowed to 15 m', [('const OVERHANG_LIMIT_M = 25;', 'const OVERHANG_LIMIT_M = 15;')]),
    ('boundary end need not be an end of the graph', [('if ((g.adj.get(way.nodes[j]!) ?? []).length === 1) found.push(', 'if (true) found.push(')]),
    ('CORPUS signal location need not be tied to a SMART row', [("const tied = smart.some((r) => text(r, 'TD') === area && text(r, 'STANOX') === stanox && (text(r, 'FROMBERTH') === berth || text(r, 'TOBERTH') === berth));", 'const tied = true;')]),
    ('CORPUS tie ignores the SMART area', [("text(r, 'TD') === area && text(r, 'STANOX') === stanox", "text(r, 'STANOX') === stanox")]),
    ('CORPUS tie ignores the STANOX', [("text(r, 'TD') === area && text(r, 'STANOX') === stanox &&", "text(r, 'TD') === area &&")]),
    ('CORPUS tie ignores which berth the row names', [("(text(r, 'FROMBERTH') === berth || text(r, 'TOBERTH') === berth));", 'true);')]),
    ('CORPUS tie reads only the from berth', [("(text(r, 'FROMBERTH') === berth || text(r, 'TOBERTH') === berth));", "text(r, 'FROMBERTH') === berth);")]),
]

def run(work):
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', '--test-timeout=8000', 'core/tests/berths-geography.test.ts'], cwd=work, timeout=25)

def assertion_failures(output):
    result = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        block = re.split(r'^(?:ok \d+ - |# Subtest:|1\.\.)', block, maxsplit=1, flags=re.M)[0]
        name = re.match(r'not ok \d+ - (berth geography: [^\n]+)', block)
        if name and re.search(r"^\s+code: ['\"]?ERR_ASSERTION", block, re.M):
            result.add(name[1])
    return result

killed, observed, survivors = 0, set(), []
with tempfile.TemporaryDirectory(prefix='berths-geography-', dir=scratch) as temporary:
    work = Path(temporary)
    shutil.copytree(src / 'core', work / 'core')
    target = work / 'core/berths.ts'
    original = target.read_text()
    baseline = run(work)
    if baseline.returncode:
        sys.exit('Baseline must pass\n' + baseline.stdout + baseline.stderr)
    expected = set(re.findall(r'^ok \d+ - (berth geography: .+)$', baseline.stdout, re.M))
    for label, replacements in MUTATIONS:
        changed = original
        for old, new in replacements:
            if old not in changed:
                sys.exit(f'Invalid source target: {label}: {old}')
            changed = changed.replace(old, new, 1)
        target.write_text(changed)
        try:
            result = run(work)
        except subprocess.TimeoutExpired as error:
            sys.exit(f'Invalid mutation timeout (cannot prove assertion): {label}: {kxmut.why(error)}')
        failures = assertion_failures(result.stdout)
        if result.returncode and failures and not result.stderr:
            killed += 1
            observed |= failures
            print(f'CAUGHT {label}', flush=True)
        else:
            survivors.append(label)
            print(f'SURVIVED/INVALID {label}\n{result.stdout}{result.stderr}', flush=True)
    print(f'{killed}/{len(MUTATIONS)} mutations caught; {len(observed & expected)}/{len(expected)} tests seen failing')
    for name in sorted(expected - observed):
        print('NOT SEEN FAILING: ' + name)
    for name in survivors:
        print('SURVIVOR: ' + name)
    sys.exit(bool(survivors or expected - observed))
