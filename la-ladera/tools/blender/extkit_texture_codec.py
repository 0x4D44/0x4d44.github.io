"""Original, deliberately small KTX2 writer and review decoder for extkit.

Pillow supplies the BC encoders; the container is Khronos KTX 2.0.4 with ZLIB
supercompression (scheme 3). No art is imported. BC1 colours/ORM and BC5 XY
normals retain their GPU blocks after inflation. The independent acceptance
reader is extkit_texture_codec.mjs, not this module.
"""
from io import BytesIO
from pathlib import Path
import struct
import zlib
import numpy as np
from PIL import Image

MAGIC = bytes.fromhex('ab4b5458203230bb0d0a1a0a')
FORMATS = {'albedo': 132, 'normal': 141, 'orm': 131}


def _dfd(vk):
    bc5 = vk == 141
    count = 2 if bc5 else 1
    total = 28 + count * 16
    head = struct.pack('<IIHH4B4B8B', total, 0, 2, total - 4,
                       132 if bc5 else 128, 1, 2 if vk == 132 else 1, 0,
                       3, 3, 0, 0, 16 if bc5 else 8, 0, 0, 0, 0, 0, 0, 0)
    return head + b''.join(struct.pack('<HBB4BII', 64 * i, 63, i, 0, 0, 0, 0,
                                      0, 0xffffffff) for i in range(count))


def _metadata(items):
    data = bytearray()
    for key, value in sorted(items.items()):
        raw = key.encode('utf-8') + b'\0' + value.encode('utf-8') + b'\0'
        data += struct.pack('<I', len(raw)) + raw
        data += b'\0' * (-len(raw) % 4)
    return bytes(data)


def _mirror_block(block, bc5, horizontal=False, vertical=False):
    """Mirror BC selectors, leaving the common interpolation endpoints intact."""
    data = bytearray(block)
    channels = [(0, 2, 3), (8, 2, 3)] if bc5 else [(0, 4, 2)]
    for start, offset, bits in channels:
        length = 6 if bc5 else 4
        selectors = int.from_bytes(data[start + offset:start + offset + length], 'little')
        result = 0
        for y in range(4):
            for x in range(4):
                sx, sy = (3 - x if horizontal else x), (3 - y if vertical else y)
                index = (selectors >> (bits * (sy * 4 + sx))) & ((1 << bits) - 1)
                result |= index << (bits * (y * 4 + x))
        data[start + offset:start + offset + length] = result.to_bytes(length, 'little')
    return bytes(data)


