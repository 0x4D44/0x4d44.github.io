/* Past-paper practice: the auto-marker.
   Pure functions, no DOM, so the question banks can be tested in Node (tests/papers.test.mjs).
   A part is { type, marks, ... }; scorePart(part, answer) returns
     { got, of, points: [{ desc, marks, hit }], detail }.
   Answer shapes:  mcq -> option index | multi -> array of option indexes | num -> string or number
                   match -> array of chosen definition indexes (one per pair) | text -> string */
(function () {
  "use strict";
  const HGP = (window.HGP = window.HGP || {});

  /* Lower-case, tidy punctuation, and fold the symbols candidates type for the same thing. */
  HGP.norm = function (s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[‘’“”]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/×/g, "x")
      .replace(/[Øø⌀∅]/g, " diameter ")
      .replace(/\bdia\b\.?/g, " diameter ")
      .replace(/\s+/g, " ")
      .trim();
  };
  const words = (s) => (s.match(/[a-z0-9]+/g) || []).length;
  const rx = (src) => new RegExp(src, "i");

  /* A marking point holds when every `all` pattern matches and, if `any` is given, at least one of those does.
     Patterns are matched against the normalised answer. */
  HGP.pointHit = function (pt, text) {
    const all = pt.all || [], any = pt.any || [];
    if (!all.length && !any.length) return false;
    return all.every((p) => rx(p).test(text)) && (!any.length || any.some((p) => rx(p).test(text)));
  };

  function scoreText(part, ans) {
    const text = HGP.norm(ans);
    const minWords = part.minWords == null ? 3 : part.minWords;
    const pts = part.points.map((pt) => ({ desc: pt.desc, marks: pt.marks == null ? 1 : pt.marks, hit: false, group: pt.group }));
    if (words(text) >= minWords) part.points.forEach((pt, i) => { pts[i].hit = HGP.pointHit(pt, text); });
    // points sharing a group are alternatives: only the best-scoring one in a group counts
    const seen = new Map();
    pts.forEach((p) => {
      if (!p.group || !p.hit) return;
      if (seen.has(p.group)) p.hit = false; else seen.set(p.group, p);
    });
    const got = Math.min(part.marks, pts.reduce((a, p) => a + (p.hit ? p.marks : 0), 0));
    return { got, of: part.marks, points: pts };
  }

  HGP.scorePart = function (part, ans) {
    const of = part.marks;
    switch (part.type) {
      case "mcq": return { got: ans === part.a ? of : 0, of };
      case "multi": {
        const picked = Array.isArray(ans) ? ans : [];
        const right = picked.filter((i) => part.a.includes(i)).length;
        const wrong = picked.length - right;
        return { got: Math.max(0, Math.min(of, right - wrong)), of };
      }
      case "num": {
        const v = parseFloat(String(ans).replace(/,/g, "").replace(/[^0-9eE.+-]/g, ""));
        if (!isFinite(v)) return { got: 0, of };
        const targets = [part.a].concat(part.alts || []);
        const tol = part.tol == null ? 0 : part.tol;
        return { got: targets.some((t) => Math.abs(v - t) <= tol + 1e-9) ? of : 0, of };
      }
      case "match": {
        const picked = Array.isArray(ans) ? ans : [];
        const right = part.pairs.filter((_, i) => picked[i] === i).length;
        return { got: Math.min(of, right), of };
      }
      case "text": return scoreText(part, ans);
      default: throw new Error("unknown part type " + part.type);
    }
  };

  /* The model answer for a part, as something a test can feed back to the marker. */
  HGP.modelAnswer = function (part) {
    switch (part.type) {
      case "mcq": return part.a;
      case "multi": return part.a.slice();
      case "num": return part.a;
      case "match": return part.pairs.map((_, i) => i);
      case "text": return part.sample;
      default: return null;
    }
  };

  HGP.partsMarks = (q) => q.parts.reduce((a, p) => a + p.marks, 0);
  HGP.AREAS = [
    { id: "dtp", name: "Desktop publishing: features, elements & principles", short: "DTP", lo: 20, hi: 30 },
    { id: "cad", name: "Computer-aided design techniques", short: "CAD", lo: 20, hi: 30 },
    { id: "interp", name: "Interpretation of graphic items", short: "Interpretation", lo: 12, hi: 30 },
    { id: "std", name: "Drawing standards, protocols & conventions", short: "Standards", lo: 7, hi: 14 },
    { id: "tech", name: "Digital technology in graphic communication", short: "Digital tech", lo: 4, hi: 12 },
  ];
  /* The 2025 minimum marks for each grade as a share of the 140-mark course (course report, 2025). */
  HGP.GRADES = [["A", 0.7], ["B", 0.6], ["C", 0.5], ["D", 0.4]];
})();
