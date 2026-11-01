"""Authored anatomical limbs and footwear for the original La Ladera rig.

Original mathematical geometry, CC0-1.0. No downloaded meshes or textures.
Only PB.V/PB.F are required; no Blender operators, bones, clips or materials are
created here. Dimensions and part names follow people_build.py's existing rig.
The far recipes preserve silhouette with coarse connected forms and omit nails,
laces and stitching, rather than decimating those details into floating specks.
"""
import math

TAU = math.tau
SKIN = ('#f0c8a0', '#e0ad82', '#c88b5e', '#a66c42', '#85512f', '#66391f', '#4a2a17')


def _mix(a, b, t):
    ac = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    bc = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(x * (1 - t) + y * t):02x}' for x, y in zip(ac, bc))


def _centre(points):
    return tuple(sum(p[j] for p in points) / len(points) for j in range(3))


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _loft(pb, rings, part, colour, fabric, cap_start=False, cap_end=False, colours=None, fabrics=None):
    """Ordered rings with shared side vertices and explicit cap orientation.

    A returned garment hem can continue inward and then back up the sleeve:
    winding is chosen on the first exterior strip and retained through the turn.
    This leaves actual cloth thickness and an open wrist/arm hole.
    """
    if len(rings) < 2:
        return
    n = len(rings[0])
    assert all(len(r) == n for r in rings)
    parts = [part] * len(rings) if isinstance(part, str) else part
    vv = [[pb.V(p, parts[r]) for p in ring] for r, ring in enumerate(rings)]
    ca, cb = _centre(rings[0]), _centre(rings[1])
    p, q, r = rings[0][0], rings[1][0], rings[1][1]
    normal = _cross(_sub(q, p), _sub(r, p))
    outward = _sub(p, ca)
    flip = sum(x * y for x, y in zip(normal, outward)) < 0
    for row in range(len(rings) - 1):
        c = colours[row] if colours else colour
        f = fabrics[row] if fabrics else fabric
        for i in range(n):
            j = (i + 1) % n
            verts = (vv[row][i], vv[row + 1][i], vv[row + 1][j], vv[row][j])
            pb.F(verts[::-1] if flip else verts, c, True, fab_=f)
    for enabled, idx, neighbour in ((cap_start, 0, 1), (cap_end, -1, -2)):
        if enabled:
            # Duplicate cap corners keep the end plane from softening the sides.
            cap = pb.F([pb.V(p, parts[idx]) for p in rings[idx]], colour, False, fab_=fabric)
            if cap is not None and hasattr(pb, 'caps'):
                pb.caps.append((cap, _sub(_centre(rings[idx]), _centre(rings[neighbour]))))
    return vv


def _ring(x, y, z, rx, ry, n, wave=0., phase=0.):
    return [(x + (rx + wave * math.cos(3 * a + phase)) * math.cos(a),
             y + (ry + wave * math.cos(3 * a + phase)) * math.sin(a), z)
            for a in (TAU * i / n for i in range(n))]


def _tip(pb, rings, point, part, colour, fabric):
    vv = _loft(pb, rings, part, colour, fabric, cap_start=True)
    tip = pb.V(point, part)
    for i in range(len(vv[-1])):
        pb.F((vv[-1][i], vv[-1][(i + 1) % len(vv[-1])], tip), colour, True, fab_=fabric)


def _nail(pb, start, end, width, part, skin):
    """A quiet, slightly rounded dorsal nail plate, not a white fingertip cap."""
    dx = width * .5
    a, b = start, end
    pts = [(a[0] - dx * .65, a[1], a[2]), (a[0] + dx * .65, a[1], a[2]),
           (a[0] + dx, a[1] * .8 + b[1] * .2, a[2] * .8 + b[2] * .2),
           (b[0] + dx * .72, b[1], b[2]), (b[0] - dx * .72, b[1], b[2]),
           (a[0] - dx, a[1] * .8 + b[1] * .2, a[2] * .8 + b[2] * .2)]
    pb.F([pb.V(p, part) for p in pts], _mix(skin, '#d9b9a7', .30), True, fab_='skin')


