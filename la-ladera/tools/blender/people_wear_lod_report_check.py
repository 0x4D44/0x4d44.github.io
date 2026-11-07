"""Isolated oracle for metadata-only LOD provenance hoisting.

Execute only the builder's small helper definition with a temporary ROOT. No
body, garment, GLB, atlas, Blender process or shipped file is read or changed.
"""
import ast
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
source_path=HERE/'people_wear_build.py'
source=source_path.read_text().replace('\r\n','\n')
if os.environ.get('LADERA_WEAR_MUTATION'):
    config=json.loads(Path(os.environ['LADERA_WEAR_MUTATION']).read_text())
    for index,change in enumerate(config['changes']):
        if (Path(config['root'])/change['path']).resolve()!=source_path.resolve():continue
        assert source.count(change['from'])==1,'MUTATION_ANCHOR_MISMATCH: LOD report helper'
        source=source.replace(change['from'],change['to'])
        print(f"[wear-mutation-applied:{config['id']}:{index}]",file=sys.stderr)
definition=next(node for node in ast.parse(source).body if isinstance(node,ast.FunctionDef) and node.name=='lod_provenance_reference')
scratch=ROOT/'.scratch';scratch.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='wear-lod-report-test-',dir=scratch) as folder:
    temporary=Path(folder)
    env={'ROOT':temporary,'Path':Path,'copy':copy,'json':json,'hashlib':hashlib}
    exec(compile(ast.Module(body=[definition],type_ignores=[]),str(source_path),'exec'),env)
    hoist=env['lod_provenance_reference']
    fit={'file':'wear/m_don.glb','bodyNode':'untouched-body','bytes':12345,'sha256':'b'*64,
         'garments':{
             'tshirt':{'node':'near-shirt','lodNode':'far-shirt','tris':100,'farTris':30,'vertices':65,'skin':0,
                       'lodReduction':{'sourceTriangles':40,'triangles':30,'targetTriangles':40,'collapses':5,'seamCollapses':2,'topology':[[0,2],[-2,4]],'retainedExtra':{'trace':[1,2,3]}}},
             'trousers':{'node':'near-trousers','lodNode':'far-trousers','tris':200,'farTris':64,'vertices':130,'skin':0,
                         'lodReduction':{'sourceTriangles':70,'triangles':64,'targetTriangles':80,'collapses':3,'seamCollapses':1,'topology':[[2,0]]}}}}
    before=copy.deepcopy(fit)
    expected_maps={gid:gar['lodReduction'] for gid,gar in before['garments'].items()}
    pin=hoist('m_don',fit)
    path=temporary/'dev/wear/lod-provenance/m_don.json';data=path.read_bytes()
    report=json.loads(data)
    assert report=={'schema':1,'id':'m_don','garments':expected_maps},'full LOD maps changed during hoisting'
    assert pin=={'path':'dev/wear/lod-provenance/m_don.json','form':'LF','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    expected_fit=copy.deepcopy(before)
    for garment in expected_fit['garments'].values():del garment['lodReduction']
    expected_fit['lodReductionReport']=pin
    assert fit==expected_fit,'hoisting changed geometry measurements or other metadata'
    # Repeated refresh must accept canonical LF pins on a CRLF checkout and
    # must neither regenerate the report nor change any runtime metadata.
    crlf=data.replace(b'\n',b'\r\n');path.write_bytes(crlf)
    assert hoist('m_don',fit)==pin and fit==expected_fit and path.read_bytes()==crlf
    # A stale existing report is rejected, never silently re-pinned.
    path.write_bytes(data+b'\n')
    try:hoist('m_don',fit)
    except RuntimeError as error:assert 'LOD provenance bytes changed' in str(error)
    else:raise AssertionError('changed existing LOD provenance was silently accepted')
    print(json.dumps({'ok':True,'garments':len(expected_maps),'reportBytesLF':len(data),'geometryFieldsUnchanged':True,'fullMapsExact':True}))
