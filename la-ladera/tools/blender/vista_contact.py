"""CPU contact sheets of the *actual shipped GLB triangles*, without Blender/Chrome.

Diagnostic only: this is an orthographic, depth-buffered projection with vertex
colours and simple directional shading, not a screenshot of the game renderer.
Pillow is the only non-standard dependency. No textures or network are used.

  node la-ladera/tools/nice.mjs --below python3 la-ladera/tools/blender/vista_contact.py
  # optional: --models PATH --out .scratch/vista --columns 8

The default 1920px sheets are drawn one at a time, with no supersampling and no
NumPy, to stay below 100 MB RSS on a constrained shared machine.
"""
import argparse
from array import array
import json
import math
import os
from pathlib import Path
import struct

from PIL import Image, ImageDraw, ImageFont

IDENTITY = (1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1.)
FORMATS = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(v):
    length = math.sqrt(dot(v, v)) or 1.
    return tuple(x / length for x in v)


def multiply(a, b):
    """Column-major matrices, matching glTF and THREE.Matrix4 storage."""
    return tuple(sum(a[k*4+r] * b[c*4+k] for k in range(4)) for c in range(4) for r in range(4))


def transform(m, p):
    return tuple(m[r]*p[0] + m[4+r]*p[1] + m[8+r]*p[2] + m[12+r] for r in range(3))


def node_matrix(node):
    if 'matrix' in node:
        return tuple(node['matrix'])
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    sx, sy, sz = node.get('scale', [1, 1, 1])
    tx, ty, tz = node.get('translation', [0, 0, 0])
    return (
        (1-2*(y*y+z*z))*sx, 2*(x*y+z*w)*sx, 2*(x*z-y*w)*sx, 0.,
        2*(x*y-z*w)*sy, (1-2*(x*x+z*z))*sy, 2*(y*z+x*w)*sy, 0.,
        2*(x*z+y*w)*sz, 2*(y*z-x*w)*sz, (1-2*(x*x+y*y))*sz, 0.,
        tx, ty, tz, 1.,
    )


class GLB:
    def __init__(self, path):
        raw = Path(path).read_bytes()
        if len(raw) < 20 or struct.unpack_from('<III', raw) != (0x46546C67, 2, len(raw)):
            raise ValueError(f'Invalid GLB: {path}')
        self.doc, self.binary = None, None
        offset = 12
        while offset < len(raw):
            length, kind = struct.unpack_from('<II', raw, offset)
            chunk = raw[offset+8:offset+8+length]
            if kind == 0x4E4F534A:
                self.doc = json.loads(chunk)
            elif kind == 0x004E4942:
                self.binary = chunk
            offset += 8 + length
        if self.doc is None or self.binary is None:
            raise ValueError(f'Missing GLB JSON/BIN chunk: {path}')
        if any('uri' in b for b in self.doc.get('buffers', [])):
            raise ValueError('Diagnostic expects the self-contained vista GLBs')
        self.names = {n.get('name'): i for i, n in enumerate(self.doc['nodes'])}
        self.parents = {c: i for i, n in enumerate(self.doc['nodes']) for c in n.get('children', [])}

    def attribute(self, index):
        a = self.doc['accessors'][index]
        if 'sparse' in a:
            raise ValueError('Sparse accessors are not used by the vista generator')
        view = self.doc['bufferViews'][a['bufferView']]
        fmt, size = FORMATS[a['componentType']]
        n = COMPONENTS[a['type']]
        stride = view.get('byteStride', n*size)
        offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        unpack = struct.Struct('<' + fmt*n).unpack_from
        normal = a.get('normalized', False)
        def norm(v):
            if a['componentType'] == 5120: return max(-1., v/127.)
            if a['componentType'] == 5121: return v/255.
            if a['componentType'] == 5122: return max(-1., v/32767.)
            if a['componentType'] == 5123: return v/65535.
            return v
        for i in range(a['count']):
            row = unpack(self.binary, offset+i*stride)
            yield tuple(norm(v) for v in row) if normal else row

    def triangles(self, root_name):
        root = self.names[root_name]
        chain = []
        parent = self.parents.get(root)
        while parent is not None:
            chain.append(parent)
            parent = self.parents.get(parent)
        matrix = IDENTITY
        for index in reversed(chain):
            matrix = multiply(matrix, node_matrix(self.doc['nodes'][index]))
        def visit(index, parent_matrix):
            node = self.doc['nodes'][index]
            world = multiply(parent_matrix, node_matrix(node))
            if 'mesh' in node:
                for primitive in self.doc['meshes'][node['mesh']]['primitives']:
                    if primitive.get('mode', 4) != 4:
                        raise ValueError('Only triangle primitives are expected')
                    attrs = primitive['attributes']
                    positions = [transform(world, p) for p in self.attribute(attrs['POSITION'])]
                    colours = list(self.attribute(attrs['COLOR_0'])) if 'COLOR_0' in attrs else [(1, 1, 1, 1)]*len(positions)
                    material = self.doc.get('materials', [])[primitive['material']] if 'material' in primitive else {}
                    factor = material.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1, 1, 1, 1])
                    indices = [r[0] for r in self.attribute(primitive['indices'])] if 'indices' in primitive else list(range(len(positions)))
                    for k in range(0, len(indices), 3):
                        ids = indices[k:k+3]
                        points = [positions[i] for i in ids]
                        colour = tuple(sum(colours[i][ch] for i in ids) / 3 * factor[ch] for ch in range(3))
                        yield points, colour
            for child in node.get('children', []):
                yield from visit(child, world)
        yield from visit(root, matrix)


