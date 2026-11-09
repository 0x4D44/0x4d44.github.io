#!/usr/bin/env python3
"""Package original groundsky PNG masters as dormant, mipmapped ASTC KTX2.

All masters AND delivered textures count against the 12,000,000-byte library
cap. Only the ASTC copies are intended for GPU upload. KTX2's Zstandard scheme is
standard lossless supercompression of each independently encoded mip level.
This is an ASTC-capable-device delivery, not a universal Basis transcoder.

References: https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html
https://registry.khronos.org/DataFormat/specs/1.4/dataformat.1.4.pdf
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shlex
import struct
import subprocess
import sys
import tempfile
import time
import zlib
import zstandard

os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEV = ROOT / 'dev/groundsky'
TEX = ROOT / 'assets/textures/groundsky'
SIGNATURE = bytes.fromhex('ab4b5458203230bb0d0a1a0a')
BUDGETS = dict(maxTextureBytes=12_000_000, maxFileBytes=4_000_000,
               maxGpuBytes=80_000_000)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def jsave(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    temporary.replace(path)


def run(command, log):
    line = '$ ' + shlex.join([str(x) for x in command])
    log.write(line + '\n')
    log.flush()
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    log.write(result.stdout + f'\n[exit {result.returncode}]\n')
    log.flush()
    if result.returncode:
        raise RuntimeError(f'Command failed: {line}\n{result.stdout}')
    return result.stdout


def astc_dfd(srgb, block=6):
    # Khronos BASICFORMAT v2: one 128-bit ASTC DATA sample, straight alpha.
    return (struct.pack('<IIHH', 44, 0, 2, 40)
            + bytes([162, 1 if srgb else 0, 2 if srgb else 1, 0])
            + bytes([block-1, block-1, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0])
            + struct.pack('<HBB4BII', 0, 127, 0, 0, 0, 0, 0, 0, 0xffffffff))


def kv_entry(key, value):
    raw = key.encode() + b'\0' + value.encode() + b'\0'
    return struct.pack('<I', len(raw)) + raw + b'\0' * (-len(raw) % 4)


def ktx_bytes(width, height, srgb, levels, block=6):
    """levels is largest-first [(width,height,raw ASTC blocks),...]."""
    dfd = astc_dfd(srgb, block)
    kv = kv_entry('KTXorientation', 'rd') + kv_entry(
        'KTXwriter', 'La Ladera groundsky; Arm astcenc 5.7.0')
    dfd_offset = 80 + 24 * len(levels)
    kv_offset = dfd_offset + len(dfd)
    payload = bytearray(SIGNATURE + struct.pack(
        '<13I2Q', ({4:157,6:165}[block] + int(srgb)), 1, width, height, 0, 0, 1,
        len(levels), 2, dfd_offset, len(dfd), kv_offset, len(kv), 0, 0))
    payload.extend(b'\0' * (24 * len(levels)))
    payload.extend(dfd)
    payload.extend(kv)
    descriptors = [None] * len(levels)
    # KTX requires smallest mip first on disk, largest first in the index.
    for i in reversed(range(len(levels))):
        w, h, raw = levels[i]
        expected = math.ceil(w / block) * math.ceil(h / block) * 16
        if len(raw) != expected:
            raise ValueError(f'Wrong ASTC block payload {len(raw)} != {expected}')
        encoded = zstandard.ZstdCompressor(level=19,threads=0,
                    write_content_size=True,write_checksum=True).compress(raw)
        # Supercompressed levels are tightly packed; KTX2 does not allow the
        # uncompressed-format mipPadding rule to introduce bytes here.
        offset = len(payload)
        payload.extend(encoded)
        struct.pack_into('<3Q', payload, 80 + 24 * i, offset, len(encoded), len(raw))
        descriptors[i] = dict(width=w, height=h, byteLength=len(encoded),
                              uncompressedByteLength=len(raw))
    return bytes(payload), descriptors


def reduce2(a):
    h, w = a.shape[:2]
    if h > 1:
        a = (a[0::2] + a[1::2]) * .5
    if w > 1:
        a = (a[:, 0::2] + a[:, 1::2]) * .5
    return a


def next_mip(rgba, record):
    a = np.asarray(rgba, dtype=np.float32) / 255
    role = record['role']
    if role == 'normal':
        normal = reduce2(a[:, :, :3] * 2 - 1)
        normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-7)
        out = np.concatenate([normal * .5 + .5,
                              np.ones((*normal.shape[:2], 1), np.float32)], axis=2)
    elif record['colourSpace'] == 'srgb':
        rgb, alpha = a[:, :, :3], a[:, :, 3:]
        linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
        new_alpha = reduce2(alpha)
        colour = reduce2(linear * alpha) / np.maximum(new_alpha, 1e-7)
        # Retain the author's RGB bleed in completely transparent mip texels.
        # Zeroing it would introduce dark halos at later bilinear boundaries.
        colour = np.where(new_alpha > 1e-7, colour, reduce2(linear))
        colour = np.where(colour <= .0031308, colour * 12.92,
                          1.055 * np.maximum(colour, 0) ** (1 / 2.4) - .055)
        out = np.concatenate([colour, new_alpha], axis=2)
    else:
        # Mask A is a fourth independent splat mask, not transparency.
        out = reduce2(a)
        if role == 'orm':
            out[:, :, 1] = np.sqrt(reduce2(a[:, :, 1:2] ** 2)[:, :, 0])
    return Image.fromarray(np.clip(np.round(out * 255), 0, 255).astype(np.uint8))


def metadata():
    ground = json.loads((DEV / 'ground-metadata.json').read_text())
    sky = json.loads((DEV / 'sky-metadata.json').read_text())
    records = ground['files'] + sky['files']
    if len(records) != 122 or len({r['path'] for r in records}) != 122:
        raise ValueError('Expected 122 distinct PNG masters')
    for r in records:
        r['format'] = 'png'
    return ground, records


def simplify_low_contrast_blocks(raw, image, record, block=6):
    """Bounded rate reduction: use standard ASTC constant blocks where suitable.

    The full-resolution master is never resized here. Only 6x6 regions whose
    RMS residual is below the fixed bound are simplified. Sharp silhouettes,
    cracks, blades and high-contrast window groups keep Arm's normal encoding.
    Constant endpoints use a small fixed quantisation lattice; normal means
    are re-normalised. The independent fidelity tool measures final KTX bytes.
    """
    rgba = np.asarray(image, dtype=np.float32)
    h, w = rgba.shape[:2]
    bw, bh = math.ceil(w/block), math.ceil(h/block)
    padded = np.pad(rgba, ((0,bh*block-h),(0,bw*block-w),(0,0)), mode='edge')
    blocks = padded.reshape(bh,block,bw,block,4).transpose(0,2,1,3,4).reshape(-1,block*block,4)
    means = blocks.mean(axis=1)
    residual = np.sqrt(((blocks[:,:,:3]-means[:,None,:3])**2).mean(axis=(1,2)))
    limits = {'albedo':10.0, 'normal':16.0, 'orm':6.0, 'mask':16.0,
              'panorama':8.0, 'billboard':7.0, 'ramp':1.0}
    keep = residual <= limits[record['role']]
    # Preserve independent mask A and all real-opacity contours.
    alpha_error = np.sqrt(((blocks[:,:,3]-means[:,None,3])**2).mean(axis=1))
    keep &= alpha_error <= (16.0 if record['role']=='mask' else 1.0)
    if record['role']=='normal':
        n=means[:,:3]/127.5-1
        n/=np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-7)
        means[:,:3]=(n*.5+.5)*255
    # Masks were authored at 16 weights; snapping their means back onto that
    # same lattice avoids spending bytes on new interpolated weight values.
    quantum=17 if record['role']=='mask' else 8 if record['role'] in ('normal','orm','panorama') else 4
    means=np.clip(np.round(means/quantum)*quantum,0,255).astype(np.uint16)
    # Keep fully opaque surfaces truly opaque, and data metalness at zero.
    means[:,3]=np.where(blocks[:,:,3].min(axis=1)==255,255,means[:,3])
    if record['role']=='orm':
        means[:,2]=0
    out=np.frombuffer(raw,dtype=np.uint8).copy().reshape(-1,16)
    constant=np.empty_like(out)
    constant[:,:8]=[0xfc,0xfd,0xff,0xff,0xff,0xff,0xff,0xff]
    constant[:,8:]=(means*257).astype('<u2').view(np.uint8).reshape(-1,8)
    out[keep]=constant[keep]
    return out.tobytes()


def encode(record, astcenc, scratch, log, preview_out=None):
    src = ROOT / record['path']
    image = Image.open(src).convert('RGBA')
    width, height = image.size
    if [width, height] != [record['width'], record['height']]:
        raise ValueError(f'Dimensions do not match metadata: {src}')
    levels = []
    block=4 if record['kind']=='vegetation' else 6
    for level in range(max(width, height).bit_length()):
        mip_in = scratch / f'mip-{level}.png'
        mip_out = scratch / f'mip-{level}.astc'
        image.save(mip_in)
        profile = '-cs' if record['colourSpace'] == 'srgb' else '-cl'
        command = [astcenc, profile, str(mip_in), str(mip_out), f'{block}x{block}',
                   '-medium', '-j', '2', '-silent']
        if record['kind']=='vegetation':
            command += ['-cw','1','1','1','2']
        # RGB normal storage is retained: no implicit swizzle requiring a shader.
        run(command, log)
        raw = mip_out.read_bytes()
        if raw[:4] != bytes.fromhex('13aba15c') or raw[4:7] != bytes([block, block, 1]):
            raise ValueError(f'Encoder did not produce ASTC {block}x{block} blocks')
        blocks = simplify_low_contrast_blocks(raw[16:], image, record, block)
        raw = raw[:16] + blocks
        mip_out.write_bytes(raw)
        levels.append((*image.size, blocks))
        if level == 0 and preview_out:
            preview_path = preview_out / Path(record['path']).relative_to('dev/groundsky/masters')
            preview_path.parent.mkdir(parents=True, exist_ok=True)
            run([astcenc, '-ds' if profile == '-cs' else '-dl', str(mip_out),
                 str(preview_path), '-j', '2', '-silent'], log)
        if max(image.size) > 1:
            image = next_mip(image, record)
    data, mips = ktx_bytes(width, height, record['colourSpace'] == 'srgb', levels, block)
    relative = Path(record['path']).relative_to('dev/groundsky/masters').with_suffix('.ktx2')
    destination = TEX / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.ktx2.tmp')
    temporary.write_bytes(data)
    temporary.replace(destination)
    delivered = {**record, 'id': record['id'] + '_astc', 'format': 'ktx2',
                 'path': destination.relative_to(ROOT).as_posix(),
                 'derivedFrom': record['path'], 'derivedSha256': sha(src), 'blockSize': [block, block],
                 'supercompression': 'zstd', 'mipLevels': mips,
                 'gpuBytes': sum(m['uncompressedByteLength'] for m in mips)}
    return delivered


def existing_delivery(record):
    destination = TEX / Path(record['path']).relative_to('dev/groundsky/masters').with_suffix('.ktx2')
    data = destination.read_bytes()
    old_path=ROOT / 'assets/models/manifest.groundsky.json'
    if not old_path.exists():
        raise RuntimeError('Cannot reuse delivery without an existing pinned manifest; perform a full encode')
    old=json.loads(old_path.read_text())
    previous=next((r for r in old['files'] if r['path']==destination.relative_to(ROOT).as_posix()),None)
    if not previous or previous.get('derivedSha256')!=sha(ROOT/record['path']) or previous.get('sha256')!=sha(destination):
        raise RuntimeError(f'Stale or unpinned delivery for {record["id"]}; re-encode this source')
    count = struct.unpack_from('<I', data, 40)[0]
    block=4 if struct.unpack_from('<I',data,12)[0] in (157,158) else 6
    mips = []
    for i in range(count):
        _, size, raw = struct.unpack_from('<3Q', data, 80 + i * 24)
        mips.append(dict(width=max(1, record['width'] >> i),
                         height=max(1, record['height'] >> i),
                         byteLength=size, uncompressedByteLength=raw))
    return {**record, 'id': record['id'] + '_astc', 'format': 'ktx2',
            'path': destination.relative_to(ROOT).as_posix(), 'derivedFrom': record['path'],
            'derivedSha256': sha(ROOT / record['path']),
            'blockSize': [block, block], 'supercompression': 'zstd' if struct.unpack_from('<I',data,44)[0]==2 else 'zlib', 'mipLevels': mips,
            'gpuBytes': sum(m['uncompressedByteLength'] for m in mips)}


def write_manifest(ground, records, delivery):
    # Measure first, then use the exact same fresh pins in both JSON files.
    # Delivery rows initially inherit source metadata, never source byte pins.
    all_records = [{**r, 'bytes': (ROOT / r['path']).stat().st_size,
                    'sha256': sha(ROOT / r['path'])} for r in records+delivery]
    catalogue = dict(schemaVersion=1, libraryOnly=True, license='CC0-1.0',
                     units='metres', materials=ground.get('materials', []), files=all_records,
                     gpuContract=dict(delivery='ASTC LDR KTX2: 4x4 vegetation, 6x6 other maps; Zstandard scheme 2',
                                      resident='All 122 delivery textures, all mip levels, all TODs and LODs',
                                      masters='PNG authoring copies are not simultaneously uploaded',
                                      requiredSupport='Native ASTC LDR; no automatic RGBA8 fallback fits the cap'))
    jsave(ROOT / 'tools/groundsky.catalog.json', catalogue)
    files = all_records
    masters_bytes = sum(r['bytes'] for r in files if r['format'] == 'png')
    delivery_bytes = sum(r['bytes'] for r in files if r['format'] == 'ktx2')
    gpu_bytes = sum(r['gpuBytes'] for r in delivery)
    rgba_bytes = 0
    for r in records:
        w, h = r['width'], r['height']
        while True:
            rgba_bytes += w * h * 4
            if max(w, h) == 1:
                break
            w, h = max(1, w // 2), max(1, h // 2)
    review = json.loads((DEV / 'review-metadata.json').read_text()) if (DEV / 'review-metadata.json').exists() else {'files': []}
    for r in review['files']:
        r.update(bytes=(ROOT / r['path']).stat().st_size, sha256=sha(ROOT / r['path']))
    total = masters_bytes + delivery_bytes
    largest = max(r['bytes'] for r in files)
    within = total <= BUDGETS['maxTextureBytes'] and largest <= BUDGETS['maxFileBytes'] and gpu_bytes <= BUDGETS['maxGpuBytes']
    manifest = dict(schemaVersion=1, libraryOnly=True, complete=within,
                    license='CC0-1.0', generator=dict(script='tools/groundsky_build.py',
                    astcenc='5.7.0', threads=2), budgets=BUDGETS,
                    catalogue=dict(path='tools/groundsky.catalog.json',
                                   bytes=(ROOT / 'tools/groundsky.catalog.json').stat().st_size,
                                   sha256=sha(ROOT / 'tools/groundsky.catalog.json')),
                    files=files, materials=ground.get('materials', []),
                    totals=dict(masterPngCount=len(records), deliveryCount=len(delivery),
                                masterPngBytes=masters_bytes, deliveryBytes=delivery_bytes,
                                textureBytes=total, gpuBytes=gpu_bytes,
                                uncompressedRgba8WithMipsBytes=rgba_bytes,
                                largestTextureBytes=largest), review=review)
    jsave(ROOT / 'assets/models/manifest.groundsky.json', manifest)
    print(json.dumps(manifest['totals'], indent=2), flush=True)
    if not within:
        raise RuntimeError('Fixed texture budget exceeded; manifest marked incomplete')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--astcenc', default='astcenc')
    parser.add_argument('--manifest-only', action='store_true')
    parser.add_argument('--only', help='Comma-separated source IDs for a partial re-encode; all delivery files must exist')
    parser.add_argument('--preview-out', type=Path, help='Scratch directory for decoded delivery pixels used by review renders')
    parser.add_argument('--log', type=Path, default=DEV / 'verification/package.log')
    args = parser.parse_args()
    try:
        os.nice(max(0, 19 - os.getpriority(os.PRIO_PROCESS, 0)))
    except (AttributeError, OSError):
        pass
    ground, records = metadata()
    wanted = set(args.only.split(',')) if args.only else None
    args.log.parent.mkdir(parents=True, exist_ok=True)
    with args.log.open('w') as log, tempfile.TemporaryDirectory(prefix='groundsky-encode-') as temp:
        log.write('UTC ' + time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()) + '\n')
        log.write('$ ' + shlex.join(sys.argv) + '\n')
        delivery = []
        for i, record in enumerate(records):
            if args.manifest_only or (wanted and record['id'] not in wanted):
                result = existing_delivery(record)
            else:
                result = encode(record, args.astcenc, Path(temp), log, args.preview_out)
                print(f'{i+1:3}/{len(records)} {record["id"]}: {(ROOT / result["path"]).stat().st_size:,} bytes', flush=True)
            delivery.append(result)
        write_manifest(ground, records, delivery)
        log.write('[package complete]\n')


if __name__ == '__main__':
    main()
