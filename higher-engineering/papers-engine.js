/* Past-paper practice: the auto-marker.
   Pure functions, no DOM, so the question banks can be tested in Node (tests/papers.test.mjs).
   A part is { type, marks, ... }; scorePart(part, answer) returns
     { got, of, points: [{ desc, marks, hit }], detail }.
   Answer shapes:  mcq -> option index | multi -> array of option indexes | num -> string or number
                   match -> array of chosen definition indexes (one per pair) | text -> string */
(function () {
  "use strict";
  const HEP = (window.HEP = window.HEP || {});

  /* Lower-case, tidy punctuation, and fold the symbols candidates type for the same thing. */
  HEP.norm = function (s) {
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
  const NEGWIN = 90;
  /* Negation: when the part's model answer says nothing negative, a negator just before a matched phrase
     turns the claim round ("STEP is not neutral"), so that point is not awarded. Parts whose model answer
     itself uses negatives (`opts.negOK`) skip the check. */
  const NEG = /\b(not|never|cannot|no longer|isn't|aren't|doesn't|don't|won't|can't|wouldn't|couldn't|shouldn't|didn't)\b|n't\b/;
  HEP.pointHit = function (pt, text, opts) {
    const all = pt.all || [], any = pt.any || [], not = pt.not || [];
    if (!all.length && !any.length) return false;
    if (not.some((p) => rx(p).test(text))) return false;
    if (any.length && !any.some((p) => rx(p).test(text))) return false;
    if (opts && opts.negCheck && !pt.negOK) {
      const spans = [];
      all.concat(any).forEach((p) => { const g = new RegExp(rx(p).source, "gi"); let m; while ((m = g.exec(text))) { spans.push([m.index, m.index + m[0].length]); if (m[0] === "") g.lastIndex++; } });
      if (spans.some(([a]) => NEG.test(text.slice(Math.max(0, a - NEGWIN), a + 1).split(/[.;!?]|\bbut\b|\bhowever\b/).pop()))) return false;
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
  const FFPAIRS = new Set("and when|on by|if no|no the|if yes|yes the|otherwise it|through to|which are|into two|these two|let it|those are|that are|which were|a which|a so|if not|then it|a a|a and|a at|a by|a is|a one|a or|a to|a two|across a|across an|across from|across in|across it|across its|across the|across to|after a|after the|against a|against the|also a|also be|also the|although the|an a|and a|and an|and are|and as|and at|and be|and because|and but|and by|and can|and do|and does|and for|and has|and i|and if|and in|and is|and it|and its|and no|and not|and of|and on|and one|and or|and so|and that|and the|and their|and then|and there|and they|and those|and to|and two|and what|and where|and which|and would|and you|are a|are also|are at|are for|are in|are like|are not|are on|are the|are too|are two|are what|around it|around its|around the|as a|as an|as if|as in|as it|as its|as on|as one|as the|as their|as they|as two|as you|at a|at an|at at|at it|at its|at one|at or|at the|at this|at to|at what|at where|be a|be for|be in|be on|be the|be too|because a|because it|because of|because the|because they|because you|before a|before it|before its|before the|before they|before you|being a|between a|between an|between and|between the|between them|between two|between you|but a|but at|but can|but is|but it|but no|but not|but or|but the|but there|but they|but you|by a|by one|by the|by two|can also|can be|can have|can then|could be|could not|did not|did the|do a|do i|do it|do not|do that|do the|do to|do with|does a|does an|does and|does for|does in|does it|does not|does the|does their|does this|does to|during the|for a|for an|for and|for in|for it|for its|for one|for that|for the|for them|for this|for two|for what|for whom|for you|from a|from across|from an|from it|from its|from one|from that|from the|from them|from this|from those|from to|from too|from two|from which|from you|had to|has a|has an|has been|has its|has no|has one|has the|has to|has two|have a|have been|have in|have no|have the|have to|here in|here is|here it|here the|i can|i have|i would|if a|if an|if i|if it|if the|if they|if you|in a|in an|in and|in between|in for|in is|in it|in its|in on|in one|in that|in the|in their|in these|in this|in to|in two|in which|in you|instead of|into a|into an|into it|into its|into one|into or|into the|is a|is across|is also|is an|is and|is at|is between|is for|is from|is in|is it|is its|is like|is no|is not|is on|is one|is so|is that|is the|is there|is this|is to|is too|is two|is very|is what|is where|is which|it a|it also|it and|it are|it as|it at|it be|it can|it could|it does|it for|it from|it had|it has|it in|it into|it is|it must|it not|it on|it or|it should|it so|it that|it the|it to|it was|it were|it when|it which|it will|it with|it without|it would|its two|like a|like the|may be|may not|might be|must a|must also|must be|must not|must the|not a|not an|not as|not at|not be|not for|not have|not in|not on|not one|not the|not through|not to|not what|of a|of an|of and|of being|of it|of its|of one|of or|of that|of the|of them|of these|of this|of those|of two|of what|of which|of with|on a|on an|on and|on as|on from|on in|on it|on its|on one|on or|on so|on that|on the|on their|on this|on to|on two|on which|one and|one as|one at|one for|one from|one is|one of|one on|one so|one that|one the|one then|one you|onto the|or a|or after|or an|or as|or by|or can|or for|or from|or in|or is|or no|or on|or one|or so|or the|or through|or to|or too|or what|or with|rather than|should a|should be|should do|should have|should not|should the|should you|so a|so an|so if|so in|so it|so its|so no|so on|so that|so the|so their|so there|so they|so when|so you|than a|than an|than in|than it|than its|than on|than one|than the|than they|than two|that a|that an|that are|that can|that could|that does|that for|that has|that is|that it|that may|that must|that no|that on|that one|that should|that the|that their|that they|that when|that will|that would|that you|the a|the on|the one|the two|them and|them are|them as|them by|them from|them in|them into|them is|them the|them to|them very|them with|them would|then be|then i|then the|then you|there a|there and|there are|there is|there so|there was|these are|these is|they also|they are|they can|they have|they must|they were|this for|this is|this one|those and|though it|though its|through a|through and|through her|through it|through its|through one|through so|through the|through their|through them|to a|to an|to and|to be|to do|to it|to its|to of|to one|to or|to that|to the|to them|to two|to what|to where|too because|too but|too so|two a|two and|two are|two as|two of|two or|two that|unless you|until it|until the|until they|until you|was a|was for|was in|was not|was very|were for|were not|were very|what a|what an|what and|what are|what can|what did|what does|what i|what is|what it|what must|what should|what that|what the|what they|what this|what to|what was|what will|what would|what you|when a|when it|when one|when the|when to|when you|where a|where and|where is|where it|where must|where one|where the|where these|where they|where this|where to|where two|where you|whereas a|whereas but|whether it|whether the|whether they|whether you|which a|which can|which is|which it|which of|which one|which the|which they|which two|which would|which you|while it|while the|who has|who is|who might|who must|whom and|will be|will not|will this|with a|with an|with at|with it|with its|with no|with one|with that|with the|with their|with this|with two|with what|with where|within a|within one|within the|without a|without being|without it|without the|would be|would have|would not|you a|you and|you are|you but|you can|you could|you do|you for|you have|you in|you is|you may|you must|you should|you so|you that|you the|you to|you were|you what|you whether|you which|you will|you would".split("|"));
  /* Pairs that are grammatical by class even when the decks never happen to use them ("they would", "with those"). */
  const W = (s) => new Set(s.split(" "));
  const SUBJ = W("it they he she we you i that which who there this these those"), AUX = W("is are was were be been being am do does did has have had will would can could should may might must");
  const DETS = W("a an the its their his her this these those that one two"), PREP = W("of in on at by for with from into onto between through around after before during across against within without upon per until via like to");
  const CONJ = W("and or but so because since as if then than while whereas although though unless whether when where"), OBJ = W("it them him her us me you this these those");
  const PRON = W("it they he she we you i there");
  const DEM = W("this these those that");
  const grammatical = (a, b) =>
    (PRON.has(a) && AUX.has(b)) || (AUX.has(a) && AUX.has(b)) || (CONJ.has(a) && PRON.has(b)) || (a === "if" && b === "not")
    || ((DEM.has(a) || DEM.has(b)) && (CONJ.has(a) || CONJ.has(b) || PREP.has(a) || PREP.has(b) || AUX.has(a) || AUX.has(b) || PRON.has(a) || PRON.has(b)))
    || (a === "than" && PREP.has(b)) || (CONJ.has(a) && (b === "with" || b === "one" || b === "for"));

  /* A written answer that is only a pile of key words (no sentence structure) earns nothing, and a long
     unbroken run of content words caps the answer at half marks. Returns null when the answer reads as prose. */
  const AUXV = new Set("is are was were be been can could will would may might must should does do did has have had to that which because so if when then since as where while whereas".split(" "));
  function listLike(text) {
    const toks = text.match(/[a-z0-9']+/g) || [];
    if (toks.length < 4) return null;
    const funcToks = toks.filter((t) => FUNC.has(t));
    const func = funcToks.length;
    // numbers and one-letter labels (a trace such as "G1: inputs 1 and 1, output X = 0") do not dilute the function-word ratio
    const wordy = toks.filter((t) => !/^\d+$/.test(t) && !/^[a-z]\d?$/.test(t) || FUNC.has(t)).length;
    if (func / Math.max(1, wordy) < 0.14) return (text.match(/[,;]/g) || []).length >= 3 && func >= 1 ? "half" : "zero";
    // a run of "and the"-joined nouns with no verb, auxiliary or linking word is a list, however it is punctuated
    const joins = (text.match(/\b(and|or)\b/g) || []).length;
    if (joins >= 3 && (!toks.some((t) => AUXV.has(t)) || (joins >= 4 && joins * 7 >= toks.length))) return "half";
    if (toks.length < 8) return null;
    // ungrammatical joins ("the and", "a is", "so because", "is is") never occur in prose but fill word salad
    const DET = new Set(["the", "a", "an", "these", "those", "its", "their", "his", "her"]);
    const NOUNLESS = new Set(["and", "or", "but", "is", "are", "was", "were", "be", "so", "because", "of", "to", "it", "in", "on", "for", "by", "with", "from", "at", "as", "if", "then", "than", "not", "the", "a", "an", "will", "can", "does", "do", "has", "have"]);
    const JOINT = new Set(["and", "or", "but", "so", "because", "if", "then", "than"]);
    let bad = 0;
    for (let i = 1; i < toks.length; i++) {
      const p = toks[i - 1], t = toks[i];
      if ((DET.has(p) && NOUNLESS.has(t)) || (p === t) || (JOINT.has(p) && JOINT.has(t) && !(p === "so" && t === "that") && !(p === "and" && (t === "so" || t === "then")) && !(p === "but" && t === "then") && !(p === "so" && t === "then"))) bad++;
    }
    // a clause that stops on "the", "of", "to", "and"... is a shuffled sentence, not a written one
    const dangle = (text.match(/\b(the|an|of|to|and|or|but|so|because|if|with|for|by|its|their|is|are|that|in|on|at)\s*[.;:!?]|\b(the|an|of|to|and|or|but|so|because|if|its|their|is|are|that)\s*,/g) || []).length;
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
    if (ff >= 3 && odd * 2 >= ff) return "half";
    // key words strictly alternating with filler words, run after run, is padding rather than prose
    let alt = 1, altMax = 1;
    for (let i = 1; i < toks.length; i++) {
      if (FUNC.has(toks[i]) !== FUNC.has(toks[i - 1])) { alt++; if (alt > altMax) altMax = alt; } else alt = 1;
    }
    if (altMax >= 24) return "zero";
    // padding a pile of key words with the same "the/is/and" over and over is not a sentence
    if (func >= 12 && new Set(funcToks).size < 4) return "zero";
    let longest = 0;
    text.split(/[.,;:!?()]+/).forEach((seg) => {
      let run = 0;
      (seg.match(/[a-z0-9']+/g) || []).forEach((t) => { if (FUNC.has(t)) run = 0; else { run++; if (run > longest) longest = run; } });
    });
    return longest >= 10 ? "half" : null;
  }

  function scoreText(part, ans) {
    const text = HEP.norm(ans);
    const minWords = Math.min(part.minWords == null ? 3 : part.minWords, 5);
    const pts = part.points.map((pt) => ({ desc: pt.desc, marks: pt.marks == null ? 1 : pt.marks, hit: false, group: pt.group }));
    const w = words(text);
    // a capital letter standing alone ("valve A", "B-") names a component, not the article "a"
    const ident = HEP.norm(String(ans).replace(/\s*(?:->|\u2192|=>)\s*/g, ", then ").replace(/\bA(?=[+-])/g, "\u0001").replace(/(^|[.!?:;]\s*)A\b/g, "$1\u0002").replace(/\b[A-Z]\b/g, "x1").replace(/[\u0001\u0002]/g, "A"));
    const list = listLike(ident);
    const opts = { negCheck: !NEG.test(HEP.norm(part.sample || "")) };
    if (w >= minWords && list !== "zero") part.points.forEach((pt, i) => { pts[i].hit = HEP.pointHit(pt, text, opts); });
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

  HEP.scorePart = function (part, ans) {
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
        const SUP = { "\u2070": 0, "\u00b9": 1, "\u00b2": 2, "\u00b3": 3, "\u2074": 4, "\u2075": 5, "\u2076": 6, "\u2077": 7, "\u2078": 8, "\u2079": 9 };
        // spelled-out units become symbols, and "(3 s.f.)" asides and trailing full stops are not part of the answer
        const WORD = { ohm: "\u03a9", ohms: "\u03a9", amp: "A", amps: "A", ampere: "A", amperes: "A", volt: "V", volts: "V", watt: "W", watts: "W", second: "s", seconds: "s", joule: "J", joules: "J", newton: "N", newtons: "N", hertz: "Hz", siemens: "S" };
        const PW = { giga: "G", mega: "M", kilo: "k", milli: "m", micro: "\u00b5", nano: "n" };
        const clean = String(ans)
          .replace(/\(\s*\d+\s*(?:s\.?\s*f\.?|sig\w*\.?\s*fig\w*\.?|d\.?\s*p\.?|decimal places?)\s*\)/gi, " ")
          .replace(/\b(giga|mega|kilo|milli|micro|nano)?\s*(ohms?|amps?|amperes?|volts?|watts?|seconds?|joules?|newtons?|hertz|siemens)\b/gi, (m, p, u) => (p ? PW[p.toLowerCase()] : "") + WORD[u.toLowerCase()])
          .replace(/(^|=)\s*-\s+(?=\d)/g, "$1-")
          .replace(/(\d)\s*k\s*$/i, "$1k")
          .replace(/[\s.]+$/, "");
        let raw = clean.toLowerCase().replace(/[\u2212\u2013\u2014]/g, "-")
          .replace(/10([-\u207b]?)([\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+)/g, (m, sg, d) => "10^" + (sg ? "-" : "") + [...d].map((c) => SUP[c]).join(""))
          .replace(/(cm|mm|km|\bm)\s*\^?\s*[23²³]/g, "$1")
          .replace(/\ba\s*\/?\s*v\s*\^?\s*\{?-\s*1\}?\b/g, " ")
          .replace(/\b(?:rad|rev|mm|cm|km|m)?\s*(?:s|min)\s*\^?\s*-\s*1\b/g, " ")      // unit tails: m s-1, rad s^-1, rev min-1
          .replace(/(\d),(?=\d{3}\b)/g, "$1")                          // 2,880,000
          .replace(/(\d) (?=\d{3}\b)/g, "$1")                          // 2 880 000
          .replace(/(\d),(\d{1,2})\b/g, "$1.$2");                      // 9,6
        if (raw.includes("=")) raw = raw.slice(raw.lastIndexOf("=") + 1);
        raw = raw.replace(/(\d(?:\.\d+)?)\s*(?:x|\*|\u00d7)\s*10\s*\^?\s*(\(?-?\d+\)?)/g, (m, a, e) => a + "e" + e.replace(/[()]/g, ""))
          .replace(/(\d)\s*e\s*(-?\d)/g, "$1e$2");
        const nums = raw.match(/(?:(?<![\w.)])-)?(?:\d+(?:\.\d+)?|\.\d+)(?:e-?\d+)?/g);
        let v = nums ? parseFloat(nums[nums.length - 1]) : NaN;
        if (!isFinite(v)) return { got: 0, of };
        // a prefix typed on the unit ("0.003 A" for a part wanted in mA) is converted, so a missed prefix cannot pass for right
        const PF = { G: 1e9, M: 1e6, k: 1e3, "": 1, m: 1e-3, "\u00b5": 1e-6, "\u03bc": 1e-6, u: 1e-6, n: 1e-9 };
        const UNIT = /^([GMkm\u00b5\u03bcun]?)(A|V|W|\u03a9|\u2126|ohms?|J|N|s|S|Hz|m|Pa)$/;
        const au = clean.match(/([A-Za-z\u00b5\u03bc\u03a9\u2126]{1,5})\s*\)?\s*$/), eu = String(part.unit || "").match(UNIT);
        const am = au && au[1].match(UNIT);
        if (am && eu) {
          const base = (b) => (/^(\u03a9|\u2126|ohms?)$/.test(b) ? "ohm" : b);
          if (base(am[2]) === base(eu[2])) v = v * PF[am[1]] / PF[eu[1]];
          else if (am[2] !== "m" && eu[2] !== "m") return { got: 0, of };      // a different quantity ("2.4 A" for a power) is wrong
        }
        if (/%\s*\)?\s*$/.test(clean) && Math.abs(part.a) <= 1 && part.unit !== "%") v = v / 100;     // "0.80 (80%)" for a ratio
        const targets = [part.a].concat(part.alts || []);
        const tol = part.tol == null ? 0 : part.tol;
        const within = (t) => Math.abs(v - t) <= tol + 1e-9 || (part.rtol != null && Math.abs(v - t) <= part.rtol * Math.abs(t) + 1e-12);
        return { got: targets.some(within) ? of : 0, of };
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
  HEP.modelAnswer = function (part) {
    switch (part.type) {
      case "mcq": return part.a;
      case "multi": return part.a.slice();
      case "num": return part.a;
      case "match": return part.pairs.map((_, i) => i);
      case "text": return part.sample;
      default: return null;
    }
  };

  HEP.partsMarks = (q) => q.parts.reduce((a, p) => a + p.marks, 0);
  HEP.AREAS = [
    { id: "systems", name: "Systems, energy & the engineer's world", short: "Systems & energy", lo: 10, hi: 17 },
    { id: "analogue", name: "Analogue electronics", short: "Analogue", lo: 20, hi: 35 },
    { id: "digital", name: "Digital & programmable electronics", short: "Digital", lo: 15, hi: 25 },
    { id: "mechanisms", name: "Drives, mechanisms & pneumatics", short: "Drives & pneumatics", lo: 10, hi: 20 },
    { id: "structures", name: "Structures & materials", short: "Structures", lo: 23, hi: 39 },
  ];
  /* The 2026 minimum marks for each grade as a share of the 160-mark course (question paper plus assignment; 117, 103, 90 and 76 marks). */
  HEP.GRADES = [["A", 117 / 160], ["B", 103 / 160], ["C", 90 / 160], ["D", 76 / 160]];
})();