VIEW = unit((8., 6., 10.))
RIGHT = unit(cross((0., 1., 0.), VIEW))
UP = unit(cross(VIEW, RIGHT))
LIGHT = unit((-4., 9., 7.))


def project(p):
    return (dot(p, RIGHT), dot(p, UP), dot(p, VIEW))


def srgb(v):
    v = max(0., min(1., v))
    return int(round(255 * (12.92*v if v <= .0031308 else 1.055*v**(1/2.4)-.055)))


def font(size):
    choices = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
        'C:/Windows/Fonts/arial.ttf',
    ]
    for path in choices:
        if os.path.isfile(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def raster_triangle(pixels, depth, tile_x, tile_y, tile_w, tile_h, vertices, colour):
    """Barycentric depth per pixel. Centroid-only painter sorting hides small
    windows behind large oblique wall triangles even when their geometry is
    correctly in front; this bounded tile buffer avoids that false diagnosis.
    """
    (x0,y0,z0),(x1,y1,z1),(x2,y2,z2)=vertices
    denominator=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2)
    if abs(denominator)<1e-9:
        return
    a0,b0=(y1-y2)/denominator,(x2-x1)/denominator
    a1,b1=(y2-y0)/denominator,(x0-x2)/denominator
    c0,c1=-a0*x2-b0*y2,-a1*x2-b1*y2
    xmin=max(tile_x+8,math.floor(min(x0,x1,x2)))
    xmax=min(tile_x+tile_w-9,math.ceil(max(x0,x1,x2)))
    ymin=max(tile_y+48,math.floor(min(y0,y1,y2)))
    ymax=min(tile_y+tile_h-9,math.ceil(max(y0,y1,y2)))
    dz0,dz1=z0-z2,z1-z2
    for yy in range(ymin,ymax+1):
        w0=a0*(xmin+.5)+b0*(yy+.5)+c0
        w1=a1*(xmin+.5)+b1*(yy+.5)+c1
        index=(yy-tile_y)*tile_w+(xmin-tile_x)
        for xx in range(xmin,xmax+1):
            if w0>=-1e-8 and w1>=-1e-8 and w0+w1<=1+1e-8:
                z=z2+w0*dz0+w1*dz1
                if z>depth[index]:
                    depth[index]=z
                    pixels[xx,yy]=colour
            index+=1
            w0+=a0
            w1+=a1


