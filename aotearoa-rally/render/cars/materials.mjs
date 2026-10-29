// Car materials: paint (livery atlas, clearcoat), glass, trim, lamps, tyres, rims; shader patches add
// accumulated dirt (mud splatter), vertex-displaced crash damage, scrapes, holes and cracked glass.
const SHARED = /* glsl */ `
uniform vec4 uDmg; uniform vec4 uDim; uniform float uDmgTot; uniform float uDirt; uniform float uCrack; uniform float uSpray; uniform vec3 uMudC;
float h31(vec3 p){ p = fract(p*vec3(0.1031,0.1030,0.0973)); p += dot(p, p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float vn3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y), f.z); }
vec4 dmgZones(vec3 p){
  return vec4(smoothstep(uDim.x + 1.15, uDim.x - 0.05, p.z), smoothstep(uDim.y - 1.15, uDim.y + 0.05, p.z),
              smoothstep(-uDim.z * 0.5, -uDim.z * 1.02, p.x), smoothstep(uDim.z * 0.5, uDim.z * 1.02, p.x));
}
vec3 dmgDisp(vec3 p){
  vec4 w = dmgZones(p);
  float n1 = vn3(p*5.0), n2 = vn3(p*11.0 + 3.0), n3 = vn3(p*2.2 + 7.0);
  vec3 d = vec3(0.0);
  float f = uDmg.x * w.x;
  d.z += f * (0.16 + 0.34*n3) * (0.6 + 0.4*n1);
  d.y -= f * 0.15 * n2 * smoothstep(0.3, 1.0, p.y / uDim.w + 0.25);
  d.x += f * (n1 - 0.5) * 0.14;
  float r = uDmg.y * w.y;
  d.z -= r * (0.14 + 0.32*n3) * (0.6 + 0.4*n1);
  d.y -= r * 0.1 * n2; d.x += r * (n2 - 0.5) * 0.12;
  float dentL = smoothstep(0.55, 0.8, vn3(p*3.4 + vec3(1.3, 0.0, 2.1)));
  float dentR = smoothstep(0.55, 0.8, vn3(p*3.4 + vec3(5.7, 2.0, 0.4)));
  d.x += uDmg.z * w.z * (0.03 + 0.2*dentL + 0.07*n3);
  d.x -= uDmg.w * w.w * (0.03 + 0.2*dentR + 0.07*n3);
  d.y -= (uDmg.z*w.z + uDmg.w*w.w) * 0.04 * n2;
  return d;
}`;

const VERT_DECL = SHARED + "\nvarying vec3 vObjP;\n";
const VERT_NORMAL = /* glsl */ `
if (uDmgTot > 0.002) {
  vec3 pp = position;
  vec3 Tn = normalize(abs(objectNormal.y) < 0.9 ? cross(objectNormal, vec3(0.0,1.0,0.0)) : cross(objectNormal, vec3(1.0,0.0,0.0)));
  vec3 Bn = cross(objectNormal, Tn);
  vec3 q0 = pp + dmgDisp(pp);
  vec3 q1 = pp + Tn*0.05 + dmgDisp(pp + Tn*0.05);
  vec3 q2 = pp + Bn*0.05 + dmgDisp(pp + Bn*0.05);
  vec3 nn = normalize(cross(q1 - q0, q2 - q0));
  if (dot(nn, objectNormal) < 0.0) nn = -nn;
  objectNormal = nn;
}`;
const VERT_DISP = `vObjP = position; if (uDmgTot > 0.002) transformed += dmgDisp(position);`;

