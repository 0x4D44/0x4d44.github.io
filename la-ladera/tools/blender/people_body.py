"""Original CC0-1.0 body tailoring for the existing La Ladera resident rig.

These are authored surfaces, not a new skeleton. A trouser rise branches into
two legs along one shared crotch seam, instead of hiding capped thigh cylinders
inside a capped pelvis. Cloth folds have a wavelength in metres and are sampled
in the mesh; texture normals supply the much smaller yarn structure.
"""
import math


def blend(a, b, t):
    return a + (b - a) * t


def clamp(x):
    return max(0.0, min(1.0, x))


def smooth(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def row_at(rows, z):
    if z <= rows[0][0]:
        return rows[0]
    for a, b in zip(rows, rows[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / max(1e-8, b[0] - a[0])
            return tuple(blend(a[j], b[j], t) for j in range(4))
    return rows[-1]


def mesh_loft(pb, rings, part, colour, fabric, closed=True, cache=None):
    def vertex(co):
        tag = part(co) if callable(part) else part
        if cache is None:
            return pb.V(co, tag)
        key = tuple(round(c, 7) for c in co)
        if key not in cache:
            cache[key] = pb.V(co, tag)
        return cache[key]
    vs = [[vertex(p) for p in r] for r in rings]
    n = len(rings[0])
    for low, high in zip(vs, vs[1:]):
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            face = (low[i], low[j], high[j], high[i])
            if len(set(face)) >= 3:
                pb.F(tuple(dict.fromkeys(face)), colour, True, fab_=fabric)
    return vs


def piping(pb, points, width, part, colour, fabric, sides=5):
    """Small round seam, with rings perpendicular to its centreline."""
    from mathutils import Vector
    loops = []
    for j, p in enumerate(points):
        p = Vector(p)
        tangent = Vector(points[min(j + 1, len(points) - 1)]) - Vector(points[max(j - 1, 0)])
        tangent.normalize()
        ref = Vector((0, 0, 1)) if abs(tangent.z) < .9 else Vector((0, 1, 0))
        u = tangent.cross(ref).normalized()
        v = tangent.cross(u).normalized()
        loops.append([tuple(p + width * (math.cos(i * math.tau / sides) * u + math.sin(i * math.tau / sides) * v)) for i in range(sides)])
    mesh_loft(pb, loops, part, colour, fabric)


def garment_hem(P, pd, rows):
    H, k = P['H'], P['k']
    style = pd['top_style']
    tucked = pd.get('top_tucked', style == 'shirt')
    if style in ('jacket', 'puffer', 'coat', 'labcoat', 'dress') or pd['bot_style'] == 'skirt':
        return rows[0][0]
    return H * .614 + .018 * k if tucked else P['hip'] - .047 * k


def torso_point(P, pd, rows, layer, lean, z, a):
    """The same fitted surface is used for the shell, pockets and placket."""
    H,k=P['H'],P['k']; hem=garment_hem(P,pd,rows)
    tucked=pd.get('top_tucked',pd['top_style']=='shirt')
    _,rx,ry,cy=row_at(rows,z)
    ca,sa=math.cos(a),math.sin(a)
    rib=1+.035*math.cos(2*a)*math.exp(-((z-H*.72)/(.1*k))**2)
    waist_fold=(.0038 if tucked else .0027)*k*math.exp(-((z-hem-.045*k)/(.065*k))**2)
    fold=waist_fold*math.sin(a*7+z*37/k)
    side=.0023*k*math.cos(a*5+z*17/k)*math.exp(-((z-H*.66)/(.19*k))**2)
    ease=.007*k*math.exp(-((z-hem)/(.07*k))**2) if not tucked else 0
    return ((rx*layer+ease+fold+side)*ca,
            cy+lean(z)+(ry*layer*rib+ease*.7+fold)*sa,
            z-.008*k*ca*ca*math.exp(-((z-P['sh'])/(.06*k))**2))


def torso_front(P,pd,rows,layer,lean,x,z,off=.008):
    lo,hi=0.,math.pi
    for _ in range(14):
        a=(lo+hi)*.5
        p=torso_point(P,pd,rows,layer,lean,z,a)
        if p[0]>x:lo=a
        else:hi=a
    p=torso_point(P,pd,rows,layer,lean,z,(lo+hi)*.5)
    return (x,p[1]+off*P['k'],p[2])


def torso_shell(pb, P, pd, rows, raw_rings, top_fabric, layer, lean, lod=False):
    """A garment ends at its own hem; no trouser-coloured torso or bottom cap."""
    H,k=P['H'],P['k']
    tucked=pd.get('top_tucked',pd['top_style']=='shirt')
    hem=garment_hem(P,pd,rows)
    # Add samples at the tension folds, rolled hem and shoulder saddle. Keep the
    # old twenty angular samples, shared by the tested reflective vest.
    zs = sorted(set([r[0][2] for r in raw_rings if r[0][2] > hem] + [hem, hem + .012 * k, hem + .035 * k]))
    shoulder = P['sh']
    if not lod:
        zs = sorted(set(zs + [hem + .055 * k, shoulder - .060 * k, shoulder - .035 * k]))
    rings = []
    for z in zs:
        rings.append([torso_point(P,pd,rows,layer,lean,z,math.tau*i/20) for i in range(20)])
    mesh_loft(pb, rings, 'torso', pd['top'], top_fabric)
    # Returned cloth edge: a visible, genuine 2.5 mm hem, no coplanar strip.
    if not tucked:
        edge = rings[0]
        cy = sum(p[1] for p in edge) / len(edge)
        inner = [(x * .984, cy + (y - cy) * .978, z + .004 * k) for x, y, z in edge]
        mesh_loft(pb, [edge, inner], 'torso', pd['top'], top_fabric)
    return hem


def append_trousers(pb, P, pd, rows, fabric, lean, lod=False):
    """One connected rise and two anatomically tapered legs with open cuffs.

    The bottom of the rise is split on its sagittal diameter. Each half is a
    D-shaped leg root that becomes an oval below the crotch. The diameter's
    vertices are shared between legs, with no cap or overlapping inner faces.
    """
    H, k = P['H'], P['k']
    b = pd['build']
    child = .88 if P['child'] else 1
    hx = P['hipw'] * .52
    knee, ankle = P['knee'], P['ankle']
    style = pd['bot_style']
    if style in ('skirt', 'skirtx'):
        return append_covered_legs(pb, P, pd, lod)
    n = 24 if not lod else 12
    half = n // 2
    # At the rise the back is fuller and the front flatter. The waist still
    # meets the unchanged belt and shirt at H*.614.
    waist = H * .614 + .005 * k
    crotch = P['hip'] - .112 * k
    _, wrx, wry, wcy = row_at(rows, waist)
    hiprx = max(.178 * k * b ** .60, hx + .076 * k * child)
    hipry = .108 * k * b ** .5
    bottom_rx = max(.163 * k * b ** .42, hx + .071 * k * child)
    bottom_ry = .088 * k * b ** .45
    specs = [(waist, wrx * 1.012, wry * 1.012, wcy),
             (waist - .028 * k, wrx * 1.018, wry * 1.025, wcy),
             (P['hip'] + .065 * k, hiprx * .99, hipry, -.004 * k),
             (P['hip'], hiprx, hipry, -.006 * k),
             (crotch + .038 * k, bottom_rx * 1.04, bottom_ry * 1.055, -.003 * k),
             (crotch, bottom_rx, bottom_ry, 0)]
    tucked=pd.get('top_tucked',pd['top_style']=='shirt')
    if not tucked or pd['top_style'] in ('jacket','puffer','coat','labcoat','dress'):
        # This resident's clothes are baked into one mesh. Omit the fully
        # covered rise instead of keeping two deforming, nearly coincident
        # surfaces that can poke through an untucked shirt after reduction.
        clip=max(crotch+.020*k,garment_hem(P,pd,rows)+.018*k)
        clip=min(clip,waist)
        at=row_at(list(reversed(specs)),clip)
        specs=[(clip,at[1],at[2],at[3])]+[r for r in specs if r[0]<clip-1e-7]
    cache = {}
    def part(co):
        if co[2] > knee + .09 * k:
            return 'pants'
        return 'shin_l' if co[0] < 0 else 'shin_r'
    def rise_point(z, rx, ry, cy, a):
        ca, sa = math.cos(a), math.sin(a)
        back = 1 + .075 * max(0, -sa) * smooth((waist - z) / (.12 * k))
        return (rx * ca, cy + lean(z) * smooth((z - crotch) / (waist - crotch)) + ry * sa * back, z)
    # The split ring uses exactly this ellipse; don't add a fold to that row.
    rings = [[rise_point(z, rx, ry, cy, math.tau * j / n) for j in range(n)] for z, rx, ry, cy in specs]
    # Blend away lumbar offset/back shaping before the shared leg root.
    rings[-1] = [(bottom_rx * math.cos(math.tau*j/n), bottom_ry * math.sin(math.tau*j/n), crotch) for j in range(n)]
    mesh_loft(pb, rings, part, pd['bot'], fabric, cache=cache)
    for sg in (-1, 1):
        # Begin at back centre, go round the outer hip, then along the shared
        # sagittal seam from front to back. The opposite leg reuses that seam.
        top = []
        for j in range(n):
            a = -math.pi / 2 + math.tau * j / n
            x = sg * bottom_rx * math.cos(a) if j <= half else 0.0
            top.append((x, bottom_ry * math.sin(a), crotch))
        leg = [top]
        if style == 'shorts':
            end = knee + .095 * k
        else:
            end = ankle + .018 * k
        specs_leg = [
            (crotch - .035*k, .083*k*child*b**.35, .087*k*child*b**.25, 0),
            (crotch - .080*k, .079*k*child*b**.25, .082*k*child, 0),
            (knee + .115*k, .066*k*child, .070*k*child, .003*k),
            (knee + .052*k, .057*k*child, .059*k*child, .009*k),
            (knee + .016*k, .057*k*child, .057*k*child, .011*k),
            (knee - .017*k, .056*k*child, .055*k*child, .010*k),
            (knee - .055*k, .057*k*child, .060*k*child, .001*k),
            (knee - .105*k, .058*k*child, .066*k*child, -.009*k),
            (knee - .170*k, .054*k*child, .061*k*child, -.010*k),
            (ankle + .140*k, .045*k*child, .047*k*child, -.003*k),
            (ankle + .080*k, .040*k*child, .042*k*child, .002*k),
            (ankle + .048*k, .042*k*child, .043*k*child, .004*k),
            (end, .042*k*child, .042*k*child, .003*k)]
        specs_leg = sorted({round(z, 7):(z,rx,ry,cy) for z,rx,ry,cy in specs_leg if end <= z < crotch}.values(), reverse=True)
        if not specs_leg or abs(specs_leg[-1][0] - end) > 1e-6:
            specs_leg.append((end, .066*k*child, .070*k*child, .003*k))
        if lod:
            specs_leg = [r for i,r in enumerate(specs_leg) if i % 2 == 0 or i == len(specs_leg)-1]
        slim = .80 if style == 'leggings' else 1
        for z, rx, ry, cy in specs_leg:
            root_t = smooth((crotch - z) / (.08 * k))
            r = []
            for j in range(n):
                a = -math.pi/2 + math.tau*j/n
                ca, sa = math.cos(a), math.sin(a)
                dx = hx + rx * slim * ca
                yy = cy + ry * slim * sa
                # Compression at the knee and stacked break above the shoe.
                fold = 0 if lod else k * (.0033 * math.exp(-((z-knee)/(.075*k))**2) * math.sin((z-knee)*93/k + a*1.6)
                     + .0031 * math.exp(-((z-ankle-.06*k)/(.05*k))**2) * math.cos((z-ankle)*115/k + a*2))
                # Pinched vertical seam under the groin resolves smoothly into
                # the inner thigh, leaving a narrow gap further down the legs.
                startx, starty, _ = top[j]
                r.append((blend(startx, sg*(dx+fold*ca), root_t), blend(starty, yy+fold*sa, root_t), z))
            leg.append(r)
        mesh_loft(pb, leg, part, pd['bot'], fabric, cache=cache)
        last = leg[-1]
        cx = sg*hx
        inner = [(cx+(x-cx)*.94, y*.94, z+.005*k) for x,y,z in last]
        mesh_loft(pb, [last, inner], part, pd['bot'], fabric, cache=cache)
        if not lod and style != 'leggings':
            # Side seam lies on the real leg surface and follows its folds.
            outer_i = n//4
            pts = [(p[0]+sg*.0012*k,p[1],p[2]) for p in [r[outer_i] for r in leg[1:]]]
            if len(pts)>1:
                piping(pb,pts,.0011*k,part,pd['bot'],fabric,4)
        if style == 'shorts':
            _bare_leg(pb, P, pd, sg, end+.006*k, lod)
    if not lod and style != 'leggings' and tucked:
        # Slash pocket opening and two back patch pockets, sewn into the rise.
        def at(x,z,back=False,off=.002):
            r = min(specs, key=lambda r:abs(z-r[0]))
            _, rx, ry, cy = r
            y = math.sqrt(max(0,1-(x/rx)**2))*ry
            return (x,cy + lean(z)*smooth((z-crotch)/(waist-crotch)) + (-1 if back else 1)*(y+off*k),z)
        for sg in (-1,1):
            pocket = [at(sg*x*k,waist-d*k) for x,d in ((.105,.040),(.135,.072),(.145,.110))]
            piping(pb,pocket,.0021*k,'pants',pd['bot'],fabric)
            if style == 'jeans':
                points=[at(sg*x*k,waist-d*k,True,.007) for x,d in ((.045,.070),(.105,.070),(.108,.145),(.077,.166),(.043,.143))]
                for a,b in zip(points,points[1:]+points[:1]):
                    piping(pb,[a,b],.0011*k,'pants',pd['bot'],fabric,4)


def _bare_leg(pb, P, pd, sg, ztop, lod=False):
    k = P['k']; hx=P['hipw']*.52; knee=P['knee']; ankle=P['ankle']
    c=.88 if P['child'] else 1
    skin=pd.get('skin_hex','#ad7d5c')
    col=skin if pd['bot_style']=='shorts' else pd.get('legs','#303035')
    fabric='skin' if col==skin else 'jersey'
    specs=[(ztop,.064*k*c,.062*k*c,0),(knee+.025*k,.049*k*c,.052*k*c,.004*k),
           (knee-.025*k,.048*k*c,.050*k*c,.003*k),(knee-.11*k,.051*k*c,.061*k*c,-.012*k),
           (ankle+.12*k,.036*k*c,.041*k*c,-.004*k),(ankle+.012*k,.028*k*c,.032*k*c,0)]
    specs=[r for r in specs if r[0]<=ztop]
    n=16 if not lod else 8
    rr=[[(sg*hx+rx*math.cos(math.tau*j/n),cy+ry*math.sin(math.tau*j/n),z) for j in range(n)] for z,rx,ry,cy in specs]
    part=lambda p:('thigh' if p[2]>knee else 'shin')+('_l' if sg<0 else '_r')
    mesh_loft(pb,rr,part,col,fabric)
    if pd['bot_style']=='shorts':
        # Short sports socks with a proper rolled welt, leaving the calf visible.
        z=ankle+.075*k
        rr=[[(sg*hx+r*math.cos(math.tau*j/n),r*math.sin(math.tau*j/n),zz) for j in range(n)]
            for zz,r in ((z,.034*k*c),(z-.008*k,.035*k*c),(ankle+.005*k,.031*k*c))]
        mesh_loft(pb,rr,'shin_l' if sg<0 else 'shin_r','#dcd8c9','knit')


def append_covered_legs(pb, P, pd, lod=False):
    for sg in (-1,1):
        _bare_leg(pb,P,pd,sg,P['hip']-.01*P['k'],lod)


def garment_details(pb,P,pd,rows,layer,lean,fabric,lod=False):
    """Patch pockets, sewn yokes, subtle two-tone panels and original prints."""
    if lod:
        return
    H,k=P['H'],P['k']
    def front(x,z,off=.009):
        return torso_front(P,pd,rows,layer,lean,x,z,off)
    def patch(points, colour, fab):
        # A curved patch follows the body at its centre as well as its corners.
        # As with open cap discs, Blender can reverse an isolated surface when
        # recalculating normals; explicitly retain its outward/front direction.
        cx=sum(p[0] for p in points)/len(points)
        cz=sum(p[2] for p in points)/len(points)
        middle=pb.V(front(cx,cz),'torso')
        verts=[pb.V(p,'torso') for p in points]
        for a,b in zip(verts,verts[1:]+verts[:1]):
            face=pb.F((a,b,middle),colour,True,fab_=fab)
            if face is not None:pb.caps.append((face,(0,1,0)))
    style=pd['top_style']; top=pd['top']
    if style in ('shirt','labcoat','hoodie') and not pd.get('apron') and not pd.get('overalls'):
        z=H*.735 if style=='shirt' else H*.655
        w=.052*k if style=='shirt' else .066*k
        xc=-.075*k if style=='shirt' else 0
        if style=='hoodie':w=.105*k
        outline=[front(xc-w*.5,z),front(xc+w*.5,z),front(xc+w*.5,z-.067*k),front(xc,z-.078*k),front(xc-w*.5,z-.067*k)]
        patch(outline,top,fabric)
        for a,b in zip(outline,outline[1:]+outline[:1]):
            piping(pb,[a,b],.0012*k,'torso',top,fabric,4)
    if style in ('jacket','coat','labcoat'):
        # A sewn centre opening and two practical welt pockets make the outer
        # garment read as a jacket/coat rather than a featureless long tube.
        zs=[H*.505+(P['nbase']-.025*k-H*.505)*i/9 for i in range(10)]
        for za,zb in zip(zs,zs[1:]):
            patch([front(-.008*k,za),front(.008*k,za),front(.008*k,zb),front(-.008*k,zb)],top,fabric)
        for sg in (-1,1):
            p=[front(sg*x*k,H*f,.010) for x,f in ((.065,.622),(.092,.629),(.119,.636))]
            piping(pb,p,.0022*k,'torso',top,fabric,5)
            piping(pb,[(x,y,z-.007*k) for x,y,z in p],.0012*k,'torso',top,fabric,4)
        for f in (.74,.68,.62,.56):
            z=H*f; loops=[]
            for r,off in ((.0045,.010),(.0038,.0125)):
                loops.append([front(r*k*math.cos(math.tau*i/8),z+r*k*math.sin(math.tau*i/8),off) for i in range(8)])
            vs=mesh_loft(pb,loops,'torso','#796d5e','plastic')
            face=pb.F(vs[-1],'#796d5e',True,fab_='plastic')
            if face is not None:pb.caps.append((face,(0,1,0)))
    secondary=pd.get('top_secondary')
    if secondary and style in ('football','tshirt','hoodie'):
        # A narrow chest/yoke panel, conformed to the garment rather than a box.
        zs=[H*.746,H*.766]
        xs=[-.12*k,-.06*k,0,.06*k,.12*k]
        rr=[[front(x,z,.005) for x in xs] for z in zs]
        for i in range(len(xs)-1):
            patch([rr[0][i],rr[0][i+1],rr[1][i+1],rr[1][i]],secondary,fabric)
    if pd.get('top_print'):
        # Original botanical screen-print. Geometry is a thin fitted surface
        # applique sharing people_pbr, UV cells, skinner and draw call.
        xc=-.040*k; z=H*.716
        ink=pd.get('top_secondary','#d9caaa')
        for sg in (-1,1):
            for j in range(3):
                zz=z+j*.017*k
                outline=[front(xc,zz,.006),front(xc+sg*.021*k,zz+.012*k,.006),front(xc+sg*.028*k,zz+.006*k,.006),front(xc+sg*.014*k,zz-.002*k,.006)]
                patch(outline,ink,'cotton')
        piping(pb,[front(xc,z-.008*k,.006),front(xc,z+.05*k,.006)],.001*k,'torso',ink,'cotton',4)
