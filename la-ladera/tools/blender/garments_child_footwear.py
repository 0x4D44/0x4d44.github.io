"""Original, empty footwear objects for the child garment pipeline.

Pure geometry in the existing game convention: metres, +Y up, +Z toward the
rounded toe. The reference pair is 0.31 m long; the caller applies .55/.75
child sizes. No texture or material is introduced: grayscale linear vertex
shading multiplies the shared adult laundry palette.
"""
import math


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


class _Mesh:
    def __init__(self):
        self.vertices, self.faces, self.uv, self.shades = [], [], [], []
        self.centre = 0.0

    def point(self, p, shade):
        self.vertices.append(tuple(p))
        self.uv.append((max(0.0, min(1.0, (p[0] - self.centre + .06) / .12)), max(0.0, min(1.0, (p[2] + .155) / .31))))
        self.shades.append(shade)
        return len(self.vertices) - 1

    def loop(self, positions, shade):
        return [self.point(p, shade) for p in positions]

    def bridge(self, a, b):
        assert len(a) == len(b)
        for j in range(len(a)):
            k = (j + 1) % len(a)
            self.faces.extend(((a[j], a[k], b[k]), (a[j], b[k], b[j])))

    def cap(self, loop, reverse=False):
        for j in range(1, len(loop) - 1):
            self.faces.append((loop[0], loop[j + 1], loop[j]) if reverse else (loop[0], loop[j], loop[j + 1]))

    def finish(self):
        for face in self.faces:
            a, b, c = (self.vertices[i] for i in face)
            normal = _cross(_sub(b, a), _sub(c, a))
            if _dot(normal, normal) <= 1e-20:
                raise ValueError('Degenerate child footwear triangle')
        return self.vertices, self.faces, self.uv, self.shades


def _outline(centre, count, y, scale=1.0):
    # Wider toe/forefoot, slightly narrower heel; even ring counts include exact
    # toe and heel extrema. Both shoes have an ordinary rounded symmetrical last.
    points = []
    for j in range(count):
        angle = 2 * math.pi * j / count
        width = .0505 + .002 * math.cos(angle)
        points.append((centre + scale * width * math.sin(angle), y, scale * .155 * math.cos(angle)))
    return points


def _sole(mesh, count, sandal=False):
    bottom = mesh.loop(_outline(mesh.centre, count, 0.0), .29 if sandal else .27)
    top = mesh.loop(_outline(mesh.centre, count, .024 if sandal else .022), .48 if sandal else .43)
    mesh.bridge(bottom, top)
    mesh.cap(bottom, reverse=True)
    mesh.cap(top)
    return top


def _school_shoe(mesh, low):
    count = 8 if low else 16
    _sole(mesh, count)
    lower_points = _outline(mesh.centre, count, .022, .96)
    lower = mesh.loop(lower_points, .70)
    mouth_points = []
    for j in range(count):
        angle = 2 * math.pi * j / count
        mouth_points.append((mesh.centre + .0315 * math.sin(angle), .078 + .003 * math.cos(angle), -.066 + .050 * math.cos(angle)))
    if low:
        collar = mesh.loop(mouth_points, .85)
        mesh.bridge(lower, collar)
    else:
        middle_points = []
        for j, (a, b) in enumerate(zip(lower_points, mouth_points)):
            angle = 2 * math.pi * j / count
            middle_points.append((a[0] * .65 + b[0] * .35, .050 + .009 * (1 - math.cos(angle)) / 2, a[2] * .65 + b[2] * .35))
        middle = mesh.loop(middle_points, .91)
        collar = mesh.loop(mouth_points, .86)
        mesh.bridge(lower, middle)
        mesh.bridge(middle, collar)
    inner_points = [(mesh.centre + (p[0] - mesh.centre) * .87, p[1] - .002, -.066 + (p[2] + .066) * .90) for p in mouth_points]
    inner = mesh.loop(inner_points, .40)
    mesh.bridge(collar, inner)
    cavity = mesh.loop([(p[0], .036, p[2]) for p in inner_points], .25)
    mesh.bridge(inner, cavity)
    # Raised tongue at the instep; the remaining collar is an actual opening.
    tongue = mesh.loop([(mesh.centre - .022, .076, -.019), (mesh.centre + .022, .076, -.019),
                        (mesh.centre + .025, .065, .023), (mesh.centre + .022, .051, .061),
                        (mesh.centre - .022, .051, .061), (mesh.centre - .025, .065, .023)], .89)
    mesh.cap(tongue, reverse=True)
    if not low:
        # Three small unbranded fastening/lace bars, lying on the tongue.
        for z, y, width in ((-.008, .074, .038), (.017, .068, .044), (.040, .059, .043)):
            band = mesh.loop([(mesh.centre - width / 2, y, z - .003), (mesh.centre - width / 2, y, z + .003),
                              (mesh.centre + width / 2, y, z + .003), (mesh.centre + width / 2, y, z - .003)], .39)
            mesh.cap(band)