def _hand(pb, P, pd, sx, wrist, sg, lod):
    H, k = P['H'], P['k']
    scale = k * (.88 if P['child'] else 1.0)
    skin = pd.get('skin_hex', SKIN[pd['skin']])
    sd = '_l' if sg < 0 else '_r'
    hl = .108 * H
    width = .043 * scale
    n = 6 if lod else 18
    rf = (.036 if P['fem'] else .040) * scale
    wt = (.020 - .012) / (.045 - .012)
    # Start just inside the matching forearm ellipse. A fixed-width wrist band
    # protruded on smaller/female arms and its hidden cap baked a dark AO seam.
    palm_rows = [(wrist + .020 * k, rf * (.68 + .05 * wt) * .98, rf * (.53 + .09 * wt) * .98, .002 * k * wt),
                 (wrist - .12 * hl, width * .78, .024 * scale, .001 * k),
                 (wrist - .29 * hl, width * .94, .024 * scale, .003 * k),
                 (wrist - .40 * hl, width * .99, .019 * scale, .005 * k),
                 (wrist - .48 * hl, width * .94, .014 * scale, .006 * k)]
    if lod:
        palm_rows = [palm_rows[i] for i in (0, 2, 4)]
    rings = []
    for j, (z, rx, ry, cy) in enumerate(palm_rows):
        rr = []
        for i in range(n):
            a = TAU * i / n
            # Thenar pad is the thumb-side mound. The dorsal side stays flatter;
            # the knuckle edge broadens without adding separate ball objects.
            thenar = max(0., -sg * math.cos(a)) * max(0., math.sin(a))
            relief = .005 * scale * thenar * (1. if j in (1, 2) else .25)
            x = rx * math.cos(a)
            # Rounded metacarpals and a shallow knuckle arch replace the ruler-
            # straight distal edge of the previous rectangular palm block.
            distal = j == len(palm_rows) - 1
            arch = .010 * k * abs(x / width) ** 1.7 if distal else 0.
            dorsal = max(0., -math.sin(a))
            ridge = .0024 * scale * dorsal * math.cos(x / max(width, 1e-6) * math.pi * 3) ** 2 if j >= 2 else 0.
            rr.append((sx + x, cy + ry * math.sin(a) + relief - ridge, z + arch))
        rings.append(rr)
    _loft(pb, rings, 'hand' + sd, skin, 'skin', cap_start=False, cap_end=True)

    # Gaps remain at least 3mm for the small cast too; they are not four tangent
    # tubes. Index is next to the inward/opposed thumb and pinky is outward.
    spacing = .01862 * scale + .0030  # widest adjacent knuckles (1.04x radii) + 3mm
    lengths = (.42, .46, .43, .33)
    radii = (.0085, .0092, .0087, .0072)
    for fi, (length, radius) in enumerate(zip(lengths, radii)):
        fx = sx + sg * (fi - 1.5) * spacing
        # Every root overlaps the curved palm web. The knuckles follow a gentle
        # arch rather than the four rods starting at one straight cut edge.
        z0 = wrist - .48 * hl + .010 * k * abs((fx - sx) / width) ** 1.7 + .003 * k
        fl = hl * length
        r = radius * scale
        if lod:
            ring = _ring(fx, .006 * k, z0, r, r * .87, 3)
            # One triangular section + a rounded-silhouette tip, no orphan nail.
            vv = [pb.V(p, 'fingers' + sd) for p in ring]
            end = pb.V((fx + sg * (fi - 1.5) * .0015 * k, .043 * k, z0 - fl * .78), 'fingers' + sd)
            pb.F(vv[::-1], skin, False, fab_='skin')
            for i in range(3): pb.F((vv[i], vv[(i + 1) % 3], end), skin, True, fab_='skin')
            continue
        curl = (.040 + .004 * fi) * k
        def centre(t):
            return (fx + sg * (fi - 1.5) * .0014 * k * t,
                    .006 * k + curl * t * t,
                    z0 - fl * (t - .22 * t ** 3))
        def dorsal_axis(t):
            dy, dz = 2 * curl * t, -fl * (1 - .66 * t * t)
            norm = math.hypot(dy, dz)
            return (-dz / norm, dy / norm)
        rows = []
        for t, rad in ((0., 1.), (.32, 1.04), (.56, .93), (.78, .77), (.94, .55)):
            # Interphalangeal bends progress gently instead of a single hooked
            # fingertip. Adjacent fingers vary in length and relaxed curl.
            x, y, z = centre(t); by, bz = dorsal_axis(t)
            rows.append([(x + r * rad * math.cos(a), y + r * rad * .88 * math.sin(a) * by,
                          z + r * rad * .88 * math.sin(a) * bz) for a in (TAU * j / 8 for j in range(8))])
        end = centre(1.)
        _tip(pb, rows, end, 'fingers' + sd, skin, 'skin')
        a, b = centre(.78), centre(.94)
        ay, az = dorsal_axis(.78); by, bz = dorsal_axis(.94)
        ra, rb = r * .77 * .88 + .0004 * k, r * .55 * .88 + .0004 * k
        a = (a[0], a[1] - ra * ay, a[2] - ra * az)
        b = (b[0], b[1] - rb * by, b[2] - rb * bz)
        _nail(pb, a, b, r * 1.25, 'fingers' + sd, skin)

    # The thumb emerges from the thenar side and opposes the index, leaving a
    # genuine V-shaped web. It uses the existing hand/fingers bone pair.
    thumb = [(sx - sg * width * .72, .012 * k, wrist - .13 * hl, .012 * scale),
             (sx - sg * width * 1.23, .020 * k, wrist - .25 * hl, .011 * scale),
             (sx - sg * width * 1.38, .030 * k, wrist - .39 * hl, .0095 * scale),
             (sx - sg * width * 1.31, .036 * k, wrist - .48 * hl, .0065 * scale)]
    if lod:
        thumb = [thumb[i] for i in (0, 2)]
    rings = [_ring(x, y, z, r, r * .86, 4 if lod else 8) for x, y, z, r in thumb]
    end = (sx - sg * width * 1.24, .039 * k, wrist - .51 * hl)
    _tip(pb, rings, end, 'fingers' + sd, skin, 'skin')
    if not lod:
        a, b = thumb[-2], thumb[-1]
        _nail(pb, (a[0], a[1] - a[3] * .87 - .0004 * k, a[2]),
              (b[0], b[1] - b[3] * .87 - .0004 * k, b[2]), .012 * scale, 'fingers' + sd, skin)


