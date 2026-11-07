"""Assemble the human-readable acceptance report from fresh captured logs."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent.parent
INITIAL_BASE = "6740a624e597bbed9c9f400d6c33b37924777a17"


def logged_json(path):
    text = path.read_text()
    start = text.index("\n{\n") + 1
    return json.JSONDecoder().raw_decode(text[start:])[0]


def main():
    manifest = json.loads((PROJECT / "assets/models/manifest.extkit.json").read_text())
    materials = json.loads((PROJECT / "assets/models/extkit/materials.json").read_text())
    catalogue = json.loads((PROJECT / "tools/blender/extkit.catalog.json").read_text())
    near, lod = manifest["files"]
    triangles = lambda f: sum(a["triangles"] for a in f["assets"].values())
    max_near = max((a["triangles"], k) for k, a in near["assets"].items())
    max_small = max((a["triangles"], k) for k, a in near["assets"].items() if a["smallProp"])
    ratios = [(lod["assets"][k + "_lod1"]["triangles"] / a["triangles"], k) for k, a in near["assets"].items()]
    ratio, ratio_name = max(ratios)
    base = subprocess.check_output(["git", "rev-parse", "origin/main"], text=True).strip()
    logs = sorted((HERE / "logs").glob("*.log"), key=lambda p: (p.read_text(errors="replace")[:80], p.name))
    final_tests = next((p for p in logs if p.name == "tests-post-rebase.log"), None)
    final_mutations = next((p for p in logs if p.name == "mutations-post-rebase.log"), None)
    if not final_tests or not final_mutations:
        raise RuntimeError("Final post-rebase test and mutation logs are required")
    tests_text, mutations_text = final_tests.read_text(), final_mutations.read_text()
    test_count = int(re.search(r"# tests (\d+)", tests_text)[1])
    if not re.search(r"# fail 0\b", tests_text) or "Exit status: 0" not in tests_text:
        raise RuntimeError("Final test run did not pass")
    killed = re.search(r"MUTATIONS:\s*(\d+)/(\d+) killed", mutations_text)
    if not killed or killed[1] != killed[2] or int(killed[1]) != test_count or "Exit status: 0" not in mutations_text:
        raise RuntimeError("Final mutation proof did not pass every test")
    payload = logged_json(HERE / "logs/payload-post-rebase.log")
    if not payload["ok"]:
        raise RuntimeError("Final payload run did not pass")
    baseline = json.loads((HERE / "logs/payload-before.json").read_text())
    baseline_rows = {r["name"]: r for r in baseline["budgets"]}
    after_rows = {r["name"]: r for r in payload["budgets"]}
    independent = logged_json(HERE / "logs/validator-post-rebase.log")
    if not independent["ok"] or not independent["complete"] or independent["runtime"] != "v22.16.0":
        raise RuntimeError("Final independent complete validation under Node 22.16.0 is required")
    texture_bytes = independent["textureBytes"]
    gpu_bytes = independent["gpuBytes"]
    walls_gpu = independent["gpuCompressedWallBytes"]
    if texture_bytes != materials["textureBytes"] or gpu_bytes != materials["gpuBytes"]:
        raise RuntimeError("Independent texture measurements disagree with the materials inventory")
    if independent["glbBytes"] != near["bytes"] + lod["bytes"]:
        raise RuntimeError("Independent GLB measurement disagrees with the manifest")
    pins = json.loads((HERE / "source-pins-all.json").read_text())
    for relative, digest in pins.items():
        if hashlib.sha256((PROJECT / relative).read_bytes()).hexdigest() != digest:
            raise RuntimeError("Review evidence is stale for " + relative)
    contact = json.loads((HERE / "contact-report.json").read_text())
    views = json.loads((HERE / "eye-view-report.json").read_text())
    if len(contact) != 2 * len(catalogue["assets"]) or len(views["views"]) != 2:
        raise RuntimeError("Incomplete contact or eye-height evidence")
    if any(v["eyeHeightMetres"] != 1.6 for v in views["views"]):
        raise RuntimeError("Eye-height evidence must be 1.6 m")
    if any(len(list(HERE.glob(f"contact-{level}-*.jpg"))) != 6 for level in ("near", "lod1")):
        raise RuntimeError("All six near and six LOD1 contact sheets are required")
    if any(not (HERE / name).is_file() for name in ("facade-eye-1_6m.jpg", "roof-eye-1_6m.jpg")):
        raise RuntimeError("Both eye-height review images are required")
    generated = datetime.now(timezone.utc).isoformat()
    lines = ["# Exterior-kit verification", "", f"Report assembled from captured command outputs at `{generated}`.", "",
             "## Result", "", f"**PASS: {test_count}/{test_count} tests, {killed[1]}/{killed[2]} per-test mutations killed, independent complete validator and payload gates with no changes from this PR.**", "",
             f"The library contains {len(catalogue['assets'])} near roots and the same number of LOD1 roots. "
             "The manifest declares `complete: true` and `libraryOnly: true`. All new work stays within the requested exterior-kit namespace; existing files, game modules and production registries are unchanged.", "",
             "## Branch and base", "", f"- Branch: `codex/la-ladera-exterior-kit`.",
             f"- Latest `origin/main` used when starting: `{INITIAL_BASE}`.",
             f"- Fetched and rebased once before opening the PR onto `origin/main` at `{base}`; see the fresh fetch/rebase transcripts below.",
             "- Full acceptance was rerun after that rebase. Nothing was merged, tagged or released.", "",
             "## Measured library budgets", "",
             "| Gate | Actual | Limit |", "| --- | ---: | ---: |",
             f"| Designs | {len(catalogue['assets'])} | 120 |",
             f"| Near GLB | {near['bytes']:,} bytes | Included below |",
             f"| LOD1 GLB | {lod['bytes']:,} bytes | Included below |",
             f"| Combined GLBs | {near['bytes'] + lod['bytes']:,} bytes | 4,500,000 bytes |",
             f"| Texture disk bytes | {texture_bytes:,} | 8,000,000 |",
             f"| All textures resident, including complete mip chains | {gpu_bytes:,} bytes | 40,000,000 bytes |",
             f"| Largest near piece | {max_near[0]:,} triangles | 6,000 |",
             f"| Largest small prop | {max_small[0]:,} triangles | 2,000 |",
             f"| Highest LOD1/near ratio | {ratio * 100:.4f}% | 40% |", "",
             f"Near geometry totals {triangles(near):,} triangles; LOD1 totals {triangles(lod):,}. "
             f"The largest near piece is `{max_near[1]}`, the largest small prop is `{max_small[1]}`, and the highest ratio occurs at `{ratio_name}`. "
             f"The inventory hashes {len(manifest['artifacts'])} payload/catalogue artifacts; a manifest cannot hash itself.", "",
             "The texture reader independently inflates and decodes all 396 wall mip images. "
             "Every opposite edge matches exactly after block compression, including the normal and ORM planes. "
             "BC5 X/Y components stay within the valid positive-Z hemisphere. Geometry bounds, winding, normals, indices, atlas UV cells, triangle counts, anchor planes and every LOD ratio are read from the actual GLB binary.", "",
             "## Repository payload before and after", "",
             "The existing `tests/payload.mjs` was run before adding assets and again after the final rebase. This PR does not change any of its limits. Its displayed MB are MiB (1,048,576 bytes).", "",
             "| Gate | Before | After rebase | Existing gate |", "| --- | ---: | ---: | ---: |"]
    for name in ["textures", "models", "shipped total (excl. vendor,dev,labs,tests,tools)", "estimated GPU texture memory"]:
        before, after = baseline_rows[name], after_rows[name]
        lines.append(f"| {name} | {before['mb']:.2f} MiB | {after['mb']:.2f} MiB | {after['max']} MiB |")
    changed_limits = [(name, before["max"], after_rows[name]["max"], after_rows[name]["mb"])
                      for name, before in baseline_rows.items()
                      if name in after_rows and before["max"] != after_rows[name]["max"]]
    if changed_limits:
        lines += ["", "The fresh upstream base changed the following sub-limit between the before and after runs; this change is not part of the exterior-kit diff:", ""]
        for name, before_limit, after_limit, actual in changed_limits:
            lines.append(f"- `{name}`: {before_limit} → {after_limit} MiB upstream; measured {actual:.2f} MiB after rebase, also below the earlier limit.")
        lines += ["", "The total models gate remains 40 MiB. The upstream change is preserved in `logs/upstream-payload-gate-diff.log`."]
    total_gpu = after_rows["estimated GPU texture memory"]["mb"] + walls_gpu / 1048576
    lines += ["", "The unchanged global payload script recognises PNG/JPEG/WebP dimensions and does not account for KTX2 GPU blocks. "
              f"Its PNG total already includes this library's atlas. Adding the independently decoded wall blocks ({walls_gpu:,} bytes) gives a conservative project total of approximately **{total_gpu:.2f} MiB**, still below the unchanged 800 MiB gate. "
              "This is compressed-format residency, not an uncompressed fallback estimate.", "",
              "## Visual evidence", "", "The contact sheets cover every near and LOD piece. Individual cameras are orthographic and independently framed; captions give metre envelopes and actual triangles. "
              "The two perspective views are from cameras 1.60 m above their respective walking planes. They use exported GLBs and decode the shipped compressed wall files. "
              "Source hashes are pinned in `source-pins-all.json`; the render command rejects changes to its inputs during rendering.", "",
              "- [Facade at 1.60 m](facade-eye-1_6m.jpg)", "- [Roof at 1.60 m](roof-eye-1_6m.jpg)",
              "- [Twelve wall finishes](materials-walls.png)", "- [Shared prop atlas](materials-atlas.png)", ""]
    for lod_name in ("near", "lod1"):
        paths = sorted(HERE.glob(f"contact-{lod_name}-*.jpg"))
        lines.append(f"{lod_name.upper()} sheets: " + ", ".join(f"[{p.stem.rsplit('-',1)[1]}]({p.name})" for p in paths) + ".")
        lines.append("")
    lines += ["## Corrections preserved in the logs", "",
              "Initial exploratory failures were corrected rather than hidden: the first texture set exceeded the disk budget; low-bit normal/ORM entropy was reduced without reducing map resolution. "
              "Geometry probes caught envelope/LOD issues, and actual GLB inspection caught folded plant-bracket normals; separate welded members fixed the geometry. "
              "The first visual sample exposed Blender's black default for a missing vertex-colour attribute; the preview now supplies glTF's white default on imported copies. "
              "The anchor audit replaced catalogue-envelope offsets with measured rear clearance planes. Both GLBs remained byte-identical across that metadata correction. "
              "The full visual pass then caught detached fern leaflets and coincident frame faces; leaf bases now follow their actual stems, and crossing rails have a deliberate 1 mm depth separation. "
              "The review assembly also received proper wall/support placement and a studio floor below the roof slab. "
              "The final sheet audit exposed reversed coplanar shutter faces and a tube-frame twist at the elbow bend; thin solid hoods and a stable bend frame corrected those five designs. "
              "The review cable span was also moved into the clear gap between the two facades. "
              "`review-all-01` was deliberately interrupted for the anchor correction and is not final evidence. The earlier `review-all-02` and `review-all-03` images are superseded. Final contact/view evidence comes from `review-all-04`.", "",
              "The all-file whitespace check reports one trailing space printed by a geometry probe. Raw command transcripts are preserved verbatim; the subsequent source/documentation whitespace check excludes raw logs and their embedded transcript copy in this report.", "",
              "## Original work and drawn strings", "",
              "All geometry and images are original deterministic procedural work. No scraped or downloaded art, brands or manufacturer logos were used. "
              "The [CC0 note](LICENSE.md) covers the new work while preserving the licences of imported existing helpers. "
              "No strings are drawn on the pieces or texture planes; the chalkboard cell is blank. Spanish catalogue/review captions, including añil, pañete, baldosín and celosía, were checked. "
              "The requested list describes eleven wall finishes while asking for twelve; damp tolete brick is the documented twelfth finish.", "",
              "## Not verified", "",
              "**Runtime integration in the game is untested.** No production loader, material registry or game module imports this library. "
              "Native KTX2 GPU upload, compressed-format support on target devices, production normal reconstruction, runtime placement, collision/occlusion, wind/cloth animation, interactive chalk writing, game draw calls/frame time and boot/load timing are untested. "
              "An RGBA fallback would have a different memory cost and is neither implemented nor claimed to meet the 40 MB limit. "
              "Plant anchors use a foliage-inclusive rear clearance plane, not a shelf bolt position. Capacity labels and service equipment are visual scenery approximations. "
              "The offline review architecture is illustrative and is not included in the asset library.", "",
              "## Captured command transcripts", "",
              "These are fresh captured outputs, not expected-output examples. Failed/interrupted development attempts are retained alongside the passing final commands. "
              "The outer logger records UTC and exit status; Blender's internal clock text reflects its process timezone. "
              "Individual files in `logs/` remain available for direct inspection.", ""]
    for path in logs:
        content = path.read_text(errors="replace").rstrip()
        exits = re.findall(r"Exit status:\s*(-?\d+)", content)
        status = exits[-1] if exits else "interrupted or separately captured"
        lines += [f"<details><summary>{path.name} — exit {status}</summary>", "",
                  f"[Raw transcript](logs/{path.name})", "", "````text", content, "````", "", "</details>", ""]
    target = HERE / "VERIFICATION.md"
    target.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {target}: {target.stat().st_size:,} bytes, {len(logs)} actual command transcripts")
    web = "https://github.com/0x4D44/0x4d44.github.io/blob/codex/la-ladera-exterior-kit/la-ladera/dev/extkit/"
    body = ["## Why", "",
            "Back and side walls currently read as repeated flat colour fields. This adds a dormant exterior kit of 65 original designs and 12 wall finishes, ready for a separate building-placement task.", "",
            "## Branch and base", "",
            f"- Started `codex/la-ladera-exterior-kit` from the latest `origin/main` at **`{INITIAL_BASE}`**.",
            f"- **Rebased once onto freshly fetched `origin/main` at `{base}` immediately before preparing this PR**, then reran the complete validator, tests, mutations and payload gate.",
            "- Ready for review. No existing files, tests, budgets, game modules, boot manifests or production registries change. Every diff path is an addition in the requested `extkit` namespace. Nothing under `la-ladera/js/` imports this library.", "",
            "## Contents", "",
            "| Family | Designs |", "| --- | ---: |",
            "| Ribbed blue/black 500/1,000/2,000 L tanks on steel/block/raised stands, lids and plumbing |14|",
            "| Balcony, roof, rotary and pole laundry arrangements with shaped cloth, folds and pegs |4|",
            "| Satellite dishes / TV aerials |3 /2|",
            "| Rebar: three lengths × two rust levels |6|",
            "| Single/double pipa cages |2|",
            "| Straight, elbow, tee and bracket pieces for pipes and drains |8|",
            "| Meter boxes / pole-mounted transformer |2 /1|",
            "| Short 0.5 m cable modules for instanced swags |2|",
            "| Blank writable chalkboard |1|",
            "| Reja patterns / shutter-box widths |8 /3|",
            "| Potted plants on ledges / celosía patterns |6 /3|", "",
            "The wall sets are six Colombian plaster colours, bare tolete brick, damp tolete brick, cement block with mortar, a baldosín band, streaked rough render and whitewash. The brief lists eleven finishes but asks for twelve; damp tolete is the explicit twelfth.", "",
            "Two packed texture-free GLBs contain all 65 near roots and 65 LOD roots. All pieces use metres, +Y up, +Z front and floor-centred origins. The catalogue contains the requested attachment side, height range, clearance and facade-zone metadata. Rear references are checked against decoded near geometry; LOD selection does not alter the placement reference.", "",
            "## Measured acceptance", "",
            "| Gate | Actual | Limit |", "| --- | ---: | ---: |",
            f"| Combined GLBs |{near['bytes'] + lod['bytes']:,} bytes|4,500,000|",
            f"| Texture disk bytes |{texture_bytes:,}|8,000,000|",
            f"| Simultaneously resident texture memory, all maps and mips |{gpu_bytes:,} bytes|40,000,000|",
            f"| Largest near / small prop |{max_near[0]:,} /{max_small[0]:,} triangles|6,000 /2,000|",
            f"| Highest LOD1/near ratio |{ratio * 100:.4f}%|40%|",
            f"| Designs |{len(catalogue['assets'])}|120|", "",
            f"- **{test_count}/{test_count} Node 22.16 tests pass.**",
            f"- **{killed[1]}/{killed[2]} per-test mutations are killed** by the exact named assertion failure; crashes/timeouts do not count.",
            "- Independent complete validation decodes the GLBs and all 396 wall mip images, verifies exact opposite-edge matching, and checks all 43 artifact hashes.",
            f"- Unchanged payload gates pass after rebase: models **{after_rows['models']['mb']:.2f} /40 MiB**, textures **{after_rows['textures']['mb']:.2f} /40 MiB**, shipped total **{after_rows['shipped total (excl. vendor,dev,labs,tests,tools)']['mb']:.2f} /150 MiB**.",
            f"- The old payload script does not recognise KTX2 GPU blocks. Adding the independently measured compressed walls to its PNG/JPEG/WebP estimate gives approximately **{total_gpu:.2f} /800 MiB** for the project.",
            "- Blender 5.2.3 was run headlessly at low priority with two threads. Existing furniture, export, priority, GLB/PNG inspection and preview helpers are reused without modification.", "",
            f"[Fresh command transcripts and verification]({web}VERIFICATION.md) · [Catalogue/binding guide]({web}README.md) · [Texture format details]({web}materials-format.md) · [Original-work and CC0 note]({web}LICENSE.md)", "",
            "## Texture-format decision", "",
            "Props share a 512 px colour atlas with matching normal and ORM planes. Each of the 12 wall sets has 1024 px albedo, normal and ORM maps with 11 mip levels. Keeping all 36 wall planes as RGBA8 would exceed 40 MB, so the wall files use standard KTX2/ZLIB containers over BC1 colour/ORM and BC5 normal-X/Y blocks. Positive normal-Z must be reconstructed. The memory measurement assumes all wall sets and atlas planes are resident together; it does not assume selective loading.", "",
            "## Review renders", "",
            "These are renders of the actual exported GLBs and actual shipped compressed textures. Both perspective cameras are 1.60 m above their walking planes. The illustrative architecture is offline review scenery; it is not a game integration.", "",
            f"![Facade at 1.60 m]({web}facade-eye-1_6m.jpg?raw=true)", "",
            f"![Roof at 1.60 m]({web}roof-eye-1_6m.jpg?raw=true)", ""]
    for lod_name, title in [("near", "All near-detail contact sheets"), ("lod1", "All LOD1 contact sheets")]:
        body += [f"<details><summary>{title}</summary>", ""]
        for path in sorted(HERE.glob(f"contact-{lod_name}-*.jpg")):
            body += [f"![{path.stem}]({web}{path.name}?raw=true)", ""]
        body += ["</details>", ""]
    body += ["<details><summary>Twelve seamless wall materials</summary>", "",
             f"![Wall-material samples]({web}materials-walls.png?raw=true)", "", "</details>", "",
             "## Assumptions and what is NOT verified", "",
             "**Runtime integration in the game is untested.** Native KTX2 GPU upload, target-device BC1/BC5 support, production material/normal binding, actual building placement, collisions/occlusion, wind/cloth animation, chalk interaction, game draw calls/frame time and boot/load timing are untested. No game performance or loader-compatibility claim is made. The current game does not automatically load these maps. An uncompressed fallback would have a different memory cost and is not implemented.", "",
             "Tank capacities are visual family labels, not manufacturer/volume certifications. Plant anchors use the rear foliage-inclusive clearance plane rather than a shelf bolt position. The small modelled rebar ribs are intentionally coarse and read as ticks at extreme close range. The chalkboard is blank, and no piece/texture contains lettering or logos; Spanish catalogue and review captions were checked for accents and ñ.", "",
             "All new geometry and surface images are original procedural work. No scraped or downloaded art was used. The new work is CC0; existing imported helpers retain their existing licences.", ""]
    (HERE / "PR.md").write_text("\n".join(body), encoding="utf-8")
    print(f"Wrote {HERE / 'PR.md'}")


if __name__ == "__main__":
    main()
