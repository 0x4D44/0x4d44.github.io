"""Independent binary controls and in-memory mutants for final GLB layout."""
from __future__ import annotations

import argparse
import copy
import inspect
import json
import struct
import sys
import textwrap

import people_wear_layout as layout


COMPONENTS = {5120: ('b', 1), 5121: ('B', 1), 5123: ('H', 2), 5126: ('f', 4)}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def container(document, binary):
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    data = bytes(binary) + b'\0' * (-len(binary) % 4)
    return (struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(data))
            + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
            + struct.pack('<II', len(data), 0x004E4942) + data)


def parse(data):
    # Do not use the production decoder: verify the emitted container itself.
    assert struct.unpack_from('<III', data) == (0x46546C67, 2, len(data))
    at = 12
    chunks = []
    while at < len(data):
        size, kind = struct.unpack_from('<II', data, at)
        assert size % 4 == 0 and at + 8 + size <= len(data)
        chunks.append((kind, data[at + 8:at + 8 + size])); at += 8 + size
    assert at == len(data) and len(chunks) == 2
    assert chunks[0][0] == 0x4E4F534A and chunks[1][0] == 0x004E4942
    return json.loads(chunks[0][1]), chunks[1][1]


def fixture(interleaved=False):
    rows = [
        struct.pack('<9f', .01, -.02, .03, -.04, .05, .06, .07, -.08, .09),
        bytes([204, 51, 0, 0] * 3),
        struct.pack('<3H', 0, 1, 2),
        struct.pack('<9f', -0., 1e-30, 0., 1., 0., 0., 0., 1., 0.),
        bytes([0, 0, 127, 111, 0, 0, 127, 113, 0, 0, 127, 117]),
        bytes([0, 0, 255, 0, 0, 255]),
        bytes([0, 1, 0, 0] * 3),
        struct.pack('<16f', *(1. if i % 5 == 0 else 0. for i in range(16))),
        struct.pack('<3H', 2, 1, 0),
        b'\xff\x00\x80\x0f\x81',
    ]
    if interleaved:
        rows[3] = b''.join(rows[3][i * 12:(i + 1) * 12] + rows[4][i * 4:(i + 1) * 4] for i in range(3))
    binary = bytearray(); views = []
    for index, row in enumerate(rows):
        binary.extend(b'\0' * (-len(binary) % 4))
        view = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(row), 'name': 'fixture-view-' + str(index)}
        if index in (1, 3, 4, 5, 6): view['target'] = 34962
        if index in (2, 8): view['target'] = 34963
        if index == 4: view['byteStride'] = 4
        if index == 3 and interleaved: view['byteStride'] = 16
        views.append(view); binary.extend(row)
    types = [(5126, 'VEC3', 3), (5121, 'VEC4', 3), (5123, 'SCALAR', 3),
             (5126, 'VEC3', 3), (5120, 'VEC3', 3), (5121, 'VEC2', 3),
             (5121, 'VEC4', 3), (5126, 'MAT4', 1), (5123, 'SCALAR', 3)]
    accessors = [{'bufferView': i, 'componentType': component, 'count': count, 'type': kind, 'name': 'fixture-accessor-' + str(i)} for i, (component, kind, count) in enumerate(types)]
    for index in (1, 4, 5): accessors[index]['normalized'] = True
    accessors[3].update(min=[0., 0., 0.], max=[1., 1., 0.])
    if interleaved: accessors[4].update(bufferView=3, byteOffset=12)
    document = {'asset': {'version': '2.0', 'generator': 'independent-layout-test'},
                'buffers': [{'byteLength': len(binary), 'name': 'preserved-buffer-name'}],
                'bufferViews': views, 'accessors': accessors,
                'meshes': [{'primitives': [{'attributes': {'POSITION': 3, 'NORMAL': 4, 'TEXCOORD_0': 5, 'JOINTS_0': 6, 'WEIGHTS_0': 1}, 'indices': 2, 'material': 0}]}],
                'skins': [{'inverseBindMatrices': 7, 'joints': [1, 2], 'skeleton': 1}],
                'nodes': [{'name': 'wear_fixture', 'mesh': 0, 'skin': 0, 'extras': {'sourceIndicesAccessor': 8, 'poseTarget': {'deltaAccessor': 0, 'basePositionAccessor': 3, 'kind': 'seated', 'activation': {'source': 'kept'}}}}, {'name': 'joint_a'}, {'name': 'joint_b'}],
                'materials': [{'name': 'kept', 'extras': {'odd': '\u00e1'}}],
                'scenes': [{'nodes': [0]}], 'scene': 0,
                'extensionsUsed': ['fixture-kept'], 'extensions': {'fixture-kept': {'data': [9, 7, 2]}}}
    return container(document, binary)


