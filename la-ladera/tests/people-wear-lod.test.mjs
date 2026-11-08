import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MODULE = process.env.PEOPLE_WEAR_LOD_TEST_MODULE ?? resolve(ROOT, 'la-ladera/tools/blender/people_wear_lod.py');
const FIXTURE = String.raw`
import copy,importlib.util,json,math,sys
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('wear_lod_under_test',sys.argv[2]);lod=importlib.util.module_from_spec(spec);spec.loader.exec_module(lod)
m=SimpleNamespace(p=[],uv=[],w=[],c=[],tri=[],far=[])
def vertex(p,uv=(.5,.5),colour=(1.,1.,1.,1.)):
 i=len(m.p);m.p.append(tuple(round(x,12) for x in p));m.uv.append(uv);m.w.append([('hips',.6),('spine',.4)]);m.c.append(colour);return i
def sphere(cx,n=24,rows=20):
 rings=[]
 for j in range(1,rows):
  lat=-math.pi/2+math.pi*j/rows
  rings.append([vertex((cx+math.cos(lat)*math.cos(2*math.pi*i/n),math.cos(lat)*math.sin(2*math.pi*i/n),math.sin(lat)),(i/(n-1),j/rows)) for i in range(n)])
 for a,b in zip(rings,rings[1:]):
  for i in range(n):
   k=(i+1)%n;m.tri.extend(((a[i],a[k],b[k]),(a[i],b[k],b[i])))
 lo=vertex((cx,0,-1));hi=vertex((cx,0,1))
 for i in range(n):
  k=(i+1)%n;m.tri.extend(((lo,rings[0][k],rings[0][i]),(hi,rings[-1][i],rings[-1][k])))
def chart_cylinder():
 # Two separate UV charts meet on both sides of a cylindrical fabric surface.
 # Only three angular samples per chart force actual synchronized seam work.
 for panel in range(2):
  grid=[]
  for j in range(20):
   row=[]
   for i in range(3):
    a=math.pi*(panel+i/2)
    row.append(vertex((math.cos(a),math.sin(a),j/19),(panel*.6+i*.2,j/19),(.6+.2*panel,.7,.8,1.)))
   grid.append(row)
  for a,b in zip(grid,grid[1:]):
   for i in range(2):m.tri.extend(((a[i],a[i+1],b[i+1]),(a[i],b[i+1],b[i])))
case=sys.argv[1]
if case=='closed':sphere(-2);sphere(2)
elif case=='seams':chart_cylinder()
elif case=='impossible':
 for q in range(5):
  v=[vertex((3*q+x,y,z)) for x,y,z in ((0,0,0),(1,0,0),(0,1,0),(0,0,1))]
  for a,b,c in ((0,2,1),(0,1,3),(1,2,3),(2,0,3)):m.tri.append((v[a],v[b],v[c]))
elif case=='nonmanifold':
 for p in ((0,0,0),(1,0,0),(0,1,0),(0,-1,0),(0,0,1)):vertex(p)
 m.tri=[(0,1,2),(1,0,3),(0,1,4)]
else:raise RuntimeError('unknown fixture')
m.far=list(m.tri);before=copy.deepcopy(vars(m));error=None;report=None
try:report=lod.reduce_garment_far(m,case)
except Exception as exc:error=str(exc)
print(json.dumps(dict(before=before,after=vars(m),error=error,report=report)))
`;

function run(caseName) {
  const child = spawnSync(process.env.PYTHON ?? 'python3', ['-c', FIXTURE, caseName, MODULE], {
    cwd: ROOT, windowsHide: true, stdio: 'pipe', encoding: 'utf8', timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
  });
  assert.equal(child.error, undefined, String(child.error));
  assert.equal(child.status, 0, child.stderr);
  assert.ok(child.stdout.trim().startsWith('{'), 'Python fixture must return its measured mesh');
  return JSON.parse(child.stdout);
}

function unchangedAttributes(before, after) {
  for (const name of ['p', 'uv', 'w', 'c', 'tri']) assert.deepEqual(after[name], before[name], `${name} changed during far reduction`);
}

