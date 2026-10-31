// Mutants: each one undoes a fix on a copy of the page text, by a plain string replacement, to prove that the guard that was written for that fix still fails.
// The shipped page is never touched. A mutant is served through the same path as the tests' own debug copy (lib/dbg.mjs reads PTB_MUTANT).
//
// Rules for an entry:
//   anchor   text that must occur EXACTLY ONCE in the page (a refactor then gives a clear "anchor not found" error instead of a mutant that changed nothing)
//   replace  what the anchor becomes
//   guards   the test files that must FAIL on the mutant, and a pattern that at least one of their FAIL lines must match (so a crash does not count as a catch)
// The anchors are written against the page as it ships. If the page is refactored, edit the anchors here and nowhere else.
//
// The first seven are derived from `git diff f7ee3dc 5fb49d8 -- plan-to-build/index.html` (f7ee3dc: the page before the flicker, rug and paint fixes);
// the rest undo one decision of the first-person tour each.

export const MUTANTS = [
  {
    id: "sort-float-key",
    what: "the draw order of the old page: a float key (layer + kind * 0.01), so equal keys compare unequal and the creation order is lost; no slot for rugs",
    anchor: "EL_SORTED = EL.slice().sort((a, b) => (key(a) - key(b)) || a._i - b._i);",
    replace: "EL_SORTED = EL.slice().sort((a, b) => ((LAYERS[a.L] ? LAYERS[a.L].o : 50) + (ord[a.k] || 0) * 0.01 - (LAYERS[b.L] ? LAYERS[b.L].o : 50) - (ord[b.k] || 0) * 0.01) || a._i - b._i);",
    guards: [{ file: "order.test.mjs", fails: /rug|creation order/i }],
  },
  {
    id: "chairs-over-tables",
    what: "a chair gets no slot below the tables (the first fix commit): a chair created after its table lies over the table's edge",
    anchor: "const UNDER = { rug: 5, chair: 2 };",
    replace: "const UNDER = { rug: 5 };",
    guards: [{ file: "order.test.mjs", fails: /chair/i }],
  },
  {
    id: "columns-flush",
    what: "columns flush with the wall faces again (no pad, no lip): their outer faces and their cut tops lie in the planes of the walls' and z-fight",
    anchor: "t1: t0 + 1.5, pad: 0.004, lip: 0.001 }",
    replace: "t1: t0 + 1.5 }",
    guards: [{ file: "zfight.test.mjs", fails: /coplanar overlapping faces among construction solids/ }],
  },
  {
    id: "column-lip",
    what: "columns keep their pad but lose the lip: while the section plane cuts them their cut tops lie in the plane of the walls' cut tops and z-fight",
    anchor: "t1: t0 + 1.5, pad: 0.004, lip: 0.001 }",
    replace: "t1: t0 + 1.5, pad: 0.004 }",
    guards: [{ file: "zfight.test.mjs", fails: /coplanar overlapping faces among construction solids: section cut/ }],
  },
  {
    id: "frames-fill-openings",
    what: "window and door frames as wide as their openings again (no FRAME_CLEAR): their side faces lie in the plane of the reveals and shimmer",
    anchor: "const FRAME_CLEAR = 0.004;",
    replace: "const FRAME_CLEAR = 0;",
    guards: [
      { file: "zfight.test.mjs", fails: /window or door frame has a side face/ },
      { file: "jamb.test.mjs", fails: /jamb .*shadow/ },
    ],
  },
  {
    id: "paint-off",
    what: "the paint stage does nothing: every room stays bare block",
    anchor: "float pr = uPaint[ri];",
    replace: "float pr = 0.;",
    guards: [{ file: "paint.test.mjs", fails: /un-painting/ }],
  },
  {
    id: "paint-outer-reveal",
    what: "the paint lines the outer reveal of a window again (the 245 mm cut-off is gone), so the block beyond the frame is white from outside",
    anchor: "if (dm > .245) return;",
    replace: "",
    guards: [{ file: "paint.test.mjs", fails: /outer reveal/ }],
  },

  // ---- the first-person tour (tour.test.mjs). Anchors are written against the page as it ships with the tour.
  {
    id: "lamps-pop",
    what: "the ceiling lamps come on at full strength instead of ramping up from zero: the light count changes and the whole scene lurches",
    anchor: "for (const L of lamps) { L.visible = k > 0; L.intensity = 5.5 * k; }",
    replace: "for (const L of lamps) { L.visible = k > 0; L.intensity = 5.5; }",
    guards: [{ file: "tour.test.mjs", fails: /never pops on|intensity never changes/ }],
  },
  {
    id: "fittings-pop",
    what: "the round ceiling fittings show as soon as the lamps start: the dive sees them floating under the roof while it is still coming down",
    anchor: "for (const f of fits) f.visible = k > 0 && t >= covered;",
    replace: "for (const f of fits) f.visible = k > 0;",
    guards: [{ file: "tour.test.mjs", fails: /ceiling fittings wait/ }],
  },
  {
    id: "roof-floating",
    what: "the roof comes to rest 40 cm above the walls: a gap shows all round and the rooms have no ceiling",
    anchor: "const ov = 0.1, th = 0.22, y0 = 2.801, r = INSO;",
    replace: "const ov = 0.1, th = 0.22, y0 = 3.2, r = INSO;",
    guards: [{ file: "tour.test.mjs", fails: /roof sits on the walls/ }],
  },
  {
    id: "door-stays-open",
    what: "the front door is not shut under the roof and not opened for the walk: it just stays open as the build left it",
    anchor: "sv = t < T3.tourT.open[0] ? sv * (1 - easeIO(sh)) : easeOut(op) + 0.035 * Math.sin(Math.PI * op * 2.2) * (1 - op);",
    replace: "sv = sv;",
    guards: [{ file: "tour.test.mjs", fails: /front door is shut/ }],
  },
  {
    id: "walk-no-unwrap",
    what: "the heading is not unwrapped from key to key: a key that crosses 180 or 360 degrees sends the camera the long way round, a full spin",
    anchor: "const turn = (hd) => { while (hd - hdPrev > 180) hd -= 360; while (hd - hdPrev < -180) hd += 360; return (hdPrev = hd); };",
    replace: "const turn = (hd) => (hdPrev = hd);",
    guards: [{ file: "tour.test.mjs", fails: /head never turns faster/ }],
  },
  {
    id: "handoff-pose",
    what: "the walk's first pose is 1 degree off the orbit's last pose: a visible jump where the orbit hands over to the walk",
    anchor: "WK.push([Z, { ex: oP.ex, ey: oP.ey, ez: oP.ez, hd: hdPrev, pd: oL.el, lp: oL.lp }]);",
    replace: "WK.push([Z, { ex: oP.ex, ey: oP.ey, ez: oP.ez, hd: hdPrev, pd: oL.el + 1, lp: oL.lp }]);",
    guards: [{ file: "tour.test.mjs", fails: /walk starts from the orbit's last pose/ }],
  },
  {
    id: "route-into-door-leaf",
    what: "one kitchen key moves 35 cm west: the eye passes through the open leaf of the kitchen door",
    anchor: "wk(19.3, [9600, 3350], { hd: 276, pd: 2.5 }, 64);",
    replace: "wk(19.3, [9250, 3350], { hd: 276, pd: 2.5 }, 64);",
    guards: [{ file: "tour.test.mjs", fails: /never within 0\.25 m/ }],
  },
  {
    id: "tags-swapped",
    what: "the BED 1 and BED 2 tags are swapped: each names the room next door",
    anchor: "tag('BED 2', 31.2, 33.3); tag('BATH', 33.9, 35.7); tag('BED 1', 36.9, 38.7);",
    replace: "tag('BED 1', 31.2, 33.3); tag('BATH', 33.9, 35.7); tag('BED 2', 36.9, 38.7);",
    guards: [{ file: "tour.test.mjs", fails: /BED [12]: the camera looks into that room/ }],
  },
];

export function countOf(text, needle) {
  let n = 0, i = 0;
  while ((i = text.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

export function mutantById(id) {
  const m = MUTANTS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown mutant "${id}" (known: ${MUTANTS.map((x) => x.id).join(", ")})`);
  return m;
}

// The anchor must occur exactly once: say so clearly when it does not.
export function checkAnchor(html, m) {
  const n = countOf(html, m.anchor);
  return n === 1 ? null : `anchor ${n === 0 ? "not found" : `found ${n} times, not once`}: ${JSON.stringify(m.anchor)} (the page was refactored: update plan-to-build/tests/lib/mutants.mjs)`;
}

export function applyMutant(html, id) {
  const m = mutantById(id);
  const bad = checkAnchor(html, m);
  if (bad) throw new Error(`mutant "${id}": ${bad}`);
  return html.replace(m.anchor, () => m.replace);
}
