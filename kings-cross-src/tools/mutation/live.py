"""Mutation checks for the live train renderer, feed and relay file endpoints.

python3 -I -u kings-cross-src/tools/mutation/live.py kings-cross-src .scratch/live-mutations
Listener-free relay tests run here; the lead runs the socket integration suite outside the sandbox.
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
F = 'web/src/feed.ts'
T = 'web/src/trains-live.ts'
R = 'relay/relay.mjs'
M = [
    ('proxy preserves the wrong Host', 'vite.config.ts', 'changeOrigin: true', 'changeOrigin: false'),
    ('default mode never probes relay', F, "requested === null ? 'auto'", "requested === null ? 'demo'"),
    ('recording rows remain out of time order', F, 'return rows.sort((a, b) => a.t - b.t);', 'return rows;'),
    ('replay speed ignored', F, 'seconds * speed * 1000', 'seconds * 1000'),
    ('event applied before advancing to its time', F, 'advanceTo(atMs); sink.apply(event, time);', 'sink.apply(event, time); advanceTo(atMs);'),
    ('backoff never increases', F, '500 * 2 ** Math.min(16, Math.max(0, Math.floor(attempt)))', '500'),
    ('reconnect snapshot does not cancel missing descriptions', F, 'if (!present.has(descr))', 'if (false)'),
    ('failed EventSource left connected', F, 'stream?.close(); stream = undefined;', 'stream = undefined;'),
    ('scheduled reconnect survives disposal', F, 'if (timer !== undefined) unschedule(timer);', 'if (false) unschedule(timer);'),
    ('failed default probe repeats its request', F, 'catch { return false; }', "catch { await fetchImpl('/relay/health').catch(() => {}); return false; }"),
    ('trail sampled from tail instead of nose', T, 'let i = train.occupied.length - 1; i >= 0; i--', 'let i = 0; i < train.occupied.length; i++'),
    ('car chord compression ignored', T, 'const scaleZ = chord / (car.bogies[1] - car.bogies[0]);', 'const scaleZ = 1;'),
    ('all cars face the same direction', T, 'node.rotation.y = pose.rotationY;', 'node.rotation.y = 0;'),
    ('body clearances removed', T, 'export const COUPLING_CLEARANCE = 0.35;', 'export const COUPLING_CLEARANCE = 0;'),
    ('all headcodes use five cars', T, "description[0] === '1'", "description[0] === '9'"),
    ('opacity changes shared materials', T, 'copies.set(m, m.clone())', 'copies.set(m, m)'),
    ('vanished groups left in scene', T, 'parent.remove(t.group);', 't.group.visible = false;'),
    ('clipped trains extrapolate unseen cars', T, 'if (car.end > train.occupiedLengthM + 1e-7) continue;', 'if (false) continue;'),
    ('straight cars shifted off track', T, 'position: [frontBogie.point[0] - dx', 'position: [1 + frontBogie.point[0] - dx'),
    ('configured anchor file ignored', R, 'file = anchorsFile;', "file = path.join(dataDir, 'missing-anchors.json');"),
    ('missing local files claim success', R, 'return { status: 404, body:', 'return { status: 200, body:'),
    ('recording date guard disabled', R, "dates.length !== 1 || !/^\\d{8}$/.test(dates[0])", 'false'),
    ('recording uses another TD area', R, '`td-${area}-${dates[0]}.ndjson`', '`td-WRONG-${dates[0]}.ndjson`'),
    ('client can override recording path', R, "file = path.join(dataDir, 'recordings',", "file = url.searchParams.get('path') ?? path.join(dataDir, 'recordings',"),
    ('Host guard disabled', R, "if (!['127.0.0.1', 'localhost'].some((h) => host === `${h}:${port}`))", 'if (false)'),
    ('non-GET requests allowed', R, "return method === 'GET' ? null : 405;", 'return null;'),
]

def run(work):
    return subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=15000',
                           '--test-name-pattern=^(relay files:|the dev relay proxy|train URL|feed parses|replay clock|live and replay|backoff grows|a reconnect snapshot|live SSE|the default relay probe|live car|consecutive car|straight car|the headcode|fading one train|cars whose)', 'web/tests/feed.test.ts',
                           'web/tests/trains-live.test.ts', 'relay/tests/relay.test.mjs'],
                          cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=45)

baseline = run(src)
if baseline.returncode:
    print(baseline.stdout, baseline.stderr)
    raise SystemExit('baseline must pass')
names = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
seen = set()
survivors = []
for label, rel, old, new in M:
    original = (src / rel).read_text()
    if old not in original:
        raise SystemExit(f'mutation pattern missing: {label}')
    with tempfile.TemporaryDirectory(prefix='live-', dir=scratch) as tmp:
        work = Path(tmp)
        for directory in ['core', 'web', 'relay']:
            shutil.copytree(src / directory, work / directory)
        for file in ['package.json', 'vite.config.ts']:
            shutil.copy2(src / file, work / file)
        (work / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)
        (work / rel).write_text(original.replace(old, new, 1))
        try:
            result = run(work)
        except subprocess.TimeoutExpired:
            print(f'[KILLED ] {label} (timeout)', flush=True)
            continue
        failed = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
        seen.update(failed)
        if result.returncode and failed:
            print(f'[KILLED ] {label} <- {sorted(failed)[0]}', flush=True)
        else:
            survivors.append(label)
            print(f'[SURVIVED] {label}', flush=True)

unproven = names - seen
print(f'\n{len(M) - len(survivors)}/{len(M)} mutations caught')
print(f'{len(names) - len(unproven)}/{len(names)} new tests observed failing at least once')
for label in survivors:
    print('  NOT CAUGHT:', label)
for name in sorted(unproven):
    print('  NEVER FAILED:', name)
raise SystemExit(1 if survivors or unproven else 0)