def append_arms(pb, P, pd, top_fabric, lod=False):
    """Add both shaped arms, open cloth sleeves and articulated-looking hands."""
    H, k, sh, shw = P['H'], P['k'], P['sh'], P['shw']
    ua, fa = .186 * H, .146 * H
    elbow, wrist = sh - ua, sh - ua - fa
    cf = .88 if P['child'] else 1.
    ru = (.046 if P['fem'] else .052) * k * cf * pd['build'] ** .5
    rf = (.036 if P['fem'] else .040) * k * cf
    style = pd['top_style']
    long = pd.get('sleeve') == 'long' or style in ('jacket', 'puffer', 'coat', 'labcoat', 'hoodie', 'jumper')
    ease = {'jacket': .014, 'puffer': .023, 'coat': .017, 'labcoat': .011, 'hoodie': .010, 'jumper': .008}.get(style, .005) * k
    skin = pd.get('skin_hex', SKIN[pd['skin']])
    end_z = sh - ua * (.39 if style == 'football' else .44)
    cuff_colour = pd.get('top_secondary', pd['top'])
    for sg in (-1, 1):
        sd = '_l' if sg < 0 else '_r'
        sx = sg * (shw - .012)
        # (height, transverse radius, sagittal radius, forward offset). Rounded
        # deltoid -> biceps/triceps -> elbow -> brachioradialis -> narrow wrist.
        profile = [(sh - .008 * k, ru * .40, ru * .46, -.001 * k),
                   (sh - .032 * k, ru * .88, ru * .92, 0.),
                   (sh - ua * .24, ru * .99, ru * 1.02, .004 * k),
                   (end_z, ru * .95, ru, .004 * k),
                   (sh - ua * .66, ru * .84, ru * .91, .003 * k),
                   (elbow + .025 * k, rf * 1.02, rf * .98, .001 * k),
                   (elbow + .002 * k, rf * .98, rf * .94, -.001 * k),
                   (elbow - .024 * k, rf * 1.07, rf * 1.02, .001 * k),
                   (elbow - fa * .29, rf * 1.12, rf * 1.05, .003 * k),
                   (elbow - fa * .57, rf * .92, rf * .86, .004 * k),
                   (wrist + .045 * k, rf * .73, rf * .62, .002 * k),
                   (wrist + .012 * k, rf * .68, rf * .53, 0.)]
        if lod:
            chosen = [profile[i] for i in (0, 2, 3, 6, 8, 11)]
            rings = [_ring(sx, cy, z, rx + (ease if long or z >= end_z else 0.),
                           ry + (ease if long or z >= end_z else 0.), 6) for z, rx, ry, cy in chosen]
            rings[0] = [(x - sx * .06, y, z - .018 * k * sg * math.cos(TAU * i / 6)) for i, (x, y, z) in enumerate(rings[0])]
            cols = [pd['top'] if long or chosen[i + 1][0] >= end_z - 1e-7 else skin for i in range(len(chosen) - 1)]
            fabs = [top_fabric if c == pd['top'] else 'skin' for c in cols]
            parts = [('arm' if z >= elbow else 'farm') + sd for z, *_ in chosen]
            _loft(pb, rings, parts, pd['top'], top_fabric, cap_start=True, colours=cols, fabrics=fabs)
        else:
            # Exposed arm begins inside the open short sleeve. Long sleeves need
            # only the wrist/palm overlap, avoiding a hidden full duplicate arm.
            if not long:
                skin_rows = [(.5 * (profile[2][0] + end_z), ru, ru * 1.02, .004 * k)] + profile[3:]
                rings = [_ring(sx, cy, z, rx, ry, 12) for z, rx, ry, cy in skin_rows]
                parts = [('arm' if z >= elbow else 'farm') + sd for z, *_ in skin_rows]
                _loft(pb, rings, parts, skin, 'skin')
            sleeve_rows = profile if long else profile[:4]
            rings = []
            for ri, (z, rx, ry, cy) in enumerate(sleeve_rows):
                elbow_fold = .0024 * k * math.exp(-((z - elbow) / (.055 * k)) ** 2)
                rr = _ring(sx, cy, z, rx + ease, ry + ease, 12,
                           wave=elbow_fold, phase=(z - elbow) * 140 / k)
                # The inner shoulder disappears into the torso while the outer
                # acromion slopes down. A level capped dome looked like armour.
                slope = .018 if ri == 0 else (.007 if ri == 1 else 0.)
                rings.append([(x - (sx * .06 if ri == 0 else 0.), y, zz - slope * k * sg * math.cos(TAU * i / 12)) for i, (x, y, zz) in enumerate(rr)])
            parts = [('arm' if z >= elbow else 'farm') + sd for z, *_ in sleeve_rows]
            z, rx, ry, cy = sleeve_rows[-1]
            # Returned edge and inner sleeve wall: 3mm fabric, no flat cap over
            # the arm opening. The turn is connected to the sleeve exterior.
            hem = .022 * k if long else .012 * k
            thick = .003 * k
            rings += [_ring(sx, cy, z - hem, rx + ease * .96, ry + ease * .96, 12),
                      _ring(sx, cy, z - hem, rx + ease * .96 - thick, ry + ease * .96 - thick, 12),
                      _ring(sx, cy, z + .008 * k, rx + ease - thick, ry + ease - thick, 12)]
            parts += [parts[-1]] * 3
            cols = [pd['top']] * (len(rings) - 1)
            fabs = [top_fabric] * len(cols)
            if cuff_colour != pd['top'] or style in ('hoodie', 'jumper'):
                for i in range(max(0, len(cols) - 4), len(cols)):
                    cols[i] = cuff_colour
                    fabs[i] = 'knit' if style in ('hoodie', 'jumper') else top_fabric
            _loft(pb, rings, parts, pd['top'], top_fabric, cap_start=True, colours=cols, fabrics=fabs)
        _hand(pb, P, pd, sx, wrist, sg, lod)


