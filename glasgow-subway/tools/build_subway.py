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
TRAIN_LEN = 39.3   # m, Stadler set (see research notes)
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

def resample_closed(xz, ds, sigma, start=None):
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
    n = max(8, int(round(L2 / ds))); t0 = 0.0
    if start is not None:
        t0 = nearest_s(q, sl[:-1], np.asarray(start))[0]
    tt = (t0 + np.arange(n) * (L2 / n)) % L2
    order_ = np.argsort(tt); 
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
def locate(st, lo, ex_stops):
    """station position on a loop: stop_position node (<4 m from loop) if present, else station node. -> (s, dist, pt)"""
    best = None
    for sp in ex_stops:
        p = np.array(project(sp['lat'], sp['lon']))
        s_, d, pr = nearest_s(lo['path'], lo['s'], p)
        if d < 4.0 and (best is None or d < best[1]): best = (s_, d, pr)
    if best is None:
        p = np.array([st['x'], st['z']]); best = nearest_s(lo['path'], lo['s'], p)
    return best

def s_array(path):
    seg = np.hypot(*np.diff(np.vstack([path, path[:1]]), axis=0).T)
    return np.concatenate([[0], np.cumsum(seg)[:-1]]), seg.sum()

def resample_from(xz, ds, sigma, start):
    path, L = resample_closed(xz, ds, sigma, start)
    return path, L

