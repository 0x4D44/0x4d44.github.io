/* Explain builder: typed cause + effect answers about the recruitment poster (dtp.html, #w-explain).
   Pure functions and data, no DOM, so the marking is testable in Node (tests/explain.test.mjs).
   Each mark is one typed sentence. It is marked by the past-papers auto-marker (papers-engine.js,
   HGP.scorePart) against the question's cause + effect points, so the same anti-gaming rules apply:
   a bare list of key words, a negated claim or a too-short answer earns nothing.
   HGX.mark(qk, [answer1, answer2]) -> { rows: [{ ok, why, cause }], got, of }. */
(function () {
  "use strict";
  const HGP = window.HGP;
  const HGX = (window.HGX = {});
  const rx = (s) => new RegExp(s, "i");
  /* a, then within n words, b */
  const near = (a, n, b) => `(${a})\\W+(\\w+\\W+){0,${n}}(${b})`;

  /* What emphasis does to the viewer: stands out, noticed or read first, the eye drawn to it. */
  const EMPH = "stand(s|ing)? out|stood out|notice\\w*|prominent|obvious|eye.?catching|jump(s|ed|ing)? out|pop(s|ped)? out|" +
    "(catch|grab|attract|draw|drew|caught|pull|direct|lead|led|guide|take|took)\\w*\\W+(\\w+\\W+){0,4}(eye|attention|gaze|viewer|reader)|" +
    "(eye|attention|gaze)\\W+(\\w+\\W+){0,3}(drawn|goes|go|pulled|attracted|caught|led|taken|follows?)|drawn (to|first|down)|focal|singled out|" +
    "(seen|read|noticed|spotted) first|first thing|(first|immediately)\\W+(\\w+\\W+){0,2}(see|notice|read|spot|look)|easy to (see|spot|find|notice|read)|" +
    "clearly visible|readable|legible|from a distance|from far away|\\battention\\b|(see|spot|notice|read|find|look)\\w*\\W+(\\w+\\W+){0,1}(first|quickly|easily|straight away|immediately)|most important";
  /* What depth does: the item seems to come forward, sit in front, or the flat page looks layered or 3D. */
  const DEEP = "(come|comes|coming|came|stand|stands|sit|sits|seem|seems|appear|appears|look|looks|float|floats|lift\\w*|raise\\w*|pop|pops|move|moves|jump|jumps)\\W+(\\w+\\W+){0,4}(forwards?|out|in front|closer|nearer|above|off the page|on top|towards)|" +
    "\\bin front\\b|\\bcloser\\b|\\bnearer\\b|\\bforwards?\\b|three.?dimensional|\\b3-?d\\b|layer\\w*|off the page|raised|lifted|floating|advanc\\w*|behind it|further back|recede\\w*|stand\\w* off";
  /* What unity does: the parts read as one planned design, or as a group that belongs together. */
  const UNIT = "(belong|fit|go|goes|hang|tied|tie|ties|link\\w*|connect\\w*|held|hold|holds|work|works|joined|join)\\w*\\W+(\\w+\\W+){0,3}(together|with each other|as one|as a whole)|" +
    "(one|single|whole|planned|consistent|coherent|complete|cohesive|unified|organised|organized)\\W+(\\w+\\W+){0,2}(design|piece|layout|poster|unit|whole|set|group)|" +
    "\\b(as|in|into|one|a|the same) (\\w+ )?group\\b|grouped|(are|is|look|looks|seem|seems) related|related to each other|\\btogether\\b|consistent|unified|planned";

  /* Points are tried in order and the first hit is credited, so a more specific feature comes first
     (the line "from the aircraft to the date panel" also mentions the date panel).
     A sample cause + effect sentence for each point: the hidden "show me" answers, and the model answer
     the marker is tested against. */
  const Q = {
    emphasis: {
      q: "Explain how emphasis has been achieved in the recruitment poster.",
      eff: EMPH,
      points: [
        { id: "path", desc: "The dotted red line leading from the aircraft to the date",
          cause: near("dott\\w*|dash\\w*|red|curv\\w*", 3, "line|path|trail") + "|" + near("line|path|trail", 8, "date|panel|aircraft|plane"),
          sample: ["A dotted red line runs from the aircraft to the date panel,", "which leads the viewer's eye down to the date so it is noticed."] },
        { id: "date", desc: "The date panel: navy bold text on a yellow accent panel",
          cause: near("date|time|open evening|4 nov|7 ?pm", 12, "yellow|bold|accent|panel|box|highlight\\w*|bright|capitals|heavy|banner|block") + "|" + near("yellow|accent|bold|bright", 8, "date|time|open evening"),
          sample: ["The date is in navy bold text on a yellow accent panel,", "so it stands out and is one of the first things the viewer notices."] },
        { id: "title", desc: "The title: large white reverse text on a navy band",
          cause: near("title|heading|headline|join 1805|1805 squadron|squadron name|name of the squadron", 10, "large|big|bigg?er|biggest|largest|huge|white|reverse\\w*|navy|dark|band|bold|capitals") + "|" + near("large|big|white|reverse\\w*|bold", 6, "title|heading|headline"),
          sample: ["The title is large white reverse text on a navy band,", "so the viewer reads the most important information first."] },
      ],
      misfit: [
        { cause: near("(aircraft|plane|main|big|large)\\W+(\\w+\\W+){0,1}(photo\\w*|picture|image)|photo\\w*|picture|image", 10, "larg\\w*|bigg\\w*|biggest|dominan\\w*|fills|most space|takes up"),
          why: "✘ 0: making one item far larger than everything else is dominance (the main focal point of the whole poster). Emphasis questions want how particular items, such as the date or title, are made to stand out." },
      ],
    },
    depth: {
      q: "Explain how depth has been created in the recruitment poster.",
      eff: DEEP,
      points: [
        { id: "overlap", desc: "The ship photo overlaps the corner of the main photo",
          cause: near("ship|inset|small\\w*|vellum|photo\\w*|picture|image", 8, "overlap\\w*|on top of|over the|over part|covers?|sits? over") + "|" + near("overlap\\w*", 6, "ship|inset|photo\\w*|picture|image"),
          sample: ["The ship photo overlaps the corner of the main photo,", "so it seems to sit in front of it, giving a layered look to a flat page."] },
        { id: "shadow", desc: "The ship photo has a drop shadow",
          cause: "(drop.?shadow|shadow)",
          sample: ["The ship photo has a drop shadow,", "so it looks raised off the page, nearer to the viewer than the main photo."] },
        { id: "frame", desc: "The warm red-orange frame against the cool blue sky",
          cause: near("warm|red|orange", 3, "frame|border|outline|edge") + "|" + near("frame|border|outline", 4, "warm|red|orange"),
          sample: ["The ship photo has a warm red-orange frame against the cool blue sky,", "and warm colours advance, so it seems to come forward."] },
      ],
      misfit: [],
    },
    unity: {
      q: "Explain how unity has been achieved in the recruitment poster.",
      eff: UNIT,
      points: [
        { id: "colours", desc: "The same red, yellow and blue repeated across the poster",
          cause: near("same|repeat\\w*|consistent|matching|limited|three|common|few", 4, "colou?rs?|colou?r scheme|palette") + "|" + near("colou?rs?|palette|red,? yellow and blue", 8, "repeat\\w*|same|consistent|throughout|again|used in|across|everywhere"),
          sample: ["The same red, yellow and blue are repeated in the pennants, headings, date panel and badge,", "so the viewer sees the items as belonging together in one planned design."] },
        { id: "caption", desc: "The caption placed directly beneath the ship photo",
          cause: near("caption|label|aboard hms vellum", 8, "beneath|below|under\\w*|next to|close|near|beside|by|right by|directly") + "|" + near("close|near|proximity", 6, "caption|label"),
          sample: ["The caption sits directly beneath the ship photo,", "so the viewer reads the caption and photo as a related group."] },
      ],
      misfit: [
        { cause: near("pennants?|flags?|bunting|triangles?", 10, "spac\\w*|interval\\w*|repeat\\w*|evenly|equal\\w*|regular\\w*|row"),
          why: "✘ 0: repeating the pennants at equal spacing is rhythm. For unity, point to what ties the whole design together: a consistent colour scheme, or related items grouped together." },
      ],
    },
  };
  HGX.Q = Q;
  HGX.KEYS = Object.keys(Q);

  /* One mark's sentence, scored as a one-mark text part. Returns the id of the cause it earned, or null. */
  function hitCause(qk, text) {
    const qq = Q[qk];
    const part = {
      type: "text", marks: 1,
      sample: qq.points.map((p) => p.sample.join(" ")).join(" "),
      points: qq.points.map((p) => ({ desc: p.desc, win: 140, all: [p.cause, qq.eff] })),
    };
    const r = HGP.scorePart(part, text);
    const i = r.points.findIndex((p) => p.hit);
    return { id: r.got && i >= 0 ? qq.points[i].id : null, note: r.note };
  }

  /* Why a sentence earned nothing, in the order a marker would say it. */
  function whyNot(qk, text) {
    const qq = Q[qk], t = HGP.norm(text);
    const misfit = qq.misfit.find((m) => rx(m.cause).test(t));
    const own = qq.points.find((p) => rx(p.cause).test(t));
    const other = !own && HGX.KEYS.filter((k) => k !== qk).find((k) => Q[k].points.some((p) => rx(p.cause).test(t)));
    const hasEff = rx(qq.eff).test(t);
    if (misfit && !own) return misfit.why;
    if (other) return `✘ 0: that feature creates ${other}, not ${qk}. Re-read the question and pick a feature that creates ${qk}.`;
    if (!own && rx(`\\b(creat|achiev|giv|show|add|us|mak|produc)\\w*\\W+(\\w+\\W+){0,3}(emphasis|depth|unity)\\b`).test(t))
      return `✘ 0: "creates ${qk}" names the design principle, not an effect on the viewer. Name the feature, then say what it does to the viewer.`;
    if (own && !hasEff) return `✘ 0: you named a feature (${own.desc.toLowerCase()}) but not its effect. Add what it does to the viewer: "…, so the viewer …".`;
    if (own) return "✘ 0: the feature and its effect need to be linked in one clear sentence: \"[feature], so [effect on the viewer].\"";
    if (hasEff) return "✘ 0: an effect with no cause. The marker cannot tell which feature you mean: name something the designer did on the poster.";
    return `✘ 0: no feature of this poster that creates ${qk} was found. Name something the designer did (look at the poster), then say what it does to the viewer.`;
  }

  HGX.mark = function (qk, answers) {
    let got = 0; const used = new Set();
    const rows = answers.map((a) => {
      const text = String(a == null ? "" : a).trim();
      if (!text) return { ok: false, cause: null, why: "✘ 0: nothing written. Type a cause and its effect." };
      const h = hitCause(qk, text);
      if (h.note && !h.id) return { ok: false, cause: null, why: "✘ 0: " + h.note };
      if (h.id && used.has(h.id)) return { ok: false, cause: h.id, why: "✘ 0: the same cause as an earlier mark. A second mark needs a different feature." };
      if (h.id) { used.add(h.id); got++; return { ok: true, cause: h.id, why: "✔ 1 mark: a relevant cause linked to its effect." }; }
      return { ok: false, cause: null, why: whyNot(qk, text) };
    });
    return { rows, got, of: answers.length };
  };
})();
