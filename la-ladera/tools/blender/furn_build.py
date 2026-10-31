"""Build La Ladera's furniture with Blender's real glTF exporter.

From the repository root (Blender 4.5 LTS or newer):
  node la-ladera/tools/blender/furn_dump_catalog.mjs .scratch/furniture/catalog.json
  blender --background --factory-startup --python-exit-code 1 \
    --python la-ladera/tools/blender/furn_build.py -- \
    --catalog .scratch/furniture/catalog.json

The complete build is staged, independently validated, then installed with its
manifest. A failed build leaves the previous library intact. --only / --theme
are previews and require an explicit --out outside the shipped models folder.
No texture or compression decoder is embedded or needed.
"""
import argparse
import hashlib
import importlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import bpy
import furn_lib as L


def arguments():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--catalog', required=True, type=Path)
    p.add_argument('--out', type=Path, default=Path(L.ROOT) / 'assets' / 'models')
    p.add_argument('--only', help='comma-separated catalogue keys (preview only)')
    p.add_argument('--theme', help='comma-separated builder themes (preview only)')
    p.add_argument('--node', default='node', help='Node executable for byte-level validation')
    return p.parse_args(L.argv_after_dashes())


def check_geometry(a):
    """Catch broken builders before creating Blender data blocks."""
    lo, hi = a.bounds()
    if not all(math.isfinite(v) for v in lo + hi) or any(hi[i] <= lo[i] for i in range(3)):
        raise ValueError(f'{a.key}: empty or non-finite geometry')
    tris = sum(len(g.I) for g in a.groups.values())
    if not tris:
        raise ValueError(f'{a.key}: no triangles')
    for g in a.groups.values():
        if len(g.P) != len(g.N) or len(g.P) != len(g.UV):
            raise ValueError(f'{a.key}: mismatched vertex attributes')
        for values in (g.P, g.N, g.UV, g.C):
            if not all(math.isfinite(v) for row in values for v in row):
                raise ValueError(f'{a.key}: non-finite attribute')
    return lo, hi, tris


def install(staged, output):
    """Swap the owned furniture directory; publish its manifest last; roll back on error."""
    target = output / 'furniture'
    backup = staged / 'previous-furniture'
    had_previous = target.exists()
    if had_previous:
        target.rename(backup)
    try:
        (staged / 'furniture').rename(target)
        os.replace(staged / 'manifest.furniture.json', output / 'manifest.furniture.json')
    except BaseException:
        if target.exists():
            shutil.rmtree(target)
        if had_previous:
            backup.rename(target)
        raise


def main():
    opt = arguments()
    for name in ('living', 'home', 'shop', 'details'):
        importlib.import_module('furn_assets_' + name)
    catalog = json.loads(opt.catalog.read_text(encoding='utf8'))
    out = opt.out.resolve()
    partial = bool(opt.only or opt.theme)
    shipped = (Path(L.ROOT) / 'assets' / 'models').resolve()
    if partial and out == shipped:
        raise ValueError('Preview filters require --out to a scratch directory; refusing to replace the shipped manifest')
    only = set(opt.only.split(',')) if opt.only else None
    themes = set(opt.theme.split(',')) if opt.theme else None
    if only and only - catalog.keys():
        raise ValueError('Unknown catalogue keys: ' + ', '.join(sorted(only - catalog.keys())))
    unknown = L.BUILDERS.keys() - catalog.keys()
    if unknown:
        raise ValueError('Builders without catalogue entries: ' + ', '.join(sorted(unknown)))
    missing = (only or catalog.keys()) - L.BUILDERS.keys()
    if missing and not themes:
        raise ValueError('Missing builders: ' + ', '.join(sorted(missing)))
    by_theme = {}
    for key in catalog:
        if key not in L.BUILDERS or (only and key not in only):
            continue
        theme, fn = L.BUILDERS[key]
        if themes and theme not in themes:
            continue
        by_theme.setdefault(theme, []).append((key, fn))
    if not by_theme:
        raise ValueError('No assets selected')
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.furniture-build-', dir=out) as tmp:
        staged = Path(tmp)
        (staged / 'furniture').mkdir()
        files = []
        for theme, items in sorted(by_theme.items()):
            L.reset()
            assets = {}
            for key, fn in items:
                c = catalog[key]
                a = L.Asset(key, c)
                fn(a, key, c)
                lo, hi, tris = check_geometry(a)
                L.build_objects(a, bpy.context.scene.collection)
                assets[key] = {
                    'node': key, 'size': c['size'], 'footprint': c['footprint'],
                    'tags': c['tags'], 'origin': 'floor-centre', 'triangles': tris,
                    'bounds': {'min': [round(v, 6) for v in lo], 'max': [round(v, 6) for v in hi]},
                }
                print(f'{key:24s} triangles={tris:5d} parts={len(a.groups):2d} '
                      f'bounds={lo!r}..{hi!r}', flush=True)
            rel = f'furniture/furn_{theme}.glb'
            path = staged / rel
            L.export_glb(str(path))
            data = path.read_bytes()
            files.append({'glb': rel, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'assets': assets})
            print(f'{theme}: {len(assets)} assets, {len(data):,} bytes', flush=True)
        total = sum(f['bytes'] for f in files)
        if total > 10_000_000 or any(f['bytes'] > 8_000_000 for f in files):
            raise ValueError(f'Furniture exceeds the payload budget: {total:,} bytes')
        manifest = {
            'generator': {'script': 'tools/blender/furn_build.py', 'blender': bpy.app.version_string,
                          'catalogSha256': hashlib.sha256(opt.catalog.read_bytes()).hexdigest()},
            'assetCount': sum(len(f['assets']) for f in files), 'totalBytes': total, 'files': files,
        }
        (staged / 'manifest.furniture.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
        # Inspect exported vertices and named roots before a full build is installed.
        if not partial:
            subprocess.run([opt.node, str(HERE / 'furn_validate.mjs'), '--models', str(staged), '--complete'], check=True)
        install(staged, out)
    print(f"Installed {manifest['assetCount']} Blender assets ({total:,} bytes) at {out}", flush=True)


if __name__ == '__main__':
    main()
