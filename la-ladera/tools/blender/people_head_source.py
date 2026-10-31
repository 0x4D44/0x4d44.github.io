"""Reproduce the compact CC0 HM08 head data; this is an offline source-preparation step.

  python tools/blender/people_head_source.py /path/to/mpfb2-checkout

The normal people build uses the committed data and needs neither MPFB nor network
access. Pin the upstream checkout to SOURCE_COMMIT. No upstream Python code is used.
"""
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import math
import subprocess

SOURCE_COMMIT = "6ff1eb358f6c1959ced77e79e6dd2406d9a71f49"
BASE_SHA256 = "8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c"
HERE = Path(__file__).resolve().parent


def prepare(source, destination):
    source = Path(source)
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
    if revision != SOURCE_COMMIT:
        raise ValueError(f"Expected MPFB commit {SOURCE_COMMIT}, found {revision}")
    data = source / "src/mpfb/data"
    base = data / "3dobjs/base.obj"
    if hashlib.sha256(base.read_bytes()).hexdigest() != BASE_SHA256:
        raise ValueError("MPFB base mesh hash differs from the pinned source")
    vertices, groups, group = [], {}, ""
    for line in base.read_text().splitlines():
        words = line.split()
        if not words:
            continue
        if words[0] == "v":
            vertices.append(tuple(float(x) for x in words[1:4]))
        elif words[0] == "g":
            group = words[1]
        elif words[0] == "f":
            groups.setdefault(group, []).append([int(x.split("/")[0]) - 1 for x in words[1:]])
    # Visible body only. The cut is below the chin and overlaps the builder's neck.
    shell = [f for f in groups["body"] if all(vertices[i][1] > 5.8 for i in f)]
    eyes = [groups["helper-l-eye"], groups["helper-r-eye"]]
    landmarks = {"chin": [791], "crown": [881], "leftWidth": [5399], "rightWidth": [11998],
                 "back": [962], "front": [5320]}
    for name, lo, hi in (("eye_l", 14598, 14669), ("eye_r", 14670, 14741)):
        landmarks[name] = list(range(lo, hi + 1))
    indices = sorted({i for f in shell + eyes[0] + eyes[1] for i in f} |
                     {i for ids in landmarks.values() for i in ids})
    remap = {old: new for new, old in enumerate(indices)}
    source_hashes = {"src/mpfb/data/3dobjs/base.obj": BASE_SHA256}
    targets = {}
    for region in ("african", "asian", "caucasian"):
        for sex in ("female", "male"):
            for age in ("child", "young", "old"):
                name = f"{region}-{sex}-{age}"
                path = data / f"targets/macrodetails/{name}.target.gz"
                raw = path.read_bytes()
                source_hashes[str(path.relative_to(source))] = hashlib.sha256(raw).hexdigest()
                offsets = {}
                for line in gzip.decompress(raw).decode().splitlines():
                    if not line.strip() or line.startswith(("#", '"')):
                        continue
                    i, *xyz = line.split()
                    offsets[int(i)] = [round(float(v) * 1000) for v in xyz]
                targets[name] = [c for i in indices for c in offsets.get(i, [0, 0, 0])]
    lip_ids = set()
    for name in ("mouth-upperlip-volume-incr", "mouth-lowerlip-volume-incr"):
        path = data / f"targets/mouth/{name}.target.gz"
        source_hashes[str(path.relative_to(source))] = hashlib.sha256(path.read_bytes()).hexdigest()
        for line in gzip.open(path, "rt"):
            if not line.strip() or line.startswith(("#", '"')):
                continue
            i, *xyz = line.split()
            if math.sqrt(sum(float(v) ** 2 for v in xyz)) > 0.01:
                lip_ids.add(int(i))
    result = {
        "schema": 1,
        "source": "MakeHuman HM08 base mesh and MPFB macro targets",
        "license": "CC0-1.0",
        "sourceCommit": SOURCE_COMMIT,
        "sourceUrl": f"https://github.com/makehumancommunity/mpfb2/tree/{SOURCE_COMMIT}",
        "sourceHashes": source_hashes,
        "coordinateFrame": "MakeHuman: X right, Y up, Z forward; source decimetres",
        "coordinateScale": 10000,
        "deltaScale": 1000,
        "sourceIndices": indices,
        "vertices": [round(c * 10000) for i in indices for c in vertices[i]],
        "faces": [[remap[i] for i in f] for f in shell],
        "lipFaces": [j for j, f in enumerate(shell) if sum(i in lip_ids for i in f) >= 3],
        "eyes": [[[remap[i] for i in f] for f in eye] for eye in eyes],
        "landmarks": {k: [remap[i] for i in ids] for k, ids in landmarks.items()},
        "targets": targets,
    }
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(result, separators=(",", ":"), sort_keys=True).encode()
    # mtime=0 means reproducible bytes, independent of the regeneration date.
    destination.write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
    (destination.parent / "MAKEHUMAN_CC0.txt").write_bytes((source / "LICENSE.ASSETS.md").read_bytes())
    print(f"{destination}: {len(indices)} vertices, {len(shell)} faces, {len(raw)} JSON bytes, "
          f"{destination.stat().st_size} gzip bytes; sha256={hashlib.sha256(destination.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="MPFB checkout at the pinned commit")
    parser.add_argument("--out", default=str(HERE / "vendor/makehuman_head.json.gz"))
    args = parser.parse_args()
    prepare(args.source, args.out)
