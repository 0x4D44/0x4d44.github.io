/* Chapter: Same question, twice. How random is a model, and which knob moves it?
   Data: site/chance.json, built by tools/chance_site.py from data/stoch-*.jsonl. */
Zoo.chapter("chance", ["chance"], function (el, data) {
  var h = Zoo.h, C = data.chance;
  var COND = { t0: "temperature 0", "t0.5": "temperature 0.5", t1: "temperature 1", "t1.5": "temperature 1.5",
    t2: "temperature 2", low: "effort low", medium: "effort medium", high: "effort high", xhigh: "effort xhigh",
    max: "effort max", "default": "default settings", "t1-seed": "temperature 1, fixed seed" };
  function lab(m) { return C.labels[m] || Zoo.model(m).label; }
  function who(m) { var x = Zoo.model(m); return h("span", { class: "who" }, [h("span", { class: "dot " + x.provider }), lab(m)]); }
  function card(m, kids) { return h("div", { class: "card" }, [h("h3", null, [who(m)])].concat(kids)); }
  function pct(a, b) { return Math.round(100 * a / b) + "%"; }

  Zoo.head(el, "Chapter 10", "Same question, twice",
    "Ask a model the same thing twice and you may or may not get the same answer. Most people put that down to " +
    "<em>temperature</em>, the dial that decides how boldly a model samples from its own odds. Here we turn every dial " +
    "the models still have, ask each question twenty times, and then change only the wording, to see where the " +
    "randomness comes from.");
  el.appendChild(h("p", { class: "banner", html: "<b>Initial results.</b> A pilot on " + C.models.length +
    " models (" + C.models.map(lab).join(", ") + "), " + C.answers.toLocaleString() + " answers, about " +
    Zoo.money(C.spent) + ", collected on 25 November 2026. A run across every model in the zoo is under way, and " +
    "this chapter will grow when it lands." }));

  // --- The knobs each model still has.
  var kt = h("table", { class: "data" }, [h("thead", null, [h("tr", null, [h("th", { text: "Model" }),
    h("th", { text: "Temperature" }), h("th", { text: "Reasoning effort" })])]),
    h("tbody", null, C.models.map(function (m) {
      var k = C.knobs[m] || {};
      return h("tr", null, [h("td", null, [who(m)]), h("td", { text: k.temperature ? "yes" : "refused" }),
        h("td", { text: k.effort ? "yes" : "–" })]);
    }))]);
  el.appendChild(h("h3", { class: "sub", text: "First surprise: most of the dials are gone" }));
  el.appendChild(h("p", { html: "Only GPT-4o still lets you set the temperature. GPT-6.2 Sol answers that the setting " +
    "“is not supported with this model”; Claude Opus 5.5 says it “is deprecated”. Both still take a " +
    "<em>reasoning effort</em> (how long to think before answering), so for them we turn that instead." }));
  el.appendChild(h("div", { class: "table-wrap" }, [kt]));

  // --- 1. The dial.
  el.appendChild(h("h3", { class: "sub", text: "1 · Turning the dial" }));
  el.appendChild(h("p", { html: "Each bar is twenty answers to one question at one setting, split by answer. " +
    "One solid block means the model said the same thing twenty times." }));
  var Q = [{ value: "number", label: "A number 1–100" }, { value: "colour", label: "Favourite colour" },
    { value: "city", label: "A city" }, { value: "story", label: "A 300-word story" }];
  var dialBody = h("div");
  el.appendChild(Zoo.toggles(Q, "number", drawDial));
  el.appendChild(dialBody);
  drawDial("number");

  function stack(cnt) {
    var bar = h("div", { class: "stack", role: "img", "aria-label": cnt.counts.map(function (a) {
      return (a[0] || "(empty)") + " " + a[1]; }).join(", ") });
    var shown = 0, tone = ["--seq-6", "--seq-4", "--seq-3", "--seq-2", "--seq-1", "--seq-1"];
    cnt.counts.forEach(function (a, i) {
      shown += a[1];
      bar.appendChild(h("span", { style: "flex:" + a[1] + ";background:var(" + tone[i] + ")" + (i < 2 ? ";color:#fff" : ""),
        "data-tip": (a[0] || "(empty)") + ": " + a[1] + " of " + cnt.n, text: a[1] / cnt.n >= 0.15 ? a[0] : "" }));
    });
    if (cnt.n > shown) bar.appendChild(h("span", { class: "rest", style: "flex:" + (cnt.n - shown),
      "data-tip": (cnt.n - shown) + " other answers" }));
    return bar;
  }

  function drawDial(p) {
    dialBody.innerHTML = "";
    dialBody.appendChild(h("p", { class: "prompt", text: p === "story" ? C.prompts.story : C.prompts.short[p] }));
    var grid = h("div", { class: "grid wide" });
    C.models.forEach(function (m) {
      var d = C.dial[m];
      if (!d) return;
      var rows = d.conds.map(function (c) {
        if (p === "story") {
          var s = d.story[c];
          if (!s) return null;
          return h("div", { class: "dialrow" }, [h("span", { class: "cond", text: COND[c] || c }),
            h("span", { class: "storyline", text: s.titles + " titles in " + s.n + (s.top_titles[0][1] > 1 ?
              " · “" + s.top_titles[0][0] + "” ×" + s.top_titles[0][1] : "") })]);
        }
        var cnt = (d.short[p] || {})[c];
        if (!cnt) return null;
        return h("div", { class: "dialrow" }, [h("span", { class: "cond", text: COND[c] || c }), stack(cnt),
          h("span", { class: "n", text: cnt.distinct === 1 ? "1 answer" : cnt.distinct + " answers" })]);
      });
      grid.appendChild(card(m, rows));
    });
    dialBody.appendChild(grid);
    var lp = C.dial["gpt-4o"] && C.dial["gpt-4o"].logprobs;
    if (p === "number" && lp) dialBody.appendChild(odds(lp, C.dial["gpt-4o"].short.number));
    dialBody.appendChild(h("p", { class: "note", html: {
      number: "Temperature works as advertised on GPT-4o, up to a point: more heat, more different numbers. The two reasoners " +
        "do something else. Opus at low effort says 42 almost every time and spreads out when it thinks harder; Sol barely moves.",
      colour: "Nothing shifts blue. GPT-4o says blue twenty times out of twenty even at temperature 1.5, where its number answers " +
        "have scattered. When a model is near-certain, no amount of heat will tip it.",
      city: "GPT-4o picks Paris; the reasoners prefer Lisbon, Tokyo and Kyoto. Sol names Lisbon twenty times in a row at " +
        "medium and high effort.",
      story: "Every story differs, but the titles give the game away: GPT-4o at temperature 0 calls all eight “The Last Train Home”, " +
        "and Opus at low effort reaches for the same lighthouse keeper again and again."
    }[p] }));
  }

  function odds(lp, byCond) {
    // GPT-4o's own odds for its first token against what twenty samples at temperature 1 produced.
    var t1 = byCond.t1 || {}, seen = {};
    (t1.counts || []).forEach(function (a) { seen[a[0]] = a[1]; });
    var rows = lp.slice(0, 8).map(function (t) {
      var s = (seen[t[0]] || 0) / (t1.n || 1);
      return h("div", { class: "odds", "data-tip": t[0] + ": the model gives it " + pct(t[1], 1) +
        "; sampled " + (seen[t[0]] || 0) + " of " + (t1.n || 0) + " times at temperature 1" }, [
        h("span", { class: "lab", text: t[0] }),
        h("span", { class: "track" }, [h("i", { class: "p", style: "width:" + 100 * t[1] + "%" }),
          h("i", { class: "s", style: "width:" + 100 * s + "%" })]),
        h("span", { class: "val", text: pct(t[1], 1) + " · " + pct(s, 1) })]);
    });
    return h("div", { class: "card oddscard" }, [h("h3", null, ["What GPT-4o believes, and what it says"]),
      h("p", { class: "note", html: "GPT-4o will also report its own odds for the first token of its reply. " +
        "<span class='key p'></span> its odds &nbsp; <span class='key s'></span> share of twenty samples at temperature 1. " +
        "The sampler is doing exactly what it is told: the randomness is real, it is just drawn from a very lopsided die." })]
      .concat(rows));
  }

  // --- 2. Temperature zero, and the seed.
  el.appendChild(h("h3", { class: "sub", text: "2 · Twenty identical requests" }));
  el.appendChild(h("p", { html: "Temperature 0 is meant to make a model pick its single most likely word every time, " +
    "so the same request should give the same reply. We sent the story prompt twenty times." }));
  var rg = h("div", { class: "grid wide" });
  C.models.forEach(function (m) {
    var R = C.repeat[m];
    if (!R) return;
    Object.keys(R).sort().forEach(function (c) {
      var s = R[c];
      rg.appendChild(card(m, [h("div", { class: "cond", text: COND[c] || c }),
        h("p", { class: "big", text: s.distinct + " different stories in " + s.n }),
        h("div", { class: "meta", text: [s.titles + (s.titles === 1 ? " title" : " titles") + (s.top_titles[0][1] > 1 ?
          " (“" + s.top_titles[0][0] + "” ×" + s.top_titles[0][1] + ")" : ""),
          "a typical pair parts at word " + s.median_split, s.fork ? "the closest pair ran " + s.fork.words + " words together" : ""]
          .filter(Boolean).join(" · ") })]));
    });
  });
  el.appendChild(rg);
  var f = C.repeat["gpt-4o"] && C.repeat["gpt-4o"].t0 && C.repeat["gpt-4o"].t0.fork;
  if (f) {
    var words = f.prefix.split(" "), keep = words.slice(-40).join(" ");
    el.appendChild(h("div", { class: "card forkcard" }, [h("h3", null, ["Where two temperature-0 stories part company"]),
      h("p", { class: "fork" }, [h("span", { class: "same", text: (words.length > 40 ? "… " : "") + keep + " " }),
        h("span", { class: "branch a", text: f.a + " …" }), h("br"),
        h("span", { class: "same ghost", text: "… " }), h("span", { class: "branch b", text: f.b + " …" })]),
      h("div", { class: "meta", text: "word for word for " + f.words + " words, then a different word, then a different story" })]));
  }
  el.appendChild(h("p", { html: "So temperature 0 is not a repeat button. The usual explanation, and our working guess, " +
    "is that the provider batches requests together and floating-point sums come out very slightly differently depending " +
    "on what else is in the batch. When two words are nearly tied, that rounding decides which one wins, and from then " +
    "on the story is different. A fixed <code>seed</code> (GPT-4o accepts one) narrowed twenty stories at temperature 1 " +
    "to two main storylines, but did not make any two identical." }));

  // --- 3. Wording.
  el.appendChild(h("h3", { class: "sub", text: "3 · Asking differently" }));
  el.appendChild(h("p", { html: "Now hold the settings still and change the words: seven ways to ask for a number " +
    "from 1 to 100, twenty times each. If the answers move more between wordings than between repeats, the prompt matters " +
    "more than the dice." }));
  var WL = { base: "Think of a number…", pick: "Pick a number…", choose: "Choose any number…",
    random: "Give me a random number…", words: "…one and one hundred", lower: "all lower case", space: "a trailing space" };
  var wg = h("div", { class: "grid wide" });
  C.models.forEach(function (m) {
    var W = C.wording[m];
    if (!W) return;
    var rows = Object.keys(WL).filter(function (w) { return W.by[w]; }).map(function (w) {
      var b = W.by[w];
      return h("div", { class: "dialrow" }, [h("span", { class: "cond", text: WL[w], "data-tip": (C.wordings || {})[w] || "" }),
        stack(b), h("span", { class: "n", text: b.counts[0][0] })]);
    });
    wg.appendChild(card(m, rows.concat([h("div", { class: "meta", text: "share of the spread that comes from the wording: " +
      pct(W.from_wording, 1) })])));
  });
  el.appendChild(wg);
  el.appendChild(h("p", { class: "note", html: "The word <em>random</em> is the one that moves them: Sol swaps 47 for 67, Opus " +
    "swaps 42 for 73. For GPT-4o and Sol, capital letters and a stray space change almost nothing; Opus is touchier. “Share of the spread” compares the entropy " +
    "of all 140 answers with the average entropy inside one wording; the gap is what the wording added." }));

  // --- 4. Relay.
  var RL = C.relay;
  if (RL && RL.chains.length) {
    el.appendChild(h("h3", { class: "sub", text: "4 · The same story, five times" }));
    el.appendChild(h("p", { html: "Chapter 3’s relay passed one story along a line of models. Here three models (" +
      C.models.map(lab).join(", ") + ") take turns, twelve sentences each, five times over, all from the same opening line. " +
      "Does a small difference grow, butterfly-style, or do the stories split at once?" }));
    el.appendChild(h("p", { class: "prompt", text: RL.opening }));
    var first = h("ol", { class: "firsts" }, RL.chains.map(function (c) {
      var t = c.filter(function (x) { return x.turn === 1; })[0];
      return h("li", { text: t ? t.text : "" });
    }));
    el.appendChild(h("div", { class: "card" }, [h("h3", null, ["The second sentence, in each of the five runs"]), first]));
    el.appendChild(h("p", { html: "They part at once. Only the first sentence is shared, and the second is already five " +
      "different stories, although most of them reach for something unfolding, glowing or holographic. After that the " +
      "runs share about as many words, turn by turn, as any two unrelated sentences do (" + Object.keys(RL.overlap).map(function (k) {
        return RL.overlap[k]; }).join(", ") + " word overlap, turns 1–12). There is no slow butterfly: the split is immediate. " +
      "Shared words are a crude yardstick, and the wider run will measure by meaning instead." }));
    var det = h("details", { class: "tableview" }, [h("summary", { text: "Read all five stories" })]);
    RL.chains.forEach(function (c, i) {
      det.appendChild(h("div", { class: "card chain" }, [h("h3", null, ["Run " + (i + 1)]),
        h("p", null, [RL.opening + " "].concat(c.map(function (x) {
          return h("span", { class: "sent " + Zoo.model(x.model).provider, "data-tip": lab(x.model) + ", turn " + x.turn,
            text: x.text + " " }); })))]));
    });
    el.appendChild(det);
  }

  el.appendChild(h("h3", { class: "sub", text: "So how random are they?" }));
  el.appendChild(h("p", { html: "Less than a coin and more than a lookup table. On short answers they are close to fixed: " +
    "twenty tries usually give one, two or three answers, whatever the dial says. On anything long they never repeat " +
    "themselves, not even at temperature 0, but they circle the same few ideas. And the dials are not the only lever: one " +
    "word in the question moved Sol’s favourite number further than any setting could, and moved Opus’s as far as effort did." }));
  el.appendChild(h("p", { class: "note", html: "Method: twenty samples per setting for short answers, eight stories per setting in the dial " +
    "and twenty in the repeat test, through the OpenAI and Anthropic APIs on 25 November 2026. Effort is OpenAI’s " +
    "<code>reasoning.effort</code> and Anthropic’s <code>output_config.effort</code>. Opus 5.5 thinks without being asked, so " +
    "a reply cut off by the token limit was re-asked rather than counted. Answers are compared after lower-casing and dropping " +
    "punctuation. Code: <code>tools/stochastic.py</code>; data: <code>data/stoch-*.jsonl</code>." }));
});
