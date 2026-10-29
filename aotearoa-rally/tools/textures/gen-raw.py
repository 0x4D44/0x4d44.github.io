#!/usr/bin/env python3
"""Generate raw PNGs with codex image generation.
Usage: gen-raw.py SCRATCH [name ...] [--jobs N] [--force]
Skips names whose NAME.png already exists unless --force."""
import subprocess, sys, os, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from specs import SPECS, prompt


# Windows: no console window (CREATE_NO_WINDOW) and BELOW_NORMAL priority, so a run never disturbs the desk.
FLAGS = 0x08000000 | 0x00004000 if os.name == "nt" else 0


def run(scratch, name):
    cmd = ["deltic", "timeout", "280", "codex", "exec", "--json", "--skip-git-repo-check", "-C", scratch,
           "-s", "workspace-write", "-c", "approval_policy=never", "-m", "gpt-6.1-sol",
           "-c", "model_reasoning_effort=medium", prompt(name)]
    r = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, creationflags=FLAGS)
    ok = os.path.exists(os.path.join(scratch, name + ".png"))
    print(name, "OK" if ok else f"FAIL rc={r.returncode}", flush=True)
    return ok


def main():
    a = sys.argv[1:]
    scratch = a[0]
    jobs = 4
    force = False
    names = []
    i = 1
    while i < len(a):
        if a[i] == "--jobs":
            jobs = int(a[i + 1]); i += 1
        elif a[i] == "--force":
            force = True
        else:
            names.append(a[i])
        i += 1
    names = names or list(SPECS)
    if not force:
        names = [n for n in names if not os.path.exists(os.path.join(scratch, n + ".png"))]
    with cf.ThreadPoolExecutor(jobs) as ex:
        list(ex.map(lambda n: run(scratch, n), names))


if __name__ == "__main__":
    main()
