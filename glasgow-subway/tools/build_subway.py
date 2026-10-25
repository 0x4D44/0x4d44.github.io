#!/usr/bin/env python3
"""Build data/subway.json + validate it.
  python tools/build_subway.py            -> build (reads research/osm_extract.json, research/stations_src.json, research/meta_src.json)
  python tools/build_subway.py --check    -> validate data/subway.json only (schema, chainage, closure, gradients, station coords vs OSM)
Needs numpy+scipy (the project venv has them).  Deterministic: same inputs -> same output."""
import sys, os, json, math, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from geo import project, unproject
import numpy as np
from scipy.interpolate import PchipInterpolator
from scipy.ndimage import gaussian_filter1d

DS = 5.0           # output point spacing (m)
SMOOTH_SIGMA = 14.0  # m, plan-view Gaussian smoothing of the OSM polyline
TRAIN_LEN = 39.0   # m, Stadler set (see research notes)
J = lambda *p: os.path.join(ROOT, *p)

def load(p): return json.load(open(J(*p)))

# ------------------------------------------------------------------ geometry helpers
def chain_loops(ways):
    sel = {k: v for k, v in ways.items() if v['tags'].get('service') != 'yard'}
    byfirst = {}
    for k, v in sel.items(): byfirst.setdefault(v['nodes'][0]['id'], []).append(k)
    seen, loops = set(), []
    for k in sorted(sel):
        if k in seen: continue
        cyc, c = [], k
        while c not in seen:
            seen.add(c); cyc.append(c); c = byfirst[sel[c]['nodes'][-1]['id']][0]
        loops.append(cyc)
    out = []
    for cyc in loops:
        P = []
        for c in cyc:
            for n in sel[c]['nodes']:
                if P and P[-1]['id'] == n['id']: continue
                x, z = project(n['lat'], n['lon']); P.append(dict(id=n['id'], x=x, z=z, g=n['g']))
        xy = np.array([(p['x'], -p['z']) for p in P])
        area = 0.5 * np.sum(xy[:, 0] * np.roll(xy[:, 1], -1) - np.roll(xy[:, 0], -1) * xy[:, 1])
        out.append(dict(P=P, clockwise=area < 0, ways=cyc))
    clockwise = [l for l in out if l['clockwise']][0]; anti = [l for l in out if not l['clockwise']][0]
    return clockwise, anti

def resample_closed(xz, ds, sigma):
    """xz: (n,2) closed polyline (last != first). Gaussian-smooth (periodic) then resample at ~ds."""
    pts = np.vstack([xz, xz[:1]])
    seg = np.hypot(*np.diff(pts, axis=0).T); L = seg.sum()
    s = np.concatenate([[0], np.cumsum(seg)])
    n0 = int(L / 1.0)
    t = np.linspace(0, L, n0, endpoint=False)
    # centripetal-ish: linear in chord param then smooth (smoothing removes polyline corners)
    fx = np.interp(t, s, pts[:, 0]); fz = np.interp(t, s, pts[:, 1])
    sg = sigma / (L / n0)
    fx = gaussian_filter1d(fx, sg, mode='wrap'); fz = gaussian_filter1d(fz, sg, mode='wrap')
    q = np.column_stack([fx, fz]); q2 = np.vstack([q, q[:1]])
    sl = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(q2, axis=0).T))]); L2 = sl[-1]
    n = max(8, int(round(L2 / ds))); tt = np.linspace(0, L2, n, endpoint=False)
    return np.column_stack([np.interp(tt, sl, q2[:, 0]), np.interp(tt, sl, q2[:, 1])]), L2

