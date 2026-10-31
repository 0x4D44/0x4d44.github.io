"""Post step for tools/textures/veg.mjs (owner: A1): the vegetation textures of A5.

  python -I veg_post.py <name> <raw.png> <out_dir> '<json spec>'

Tileable swatches (bark_eucalyptus 512x1024, bark_dark 512x512, trunk_banana 256x512): centre-crop to the target aspect, remove the baked light gradient, make the image
periodic (Moisan: tiles both ways with no seam and no ghost), resize, JPEG q86.
foliage_cards (2048x1024 RGBA): the sheet comes on a flat black background; the alpha is the distance of the brightest channel from that black, the colour of the edge pixels
is un-premultiplied and bled outwards (no dark halo under bilinear filtering), the eight leaf groups are found as blobs, ordered (top row, then bottom row, left to right)
and re-packed into the 4 x 2 grid of 512 x 512 cells with each base at the bottom centre, whatever grid the image generator drew. PNG with alpha.
Writes assets/textures/manifest.json (entry per name) in the schema core/matlib.js reads: { map, tileScale, avg, size, w, h [, alpha, cells] }.
"""
import json, os, sys, datetime
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import post as P  # noqa: E402  (flatten, periodic, resize, to_u8: the shared helpers of the texture factory)


def centre_crop(a, w, h):
    """The largest centred crop with the aspect of w:h."""
    H, W = a.shape[:2]
    tw = min(W, int(round(H * w / h)))
    th = min(H, int(round(W * h / w)))
    if tw * H <= W * th:
        th = H
    else:
        tw = W
    x0, y0 = (W - tw) // 2, (H - th) // 2
    return a[y0:y0 + th, x0:x0 + tw]


def hexavg(a):
    m = a[..., :3].reshape(-1, 3).mean(axis=0)
    return '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in m)


