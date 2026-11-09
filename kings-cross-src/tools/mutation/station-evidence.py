"""Bounded mutations for the fixed Station evidence cameras and slate capture path."""
from __future__ import annotations
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
if src == out or src.is_relative_to(out) or out.is_relative_to(src) or '.scratch' not in out.parts:
    raise SystemExit('Choose a separate output under worktree .scratch')
out.mkdir(parents=True, exist_ok=True)

TEST = 'tools/tests/station-evidence.test.mjs'
EVIDENCE = 'tools/evidence.mjs'
NAMES = [
    'Barlow oblique evidence frames the south arch and long slate flank clear of the Midland Grand',
    'platform eye evidence keeps the north-facing view and adds a south-facing view on the same platform',
    'serialized slate evidence keeps the glass callback, forces physical cladding and restores exact state on success or capture error',
    'physical slate shots await capture inside the override and restore after capture failure',
    'roof-above and front-oblique slate pairs share their context cameras and label auto versus solid evidence',
]
MUTATIONS = [
    ('Barlow companion camera omitted', "cams['st-pancras-shed-oblique'] = camera(", "cams['st-pancras-shed'] = camera(", NAMES[0]),
    ('Barlow companion frame narrowed', "{ fov: 55, near: .1 },\n  );", "{ fov: 5, near: .1 },\n  );", NAMES[0]),
    ('south platform camera points north', "[mid[0] - Math.sin(s.heading) * 40, PLATFORM_HEIGHT + 1.6, mid[1] + Math.cos(s.heading) * 40]", "[mid[0] + Math.sin(s.heading) * 40, PLATFORM_HEIGHT + 1.6, mid[1] - Math.cos(s.heading) * 40]", NAMES[1]),
    ('slate override leaves auto opacity', 'material.opacity = 1; material.depthWrite = true;', 'material.opacity = .5; material.depthWrite = true;', NAMES[2]),
    ('slate override fails to restore callback', 'cladding.onBeforeRender = callback;', 'cladding.onBeforeRender = function() {};', NAMES[2]),
    ('physical screenshot restore omitted', 'finally { await restore(); }', 'finally { /* mutation */ }', NAMES[3]),
    ('solid slate pair omitted from Station shots', "for (const pair of pairs)\n    await attempt('02'", "for (const pair of [])\n    await attempt('02'", NAMES[4]),
    ('solid slate pair uses a different camera', 'solid: { camera: cameras[cameraName], roofMaterialEvidence:', 'solid: { camera: { ...cameras[cameraName] }, roofMaterialEvidence:', NAMES[4]),
]

def run(work: Path, name: str | None = None):
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=15000']
    if name:
        command.append('--test-name-pattern=^' + re.escape(name) + '$')
    command.append(TEST)
    return subprocess.run(command, cwd=work, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)

with tempfile.TemporaryDirectory(prefix='station-evidence-', dir=out) as directory:
    work = Path(directory) / 'kings-cross-src'
    work.mkdir()
    for folder in ['core', 'web', 'node_modules']:
        (work / folder).symlink_to(src / folder, target_is_directory=True)
    (work / 'tools' / 'tests').mkdir(parents=True)
    (work / 'tools' / 'mutation').mkdir(parents=True)
    for name in [EVIDENCE, TEST, 'package.json']:
        shutil.copy2(src / name, work / name)
    baseline = run(work)
    passed = set(re.findall(r'^ok \d+ - (.*)$', baseline.stdout, re.M))
    if baseline.returncode or baseline.stderr or passed != set(NAMES):
        print(baseline.stdout, baseline.stderr)
        raise SystemExit('baseline must pass every named Station evidence assertion')

    failures = []
    for label, old, new, test_name in MUTATIONS:
        target = work / EVIDENCE
        original = target.read_text()
        if original.count(old) != 1:
            raise SystemExit(f'mutation anchor must occur exactly once: {label}')
        target.write_text(original.replace(old, new, 1))
        try:
            result = run(work, test_name)
        finally:
            target.write_text(original)
        failed = re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M)
        results = re.findall(r'^(?:not )?ok \d+ - ', result.stdout, re.M)
        if result.returncode and failed == [test_name] and len(results) == 1 and 'ERR_ASSERTION' in result.stdout and not result.stderr:
            print('[CAUGHT] ' + label, flush=True)
        else:
            failures.append(label)
            (out / (str(len(failures)) + '.log')).write_text(result.stdout + result.stderr)
    print(f'{len(MUTATIONS) - len(failures)}/{len(MUTATIONS)} caught; survivors: {failures}')
    raise SystemExit(1 if failures else 0)
