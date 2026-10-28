/* Past-paper practice: the auto-marker.
   Pure functions, no DOM, so the question banks can be tested in Node (tests/papers.test.mjs).
   A part is { type, marks, ... }; scorePart(part, answer) returns
     { got, of, points: [{ desc, marks, hit }], detail }.
   Answer shapes:  mcq -> option index | multi -> array of option indexes | num -> string or number
                   match -> array of chosen definition indexes (one per pair) | text -> string */
(function () {
  "use strict";
  const HPP = (window.HPP = window.HPP || {});

  /* Lower-case, tidy punctuation, and fold the symbols candidates type for the same thing. */
  const SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
  const supRun = (m) => "^" + m.replace(/⁻/g, "-").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUP[c]);
  HPP.norm = function (s, keepCase) {
    const t = String(s == null ? "" : s).replace(/⁻?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, supRun);
    return (keepCase ? t : t.toLowerCase())
      .replace(/[‘’“”]/g, "'")
      .replace(/[–—−]/g, "-")
      .replace(/[×·]/g, "x").replace(/÷/g, "/")
      .replace(/[µμ]/g, "u")
      .replace(/√/g, " sqrt ")
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
  const NEGWIN = 90;
  /* Negation: when the part's model answer says nothing negative, a negator just before a matched phrase
     turns the claim round ("STEP is not neutral"), so that point is not awarded. Parts whose model answer
     itself uses negatives (`opts.negOK`) skip the check. */
  const NEG = /\b(not|never|cannot|no longer|isn't|aren't|doesn't|don't|won't|can't|wouldn't|couldn't|shouldn't|didn't)\b|n't\b/;
  HPP.pointHit = function (pt, text, opts) {
    const all = pt.all || [], any = pt.any || [], not = pt.not || [];
    if (!all.length && !any.length) return false;
    if (not.some((p) => rx(p).test(text))) return false;
    if (any.length && !any.some((p) => rx(p).test(text))) return false;
    if (opts && opts.negCheck && !pt.negOK) {
      const spans = [];
      all.concat(any).forEach((p) => { const g = new RegExp(rx(p).source, "gi"); let m; while ((m = g.exec(text))) { spans.push([m.index, m.index + m[0].length]); if (m[0] === "") g.lastIndex++; } });
      if (spans.some(([a]) => NEG.test(text.slice(Math.max(0, a - NEGWIN), a + 1).split(/[.;!?,]|\bbut\b|\bhowever\b|\bso\b|\bwhereas\b/).pop()))) return false;
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
    "which who what when where while also very too " +
    "there here too one two so thus therefore however otherwise instead rather between through around after before during across against within without upon per until via whether whereas although though unless whose whom like").split(" "));
  /* Pairs of function words that turn up in real prose (taken from the decks and the model answers). */
  const FFPAIRS = new Set("a a|if there|are no|a and|a at|a by|a is|a one|a or|a to|a two|across a|across an|across from|across in|across it|across its|across the|across to|after a|after the|against a|against the|also a|also be|also the|although the|an a|and a|and an|and are|and as|and at|and be|and because|and but|and by|and can|and do|and does|and for|and has|and i|and if|and in|and is|and it|and its|and no|and not|and of|and on|and one|and or|and so|and that|and the|and their|and then|and there|and they|and those|and to|and two|and what|and where|and which|and would|and you|are a|are also|are at|are for|are in|are like|are not|are on|are the|are too|are two|are what|around it|around its|around the|as a|as an|as if|as in|as it|as its|as on|as one|as the|as their|as they|as two|as you|at a|at an|at at|at it|at its|at one|at or|at the|at this|at to|at what|at where|be a|be for|be in|be on|be the|be too|because a|because it|because of|because the|because they|because you|before a|before it|before its|before the|before they|before you|being a|between a|between an|between and|between the|between them|between two|between you|but a|but at|but can|but is|but it|but no|but not|but or|but the|but there|but they|but you|by a|by one|by the|by two|can also|can be|can have|can then|could be|could not|did not|did the|do a|do i|do it|do not|do that|do the|do to|do with|does a|does an|does and|does for|does in|does it|does not|does the|does their|does this|does to|during the|for a|for an|for and|for in|for it|for its|for one|for that|for the|for them|for this|for two|for what|for whom|for you|from a|from across|from an|from it|from its|from one|from that|from the|from them|from this|from those|from to|from too|from two|from which|from you|had to|has a|has an|has been|has its|has no|has one|has the|has to|has two|have a|have been|have in|have no|have the|have to|here in|here is|here it|here the|i can|i have|i would|if a|if an|if i|if it|if the|if they|if you|in a|in an|in and|in between|in for|in is|in it|in its|in on|in one|in that|in the|in their|in these|in this|in to|in two|in which|in you|instead of|into a|into an|into it|into its|into one|into or|into the|is a|is across|is also|is an|is and|is at|is between|is for|is from|is in|is it|is its|is like|is no|is not|is on|is one|is so|is that|is the|is there|is this|is to|is too|is two|is very|is what|is where|is which|it a|it also|it and|it are|it as|it at|it be|it can|it could|it does|it for|it from|it had|it has|it in|it into|it is|it must|it not|it on|it or|it should|it so|it that|it the|it to|it was|it were|it when|it which|it will|it with|it without|it would|its two|like a|like the|may be|may not|might be|must a|must also|must be|must not|must the|not a|not an|not as|not at|not be|not for|not have|not in|not on|not one|not the|not through|not to|not what|of a|of an|of and|of being|of it|of its|of one|of or|of that|of the|of them|of these|of this|of those|of two|of what|of which|of with|on a|on an|on and|on as|on from|on in|on it|on its|on one|on or|on so|on that|on the|on their|on this|on to|on two|on which|one and|one as|one at|one for|one from|one is|one of|one on|one so|one that|one the|one then|one you|onto the|or a|or after|or an|or as|or by|or can|or for|or from|or in|or is|or no|or on|or one|or so|or the|or through|or to|or too|or what|or with|rather than|should a|should be|should do|should have|should not|should the|should you|so a|so an|so if|so in|so it|so its|so no|so on|so that|so the|so their|so there|so they|so when|so you|than a|than an|than in|than it|than its|than on|than one|than the|than they|than two|that a|that an|that are|that can|that could|that does|that for|that has|that is|that it|that may|that must|that no|that on|that one|that should|that the|that their|that they|that when|that will|that would|that you|the a|the on|the one|the two|them and|them are|them as|them by|them from|them in|them into|them is|them the|them to|them very|them with|them would|then be|then i|then the|then you|there a|there and|there are|there is|there so|there was|these are|these is|they also|they are|they can|they have|they must|they were|this for|this is|this one|those and|though it|though its|through a|through and|through her|through it|through its|through one|through so|through the|through their|through them|to a|to an|to and|to be|to do|to it|to its|to of|to one|to or|to that|to the|to them|to two|to what|to where|too because|too but|too so|two a|two and|two are|two as|two of|two or|two that|unless you|until it|until the|until they|until you|was a|was for|was in|was not|was very|were for|were not|were very|what a|what an|what and|what are|what can|what did|what does|what i|what is|what it|what must|what should|what that|what the|what they|what this|what to|what was|what will|what would|what you|when a|when it|when one|when the|when to|when you|where a|where and|where is|where it|where must|where one|where the|where these|where they|where this|where to|where two|where you|whereas a|whereas but|whether it|whether the|whether they|whether you|which a|which can|which is|which it|which of|which one|which the|which they|which two|which would|which you|while it|while the|who has|who is|who might|who must|whom and|will be|will not|will this|with a|with an|with at|with it|with its|with no|with one|with that|with the|with their|with this|with two|with what|with where|within a|within one|within the|without a|without being|without it|without the|would be|would have|would not|you a|you and|you are|you but|you can|you could|you do|you for|you have|you in|you is|you may|you must|you should|you so|you that|you the|you to|you were|you what|you whether|you which|you will|you would".split("|"));
  /* Pairs that are grammatical by class even when the decks never happen to use them ("they would", "with those"). */
  const W = (s) => new Set(s.split(" "));
  const SUBJ = W("it they he she we you i that which who there this these those"), AUX = W("is are was were be been being am do does did has have had will would can could should may might must");
  const DETS = W("a an the its their his her this these those that one two"), PREP = W("of in on at by for with from into onto between through around after before during across against within without upon per until via like to");
  const CONJ = W("and or but so because since as if then than while whereas although though unless whether when where"), OBJ = W("it them him her us me you this these those");
  const PRON = W("it they he she we you i there");
  const grammatical = (a, b) =>
    (PRON.has(a) && AUX.has(b)) || (AUX.has(a) && AUX.has(b)) ||
    (CONJ.has(a) && (SUBJ.has(b) || DETS.has(b) || b === "no" || b === "not" || b === "does" || b === "also")) ||
    (PREP.has(a) && (OBJ.has(b) || DETS.has(b) || b === "her" || b === "his")) ||
    (AUX.has(a) && (DETS.has(b) || b === "also" || b === "not" || b === "no"));

  /* A written answer that is only a pile of key words (no sentence structure) earns nothing, and a long
     unbroken run of content words caps the answer at half marks. Returns null when the answer reads as prose. */
  function listLike(text) {
    const toks = text.match(/[a-z0-9']+/g) || [];
    if (toks.length < 4) return null;
    const funcToks = toks.filter((t) => FUNC.has(t));
    const func = funcToks.length;
    if (func / toks.length < 0.14) return "zero";
    if (toks.length < 8) return null;
    // ungrammatical joins ("the and", "a is", "so because", "is is") never occur in prose but fill word salad
    const DET = new Set(["the", "a", "an", "these", "those", "its", "their", "his", "her"]);
    const NOUNLESS = new Set(["and", "or", "but", "is", "are", "was", "were", "be", "so", "because", "of", "to", "it", "in", "on", "for", "by", "with", "from", "at", "as", "if", "then", "than", "not", "the", "a", "an", "will", "can", "does", "do", "has", "have"]);
    const JOINT = new Set(["and", "or", "but", "so", "because", "if", "then", "than"]);
    let bad = 0;
    for (let i = 1; i < toks.length; i++) {
      const p = toks[i - 1], t = toks[i];
      if ((DET.has(p) && NOUNLESS.has(t)) || (p === t) || (JOINT.has(p) && JOINT.has(t) && !(p === "so" && t === "that"))) bad++;
    }
    // a clause that stops on "the", "of", "to", "and"... is a shuffled sentence, not a written one
    const dangle = (text.match(/\b(the|an|of|to|and|or|but|so|because|if|with|for|by|its|their|is|are|that|in|on|at)\s*[.,;:!?]/g) || []).length;
    bad += dangle;
    if (bad >= 2 && bad * 14 >= toks.length) return "zero";
    // two function words side by side ("of the", "so that") come in a few familiar pairs; shuffled prose
    // throws up odd ones ("to no", "it is the so") far more often than a person writing
    let ff = 0, odd = 0;
    text.split(/[.,;:!?()]+/).forEach((seg) => {
      const t = seg.match(/[a-z0-9']+/g) || [];
      for (let i = 1; i < t.length; i++) if (FUNC.has(t[i - 1]) && FUNC.has(t[i])) { ff++; if (!FFPAIRS.has(t[i - 1] + " " + t[i]) && !grammatical(t[i - 1], t[i])) odd++; }
    });
    if (ff >= 4 && odd * 3 >= ff * 2) return "zero";
    // key words strictly alternating with filler words, run after run, is padding rather than prose
    let alt = 1, altMax = 1;
    for (let i = 1; i < toks.length; i++) {
      if (FUNC.has(toks[i]) !== FUNC.has(toks[i - 1])) { alt++; if (alt > altMax) altMax = alt; } else alt = 1;
    }
    if (altMax >= 24) return "zero";
    // padding a pile of key words with the same "the/is/and" over and over is not a sentence
    if (func >= 8 && new Set(funcToks).size < 4) return "zero";
    let longest = 0;
    text.split(/[.,;:!?()]+/).forEach((seg) => {
      let run = 0;
      (seg.match(/[a-z0-9']+/g) || []).forEach((t) => { if (FUNC.has(t)) run = 0; else { run++; if (run > longest) longest = run; } });
    });
    return longest >= 10 ? "half" : null;
  }

  function scoreText(part, ans) {
    const text = HPP.norm(ans);
    const minWords = Math.min(part.minWords == null ? 3 : part.minWords, 5);
    const pts = part.points.map((pt) => ({ desc: pt.desc, marks: pt.marks == null ? 1 : pt.marks, hit: false, group: pt.group }));
    const w = words(text);
    const list = listLike(text);
    const opts = { negCheck: !NEG.test(HPP.norm(part.sample || "")) };
    if (w >= minWords && list !== "zero") part.points.forEach((pt, i) => { pts[i].hit = HPP.pointHit(pt, text, opts); });
    // points sharing a group are alternatives: only the best-scoring one in a group counts
    const seen = new Map();
    pts.forEach((p) => {
      if (!p.group || !p.hit) return;
      if (seen.has(p.group)) p.hit = false; else seen.set(p.group, p);
    });
    let got = Math.min(part.marks, pts.reduce((a, p) => a + (p.hit ? p.marks : 0), 0));
    if (list === "half") got = Math.min(got, Math.floor(part.marks / 2));
    // a mark needs some writing behind it: about four words each at the very least
    got = Math.min(got, Math.max(Math.floor(w / 4), w >= minWords ? 1 : 0));
    const out = { got, of: part.marks, points: pts };
    if (list) out.note = "Your answer reads like a list of key words. Write it as sentences; the marker gives little or no credit for a bare list.";
    return out;
  }

  /* ---- numbers and units ----
     Every number in an answer, scientific notation included ("3.0 x 10^8", "3.0×10⁸", "3e8"). Exponents of units
     ("m s-1", "kg m-3") are stripped first so they are not read as answers. Returns [{ v, i, end }]. */
  function plain(s, keepCase) {
    return (keepCase ? HPP.norm(s, true) : HPP.norm(s))
      .replace(/(\d),(?=\d{3}\b)/g, "$1")
      .replace(/(?<![\d.])(\d{1,3}) (?=\d{3}\b)/g, "$1")
      .replace(/(\d),(\d{1,2})\b/g, "$1.$2");
  }
  HPP.numbers = function (str) {
    let t = plain(str);
    // same text with its capitals (J, Hz, N) so a unit can be read exactly; lower-casing never changes the length
    const keep = plain(str, true);
    const out = [];
    const re = /(?<![\d.])(-?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*(?:x|\*)\s*10\s*\^?\s*\(?([-+]?\d+)\)?|e([-+]?\d+))?/g;
    let m;
    while ((m = re.exec(t))) {
      // a power glued to a letter is a unit exponent ("m s-1", "m^2", "v2"), not a quantity
      const before = t.slice(0, m.index).replace(/\^$/, "");
      if (m[2] == null && m[3] == null && /^-?\d$/.test(m[1]) && /[a-zΩ°]$/.test(before)) continue;
      let v = parseFloat(m[1]);
      const e = m[2] != null ? m[2] : m[3];
      if (e != null) v = v * Math.pow(10, parseInt(e, 10));
      if (isFinite(v)) out.push({ v, i: m.index, end: m.index + m[0].length, text: keep });
    }
    return out;
  };
  /* The last number in the answer is the answer ("v = 9.8 x 0.5 = 4.9 m s-1"). */
  HPP.finalNumber = function (str) {
    const n = HPP.numbers(str);
    return n.length ? n[n.length - 1] : null;
  };
  const sfRound = (v, k) => (v === 0 ? 0 : Number(v.toPrecision(k)));
  /* Does v match the exact answer a? Rounding the exact value to anything from one fewer to two more significant
     figures than the data (sf) is fine, as is any value within `rel` of it (default 0.6%: rounding part-way
     through). `abs` is an absolute tolerance for answers such as angles. Sign is ignored unless `signed`. */
  HPP.closeTo = function (v, a, o) {
    o = o || {};
    if (!isFinite(v)) return false;
    const x = o.signed ? v : Math.abs(v), y = o.signed ? a : Math.abs(a);
    if (o.abs != null && Math.abs(x - y) <= o.abs + 1e-9 * Math.abs(y)) return true;
    if (y === 0) return Math.abs(x) < 1e-12;
    const rel = o.rel == null ? 0.006 : o.rel;
    if (y !== 0 && Math.abs(x - y) / Math.abs(y) <= rel + 1e-12) return true;
    if (o.sf) for (let k = Math.max(1, o.sf); k <= o.sf + 2; k++) if (Math.abs(x - sfRound(y, k)) <= 1e-9 * Math.abs(y)) return true;
    return false;
  };
  /* Units: "m s-1", "m/s", "ms^-1", "m s⁻¹" are all one unit. Reduced to a map of symbol -> power, order ignored. */
  const unitWords = (u) => String(u).replace(/\bkilo\s*/gi, "k").replace(/\bmilli\s*/gi, "m").replace(/\bmicro\s*/gi, "µ").replace(/\bmega\s*/gi, "M").replace(/\bnano\s*/gi, "n").replace(/\s*ohms?\b/gi, "Ω");
  HPP.unitKey = function (u) {
    u = unitWords(u);
    let t = String(u == null ? "" : u)
      .replace(/⁻?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, supRun)
      .replace(/[–—−]/g, "-").replace(/[µμ]/g, "u")
      .replace(/\bohms?\b/gi, "Ω").replace(/[ωΩ]/g, "Ω")
      .replace(/\b(?:degrees?|deg)\b|°/gi, " deg ")
      .replace(/[\s.·*×]+/g, "").replace(/\^/g, "");
    const parts = t.split("/");
    const map = {};
    const add = (str, sign) => {
      const re = /(kg|hz|wb|mol|rad|deg|[A-Za-zΩ])(-?\d+)?/gi;
      let m;
      while ((m = re.exec(str))) {
        const name = m[1].length > 1 ? ({ hz: "Hz", wb: "Wb" }[m[1].toLowerCase()] || m[1].toLowerCase()) : m[1];
        map[name] = (map[name] || 0) + sign * (m[2] != null ? parseInt(m[2], 10) : 1);
      }
    };
    add(parts[0], 1);
    parts.slice(1).forEach((p) => add(p, -1));
    return Object.keys(map).filter((k) => map[k] !== 0).sort().map((k) => k + map[k]).join(" ");
  };
  /* The unit written after the final number: up to the next punctuation. */
  function unitAfter(n) {
    const rest = n.text.slice(n.end).replace(/^\s*(?:\^|\()?\s*/, "");
    return rest.split(/[,;=()\n]|(?<=\S)\.(?:\s|$)/)[0].slice(0, 16).trim();
  }
  const lowKey = (k) => k.toLowerCase().split(" ").sort().join(" ");
  HPP.unitOk = function (n, units) {
    const written = unitAfter(n);
    if (!written) return false;
    const key = HPP.unitKey(written);
    // a unit written in lower case by the bank ("j", "hz") is matched without regard to case
    return [].concat(units).some((u) => HPP.unitKey(u) === key || (u === u.toLowerCase() && lowKey(HPP.unitKey(u)) === lowKey(key)));
  };

  /* SI prefixes: "333 mA" for an ampere answer, "0.34 km s-1" for m s-1. Returns the factor that turns the written
     number into the expected unit (1 when the unit is written exactly, null when it is wrong or missing). */
  const PREFIX = { p: 1e-12, n: 1e-9, "µ": 1e-6, "μ": 1e-6, u: 1e-6, m: 1e-3, c: 1e-2, k: 1e3, M: 1e6, G: 1e9, T: 1e12 };
  HPP.unitScale = function (n, units) {
    const written = unitWords(unitAfter(n));
    if (!written) return null;
    if (HPP.unitOk(n, units)) return 1;
    for (const u of [].concat(units)) {
      const uk = HPP.unitKey(u);
      const f = PREFIX[written[0]];
      if (f == null || written.length < 2) continue;
      const rest = HPP.unitKey(written.slice(1));
      if (rest === uk || (u === u.toLowerCase() && lowKey(rest) === lowKey(uk))) return f;
    }
    return null;
  };
  const isPrefixAlt = (a, b) => { if (!a || !b) return false; const r = Math.abs(Math.log10(Math.abs(b / a))); return r > 0.5 && Math.abs(r / 3 - Math.round(r / 3)) < 0.02; };

  /* A calculation is marked in steps, as SQA do: the relationship, the substitution, the answer with its unit.
     step = { desc, marks?, rel?: [regex over the compacted working], nums?: [number | [alternatives]], ans?: number, alts?: [numbers],
              sf?, rel2?, abs?, unit?: "m s-1" | [..], signed? }
     A step is earned when every part of it that is given holds. The `ans` step reads only the final number. */
  const compact = (s) => HPP.norm(s).replace(/\s+/g, "").replace(/[()]/g, (c) => c).replace(/\*/g, "x");
  function scoreCalc(part, ans) {
    const raw = String(ans == null ? "" : ans);
    const text = HPP.norm(raw);
    const flat = compact(raw);
    const nums = HPP.numbers(raw);
    const fin = nums.length ? nums[nums.length - 1] : null;
    const pts = part.steps.map((st) => ({ desc: st.desc, marks: st.marks == null ? 1 : st.marks, hit: false, group: st.group }));
    if (text.length >= 3 && nums.length) {
      part.steps.forEach((st, i) => {
        let ok = true;
        if (st.rel) ok = st.rel.some((r) => new RegExp(r, "i").test(flat));
        if (ok && st.not && st.not.some((r) => new RegExp(r, "i").test(flat))) ok = false;
        if (ok && st.nums) ok = st.nums.every((want) => [].concat(want).some((w) => nums.some((n) => HPP.closeTo(n.v, w, { rel: st.tol == null ? 0.005 : st.tol, signed: false }))));
        if (ok && st.ans != null) {
          const sc = fin && st.unit ? HPP.unitScale(fin, st.unit) : 1;
          const v = fin ? fin.v * (sc == null ? 1 : sc) : 0;
          const tg = [st.ans].concat(sc === 1 || sc == null ? st.alts || [] : (st.alts || []).filter((a) => !isPrefixAlt(st.ans, a)));
          ok = !!fin && tg.some((a) => HPP.closeTo(v, a, { sf: st.sf, rel: st.rel2, abs: st.abs, signed: st.signed }));
          if (ok && st.unit) ok = sc != null;
        }
        pts[i].hit = ok;
      });
    }
    const seen = new Map();
    pts.forEach((p) => { if (!p.group || !p.hit) return; if (seen.has(p.group)) p.hit = false; else seen.set(p.group, p); });
    const got = Math.min(part.marks, pts.reduce((a, p) => a + (p.hit ? p.marks : 0), 0));
    const out = { got, of: part.marks, points: pts };
    const last = part.steps.find((st) => st.ans != null);
    if (last && last.unit && fin && HPP.closeTo(fin.v, last.ans, { sf: last.sf, rel: last.rel2, abs: last.abs, signed: last.signed }) && HPP.unitScale(fin, last.unit) == null)
      out.note = "The number looks right, but the unit is missing or wrong, and a final answer without its correct unit does not earn the mark.";
    return out;
  }

  HPP.scorePart = function (part, ans) {
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
        // the last number counts, so working ("5 x 300 = 1500"), units and scientific notation ("3.0 x 10^8") are fine
        const n = HPP.finalNumber(String(ans));
        if (!n) return { got: 0, of };
        const targets = [part.a].concat(part.alts || []);
        const cmp = (v, ts) => ts.some((t) => HPP.closeTo(v, t, { sf: part.sf, abs: part.tol, rel: part.rel, signed: part.signed }));
        const wrongUnit = { got: 0, of, note: "The number may be right, but the unit you wrote is not the one the quantity is measured in (or its prefix changes the size)." };
        // the unit is printed beside the box, so a bare number is read in that unit; a unit you add must be right, prefix and all
        if (part.unit && HPP.unitKey(part.unit) && unitAfter(n)) {
          const f = HPP.unitScale(n, part.unit);
          if (f != null) return { got: cmp(n.v * f, [part.a].concat(f === 1 ? (part.alts || []).filter((a) => !isPrefixAlt(part.a, a)) : [])) ? of : 0, of };
          // a listed alternative unit ("mV") goes with its own listed value
          const g = (part.unitAlts || []).length ? HPP.unitScale(n, part.unitAlts) : null;
          if (g === 1) return { got: cmp(n.v, (part.alts || []).filter((a) => isPrefixAlt(part.a, a))) ? of : 0, of };
          return wrongUnit;
        }
        return { got: cmp(n.v, [part.a].concat((part.alts || []).filter((a) => !isPrefixAlt(part.a, a)))) ? of : 0, of };
      }
      case "match": {
        const picked = Array.isArray(ans) ? ans : [];
        const right = part.pairs.filter((_, i) => picked[i] === i).length;
        return { got: Math.min(of, right), of };
      }
      case "text": return scoreText(part, ans);
      case "calc": return scoreCalc(part, ans);
      default: throw new Error("unknown part type " + part.type);
    }
  };

  /* The model answer for a part, as something a test can feed back to the marker. */
  HPP.modelAnswer = function (part) {
    switch (part.type) {
      case "mcq": return part.a;
      case "multi": return part.a.slice();
      case "num": return part.a;
      case "match": return part.pairs.map((_, i) => i);
      case "text": case "calc": return part.sample;
      default: return null;
    }
  };

  HPP.partsMarks = (q) => q.parts.reduce((a, p) => a + p.marks, 0);
  HPP.AREAS = [
    { id: "s1", name: "Section 1: multiple choice", short: "Section 1", note: "20 marks of the 130" },
    { id: "odu", name: "Our Dynamic Universe", short: "Universe" },
    { id: "paw", name: "Particles and Waves", short: "Particles & Waves" },
    { id: "ele", name: "Electricity", short: "Electricity" },
    { id: "skills", name: "Experiments, uncertainties & open-ended", short: "Skills" },
  ];
  /* Grade guide: the share of the total marks needed for each grade is set each year; these are the usual round figures
     (70 / 60 / 50 / 40 per cent) and are a guide only. */
  HPP.GRADES = [["A", 0.7], ["B", 0.6], ["C", 0.5], ["D", 0.4]];
})();
