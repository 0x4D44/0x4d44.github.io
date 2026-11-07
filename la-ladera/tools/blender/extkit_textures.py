"""Author the extkit's original atlas and twelve seamless PBR wall materials.

All colour, damage, mortar, cloth and grain fields are procedural. No fetched
images, manufacturer artwork, logos or text are used. The fourth atlas row's
last cell is deliberately a blank writable chalk surface. Requires NumPy and
Pillow12.3 (BC5 encoder). Run under the existing tools/nice.mjs wrapper.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
from extkit_texture_codec import write_ktx2, decode_ktx2

ATLAS_SIZE, CELL, GUTTER = 512, 128, 4
NAMES = ('blue', 'black', 'steel', 'rust_light', 'rust_heavy', 'concrete', 'pvc',
         'rope', 'cloth', 'wood', 'terracotta', 'leaf', 'soil', 'porcelain', 'paint', 'chalk')
PIGMENTS = ((.13, .33, .65), (.10, .12, .12), (.68, .71, .69), (.57, .35, .21),
            (.46, .22, .10), (.61, .60, .55), (.80, .81, .76), (.62, .55, .40),
            (.91, .89, .83), (.48, .34, .21), (.67, .34, .20), (.72, .80, .56),
            (.20, .14, .08), (.84, .84, .77), (.89, .88, .82), (.10, .13, .12))
PBR = ((.47, 0), (.50, 0), (.52, .85), (.75, .32), (.93, .10), (.96, 0),
       (.55, 0), (.95, 0), (.92, 0), (.89, 0), (.95, 0), (.71, 0), (.99, 0),
       (.28, 0), (.68, .12), (.94, 0))
WALLS = [
    ('azul_anil', 'Pañete pintado azul añil', 'painted_plaster', 'azul añil', (.24, .38, .62)),
    ('turquesa', 'Pañete pintado turquesa', 'painted_plaster', 'turquesa', (.31, .66, .63)),
    ('amarillo_ocre', 'Pañete pintado amarillo ocre', 'painted_plaster', 'amarillo ocre', (.87, .68, .29)),
    ('terracota', 'Pañete pintado terracota', 'painted_plaster', 'terracota', (.75, .39, .27)),
    ('verde_menta', 'Pañete pintado verde menta', 'painted_plaster', 'verde menta', (.55, .72, .51)),
    ('rosado', 'Pañete pintado rosado', 'painted_plaster', 'rosado', (.83, .53, .51)),
    ('tolete', 'Ladrillo tolete a la vista', 'brick', None, (.64, .32, .19)),
    ('tolete_humedo', 'Ladrillo tolete con humedad', 'brick', None, (.54, .31, .21)),
    ('bloque', 'Bloque de cemento con juntas', 'cement_block', None, (.59, .59, .55)),
    ('baldosin', 'Franja de baldosín', 'tile_band', None, (.81, .77, .62)),
    ('panete', 'Pañete rústico con escurridos', 'rough_render', None, (.61, .59, .52)),
    ('cal', 'Encalado envejecido', 'whitewash', None, (.88, .87, .79)),
]


def noise(size, grid, rng):
    """Periodic smooth value noise, generated without any external source."""
    gy, gx = (grid, grid) if isinstance(grid, int) else grid
    data = rng.random((gy, gx), dtype=np.float32)
    qx = np.arange(size, dtype=np.float32) * gx / size
    qy = np.arange(size, dtype=np.float32) * gy / size
    ix, iy = np.floor(qx).astype(int), np.floor(qy).astype(int)
    tx, ty = qx - ix, qy - iy
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    rows = data[iy[:, None] % gy, ix[None, :] % gx] * (1 - tx)[None, :] + \
        data[iy[:, None] % gy, (ix[None, :] + 1) % gx] * tx[None, :]
    next_rows = data[(iy[:, None] + 1) % gy, ix[None, :] % gx] * (1 - tx)[None, :] + \
        data[(iy[:, None] + 1) % gy, (ix[None, :] + 1) % gx] * tx[None, :]
    return rows * (1 - ty)[:, None] + next_rows * ty[:, None]


def rgb_image(array):
    return Image.fromarray(np.uint8(np.clip(np.rint(array * 255), 0, 255)))


def normal_image(height, strength):
    # OpenGL tangent-space normal: image Y points down, tangent V points up.
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * .5
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * .5
    vec = np.stack((-dx * strength, dy * strength, np.ones_like(dx)), axis=2)
    vec /= np.linalg.norm(vec, axis=2, keepdims=True)
    return rgb_image(vec * .5 + .5)


def orm_image(height, roughness, metal=0, occlusion=None):
    if occlusion is None:
        occlusion = np.clip(.92 + (height - .5) * .12, .73, 1)
    rough = np.broadcast_to(roughness, height.shape)
    metallic = np.broadcast_to(metal, height.shape)
    return rgb_image(np.stack((occlusion, rough, metallic), axis=2))


def atlas_cell(index):
    rng = np.random.default_rng(660100 + index * 137)
    name = NAMES[index]
    coarse = noise(CELL, 5, rng)
    grain = noise(CELL, 32, rng)
    y, x = np.mgrid[:CELL, :CELL].astype(np.float32)
    level = .91 + (coarse - .5) * .14 + (grain - .5) * .08
    height = .5 + (grain - .5) * .06
    if name in ('rust_light', 'rust_heavy'):
        pits = np.clip((noise(CELL, 12, rng) - .42) * 4, 0, 1)
        level -= pits * (.19 if name == 'rust_light' else .34)
        height += pits * .10
    elif name == 'steel':
        level += (noise(CELL, 17, rng) - .5) * .20
    elif name in ('cloth', 'rope'):
        weave = np.cos(x * np.pi) * np.cos(y * np.pi)
        height += weave * .012; level += weave * .025
        if name == 'rope': level += np.sin((x + y) * .37) * .055
    elif name == 'wood':
        stripes = np.sin(x * .35 + coarse * 3) * .5 + .5
        level -= stripes * .17; height += stripes * .025
    elif name == 'leaf':
        veins = np.maximum(0, 1 - np.abs(x - 64) / 2) + np.maximum(0, np.sin((x + y) * .21) - .94)
        height += veins * .025; level += veins * .04
    elif name == 'soil':
        height += (noise(CELL, 20, rng) - .5) * .20
        level += (noise(CELL, 31, rng) - .5) * .30
    elif name == 'concrete':
        height += (noise(CELL, 16, rng) - .5) * .08
    elif name in ('blue', 'black', 'pvc', 'porcelain', 'paint'):
        height = .5 + (grain - .5) * .008
    elif name == 'chalk':
        # Deliberately no lettering: the entire interior rectangle is writable.
        height = .5 + (grain - .5) * .014
        level = .94 + (coarse - .5) * .10
    colour = rgb_image(np.asarray(PIGMENTS[index])[None, None, :] * level[:, :, None])
    normal = normal_image(height, 2)
    rough, metal = PBR[index]
    orm = orm_image(height, np.clip(rough + (grain - .5) * .06, 0, 1), metal)
    return colour, normal, orm


def lock_gutter(image):
    arr = np.asarray(image)[GUTTER:CELL - GUTTER, GUTTER:CELL - GUTTER]
    return Image.fromarray(np.pad(arr, ((GUTTER, GUTTER), (GUTTER, GUTTER), (0, 0)), mode='edge'))


def wall_surface(index, size=1024):
    ident, label, kind, colour_name, pigment = WALLS[index]
    rng = np.random.default_rng(19961110 + index * 8191)
    coarse, medium, grain = noise(size, 4, rng), noise(size, 18, rng), noise(size, 128, rng)
    yy, xx = np.mgrid[:size, :size].astype(np.float32) / size
    level = .91 + (medium - .5) * .14 + (grain - .5) * .035
    height = .5 + (grain - .5) * .015 + (medium - .5) * .025
    rough = np.clip(.87 + (medium - .5) * .10, 0, 1)
    ao = np.clip(.96 + (medium - .5) * .05, 0, 1)
    rgb = level[:, :, None] * np.asarray(pigment)[None, None, :]
    strength = 14
    if kind in ('painted_plaster', 'whitewash', 'rough_render'):
        fine = noise(size, 43, rng)
        peeled = np.clip((medium * .70 + fine * .30 - .66) * 14, 0, 1)
        damp = np.clip((coarse - .48) * 3.8, 0, .85)
        streaks = np.clip((noise(size, (3, 73), rng) - .62) * 8, 0, 1)
        streaks *= np.clip((noise(size, (2, 9), rng) - .25) * 1.7, 0, 1)
        damp *= .55 + streaks * .45
        rgb *= (1 - damp[:, :, None] * .24)
        bare = np.array([.56, .53, .45]) * (.87 + (grain - .5) * .12)[:, :, None]
        if kind == 'whitewash':
            peeled *= .6
            bare = np.array([.68, .65, .56]) * (.93 + (medium - .5) * .14)[:, :, None]
        if kind == 'rough_render':
            peeled *= .2
            height += (fine - .5) * .05
            rgb *= (1 - streaks[:, :, None] * .12)
            strength = 9
        rgb = rgb * (1 - peeled[:, :, None]) + bare * peeled[:, :, None]
        height -= peeled * .055 + damp * .012
        rough = np.clip(rough + peeled * .08 - damp * .04, 0, 1)
        ao -= peeled * .04 + damp * .04
    elif kind in ('brick', 'cement_block'):
        columns, rows = (8, 24) if kind == 'brick' else (4, 8)
        row = np.floor(yy * rows).astype(int)
        horizontal = (xx * columns + (row % 2) * .5) % 1
        vertical = (yy * rows) % 1
        edge = np.minimum(np.minimum(horizontal, 1 - horizontal) * (1.0 if kind == 'brick' else .70),
                          np.minimum(vertical, 1 - vertical) * (.31 if kind == 'brick' else .5))
        bevel = np.clip((edge - .018) / .018, 0, 1)
        col = np.floor(xx * columns + (row % 2) * .5).astype(int) % columns
        variations = rng.uniform(-.10, .10, (rows, columns))[row, col]
        ceramic = np.asarray(pigment)[None, None, :] * (level + variations)[:, :, None]
        mortar = np.array([.64, .62, .55]) * (.9 + (grain - .5) * .09)[:, :, None]
        rgb = ceramic * bevel[:, :, None] + mortar * (1 - bevel[:, :, None])
        height = .34 + bevel * .14 + (grain - .5) * .015 + (medium - .5) * .018 * bevel
        rough = np.clip(.91 + (grain - .5) * .08, 0, 1)
        ao = .80 + bevel * .17
        strength = 7
        if ident == 'tolete_humedo':
            damp = np.clip((coarse - .42) * 2.6, 0, .8)
            rgb *= (1 - damp[:, :, None] * .27)
            rgb += np.array([-.01, .01, -.015])[None, None, :] * damp[:, :, None]
            rough -= damp * .11
    elif kind == 'tile_band':
        u, v = (xx * 8) % 1, (yy * 8) % 1
        edge = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
        tile = np.clip((edge - .023) / .018, 0, 1)
        row = np.floor(yy * 8).astype(int)
        diamond = np.maximum(0, 1 - (np.abs(u - .5) + np.abs(v - .5)) / .30)
        stripe = ((row % 4) == 1) | ((row % 4) == 2)
        motif = np.clip(diamond * 9, 0, 1) * stripe
        ceramic = np.asarray(pigment)[None, None, :] * level[:, :, None]
        glaze = np.array([.19, .37, .42])[None, None, :]
        ceramic = ceramic * (1 - motif[:, :, None]) + glaze * motif[:, :, None]
        rgb = ceramic * tile[:, :, None] + np.array([.48, .47, .42])[None, None, :] * (1 - tile[:, :, None])
        height = .35 + tile * .10
        rough = .70 - tile * .39 + (grain - .5) * .03
        ao = .80 + tile * .18
        strength = 8
    return rgb_image(rgb), normal_image(height, strength), orm_image(height, rough, 0, ao)


def describe_file(path, relative, **kwargs):
    data = path.read_bytes()
    return {'file': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), **kwargs}


def font(size):
    path = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    if path.is_file(): return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size=size)


def make_preview(out, materials, preview):
    """The sheet uses decoded shipped BC files, never uncompressed source art."""
    preview.mkdir(parents=True, exist_ok=True)
    width, height = 1280, 1240
    sheet = Image.new('RGB', (width, height), (239, 235, 223))
    draw = ImageDraw.Draw(sheet)
    draw.text((28, 20), 'La Ladera · Muros y acabados', font=font(29), fill=(33, 48, 42))
    draw.text((28, 61), '12 materiales originales · muestras de los archivos KTX2 comprimidos', font=font(16), fill=(60, 70, 61))
    for i, wall in enumerate(materials['walls']):
        x, y = 24 + (i % 4) * 315, 102 + (i // 4) * 366
        image = decode_ktx2(out / Path(wall['map']).name)
        # 2x2 repetition makes tile-edge continuity reviewable on the sheet.
        tile = image.resize((148, 148), Image.Resampling.LANCZOS)
        for row in range(2):
            for col in range(2): sheet.paste(tile, (x + col * 148, y + row * 148))
        label = wall['label']
        words, lines, current = label.split(), [], ''
        for word in words:
            trial = current + (' ' if current else '') + word
            if draw.textlength(trial, font=font(16)) > 295:
                lines.append(current); current = word
            else: current = trial
        lines.append(current)
        for j, line in enumerate(lines): draw.text((x, y + 306 + j * 20), line, font=font(16), fill=(32, 43, 37))
    sheet.save(preview / 'materials-walls.png', optimize=True)
    atlas_sheet = Image.new('RGB', (1060, 1160), (239, 235, 223))
    d = ImageDraw.Draw(atlas_sheet)
    d.text((22, 16), 'Atlas compartido · color, normal y ORM', font=font(25), fill=(33, 48, 42))
    for row, (channel, caption) in enumerate([('map', 'Color'), ('normal', 'Normal'), ('orm', 'Oclusión · rugosidad · metal')]):
        path = out / Path(materials['atlas'][channel]).name
        atlas_sheet.paste(Image.open(path).resize((352, 352)), (22, 68 + row * 360))
        d.text((395, 76 + row * 360), caption, font=font(25), fill=(33, 48, 42))
    labels = ['Plástico azul', 'Plástico negro', 'Acero', 'Óxido leve', 'Óxido fuerte', 'Concreto', 'PVC', 'Cuerda',
              'Tela', 'Madera', 'Barro cocido', 'Hoja', 'Tierra', 'Porcelana', 'Pintura', 'Pizarra en blanco']
    for i, label in enumerate(labels): d.text((395 + (i % 2) * 300, 128 + (i // 2) * 26), label, font=font(17), fill=(48, 59, 50))
    atlas_sheet.save(preview / 'materials-atlas.png', optimize=True)


def build(out, material_path, preview=None):
    out.mkdir(parents=True, exist_ok=True); material_path.parent.mkdir(parents=True, exist_ok=True)
    atlas_images = [Image.new('RGB', (ATLAS_SIZE, ATLAS_SIZE)) for _ in range(3)]
    tiles, definitions = {}, {}
    for i, name in enumerate(NAMES):
        x, y = (i % 4) * CELL, (i // 4) * CELL
        for target, source in zip(atlas_images, atlas_cell(i)): target.paste(lock_gutter(source), (x, y))
        key = 'extkit_' + name
        tiles[key] = [(x + GUTTER) / ATLAS_SIZE, 1 - (y + CELL - GUTTER) / ATLAS_SIZE,
                      (x + CELL - GUTTER) / ATLAS_SIZE, 1 - (y + GUTTER) / ATLAS_SIZE]
        rough, metal = PBR[i]
        definitions[key] = {'tile': key, 'color': 16777215, 'rough': rough, 'metal': metal, 'uv': 'unit',
                            'vertexColors': True, 'side': 'front', 'map': 'atlas.png',
                            'normal': 'atlas_normal.png', 'orm': 'atlas_orm.png'}
    files = []
    for image, name in zip(atlas_images, ('atlas.png', 'atlas_normal.png', 'atlas_orm.png')):
        image.save(out / name, optimize=True)
        files.append(describe_file(out / name, '../../textures/extkit/' + name, width=512, height=512,
                                   format='RGB8_PNG', gpuBytes=4 * sum((512 >> k) ** 2 for k in range(10))))
    atlas = {'map': '../../textures/extkit/atlas.png', 'normal': '../../textures/extkit/atlas_normal.png',
             'orm': '../../textures/extkit/atlas_orm.png', 'size': [512, 512], 'normalSize': [512, 512],
             'ormSize': [512, 512], 'uvConvention': 'bottom-to-top; match existing TextureLoader flipY=true',
             'gutterPixels': GUTTER, 'tiles': tiles}
    walls = []
    for i, (ident, label, kind, colour, _) in enumerate(WALLS):
        entry = {'id': 'extkit_wall_' + ident, 'label': label, 'category': kind, 'size': [1024, 1024],
                 'physicalSizeMetres': [2, 2], 'seamless': True, 'normalEncoding': 'BC5_RG_positiveZ'}
        if colour: entry['colour'] = colour
        for channel, image in zip(('albedo', 'normal', 'orm'), wall_surface(i)):
            name = 'wall_' + ident + '_' + channel + '.ktx2'
            measured = write_ktx2(out / name, image, channel)
            relative = '../../textures/extkit/' + name
            entry['map' if channel == 'albedo' else channel] = relative
            files.append(describe_file(out / name, relative, **measured))
        walls.append(entry)
        print(f'{entry["id"]}: 3 KTX2 planes, 1024px, 11 mips', flush=True)
    material = {'version': 1, 'libraryOnly': True, 'license': 'CC0-1.0',
                'generator': 'tools/blender/extkit_textures.py', 'provenance': 'Original deterministic procedural images; no imported artwork.',
                'atlas': atlas, 'materials': definitions, 'walls': walls, 'files': files, 'drawnStrings': [],
                'colorSpace': {'map': 'srgb', 'normal': 'linear', 'orm': 'linear'},
                'normalEncoding': 'BC5_RG_positiveZ', 'ormChannels': ['occlusion', 'roughness', 'metallic'],
                'runtimeIntegration': 'Untested. Native BC1/BC5 KTX2 with ZLIB requires an explicit decoder/upload path and GPU format support.',
                'textureBytes': sum(f['bytes'] for f in files), 'gpuBytes': sum(f['gpuBytes'] for f in files),
                'gpuAccounting': 'All39 texture planes resident simultaneously; full BC mip block bytes; PNG atlas estimated as RGBA8 full mip chain.',
                'formatSpecification': 'https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html'}
    if material['textureBytes'] > 8_000_000: raise ValueError(f'Texture disk budget exceeded: {material["textureBytes"]}')
    if material['gpuBytes'] > 40_000_000: raise ValueError(f'Texture GPU budget exceeded: {material["gpuBytes"]}')
    material_path.write_text(json.dumps(material, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if preview: make_preview(out, material, preview)
    print(json.dumps({'textureFiles': len(files), 'wallMaterials': len(walls), 'textureBytes': material['textureBytes'],
                      'gpuBytes': material['gpuBytes'], 'materials': str(material_path)}, indent=2), flush=True)
    return material


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out', type=Path, default=ROOT / 'assets/textures/extkit')
    p.add_argument('--materials', type=Path, default=ROOT / 'assets/models/extkit/materials.json')
    p.add_argument('--preview', type=Path)
    a = p.parse_args(); build(a.out.resolve(), a.materials.resolve(), a.preview.resolve() if a.preview else None)


if __name__ == '__main__': main()
