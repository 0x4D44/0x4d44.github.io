"""Private synthetic mutations: python3 -I -u kings-cross-src/tools/mutation/axis08-evidence.py (from repo root).

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass first,
and a load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py)."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

package = Path(__file__).resolve().parents[2]
scratch = package.parent / '.scratch' / 'axis08-mutations'
TEST = 'tools/tests/axis08-evidence.test.mjs'
mutations = [
 ('ignore FPS targets', 'axis08-evidence.mjs', 'genuineMetal && warmFirstRenderWithin3s && fpsAtLeast60', 'genuineMetal && warmFirstRenderWithin3s'),
 ('ignore warm startup target', 'axis08-evidence.mjs', 'sample.firstRenderMs < 3000', 'sample.firstRenderMs <= 3000'),
 ('omit Markdown emitted file table', 'axis08-evidence.mjs', '...b.files.map(row =>', '...[].map(row =>'),
 ('omit Markdown FPS results', 'axis08-evidence.mjs', "for (const name of ['overview', 'shed'])", 'for (const name of [])'),
 ('omit emitted files', 'axis08-evidence.mjs', 'files.push({ file:', 'if (!entry.name.endsWith(".json")) files.push({ file:'),
 ('wrong budget', 'axis08-evidence.mjs', '2_000_000', '2 * 1024 * 1024'),
 ('maps counted as payload', 'axis08-evidence.mjs', "entry.name.endsWith('.map')", 'false'),
 ('lose hardware model', 'axis08-evidence.mjs', 'hardware.model = data.', 'hardware.model = null; const unused = data.'),
 ('confuse scene readiness and first render', 'axis08-evidence.mjs', 'sceneReadyMs: summarize(rows.map(row => row.sceneReadyMs))', 'sceneReadyMs: summarize(rows.map(row => row.firstRenderMs))'),
 ('accept software renderer', 'axis08-evidence.mjs', '!/swiftshader|software|llvmpipe/i.test', '/swiftshader|software|llvmpipe/i.test'),
 ('omit repeated independent pairs', 'axis08-evidence.mjs', 'index < runs;', 'index < runs - 1;'),
 ('premature city readiness', 'perf.mjs', 'cityComplete && k.parts?.terrain && k.parts?.buildings', 'true'),
 ('allow one startup pair', 'axis08-evidence.mjs', 'runs < 2', 'runs < 1'),
]

tally = kxmut.Tally()
with kxmut.workspace(package, scratch, 'axis08') as work:
    suite = kxmut.Suite(work, test_timeout_ms=10000, timeout=30)
    baseline = suite.baseline([TEST])
    for label, file, old, new in mutations:
        try:
            with kxmut.mutated(work / 'tools' / file, [(old, new)]):
                verdict, _run = suite.judge([TEST], strict='any')
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
status = tally.finish()
unproven = baseline.passed - tally.red
print(f'{len(tally.red & baseline.passed)}/{len(baseline.passed)} tests seen failing')
for name in sorted(unproven):
    print('  UNPROVEN:', name)
sys.exit(1 if status or unproven else 0)
