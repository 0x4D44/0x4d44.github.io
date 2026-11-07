"""Lossless final GLB buffer layout for the dormant wearable library.

Group physically adjacent views by their use to improve gzip's finite window.
Accessor and view array indices, bytes, strides, types and references stay exact;
only bufferView.byteOffset and the embedded buffer length may change. The final
packer calls this after every geometric edit and CPU target has been emitted.
"""
from __future__ import annotations

import copy
import json
import struct


# Keep original order inside each category. Shared/interleaved views whose
# accessors have multiple uses remain intact in the final "other" category.
VIEW_ROLE_ORDER = ('rig', 'position', 'target', 'normal', 'uv', 'indices',
                   'identity', 'joints', 'weights', 'other')
_ATTRIBUTE_ROLE = {'POSITION': 'position', 'NORMAL': 'normal',
                   'TEXCOORD_0': 'uv', 'JOINTS_0': 'joints',
                   'WEIGHTS_0': 'weights'}


def _decode_glb(source):
    data = bytes(source)
    if len(data) < 28:
        raise ValueError('Wear layout requires a complete GLB container')
    magic, version, size = struct.unpack_from('<III', data)
    if magic != 0x46546C67 or version != 2 or size != len(data):
        raise ValueError('Wear layout requires an exact GLB 2 container length')
    json_length, json_kind = struct.unpack_from('<II', data, 12)
    binary_header = 20 + json_length
    if json_kind != 0x4E4F534A or json_length % 4 or binary_header + 8 > len(data):
        raise ValueError('Wear layout requires one aligned JSON chunk')
    document = json.loads(data[20:binary_header])
    binary_length, binary_kind = struct.unpack_from('<II', data, binary_header)
    if binary_kind != 0x004E4942 or binary_length % 4 or binary_header + 8 + binary_length != len(data):
        raise ValueError('Wear layout requires one complete aligned BIN chunk')
    buffers = document.get('buffers', [])
    if len(buffers) != 1 or 'uri' in buffers[0]:
        raise ValueError('Wear layout requires one embedded buffer')
    binary = data[binary_header + 8:]
    byte_length = buffers[0].get('byteLength')
    if not isinstance(byte_length, int) or not 0 <= len(binary) - byte_length <= 3:
        raise ValueError('Wear layout embedded buffer length disagrees with BIN')
    views = document.get('bufferViews', [])
    for view in views:
        offset, length = view.get('byteOffset', 0), view.get('byteLength')
        if view.get('buffer') != 0 or not isinstance(offset, int) or not isinstance(length, int) or offset < 0 or length < 0 or offset + length > byte_length:
            raise ValueError('Wear layout bufferView is outside the embedded buffer')
    for accessor in document.get('accessors', []):
        view = accessor.get('bufferView')
        if view is not None and (not isinstance(view, int) or not 0 <= view < len(views)):
            raise ValueError('Wear layout accessor has an invalid bufferView')
    return document, binary


def _semantic_view_order(document):
    views = document.get('bufferViews', [])
    accessors = document.get('accessors', [])
    roles = [set() for _ in views]

    def mark(index, role):
        if index is None:
            return
        if not isinstance(index, int) or not 0 <= index < len(accessors):
            raise ValueError('Wear layout semantic reference has an invalid accessor')
        view = accessors[index].get('bufferView')
        if view is not None:
            roles[view].add(role)

    for mesh in document.get('meshes', []):
        for primitive in mesh.get('primitives', []):
            for name, accessor in primitive.get('attributes', {}).items():
                mark(accessor, _ATTRIBUTE_ROLE.get(name, 'other'))
            mark(primitive.get('indices'), 'indices')
    for skin in document.get('skins', []):
        mark(skin.get('inverseBindMatrices'), 'rig')
    for node in document.get('nodes', []):
        extras = node.get('extras', {})
        mark(extras.get('sourceIndicesAccessor'), 'identity')
        mark(extras.get('poseTarget', {}).get('deltaAccessor'), 'target')
    ranks = {name: i for i, name in enumerate(VIEW_ROLE_ORDER)}
    kinds = [next(iter(row)) if len(row) == 1 else 'other' for row in roles]
    return sorted(range(len(views)), key=lambda index: (ranks[kinds[index]], index))


def _reorder_document(document, binary, order):
    output = copy.deepcopy(document)
    packed = bytearray()
    for index in order:
        view = document['bufferViews'][index]
        packed.extend(b'\0' * ((-len(packed)) % 4))
        output['bufferViews'][index]['byteOffset'] = len(packed)
        offset, length = view.get('byteOffset', 0), view['byteLength']
        packed.extend(binary[offset:offset + length])
    output['buffers'][0]['byteLength'] = len(packed)
    return output, bytes(packed)


def reorder_wear_buffer_views(source):
    """Return reordered GLB bytes and compact diagnostic layout measurements.

    Whole views are copied, including every strided/interleaved padding byte.
    No accessor is reconstructed, quantized, renumbered, or made GPU-visible.
    """
    document, binary = _decode_glb(source)
    order = _semantic_view_order(document)
    output, packed = _reorder_document(document, binary, order)
    encoded = json.dumps(output, separators=(',', ':')).encode('utf8')
    encoded += b' ' * ((-len(encoded)) % 4)
    binary_chunk = packed + b'\0' * ((-len(packed)) % 4)
    result = (struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary_chunk))
              + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
              + struct.pack('<II', len(binary_chunk), 0x004E4942) + binary_chunk)
    metrics = {'method': 'lossless-semantic-buffer-view-order', 'order': 'skin-last',
               'bufferViews': len(order), 'accessors': len(document.get('accessors', [])),
               'binaryBytesBefore': document['buffers'][0]['byteLength'],
               'binaryBytesAfter': len(packed)}
    return result, metrics
