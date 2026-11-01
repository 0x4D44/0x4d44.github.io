#!/usr/bin/env python3
"""Export original built-in imagegen sources as a compact, offline PNG library.

Run through tools/nice.mjs. Requires Pillow and NumPy, as the existing texture
factory does. No image-service/API credentials, network, runtime registry edits,
or procedural replacement artwork. Creative source images are made separately
with the built-in generator; this is deterministic texture export and proofing.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

from post import lum, periodic, pblur, make_normal

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CATALOG = HERE / "beach.catalog.json"
SOURCES = HERE / "beach.sources.json"
OUT = ROOT / "assets/textures/beach"
MANIFEST = ROOT / "assets/textures/manifest.beach.json"
PROOF = ROOT / "dev/beach-textures"
FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def font(size):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise RuntimeError("A Unicode font is required for the Spanish proof (DejaVu Sans or Arial).")


def seam_lock(a, axes):
    """Match opposite samples, not just their mean, after periodic correction.

    A four-pixel cosine taper shares the residual across both sides. The two
    boundary samples become identical without mirroring or duplicating a strip.
    Directional hull/pile/rope textures retain their non-repeating axis.
    """
    out = a.copy()
    for axis in axes:
        dim = 1 if axis == "x" else 0
        view = np.swapaxes(out, dim, 0)
        d = (view[-1] - view[0]) * 0.5
        for i in range(4):
            weight = 0.5 + 0.5 * math.cos(math.pi * i / 4)
            view[i] += d * weight
            view[-1-i] -= d * weight
        edge = (view[0] + view[-1]) * 0.5
        view[0] = edge
        view[-1] = edge
    return np.clip(out, 0, 1)


def tile_periodic(a, axes):
    if axes == ["x", "y"]:
        out = periodic(a)
    else:
        out = a.copy()
        for axis in axes:
            dim = 1 if axis == "x" else 0
            view = np.swapaxes(out, dim, 0)
            delta = view[-1] - view[0]
            t = np.linspace(-0.5, 0.5, len(view), dtype=np.float32)
            view -= t.reshape((-1,) + (1,) * (view.ndim-1)) * delta
    return seam_lock(out, axes)


def u8(a):
    return np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)


def save_rgb(path, a, colors=128):
    image = Image.fromarray(u8(a), "RGB")
    # A single global palette with no dithering maps identical edge pixels to
    # identical indices. Quantized export does not inflate GPU-memory claims.
    image = image.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    image.save(path, optimize=True, compress_level=9)


def save_rgba(path, a, colors=192):
    rgba = u8(a)
    rgba[..., 3][rgba[..., 3] <= 2] = 0
    image = Image.fromarray(rgba, "RGBA")
    # Preserve genuine source alpha, including antialiased edge coverage.
    quantized = image.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    palette = quantized.getpalette("RGBA")
    # Octree averaging must not turn an exactly transparent gutter into alpha1.
    clear = min(range(len(palette)//4), key=lambda i: palette[4*i+3])
    palette[4*clear+3] = 0
    for i in range(3, len(palette), 4):
        if palette[i] <= 2:
            palette[i] = 0
    indices = np.asarray(quantized).copy()
    indices[rgba[..., 3] == 0] = clear
    indexed = Image.fromarray(indices, "P")
    indexed.putpalette(palette, rawmode="RGBA")
    indexed.save(path, optimize=True, compress_level=9)


def read_source(raw, item):
    name = item["id"]
    path = raw / (name + ".png")
    source = json.loads(SOURCES.read_text(encoding="utf-8"))["sources"][name]
    source_hash = digest(path.read_bytes())
    if source_hash != source["rawSha256"]:
        raise ValueError(name + ": raw source differs from the selected SHA-256 in beach.sources.json")
    provenance = {
        "method": "OpenAI built-in image generator",
        "prompt": source["prompt"],
        "sourceSha256": source_hash,
        "license": "CC0-1.0",
        "notes": "Original generated artwork, no external source images, brands or logos. "
                 "Exact selected prompt and source hash retained; generated source is not deterministic. "
                 "Resampled, seam-corrected where declared, and palette-encoded by beach_build.py; "
                 "normal/roughness maps are luminance-derived approximations, not measured scans.",
    }
    if "originalGenerationPrompt" in source:
        provenance["originalGenerationPrompt"] = source["originalGenerationPrompt"]
        provenance["editInputSha256"] = source["editInputSha256"]
        provenance["notes"] += " Targeted built-in edit made the turtle grass green; both original and edit provenance are retained."
    return Image.open(path), provenance, source


def physical(raw, spec):
    image, provenance, _ = read_source(raw, spec)
    size, axes = spec["size"], spec["axes"]
    image = image.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
    a = np.asarray(image, dtype=np.float32) / 255
    if spec.get("tint"):
        a = np.repeat(lum(a)[..., None], 3, axis=2)
    a = tile_periodic(a, axes)
    save_rgb(OUT / (spec["id"] + ".png"), a)
    # Secondary maps at 256 preserve the full 1024/512 albedo detail separately.
    # This is recorded per file; their cost is independently counted by the gate.
    msize = min(size, 256)
    detail = np.asarray(Image.fromarray(u8(a), "RGB").resize((msize, msize), Image.Resampling.LANCZOS), dtype=np.float32) / 255
    n = make_normal(lum(detail), spec["slope"] / 0.12, msize)
    n = seam_lock(n, axes)
    v = n * 2 - 1
    v /= np.linalg.norm(v, axis=2, keepdims=True)
    n = (v + 1) * 0.5
    save_rgb(OUT / (spec["id"] + "_n.png"), n, colors=128)
    # Smooth scalar roughness; variation follows the generated material, not a
    # fabricated second design. Sixteen levels avoid texture noise in highlights.
    l = pblur(lum(detail), 2.4)
    rough = np.clip(spec["roughness"] + (l-l.mean()) * 0.18, 0.12, 0.98)
    rough = np.round(rough * 32) / 32
    rough = seam_lock(rough[..., None], axes)[..., 0]
    Image.fromarray(u8(rough), "L").save(OUT / (spec["id"] + "_r.png"), optimize=True, compress_level=9)
    entry = base_entry(spec, provenance)
    entry.update(normal="beach/" + spec["id"] + "_n.png", rough="beach/" + spec["id"] + "_r.png",
                 normalScale=1, normalConvention="OpenGL +Y", roughness=spec["roughness"],
                 mapColorSpace="srgb", dataColorSpace="linear")
    if spec.get("tint"):
        entry["tint"] = True
    return entry


def effect(raw, spec):
    image, provenance, _ = read_source(raw, spec)
    size, axes = spec["size"], spec["axes"]
    if spec["alpha"]:
        if "A" not in image.convert("RGBA").getbands() or image.convert("RGBA").getextrema()[3][0] >= 255:
            raise ValueError(spec["id"] + ": generator did not supply real transparency")
        a = np.asarray(image.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS), dtype=np.float32) / 255
        # Work on source alpha, retaining its foam microstructure. Transparent
        # water has white RGB too, avoiding black fringes under linear filtering.
        alpha = tile_periodic(a[..., 3:4], axes)
        rgba = np.concatenate([np.ones((size, size, 3), dtype=np.float32), alpha], axis=2)
        save_rgba(OUT / (spec["id"] + ".png"), rgba)
    else:
        a = np.asarray(image.convert("RGB").resize((size, size), Image.Resampling.LANCZOS), dtype=np.float32) / 255
        a = tile_periodic(a, axes)
        if spec["role"] == "normal":
            v = a * 2 - 1
            v[..., 2] = np.maximum(v[..., 2], 0.15)
            v /= np.linalg.norm(v, axis=2, keepdims=True)
            a = (v + 1) * 0.5
            save_rgb(OUT / (spec["id"] + ".png"), a, colors=192)
        else:
            a = lum(a)
            Image.fromarray(u8(a), "L").save(OUT / (spec["id"] + ".png"), optimize=True, compress_level=9)
    entry = base_entry(spec, provenance)
    entry["mapColorSpace"] = "linear"
    return entry


def base_entry(spec, provenance):
    size = spec["size"]
    return {"map": "beach/" + spec["id"] + ".png", "size": [size, size],
            "tile": spec["tile"], "uv": "tile", "tileAxes": spec["axes"],
            "alpha": spec.get("alpha", False), "description": spec["desc"], "provenance": provenance}


def atlas(raw, spec):
    image, provenance, source = read_source(raw, spec)
    w, h = spec["size"]
    cols, rows = spec["grid"]
    image = image.convert("RGBA" if spec["alpha"] else "RGB")
    if spec["alpha"] and image.getextrema()[3][0] >= 255:
        raise ValueError(spec["id"] + ": generator did not supply real transparency")
    canvas = Image.new(image.mode, (w, h), (255, 255, 255, 0) if spec["alpha"] else (235, 230, 218))
    cells = []
    split_y = source.get("sourceRows", spec.get("sourceRows", [i/rows for i in range(rows+1)]))
    source_cells = source.get("sourceCells", [])
    # Measured eye centres register animated frames. A group has ONE scale and
    # ONE destination anchor; independent bbox fitting would make bodies pulse.
    groups = {}
    for info in source_cells:
        group, anchor = info.get("registrationGroup"), info.get("registrationAnchorPx")
        if not group or not anchor:
            continue
        sx, sy, sw, sh = info["sourceRectPx"]
        part = image.crop((sx, sy, sx+sw, sy+sh))
        box = part.getchannel("A").point(lambda p: 255 if p > 8 else 0).getbbox()
        extent = [sx+box[0]-anchor[0], sy+box[1]-anchor[1],
                  sx+box[2]-anchor[0], sy+box[3]-anchor[1]]
        if group not in groups:
            groups[group] = extent
        else:
            old = groups[group]
            groups[group] = [min(old[0], extent[0]), min(old[1], extent[1]),
                             max(old[2], extent[2]), max(old[3], extent[3])]
    for i, cell_id in enumerate(spec["cells"]):
        col, row = i % cols, i // cols
        x0, x1 = round(col * w/cols), round((col+1) * w/cols)
        y0, y1 = round(row * h/rows), round((row+1) * h/rows)
        source_box = (round(col*image.width/cols), round(split_y[row]*image.height),
                      round((col+1)*image.width/cols), round(split_y[row+1]*image.height))
        info = source_cells[i] if source_cells else {}
        if info:
            sx, sy, sw, sh = info["sourceRectPx"]
            source_box = (sx, sy, sx+sw, sy+sh)
        piece = image.crop(source_box)
        group = info.get("registrationGroup")
        if group:
            # At least 8% inset in each occupied animation cell.
            pad = max(6, math.ceil(min(x1-x0, y1-y0) * 0.08))
            left, top, right, bottom = groups[group]
            scale = min((x1-x0-2*pad)/(right-left), (y1-y0-2*pad)/(bottom-top))
            target_x = (x1-x0-(right-left)*scale)/2 - left*scale
            target_y = (y1-y0-(bottom-top)*scale)/2 - top*scale
            ax, ay = info["registrationAnchorPx"]
            inverse = (1/scale, 0, ax-source_box[0]-target_x/scale,
                       0, 1/scale, ay-source_box[1]-target_y/scale)
            fitted = piece.transform((x1-x0, y1-y0), Image.Transform.AFFINE, inverse,
                                     Image.Resampling.BICUBIC, fillcolor=(255, 255, 255, 0))
            pixels = np.asarray(fitted).copy()
            pixels[..., 3][pixels[..., 3] <= 2] = 0
            fitted = Image.fromarray(pixels, "RGBA")
            canvas.paste(fitted, (x0, y0))
            bbox = fitted.getchannel("A").getbbox()
            cell = {"id": cell_id, "rect": [x0, y0, x1-x0, y1-y0],
                    "uv": [x0/w, y0/h, x1/w, y1/h], "gutter": pad,
                    "contentRect": [x0+bbox[0], y0+bbox[1], bbox[2]-bbox[0], bbox[3]-bbox[1]],
                    "pivot": [target_x/(x1-x0), target_y/(y1-y0)], "facing": "+X",
                    "registration": {"group": group, "anchor": "eye", "anchorPx": [target_x, target_y],
                                     "sourceAnchorPx": [ax, ay], "scale": scale},
                    "animation": group, "frame": i if group == "flap" else i-5 if group == "walk" else row}
            cells.append(cell)
            continue
        if spec["alpha"]:
            bbox = piece.getchannel("A").point(lambda p: 255 if p > 8 else 0).getbbox()
            if not bbox:
                raise ValueError(f"{spec['id']}/{cell_id}: empty source sprite")
            piece = piece.crop(bbox)
        # Insets isolate cells from neighboring texels under linear filtering.
        # Alpha subjects keep their silhouettes; opaque panels keep all artwork.
        pad = 6
        target = (x1-x0-pad*2, y1-y0-pad*2)
        piece = ImageOps.contain(piece, target, Image.Resampling.LANCZOS)
        px, py = x0+(x1-x0-piece.width)//2, y0+(y1-y0-piece.height)//2
        canvas.paste(piece, (px, py))
        cell = {"id": cell_id, "rect": [x0, y0, x1-x0, y1-y0],
                "uv": [x0/w, y0/h, x1/w, y1/h], "gutter": pad,
                "contentRect": [px, py, piece.width, piece.height]}
        if "texts" in spec:
            cell["text"] = spec["texts"][i]
        if spec["id"] == "gull_sprites":
            cell.update(pivot=[0.5, (py+piece.height-y0)/(y1-y0)], facing="+X", animation=cell_id)
        if spec["id"] == "fish_sprites":
            cell.update(pivot=[0.5, 0.5], facing="+X", frame=row)
        cells.append(cell)
    a = np.asarray(canvas, dtype=np.float32) / 255
    if spec["alpha"]:
        save_rgba(OUT / (spec["id"] + ".png"), a, colors=256)
    else:
        save_rgb(OUT / (spec["id"] + ".png"), a, colors=256)
    result = {"map": "beach/" + spec["id"] + ".png", "size": [w, h], "uv": "unit", "tileAxes": [],
              "alpha": spec["alpha"], "cells": cells, "description": spec["desc"], "mapColorSpace": "srgb",
              "provenance": provenance}
    if spec["id"] == "gull_sprites":
        result["animations"] = {"flap": {"frames": [0, 1, 2, 3, 2, 1], "fps": 8},
                                "walk": {"frames": [5, 6], "fps": 4}}
        result["registrationNotes"] = "Eye-centred pivots for moving groups; foot-centred static pivots. Common scale within each group. Generated silhouettes are not identical 3D projections."
    if spec["id"] == "fish_sprites":
        result["animations"] = {species: {"frames": [col, col+3], "fps": 4}
                                for col, species in enumerate(("jack", "grunt", "tang"))}
        result["registrationNotes"] = "Eye-centred matched pair pivots and one scale per species."
    return result


def mip_bytes(w, h):
    total = 0
    while True:
        total += w*h*4
        if w == h == 1:
            return total
        w, h = max(1, w//2), max(1, h//2)


def inventory(textures):
    files = []
    for name, entry in textures.items():
        for binding in ("map", "normal", "rough"):
            path = entry.get(binding)
            if not path:
                continue
            file = ROOT / "assets/textures" / path
            image = Image.open(file)
            role = "normal" if binding == "normal" or name == "water_ripple_n" else "roughness" if binding == "rough" else "sprite" if entry["uv"] == "unit" else "effect" if name in ("foam_noise", "caustic_tile") else "albedo"
            record = {"path": path, "width": image.width, "height": image.height, "bytes": file.stat().st_size,
                      "sha256": digest(file.read_bytes()), "role": role, "alpha": entry["alpha"] if binding == "map" else False,
                      "tileAxes": entry["tileAxes"], "colorSpace": "linear" if role in ("normal", "roughness", "effect") else "srgb"}
            if entry["tileAxes"]:
                record["edgeTolerance"] = {"max": 0, "mean": 0}
            files.append(record)
    return files


def checker(size):
    w, h = size
    a = np.zeros((h, w, 3), dtype=np.uint8)
    g = ((np.indices((h, w)).sum(axis=0) * 0) + ((np.arange(h)[:, None]//12 + np.arange(w)[None, :]//12) % 2))
    a[:] = np.where(g[..., None] == 0, 226, 204)
    return Image.fromarray(a, "RGB")


def display(image, size):
    rgba = image.convert("RGBA")
    rgba.thumbnail(size, Image.Resampling.LANCZOS)
    bg = checker(size)
    bg.paste(rgba, ((size[0]-rgba.width)//2, (size[1]-rgba.height)//2), rgba)
    return bg


def proof_save(image, name):
    PROOF.mkdir(parents=True, exist_ok=True)
    image.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(PROOF / name, optimize=True)


def review_sheets(textures, files):
    # Every delivered repeatable map, including data maps, appears tiled 3 x 3.
    for group, records in (
        ("tiles-albedo", [f for f in files if f["tileAxes"] and f["role"] not in ("normal", "roughness")]),
        ("tiles-normal", [f for f in files if f["tileAxes"] and f["role"] == "normal"]),
        ("tiles-roughness", [f for f in files if f["tileAxes"] and f["role"] == "roughness"]),
    ):
        width, cellw, cellh, header = 1328, 332, 348, 74
        out = Image.new("RGB", (width, header + math.ceil(len(records)/4)*cellh), "#eee9df")
        d = ImageDraw.Draw(out)
        d.text((20, 14), "LA LADERA  /  BEACH  /  " + group.upper(), font=font(22), fill="#173d44")
        d.text((20, 46), "3 x 3 repeats of final PNGs. X/Y-only repeats are labelled; other axis is intentionally non-tileable.", font=font(13), fill="#45585b")
        for i, f in enumerate(records):
            x, y = (i % 4)*cellw+16, header+(i//4)*cellh
            im = Image.open(ROOT / "assets/textures" / f["path"]).convert("RGBA").resize((100, 100), Image.Resampling.LANCZOS)
            tiled = Image.new("RGBA", (300, 300))
            for yy in range(3):
                for xx in range(3):
                    tiled.paste(im, (xx*100, yy*100))
            out.paste(display(tiled, (300, 300)), (x, y))
            d.text((x, y+306), Path(f["path"]).name, font=font(14), fill="#173d44")
            d.text((x, y+325), "repeat " + ",".join(f["tileAxes"]) + " | " + str(f["width"]) + " px", font=font(12), fill="#45585b")
        proof_save(out, group + ".png")
    names = list(textures)
    out = Image.new("RGB", (1400, 76 + math.ceil(len(names)/5)*270), "#eee9df")
    d = ImageDraw.Draw(out)
    d.text((24, 16), "LA LADERA / BEACH TEXTURES + SPRITES", font=font(28), fill="#173d44")
    d.text((24, 51), "25 original imagegen sources | 16 repeatable materials/effects | 9 indexed atlases | offline library", font=font(15), fill="#45585b")
    for i, name in enumerate(names):
        x, y = (i%5)*280+12, 76+(i//5)*270
        entry = textures[name]
        out.paste(display(Image.open(ROOT / "assets/textures" / entry["map"]), (256, 218)), (x, y))
        d.text((x, y+226), name, font=font(16), fill="#173d44")
        d.text((x, y+248), " x ".join(map(str, entry["size"])) + (" | alpha" if entry["alpha"] else ""), font=font(12), fill="#45585b")
    proof_save(out, "catalogue.png")
    # Atlas proof pages expose every cell, not only the packed sheet silhouette.
    for name, entry in textures.items():
        if entry["uv"] != "unit":
            continue
        cells = entry["cells"]
        columns = 2 if name in ("signs_menus", "boat_names") else 4
        cw, ch = (600, 226) if columns == 2 else (300, 250)
        out = Image.new("RGB", (columns*cw, 80+math.ceil(len(cells)/columns)*ch), "#eee9df")
        d = ImageDraw.Draw(out)
        d.text((20, 15), "LA LADERA / " + name.upper().replace("_", " "), font=font(25), fill="#173d44")
        d.text((20, 49), "Final exported pixels; all requested cells. Checkerboard denotes alpha.", font=font(14), fill="#45585b")
        source = Image.open(ROOT / "assets/textures" / entry["map"])
        for i, cell in enumerate(cells):
            x, y = (i%columns)*cw+12, 80+(i//columns)*ch
            a, b, w, h = cell["rect"]
            im = source.crop((a, b, a+w, b+h))
            # Upscaling is explicit proof magnification, not extra texture detail.
            im = ImageOps.contain(im, (cw-24, ch-55), Image.Resampling.NEAREST)
            out.paste(display(im, (cw-24, ch-55)), (x, y))
            d.text((x, y+ch-49), cell.get("text", cell["id"]), font=font(17), fill="#173d44")
            d.text((x, y+ch-24), f"cell {i:02} | {w} x {h} source pixels", font=font(12), fill="#45585b")
        proof_save(out, "signs-proof.png" if name == "signs_menus" else name.replace("_", "-") + "-proof.png")


def build(args):
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    if args.refresh_only:
        textures = json.loads(MANIFEST.read_text(encoding="utf-8"))["textures"]
    else:
        raw = Path(args.raw_dir).resolve()
        textures = {}
        for group, processor in (("materials", physical), ("effects", effect), ("atlases", atlas)):
            for spec in catalog[group]:
                textures[spec["id"]] = processor(raw, spec)
                print("exported", spec["id"], flush=True)
    files = inventory(textures)
    review_sheets(textures, files)
    proof = PROOF / "signs-proof.png"
    inputs = []
    for path in (CATALOG, SOURCES, Path(__file__).resolve(), HERE / "post.py"):
        data = path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        inputs.append({"path": path.relative_to(ROOT).as_posix(), "sha256": digest(data), "normalization": "lf"})
    manifest = {
        "version": 1, "complete": True, "runtime": False, "library": "beach",
        "license": "CC0-1.0", "budgets": catalog["budgets"],
        "generator": {"script": "tools/textures/beach_build.py", "sources": "OpenAI built-in image generator",
                      "normalNote": "Luminance-derived artistic approximations; not measured PBR scans.",
                      "rawSources": "Source PNGs not shipped; exact prompts and raw SHA-256 recorded per texture."},
        "textures": textures, "files": files,
        "imageBytes": sum(f["bytes"] for f in files),
        "gpuBytes": sum(mip_bytes(f["width"], f["height"]) for f in files),
        "inputs": inputs,
        "review": {"signs": {"verified": args.signs_verified, "proof": proof.relative_to(ROOT).as_posix(),
                            "sha256": digest(proof.read_bytes()),
                            "notes": "Visual inspection pending." if not args.signs_verified else
                            "Visually inspected final exported PNG and enlarged contact sheet: all ten requested Spanish phrases, clear ñ in baño, no missing or substituted letters. No automated OCR claim."}},
    }
    write_json(MANIFEST, manifest)
    total = manifest["imageBytes"] + MANIFEST.stat().st_size
    print(f"PNG + manifest bytes: {total:,} / 8,000,000")
    print(f"RGBA8 full-mip GPU bytes: {manifest['gpuBytes']:,} / 167,772,160")
    if total > catalog["budgets"]["maxBytes"] or manifest["gpuBytes"] > catalog["budgets"]["maxGpuBytes"]:
        raise SystemExit("Beach pack exceeds its fixed budget; output is not accepted.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", default=str(ROOT / ".scratch/beach-textures/raw"))
    parser.add_argument("--refresh-only", action="store_true", help="Rebuild manifest/proofs from existing exported PNGs, without regenerating artwork.")
    parser.add_argument("--signs-verified", action="store_true", help="Use only after personally inspecting signs-proof.png and final sign atlas.")
    build(parser.parse_args())
