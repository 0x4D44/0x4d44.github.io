"""Preserve the original resident animation ABI without re-sampling 30 Blender armatures.

The runtime keeps only bone quaternion tracks. This source bank retains their original
FLOAT bytes, keyframe times, interpolation and clip names; translation/scale tracks are
discarded exactly as CharacterLibrary.parse() already discards them.

Regenerate from a known source export (no Blender or third-party Python modules needed):
  node la-ladera/tools/nice.mjs python la-ladera/tools/blender/people_clips.py extract \
    path/to/original/people.glb --source-ref <commit-or-url>

Append to a geometry-only export:
  node la-ladera/tools/nice.mjs python la-ladera/tools/blender/people_clips.py append \
    path/to/new/people.glb

The builder imports append_clips(path). The default source is the compressed JSON bank
beside this module, committed with the generator; the game never requests that bank.
"""
from __future__ import annotations

import argparse
import base64
import copy
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import struct

HERE = Path(__file__).resolve().parent
BANK_PATH = HERE / 'people_clips.json.gz'
CONTRACT_PATH = HERE / 'people_contract.json'
SIZES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def _check(condition, message):
    if not condition:
        raise ValueError(message)


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _canon(name):
    return re.sub(r'_\d+$', '', name)


def _contract():
    return json.loads(CONTRACT_PATH.read_text(encoding='utf8'))


def _read_glb(path):
    data = Path(path).read_bytes()
    _check(len(data) >= 28 and struct.unpack_from('<III', data) == (0x46546C67, 2, len(data)), 'Invalid GLB 2 header')
    gltf = None
    binary = None
    offset = 12
    while offset < len(data):
        _check(offset + 8 <= len(data), 'Truncated GLB chunk')
        size, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        _check(size % 4 == 0 and offset + size <= len(data), 'Invalid GLB chunk length')
        chunk = data[offset:offset + size]
        if kind == 0x4E4F534A:
            _check(gltf is None and offset == 20, 'Duplicate or misplaced GLB JSON')
            gltf = json.loads(chunk)
        elif kind == 0x004E4942:
            _check(binary is None, 'Duplicate GLB BIN')
            binary = chunk
        else:
            raise ValueError('Unsupported GLB chunk')
        offset += size
    _check(gltf is not None and binary is not None, 'GLB requires JSON and BIN')
    _check(len(gltf.get('buffers', [])) == 1 and 'uri' not in gltf['buffers'][0], 'Expected one internal geometry buffer')
    length = gltf['buffers'][0]['byteLength']
    _check(0 <= len(binary) - length <= 3, 'GLB BIN length mismatch')
    return gltf, binary[:length], data


def _glb_bytes(gltf, binary):
    gltf['buffers'] = [{'byteLength': len(binary)}]
    text = json.dumps(gltf, separators=(',', ':'), ensure_ascii=False).encode('utf8')
    text += b' ' * (-len(text) % 4)
    padded = binary + b'\0' * (-len(binary) % 4)
    return (struct.pack('<III', 0x46546C67, 2, 28 + len(text) + len(padded))
            + struct.pack('<II', len(text), 0x4E4F534A) + text
            + struct.pack('<II', len(padded), 0x004E4942) + padded)


def _accessor_bytes(gltf, binary, index):
    a = gltf['accessors'][index]
    _check('sparse' not in a and 'bufferView' in a, 'Animation bank requires ordinary binary accessors')
    v = gltf['bufferViews'][a['bufferView']]
    width = SIZES[a['componentType']] * WIDTHS[a['type']]
    stride = v.get('byteStride', width)
    offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    _check(v.get('buffer', 0) == 0 and a['count'] > 0 and stride >= width and
           offset + (a['count'] - 1) * stride + width <= len(binary), 'Animation accessor outside BIN')
    return b''.join(binary[offset + i * stride:offset + i * stride + width] for i in range(a['count']))


def rotation_signature(gltf, binary):
    """Stable digest of semantic targets and raw sample bytes, independent of node/view offsets."""
    digest = hashlib.sha256()
    for animation in gltf.get('animations', []):
        tracks = sorted((c for c in animation['channels'] if c['target']['path'] == 'rotation'),
                        key=lambda c: _canon(gltf['nodes'][c['target']['node']]['name']))
        for c in tracks:
            sampler = animation['samplers'][c['sampler']]
            bone = _canon(gltf['nodes'][c['target']['node']]['name'])
            record = [animation['name'], bone, sampler.get('interpolation', 'LINEAR')]
            for field in ('input', 'output'):
                accessor = gltf['accessors'][sampler[field]]
                record.append([accessor['componentType'], accessor['type'], accessor['count'], accessor.get('normalized', False)])
            digest.update(json.dumps(record, separators=(',', ':')).encode('utf8'))
            for field in ('input', 'output'):
                payload = _accessor_bytes(gltf, binary, sampler[field])
                digest.update(struct.pack('<I', len(payload)))
                digest.update(payload)
    return digest.hexdigest()


