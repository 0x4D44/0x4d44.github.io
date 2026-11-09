"""Tunnel rail datum and cover regression checks, using isolated synthetic tests only."""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

src = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
if not out.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('output must be under the worktree .scratch')
out.mkdir(parents=True, exist_ok=True)
M = [
    ('old schematic tunnel drop', 'core/scene.ts', 'export const TUNNEL_DEPTH = 0;', 'export const TUNNEL_DEPTH = -4;'),
    ('tunnel height shifted independently of datum', 'core/scene.ts', 'const y = r.tunnel ? TUNNEL_DEPTH : 0;', 'const y = r.tunnel ? 1 : 0;'),
    ('drawn tunnel below core height', 'web/src/track.ts', 'tunnelLines(rails.tunnel)', 'tunnelLines(rails.tunnel.map((v, i) => i % 3 === 1 ? v - 4 : v))'),
    ('tunnel stroke ignores hills', 'web/src/track.ts', 'color: TUNNEL_COLOUR, transparent: true', 'color: TUNNEL_COLOUR, depthTest: false, transparent: true'),
    ('unmodelled underground track exposed', 'web/src/track.ts', "!r.tunnel || r.ref === 'ECM1'", 'true'),
    ('modelled tunnel track suppressed', 'web/src/track.ts', "!r.tunnel || r.ref === 'ECM1'", '!r.tunnel'),
    ('flat mode loses its earth banks', 'web/src/portals.ts', 'if (!terrain && opts.cover !== false)', 'if (false)'),
    ('terrain cover is invisible', 'web/src/world.ts', "group.name = 'terrain';", "group.name = 'terrain'; group.visible = false;"),
]

def run(work):
    return subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=10000',
        '--test-name-pattern=scene: rail segments retain|tunnel rails meet|terrain and flat-mode portal banks|only modelled ECML bores',
        'core/tests/scene.test.ts', 'web/tests/track.test.ts'], cwd=work, stdin=subprocess.DEVNULL,
        capture_output=True, text=True, timeout=30)

with tempfile.TemporaryDirectory(prefix='tunnel-track-', dir=out) as directory:
    work = Path(directory) / 'kings-cross-src'
    for name in ['core', 'web']:
        shutil.copytree(src / name, work / name)
    shutil.copy2(src / 'package.json', work / 'package.json')
    (work / 'node_modules').symlink_to(src / 'node_modules', target_is_directory=True)
    baseline = run(work)
    if baseline.returncode:
        raise SystemExit(baseline.stdout + baseline.stderr)
    names = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
    if len(names) != 4:
        raise SystemExit('expected all four tunnel assertions')
    survivors, seen = [], set()
    for label, relative, old, new in M:
        target = work / relative
        original = target.read_text()
        if old not in original:
            raise SystemExit('missing mutation pattern: ' + label)
        target.write_text(original.replace(old, new, 1))
        try:
            result = run(work)
        finally:
            target.write_text(original)
        failed = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
        actual = set(re.findall(r'^(?:ok|not ok) \d+ - (.+)$', result.stdout, re.M))
        if result.returncode and failed and actual == names and 'ERR_ASSERTION' in result.stdout and not result.stderr:
            seen.update(failed)
            print('[CAUGHT] ' + label, flush=True)
        else:
            survivors.append(label)
            (out / f'{len(survivors)}.log').write_text(result.stdout + result.stderr)
            print('[SURVIVED] ' + label, flush=True)
    print(f'{len(M)-len(survivors)}/{len(M)} caught; survivors: {survivors}')
    print(f'{len(seen & names)}/{len(names)} tests observed failing; never failed: {sorted(names-seen)}')
    raise SystemExit(1 if survivors or names-seen else 0)