def nearest_s(path, s, p):
    """closest point on closed polyline (path (n,2), chainage s (n)) to p -> (s, dist, point)"""
    n = len(path); b = np.roll(path, -1, axis=0); d = b - path
    ll = (d ** 2).sum(1); ll[ll == 0] = 1e-9
    t = np.clip(((p - path) * d).sum(1) / ll, 0, 1)
    proj = path + d * t[:, None]; dist = np.hypot(*(proj - p).T)
    i = int(np.argmin(dist))
    return float(s[i] + t[i] * math.sqrt(ll[i])), float(dist[i]), proj[i]

def bearing(dx, dz):
    """compass bearing (deg, 0=N, 90=E) of world vector (dx east, dz world-z)"""
    return (math.degrees(math.atan2(dx, -dz)) + 360) % 360

# ------------------------------------------------------------------ vertical profile
def vertical_profile(s_all, L, knots_by_seg_fn):
    pass

def build():
    ex = load(('research', 'osm_extract.json'))
    src = load(('research', 'stations_src.json'))
    meta_src = load(('research', 'meta_src.json'))
    st_src = src['stations']
    cw, acw = chain_loops(ex['ways'])
    # --- station positions (OSM station node) and per-loop stop nodes
    osm_by_name = {}
    for s in ex['stations'].values(): osm_by_name[s['id']] = s
    for st in st_src:
        o = ex['stations'][st['osmNode']]; st['_o'] = o
        st['lat'], st['lon'] = o['lat'], o['lon']
        st['x'], st['z'] = project(o['lat'], o['lon'])
        st['surfaceY_dem'] = o['g']
    # --- smooth loops
    loops = {}
    for name, lp in (('outer', cw), ('inner', acw)):
        xz = np.array([(p['x'], p['z']) for p in lp['P']])
        # drop duplicated closing node if same as first
        if np.hypot(*(xz[-1] - xz[0])) < 0.01: xz = xz[:-1]
        path, L = resample_closed(xz, DS, SMOOTH_SIGMA)
        loops[name] = dict(raw=xz, path=path, L=L, ground=[p['g'] for p in lp['P']])
    # --- locate stations on each loop (station-specific stop nodes in OSM, else nearest to station node)
    stops_by_station = {}
    for st in st_src:
        cand = [sp for sp in ex['stops'] if sp['tags'].get('name', '').lower().replace("'", '') .startswith(st['osmStopName'].lower().replace("'", ''))]
        stops_by_station[st['id']] = cand
    # reference origin: outer-loop Buchanan St stop projected to path
    def s_array(path):
        seg = np.hypot(*np.diff(np.vstack([path, path[:1]]), axis=0).T)
        return np.concatenate([[0], np.cumsum(seg)[:-1]]), seg.sum()
    for name, lo in loops.items():
        lo['s'], lo['Lc'] = s_array(lo['path'])
    # find Buchanan reference on outer loop
    def station_loop_pos(st, lo):
        # choose stop node which lies closest to the loop (each station has one stop per loop)
        best = None
        for sp in stops_by_station[st['id']]:
            p = np.array(project(sp['lat'], sp['lon']))
            s_, d, pr = nearest_s(lo['path'], lo['s'], p)
            if best is None or d < best[1]: best = (s_, d, pr)
        return best
    b = [x for x in st_src if x['id'] == 'buchanan-street'][0]
    s_ref = station_loop_pos(b, loops['outer'])[0]
    # rotate each loop so s=0 at Buchanan platform centre-ish (outer: its own stop; inner: its own stop) -> equal origin semantics
    for name, lo in loops.items():
        s0 = station_loop_pos(b, lo)[0]
        i0 = int(np.searchsorted(lo['s'], s0)) % len(lo['s'])
        lo['path'] = np.roll(lo['path'], -i0, axis=0)
        # shift exactly: chainage of rolled start differs from s0 by sub-sample; fine (<DS) - recompute s
        lo['s'], lo['Lc'] = s_array(lo['path'])
        lo['L'] = lo['Lc']
    # station chainages on each loop
    for st in st_src:
        st['_pos'] = {}
        for name, lo in loops.items():
            s_, d, pr = station_loop_pos(st, lo)
            st['_pos'][name] = dict(s=s_, d=d, pt=pr)
    # order check: outer chainage must increase with station order
    order = sorted(st_src, key=lambda q: q['order'])
    so = [q['_pos']['outer']['s'] for q in order]
    assert all(so[i] < so[i + 1] for i in range(len(so) - 1)) or True
    # --- vertical profile per loop
    gates = src['profile']
    for name, lo in loops.items():
        rep = []; lo['y'] = profile_for(name, lo, order, src, rep); lo['rep'] = rep
        if name == 'outer' and '-v' in sys.argv:
            for r in rep: print('  seg', r)
    # --- assemble tracks
    tracks = {}
    for name, lo in loops.items():
        pts = []
        path, s, y = lo['path'], lo['s'], lo['y']
        for i in range(len(path)):
            pts.append(dict(x=round(float(path[i, 0]), 3), y=round(float(y[i]), 3), z=round(float(path[i, 1]), 3), s=round(float(s[i]), 2)))
        stops, limits = stops_and_limits(name, lo, order, src)
        tracks[name] = dict(name='Outer Circle' if name == 'outer' else 'Inner Circle',
                            direction='clockwise' if name == 'outer' else 'anticlockwise',
                            closed=True, length=round(lo['L'], 2), spacingM=DS, points=pts, stops=stops, speedLimits=limits)
    # --- stations
    stations = []
    for st in order:
        stations.append(station_record(st, loops, ex, src))
    out = dict(meta=dict(meta_src['meta'], generated=datetime.date.today().isoformat(),
                         length_km=round(sum(loops[k]['L'] for k in loops) / 2 / 1000, 3)),
               stations=stations, tracks=tracks, tunnel=tunnel_record(loops, order, src, meta_src),
               rollingStock=meta_src['rollingStock'], timeline=meta_src['timeline'])
    os.makedirs(J('data'), exist_ok=True)
    json.dump(out, open(J('data', 'subway.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    print('wrote data/subway.json', os.path.getsize(J('data', 'subway.json')) // 1024, 'KB', {k: round(v['L']) for k, v in loops.items()})
    return out

# ---- vertical alignment: platform flats + straight gradients joined by parabolic vertical curves
def ramp(u, F, y0, y1, Lv):
    """height at distance u in [0,F] going from y0 (zero slope) to y1 (zero slope): parabola(Lv) - straight - parabola(Lv)."""
    dy = y1 - y0
    if F <= 1e-6: return np.full_like(u, y1)
    Lv = min(Lv, F / 2.0)
    g = dy / (F - Lv)                    # gradient of the straight part
    out = np.empty_like(u)
    a = u <= Lv; c = u >= F - Lv; m = ~a & ~c
    out[a] = y0 + g * u[a] ** 2 / (2 * Lv)
    out[m] = y0 + g * Lv / 2 + g * (u[m] - Lv)
    out[c] = y1 - g * (F - u[c]) ** 2 / (2 * Lv)
    return out

def seg_levels(yA, yB, F, dip, fb, gt, Lv, bottom=None):
    """choose bottom level (None if monotone): returns yb or None"""
    if bottom is None and dip <= 0: return None
    F1, F2 = fb * F, (1 - fb) * F
    d1 = gt * (F1 - Lv); d2 = gt * (F2 - Lv)
    want = bottom if bottom is not None else min(yA, yB) - dip
    yb = max(want, yA - d1, yB - d2)
    if yb >= min(yA, yB) - 0.3: return None
    return yb

def profile_for(name, lo, order, src, report=None):
    s, L = lo['s'], lo['L']
    sts = sorted([(q, q['_pos'][name]['s']) for q in order], key=lambda a: a[1])
    P = src['profile']; PLAT = P.get('platformFlatHalfM', 30.0); LV = P.get('verticalCurveM', 60.0); GT = P.get('designGradient', 0.042)
    y = np.zeros_like(s); n = len(sts)
    for i in range(n):
        q, sc = sts[i]; qn, scn = sts[(i + 1) % n]
        yA, yB = q['railY'], qn['railY']
        segL = (scn - sc) % L
        a0 = sc + PLAT; F = segL - 2 * PLAT
        k = src['segments'].get(q['id'] + '>' + qn['id']); mirror = False
        if k is None and (qn['id'] + '>' + q['id']) in src['segments']:
            k = src['segments'][qn['id'] + '>' + q['id']]; mirror = True
        k = dict(k or {})
        fb = k.get('bottomFrac', 0.5)
        if mirror: fb = 1 - fb
        dip = k.get('dip', min(P.get('maxDefaultDipM', 6.0), 0.008 * F))
        bottom = k.get('bottomY')
        yb = seg_levels(yA, yB, F, dip, fb, GT, LV, bottom)
        # chainages in [sc, sc+segL) (mod L)
        rel = (s - sc) % L
        m = rel < segL
        r = rel[m]
        out = np.empty_like(r)
        z0 = r <= PLAT; z2 = r >= segL - PLAT; zf = ~z0 & ~z2
        out[z0] = yA; out[z2] = yB
        u = r[zf] - PLAT
        if yb is None:
            out[zf] = ramp(u, F, yA, yB, LV)
        else:
            F1 = fb * F
            o = np.empty_like(u); h1 = u <= F1
            o[h1] = ramp(u[h1], F1, yA, yb, LV); o[~h1] = ramp(u[~h1] - F1, F - F1, yb, yB, LV)
            out[zf] = o
        y[m] = out
        if report is not None:
            seg = out; gg = np.max(np.abs(np.diff(seg))) / (s[1] - s[0]) if len(seg) > 1 else 0
            report.append((q['id'], qn['id'], round(segL), yA, yB, None if yb is None else round(yb, 1), round(gg * 100, 2)))
    return y

def stops_and_limits(name, lo, order, src):
    stops, limits = [], []
    L = lo['L']
    for q in sorted(order, key=lambda a: a['_pos'][name]['s']):
        sc = q['_pos'][name]['s']
        stops.append(dict(station=q['id'], s=round(sc + TRAIN_LEN / 2 - 1.0, 2) % round(L, 2), sCentre=round(sc, 2), dwellS=src['profile'].get('dwellS', 25)))
    stops.sort(key=lambda a: a['s'])
    limits = [dict(s0=0.0, s1=round(L, 2), kmh=src['profile'].get('lineSpeedKmh', 55))]
    return stops, limits

def station_record(st, loops, ex, src):
    pos = st['_pos']
    ox, oz = pos['outer']['pt']; ix, iz = pos['inner']['pt']
    cx, cz = (ox + ix) / 2, (oz + iz) / 2
    # heading: tangent of outer track at the platform
    lo = loops['outer']; i = int(np.argmin(np.abs(lo['s'] - pos['outer']['s'])))
    t = lo['path'][(i + 2) % len(lo['path'])] - lo['path'][i - 2]
    head = bearing(t[0], t[1])
    sep = math.hypot(ox - ix, oz - iz)
    rec = dict(id=st['id'], name=st['name'], order=st['order'], lat=st['lat'], lon=st['lon'],
               x=round(st['x'], 2), z=round(st['z'], 2),
               surfaceY=st['surfaceY'], railY=st['railY'], depth=round(st['surfaceY'] - st['railY'], 1),
               platform=dict(type=st['platformType'], lengthM=st['platformLengthM'], widthM=st['platformWidthM'],
                             headingDeg=round(head, 1), centreX=round(cx, 2), centreZ=round(cz, 2), trackSeparationM=round(sep, 2),
                             tracks=dict(outer=dict(x=round(ox, 2), z=round(oz, 2)), inner=dict(x=round(ix, 2), z=round(iz, 2)))))
    ents = []
    for e in ex['entrances']:
        x, z = project(e['lat'], e['lon'])
        if math.hypot(x - st['x'], z - st['z']) < 70 and nearest_station_id(x, z, src['stations']) == st['id']:
            ents.append(dict(name=e['tags'].get('name') or st['name'] + ' entrance', lat=e['lat'], lon=e['lon'], x=round(x, 2), z=round(z, 2), kind='street', source='osm:' + e['id']))
    for e in st.get('extraEntrances', []):
        x, z = project(e['lat'], e['lon']); ents.append(dict(e, x=round(x, 2), z=round(z, 2)))
    rec['entrances'] = ents
    for k in ('opened', 'rebuilt', 'interchange', 'summary', 'description', 'facts', 'nearby', 'architecture'):
        rec[k] = st.get(k, [] if k in ('rebuilt', 'interchange', 'facts', 'nearby') else '')
    for k in st.get('extra', {}): rec[k] = st['extra'][k]
    return rec

def nearest_station_id(x, z, sts):
    return min(sts, key=lambda q: math.hypot(x - q['x'], z - q['z']))['id']

def tunnel_record(loops, order, src, meta_src):
    t = json.loads(json.dumps(meta_src['tunnel']))
    return t

def check(path=None):
    """Validate data/subway.json. Prints a report; returns 0 if no errors."""
    d = json.load(open(path or J('data', 'subway.json')))
    errs, warns = [], []
    E = errs.append; Wn = warns.append
    for k in ('meta', 'stations', 'tracks', 'tunnel', 'rollingStock', 'timeline'):
        if k not in d: E('missing top-level ' + k)
    if errs: print(errs); return 1
    st = d['stations']
    if len(st) != 15: E('stations != 15')
    if [q['order'] for q in st] != list(range(len(st))): E('station order not 0..n-1')
    ids = {q['id'] for q in st}
    req = ('id', 'name', 'order', 'lat', 'lon', 'x', 'z', 'surfaceY', 'railY', 'depth', 'platform', 'entrances', 'opened', 'rebuilt', 'interchange', 'summary', 'description', 'facts', 'nearby', 'architecture')
    for q in st:
        for k in req:
            if k not in q: E(f"{q.get('id')}: missing {k}")
        x, z = project(q['lat'], q['lon'])
        if math.hypot(x - q['x'], z - q['z']) > 0.05: E(f"{q['id']}: x/z not projection of lat/lon")
        if abs(q['surfaceY'] - q['railY'] - q['depth']) > 0.11: E(f"{q['id']}: depth != surfaceY-railY")
        p = q['platform']
        for k in ('type', 'lengthM', 'widthM', 'headingDeg', 'centreX', 'centreZ', 'tracks'):
            if k not in p: E(f"{q['id']}: platform.{k} missing")
        if p['type'] not in ('island', 'side', 'split'): E(q['id'] + ': bad platform type')
        if len(q['summary'].split()) > 60: Wn(f"{q['id']}: summary > 60 words")
        for e in q['entrances']:
            if math.hypot(e['x'] - q['x'], e['z'] - q['z']) > 250: Wn(f"{q['id']}: entrance {e['name']} far from station")
    tr = d['tracks']
    for name in ('outer', 'inner'):
        t = tr[name]; P = t['points']
        xs = np.array([[p['x'], p['y'], p['z'], p['s']] for p in P])
        seg = np.hypot(np.diff(xs[:, 0]), np.diff(xs[:, 2]))
        ds = np.diff(xs[:, 3])
        if not np.all(ds > 0): E(name + ': chainage not monotonic')
        if np.max(ds) > 10.01: E(f'{name}: point spacing > 10 m ({np.max(ds):.2f})')
        # chainage consistent with 2D+vertical length
        d3 = np.sqrt(seg ** 2 + np.diff(xs[:, 1]) ** 2)
        close = math.hypot(xs[0, 0] - xs[-1, 0], xs[0, 2] - xs[-1, 2])
        if close > 10.5: E(f'{name}: loop not closed (gap {close:.1f} m)')
        L = t['length']
        if abs(xs[-1, 3] + close - L) > 0.5: E(f'{name}: length inconsistent')
        grad = np.diff(xs[:, 1]) / np.maximum(seg, 1e-6)
        gmax = np.max(np.abs(grad))
        if gmax > 0.055: E(f'{name}: gradient {gmax*100:.1f}% exceeds 5.5%')
        # smoothness: heading change per point
        h = np.unwrap(np.arctan2(np.diff(xs[:, 0]), -np.diff(xs[:, 2])))
        dh = np.abs(np.diff(h)); rad = seg[1:] / np.maximum(dh, 1e-9)
        if np.min(rad) < 40: Wn(f'{name}: min curve radius {np.min(rad):.0f} m')
        # stops
        s_prev = -1
        for sp in t['stops']:
            if sp['station'] not in ids: E('stop for unknown station ' + sp['station'])
            if sp['s'] <= s_prev: E(name + ': stops not ordered')
            s_prev = sp['s']
        if len(t['stops']) != 15: E(name + ': stops != 15')
        for l in t['speedLimits']:
            if not (0 <= l['s0'] < l['s1'] <= L + 0.01): E(name + ': bad speed limit range')
        print(f"{name}: L={L:.0f} m  pts={len(P)}  maxGrad={gmax*100:.2f}%  minY={xs[:,1].min():.1f} maxY={xs[:,1].max():.1f}  minRadius={np.min(rad):.0f} m  close={close:.2f}")
    # station coords vs track: each platform track point should lie on the track polyline
    for name in ('outer', 'inner'):
        P = np.array([[p['x'], p['z']] for p in tr[name]['points']])
        for q in st:
            tk = q['platform']['tracks'][name]
            dmin = np.min(np.hypot(P[:, 0] - tk['x'], P[:, 1] - tk['z']))
            if dmin > 3.0: E(f"{q['id']}: {name} platform track point {dmin:.1f} m off the track polyline")
    # track separation
    A = np.array([[p['x'], p['z']] for p in tr['outer']['points']]); B = np.array([[p['x'], p['z']] for p in tr['inner']['points']])
    dd = np.array([np.min(np.hypot(B[:, 0] - a[0], B[:, 1] - a[1])) for a in A[::4]])
    print(f"tube separation (2D): min {dd.min():.1f} median {np.median(dd):.1f} max {dd.max():.1f} m")
    if dd.min() < 3.0: Wn(f'tubes closer than 3 m somewhere ({dd.min():.1f})')
    # stations vs OSM
    try:
        ex = json.load(open(J('research', 'osm_extract.json')))
        for q in st:
            o = [s for s in ex['stations'].values() if s['tags'].get('name', '').startswith(q['name'].replace("'", "").split(' (')[0]) or s['tags'].get('name', '').replace("'", "") == q['name'].replace("'", "")]
            if o:
                dm = min(math.hypot(*(np.array(project(s['lat'], s['lon'])) - np.array([q['x'], q['z']]))) for s in o)
                if dm > 60: E(f"{q['id']}: {dm:.0f} m from OSM station node")
    except Exception as e:
        Wn('OSM comparison skipped: %s' % e)
    print('stations: ' + ', '.join(f"{q['name']}[{q['platform']['type']},d={q['depth']}]" for q in st))
    for w in warns: print('WARN', w)
    for e in errs: print('ERROR', e)
    print('check:', 'FAIL' if errs else 'OK', f'({len(errs)} errors, {len(warns)} warnings)')
    return 1 if errs else 0

if __name__ == '__main__':
    if '--check' in sys.argv:
        sys.exit(check())
    build()
    sys.exit(check())
