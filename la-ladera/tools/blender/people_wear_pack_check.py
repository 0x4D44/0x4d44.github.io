"""Independent controls and in-memory mutants for final body packing."""
from __future__ import annotations

import argparse
import copy
import inspect
import json
import math
import sys
import textwrap

import numpy as np

import people_wear_pack as pack


def fixture():
    values = {
        'POSITION': np.array([(0., 0., 0.), (1., 0., 0.), (0., 1., 0.)]*2, dtype='<f4'),
        'NORMAL': np.array([(0, 0, 127)]*3+[(10, 0, 127), (11, 0, 127), (12, 0, 127)], dtype='i1'),
        'TEXCOORD_0': np.array([(0, 0), (255, 0), (0, 255)]*2, dtype='u1'),
        'JOINTS_0': np.array([(0, 1, 0, 0)]*6, dtype='u1'),
        'WEIGHTS_0': np.array([(204, 51, 0, 0)]*6, dtype='u1'),
        'COLOR_0': np.array([(255, 127, 63, 255)]*6, dtype='u1'),
    }
    return values, np.array([0, 1, 2], dtype='<u2'), np.array([3, 4, 5], dtype='<u2')


def succeed(values, near, far):
    try:
        return pack.compact_body_streams(values, near, far)
    except Exception as error:
        raise AssertionError('Valid encoded body unexpectedly rejected: '+str(error)) from error


def angle_degrees(first, second):
    # Deliberately scalar and independent of the production vectorized helper.
    a = [max(float(v)/127., -1.) for v in first]
    b = [max(float(v)/127., -1.) for v in second]
    dot = sum(x*y for x, y in zip(a, b))
    magnitude = math.sqrt(sum(x*x for x in a)*sum(y*y for y in b))
    return math.degrees(math.acos(max(-1., min(1., dot/magnitude))))


def triangle_proof(values, near, far, result):
    for old_indices, key in ((near, 'near_indices'), (far, 'far_indices')):
        emitted = result[key]
        assert emitted.dtype == np.dtype('<u2') and emitted.shape == old_indices.shape
        for name in values:
            if name != 'NORMAL':
                assert values[name][old_indices].tobytes() == result['encoded'][name][emitted].tobytes(), name
    assert values['NORMAL'][near].tobytes() == result['encoded']['NORMAL'][result['near_indices']].tobytes()
    for old_vertex, new_vertex in zip(far, result['far_indices']):
        assert angle_degrees(values['NORMAL'][old_vertex], result['encoded']['NORMAL'][new_vertex]) <= 5. + 1e-12


def bounded_weld():
    values, near, far = fixture()
    result = succeed(values, near, far)
    triangle_proof(values, near, far, result)
    assert result['source_vertex_ids'].tolist() == [0, 1, 2, 5]
    assert result['near_indices'].tolist() == [0, 1, 2]
    assert result['far_indices'].tolist() == [0, 1, 3]
    assert result['metrics']['inheritedFarVertices'] == 2
    assert result['metrics']['removedDuplicateVertices'] == 2
    assert result['metrics']['vertexGpuBytesSaved'] == 64
    assert result['metrics']['maximumChangedNormalDegrees'] < 5.
    # Running the final packing step again is a no-op with the same triangle
    # sequence, even after the first pass made near/far vertices shared.
    again = succeed(result['encoded'], result['near_indices'], result['far_indices'])
    assert again['metrics']['removedDuplicateVertices'] == 0
    for name, data in result['encoded'].items():
        assert data.tobytes() == again['encoded'][name].tobytes()
    assert result['near_indices'].tobytes() == again['near_indices'].tobytes()
    assert result['far_indices'].tobytes() == again['far_indices'].tobytes()


