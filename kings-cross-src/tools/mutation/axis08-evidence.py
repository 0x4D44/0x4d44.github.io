"""Private synthetic mutations: python3 -I -u kings-cross-src/tools/mutation/axis08-evidence.py (from repo root)."""
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
src = Path(__file__).resolve().parent.parent
scratch = src.parent.parent / '.scratch' / 'axis08-mutations'
scratch.mkdir(parents=True, exist_ok=True)
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
def run(work):
 return subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=10000', 'tools/tests/axis08-evidence.test.mjs'], cwd=work, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30)
baseline = run(src.parent)
if baseline.returncode: raise SystemExit(baseline.stdout + baseline.stderr)
names = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
failed = set()
for label, file, old, new in mutations:
 with tempfile.TemporaryDirectory(prefix='case-', dir=scratch) as tmp:
  work = Path(tmp)
  (work / 'tools/tests').mkdir(parents=True)
  for name in ['axis08-evidence.mjs', 'perf.mjs']: shutil.copy2(src / name, work / 'tools' / name)
  shutil.copy2(src / 'tests/axis08-evidence.test.mjs', work / 'tools/tests/axis08-evidence.test.mjs')
  target = work / 'tools' / file
  source = target.read_text()
  if old not in source: raise SystemExit(f'missing pattern: {label}')
  target.write_text(source.replace(old, new, 1))
  result = run(work)
  failures = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
  if not (result.returncode and failures and 'ERR_ASSERTION' in result.stdout and re.search(r'^# tests \d+$', result.stdout, re.M)): raise SystemExit(f'SURVIVED/INVALID {label}\n{result.stdout}\n{result.stderr}')
  failed.update(failures)
  print(f'KILLED {label}', flush=True)
if names - failed: raise SystemExit(f'unproven: {names - failed}')
print(f'{len(mutations)}/{len(mutations)} mutations killed; {len(failed)}/{len(names)} tests seen failing')