def swatch(raw, w, h):
    a = np.asarray(Image.open(raw).convert('RGB'), dtype=np.float32) / 255.0
    a = centre_crop(a, w, h)
    a = P.flatten(a, 0.6, 5)
    a = P.periodic(a)
    a = P.resize(a, w, h)
    return np.clip(a, 0, 1)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def sheet(raw, W, H, names):
    img = np.asarray(Image.open(raw).convert('RGB'), dtype=np.float32) / 255.0
    ih, iw = img.shape[:2]
    mx = img.max(axis=2)
    border = np.concatenate([mx[:6].ravel(), mx[-6:].ravel(), mx[:, :6].ravel(), mx[:, -6:].ravel()])
    bg = float(np.median(border))
    # the matte is choked a little (the fringe where a leaf meets the black is dark): the colour of every pixel that is not clearly leaf comes from the nearest pixel that is
    alpha = smoothstep(bg + 0.06, bg + 0.20, mx).astype(np.float32)
    solid = alpha > 0.9
    idx = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    col = img[idx[0], idx[1]]
    # which group is which: the image generator draws the 4 x 2 grid, but a group may cross a grid line by a few pixels, so the pieces are found as blobs and each blob
    # belongs to the grid cell that holds its centre of mass
    mask = alpha > 0.2
    lab, n = ndi.label(mask, structure=np.ones((3, 3), int))                                  # no dilation: two groups are only a few pixels apart at the closest
    ids = np.arange(1, n + 1)
    areas = np.asarray(ndi.sum(mask, lab, index=ids))
    cms = np.asarray(ndi.center_of_mass(mask, lab, index=ids))
    members = {ci: [] for ci in range(8)}
    for i, (ar, (cy, cx)) in enumerate(zip(areas, cms)):
        if ar < 6 or not np.isfinite(cy):
            continue
        members[min(1, int(cy // (ih / 2))) * 4 + min(3, int(cx // (iw / 4)))].append(i + 1)
    print(f'sheet: raw {iw}x{ih}, background level {bg:.3f}, {n} blobs, per cell {[len(members[c]) for c in range(8)]}')
    cw, ch = W // 4, H // 2
    out = np.zeros((H, W, 4), np.float32)
    for ci in range(8):
        if not members[ci]:
            print(f'  cell {ci} ({names[ci]}): EMPTY')
            continue
        region = np.isin(lab, members[ci]) & (alpha > 0.0)
        ys, xs = np.nonzero(region)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        a_c = (alpha * region)[y0:y1, x0:x1]
        c_c = col[y0:y1, x0:x1]
        sc = min((cw - 24) / (x1 - x0), (ch - 16) / (y1 - y0), 1.5)
        nw, nh = max(1, int(round((x1 - x0) * sc))), max(1, int(round((y1 - y0) * sc)))
        A = P.resize(a_c, nw, nh)
        C = P.resize(c_c, nw, nh)
        ox, oy = (cw - nw) // 2, ch - 6 - nh                                         # centred, resting on the cell's floor
        cx0, cy0 = (ci % 4) * cw, (ci // 4) * ch
        out[cy0 + oy:cy0 + oy + nh, cx0 + ox:cx0 + ox + nw, :3] = C
        out[cy0 + oy:cy0 + oy + nh, cx0 + ox:cx0 + ox + nw, 3] = np.clip(A, 0, 1)
        print(f'  cell {ci} ({names[ci]}): {x1 - x0}x{y1 - y0} px, scale {sc:.2f} -> {nw}x{nh}')
    # transparent pixels keep the colour of the nearest opaque one (resizing mixed black into the edges: bleed again at the final size)
    solid = out[..., 3] > 0.9
    if solid.any():
        idx = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
        bled = out[..., :3][idx[0], idx[1]]
        soft = out[..., 3] < 0.98
        out[..., :3][soft] = bled[soft]
    return out


def main():
    name, raw, out_dir, spec = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4])
    w, h = spec['w'], spec['h']
    os.makedirs(out_dir, exist_ok=True)
    if spec.get('alpha'):
        a = sheet(raw, w, h, spec['cells'])
        rgba = np.concatenate([P.to_u8(a[..., :3]), P.to_u8(a[..., 3:4])], axis=2)
        Image.fromarray(rgba, 'RGBA').save(os.path.join(out_dir, name + '.png'), optimize=True)
        opaque = a[..., 3] > 0.5
        avg = hexavg(a[..., :3][opaque][None, ...]) if opaque.any() else '#4a6a3a'
        entry = {'map': name + '.png', 'tileScale': 1.0, 'avg': avg, 'size': max(w, h), 'w': w, 'h': h, 'alpha': True, 'cells': spec['cells']}
        prev = np.zeros((h, w, 3), np.float32) + np.array([0.55, 0.68, 0.85], np.float32)               # sky-coloured backdrop for a look at the result
        prev = prev * (1 - a[..., 3:4]) + a[..., :3] * a[..., 3:4]
        pv = os.path.join(os.path.dirname(os.path.abspath(raw)), name + '_preview.jpg')
        Image.fromarray(P.to_u8(prev), 'RGB').save(pv, quality=88)
        print('preview', pv)
    else:
        a = swatch(raw, w, h)
        Image.fromarray(P.to_u8(a), 'RGB').save(os.path.join(out_dir, name + '.jpg'), quality=86, optimize=True, progressive=False)
        entry = {'map': name + '.jpg', 'tileScale': 1.0, 'avg': hexavg(a), 'size': max(w, h), 'w': w, 'h': h}
    mp = os.path.join(out_dir, 'manifest.json')
    man = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {'textures': {}}
    man.setdefault('textures', {})[name] = entry
    man['version'] = 2
    man['generated'] = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    with open(mp, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    f = os.path.join(out_dir, entry['map'])
    print('RESULT', name, entry['map'], os.path.getsize(f), 'bytes', entry['avg'])


if __name__ == '__main__':
    main()
