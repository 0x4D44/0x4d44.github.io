"""Mutate the pure perf helpers in private copies; no Chrome or real data required.

python3 -I -u kings-cross-src/tools/mutation/perf.py kings-cross-src .scratch/perf-mutations
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)
source = (src / 'tools/perf.mjs').read_text()
mutations = [
    ('missing timing becomes fabricated zero', "gap('sample-time-unavailable',", "sampledUs += 1000; gap('sample-time-unavailable',"),
    ('timing gaps silently disappear', "entry.count++; gaps.set(code, entry);", "entry.count++;"),
    ('timed totals lose valid samples', 'sampledUs += us;', 'sampledUs += 0;'),
    ('all samples count as timed', 'timedSampleCount++;', 'timedSampleCount += samples.length;'),
    ('source mapping loses measured cost', 'if (location) mappedUs += us;', 'if (location) mappedUs += 0;'),
    ('missing frame loses its gap', "gap('call-frame-unavailable',", "gap('wrong-code',"),
    ('unknown node loses its gap', "gap('sample-node-unavailable',", "gap('wrong-code',"),
    ('missing source location loses its gap', "gap('source-position-unavailable',", "gap('wrong-code',"),
    ('unmatched deltas silently disappear', "gap('unmatched-time-deltas',", "gap('wrong-code',"),
    ('no samples loses its gap', "gap('samples-unavailable',", "gap('wrong-code',"),
    ('partial profile looks complete', "gaps.size ? 'partial' : 'complete'", "gaps.size ? 'complete' : 'complete'"),
    ('missing timing looks like measured zero', 'sampledMs: timedSampleCount ? sampledUs / 1000 : null', 'sampledMs: timedSampleCount ? sampledUs / 1000 : 0'),
    ('Markdown omits profile gaps', 'cpu.gaps.map(gap =>', '[].map(gap =>'),
    ('Markdown omits source table', '(cpu?.byOriginalSourceFile ?? []).slice(0, 15)', '[].slice(0, 15)'),
]

def run(work):
    return subprocess.run(['node', '--test', '--test-reporter=tap', 'tools/tests/perf.test.mjs'], cwd=work,
                          stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30)

baseline = run(src)
if baseline.returncode:
    raise SystemExit(baseline.stdout + baseline.stderr)
names = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
failed_once = set()
killed = []
survivors = []
for label, old, new in mutations:
    if old not in source:
        raise SystemExit(f'missing mutation pattern: {label}')
    with tempfile.TemporaryDirectory(prefix='perf-', dir=scratch) as tmp:
        work = Path(tmp)
        (work / 'tools/tests').mkdir(parents=True)
        shutil.copy2(src / 'tools/tests/perf.test.mjs', work / 'tools/tests/perf.test.mjs')
        (work / 'tools/perf.mjs').write_text(source.replace(old, new, 1))
        result = run(work)
    failures = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
    assertion = "code: 'ERR_ASSERTION'" in result.stdout or 'code: ERR_ASSERTION' in result.stdout
    complete = bool(re.search(r'^# tests \d+$', result.stdout, re.M))
    if result.returncode and failures and assertion and complete:
        killed.append(label)
        failed_once.update(failures)
        print(f'[KILLED] {label}', flush=True)
    else:
        survivors.append(label)
        print(f'[SURVIVED/INVALID] {label}\n{result.stdout}\n{result.stderr}', flush=True)
unproven = names - failed_once
summary = f'{len(killed)}/{len(mutations)} caught; survivors: {survivors}; tests seen failing: {len(names)-len(unproven)}/{len(names)}; unproven: {sorted(unproven)}'
print(summary)
(scratch / 'report.txt').write_text(summary + '\n')
raise SystemExit(1 if survivors or unproven else 0)
