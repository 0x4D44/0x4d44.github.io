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

  /* A marking point holds when every `all` pattern matches (and they sit close together, within `win`
     characters, so a cause and its effect must be in the same stretch of writing), at least one `any`
     pattern matches if `any` is given, and no `not` pattern matches. Patterns are matched against the
     normalised answer. */
  const WIN = 160;
  /* Negation: when the part's model answer says nothing negative, a negator just before a matched phrase
     turns the claim round ("STEP is not neutral"), so that point is not awarded. Parts whose model answer
     itself uses negatives (`opts.negOK`) skip the check. */
  const NEG = /\b(not|never|cannot|no longer|isn't|aren't|doesn't|don't|won't|can't|wouldn't|couldn't|shouldn't|didn't)\b|n't\b/;
  HGP.pointHit = function (pt, text, opts) {
    const all = pt.all || [], any = pt.any || [], not = pt.not || [];
    if (!all.length && !any.length) return false;
    if (not.some((p) => rx(p).test(text))) return false;
    if (any.length && !any.some((p) => rx(p).test(text))) return false;
    if (opts && opts.negCheck && !pt.negOK) {
      const spans = [];
      all.concat(any).forEach((p) => { const g = new RegExp(rx(p).source, "gi"); let m; while ((m = g.exec(text))) { spans.push([m.index, m.index + m[0].length]); if (m[0] === "") g.lastIndex++; } });
      if (spans.some(([a]) => NEG.test(text.slice(Math.max(0, a - 34), a + 1).split(/[.;!?]/).pop()))) return false;
    }
    if (!all.length) return true;
    // some occurrence of every `all` pattern must sit within `win` characters of an occurrence of the first
    const win = pt.win || WIN;
    const where = all.map((p) => { const g = new RegExp(rx(p).source, "gi"); const ix = []; let m; while ((m = g.exec(text))) { ix.push(m.index); if (m[0] === "") g.lastIndex++; } return ix; });
    if (where.some((ix) => !ix.length)) return false;
    return where[0].some((a) => where.every((ix) => ix.some((b) => Math.abs(a - b) <= win)));
  };

  /* Function words: real sentences are full of them, lists of key words are not. */
  const FUNC = new Set(("a an the and or but so because since as if then than that this these those it its they them their he she his her we you i " +
    "is are was were be been being am do does did has have had will would can could should may might must not no to of in on at by for with from into onto " +
    "up down out over under about which who what when where while also both each every all any some more most less only just very too same other another " +
    "there here too one two so thus therefore however otherwise instead rather").split(" "));
  /* A written answer that is only a pile of key words (no sentence structure) earns nothing, and a long
     unbroken run of content words caps the answer at half marks. Returns null when the answer reads as prose. */
  function listLike(text) {
    const toks = text.match(/[a-z0-9']+/g) || [];
    if (toks.length < 4) return null;
    const funcToks = toks.filter((t) => FUNC.has(t));
    const func = funcToks.length;
    if (func / toks.length < 0.14) return "zero";
    if (toks.length < 8) return null;
    // padding a pile of key words with the same "the/is/and" over and over is not a sentence
    if (func >= 8 && new Set(funcToks).size < 4) return "zero";
    let run = 0, longest = 0;
    toks.forEach((t) => { if (FUNC.has(t)) run = 0; else { run++; if (run > longest) longest = run; } });
    return longest >= 10 ? "half" : null;
  }

  function scoreText(part, ans) {
    const text = HGP.norm(ans);
    const minWords = Math.min(part.minWords == null ? 3 : part.minWords, 5);
    const pts = part.points.map((pt) => ({ desc: pt.desc, marks: pt.marks == null ? 1 : pt.marks, hit: false, group: pt.group }));
    const w = words(text);
    const list = listLike(text);
    const opts = { negCheck: !NEG.test(HGP.norm(part.sample || "")) };
    if (w >= minWords && list !== "zero") part.points.forEach((pt, i) => { pts[i].hit = HGP.pointHit(pt, text, opts); });
    // points sharing a group are alternatives: only the best-scoring one in a group counts
    const seen = new Map();
    pts.forEach((p) => {
      if (!p.group || !p.hit) return;
      if (seen.has(p.group)) p.hit = false; else seen.set(p.group, p);
    });
    let got = Math.min(part.marks, pts.reduce((a, p) => a + (p.hit ? p.marks : 0), 0));
    if (list === "half") got = Math.min(got, Math.floor(part.marks / 2));
    // a mark needs some writing behind it: about four words each at the very least
    got = Math.min(got, Math.floor(w / 4));
    const out = { got, of: part.marks, points: pts };
    if (list) out.note = "Your answer reads like a list of key words. Write it as sentences; the marker gives little or no credit for a bare list.";
    return out;
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
        // the last number in the answer counts, so working ("5 x 300 = 1500") and units ("12 mm") are fine
        let raw = String(ans).toLowerCase()
          .replace(/(cm|mm|km|\bm)\s*\^?\s*[23²³]/g, "$1")
          .replace(/(\d),(?=\d{3}\b)/g, "$1")                          // 2,880,000
          .replace(/(\d) (?=\d{3}\b)/g, "$1")                          // 2 880 000
          .replace(/(\d),(\d{1,2})\b/g, "$1.$2");                      // 9,6
        if (raw.includes("=")) raw = raw.slice(raw.lastIndexOf("=") + 1);
        const nums = raw.match(/\d+(?:\.\d+)?|\.\d+/g);
        const v = nums ? parseFloat(nums[nums.length - 1]) : NaN;
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