const FRAG_DECL = SHARED + "\nvarying vec3 vObjP; float gDirt = 0.0;\n";
const DIRT = (mode) => /* glsl */ `
{
  vec4 zw = dmgZones(vObjP);
  float dm = max(max(uDmg.x*zw.x, uDmg.y*zw.y), max(uDmg.z*zw.z, uDmg.w*zw.w));
  ${mode === "glass" ? "" : `
  float sc = vn3(vObjP*9.0) * 0.6 + vn3(vObjP*23.0)*0.4;
  float scrape = smoothstep(0.64, 0.7, sc + dm*0.3 - 0.12) * step(0.15, dm);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.44,0.44,0.46)*(0.6+0.5*sc), scrape*0.85);
  diffuseColor.rgb *= 1.0 - 0.18*dm*vn3(vObjP*4.0);`}
  ${mode === "paint" ? "if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.17, 0.17, 0.19);" : ""}
  float height = ${mode === "wheel" ? "0.15" : "clamp(vObjP.y / max(uDim.w, 0.5), 0.0, 1.2)"};
  float dn = vn3(vObjP*vec3(3.5, 5.0, 3.5)) * 0.45 + vn3(vObjP*vec3(10.0, 14.0, 10.0))*0.3 + vn3(vObjP*vec3(30.0, 40.0, 30.0))*0.25;
  float lower = 1.0 - smoothstep(0.08, 0.8, height);
  float rearK = smoothstep(uDim.x, uDim.y, vObjP.z);
  float amt = uDirt * (0.3 + 1.15*lower + 0.28*rearK) ${mode === "glass" ? "* 0.5" : ""};
  float dmask = smoothstep(0.52, 0.66, dn*0.9 + amt - 0.58) + step(0.8, vn3(vObjP*70.0)) * step(0.35, uDirt) * 0.6 * (0.3 + lower); dmask = clamp(dmask, 0.0, 1.0);
  // tyre-spray streaks: thin bands running up and back from the wheel arches, strongest low down and behind the wheels
  ${mode === "glass" ? "" : `{
    vec3 sp = vObjP;
    float along = sp.y * 0.6 - sp.z * 0.8, across = sp.y * 0.8 + sp.z * 0.6;
    float st = vn3(vec3(sp.x * 38.0, across * 30.0, along * 2.2)) * 0.65 + vn3(vec3(sp.x * 90.0, across * 70.0, along * 5.0)) * 0.35;
    float sm = smoothstep(0.5, 0.72, st) * (1.0 - smoothstep(0.05, 0.85, height)) * (0.55 + 0.45 * rearK);
    dmask = max(dmask, clamp(uSpray * sm * 1.1, 0.0, 0.92));
  }`}
  vec3 mud = mix(uMudC * 0.55, uMudC, vn3(vObjP*14.0));
  ${mode === "paint" ? `// metallic flake: sparse glints that move with the view
  { float fl = step(0.955, h31(floor(vObjP * 240.0)));
    float tw = pow(abs(sin(dot(vViewPosition, vec3(31.0, 47.0, 23.0)) + h31(floor(vObjP * 240.0)) * 6.28)), 10.0);
    diffuseColor.rgb *= 1.0 + fl * tw * 1.4 * (1.0 - dmask); }` : ""}
  diffuseColor.rgb = mix(diffuseColor.rgb, mud, dmask);
  gDirt = dmask;
  ${mode === "glass" ? `
  // cracked glass: cell edges on a plane projection
  if (uCrack > 0.01) {
    vec2 cp = vec2(vObjP.x * 7.0, (vObjP.y + vObjP.z) * 7.0);
    vec2 ci = floor(cp), cf = fract(cp);
    float F1 = 8.0, F2 = 8.0; float cid = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(h31(vec3(ci + g, 1.0)), h31(vec3(ci + g, 7.0)));
      float dd = length(g + o - cf);
      if (dd < F1) { F2 = F1; F1 = dd; cid = h31(vec3(ci + g, 3.0)); } else if (dd < F2) F2 = dd;
    }
    float edge = F2 - F1;
    float on = step(cid, uCrack * 1.15);
    float cr = (1.0 - smoothstep(0.0, 0.05 + 0.04*uCrack, edge)) * on;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), cr);
    diffuseColor.a = mix(diffuseColor.a, 0.95, cr);
    diffuseColor.a = mix(diffuseColor.a, 0.55, uCrack * 0.35);
  }
  diffuseColor.a = mix(diffuseColor.a, 0.96, dmask);` : ""}
}`;

const HOLES = /* glsl */ `
if (uDmgTot > 0.7) {
  vec4 zw = dmgZones(vObjP);
  float dm = max(max(uDmg.x*zw.x, uDmg.y*zw.y), max(uDmg.z*zw.z, uDmg.w*zw.w));
  if (dm > 0.85 && vn3(vObjP*6.0 + 2.0) > 0.82 - (dm - 0.85)*1.6) discard;
}`;