def _sweep(mesh, centres, sides, normals, shade, low=False, reverse=False):
    """A narrow curved strap; detail meshes include thickness and capped ends."""
    if low:
        left, right = [], []
        for p, side, normal in zip(centres, sides, normals):
            left.append(mesh.point(tuple(p[k] - side[k] + normal[k] for k in range(3)), shade))
            right.append(mesh.point(tuple(p[k] + side[k] + normal[k] for k in range(3)), shade))
        for j in range(len(centres) - 1):
            faces = [(left[j], left[j + 1], right[j + 1]), (left[j], right[j + 1], right[j])]
            mesh.faces.extend(tuple(reversed(f)) if reverse else f for f in faces)
        # The library material is front-sided. Preserve the strap's underside
        # using distinct inset vertices, so normals do not cancel on coincident
        # reverse faces and the rear/inner opening remains visible at distance.
        back_left, back_right = [], []
        for p, side, normal in zip(centres, sides, normals):
            back_left.append(mesh.point(tuple(p[k] - side[k] - normal[k] for k in range(3)), shade * .78))
            back_right.append(mesh.point(tuple(p[k] + side[k] - normal[k] for k in range(3)), shade * .78))
        for j in range(len(centres) - 1):
            faces = [(back_left[j], back_left[j + 1], back_right[j + 1]), (back_left[j], back_right[j + 1], back_right[j])]
            mesh.faces.extend(f if reverse else tuple(reversed(f)) for f in faces)
        # Cap the two visibly exposed strap ends. This costs four triangles per
        # strap and keeps the complete LOD pair within 160 triangles.
        for j in (0, len(centres) - 1):
            loop = [left[j], back_left[j], back_right[j], right[j]]
            tangent = _sub(centres[1], centres[0]) if j == 0 else _sub(centres[-1], centres[-2])
            wanted = tuple(-x for x in tangent) if j == 0 else tangent
            a, b, c = (mesh.vertices[i] for i in loop[:3])
            if _dot(_cross(_sub(b, a), _sub(c, a)), wanted) < 0:
                loop.reverse()
            mesh.cap(loop)
        return
    loops = []
    for j, (p, side, normal) in enumerate(zip(centres, sides, normals)):
        points = [tuple(p[k] + side[k] + normal[k] for k in range(3)),
                  tuple(p[k] + side[k] - normal[k] for k in range(3)),
                  tuple(p[k] - side[k] - normal[k] for k in range(3)),
                  tuple(p[k] - side[k] + normal[k] for k in range(3))]
        tangent = _sub(centres[min(j + 1, len(centres) - 1)], centres[max(j - 1, 0)])
        normal_to_ring = _cross(_sub(points[1], points[0]), _sub(points[2], points[0]))
        if _dot(normal_to_ring, tangent) < 0:
            points.reverse()
        loops.append(mesh.loop(points, shade))
    for a, b in zip(loops, loops[1:]):
        mesh.bridge(a, b)
    mesh.cap(loops[0], reverse=True)
    mesh.cap(loops[-1])


def _sandal(mesh, low):
    _sole(mesh, 8 if low else 16, sandal=True)
    segments = 3 if low else 5
    for z, half_width, height in ((.073, .043, .025), (-.022, .047, .039)):
        centres, sides, normals = [], [], []
        for j in range(segments + 1):
            a = math.pi * j / segments
            centres.append((mesh.centre - half_width * math.cos(a), .029 + height * math.sin(a), z))
            sides.append((0, 0, .014))
            dx, dy = half_width * math.sin(a), height * math.cos(a)
            length = math.hypot(dx, dy)
            normals.append((-dy / length * .0018, dx / length * .0018, 0))
        _sweep(mesh, centres, sides, normals, .89, low, reverse=True)
    # The rear U-shaped band rises from the sole and leaves heel, ankle and toe
    # empty. There is no foot mesh or hidden filler under the forefoot straps.
    segments = 4 if low else 5
    centres, sides, normals = [], [], []
    for j in range(segments + 1):
        a = math.pi / 2 + math.pi * j / segments
        centres.append((mesh.centre + .042 * math.sin(a), .045, -.080 + .057 * math.cos(a)))
        sides.append((0, .018, 0))
        normals.append((math.sin(a) * .0018, 0, math.cos(a) * .0018))
    _sweep(mesh, centres, sides, normals, .76, low)


def geometry(ident, low=False):
    """Return vertices, triangle faces, unit UVs and linear gray vertex shades."""
    if ident not in ('school_shoes', 'sandals'):
        raise ValueError(f'Unsupported child footwear {ident!r}')
    mesh = _Mesh()
    for centre in (-.065, .065):
        mesh.centre = centre
        (_school_shoe if ident == 'school_shoes' else _sandal)(mesh, low)
    result = mesh.finish()
    if len(mesh.faces) > (160 if low else 420):
        raise ValueError(f'{ident}: footwear triangle budget exceeded: {len(mesh.faces)}')
    return result