def _check_clips(gltf, binary, contract):
    animations = gltf.get('animations', [])
    _check([a['name'] for a in animations] == contract['clips'], 'Expected the exact original 32 clips in original order')
    wanted = set(contract['bones'])
    for a in animations:
        rotations = [c for c in a['channels'] if c['target']['path'] == 'rotation']
        names = [_canon(gltf['nodes'][c['target']['node']]['name']) for c in rotations]
        _check(len(names) == len(wanted) and set(names) == wanted, a['name'] + ': expected one quaternion track per canonical bone')
        duration = 0.0
        for channel in rotations:
            sampler = a['samplers'][channel['sampler']]
            ai, ao = gltf['accessors'][sampler['input']], gltf['accessors'][sampler['output']]
            _check(ai['componentType'] == 5126 and ai['type'] == 'SCALAR' and ao['componentType'] == 5126 and ao['type'] == 'VEC4' and ai['count'] == ao['count'], a['name'] + ': invalid animation accessors')
            times = struct.unpack('<' + 'f' * ai['count'], _accessor_bytes(gltf, binary, sampler['input']))
            _check(len(times) >= 2 and all(t >= 0 for t in times) and all(b > a for a, b in zip(times, times[1:])), a['name'] + ': invalid animation times')
            duration = max(duration, times[-1] - times[0])
        _check(abs(duration - contract['clipFrames'][a['name']] / contract['fps']) < 0.05, a['name'] + ': clipFrames/fps changed')


def extract_bank(source_path, bank_path=BANK_PATH, source_ref=None):
    """Extract the exact bytes needed by the runtime, with deterministic gzip and provenance."""
    source, source_bin, source_bytes = _read_glb(source_path)
    contract = _contract()
    _check_clips(source, source_bin, contract)
    target = {'asset': {'version': '2.0', 'generator': 'La Ladera original quaternion clip bank'},
              'nodes': [{'name': name} for name in contract['bones']],
              'animations': [], 'bufferViews': [], 'accessors': [], 'buffers': []}
    node_map = {n['name']: i for i, n in enumerate(target['nodes'])}
    views, accessors, binary = {}, {}, bytearray()

    def copy_accessor(index):
        if index in accessors:
            return accessors[index]
        a = copy.deepcopy(source['accessors'][index])
        _check('sparse' not in a and 'bufferView' in a, 'Sparse or missing animation accessor')
        vi = a['bufferView']
        if vi not in views:
            v = copy.deepcopy(source['bufferViews'][vi])
            _check(v.get('buffer', 0) == 0, 'External animation buffer')
            begin = v.get('byteOffset', 0)
            payload = source_bin[begin:begin + v['byteLength']]
            _check(len(payload) == v['byteLength'], 'Truncated animation bufferView')
            binary.extend(b'\0' * (-len(binary) % 4))
            v['byteOffset'], v['buffer'] = len(binary), 0
            binary.extend(payload)
            views[vi] = len(target['bufferViews'])
            target['bufferViews'].append(v)
        a['bufferView'] = views[vi]
        accessors[index] = len(target['accessors'])
        target['accessors'].append(a)
        return accessors[index]

    for animation in source['animations']:
        out = {'name': animation['name'], 'samplers': [], 'channels': []}
        for c in animation['channels']:
            if c['target']['path'] != 'rotation':
                continue
            s = copy.deepcopy(animation['samplers'][c['sampler']])
            s['input'], s['output'] = copy_accessor(s['input']), copy_accessor(s['output'])
            out['channels'].append({'sampler': len(out['samplers']), 'target': {
                'node': node_map[_canon(source['nodes'][c['target']['node']]['name'])], 'path': 'rotation'}})
            out['samplers'].append(s)
        target['animations'].append(out)
    target['buffers'] = [{'byteLength': len(binary)}]
    source_signature = rotation_signature(source, source_bin)
    _check(rotation_signature(target, binary) == source_signature, 'Extraction changed original quaternion sample bytes')
    bank = {'schema': 1, 'provenance': {'source': source_ref or Path(source_path).name,
            'sourceSha256': _sha(source_bytes), 'sourceBytes': len(source_bytes), 'rotationSha256': source_signature,
            'note': 'Original project-generated animation samples. Rotation-only selection matches CharacterLibrary.parse; no retiming, resampling, float conversion or external motion source.'},
            'contract': {k: contract[k] for k in ('bones', 'clips', 'fps', 'clipFrames', 'oneShotClips')},
            'gltf': target, 'binaryBase64': base64.b64encode(binary).decode('ascii')}
    encoded = json.dumps(bank, separators=(',', ':'), ensure_ascii=False).encode('utf8')
    packed = gzip.compress(encoded, compresslevel=9, mtime=0)
    Path(bank_path).write_bytes(packed)
    return {'bank': str(bank_path), 'bytes': len(packed), 'rawAnimationBytes': len(binary),
            'clips': len(target['animations']), 'rotationTracks': sum(len(a['channels']) for a in target['animations']),
            **bank['provenance']}