def _ribbon(pb, points, width, part, colour, fabric, axis=0):
    vv = []
    for p in points:
        a, b = list(p), list(p)
        a[axis] -= width * .5; b[axis] += width * .5
        vv.append((pb.V(tuple(a), part), pb.V(tuple(b), part)))
    for a, b in zip(vv, vv[1:]): pb.F((a[0], a[1], b[1], b[0]), colour, True, fab_=fabric)


def append_feet(pb, P, pd, lod=False):
    """Add shoes, trainers, boots or sandals without moving the original rig.

    The old ten-sided sole's minimum is deliberately retained exactly. Changing
    that minimum changes the builder's global sole normalization and therefore
    every rest translation, even if the bone recipe itself is untouched.
    """
    k, child = P['k'], P['child']
    style, colour, sole = pd['shoe']
    skin = pd.get('skin_hex', SKIN[pd['skin']])
    hx = P['hipw'] * .52
    # The original forward reach made ordinary shoes look like long pointed
    # slippers. Broaden the forefoot and use a rounder practical shoe last; this
    # does not move the foot joint or the sole normalization plane.
    length = .265 * k * (.82 if child else 1.) * (.96 if child else {'boot': .94, 'trainer': .90, 'shoe': .88, 'sandal': .88}[style])
    width = .052 * k * (.9 if child else 1.) * 1.10
    zmin = .0125 * k * (1 - math.sin(.4 * math.pi))
    zsole = .025 * k
    for sg in (-1, 1):
        sd = '_l' if sg < 0 else '_r'; part = 'foot' + sd; cx = sg * hx
        # A heel waist, broad metatarsal area and asymmetric medial big-toe side.
        outline = [(0., -.17), (.64, -.16), (.85, -.08), (.84, .13),
                   (.96, .34), (1.04, .60), (.96, .79), (.73, .94),
                   (.35, 1.00), (-.12, 1.00), (-.63, .94), (-.94, .80),
                   (-1., .61), (-.87, .36), (-.72, .12), (-.68, -.10)]
        if lod: outline = outline[::2]
        rings = []
        for z, factor in ((zmin, .95), (zmin + .006 * k, 1.02), (zsole, .99)) if not lod else ((zmin, .96), (zsole, 1.0)):
            rings.append([(cx + sg * x * width * factor, y * length, z) for x, y in outline])
        _loft(pb, rings, part, sole, 'rubber', cap_start=True, cap_end=True)

        height = {'trainer': .085, 'shoe': .079, 'boot': .10, 'sandal': .060}[style] * k
        profile = [(-.16, .58, .67), (-.08, .78, .95), (.10, .83, 1.05),
                   (.36, .99, .91), (.61, 1.00, .67), (.80, .92, .50), (.94, .63, .35), (1.00, .22, .24)]
        if style == 'sandal': profile = profile[:5] + [(.80, .85, .40)]
        if lod: profile = [profile[i] for i in (0, 2, 4, len(profile) - 1)]
        n = 5 if lod else 8
        upper = []
        for yy, ww, hh in profile:
            zz = zsole + .002 * k + height * hh * .5
            upper.append([(cx + width * ww * math.cos(TAU * i / n), yy * length,
                           zz + height * hh * .5 * math.sin(TAU * i / n)) for i in range(n)])
        _loft(pb, upper, part, skin if style == 'sandal' else colour,
              'skin' if style == 'sandal' else ('nylon' if style == 'trainer' else 'leather'), cap_start=True, cap_end=True)

        def top(y, x=0.):
            u = y / length
            for a, b in zip(profile, profile[1:]):
                if a[0] <= u <= b[0]:
                    t = (u - a[0]) / (b[0] - a[0]); w = width * (a[1] + (b[1] - a[1]) * t)
                    h = height * (a[2] + (b[2] - a[2]) * t)
                    return zsole + .002 * k + h * .5 * (1 + math.sqrt(max(0., 1 - (x / w) ** 2)))
            return zsole + .030 * k

        if style == 'sandal' and not lod:
            # Five actual toes continue the exposed forefoot; an inner big toe
            # and successively shorter neighbours avoid a blunt skin shoe.
            for ti in range(5):
                x = cx + sg * (-.68 + .34 * ti) * width
                rad = (.0095 - .0010 * ti) * k * (.88 if child else 1.)
                y0 = .77 * length
                y1 = (.99 - .026 * ti) * length
                z = zsole + .012 * k + rad * .35
                rs = [[(x + rad * math.cos(TAU * j / 5), y, z + rad * .70 * math.sin(TAU * j / 5)) for j in range(5)]
                      for y in (y0, y1 - .007 * k)]
                _tip(pb, rs, (x, y1, z), part, skin, 'skin')
                # Toenails sit on top of the toe, inset from its rounded end.
                _ribbon(pb, [(x, y1 - .012 * k, z + rad * .73), (x, y1 - .005 * k, z + rad * .69)],
                        rad * 1.1, part, _mix(skin, '#d9b9a7', .28), 'skin')
        if style == 'sandal':
            for yf, band in ((.26, .026), (.61, .032)):
                y = yf * length
                pts = [(cx + t * width * .94, y, top(y, t * width * .94) + .0025 * k) for t in (-1., -.65, 0., .65, 1.)]
                if lod: pts = [pts[i] for i in (0, 2, 4)]
                _ribbon(pb, pts, band * k, part, colour, 'leather', axis=1)
            if not lod:
                rr = .035 * k * (.88 if child else 1.) * 1.17
                _loft(pb, [_ring(cx, 0., P['ankle'] + z * k, rr, rr, 10) for z in (.008, .022)],
                      'shin' + sd, colour, 'leather')
        elif not lod:
            seam = _mix(colour, '#b9ae95', .28)
            # Stitched upper panels follow the surface; slim strips are enough
            # at arm's length and do not add another primitive/material.
            for side in (-1, 1):
                pts = []
                for yf in (.10, .29, .49, .67):
                    x = side * width * (.57 if yf < .5 else .74); y = yf * length
                    pts.append((cx + x, y, top(y, x) + .0017 * k))
                _ribbon(pb, pts, .0018 * k, part, seam, 'cotton')
            lace = '#d9d7ca' if style == 'trainer' else _mix(colour, '#d8c7a9', .36)
            for j, yf in enumerate((.22, .33, .44, .55)):
                y = yf * length; spread = width * (.43 + .05 * j)
                pts = [(cx - spread, y - .005 * k, top(y, spread) + .0030 * k),
                       (cx, y, top(y) + .003 * k),
                       (cx + spread, y + .005 * k, top(y, spread) + .0030 * k)]
                _ribbon(pb, pts, .0033 * k, part, lace, 'nylon', axis=1)
        if style == 'boot':
            r = .035 * k * (.88 if child else 1.)
            boot_rows = [(P['ankle'] - .025 * k, r * 1.48), (P['ankle'] + .10 * k, r * 1.58),
                         (P['ankle'] + .16 * k, r * 1.57)]
            if lod: boot_rows = [boot_rows[0], boot_rows[-1]]
            rings = [_ring(cx, -.004 * k, z, rx, rx * .94, 5 if lod else 10) for z, rx in boot_rows]
            if not lod:
                z, rx = boot_rows[-1]
                rings += [_ring(cx, -.004 * k, z, rx - .003 * k, rx * .94 - .003 * k, 10),
                          _ring(cx, -.004 * k, z - .012 * k, rx - .003 * k, rx * .94 - .003 * k, 10)]
            _loft(pb, rings, 'shin' + sd, colour, 'leather')
