// T-shirt chest prints: any T-shirt wearer can wear any of the prints in models/tee_prints.png (tools/build_tee_prints.py packs it: 6 x 4 cells, a
// transparent gutter round each). Nothing is baked per person. At load each T-shirt geometry gets a vertex attribute, aPrint (chestPrint): its rest-pose
// position projected flat onto a square on the chest, like a transfer pressed onto the shirt. The shirts' own UVs cannot be used for this - MakeHuman's
// T-shirt UVs wrap round the body and are split by seams across the chest (a straight-line fit from UV to chest position was 3-5 cm out). A few lines
// added to the material's shaders draw the person's print there (dressTee); each person gets their own copy of the T-shirt material (the uniforms
// differ), and every copy shares one shader program.
export const PRINT_COLS = 6, PRINT_ROWS = 4, PRINT_COUNT = 24, PRINT_GUTTER = 6 / 256;
export const TEE = /^cloth_.*t-?shirt/i;   // the T-shirt materials in people.glb (MakeHuman names: cloth_T-shirt_basic.png, ...)

/** The print coordinates of a T-shirt's vertices, from its bind-pose positions P (flat xyz; the people face -z in glTF, +y up).
 *  Returns { attr: Float32Array(n * 3), size, centre: [x, y], front: count } or null for a shirt with no front: attr holds per vertex (s, t, f) -
 *  s 0..1 left to right as you face the wearer, t 0..1 bottom to top across a size x size square centred on the chest, and f, 1 on the front of the
 *  shirt fading to 0 by its sides (the shader draws only where the interpolated f > 0.5, so the back never gets a mirrored copy). */
export function chestPrint(P, o = {}) {
  const n = P.length / 3; if (n < 12) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const h = y1 - y0, xc = (x0 + x1) / 2, zm = (z0 + z1) / 2, dz = Math.max(0.02, (z1 - z0) * 0.15);
  const yc = y0 + h * (o.at != null ? o.at : 0.66);                       // chest height: two thirds of the way up the shirt
  const size = o.size != null ? o.size : Math.min(0.22, (x1 - x0) * 0.38);   // the print's side, m (the width includes the sleeves; 0.38 of it keeps the print on the flat of the chest)
  const attr = new Float32Array(n * 3); let front = 0;
  for (let i = 0; i < n; i++) {
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    const f = Math.min(1, Math.max(0, (zm - z) / dz));                      // in front of the shirt's middle by dz or more: 1
    attr[3 * i] = (xc - x) / size + 0.5;                                    // the wearer faces -z, so the viewer's right is the wearer's -x side
    attr[3 * i + 1] = (y - yc) / size + 0.5; attr[3 * i + 2] = f;
    if (f > 0.5) front++;
  }
  return front >= 3 ? { attr, size, centre: [xc, yc], front } : null;   // (no vertex need fall inside the square: s, t are linear in position, so a big LOD triangle carries the print exactly)
}

// ---- which print: spread across everyone on screen (the same idea as people.js pickChar) -------------------------------------------------------------
const PRINT_USE = new Map();
export const printsInUse = () => PRINT_USE;
export const resetPrintsInUse = () => PRINT_USE.clear();
/** the least-used print right now, random among equals (rng: () => [0, 1)); counts it in. releasePrint gives it back. */
export function takePrint(rng, count = PRINT_COUNT) {
  let best = Infinity, pool = [];
  for (let k = 0; k < count; k++) { const u = PRINT_USE.get(k) || 0; if (u < best) { best = u; pool = [k]; } else if (u === best) pool.push(k); }
  const k = pool[Math.floor(rng() * pool.length)]; PRINT_USE.set(k, best + 1); return k;
}
export function releasePrint(k) { const u = (PRINT_USE.get(k) || 0) - 1; if (u > 0) PRINT_USE.set(k, u); else PRINT_USE.delete(k); }

// ---- drawing it ------------------------------------------------------------------------------------------------------------------------------------
let atlas = null;
/** the print atlas texture, loaded once (null outside a browser: the Node tests have no image loader) */
export function printAtlas(THREE) {
  if (atlas || typeof document === 'undefined') return atlas;
  atlas = new THREE.TextureLoader().load(new URL('../../models/tee_prints.png', import.meta.url).href);
  atlas.flipY = false; atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
  return atlas;
}

const FRAG = `
{ if (uPrintCell >= 0.0 && vPrint.z > 0.5 && all(greaterThan(vPrint.xy, vec2(0.0))) && all(lessThan(vPrint.xy, vec2(1.0)))) {
    float col = mod(uPrintCell, ${PRINT_COLS}.0), row = floor(uPrintCell / ${PRINT_COLS}.0), g = ${PRINT_GUTTER.toFixed(6)};
    vec4 pc = texture2D(uPrintMap, vec2((col + g + vPrint.x * (1.0 - 2.0 * g)) / ${PRINT_COLS}.0, (row + g + (1.0 - vPrint.y) * (1.0 - 2.0 * g)) / ${PRINT_ROWS}.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, pc.rgb, pc.a);
  } }`;

/** Put print `cell` on every T-shirt in obj (a person's clone): each T-shirt mesh gets its own copy of its material with the print uniforms; the shared
 *  original is left alone. Returns the number of T-shirt meshes dressed. Safe to call again on the same clone (it replaces the copies). */
export function dressTee(THREE, obj, cell) {
  const map = printAtlas(THREE); let n = 0;
  obj.traverse((m) => {
    if (!m.isMesh || !m.material || !m.geometry) return;
    const base = (m.material.userData && m.material.userData.teeBase) || m.material;
    if (!TEE.test(base.name || '')) return;
    const g = m.geometry;
    if (g.userData.chestPrint === undefined) {
      const cp = g.attributes.position ? chestPrint(dequant(g.attributes.position)) : null;
      g.userData.chestPrint = cp ? { size: cp.size, centre: cp.centre, front: cp.front } : null;
      if (cp) g.setAttribute('aPrint', new THREE.BufferAttribute(cp.attr, 3));
    }
    if (!g.userData.chestPrint || !map) return;
    if (m.material !== base) m.material.dispose();
    const mat = base.clone(); mat.userData = Object.assign({}, base.userData, { teeBase: base });
    const U = { uPrintMap: { value: map }, uPrintCell: { value: cell } };
    const prev = base.onBeforeCompile, prevKey = base.customProgramCacheKey ? base.customProgramCacheKey.bind(base) : () => '';
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(base, sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aPrint; varying vec3 vPrint;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPrint = aPrint;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uPrintMap; uniform float uPrintCell; varying vec3 vPrint;')
        .replace('#include <map_fragment>', '#include <map_fragment>' + FRAG);
    };
    mat.customProgramCacheKey = () => prevKey() + '|tee2';
    mat.userData.tee = U; m.material = mat; n++;
  });
  return n;
}
/** dispose the per-person T-shirt copies in obj (the shared originals stay) */
export function undressTee(obj) { obj.traverse((m) => { if (m.isMesh && m.material && m.material.userData && m.material.userData.teeBase) { const b = m.material.userData.teeBase; m.material.dispose(); m.material = b; } }); }

function dequant(attr) {   // KHR_mesh_quantization: read through getX/getY/getZ so normalized integer attributes come back as floats
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) { out[i * 3] = attr.getX(i); out[i * 3 + 1] = attr.getY(i); out[i * 3 + 2] = attr.getZ(i); }
  return out;
}