def read_bank(bank_path=BANK_PATH):
    packed = Path(bank_path).read_bytes()
    bank = json.loads(gzip.decompress(packed))
    _check(bank.get('schema') == 1, 'Unknown people clip-bank schema')
    contract = _contract()
    for key in ('bones', 'clips', 'fps', 'clipFrames', 'oneShotClips'):
        _check(bank['contract'][key] == contract[key], 'Clip-bank contract mismatch: ' + key)
    gltf, binary = bank['gltf'], base64.b64decode(bank['binaryBase64'], validate=True)
    _check(gltf['buffers'] == [{'byteLength': len(binary)}], 'Clip-bank BIN length mismatch')
    _check_clips(gltf, binary, contract)
    _check(rotation_signature(gltf, binary) == bank['provenance']['rotationSha256'], 'Clip-bank sample digest mismatch')
    return bank, binary, _sha(packed)


def append_clips(path, bank_path=BANK_PATH):
    """Append original rotation tracks to the first compatible armature of a geometry-only GLB.

    Full builds bind to person_m_tendero. A single-ID smoke build may use another resident;
    the canonical bone names are still unchanged and the runtime retargets them normally.
    The target is atomically replaced only after the sample digest is checked.
    """
    gltf, old_binary, _ = _read_glb(path)
    _check(not gltf.get('animations'), 'append_clips requires a geometry-only export (animations already present)')
    bank, bank_binary, bank_sha = read_bank(bank_path)
    contract = _contract()
    roots = {n.get('name'): i for i, n in enumerate(gltf['nodes'])}
    armature = next((roots['person_' + p['id']] for p in contract['people'] if 'person_' + p['id'] in roots), None)
    _check(armature is not None, 'No person_<id> armature in geometry export')
    descendants = set()

    def visit(index):
        _check(index not in descendants, 'Cyclic armature tree')
        descendants.add(index)
        for child in gltf['nodes'][index].get('children', []):
            visit(child)

    visit(armature)
    node_map = {_canon(gltf['nodes'][i].get('name', '')): i for i in descendants
                if _canon(gltf['nodes'][i].get('name', '')) in contract['bones']}
    _check(set(node_map) == set(contract['bones']), 'Target armature is missing a canonical bone')
    binary = bytearray(old_binary)
    binary.extend(b'\0' * (-len(binary) % 4))
    bin_start = len(binary)
    binary.extend(bank_binary)
    view_start, accessor_start = len(gltf.get('bufferViews', [])), len(gltf.get('accessors', []))
    for original in bank['gltf']['bufferViews']:
        view = copy.deepcopy(original)
        view['byteOffset'] = view.get('byteOffset', 0) + bin_start
        gltf.setdefault('bufferViews', []).append(view)
    for original in bank['gltf']['accessors']:
        accessor = copy.deepcopy(original)
        accessor['bufferView'] += view_start
        gltf.setdefault('accessors', []).append(accessor)
    gltf['animations'] = copy.deepcopy(bank['gltf']['animations'])
    for animation in gltf['animations']:
        for sampler in animation['samplers']:
            sampler['input'] += accessor_start
            sampler['output'] += accessor_start
        for channel in animation['channels']:
            source_name = bank['gltf']['nodes'][channel['target']['node']]['name']
            channel['target']['node'] = node_map[source_name]
    signature = rotation_signature(gltf, binary)
    _check(signature == bank['provenance']['rotationSha256'], 'Appended clips changed original sample bytes')
    gltf['asset'].setdefault('extras', {})['peopleClips'] = {
        'bankSha256': bank_sha, 'sourceSha256': bank['provenance']['sourceSha256'],
        'rotationSha256': signature, 'rotationOnly': True, 'clipCount': len(gltf['animations'])}
    data = _glb_bytes(gltf, bytes(binary))
    temporary = Path(str(path) + '.clips-tmp')
    try:
        temporary.write_bytes(data)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return {'file': str(path), 'clips': len(gltf['animations']), 'bytes': len(data),
            'rotationTracks': sum(len(a['channels']) for a in gltf['animations']),
            'rotationSha256': signature, 'bankSha256': bank_sha}


def verify_clips(path, bank_path=BANK_PATH):
    """Compare a source or generated GLB with the committed bank, ignoring discarded tracks."""
    bank, _, bank_sha = read_bank(bank_path)
    gltf, binary, _ = _read_glb(path)
    _check_clips(gltf, binary, _contract())
    signature = rotation_signature(gltf, binary)
    _check(signature == bank['provenance']['rotationSha256'], 'GLB quaternion/time bytes differ from the original clip bank')
    return {'file': str(path), 'clips': len(gltf['animations']), 'rotationSha256': signature, 'bankSha256': bank_sha, 'exact': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    subs = parser.add_subparsers(dest='command', required=True)
    for command in ('extract', 'append', 'verify'):
        p = subs.add_parser(command)
        p.add_argument('path', type=Path)
        p.add_argument('--bank', type=Path, default=BANK_PATH)
        if command == 'extract':
            p.add_argument('--source-ref', help='Commit or source URL recorded with the original GLB hash')
    args = parser.parse_args()
    if args.command == 'extract':
        result = extract_bank(args.path, args.bank, args.source_ref)
    elif args.command == 'append':
        result = append_clips(args.path, args.bank)
    else:
        result = verify_clips(args.path, args.bank)
    print(json.dumps(result, indent=2))
