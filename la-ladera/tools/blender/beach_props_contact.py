"""Compose exact exported-GLB renders into beach-prop review sheets.

Requires Pillow in the host Python, not Blender's Python. This is a mechanical
contact-sheet compositor; it never modifies the source item renders. The index
records source GLB/texture pins and camera heights without claiming approval.

    python tools/blender/beach_props_contact.py --scratch /tmp/beach-renders
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PAPER = (239, 237, 228)
INK = (35, 54, 58)
MUTED = (89, 105, 105)
RULE = (197, 205, 199)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def font(size):
    # A font only labels review evidence; artwork in the shipped atlas remains
    # entirely stdlib-generated with its own embedded original letterforms.
    try:
        return ImageFont.truetype('DejaVuSans.ttf', size)
    except OSError:
        return ImageFont.load_default(size=size)


def label(draw, xy, value, size=22, fill=INK):
    draw.text(xy, value, font=font(size), fill=fill)


def publish_image(image, path, format_name, **options):
    """Publish only complete image bytes, even if a reviewer reads mid-build."""
    encoded = io.BytesIO()
    image.save(encoded, format=format_name, **options)
    data = encoded.getvalue()
    size = len(data)
    if size > 8 * 1024 * 1024:
        raise ValueError(f'{path.name}: {size:,} bytes exceeds existing 8 MiB per-file cap')
    staging = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.' + path.name + '-', suffix='.tmp', delete=False) as out:
            staging = Path(out.name)
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        staging.replace(path)
    finally:
        if staging and staging.exists():
            staging.unlink()
    return size


def save_png(image, path):
    size = publish_image(image, path, 'PNG', compress_level=6)
    return {'path': path.name, 'bytes': size, 'sha256': digest(path), 'width': image.width, 'height': image.height}


def save_catalogue(image, path):
    # The complete catalogue is over 20 megapixels. High-quality JPEG preserves
    # legible labels and 4096px width within the existing per-file payload gate;
    # the larger individual contact-sheet views remain lossless PNG.
    size = publish_image(image, path, 'JPEG', quality=95, subsampling=0, optimize=True)
    return {'path': path.name, 'bytes': size, 'sha256': digest(path), 'width': image.width, 'height': image.height,
            'format': 'JPEG', 'quality': 95, 'chromaSubsampling': '4:4:4'}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--scratch', type=Path, required=True)
    ap.add_argument('--out', type=Path, default=ROOT / 'dev/beach_props')
    ap.add_argument('--preview', action='store_true', help='Permit a partial preview; index remains incomplete')
    opt = ap.parse_args()
    source = json.loads((opt.scratch / 'renders.json').read_text(encoding='utf8'))
    if not source['complete'] and not opt.preview:
        raise ValueError('Contact sheets require every catalogue item; use --preview for isolated review')
    opt.out.mkdir(parents=True, exist_ok=True)
    items = list(source['items'].values())
    for item in items:
        for view in item['views'].values():
            if view['eyeHeight'] != 1.6:
                raise ValueError(f'{item["key"]}: camera is not at 1.6 metres')
            path = opt.scratch / view['file']
            if digest(path) != view['sha256']:
                raise ValueError(f'{path}: source render hash mismatch')
        if item['views']['scale']['referenceHeight'] != 1.8:
            raise ValueError(f'{item["key"]}: missing 1.8 metre scale figure')
    cells_w, cells_h = 1024, 460
    columns, rows = 3, 4
    margin, header = 36, 128
    pages, placements = [], {}
    for page, start in enumerate(range(0, len(items), columns * rows), 1):
        subset = items[start:start + columns * rows]
        height = header + min(rows, (len(subset) + columns - 1) // columns) * cells_h + 45
        sheet = Image.new('RGB', (margin * 2 + columns * cells_w, height), PAPER)
        draw = ImageDraw.Draw(sheet)
        label(draw, (margin, 24), 'LA LADERA / BEACH PROPS', 36)
        label(draw, (margin, 73), f'Exported GLB inspection · page {page:02d} · detail + 1.8 m reference · both cameras at 1.6 m', 24, MUTED)
        filename = f'contact-{page:02d}.png'
        for n, item in enumerate(subset):
            x = margin + n % columns * cells_w
            y = header + n // columns * cells_h
            for j, kind in enumerate(('detail', 'scale')):
                image = Image.open(opt.scratch / item['views'][kind]['file']).convert('RGB')
                image.thumbnail((512, 384), Image.Resampling.LANCZOS)
                sheet.paste(image, (x + j * 512, y))
                label(draw, (x + j * 512 + 10, y + 9), 'DETAIL' if j == 0 else '1.8 m FIGURE', 16, MUTED)
            short = item['key'].removeprefix('beach_')
            label(draw, (x + 10, y + 390), short, 23)
            dims = ' × '.join(f'{v:g}' for v in item['size'])
            label(draw, (x + 10, y + 423), f'{dims} m · near {item["nearTriangles"]:,} / far {item["farTriangles"]:,} tri', 19, MUTED)
            draw.line((x, y + cells_h - 2, x + cells_w - 20, y + cells_h - 2), fill=RULE, width=1)
            placements[item['key']] = {'sheet': filename, 'column': n % columns, 'row': n // columns,
                                       'pixelBounds': [x, y, x + cells_w, y + cells_h]}
        label(draw, (margin, height - 32), 'Original CC0-1.0 library · +Y up / +Z front · neutral light · no world placement', 19, MUTED)
        pages.append(save_png(sheet, opt.out / filename))
    cat_columns, cell_w, cell_h = 8, 512, 420
    cat_header = 160
    cat_rows = (len(items) + cat_columns - 1) // cat_columns
    catalogue = Image.new('RGB', (4096, cat_header + cat_rows * cell_h + 52), PAPER)
    draw = ImageDraw.Draw(catalogue)
    label(draw, (44, 28), 'LA LADERA · BEACH PROPS CATALOGUE', 53)
    label(draw, (44, 98), f'{len(items)} original pieces · near/far LOD pairs · shared PBR atlas · library only', 29, MUTED)
    for n, item in enumerate(items):
        x, y = n % cat_columns * cell_w, cat_header + n // cat_columns * cell_h
        im = Image.open(opt.scratch / item['views']['detail']['file']).convert('RGB')
        im.thumbnail((512, 350), Image.Resampling.LANCZOS)
        catalogue.paste(im, (x + (cell_w - im.width) // 2, y))
        label(draw, (x + 15, y + 350), item['key'].removeprefix('beach_'), 22)
        label(draw, (x + 15, y + 382), f'{item["nearTriangles"]:,} / {item["farTriangles"]:,} tri  ·  {item["family"]}', 19, MUTED)
    label(draw, (44, catalogue.height - 39), 'All images render the pinned exported GLB geometry. Contact sheets include a 1.8 m figure beside every item.', 24, MUTED)
    catalogue_meta = save_catalogue(catalogue, opt.out / 'catalogue.jpg')
    report = {k: v for k, v in source.items() if k != 'items'}
    report.update({'contactSheets': pages, 'catalogue': catalogue_meta,
                   'items': [{**item, 'contactSheet': placements[item['key']]} for item in items]})
    (opt.out / 'review-index.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf8', newline='\n')
    print(f'CONTACT SHEETS: {len(items)} items / {len(pages)} pages; eye height 1.6m; figure height 1.8m')
    print(f'CATALOGUE: {catalogue_meta["width"]}x{catalogue_meta["height"]}, {catalogue_meta["bytes"]:,} bytes')
    print('Input GLB, texture and raw render SHA-256 pins recorded in review-index.json')


if __name__ == '__main__':
    main()
