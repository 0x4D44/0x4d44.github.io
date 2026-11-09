"""Release audit: additions-only namespace and unchanged production files.

Run after staging: python la-ladera/dev/extkit/audit_scope.py BASE --staged
Or after committing: python la-ladera/dev/extkit/audit_scope.py BASE
"""
import argparse
import json
import re
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base")
    parser.add_argument("--staged", action="store_true")
    args = parser.parse_args()
    command = ["git", "diff", "--name-status", "--no-renames"]
    if args.staged:
        command.append("--cached")
    command.append(args.base)
    if not args.staged:
        command.append("HEAD")
    output = subprocess.check_output(command, text=True)
    allowed = re.compile(r"^la-ladera/(?:assets/models/extkit/[^\n]+|assets/models/manifest\.extkit\.json|"
                         r"assets/textures/extkit/[^\n]+|tools/blender/extkit_[^/]+\.(?:py|mjs)|"
                         r"tools/blender/extkit\.catalog\.json|tests/extkit-[^/]+\.test\.mjs|"
                         r"tests/extkit-mutations\.mjs|dev/extkit/[^\n]+)$")
    rows = []
    for line in output.splitlines():
        status, path = line.split("\t", 1)
        if status != "A" or not allowed.fullmatch(path):
            raise SystemExit(f"SCOPE FAILURE: {status} {path}")
        if "/__pycache__/" in path or path.endswith(".pyc"):
            raise SystemExit(f"SCOPE FAILURE: generated Python cache {path}")
        rows.append(path)
    if not rows:
        raise SystemExit("No proposed exterior-kit files to audit")
    unstaged = subprocess.check_output(["git", "diff", "--name-only"], text=True).splitlines()
    if unstaged:
        raise SystemExit("Unstaged tracked modifications remain: " + ", ".join(unstaged))
    print(json.dumps({"ok": True, "base": subprocess.check_output(["git", "rev-parse", args.base], text=True).strip(),
                      "addedFiles": len(rows), "modifiedExistingFiles": 0,
                      "outsideNamespaceFiles": 0, "files": rows}, indent=2))


if __name__ == "__main__":
    main()