def encoded_seams():
    for attribute in ('POSITION', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0', 'COLOR_0'):
        values, near, far = fixture()
        if attribute == 'POSITION':
            values[attribute][3, 0] = np.nextafter(np.float32(0.), np.float32(1.))
        else:
            values[attribute][3, 0] = (int(values[attribute][3, 0])+1) % 256
        result = succeed(values, near, far)
        triangle_proof(values, near, far, result)
        assert result['remap'][0] != result['remap'][3], attribute
        assert result['encoded']['NORMAL'][result['remap'][3]].tobytes() == values['NORMAL'][3].tobytes()
    # Numerically equal Float32 signed zero is intentionally still a byte seam.
    values, near, far = fixture(); values['POSITION'][3, 0] = np.float32(-0.)
    result = succeed(values, near, far)
    assert result['remap'][0] != result['remap'][3]
    triangle_proof(values, near, far, result)


def near_and_input():
    values, near, far = fixture()
    far[0] = 0  # A vertex already shared by both LODs stays near-owned.
    before = {name: array.tobytes() for name, array in values.items()}
    before_near, before_far = near.tobytes(), far.tobytes()
    result = succeed(values, near, far)
    assert before == {name: array.tobytes() for name, array in values.items()}
    assert before_near == near.tobytes() and before_far == far.tobytes()
    triangle_proof(values, near, far, result)
    assert result['encoded']['NORMAL'][result['remap'][0]].tolist() == [0, 0, 127]
    assert result['metrics']['inheritedFarVertices'] == 1


def uploaded_byte_angle():
    values, near, far = fixture()
    values['NORMAL'][:3] = (-128, 0, 0)
    values['NORMAL'][3:] = (-128, -11, -2)
    # glTF clamps normalized BYTE -128 to -1. The actual angle is 5.031°;
    # normalizing raw signed integers incorrectly gives 4.992° and permits it.
    assert 5.03 < angle_degrees(values['NORMAL'][0], values['NORMAL'][3]) < 5.04
    rejected_match = succeed(values, near, far)
    assert rejected_match['metrics']['inheritedFarVertices'] == 0
    assert rejected_match['metrics']['removedDuplicateVertices'] == 0
    triangle_proof(values, near, far, rejected_match)
    values['NORMAL'][3:] = (-127, -10, -2)
    accepted_match = succeed(values, near, far)
    assert accepted_match['metrics']['inheritedFarVertices'] == 3
    assert accepted_match['metrics']['removedDuplicateVertices'] == 3
    triangle_proof(values, near, far, accepted_match)


def reject(function, text):
    try:
        function()
    except ValueError as error:
        assert text in str(error), (text, str(error))
    except Exception as error:
        raise AssertionError('Wrong rejection type: '+type(error).__name__) from error
    else:
        raise AssertionError('Expected encoded-body rejection: '+text)


def invalid_input():
    values, near, far = fixture()
    reject(lambda: pack.compact_body_streams(values, [-1, 1, 2], far), 'in-range triangles')
    reject(lambda: pack.compact_body_streams(values, [0, 1, 6], far), 'in-range triangles')
    reject(lambda: pack.compact_body_streams(values, [0, 1], far), 'in-range triangles')
    reject(lambda: pack.compact_body_streams(values, [0., 1., 2.], far), 'must be integers')
    changed = copy.deepcopy(values); del changed['WEIGHTS_0']
    reject(lambda: pack.compact_body_streams(changed, near, far), 'skin attributes')
    changed = copy.deepcopy(values); changed['POSITION'] = changed['POSITION'].astype('<f8')
    reject(lambda: pack.compact_body_streams(changed, near, far), 'Float32 VEC3')
    changed = copy.deepcopy(values); changed['NORMAL'] = changed['NORMAL'].astype('<f4')
    reject(lambda: pack.compact_body_streams(changed, near, far), 'uploaded int8 VEC3')
    changed = copy.deepcopy(values); changed['NORMAL'][0] = 0
    reject(lambda: pack.compact_body_streams(changed, near, far), 'nonzero finite directions')
    changed = copy.deepcopy(values); changed['POSITION'][0, 0] = np.nan
    reject(lambda: pack.compact_body_streams(changed, near, far), 'finite encoded values')


MUTANTS = {
    'disable-reuse': ('compact_body_streams', 'if float(angles[best]) <= MAX_FAR_NORMAL_DEGREES:', 'if False:'),
    'wide-angle': ('constant', None, None),
    'ignore-seams': ('compact_body_streams', "return tuple(original[name][vertex].tobytes() for name in nonnormal)", "return (original['POSITION'][vertex].tobytes(),)"),
    'round-position': ('compact_body_streams', "return tuple(original[name][vertex].tobytes() for name in nonnormal)", "return tuple(np.round(original[name][vertex], 5).tobytes() for name in nonnormal)"),
    'write-near': ('compact_body_streams', "changed['NORMAL'][vertex] = normal[source]", "changed['NORMAL'][source] = normal[vertex]"),
    'mutate-input': ('compact_body_streams', 'changed = {name: values.copy() for name, values in original.items()}', 'changed = dict(original)'),
    'byte-clamp': ('_normal_directions', 'values = np.maximum(np.asarray(encoded, dtype=np.float64) / 127., -1.)', 'values = np.asarray(encoded, dtype=np.float64) / 127.'),
    'invalid-indices': ('compact_body_streams', 'if not len(result) or len(result) % 3 or np.any(result < 0) or np.any(result >= count):', 'if False:'),
}


def apply_mutant(name):
    function, old, new = MUTANTS[name]
    if function == 'constant':
        pack.MAX_FAR_NORMAL_DEGREES = 90.
    else:
        original = getattr(pack, function)
        source = textwrap.dedent(inspect.getsource(original))
        assert source.count(old) == 1, ('Mutation anchor drifted', name)
        # Shared module globals ensure the decoding mutant affects both the
        # candidate decision and final exported-angle guard, as a real edit does.
        exec(compile(source.replace(old, new), '<wear packing mutation '+name+'>', 'exec'), pack.__dict__)
    print('WEAR_PACK_MUTATION_APPLIED '+name, file=sys.stderr, flush=True)


CHECKS = {'bounded-weld': bounded_weld, 'encoded-seams': encoded_seams,
          'near-input': near_and_input, 'byte-angle': uploaded_byte_angle,
          'invalid-input': invalid_input}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', choices=CHECKS, required=True)
    parser.add_argument('--mutation', choices=MUTANTS)
    args = parser.parse_args()
    if args.mutation:
        apply_mutant(args.mutation)
    try:
        CHECKS[args.check]()
    except AssertionError:
        print(json.dumps({'check': args.check, 'mutation': args.mutation, 'pass': False, 'errorType': 'AssertionError'}), flush=True)
        raise
    print(json.dumps({'check': args.check, 'mutation': args.mutation, 'pass': True}))


if __name__ == '__main__':
    main()
