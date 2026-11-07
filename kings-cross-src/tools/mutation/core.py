"""Mutation check for the core (TypeScript) tests.

usage: python3 -I -u tools/mutation/core.py <path to kings-cross-src> <scratch dir>
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

src = Path(sys.argv[1])
scratch = Path(sys.argv[2])

# (label, relative file, old, new, replace_all)
M = [
    ("geo: ignore the cos(latitude) scale", "core/geo.ts", " * Math.cos(origin.lat * RAD);\n  const z", ";\n  const z", False),
    ("geo: north is +z", "core/geo.ts", "const z = -(lat - origin.lat)", "const z = (lat - origin.lat)", False),
    ("geo: unproject longitude wrong", "core/geo.ts", "x / (RAD * EARTH_RADIUS_M * Math.cos(origin.lat * RAD))", "x / (RAD * EARTH_RADIUS_M)", False),
    ("geo: -0 allowed", "core/geo.ts", "RAD * EARTH_RADIUS_M + 0; // + 0 turns -0 into 0", "RAD * EARTH_RADIUS_M;", False),
    ("osm: tunnel=no counts as a tunnel", "core/osm.ts", "tags.tunnel !== undefined && tags.tunnel !== 'no'", "tags.tunnel !== undefined", False),
    ("osm: closing ring point kept", "core/osm.ts", "pts.pop();", "", False),
    ("osm: rails with missing coordinates kept", "core/osm.ts", " && e.nodes.every((n) => coord.has(n))", "", False),
    ("osm: building height dropped", "core/osm.ts", "if (height !== undefined) b.height = height;", "", False),
    ("osm: signal direction dropped", "core/osm.ts", "if (tags['railway:signal:direction']) s.direction = tags['railway:signal:direction'];", "", False),
    ("osm: layer ignored", "core/osm.ts", "layer: num(tags.layer) ?? 0,", "layer: 0,", False),
    ("graph: every edge length is 1", "core/graph.ts", "length: dist(pa, pb),", "length: 1,", False),
    ("graph: components smallest first", "core/graph.ts", "out.sort((x, y) => y.length - x.length)", "out.sort((x, y) => x.length - y.length)", False),
    ("graph: snap ignores the component limit", "core/graph.ts", "if (within && !within.has(e.a)) continue;", "", False),
    ("graph: pointAlong does not clamp", "core/graph.ts", "Math.max(0, Math.min(distance, route.length))", "distance", False),
    ("graph: route never found", "core/graph.ts", "if (!g.adj.has(from) || !g.adj.has(to)) return null;", "", False),
    ("zones: station zone moved", "core/zones.ts", "minX: -40, maxX: 110", "minX: 900, maxX: 1100", False),
    ("data: platform refs renumbered", "web/src/data/kx-track.json", '"ref":"7"', '"ref":"X"', True),
    ("data: tunnels untagged", "web/src/data/kx-track.json", '"tunnel":true', '"tunnel":false', True),
    ("data: attribution removed", "web/src/data/kx-track.json", "OpenStreetMap", "Elsewhere", False),
]

survived = []
for i, (label, rel, old, new, all_) in enumerate(M):
    work = scratch / f"c{i:02d}"
    if work.exists():
        shutil.rmtree(work)
    shutil.copytree(src, work, ignore=shutil.ignore_patterns("node_modules", "relay"))
    f = work / rel
    text = f.read_text()
    if old not in text:
        print(f"[SKIP   ] {label}: pattern not found in {rel}", flush=True)
        survived.append(label)
        shutil.rmtree(work)
        continue
    f.write_text(text.replace(old, new) if all_ else text.replace(old, new, 1))
    try:
        r = subprocess.run(
            ["node", "--test", "--test-force-exit", "--test-timeout=8000", *sorted(str(p.relative_to(work)) for p in (work / "core" / "tests").glob("*.test.ts"))],
            cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=60,
        )
    except subprocess.TimeoutExpired:
        print(f"[KILLED ] {label}  (hung)", flush=True)
        shutil.rmtree(work, ignore_errors=True)
        continue
    failed = sorted(set(re.findall(r"^\s*✖ (.+?) \(", r.stdout, re.M)))
    if r.returncode != 0:
        print(f"[KILLED ] {label}  <- {failed[0] if failed else '(non-zero exit)'}" + (f" (+{len(failed) - 1})" if len(failed) > 1 else ""), flush=True)
    else:
        print(f"[SURVIVED] {label}", flush=True)
        survived.append(label)
    shutil.rmtree(work)

print(f"\n{len(M) - len(survived)}/{len(M)} mutations caught")
for s in survived:
    print("  NOT CAUGHT:", s)
