"""Build the furniture GLBs of La Ladera interiors (A3).  Run through the quiet-box wrapper (never a window):

    node la-ladera/tests/memgate.mjs 6 300 && node la-ladera/tools/nice.mjs --idle "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background --factory-startup \\
         --python la-ladera/tools/blender/furn_build.py -- --catalog <catalog.json> --out <models dir> [--only key,key] [--theme living,home,shop]

  catalog.json   from  node la-ladera/tools/blender/furn_dump_catalog.mjs <catalog.json>   (sizes, materials and tags straight from js/interiors/catalog.js)
  --out          the models folder: furniture/furn_<theme>.glb and manifest.furniture.json are written inside it (default: la-ladera/assets/models)
Prints one line per asset (triangles, bounds against the catalogue box).  tests/interiors-catalog.test.mjs holds the result to the catalogue.
"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
import bpy
import furn_lib as L
import furn_assets_living, furn_assets_home, furn_assets_shop                      # noqa: F401  (they register their builders)


def main():
    a = L.argv_after_dashes()
    opt = {}
    i = 0
    while i < len(a):
        if a[i].startswith('--') and i + 1 < len(a): opt[a[i][2:]] = a[i + 1]; i += 2
        else: i += 1
    cat_path = opt.get('catalog')
    out = os.path.abspath(opt.get('out') or os.path.join(L.ROOT, 'assets', 'models'))
    with open(cat_path, 'r', encoding='utf8') as f: catalog = json.load(f)
    only = set(str(opt['only']).split(',')) if opt.get('only') else None
    themes_wanted = set(str(opt['theme']).split(',')) if opt.get('theme') else None
    os.makedirs(os.path.join(out, 'furniture'), exist_ok=True)

    by_theme = {}
    for key, (theme, fn) in L.BUILDERS.items():
        if only and key not in only: continue
        if themes_wanted and theme not in themes_wanted: continue
        by_theme.setdefault(theme, []).append((key, fn))

    files, problems = [], []
    for theme, items in by_theme.items():
        L.reset()
        col = bpy.context.scene.collection
        assets = {}
        for key, fn in items:
            c = catalog.get(key)
            if c is None: problems.append(f'{key}: not in the catalogue'); continue
            A = L.Asset(key, c)
            fn(A, key, c)
            lo, hi = A.bounds()
            tris = sum(len(g.I) for g in A.groups.values())
            W, H, D = c['size']
            sz = [hi[k] - lo[k] for k in range(3)]
            flag = ''
            if lo[1] < -0.02 or hi[1] > H + 0.2 or lo[0] < -W / 2 - 0.1 or hi[0] > W / 2 + 0.1 or lo[2] < -D / 2 - 0.12 or hi[2] > D / 2 + 0.12:
                flag = '  <-- outside the catalogue box'; problems.append(key)
            print(f'  {key:22s} tris={tris:5d} parts={len(A.groups):2d} x[{lo[0]:+.2f},{hi[0]:+.2f}] y[{lo[1]:+.2f},{hi[1]:+.2f}] z[{lo[2]:+.2f},{hi[2]:+.2f}]  cat {W:.2f}x{H:.2f}x{D:.2f}{flag}')
            L.build_objects(A, col)
            assets[key] = {'node': key, 'tags': c['tags'], 'footprint': c['footprint']}
        rel = f'furniture/furn_{theme}.glb'
        L.export_glb(os.path.join(out, rel))
        files.append({'glb': rel, 'assets': assets})
        print(f'{theme}: {len(assets)} assets -> {rel} ({os.path.getsize(os.path.join(out, rel)) / 1024:.1f} KB)')
    man = os.path.join(out, 'manifest.furniture.json')
    with open(man, 'w', encoding='utf8', newline='\n') as f: json.dump({'files': files}, f, indent=1); f.write('\n')
    print('manifest ->', man)
    if problems: print('PROBLEMS:', ', '.join(problems))


main()