/**
 * Patch a built-in material with dirt / damage. opts: { damage: bool, mode: "paint"|"glass"|"wheel"|"plain" }
 */
export function patchMaterial(mat, U, opts = {}) {
  const mode = opts.mode || "paint";
  const dmg = opts.damage !== false;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    let v = sh.vertexShader.replace("#include <common>", "#include <common>\n" + VERT_DECL);
    if (dmg) v = v.replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n" + VERT_NORMAL);
    v = v.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + (dmg ? VERT_DISP : "vObjP = position;"));
    let f = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + FRAG_DECL);
    if (!/MeshBasic/.test(mat.type)) {
      if (dmg && mode !== "wheel") f = f.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n" + HOLES);
      f = f.replace("#include <color_fragment>", "#include <color_fragment>\n" + DIRT(mode));
      f = f.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.96, gDirt);");
      f = f.replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor *= (1.0 - gDirt);");
    }
    sh.vertexShader = v; sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `car-${mode}-${dmg ? 1 : 0}`;
  return mat;
}

export function createUniforms(THREE, d) {
  return {
    uDirt: { value: 0 },
    uSpray: { value: 0 },
    uMudC: { value: new THREE.Vector3(0.28, 0.2, 0.13) },
    uDmg: { value: new THREE.Vector4(0, 0, 0, 0) },
    uDim: { value: new THREE.Vector4(d.zF, d.zR, d.hw, d.H) },
    uDmgTot: { value: 0 },
    uCrack: { value: 0 },
  };
}

export function createCarMaterials(THREE, U, livery, atlasTexture, grain = null) {
  const paint = patchMaterial(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: atlasTexture, roughness: 0.3, metalness: 0.4, clearcoat: 1.0, clearcoatRoughness: 0.06,
    side: THREE.DoubleSide, envMapIntensity: 1.5,
  }), U, { mode: "paint" });
  const glass = patchMaterial(new THREE.MeshStandardMaterial({
    color: 0x0a131b, roughness: 0.02, metalness: 0.85, transparent: true, opacity: 0.8, envMapIntensity: 2.6, depthWrite: false,
  }), U, { mode: "glass" });
  const trim = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide }), U, { mode: "paint" });
  // one lamp material for head / tail / reverse lamps (vertex attribute aLamp: 0 head, 1 tail, 2 reverse)
  const lampI = { value: new THREE.Vector3(0.12, 0.12, 0.05) };
  const lampBase = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.1 }), U, { mode: "plain" });
  const prevCompile = lampBase.onBeforeCompile;
  lampBase.onBeforeCompile = (sh) => {
    prevCompile(sh);
    sh.uniforms.uLampI = lampI;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aLamp; varying float vLamp;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvLamp = aLamp;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vLamp; uniform vec3 uLampI;")
      .replace("#include <color_fragment>", "#include <color_fragment>\nvec3 lampBaseC = vLamp < 0.5 ? vec3(0.9,0.88,0.78) : (vLamp < 1.5 ? vec3(0.42,0.05,0.05) : vec3(0.85));\nvec3 lampEmC = vLamp < 0.5 ? vec3(1.0,0.93,0.74) : (vLamp < 1.5 ? vec3(1.0,0.07,0.03) : vec3(1.0));\nfloat lampK = vLamp < 0.5 ? uLampI.x : (vLamp < 1.5 ? uLampI.y : uLampI.z);\ndiffuseColor.rgb = mix(lampBaseC, diffuseColor.rgb, 0.0);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance = lampEmC * lampK;");
  };
  lampBase.customProgramCacheKey = () => "car-lamp";
  const lamps = lampBase;
  const interior = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, map: grain || null, roughness: 0.74, metalness: 0.05, emissive: 0x14151a, side: THREE.DoubleSide });
  const helmet = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.25, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  const wheelTrim = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.9, metalness: 0.0 });
  const tyre = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.92, metalness: 0 }), U, { mode: "wheel", damage: false });
  const rim = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.32, metalness: 0.75, envMapIntensity: 1.2 }), U, { mode: "wheel", damage: false });
  const caliper = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.3 });
  return { paint, glass, trim, lamps, lampI, interior, helmet, wheelTrim, tyre, rim, caliper };
}
