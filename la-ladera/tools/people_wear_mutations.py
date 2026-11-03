"""Run each named test against an isolated implementation mutation on Node 22.16.

Tests, generated files and implementation sources are never edited. The Node
loader changes an in-memory module; the exported-body case corrupts an isolated
BIN fixture decoded from the actual shipped model. A kill requires a passing named control,
the expected loader marker, and a failure of that same named test. Missing assets,
empty output, syntax errors, timeouts and pre-test failures receive no credit.

--unit selects cases independent of generated wardrobe assets. --filter selects
mutation IDs; either is explicitly incomplete. --list audits mapping and anchors.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SUITES = ["la-ladera/tests/people-wear.test.mjs", "la-ladera/tests/people-wear-runtime.test.mjs",
          "la-ladera/tests/people-wear-body.test.mjs", "la-ladera/tests/people-wear-rebase.test.mjs",
          "la-ladera/tests/people-wear-fit-search.test.mjs", "la-ladera/tests/people-wear-target-branch.test.mjs"]
DEPENDENCIES = [
    'tests/nice.mjs', 'tests/register.mjs', 'tests/hooks.mjs',
    'assets/models/manifest.people.json', 'assets/models/manifest.json',
    'assets/models/manifest.garments.json', 'assets/models/garments/prints.png',
    'assets/models/garments/palette.json', 'tools/blender/people_clips.json.gz',
    'tools/blender/people_contract.json', 'tools/blender/people_wear.catalog.json',
    'tools/blender/people_wear_build.py', 'tools/blender/people_wear_shapes.py',
    'tools/blender/people_wear_body.py', 'tools/blender/people_wear_body_guard.py',
    'tools/blender/people_wear_lod.py', 'tools/blender/people_wear_fit_faces.mjs',
    'tools/blender/people_wear_fit_targets.mjs', 'tools/blender/people_wear_fit_search.mjs', 'tools/blender/people_wear_target_search.mjs',
    'tools/blender/people_wear_pack.py', 'tools/blender/people_wear_math.mjs',
    'tools/blender/people_wear_validate.mjs', 'tools/blender/people_validate.mjs',
    'tools/people_wear_data.mjs', 'js/people/rig.js', 'js/people/wear.js',
    'js/people/wear_data.js', 'js/people/wear_geometry.js', 'js/people/wear_pose.js',
    'js/people/wear_correction.js', 'vendor/three/build/three.core.min.js',
    'vendor/three/examples/jsm/loaders/GLTFLoader.js',
]


def lf(path):
    return (ROOT / path).read_text(encoding="utf8").replace("\r\n", "\n")


def sha(data):
    return hashlib.sha256(data.encode("utf8") if isinstance(data, str) else data).hexdigest()


def key(row):
    return (row["suite"], row["test"])


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default=os.environ.get("LADERA_NODE", "node"))
    parser.add_argument("--out", default="la-ladera/dev/wear/mutations")
    parser.add_argument("--unit", action="store_true")
    parser.add_argument("--filter")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--timeout-seconds", type=float, default=600)
    args = parser.parse_args()
    try:
        if os.getpriority(os.PRIO_PROCESS, 0) < 19:
            os.setpriority(os.PRIO_PROCESS, 0, 19)
    except (AttributeError, PermissionError):
        pass  # Each Node test also imports the repository's idle-priority shim.
    env = dict(os.environ, LADERA_PRIO="idle")
    env.pop("LADERA_WEAR_MUTATION", None)
    node = subprocess.check_output([args.node, "--version"], env=env, text=True).strip()
    if node != "v22.16.0":
        raise RuntimeError(f"Required Node v22.16.0; got {node}")
    case_files = sorted(HERE.glob("people_wear_mutations_*.json"))
    catalog = [row for path in case_files for row in json.loads(path.read_text())]
    expected = [{"suite": suite, "test": name} for suite in SUITES
                for name in re.findall(r"^test\('([^']+)'", lf(suite), re.M)]
    mapped = {key(row) for row in catalog}
    expected_keys = {key(row) for row in expected}
    unmapped = [row for row in expected if key(row) not in mapped]
    defects, ids = [], set()
    for row in catalog:
        if row["id"] in ids:
            defects.append(f"duplicate ID {row['id']}")
        ids.add(row["id"])
        if key(row) not in expected_keys:
            defects.append(f"unknown named test {row['id']}")
        if not row.get("changes"):
            defects.append(f"no implementation changes {row['id']}")
        for change in row.get("changes", []):
            path = change["path"]
            if not path.startswith("la-ladera/") or "/tests/" in path or "/dev/" in path or ".." in Path(path).parts:
                defects.append(f"invalid implementation path {row['id']}/{path}")
            elif change.get('kind') == 'body-position-fixture':
                if path != 'la-ladera/assets/models/wear/metadata.json' or change.get('fit') != 'm_don' or change.get('axis') != 0 or change.get('delta') != .003:
                    defects.append(f"invalid exported-body fixture mutation {row['id']}")
            elif not change.get("from") or change["from"] == change["to"] or lf(path).count(change["from"]) != 1:
                defects.append(f"nonunique, stale or ineffective anchor {row['id']}/{path}")
    selected = [row for row in catalog if (not args.unit or not row["requiresAssets"])
                and (not args.filter or re.search(args.filter, row["id"]))]
    audit = dict(schema=1, node=node, sourceForm="LF", namedTests=len(expected), mappedTests=len(mapped),
                 mutants=len(catalog), selected=len(selected), unmapped=unmapped, defects=defects,
                 partialSelection=len(selected) != len(catalog))
    if args.list:
        print(json.dumps(audit, indent=2))
        return int(bool(defects or unmapped))
    if defects or not selected:
        raise RuntimeError("\n".join(defects) or "No selected mutation cases")
    out = (ROOT / args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix="work-", dir=out))
    tracked = sorted(set(SUITES + ['la-ladera/'+path for path in DEPENDENCIES]
                         + [change["path"] for row in catalog for change in row["changes"]]
                         + [str(path.relative_to(ROOT)) for path in case_files]
                         + ["la-ladera/tools/people_wear_mutations.py", "la-ladera/tools/people_wear_mutation_hook.mjs",
                            "la-ladera/tools/people_wear_mutation_register.mjs", "la-ladera/tools/blender/people_wear_body_check.py",
                            "la-ladera/tools/blender/people_wear_shapes.py"]
                         + [f"la-ladera/tools/blender/{name}.py" for name in
                            ['people_body', 'people_body_limbs', 'people_tex', 'people_head', 'people_build', 'people_cast']]))

    def snapshot():
        paths = set(tracked)
        for directory in ['la-ladera/assets/models/wear', 'la-ladera/assets/models/people', 'la-ladera/dev/wear/body-provenance']:
            paths.update(str(path.relative_to(ROOT)) for path in (ROOT/directory).glob('*') if path.is_file())
        paths.update(str(path.relative_to(ROOT)) for path in (ROOT/'la-ladera/dev/wear/authoring').rglob('*.json') if path.is_file())
        for path in ['la-ladera/assets/models/manifest.people-wear.json', 'la-ladera/dev/wear/clearance.json']:
            if (ROOT/path).is_file():
                paths.add(path)
        result = []
        for path in sorted(paths):
            binary = Path(path).suffix.lower() not in ['.js', '.mjs', '.json', '.py', '.md', '.txt']
            data = (ROOT/path).read_bytes() if binary else lf(path).encode('utf8')
            result.append(dict(path=path, form='bytes' if binary else 'LF', bytes=len(data), sha256=sha(data)))
        return result

    inputs, reports, controls = snapshot(), [], {}
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()

    def run(row, mutation):
        ident = row["id"] if mutation else f"control-{len(controls):03}"
        path = out / f"{ident}.tap"
        cmd = [args.node, "--import", "./la-ladera/tests/register.mjs", "--import",
               "./la-ladera/tools/people_wear_mutation_register.mjs",
               f"--test-name-pattern=^{re.escape(row['test'])}$", row["suite"]]
        child_env = dict(env)
        if mutation:
            config = temporary / f"{ident}.json"
            write(config, dict(row, root=str(ROOT)))
            child_env["LADERA_WEAR_MUTATION"] = str(config)
        t0, timed_out = time.monotonic(), False
        with path.open("wb") as output:
            try:
                result = subprocess.run(cmd, cwd=ROOT, env=child_env, stdin=subprocess.DEVNULL,
                                        stdout=output, stderr=subprocess.STDOUT, timeout=args.timeout_seconds)
                code = result.returncode
            except subprocess.TimeoutExpired:
                timed_out, code = True, None
        text = path.read_text(encoding="utf8", errors="replace")
        passed = bool(re.search(r"^ok \d+ - " + re.escape(row["test"]) + r"\r?$", text, re.M))
        failed = bool(re.search(r"^not ok \d+ - " + re.escape(row["test"]) + r"\r?$", text, re.M))
        first_indices = {}
        for index, change in enumerate(row["changes"]):
            first_indices.setdefault(change["path"], index)
        applied = not mutation or all(f"[wear-mutation-applied:{row['id']}:{index}]" in text for index in first_indices.values())
        setup_failure = bool(re.search(r"MUTATION_ANCHOR_MISMATCH|ERR_MODULE_NOT_FOUND|SyntaxError:|ENOENT:|ERR_UNKNOWN_FILE_EXTENSION", text))
        return dict(command=cmd, exitCode=code, seconds=time.monotonic()-t0, passed=passed, failed=failed,
                    applied=applied, setupFailure=setup_failure, timedOut=timed_out,
                    log=str(path.relative_to(ROOT)), sha256=sha(text))

    try:
        for row in selected:
            if key(row) not in controls:
                controls[key(row)] = run(row, False)
            control = controls[key(row)]
            mutation, status = None, "blocked-positive-control"
            if control["exitCode"] == 0 and control["passed"] and not control["failed"] and not control["setupFailure"] and not control["timedOut"]:
                mutation = run(row, True)
                killed = mutation["exitCode"] not in (0, None) and mutation["failed"] and mutation["applied"] and not mutation["setupFailure"] and not mutation["timedOut"]
                status = "killed" if killed else "survived-or-invalid"
            reports.append(dict(id=row["id"], suite=row["suite"], test=row["test"], description=row["description"],
                                status=status, control=control, mutation=mutation))
            print(json.dumps(dict(id=row["id"], status=status, completed=len(reports), selected=len(selected))), flush=True)
            write(out / "progress.json", dict(audit, startedAt=started, complete=False, inputs=inputs, reports=reports))
        stable = snapshot() == inputs
        killed = sum(row["status"] == "killed" for row in reports)
        complete = stable and not unmapped and len(selected) == len(catalog) and killed == len(selected)
        report = dict(audit, startedAt=started, finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                      complete=complete, stable=stable, inputs=inputs, killed=killed,
                      blocked=sum(row["status"] == "blocked-positive-control" for row in reports),
                      survivedOrInvalid=sum(row["status"] == "survived-or-invalid" for row in reports), reports=reports)
        write(out / "report.json", report)
        print(json.dumps({name: report[name] for name in ["complete", "stable", "killed", "selected", "mappedTests", "namedTests"]}))
        return 0 if stable and killed == len(selected) and (args.unit or args.filter or complete) else 1
    finally:
        shutil.rmtree(temporary)


if __name__ == "__main__":
    raise SystemExit(main())
