// INTERIORS (A3): the draw-call diet. One mesh per material is one draw call, and an interior that used 26 materials cost 26 calls (the spawn view shows 17 of
// them). The materials that carry little of the look are DRAWN WITH A NEIGHBOUR'S MATERIAL instead: their triangles move into the neighbour's mesh (after the whole
// building is drawn, before the flush) and their vertex colours are multiplied by (average colour of the original) / (average colour of the neighbour), so a dark
// stained wardrobe is still dark, in pine grain; a cardboard box is still brown, flat. What is lost is the fine texture or the gloss of the rare material.
//
//   * Nothing is lost that is not listed here: shiny metal (chrome), glass, mirrors, the emissives, curtains (double sided) and every patterned cloth
//     (rug, blanket, bedspread) keep their own material.
//   * The closed fronts of the containers keep working: `b.fronts` ranges (index ranges into a material's index list) are moved with the triangles, so the ghost
//     doors that swing open are cut from the folded mesh and drawn with the same material and colours as the closed ones.
//   * Colours are compared in LINEAR space (the space the shader multiplies in), from the manifest's `avg` of each texture (assets/textures/manifest.json) or the
//     flat `color` of a `tex:false` material.
//
// Nothing here is random and nothing reads the page: the same building folds the same way in node and in the browser.
const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgbLin = (hex) => [lin((hex >> 16) & 255), lin((hex >> 8) & 255), lin(hex & 255)];

/** What each material shows on average (sRGB hex): the texture's `avg` in the manifest, or the flat `color` of a `tex:false` definition. A tex:false material is
 *  drawn as `color * vertex colour`, a textured one as `texture * vertex colour`, so both are "what a white vertex colour gives". */
export const AVG = {
  plastic_solid: 0xffffff, ceramic_white: 0xf4f4f0, enamel_white: 0xeeeeea, metal_dark: 0x2b2b2d,
  wood_pine: 0xc9904f, wood_dark: 0x4b3121, wood_old: 0x6c6057, wood_painted: 0xdbdbdb, melamine_wood: 0xccb9a3, formica: 0xdbdbdb, metal_painted: 0xdbdbdb,
  fabric_sofa: 0xbbbbbb, vinyl_sofa: 0x8d8d8d, fabric_bedding: 0xdbdbdb, crochet_cover: 0xd5ccbf, mattress_ticking: 0xc6c3b6,
  oilcloth_floral: 0xad8767, oilcloth_check: 0xda7375, cardboard: 0xa98561, floor_cement: 0x8e8983,
};

/** material -> the material that draws it. Targets are never sources (one step, no chains). `emissive` ones keep their colour: they ignore vertex colours. */
export const FOLD = {
  // flat, glossy-ish fixtures and metal bits: the flat plastic with their own colour (the gloss of a toilet or a drawer handle is not worth a call)
  enamel_white: 'plastic_solid', ceramic_white: 'plastic_solid', metal_dark: 'plastic_solid', cardboard: 'plastic_solid', floor_cement: 'plastic_solid',
  // woods: grain from the pine, colour from the original; laminates and painted sheet from the neutral painted panel
  wood_dark: 'wood_pine', wood_old: 'wood_pine', melamine_wood: 'wood_painted', formica: 'wood_painted', metal_painted: 'wood_painted',
  // soft: the upholstery weave carries the vinyl, the plain sheet carries the thin covers (patterned blankets and bedspreads stay)
  vinyl_sofa: 'fabric_sofa', crochet_cover: 'fabric_bedding', mattress_ticking: 'fabric_bedding', oilcloth_check: 'oilcloth_floral',
  // the tube light is the same white glow as the bulb (both ignore vertex colours)
  tube_glow: 'bulb_glow',
};

/** [target, r, g, b]: the vertex colour factor that keeps the colour on screen. */
export const RATIO = {};
for (const [from, to] of Object.entries(FOLD)) {
  if (AVG[from] == null) { RATIO[from] = [to, 1, 1, 1]; continue; }                  // emissive: no vertex colours to correct
  const a = rgbLin(AVG[from]), t = AVG[to] != null ? rgbLin(AVG[to]) : [1, 1, 1];
  RATIO[from] = [to, a[0] / t[0], a[1] / t[1], a[2] / t[2]];
}

/**
 * Fold the rare materials of a finished MeshBuilder into their neighbours, and move the container front ranges (`b.fronts[*].ranges`, index positions into a
 * material's index list) with the triangles. Returns how many materials were folded away.
 */
export function foldMaterials(b, map = RATIO) {
  const fronts = b.fronts ?? [];
  let n = 0;
  for (const [from, [to, mr, mg, mb]] of Object.entries(map)) {
    const a = b.accs.get(from); if (!a) continue;
    b.accs.delete(from); n++;
    if (!a.idx.length) continue;
    let t = b.accs.get(to);
    if (!t) b.accs.set(to, t = { pos: [], nor: [], uv: [], col: [], idx: [] });
    const v0 = t.pos.length / 3, i0 = t.idx.length;
    for (let i = 0; i < a.pos.length; i++) t.pos.push(a.pos[i]);
    for (let i = 0; i < a.nor.length; i++) t.nor.push(a.nor[i]);
    for (let i = 0; i < a.uv.length; i++) t.uv.push(a.uv[i]);
    for (let i = 0; i < a.col.length; i += 3) t.col.push(a.col[i] * mr, a.col[i + 1] * mg, a.col[i + 2] * mb);
    for (let i = 0; i < a.idx.length; i++) t.idx.push(a.idx[i] + v0);
    for (const f of fronts) for (const r of f.ranges) if (r.key === from) { r.key = to; r.from += i0; r.to += i0; }
  }
  return n;
}