def accessor_bytes(document, binary, index):
    accessor = document['accessors'][index]
    view = document['bufferViews'][accessor['bufferView']]
    width = WIDTH[accessor['type']] * COMPONENTS[accessor['componentType']][1]
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = view.get('byteStride', width)
    return b''.join(binary[start + i * stride:start + i * stride + width] for i in range(accessor['count']))


def gpu_bytes(document):
    ids = {ai for mesh in document['meshes'] for primitive in mesh['primitives'] for ai in [primitive['indices'], *primitive['attributes'].values()]}
    ids.update(n['extras']['sourceIndicesAccessor'] for n in document['nodes'] if 'sourceIndicesAccessor' in n.get('extras', {}))
    views = {document['accessors'][ai]['bufferView'] for ai in ids}
    return sum(document['bufferViews'][vi]['byteLength'] for vi in views)


def prove(source, result):
    old, ob = parse(source); new, nb = parse(result)
    assert old['accessors'] == new['accessors'], 'accessor descriptor changed'
    assert len(old['bufferViews']) == len(new['bufferViews']), 'bufferView inventory changed'
    for index, (a, b) in enumerate(zip(old['bufferViews'], new['bufferViews'])):
        assert {k: v for k, v in a.items() if k != 'byteOffset'} == {k: v for k, v in b.items() if k != 'byteOffset'}, ('view descriptor changed', index)
        start, after = a.get('byteOffset', 0), b.get('byteOffset', 0)
        assert ob[start:start + a['byteLength']] == nb[after:after + b['byteLength']], ('view bytes changed', index)
        assert after % 4 == 0, ('unaligned view', index)
    for index in range(len(old['accessors'])):
        assert accessor_bytes(old, ob, index) == accessor_bytes(new, nb, index), ('accessor values changed', index)
    left, right = copy.deepcopy(old), copy.deepcopy(new)
    for document in (left, right):
        document['buffers'][0].pop('byteLength')
        for view in document['bufferViews']: view.pop('byteOffset', None)
    assert left == right, 'non-layout JSON changed'
    assert gpu_bytes(old) == gpu_bytes(new), 'GPU payload changed'
    return new, nb


def succeed(source):
    try:
        return layout.reorder_wear_buffer_views(source)
    except Exception as error:
        raise AssertionError('Valid GLB layout rejected: ' + str(error)) from error


def exact_views():
    source = fixture(); result, metrics = succeed(source); output, _ = prove(source, result)
    physical = sorted(range(len(output['bufferViews'])), key=lambda i: output['bufferViews'][i]['byteOffset'])
    assert physical == [7, 3, 0, 4, 5, 2, 8, 6, 1, 9], physical
    assert metrics['order'] == 'skin-last' and metrics['bufferViews'] == 10 and metrics['accessors'] == 9
    assert result != source


def strides_targets():
    source = fixture(interleaved=True); result, _ = succeed(source); output, binary = prove(source, result)
    assert output['bufferViews'][3]['byteStride'] == 16
    assert output['accessors'][4]['bufferView'] == 3 and output['accessors'][4]['byteOffset'] == 12
    target = output['nodes'][0]['extras']['poseTarget']; assert target['deltaAccessor'] == 0 and target['basePositionAccessor'] == 3
    view = output['bufferViews'][output['accessors'][0]['bufferView']]
    assert 'target' not in view and 'byteStride' not in view, 'CPU target became GPU data'
    assert all(0 not in p['attributes'].values() for m in output['meshes'] for p in m['primitives'])
    values = struct.unpack('<9f', accessor_bytes(output, binary, 0))
    expected = struct.unpack('<9f', struct.pack('<9f', .01, -.02, .03, -.04, .05, .06, .07, -.08, .09))
    assert values == expected
    assert struct.unpack('<9b', accessor_bytes(output, binary, 4)) == (0, 0, 127) * 3


def alignment_idempotence():
    source = fixture(); first, _ = succeed(source); output, binary = prove(source, first)
    assert all(v['byteOffset'] % 4 == 0 for v in output['bufferViews'])
    assert 0 <= len(binary) - output['buffers'][0]['byteLength'] <= 3
    assert not any(binary[output['buffers'][0]['byteLength']:])
    second, _ = succeed(first); assert second == first, 'layout is not idempotent'
    assert succeed(source)[0] == first, 'layout is not deterministic'


