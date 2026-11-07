"""Mutation check for core/scene.ts tests. usage: python3 -I -u tools/mutation/scene.py <kings-cross-src> <scratch dir>"""
import re, shutil, subprocess, sys
from pathlib import Path

src = Path(sys.argv[1]); scratch = Path(sys.argv[2])
F = "core/scene.ts"
M = [
    ("tunnel rails go in the main bucket", "const bucket = r.tunnel ? out.tunnel : r.service === 'main' ? out.main : out.siding;", "const bucket = r.service === 'main' ? out.main : out.siding;"),
    ("service sidings drawn as main", "r.service === 'main' ? out.main : out.siding", "out.main"),
    ("tunnels at ground level", "const y = r.tunnel ? TUNNEL_DEPTH : 0;", "const y = 0;"),
    ("segments with unknown nodes kept as zeros", "if (!a || !b) continue;", "if (!a || !b) { bucket.push(0, y, 0, 0, y, 0); continue; }"),
    ("x/z swapped", "bucket.push(a[0], y, a[1], b[0], y, b[1]);", "bucket.push(a[1], y, a[0], b[1], y, b[0]);"),
    ("last segment dropped", "i + 1 < r.nodes.length", "i + 2 < r.nodes.length"),
    ("height tag ignored", "b.height ?? (b.levels", "(b.levels"),
    ("levels ignored", "b.levels !== undefined ? b.levels * LEVEL_HEIGHT : DEFAULT_BUILDING_HEIGHT", "DEFAULT_BUILDING_HEIGHT"),
    ("levels height wrong", "b.levels * LEVEL_HEIGHT", "b.levels * 3"),
    ("no minimum clamp", "Math.min(MAX_BUILDING_HEIGHT, Math.max(MIN_BUILDING_HEIGHT, raw))", "Math.min(MAX_BUILDING_HEIGHT, raw)"),
    ("no maximum clamp", "Math.min(MAX_BUILDING_HEIGHT, Math.max(MIN_BUILDING_HEIGHT, raw))", "Math.max(MIN_BUILDING_HEIGHT, raw)"),
    ("degenerate buildings kept", ".filter((b) => b.pts.length >= 3)", ".filter((b) => b.pts.length >= 2)"),
    ("building label dropped", "if (b.name) p.label = b.name;", ""),
    ("degenerate platforms kept", ".filter((p) => p.pts.length >= 3)", ".filter((p) => p.pts.length >= 1)"),
    ("platform label dropped", "if (p.ref !== undefined) prism.label = p.ref;", ""),
    ("platform height wrong", "height: PLATFORM_HEIGHT }", "height: 1.5 }"),
    ("platform height from building rule", "height: PLATFORM_HEIGHT }", "height: DEFAULT_BUILDING_HEIGHT }"),
    ("bounds minZ wrong", "if (z < minZ) minZ = z;", ""),
    ("bounds reads y as z", "const z = positions[i + 2] as number;", "const z = positions[i + 1] as number;"),
]
survived = []
for i, (label, old, new) in enumerate(M):
    work = scratch / f"s{i:02d}"
    if work.exists(): shutil.rmtree(work)
    shutil.copytree(src, work, ignore=shutil.ignore_patterns("node_modules", "relay"))
    f = work / F; text = f.read_text()
    if old not in text:
        print(f"[SKIP    ] {label}: pattern not found", flush=True); survived.append(label); shutil.rmtree(work); continue
    f.write_text(text.replace(old, new, 1))
    try:
        r = subprocess.run(["node", "--test", "--test-force-exit", "--test-timeout=8000", "core/tests/scene.test.ts"], cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=60)
    except subprocess.TimeoutExpired:
        print(f"[KILLED  ] {label} (hung)", flush=True); shutil.rmtree(work, ignore_errors=True); continue
    failed = sorted(set(re.findall(r"^\s*✖ (.+?) \(", r.stdout, re.M)))
    if r.returncode != 0:
        print(f"[KILLED  ] {label} <- {failed[0] if failed else '(non-zero exit)'}", flush=True)
    else:
        print(f"[SURVIVED] {label}", flush=True); survived.append(label)
    shutil.rmtree(work)
print(f"\n{len(M) - len(survived)}/{len(M)} mutations caught")
for s in survived: print("  NOT CAUGHT:", s)