// Independent combinatorial measurements of the exported triangle list. These
// do not use the reducer's link test, quadrics, report or topology implementation.
function surface(faces, key = i => i) {
  const edges = new Map(), graph = new Map(), boundary = new Map();
  for (const face of faces) {
    const v = face.map(key);
    assert.equal(new Set(v).size, 3, 'collapsed face remains in output');
    for (let i = 0; i < 3; i++) {
      const a = v[i], b = v[(i + 1) % 3], k = [a, b].sort().join('|');
      const row = edges.get(k) ?? { a, b, directions: [] }; row.directions.push(a < b ? 1 : -1); edges.set(k, row);
      if (!graph.has(a)) graph.set(a, new Set()); if (!graph.has(b)) graph.set(b, new Set());
      graph.get(a).add(b); graph.get(b).add(a);
    }
  }
  for (const e of edges.values()) {
    assert.ok(e.directions.length <= 2, 'non-manifold edge in output');
    if (e.directions.length === 2) assert.equal(e.directions[0] + e.directions[1], 0, 'adjacent triangle winding disagrees');
    else {
      if (!boundary.has(e.a)) boundary.set(e.a, new Set()); if (!boundary.has(e.b)) boundary.set(e.b, new Set());
      boundary.get(e.a).add(e.b); boundary.get(e.b).add(e.a);
    }
  }
  for (const neighbors of boundary.values()) assert.equal(neighbors.size, 2, 'broken opening boundary');
  function components(g) {
    let n = 0; const seen = new Set();
    for (const start of g.keys()) if (!seen.has(start)) {
      n++; const stack = [start];
      while (stack.length) { const v = stack.pop(); if (seen.has(v)) continue; seen.add(v); stack.push(...g.get(v)); }
    }
    return n;
  }
  return { components: components(graph), openings: components(boundary), euler: graph.size - edges.size + faces.length };
}

test('wear LOD retains two closed surfaces, existing endpoints and both triangle budgets', () => {
  const { before, after, error } = run('closed');
  assert.equal(error, null);
  unchangedAttributes(before, after);
  assert.ok(after.far.length <= 600 && after.far.length * 5 <= before.tri.length * 2);
  assert.deepEqual(surface(after.far), { components: 2, openings: 0, euler: 4 });
  assert.ok(after.far.flat().every(v => Number.isInteger(v) && v >= 0 && v < before.p.length));
  for (const side of [-1, 1]) {
    const used = [...new Set(after.far.flat())].filter(v => Math.sign(after.p[v][0]) === side).map(v => after.p[v]);
    for (let axis = 0; axis < 3; axis++) assert.ok(Math.max(...used.map(p => p[axis])) - Math.min(...used.map(p => p[axis])) > 1.75, 'sphere lost its silhouette');
  }
});

test('wear LOD collapses both UV seam copies together and preserves the two cylinder openings', () => {
  const { before, after, error } = run('seams');
  assert.equal(error, null);
  unchangedAttributes(before, after);
  assert.ok(after.far.length * 5 <= before.tri.length * 2);
  assert.deepEqual(surface(after.far), { components: 2, openings: 2, euler: 2 });
  const positionKey = v => after.p[v].map(x => x.toFixed(8)).join(',');
  assert.deepEqual(surface(after.far, positionKey), { components: 1, openings: 2, euler: 0 });
  const original = new Map();
  for (const v of new Set(before.far.flat())) { const key = positionKey(v); if (!original.has(key)) original.set(key, []); original.get(key).push(v); }
  const used = new Set(after.far.flat()); let removedSeamStations = 0;
  for (const ids of original.values()) if (ids.length === 2) {
    const retained = ids.filter(v => used.has(v)).length;
    assert.ok(retained === 0 || retained === 2, 'only one side of a seam was removed');
    if (!retained) removedSeamStations++;
  }
  assert.ok(removedSeamStations > 0, 'fixture requires synchronized seam simplification');
});

test('wear LOD refuses an impossible budget without deleting a component or changing the input', () => {
  const { before, after, error } = run('impossible');
  assert.match(error ?? '', /topology-preserving far cut stopped/);
  assert.deepEqual(after, before, 'failed reduction must leave the authored mesh untouched');
  assert.deepEqual(surface(after.far), { components: 5, openings: 0, euler: 10 });
});

test('wear LOD rejects a non-manifold source before mutating any mesh data', () => {
  const { before, after, error } = run('nonmanifold');
  assert.match(error ?? '', /non-manifold garment far edge/);
  assert.deepEqual(after, before);
});