def reject(data, message):
    try:
        layout.reorder_wear_buffer_views(data)
    except ValueError as error:
        assert message in str(error), (message, str(error))
    except Exception as error:
        raise AssertionError('Wrong layout rejection: ' + type(error).__name__) from error
    else:
        raise AssertionError('Expected GLB layout rejection: ' + message)


def invalid_input():
    source = fixture(); old, binary = parse(source)
    damaged = bytearray(source); struct.pack_into('<I', damaged, 8, len(source) + 4)
    reject(damaged, 'container length')
    doc = copy.deepcopy(old); doc['buffers'][0]['uri'] = 'external.bin'
    reject(container(doc, binary), 'one embedded buffer')
    doc = copy.deepcopy(old); doc['buffers'].append({'byteLength': 0})
    reject(container(doc, binary), 'one embedded buffer')
    doc = copy.deepcopy(old); doc['bufferViews'][0]['byteOffset'] = len(binary) + 4
    reject(container(doc, binary), 'outside the embedded buffer')
    doc = copy.deepcopy(old); doc['accessors'][0]['bufferView'] = 999
    reject(container(doc, binary), 'invalid bufferView')
    doc = copy.deepcopy(old); doc['nodes'][0]['extras']['poseTarget']['deltaAccessor'] = 999
    reject(container(doc, binary), 'invalid accessor')


MUTANTS = {
    'skip-order': ('_semantic_view_order', "return sorted(range(len(views)), key=lambda index: (ranks[kinds[index]], index))", "return list(range(len(views)))"),
    'change-view-byte': ('_reorder_document', 'packed.extend(binary[offset:offset + length])', "packed.extend(bytes([binary[offset] ^ 1]) + binary[offset + 1:offset + length] if length else b'')"),
    'change-accessor': ('_reorder_document', 'return output, bytes(packed)', "output['accessors'][3]['count'] = 2\n    return output, bytes(packed)"),
    'change-json': ('_reorder_document', 'return output, bytes(packed)', "output['nodes'][0]['name'] = 'changed'\n    return output, bytes(packed)"),
    'flatten-stride': ('_reorder_document', 'return output, bytes(packed)', "for view in output['bufferViews']: view.pop('byteStride', None)\n    return output, bytes(packed)"),
    'cpu-target-gpu': ('_reorder_document', 'return output, bytes(packed)', "output['bufferViews'][0]['target'] = 34962\n    return output, bytes(packed)"),
    'skip-alignment': ('_reorder_document', "packed.extend(b'\\0' * ((-len(packed)) % 4))", "packed.extend(b'')"),
    'skip-view-bounds': ('_decode_glb', "if view.get('buffer') != 0 or not isinstance(offset, int) or not isinstance(length, int) or offset < 0 or length < 0 or offset + length > byte_length:", 'if False:'),
    'allow-external': ('_decode_glb', "if len(buffers) != 1 or 'uri' in buffers[0]:", 'if False:'),
    'skip-container-length': ('_decode_glb', 'if magic != 0x46546C67 or version != 2 or size != len(data):', 'if magic != 0x46546C67 or version != 2:'),
}


def apply_mutant(name):
    function, old, new = MUTANTS[name]
    original = getattr(layout, function)
    source = textwrap.dedent(inspect.getsource(original))
    assert source.count(old) == 1, ('Mutation anchor drifted', name)
    exec(compile(source.replace(old, new), '<wear layout mutation ' + name + '>', 'exec'), layout.__dict__)
    print('WEAR_LAYOUT_MUTATION_APPLIED ' + name, file=sys.stderr, flush=True)


CHECKS = {'exact-views': exact_views, 'strides-targets': strides_targets,
          'alignment-idempotence': alignment_idempotence, 'invalid-input': invalid_input}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', choices=CHECKS, required=True)
    parser.add_argument('--mutation', choices=MUTANTS)
    args = parser.parse_args()
    if args.mutation: apply_mutant(args.mutation)
    try:
        CHECKS[args.check]()
    except AssertionError:
        print(json.dumps({'check': args.check, 'mutation': args.mutation, 'pass': False, 'errorType': 'AssertionError'}), flush=True)
        raise
    print(json.dumps({'check': args.check, 'mutation': args.mutation, 'pass': True}))


if __name__ == '__main__':
    main()
