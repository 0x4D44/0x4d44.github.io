"""Exercise the real adult builder's companion staging without running Blender.

Run from the repository root:
    nice -n 10 ionice -c 3 python3 la-ladera/dev/garments-child-teen/builder-preservation.py

Only preserve_companions is AST-loaded from the production source; its imports,
geometry generation and main entry point are never executed. All fixtures and
mutated helper copies live in a TemporaryDirectory. Each passing contract also
has an intentional helper mutation that the same contract must reject.
"""
import ast
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BUILDER = ROOT / 'tools/blender/garments_build.py'
OUTPUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE / 'builder-preservation.json'
CHILD = ('garments/garments_child.glb', 'manifest.garments_child.json')
TEEN = ('garments/garments_teen.glb', 'manifest.garments_teen.json', 'garments/teen')
OWNED = CHILD + TEEN[:2] + ('garments/teen/palette.json', 'garments/teen/fabrics.png', 'garments/teen/nested/extra.bin')


def fingerprint(tree):
    return {str(path.relative_to(tree)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(tree.rglob('*')) if path.is_file()}


def fixture(base):
    out, stage, other = (base / name for name in ('selected', 'stage', 'other'))
    for path in (out, stage, other):
        path.mkdir(parents=True)
        (path / 'garments').mkdir()
    for tree, marker in ((out, b'selected:'), (other, b'other:')):
        for rel in (*OWNED, 'garments/adult.bin', 'manifest.garments.json'):
            path = tree / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(marker + rel.encode())
    return out, stage, other


def load_helper(text, other):
    tree = ast.parse(text, filename=str(BUILDER))
    functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'preserve_companions']
    assert len(functions) == 1, 'the production helper must exist exactly once'
    module = ast.Module(body=functions, type_ignores=[])
    namespace = {'shutil': shutil, 'MODELS': other}
    exec(compile(module, str(BUILDER), 'exec'), namespace)
    return namespace['preserve_companions']


def complete_sets(helper, out, stage, other):
    before = fingerprint(out)
    preserved = helper(out, stage)
    expected = {stage / rel for rel in OWNED}
    assert preserved == expected, 'the exact companion files must be assigned to their own budgets'
    for rel in OWNED:
        assert (stage / rel).read_bytes() == (out / rel).read_bytes(), f'companion bytes lost while staging: {rel}'
    assert not (stage / 'garments/adult.bin').exists(), 'adult geometry must be regenerated, not copied as companion payload'
    assert fingerprint(out) == before, 'staging must not change the selected tree'
    # Use the same directory swap as the builder, with a sentinel for regenerated
    # adult data. Companion manifests remain outside the swapped directory.
    (stage / 'garments/adult.bin').write_bytes(b'regenerated adult sentinel')
    backup = stage / 'previous-garments'
    os.replace(out / 'garments', backup)
    os.replace(stage / 'garments', out / 'garments')
    after = fingerprint(out)
    for rel in OWNED:
        assert after[rel] == before[rel], f'directory installation changed companion bytes: {rel}'
    assert (out / 'garments/adult.bin').read_bytes() == b'regenerated adult sentinel'


def absent_sets(helper, out, stage, other):
    for rel in CHILD + TEEN:
        path = out / rel
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    before = fingerprint(out)
    assert helper(out, stage) == set(), 'a first adult build has no companion-owned bytes'
    assert fingerprint(out) == before, 'absent companions must not change adult source bytes'
    assert fingerprint(stage) == {}, 'absent companions must not invent staged files'


def incomplete_set(missing):
    def contract(helper, out, stage, other):
        path = out / missing
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
        before = fingerprint(out)
        age = 'child' if missing in CHILD else 'teen'
        try:
            helper(out, stage)
        except ValueError as exc:
            assert f'Existing {age} library is incomplete' in str(exc), 'the error must identify the incomplete set'
        else:
            raise AssertionError(f'missing {missing} must block adult regeneration')
        assert fingerprint(out) == before, 'rejected staging must leave every original source byte intact'
    return contract


def chosen_output(helper, out, stage, other):
    before, other_before = fingerprint(out), fingerprint(other)
    helper(out, stage)
    for rel in OWNED:
        assert (stage / rel).read_bytes() == (out / rel).read_bytes(), f'read a different output tree for {rel}'
        assert (stage / rel).read_bytes() != (other / rel).read_bytes(), f'used global MODELS for {rel}'
    assert fingerprint(out) == before and fingerprint(other) == other_before, 'neither source tree may be altered'


def replace_once(source, before, after):
    assert source.count(before) == 1, f'mutation target must exist exactly once: {before}'
    return source.replace(before, after, 1)


source = BUILDER.read_text()
incomplete_raise = "raise ValueError(f'Existing {age} library is incomplete; repair its GLB, manifest and any texture directory before regenerating adult assets')"
cases = [
    ('complete child and teen sets retain exact bytes across adult directory replacement', complete_sets,
     'omit regular-file companion copies', 'shutil.copy2(source, target)', 'pass'),
    ('absent companion sets are valid for a first adult build', absent_sets,
     'reject absent sets', 'if not any(path.exists() for path in sources):\n            continue',
     "if not any(path.exists() for path in sources):\n            raise ValueError('mutation: absent sets rejected')"),
]
for missing in CHILD + TEEN:
    cases.append((f'incomplete set is rejected without data loss: {missing}', incomplete_set(missing),
                  'allow incomplete companion set', incomplete_raise, 'continue'))
cases.append(('companions are read from the selected output tree only', chosen_output,
              'read global MODELS instead of selected output', 'sources = [out / rel for rel in paths]',
              'sources = [MODELS / rel for rel in paths]'))

rows = []
with tempfile.TemporaryDirectory(prefix='ladera-builder-preservation-') as temporary:
    temporary = Path(temporary)
    for index, (name, contract, mutation, before, after) in enumerate(cases):
        out, stage, other = fixture(temporary / f'baseline-{index}')
        contract(load_helper(source, other), out, stage, other)
        out, stage, other = fixture(temporary / f'mutant-{index}')
        mutant = replace_once(source, before, after)
        try:
            contract(load_helper(mutant, other), out, stage, other)
        except (AssertionError, ValueError, FileNotFoundError) as exc:
            reason = str(exc).replace(str(temporary), '<isolated-fixture>')
        else:
            raise AssertionError(f'mutation survived: {name}')
        rows.append({'test': name, 'baseline': 'PASS', 'mutation': mutation, 'mutant': 'KILLED', 'reason': reason})
        print(f'PASS + KILLED {index + 1}/{len(cases)} {name}')

report = {'builder': 'la-ladera/tools/blender/garments_build.py',
          'builderSha256': hashlib.sha256(source.encode()).hexdigest(),
          'tests': len(rows), 'passed': len(rows), 'mutationsKilled': len(rows), 'mutationsSurvived': 0, 'results': rows}
OUTPUT.write_text(json.dumps(report, indent=2) + '\n')
print(f'Builder companion preservation: {len(rows)}/{len(rows)} contracts passed; {len(rows)}/{len(rows)} mutations killed; source assets untouched.')
