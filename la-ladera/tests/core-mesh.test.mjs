// MeshBuilder guards (owner: A1). Pure node, no browser.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-mesh.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder } from '../js/core/mesh.js';

const bad = (b) => { let n = 0; for (const a of b.accs.values()) for (const arr of [a.pos, a.nor, a.uv, a.col]) for (const v of arr) if (!Number.isFinite(v)) n++; return n; };
const unit = (b) => { for (const a of b.accs.values()) for (let i = 0; i < a.nor.length; i += 3) { const l = Math.hypot(a.nor[i], a.nor[i + 1], a.nor[i + 2]); if (!(Math.abs(l - 1) < 1e-6)) return false; } return true; };

test('cyl: a cone or cylinder of height 0 (or less, or NaN) adds nothing: it gave NaN normals, one NaN pixel, and the bloom blur spread it into a black block (R1-011)', () => {
  for (const h of [0, -0.5, NaN, undefined, null]) for (const o of [{}, { r1: 0 }, { r1: 0.2, caps: false }]) {
    const b = new MeshBuilder(); b.cyl('plaster_a', 1, 2, 3, 0.5, h, 8, o);
    assert.equal(b.tris, 0, `height ${h} ${JSON.stringify(o)}: no triangles`); assert.equal(b.accs.size, 0, `height ${h} ${JSON.stringify(o)}: no vertices, not even an empty batch`); assert.equal(bad(b), 0);
  }
});

test('cyl: a real cylinder, cone, frustum and a very flat one are unchanged: finite attributes, unit normals, the caps where they were', () => {
  const cases = [['cylinder', 0.4, 1.2, {}, 8 * 2 + 8 * 2], ['cone', 0.4, 1.2, { r1: 0 }, 8 * 2 + 8], ['frustum', 0.4, 1.2, { r1: 0.15 }, 8 * 2 + 8 * 2], ['flat disc', 0.4, 1e-5, {}, 8 * 2 + 8 * 2], ['no caps', 0.4, 1.2, { caps: false }, 8 * 2]];
  for (const [name, r, h, o, tris] of cases) {
    const b = new MeshBuilder(); b.cyl('plaster_a', 0, 0, 0, r, h, 8, o);
    assert.equal(b.tris >= 8 * 2, true, `${name}: has a side`); assert.equal(b.tris, tris, `${name}: ${b.tris} triangles`);
    assert.equal(bad(b), 0, `${name}: every attribute is finite`); assert.equal(unit(b), true, `${name}: unit normals`);
  }
});