def _seam_blocks(raw, width, height, bc5):
    """Opposite edge texels match exactly after BC decoding, not only in source.

    Only the outer four-pixel strip is replaced. Its block is the mirrored
    opposite block, preserving all interpolation endpoints and PBR channels.
    At 4px and smaller the entire level is constant, produced before encoding.
    """
    stride = 16 if bc5 else 8
    nx, ny = max(1, (width + 3) // 4), max(1, (height + 3) // 4)
    data = bytearray(raw)
    if nx > 1:
        for y in range(ny):
            source = bytes(data[(y * nx) * stride:(y * nx + 1) * stride])
            at = (y * nx + nx - 1) * stride
            data[at:at + stride] = _mirror_block(source, bc5, horizontal=True)
    if ny > 1:
        for x in range(nx):
            source = bytes(data[x * stride:(x + 1) * stride])
            at = ((ny - 1) * nx + x) * stride
            data[at:at + stride] = _mirror_block(source, bc5, vertical=True)
    return bytes(data)


def _mip_image(image, width, channel):
    if width <= 4:
        mean = np.asarray(image, dtype=np.float32).reshape(-1, 3).mean(axis=0)
        if channel == 'normal':
            mean[:2] = 128
            mean[2] = 255
        return Image.new('RGB', (width, width), tuple(np.uint8(mean)))
    if channel == 'albedo':
        # Average colour in linear light before re-encoding sRGB.
        s = np.asarray(image, dtype=np.float32) / 255
        linear = np.where(s <= .04045, s / 12.92, ((s + .055) / 1.055) ** 2.4)
        down = np.stack([np.asarray(Image.fromarray(linear[:, :, k], 'F').resize(
            (width, width), Image.Resampling.BOX)) for k in range(3)], axis=2)
        srgb = np.where(down <= .0031308, down * 12.92, 1.055 * down ** (1 / 2.4) - .055)
        return Image.fromarray(np.uint8(np.clip(np.rint(srgb * 255), 0, 255)))
    down = np.asarray(image.resize((width, width), Image.Resampling.BOX)).copy()
    if channel == 'normal':
        n = down.astype(np.float32) / 127.5 - 1
        n /= np.maximum(np.linalg.norm(n, axis=2, keepdims=True), .0001)
        down = np.uint8(np.clip(np.rint((n * .5 + .5) * 255), 0, 255))
    return Image.fromarray(down)


def write_ktx2(path, image, channel):
    """Write complete 2D square mip chain; return measured metadata."""
    image = image.convert('RGB')
    if channel in ('normal', 'orm'):
        # Quantise subvisual channel noise before BC coding. Normal XY error is
        # at most 2/255; ORM error is at most 4/255. Large relief, mortar joints
        # and peeling edges survive; thousands of unique almost-flat blocks do
        # not consume the disk budget solely through insignificant low bits.
        arr = np.asarray(image, dtype=np.float32)
        step = 4 if channel == 'normal' else 8
        arr[:, :, :2] = np.clip(np.rint(arr[:, :, :2] / step) * step, 0, 255)
        image = Image.fromarray(np.uint8(arr))
    width, height = image.size
    if width != height or width & (width - 1):
        raise ValueError('extkit KTX2 requires square power-of-two images')
    vk = FORMATS[channel]
    bc5 = channel == 'normal'
    levels = []
    n = width
    while n:
        current = image if n == width else _mip_image(image, n, channel)
        buffer = BytesIO()
        current.save(buffer, format='DDS', pixel_format='BC5' if bc5 else 'DXT1')
        raw = buffer.getvalue()[148 if bc5 else 128:]
        expected = max(1, (n + 3) // 4) ** 2 * (16 if bc5 else 8)
        if len(raw) != expected:
            raise ValueError(f'BC encoder returned {len(raw)}, expected {expected}')
        raw = _seam_blocks(raw, n, n, bc5)
        levels.append((zlib.compress(raw, 9), len(raw)))
        n //= 2
    dfd = _dfd(vk)
    kvd = _metadata({'KTXorientation': 'rd', 'KTXwriter': 'La Ladera extkit procedural generator',
                     'extkit.channel': channel,
                     'extkit.normalEncoding': 'BC5_RG_positiveZ' if bc5 else 'none'})
    dfd_at = 80 + 24 * len(levels)
    kvd_at = dfd_at + len(dfd)
    next_at = kvd_at + len(kvd)
    indices = [None] * len(levels)
    body = bytearray()
    # KTX2 stores smallest mip first; the index remains largest first.
    for index in reversed(range(len(levels))):
        packed, rawlen = levels[index]
        indices[index] = (next_at, len(packed), rawlen)
        body.extend(packed)
        next_at += len(packed)
    header = MAGIC + struct.pack('<9I4I2Q', vk, 1, width, height, 0, 0, 1,
                                len(levels), 3, dfd_at, len(dfd), kvd_at, len(kvd), 0, 0)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + b''.join(struct.pack('<3Q', *x) for x in indices) + dfd + kvd + body)
    return {'width': width, 'height': height, 'format': 'BC5_UNORM' if bc5 else
            ('BC1_SRGB' if channel == 'albedo' else 'BC1_UNORM'),
            'mipLevels': len(levels), 'gpuBytes': sum(x[1] for x in levels)}


def decode_ktx2(path, level=0):
    """Decode an actual shipped mip for Blender reviews (RGB PIL.Image)."""
    data = Path(path).read_bytes()
    if data[:12] != MAGIC or len(data) < 104:
        raise ValueError('invalid KTX2')
    vk, _, width, height, _, _, _, levels, compression = struct.unpack_from('<9I', data, 12)
    if vk not in (131, 132, 141) or compression != 3 or not 0 <= level < levels:
        raise ValueError('unsupported extkit KTX2')
    at, length, unpacked = struct.unpack_from('<3Q', data, 80 + level * 24)
    raw = zlib.decompress(data[at:at + length])
    width, height = max(1, width >> level), max(1, height >> level)
    bc5 = vk == 141
    if len(raw) != unpacked or unpacked != max(1, (width + 3) // 4) * max(1, (height + 3) // 4) * (16 if bc5 else 8):
        raise ValueError('invalid KTX2 level size')
    header = bytearray(148 if bc5 else 128)
    struct.pack_into('<4s7I', header, 0, b'DDS ', 124, 0x81007, height, width, len(raw), 0, 1)
    struct.pack_into('<II4s', header, 76, 32, 4, b'DX10' if bc5 else b'DXT1')
    struct.pack_into('<I', header, 108, 0x1000)
    if bc5:
        struct.pack_into('<5I', header, 128, 83, 3, 0, 1, 0)
    image = Image.open(BytesIO(header + raw)).convert('RGB')
    if bc5:
        arr = np.asarray(image).copy()
        xy = arr[:, :, :2].astype(np.float32) / 127.5 - 1
        z = np.sqrt(np.maximum(0, 1 - np.sum(xy * xy, axis=2)))
        arr[:, :, 2] = np.uint8(np.clip(np.rint((z * .5 + .5) * 255), 0, 255))
        image = Image.fromarray(arr)
    return image
