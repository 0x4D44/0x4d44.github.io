/* Past-paper practice: the auto-marker.
   Pure functions, no DOM, so the question banks can be tested in Node (tests/papers.test.mjs).
   A part is { type, marks, ... }; scorePart(part, answer) returns
     { got, of, points: [{ desc, marks, hit }], detail }.
   Part types: mcq, multi, num, match, text (prose, pattern-marked), code (program text, pattern-marked
   without the prose checks) and sql (the query is run, via HCP.sqlRun, and its result compared with the model query's).
   Answer shapes:  mcq -> option index | multi -> array of option indexes | num -> string or number
                   match -> array of chosen definition indexes (one per pair) | text -> string */
(function () {
  "use strict";
  const HCP = (window.HCP = window.HCP || {});

  /* Lower-case, tidy punctuation, and fold the symbols candidates type for the same thing. */
  HCP.norm = function (s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[‘’“”]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/×/g, "x")
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
  const NEG = /\b(not|never|cannot|no longer|without|wrong|incorrect|false|untrue|opposite|unlike|neither|nor|unable|fail|fails|failed|isn't|aren't|doesn't|don't|won't|can't|wouldn't|couldn't|shouldn't|didn't)\b|n't\b/;
  const SPLIT = /[.;!?]|\bbut\b|\bhowever\b|\bwhereas\b/;
  HCP.pointHit = function (pt, text, opts) {
    const all = pt.all || [], any = pt.any || [], not = pt.not || [];
    if (!all.length && !any.length) return false;
    if (not.some((p) => rx(p).test(text))) return false;
    if (any.length && !any.some((p) => rx(p).test(text))) return false;
    if (opts && opts.negCheck && !pt.negOK) {
      const spans = [];
      all.concat(any).forEach((p) => { const g = new RegExp(rx(p).source, "gi"); let m; while ((m = g.exec(text))) { spans.push([m.index, m.index + m[0].length]); if (m[0] === "") g.lastIndex++; } });
      if (spans.some(([a, z]) => NEG.test(text.slice(Math.max(0, a - NEGWIN), a + 1).split(SPLIT).pop())
        || NEG.test(text.slice(z, z + 28).split(SPLIT)[0]))) return false;
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
  const FFPAIRS = new Set("a a|a and|a at|a by|a is|a one|a or|a to|a two|across a|across an|across from|across in|across it|across its|across the|across to|after a|after the|against a|against the|also a|also be|also the|although the|an a|and a|and an|and are|and as|and at|and be|and because|and but|and by|and can|and do|and does|and for|and has|and i|and if|and in|and is|and it|and its|and no|and not|and of|and on|and one|and or|and so|and that|and the|and their|and then|and there|and they|and those|and to|and two|and what|and where|and which|and would|and you|are a|are also|are at|are for|are in|are like|are not|are on|are the|are too|are two|are what|around it|around its|around the|as a|as an|as if|as in|as it|as its|as on|as one|as the|as their|as they|as two|as you|at a|at an|at at|at it|at its|at one|at or|at the|at this|at to|at what|at where|be a|be for|be in|be on|be the|be too|because a|because it|because of|because the|because they|because you|before a|before it|before its|before the|before they|before you|being a|between a|between an|between and|between the|between them|between two|between you|but a|but at|but can|but is|but it|but no|but not|but or|but the|but there|but they|but you|by a|by one|by the|by two|can also|can be|can have|can then|could be|could not|did not|did the|do a|do i|do it|do not|do that|do the|do to|do with|does a|does an|does and|does for|does in|does it|does not|does the|does their|does this|does to|during the|for a|for an|for and|for in|for it|for its|for one|for that|for the|for them|for this|for two|for what|for whom|for you|from a|from across|from an|from it|from its|from one|from that|from the|from them|from this|from those|from to|from too|from two|from which|from you|had to|has a|has an|has been|has its|has no|has one|has the|has to|has two|have a|have been|have in|have no|have the|have to|here in|here is|here it|here the|i can|i have|i would|if a|if an|if i|if it|if the|if they|if you|in a|in an|in and|in between|in for|in is|in it|in its|in on|in one|in that|in the|in their|in these|in this|in to|in two|in which|in you|instead of|into a|into an|into it|into its|into one|into or|into the|is a|is across|is also|is an|is and|is at|is between|is for|is from|is in|is it|is its|is like|is no|is not|is on|is one|is so|is that|is the|is there|is this|is to|is too|is two|is very|is what|is where|is which|it a|it also|it and|it are|it as|it at|it be|it can|it could|it does|it for|it from|it had|it has|it in|it into|it is|it must|it not|it on|it or|it should|it so|it that|it the|it to|it was|it were|it when|it which|it will|it with|it without|it would|its two|like a|like the|may be|may not|might be|must a|must also|must be|must not|must the|not a|not an|not as|not at|not be|not for|not have|not in|not on|not one|not the|not through|not to|not what|of a|of an|of and|of being|of it|of its|of one|of or|of that|of the|of them|of these|of this|of those|of two|of what|of which|of with|on a|on an|on and|on as|on from|on in|on it|on its|on one|on or|on so|on that|on the|on their|on this|on to|on two|on which|one and|one as|one at|one for|one from|one is|one of|one on|one so|one that|one the|one then|one you|onto the|or a|or after|or an|or as|or by|or can|or for|or from|or in|or is|or no|or on|or one|or so|or the|or through|or to|or too|or what|or with|rather than|should a|should be|should do|should have|should not|should the|should you|so a|so an|so if|so in|so it|so its|so no|so on|so that|so the|so their|so there|so they|so when|so you|than a|than an|than in|than it|than its|than on|than one|than the|than they|than two|that a|that an|that are|that can|that could|that does|that for|that has|that is|that it|that may|that must|that no|that on|that one|that should|that the|that their|that they|that when|that will|that would|that you|the a|the on|the one|the two|them and|them are|them as|them by|them from|them in|them into|them is|them the|them to|them very|them with|them would|then be|then i|then the|then you|there a|there and|there are|there is|there so|there was|these are|these is|they also|they are|they can|they have|they must|they were|this for|this is|this one|those and|though it|though its|through a|through and|through her|through it|through its|through one|through so|through the|through their|through them|to a|to an|to and|to be|to do|to it|to its|to of|to one|to or|to that|to the|to them|to two|to what|to where|too because|too but|too so|two a|two and|two are|two as|two of|two or|two that|unless you|until it|until the|until they|until you|was a|was for|was in|was not|was very|were for|were not|were very|what a|what an|what and|what are|what can|what did|what does|what i|what is|what it|what must|what should|what that|what the|what they|what this|what to|what was|what will|what would|what you|when a|when it|when one|when the|when to|when you|where a|where and|where is|where it|where must|where one|where the|where these|where they|where this|where to|where two|where you|whereas a|whereas but|whether it|whether the|whether they|whether you|which a|which can|which is|which it|which of|which one|which the|which they|which two|which would|which you|while it|while the|who has|who is|who might|who must|whom and|will be|will not|will this|with a|with an|with at|with it|with its|with no|with one|with that|with the|with their|with this|with two|with what|with where|within a|within one|within the|without a|without being|without it|without the|would be|would have|would not|you a|you and|you are|you but|you can|you could|you do|you for|you have|you in|you is|you may|you must|you should|you so|you that|you the|you to|you were|you what|you whether|you which|you will|you would".split("|"));
  /* Pairs that are grammatical by class even when the decks never happen to use them ("they would", "with those"). */
  const W = (s) => new Set(s.split(" "));
  const SUBJ = W("it they he she we you i that which who there this these those"), AUX = W("is are was were be been being am do does did has have had will would can could should may might must");
  const DETS = W("a an the its their his her this these those that one two"), PREP = W("of in on at by for with from into onto between through around after before during across against within without upon per until via like to");
  const CONJ = W("and or but so because since as if then than while whereas although though unless whether when where"), OBJ = W("it them him her us me you this these those");
  const PRON = W("it they he she we you i there");
  const grammatical = (a, b) =>
    (PRON.has(a) && AUX.has(b)) || (AUX.has(a) && AUX.has(b)) || (SUBJ.has(a) && AUX.has(b)) || (AUX.has(a) && (DETS.has(b) || PREP.has(b)))
    || (PREP.has(a) && (DETS.has(b) || OBJ.has(b))) || ((OBJ.has(a) || PRON.has(a)) && PREP.has(b)) || (CONJ.has(a) && (DETS.has(b) || PRON.has(b) || SUBJ.has(b)));

  /* A written answer that is only a pile of key words (no sentence structure) earns nothing, and a long
     unbroken run of content words caps the answer at half marks. Returns null when the answer reads as prose. */
  function listLike(text) {
    // hyphenated compounds are one word ("one-to-many", "read-only"), and "IN:" / "OUT:" / "A:" labels are not prose words
    text = text.replace(/([a-z0-9])-(?=[a-z0-9])/g, "$1").replace(/\b(?:in|out|a|q|ans)\s*:/g, " ");
    const toks = text.match(/[a-z0-9']+/g) || [];
    if (toks.length < 6) return null;
    const funcToks = toks.filter((t) => FUNC.has(t));
    const func = funcToks.length;
    if (func / toks.length < 0.14) return "zero";
    // "I think that days and hot pos and frost and count": key words glued with "and", no verb or preposition anywhere
    const glue = new Set(["and", "or", "i", "that", "the", "a", "an", "it", "this", "think", "also", "then"]);
    if (toks.length >= 8 && (() => { const n = toks.filter((t) => t === "and" || t === "or").length; return n >= 5 || (n >= 3 && !/,/.test(text)); })() && funcToks.filter((t) => !glue.has(t)).length <= Math.floor(toks.length / 14)) return "zero";
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
    const dangle = (text.match(/\b(the|an|of|to|and|or|but|so|because|with|for|by|its|their|that)\s*[.,;:!?]/g) || []).length;
    bad += dangle;
    if (bad >= 2 && bad * 14 >= toks.length) return "zero";
    // two function words side by side ("of the", "so that") come in a few familiar pairs; shuffled prose
    // throws up odd ones ("to no", "it is the so") far more often than a person writing
    let ff = 0, odd = 0;
    text.split(/[.,;:!?()]+/).forEach((seg) => {
      const t = seg.match(/[a-z0-9']+/g) || [];
      for (let i = 1; i < t.length; i++) if (FUNC.has(t[i - 1]) && FUNC.has(t[i])) { ff++; if (!FFPAIRS.has(t[i - 1] + " " + t[i]) && !grammatical(t[i - 1], t[i])) odd++; }
    });
    if (ff >= 3 && odd * 2 >= ff) return "zero";
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

  HCP._listLike = listLike;
  function scoreText(part, ans) {
    const text = HCP.norm(ans);
    const minWords = Math.min(part.minWords == null ? 3 : part.minWords, 5);
    const pts = part.points.map((pt) => ({ desc: pt.desc, marks: pt.marks == null ? 1 : pt.marks, hit: false, group: pt.group }));
    const w = words(text);
    const list = listLike(text);
    const sampleText = HCP.norm(part.sample || "");
    if (w >= minWords && list !== "zero") part.points.forEach((pt, i) => {
      // the negation check runs on every point whose own model wording survives it (the sample must still earn the mark)
      if (pt._nc === undefined) pt._nc = !HCP.pointHit(pt, sampleText, { negCheck: true }) && HCP.pointHit(pt, sampleText, null) ? false : true;
      pts[i].hit = HCP.pointHit(pt, text, { negCheck: pt._nc });
    });
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

  /* Program text is not prose: no function-word checks, only the marking points (which should use `all`
     patterns that sit close together, so a loop and its comparison must be in the same stretch of code).
     An answer needs a few tokens per mark, so a pile of key words ("for while if") earns nothing. */
  function scoreCode(part, ans) {
    const text = HCP.norm(ans);
    const toks = (text.match(/[a-z0-9_]+|[^\sa-z0-9_]/g) || []).length;
    const pts = part.points.map((pt) => ({ desc: pt.desc, marks: pt.marks == null ? 1 : pt.marks, hit: false, group: pt.group }));
    const lines = ans.split(/\n|;/).filter((l) => l.trim().length > 1).length;
    if (toks >= 4 * Math.min(part.marks, 3) && (lines >= 2 || toks >= 12)) part.points.forEach((pt, i) => { pts[i].hit = HCP.pointHit(pt, text, null); });
    const seen = new Map();
    pts.forEach((p) => { if (!p.group || !p.hit) return; if (seen.has(p.group)) p.hit = false; else seen.set(p.group, p); });
    const got = Math.min(part.marks, pts.reduce((a, p) => a + (p.hit ? p.marks : 0), 0), Math.floor(toks / 4));
    return { got, of: part.marks, points: pts };
  }

  /* SQL: the query is run against the part's own tables. HCP.sqlRun(schema, sql) must be supplied by the host
     (the page loads sql.js; the tests load it in Node) and returns { cols, rows } or { error }. */
  const cell = (v) => (typeof v === "number" ? String(Math.round(v * 100) / 100) : v == null ? "NULL" : String(v));
  const rowKey = (r) => JSON.stringify(r.map(cell));
  const sortedKeys = (rows, f) => rows.map((r) => f(r)).sort();
  function scoreSql(part, ans) {
    const of = part.marks;
    if (!HCP.sqlRun) throw new Error("HCP.sqlRun is not set");
    const sql = String(ans).trim();
    const out = { got: 0, of, sql: true };
    if (!sql) return out;
    const exp = HCP.sqlRun(part.schema, part.solution, part.check);
    const got = HCP.sqlRun(part.schema, sql, part.check);
    out.expected = exp; out.actual = got;
    if (got.error) { out.note = "Your SQL did not run: " + got.error; return out; }
    const same = got.rows.length === exp.rows.length && got.rows.every((r) => r.length === exp.rows[0].length || !exp.rows.length)
      && JSON.stringify(sortedKeys(got.rows, rowKey)) === JSON.stringify(sortedKeys(exp.rows, rowKey));
    const inOrder = same && got.rows.every((r, i) => rowKey(r) === rowKey(exp.rows[i]));
    // comments are not queries, and a SELECT of bare literals ("select 'x' union all select 'y'") is hard-wiring
    const text = HCP.norm(sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " "));
    const missing = (part.must || []).filter((m) => !rx(m).test(text));
    const IN_LIST = /\bin\s*\(\s*(?:'[^']*'|"[^"]*"|-?\d)/;
    const hardWired = (!part.dml && /\bselect\s+(?:distinct\s+)?(?:'[^']*'|"[^"]*"|-?\d)|\bvalues\s*\(/.test(text)) || (!part.allowIn && IN_LIST.test(text));
    if (hardWired) { out.note = "That query hard-wires values taken from the data instead of working them out, so it earns no marks. Use the column conditions the question describes."; out.missing = ["hard-wired"]; return out; }
    out.missing = missing;
    if (same && (inOrder || !part.ordered)) {
      if (!missing.length) out.got = of;
      else { out.got = of > 1 ? Math.floor(of / 2) : 0; out.note = "The result is right, but the query does not do what the question asked in the way it asked (" + part.mustDesc + "). A hard-wired answer earns little."; }
    } else if (same && part.ordered) {
      out.got = missing.length ? (of > 1 ? Math.floor(of / 2) : 0) : of > 1 ? of - 1 : 0; out.note = "The right rows, but not in the order asked for.";
    } else {
      // right rows with the columns in a different order or with extra/missing columns is not a match; say what differs
      out.note = got.rows.length !== exp.rows.length ? `Your query returned ${got.rows.length} row${got.rows.length === 1 ? "" : "s"}; the model query returns ${exp.rows.length}.` : "The same number of rows, but not the same values or columns.";
    }
    return out;
  }

  HCP.scorePart = function (part, ans) {
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
        // the last number in the answer counts, so working ("5 x 300 = 1500") and units ("12 mm") are fine;
        // a hedge ("186 or 198", "it is not 198") counts for nothing
        let raw = String(ans).toLowerCase().trim();
        if (/\b(or|not|isn't|wrong|incorrect|maybe|perhaps|either|neither)\b|n't\b/.test(raw)) return { got: 0, of };
        const WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, sixteen: 16, twenty: 20 };
        raw = raw.replace(/(\d)\s*to the power( of)?\s*(\d)/g, "$1^$3").replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|sixteen|twenty)\b(?!'s)/g, (w) => WORDS[w]);
        raw = raw.replace(/^[01](?:[\s_]?[01])*$/, (m) => m.replace(/[\s_]/g, ""));   // 1101 1010 / 1101_1010
        raw = raw.replace(/(\d(?:\.\d+)?)\s*(thousand|million|billion)\b/g, (m, n, w) => String(parseFloat(n) * { thousand: 1e3, million: 1e6, billion: 1e9 }[w]));
        raw = raw.replace(/(cm|mm|km|\bm)\s*\^?\s*[23²³]/g, "$1")
          .replace(/(\d),(?=\d{3}\b)/g, "$1")                          // 2,880,000
          .replace(/(\d) (?=\d{3}\b)/g, "$1")                          // 2 880 000
          .replace(/(\d),(\d{1,2})\b/g, "$1.$2");                      // 9,6
        if (!raw.includes("=") && /\d\s+\d/.test(raw)) return { got: 0, of };   // a bare run of numbers ("0 26") is not an answer
        if (raw.includes("=")) raw = raw.slice(raw.lastIndexOf("=") + 1);
        raw = raw.replace(/[−–—]/g, "-").replace(/×/g, "x");
        // a plain sum / product / power ("150 + 20 + 4", "3.2 x 10^9", "2^8", "3.2e9") is worked out; subtraction is left alone
        // units: the one printed beside the box may be typed or left off, but a different one is a wrong answer
        const uw = raw.match(/\d\s*(bits?|bytes?|kilobytes?|megabytes?|gigabytes?|kb|mb|gb|tb|pixels?|px|em|rem|cm|mm|km|%|hz|khz|mhz|ghz)\b|\d\s*(%)/);
        if (uw) {
          const norm1 = (u) => String(u || "").toLowerCase().replace(/s$/, "").replace(/^kilobyte$/, "kb").replace(/^megabyte$/, "mb").replace(/^gigabyte$/, "gb").replace(/^pixel$/, "px").replace(/^byte$/, "b");
          const typed = norm1(uw[1] || uw[2]);
          if (part.unit ? norm1(part.unit) !== typed : /^(bit|b|kb|mb|gb|tb|px|%|hz|khz|mhz|ghz)$/.test(typed)) return { got: 0, of };
        }
        let v = NaN;
        const expr = raw.replace(/\s*(x|\*)\s*/g, "*").replace(/\^/g, "**").replace(/\s+/g, "").replace(/[a-z%]+$/, "");
        if (/^[\d.]+(?:e\d+)?(?:(?:\*\*?|[+\/])[\d.]+(?:e\d+)?)+$|^[\d.]+e\d+$/.test(expr)) { try { v = Function('"use strict";return (' + expr + ")")(); } catch (e) { v = NaN; } }
        let digitsTyped = "";
        if (!isFinite(v)) {
          // a minus counts as a sign only when it is not a subtraction ("12 - 5" reads as 5, "-5" and "= -5" as -5)
          const nums = raw.match(/(?<![\d.)])-?\d+(?:\.\d+)?|(?<![\d.)])-?\.\d+|\d+(?:\.\d+)?|\.\d+/g);
          v = nums ? parseFloat(nums[nums.length - 1]) : NaN;
          digitsTyped = nums ? nums[nums.length - 1].replace(/^-/, "") : "";
        }
        if (!isFinite(v)) return { got: 0, of };
        // a binary answer has to be the right width ("00000100", not "0100")
        if (part.bits && digitsTyped && digitsTyped.length !== part.bits) return { got: 0, of };
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
      case "code": return scoreCode(part, ans);
      case "sql": return scoreSql(part, ans);
      default: throw new Error("unknown part type " + part.type);
    }
  };

  /* The model answer for a part, as something a test can feed back to the marker. */
  HCP.modelAnswer = function (part) {
    switch (part.type) {
      case "mcq": return part.a;
      case "multi": return part.a.slice();
      case "num": return part.bits ? String(part.a).padStart(part.bits, "0") : part.a;
      case "match": return part.pairs.map((_, i) => i);
      case "text": case "code": return part.sample;
      case "sql": return part.solution;
      default: return null;
    }
  };

  HCP.partsMarks = (q) => q.parts.reduce((a, p) => a + p.marks, 0);
  HCP.AREAS = [
    { id: "sdd", name: "Software design & development: analysis, design, testing, evaluation", short: "Software design" },
    { id: "prog", name: "Programming: data structures, algorithms & code", short: "Programming" },
    { id: "cs", name: "Computer systems", short: "Systems" },
    { id: "db", name: "Database design & development", short: "Database" },
    { id: "web", name: "Web design & development", short: "Web" },
  ];
  /* 2025 minimum marks for each grade as a share of the 120-mark course (2025 course report). */
  HCP.GRADES = [["A", 82 / 120], ["B", 71 / 120], ["C", 60 / 120], ["D", 49 / 120]];
})();