def draw_sheet(models, out, placement, manifest, lod, columns):
    by_asset = {name: f['glb'] for f in manifest['files'] for name in f['assets']}
    files = {}
    tile_w, tile_h, header = 240, 224, 82
    rows = math.ceil(len(placement['pieces']) / columns)
    image = Image.new('RGB', (columns*tile_w, header+rows*tile_h), '#e8e7e1')
    draw = ImageDraw.Draw(image)
    pixels = image.load()
    title, label, small = font(23), font(14), font(12)
    draw.text((18, 10), f'La Ladera | {lod.upper()} LOD | diagnostic projection of actual GLB geometry', fill='#223137', font=title)
    draw.text((18, 44), 'Vertex colours + directional shading. Backface culling + depth buffer. Fixed oblique camera. Not a game screenshot.', fill='#4a595c', font=label)
    visible_total, triangle_total = 0, 0
    for index, p in enumerate(placement['pieces']):
        x0, y0 = (index % columns)*tile_w, header+(index // columns)*tile_h
        draw.rectangle((x0+6, y0+4, x0+tile_w-6, y0+tile_h-5), fill='#f8f7f2', outline='#d7dad4', width=1)
        draw.text((x0+14, y0+10), p['id'], font=label, fill='#223137')
        w, h, d = p['size']
        text = f"{p[lod+'Triangles']} tris  |  {w:g} x {h:g} x {d:g} m"
        draw.text((x0+14, y0+29), text, font=small, fill='#596764')
        # Use the declared placement envelope in both LOD sheets, so changes in
        # silhouette cannot be disguised by automatically fitting each mesh.
        envelope = [project((sx*w/2, yy*h, sz*d/2)) for sx in (-1, 1) for yy in (0, 1) for sz in (-1, 1)]
        u0, u1 = min(v[0] for v in envelope), max(v[0] for v in envelope)
        v0, v1 = min(v[1] for v in envelope), max(v[1] for v in envelope)
        factor = min((tile_w-38)/(u1-u0), (tile_h-70)/(v1-v0))
        cx, cy = x0+tile_w/2, y0+54+(tile_h-70)/2
        uv_centre = ((u0+u1)/2, (v0+v1)/2)
        def pixel(q):
            return (cx+(q[0]-uv_centre[0])*factor, cy-(q[1]-uv_centre[1])*factor)
        rel = by_asset[p[lod]]
        if rel not in files:
            files[rel] = GLB(models/rel)
        triangles = list(files[rel].triangles(p[lod]))
        if len(triangles) != p[lod+'Triangles']:
            raise ValueError(f"{p[lod]}: actual triangle count differs from placement")
        faces = []
        for points, colour in triangles:
            normal = unit(cross(sub(points[1], points[0]), sub(points[2], points[0])))
            if dot(normal, VIEW) <= 1e-9:
                continue
            verts = [project(q) for q in points]
            light = .57 + .43*max(0., dot(normal, LIGHT))
            faces.append((sum(q[2] for q in verts)/3, [(*pixel(q),q[2]) for q in verts], tuple(srgb(c*light) for c in colour)))
        faces.sort(key=lambda f: f[0])
        depth = array('f', [-math.inf])*(tile_w*tile_h)
        for _, polygon, colour in faces:
            raster_triangle(pixels, depth, x0, y0, tile_w, tile_h, polygon, colour)
        triangle_total += len(triangles)
        visible_total += len(faces)
    target = out/f'contact-{lod}.png'
    image.save(target, optimize=False)
    image.close()
    return {'lod': lod, 'file': str(target), 'pieces': len(placement['pieces']), 'triangles': triangle_total, 'visibleTriangles': visible_total}


def main():
    repo = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--models', type=Path, default=repo/'la-ladera/assets/models')
    parser.add_argument('--out', type=Path, default=repo/'.scratch/vista')
    parser.add_argument('--columns', type=int, default=8)
    args = parser.parse_args()
    if not 1 <= args.columns <= 10:
        parser.error('--columns must be between 1 and 10')
    placement = json.loads((args.models/'vista/placement.json').read_text())
    manifest = json.loads((args.models/'manifest.vista.json').read_text())
    args.out.mkdir(parents=True, exist_ok=True)
    reports = [draw_sheet(args.models, args.out, placement, manifest, lod, args.columns) for lod in ('near', 'far')]
    try:
        import resource
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        rss_bytes = rss if os.uname().sysname == 'Darwin' else rss*1024
    except (ImportError, AttributeError):
        rss_bytes = None
    print(json.dumps({'diagnosticOnly': True, 'peakRSSBytes': rss_bytes, 'sheets': reports}, sort_keys=True))


if __name__ == '__main__':
    main()
