"""Bounded Axis 05 evidence mutations; each new test must kill its named mutant."""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

src = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
if not out.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('output must be under worktree .scratch')
out.mkdir(parents=True, exist_ok=True)
MUTANTS = [
    ('occupied order exchanges omitted', 'tools/axis05-evidence.ts', 'exchanges.push({ atMs: tickMs!, edge: entry.edge, trainIds: [idA, idB] });', 'void tickMs;', 'Axis 05 pass-through compares'),
    ('stationary samples omitted', 'tools/axis05-evidence.ts', 'z.speed.add(s.train.speed);', 'if (s.train.speed > 0) z.speed.add(s.train.speed);', 'Axis 05 distributions include holds'),
    ('arrival confirmation omitted', 'tools/axis05-evidence.ts', 'captureCandidates.push(h.pending); h.pending = undefined;', 'h.pending = undefined;', 'Axis 05 arrival candidates'),
    ('departure travel requirement omitted', 'tools/axis05-evidence.ts', 'h.pending.movedM >= 1 && s.train.speed > 0.05', 's.train.speed > 0.05', 'Axis 05 departure candidates'),
    ('source lag not counted', 'tools/axis05-evidence.ts', 'if (lag > 1000) lateSourceSteps++;', 'if (false) lateSourceSteps++;', 'Axis 05 handling distinguishes'),
    ('audit observation callback omitted', 'tools/motion-audit.ts', 'options.onSample?.({ ...observation, heldPlatform: heldPlatforms.get(observation.train.id) });', 'void observation;', 'Axis 05 audit observer'),
    ('second report omitted', 'tools/axis05-evidence.ts', 'for (const [index, input] of inputs.recordings.entries()) {', 'for (const [index, input] of inputs.recordings.slice(0, 1).entries()) {', 'Axis 05 command freezes'),
]
def run(work, pattern=None):
    args = ['node', '--test', '--test-reporter=tap', '--test-timeout=15000']
    if pattern:
        args.append('--test-name-pattern=' + pattern)
    args.append('tools/tests/axis05-evidence.test.mjs')
    return subprocess.run(args, cwd=work, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30)
with tempfile.TemporaryDirectory(prefix='axis05-', dir=out) as directory:
    work = Path(directory) / 'kings-cross-src'
    work.mkdir()
    for name in ['core', 'tools', 'web']:
        shutil.copytree(src / name, work / name)
    shutil.copy2(src / 'package.json', work / 'package.json')
    (work / 'node_modules').symlink_to(src / 'node_modules', target_is_directory=True)
    baseline = run(work)
    if baseline.returncode:
        raise SystemExit(baseline.stdout + baseline.stderr)
    passed = set(re.findall(r'^ok \d+ - (.*)', baseline.stdout, re.M))
    killed = set()
    survivors = []
    for label, file, old, new, pattern in MUTANTS:
        target = work / file
        original = target.read_text()
        if old not in original:
            raise SystemExit('missing mutation pattern: ' + label)
        target.write_text(original.replace(old, new, 1))
        result = run(work, pattern)
        target.write_text(original)
        failures = set(re.findall(r'^not ok \d+ - (.*)', result.stdout, re.M))
        if result.returncode and len(failures) == 1 and all(name.startswith(pattern) for name in failures) and 'ERR_ASSERTION' in result.stdout and not result.stderr:
            killed.update(failures)
            print('[CAUGHT] ' + label, flush=True)
        else:
            survivors.append(label)
            (out / (str(len(survivors)) + '.log')).write_text(result.stdout + result.stderr)
    print(f'{len(MUTANTS)-len(survivors)}/{len(MUTANTS)} caught; survivors: {survivors}')
    print(f'{len(killed)}/{len(passed)} new tests observed failing; never failed: {sorted(passed-killed)}')
    raise SystemExit(1 if survivors or passed-killed else 0)