def build():
    ex = load(('research', 'osm_extract.json'))
    src = load(('research', 'stations_src.json'))
    meta_src = load(('research', 'meta_src.json'))
    crossings = load(('research', 'crossings.json'))
    st_src = src['stations']
    cw, acw = chain_loops(ex['ways'])
    for st in st_src:
        o = ex['stations'][st['osmNode']]
        st['lat'], st['lon'] = o['lat'], o['lon']
        st['x'], st['z'] = project(o['lat'], o['lon'])
        st['_stops'] = [sp for sp in ex['stops'] if sp['tags'].get('name', '').lower().replace("'", '').startswith(st['osmStopName'].lower().replace("'", ''))]
    bch = [x for x in st_src if x['id'] == 'buchanan-street'][0]
    loops = {}
    for name, lp in (('outer', cw), ('inner', acw)):
        xz = np.array([(p['x'], p['z']) for p in lp['P']])
        if np.hypot(*(xz[-1] - xz[0])) < 0.01: xz = xz[:-1]
        # first pass to find Buchanan stop, second pass restart exactly there
        path, L = resample_closed(xz, DS, SMOOTH_SIGMA)
        lo = dict(path=path, L=L); lo['s'], _ = s_array(path)
        sB, dB, pB = locate(bch, lo, bch['_stops'])
        path, L = resample_closed(xz, DS, SMOOTH_SIGMA, start=np.array(pB))
        lo = dict(path=path, L=L); lo['s'], lo['L'] = s_array(path)
        loops[name] = lo
    for st in st_src:
        st['_pos'] = {}
        for name, lo in loops.items():
            s_, d, pr = locate(st, lo, st['_stops'])
            st['_pos'][name] = dict(s=s_, d=d, pt=pr)
    order = sorted(st_src, key=lambda q: q['order'])
    # river crossings -> chainage on each loop
    for k, c in crossings.items():
        c['s'] = {}
        for name, lo in loops.items():
            c['s'][name] = nearest_s(lo['path'], lo['s'], np.array([c['x'], c['z']]))[0]
    src['_crossings'] = crossings
    for name, lo in loops.items():
        rep = []; lo['y'] = profile_for(name, lo, order, src, rep); lo['rep'] = rep
        if name == 'outer' and '-v' in sys.argv:
            for r in rep: print('  seg', r)
    tracks = {}
    for name, lo in loops.items():
        path, s, y = lo['path'], lo['s'], lo['y']
        pts = [dict(x=round(float(path[i, 0]), 3), y=round(float(y[i]), 3), z=round(float(path[i, 1]), 3), s=round(float(s[i]), 2)) for i in range(len(path))]
        stops = stops_for(name, lo, order, src)
        limits = speed_limits(name, lo, stops, src)
        tracks[name] = dict(name='Outer Circle' if name == 'outer' else 'Inner Circle',
                            direction='clockwise' if name == 'outer' else 'anticlockwise',
                            closed=True, length=round(lo['L'], 2), spacingM=DS,
                            note='Last point is one spacing short of closing on the first (closed loop); s is metres along the direction of travel from the Buchanan Street platform centre.',
                            points=pts, stops=stops, speedLimits=limits)
    stations = [station_record(st, loops, ex, src) for st in order]
    tun = tunnel_record(loops, order, src, meta_src, ex, crossings)
    out = dict(meta=dict(meta_src['meta'], generated=datetime.date.today().isoformat(),
                         length_km=round(sum(loops[k]['L'] for k in loops) / 2 / 1000, 3)),
               stations=stations, tracks=tracks, tunnel=tun,
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
        if k.get('crossing'):
            cs = src['_crossings'][k['crossing']]['s'][name]
            fb = min(0.9, max(0.1, ((cs - a0) % L) / F))
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

def stops_for(name, lo, order, src):
    L = lo['L']; stops = []
    for q in sorted(order, key=lambda a: a['_pos'][name]['s']):
        sc = q['_pos'][name]['s']
        stops.append(dict(station=q['id'], s=round((sc + TRAIN_LEN / 2 - 1.0) % L, 2), sCentre=round(sc, 2), dwellS=src['profile'].get('dwellS', 25)))
    stops.sort(key=lambda a: a['s'])
    return stops

def speed_limits(name, lo, stops, src):
    """Estimated line speed limits (km/h): <=55 line speed, curve limit v=sqrt(0.9*R), 35 km/h on platform approach/departure,
    30 km/h in the Govan-Ibrox depot-junction zone. Piecewise, covers [0,L]."""
    path, s, L = lo['path'], lo['s'], lo['L']
    n = len(path)
    t = np.roll(path, -1, axis=0) - np.roll(path, 1, axis=0)
    h = np.unwrap(np.arctan2(t[:, 0], -t[:, 1]))
    ds = DS
    # curvature over ~30 m window
    k = np.abs(np.gradient(gaussian_filter1d(h, 3, mode='nearest'), ds))
    lim = np.minimum(55.0, np.maximum(25.0, 3.6 * np.sqrt(0.9 / np.maximum(k, 1e-6))))
    lim = np.minimum(lim, src['profile'].get('lineSpeedKmh', 55))
    for st in stops:
        sc = st['sCentre']
        d = (s - sc + L / 2) % L - L / 2
        lim = np.where((d > -110) & (d < 60), np.minimum(lim, 35.0), lim)
        lim = np.where((d > -45) & (d < 25), np.minimum(lim, 25.0), lim)
    # quantise to 5 km/h (round down) and merge runs
    q = np.floor(lim / 5.0) * 5.0
    out = []; i0 = 0
    for i in range(1, n + 1):
        if i == n or q[i] != q[i0]:
            out.append(dict(s0=round(float(s[i0]), 2), s1=round(float(s[i]) if i < n else float(L), 2), kmh=float(q[i0]))); i0 = i
    return out

def station_record(st, loops, ex, src):
    pos = st['_pos']
    lo = loops['outer']; li = loops['inner']
    ox, oz = pos['outer']['pt']
    # inner track: closest point of inner loop to the outer platform point (perpendicular across the platform)
    d = np.hypot(li['path'][:, 0] - ox, li['path'][:, 1] - oz); j = int(np.argmin(d))
    _, _, ip = nearest_s(li['path'], li['s'], np.array([ox, oz])); ix, iz = ip
    cx, cz = (ox + ix) / 2, (oz + iz) / 2
    i = int(np.argmin(np.abs(lo['s'] - pos['outer']['s'])))
    t = lo['path'][(i + 2) % len(lo['path'])] - lo['path'][i - 2]
    head = bearing(t[0], t[1])
    sep = math.hypot(ox - ix, oz - iz)
    rec = dict(id=st['id'], name=st['name'], order=st['order'], lat=st['lat'], lon=st['lon'],
               x=round(st['x'], 2), z=round(st['z'], 2),
               surfaceY=st['surfaceY'], railY=st['railY'], depth=round(st['surfaceY'] - st['railY'], 1),
               platform=dict(type=st['platformType'], lengthM=st['platformLengthM'], widthM=st['platformWidthM'],
                             headingDeg=round(head, 1), centreX=round(cx, 2), centreZ=round(cz, 2), trackSeparationM=round(sep, 2),
                             tracks=dict(outer=dict(x=round(ox, 2), z=round(oz, 2)), inner=dict(x=round(ix, 2), z=round(iz, 2))),
                             sOuter=round(pos['outer']['s'], 2), sInner=round(pos['inner']['s'], 2)))
    ents = []
    for e in ex['entrances']:
        x, z = project(e['lat'], e['lon'])
        if math.hypot(x - st['x'], z - st['z']) < 90 and nearest_station_id(x, z, src['stations']) == st['id']:
            ents.append(dict(name=e['tags'].get('name') or st['name'], lat=e['lat'], lon=e['lon'], x=round(x, 2), z=round(z, 2), kind='street', source='osm:' + e['id']))
    # sensible naming / de-dup of entrances closer than 3 m
    ded = []
    for e in ents:
        if all(math.hypot(e['x'] - o['x'], e['z'] - o['z']) > 3 for o in ded): ded.append(e)
    ents = ded
    for n_, e in enumerate(ents): e['name'] = f"{st['name']} entrance {n_ + 1}" if len(ents) > 1 else f"{st['name']} entrance"
    if not ents:
        # no OSM entrance node: station building/stair near the platform centre line; mark approximate
        bx, bz = st['x'], st['z']
        for b in ex.get('platforms', []):
            nm = b['tags'].get('name', '').lower().replace('.', '').replace("'", '')
            if st['name'].lower().replace("'", '') in nm:
                la = sum(p['lat'] for p in b['nodes']) / len(b['nodes']); lo_ = sum(p['lon'] for p in b['nodes']) / len(b['nodes'])
                bx, bz = project(la, lo_)
        la_, lo__ = unproject(bx, bz)
        ents.append(dict(name=st['name'] + ' station building', lat=round(la_, 6), lon=round(lo__, 6), x=round(bx, 2), z=round(bz, 2), kind='station-building', source='approximate (OSM station node/building; no entrance node mapped)'))
    # tag the St Enoch listed building
    if st['id'] == 'st-enoch':
        for e in ents:
            if e['source'] == 'osm:3924017858': e['kind'] = 'station-building'; e['name'] = 'St Enoch Square station building (James Miller, 1896)'
    rec['entrances'] = ents
    for k in ('opened', 'rebuilt', 'interchange', 'summary', 'description', 'facts', 'nearby', 'architecture'):
        rec[k] = st.get(k, [] if k in ('rebuilt', 'interchange', 'facts', 'nearby') else '')
    rec.update(st.get('extra', {}))
    return rec

def nearest_station_id(x, z, sts):
    return min(sts, key=lambda q: math.hypot(x - q['x'], z - q['z']))['id']

def tunnel_record(loops, order, src, meta_src, ex, crossings):
    t = json.loads(json.dumps(meta_src['tunnel']))
    rc = []
    for k, c in crossings.items():
        by = c.get('bedY')
        rc.append(dict(id=k, name=c['name'], lat=c['lat'], lon=c['lon'], x=c['x'], z=c['z'], widthM=c['widthM'],
                       outer=dict(s0=round(c['s']['outer'] - c['widthM'] / 2, 1), s1=round(c['s']['outer'] + c['widthM'] / 2, 1)),
                       inner=dict(s0=round(c['s']['inner'] - c['widthM'] / 2, 1), s1=round(c['s']['inner'] + c['widthM'] / 2, 1)),
                       s0=round(c['s']['outer'] - c['widthM'] / 2, 1), s1=round(c['s']['outer'] + c['widthM'] / 2, 1),
                       bedY=c.get('bedY'), clearanceBelowBedM=c.get('clearanceBelowBedM'), estimated=True))
    t['riverCrossings'] = rc
    # depot: from OSM yard ways
    pts = []
    for w in ex['ways'].values():
        if w['tags'].get('service') == 'yard':
            pts += [project(n['lat'], n['lon']) for n in w['nodes'] if 55.8588 < n['lat'] < 55.8620]
    pts = np.array(pts)
    d = t.get('depot', {})
    if len(pts):
        cx, cz = pts.mean(axis=0); la, lo_ = unproject(cx, cz)
        d.update(lat=round(la, 6), lon=round(lo_, 6), x=round(float(cx), 1), z=round(float(cz), 1),
                 bounds=dict(minX=round(float(pts[:, 0].min()), 1), maxX=round(float(pts[:, 0].max()), 1), minZ=round(float(pts[:, 1].min()), 1), maxZ=round(float(pts[:, 1].max()), 1)))
        # junction: loop point nearest the yard
        jx, jz = project(55.85897, -4.30850)   # OSM node where the depot ramp tunnel leaves the running tunnels (Ibrox-Govan)
        d['junction'] = dict(lat=55.85897, lon=-4.3085, x=round(jx, 1), z=round(jz, 1))
        for name in ('outer', 'inner'):
            lo = loops[name]; dd = np.hypot(lo['path'][:, 0] - jx, lo['path'][:, 1] - jz); i = int(np.argmin(dd))
            d.setdefault('nearestTrack', {})[name] = dict(s=round(float(lo['s'][i]), 1), distM=round(float(dd[i]), 1))
    t['depot'] = d
    seps = []
    A = loops['outer']['path']; B = loops['inner']['path']
    for p in A[::4]: seps.append(np.min(np.hypot(*(B - p).T)))
    t['tubeSeparationM'] = round(float(np.median(seps)), 1)
    t['tubeSeparationRangeM'] = [round(float(min(seps)), 1), round(float(max(seps)), 1)]
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
