// Read what a furniture GLB contains without three.js: assets (top-level nodes), their mesh parts, materials, triangle counts, bounds.
//   node la-ladera/tools/blender/glb_info.mjs <file.glb> [more.glb ...]        one line per asset + one per part with -v
// Used by tests/interiors-catalog.test.mjs to hold every model to the catalogue (size box, library material names, no textures, triangle budget).
import { readFileSync } from 'node:fs';

export function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
    else if (type === 0x004e4942) bin = body;
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  return { json, bin, bytes: buf.length };
}

const mulM = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const nodeM = (n) => {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
};
const xform = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

/** { assets: Map(name -> { name, parts: [{ name, material, tris, verts, color, uv, normal, min, max }], tris, min, max, size }), images, textures, bytes } */
export function describe(path) {
  const { json: g, bytes } = readGlb(path);
  const assets = new Map();
  const nodes = g.nodes ?? [];
  const visit = (i, parentM, root, chain) => {
    const n = nodes[i], m = mulM(parentM, nodeM(n)), name = n.name ?? `node${i}`;
    if (n.mesh != null) {
      const mesh = g.meshes[n.mesh];
      for (const prim of mesh.primitives) {
        const pos = g.accessors[prim.attributes.POSITION], idx = prim.indices != null ? g.accessors[prim.indices] : null;
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let c = 0; c < 8; c++) {
          const q = xform(m, [c & 1 ? pos.max[0] : pos.min[0], c & 2 ? pos.max[1] : pos.min[1], c & 4 ? pos.max[2] : pos.min[2]]);
          for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
        }
        const part = {
          name, material: prim.material != null ? g.materials[prim.material]?.name ?? null : null, verts: pos.count, tris: (idx ? idx.count : pos.count) / 3,
          color: prim.attributes.COLOR_0 != null, uv: prim.attributes.TEXCOORD_0 != null, normal: prim.attributes.NORMAL != null, min: lo, max: hi,
        };
        const a = assets.get(root) ?? { name: root, parts: [], tris: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        a.parts.push(part); a.tris += part.tris;
        for (let k = 0; k < 3; k++) { a.min[k] = Math.min(a.min[k], lo[k]); a.max[k] = Math.max(a.max[k], hi[k]); }
        assets.set(root, a);
      }
    }
    for (const c of n.children ?? []) visit(c, m, root, chain.concat(name));
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const s of g.scenes ?? []) for (const r of s.nodes ?? []) visit(r, I, nodes[r].name ?? `node${r}`, []);
  for (const a of assets.values()) a.size = a.max.map((v, k) => v - a.min[k]);
  return { assets, images: (g.images ?? []).length, textures: (g.textures ?? []).length, materials: (g.materials ?? []).map((m) => m.name), bytes, extensions: g.extensionsUsed ?? [] };
}

if (process.argv[1] && /glb_info\.mjs$/.test(process.argv[1])) {
  const verbose = process.argv.includes('-v');
  for (const f of process.argv.slice(2).filter((a) => a !== '-v')) {
    const d = describe(f);
    console.log(`${f}  ${(d.bytes / 1024).toFixed(1)} KB  assets=${d.assets.size} images=${d.images} textures=${d.textures} materials=${d.materials.length}${d.extensions.length ? ' ext=' + d.extensions.join(',') : ''}`);
    for (const a of d.assets.values()) {
      console.log(`  ${a.name.padEnd(20)} tris=${String(a.tris).padStart(5)} size=${a.size.map((v) => v.toFixed(3)).join('x')} min=${a.min.map((v) => v.toFixed(3)).join(',')} parts=${a.parts.length}`);
      if (verbose) for (const p of a.parts) console.log(`      ${p.name.padEnd(30)} ${String(p.material).padEnd(18)} tris=${String(p.tris).padStart(4)} ${p.color ? 'COLOR ' : ''}${p.uv ? 'UV ' : ''}${p.normal ? 'N' : ''}`);
    }
  }
}
