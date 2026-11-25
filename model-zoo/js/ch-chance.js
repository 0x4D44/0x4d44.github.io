/* Chapter: Same question, twice. How random is a model, and which knob moves it?
   Data: site/chance.json, built by tools/chance_site.py from data/stoch-*.jsonl. */
Zoo.chapter("chance", ["chance"], function (el, data) {
  var h = Zoo.h, C = data.chance;
  var COND = { t0: "temperature 0", "t0.5": "temperature 0.5", t1: "temperature 1", "t1.5": "temperature 1.5",
    low: "effort low", medium: "effort medium", high: "effort high", "default": "default settings",
    "t1-seed": "temperature 1, fixed seed" };
  function lab(m) { return C.labels[m] || Zoo.model(m).label; }
  function prov(m) { return Zoo.model(m).provider || (m.indexOf("claude-") === 0 ? "anthropic" : "openai"); }
  function who(m) { return h("span", { class: "who" }, [h("span", { class: "dot " + prov(m) }), lab(m)]); }
  function card(m, kids) { return h("div", { class: "card" }, [h("h3", null, [who(m)])].concat(kids)); }
  function pct(x) { return Math.round(100 * x) + "%"; }
  function sub(t) { el.appendChild(h("h3", { class: "sub", text: t })); }
  function para(html, cls) { el.appendChild(h("p", { class: cls || null, html: html })); }
  var M = C.models, W = C.wording, D = C.dial, R = C.repeat;
  var tempM = M.filter(function (m) { return (C.knobs[m] || {}).temperature; });
  var effM = M.filter(function (m) { var k = C.knobs[m] || {}; return !k.temperature && k.effort; });
  var says = {};
  M.forEach(function (m) { var s = (C.knobs[m] || {}).says; if (s) says[s.split(". Please")[0]] = 1; });
  var nSays = ["no", "one", "two", "three", "four", "five", "six"][Object.keys(says).length] || Object.keys(says).length;
  var noneM = M.filter(function (m) { var k = C.knobs[m] || {}; return !k.temperature && !k.effort; });

  Zoo.head(el, "Chapter 10", "Same question, twice",
    "Ask a model the same thing twice and you may or may not get the same answer. Most people put that down to " +
    "<em>temperature</em>, the dial that decides how boldly a model samples from its own odds. Here we turn every dial " +
    "the models still have, ask each question twenty times, and then change only the wording, to see where the " +
    "randomness comes from.");
  el.appendChild(h("p", { class: "banner", html: "<b>" + M.length + " models, " + C.answers.toLocaleString() +
    " answers, about " + Zoo.money(C.spent) + ".</b> Collected on 25 November 2026: a three-model pilot in the morning, " +
    "every model in the zoo in the afternoon, except the five slow <em>pro</em> models." }));

  // --- The knobs.
  sub("First surprise: most of the dials are gone");
  para("We asked every model to set its temperature, and separately its reasoning effort (how long to think before " +
    "answering). Only " + tempM.length + " of " + M.length + " still accept a temperature, nearly all of them older models. " +
    effM.length + " take only an effort setting, and " + noneM.length + " take neither. The refusals come in " + nSays + " wordings:");
  el.appendChild(h("ul", { class: "says" }, Object.keys(says).map(function (s) { return h("li", { text: "“" + s + "”" }); })));
  function chips(title, list) {
    return h("div", { class: "knobgroup" }, [h("h4", { text: title + " · " + list.length }),
      h("div", { class: "chips" }, list.map(function (m) { return h("span", { class: "chip" }, [who(m)]); }))]);
  }
  el.appendChild(chips("Temperature", tempM));
  el.appendChild(chips("Effort only", effM));
  if (noneM.length) el.appendChild(chips("Neither", noneM));

  // --- 1. The dial.
  sub("1 · Turning the dial");
  para("Each model answered three short questions (a number from 1 to 100, a favourite colour, a city) twenty times at " +
    "every setting it takes, and wrote eight stories. The chart averages the spread of the short answers, in bits: " +
    "0 means the same answer every time; 4.3 would be twenty different answers.");
  var mb = C.mean_bits, order = ["t0", "t0.5", "t1", "t1.5", "low", "medium", "high"], max = 0;
  order.forEach(function (c) { if (mb[c]) max = Math.max(max, mb[c][0]); });
  el.appendChild(h("div", { class: "card meanbits" }, [h("h3", null, ["Average spread at each setting"])].concat(order.filter(function (c) {
    return mb[c]; }).map(function (c) {
    return h("div", { class: "odds", "data-tip": COND[c] + ": " + mb[c][0] + " bits, averaged over " + mb[c][1] + " models" }, [
      h("span", { class: "lab", text: COND[c] }),
      h("span", { class: "track" }, [h("i", { class: c.charAt(0) === "t" ? "p full" : "e full", style: "width:" + 100 * mb[c][0] / max + "%" })]),
      h("span", { class: "val", text: mb[c][0].toFixed(2) + " · " + mb[c][1] })]);
  })).concat([h("div", { class: "meta", text: "bits of spread · number of models. Claude caps temperature at 1, so the 1.5 bar is GPT models only." })])));
  para("Temperature does what it says: the spread grows tenfold from 0 to 1.5. Effort hardly moves it, " +
    mb.low[0].toFixed(2) + " bits at low and " + mb.high[0].toFixed(2) + " at high. Thinking longer does not make a model " +
    "more or less predictable, on average; it just takes longer to say 42.");
  var Q = [{ value: "number", label: "A number 1–100" }, { value: "colour", label: "Favourite colour" },
    { value: "city", label: "A city" }, { value: "story", label: "A 300-word story" }];
  var F = [{ value: "temperature", label: "Temperature models" }, { value: "effort", label: "Effort models" }];
  var state = { p: "number", f: "temperature" }, dialBody = h("div");
  el.appendChild(Zoo.toggles(Q, state.p, function (v) { state.p = v; drawDial(); }));
  el.appendChild(Zoo.toggles(F, state.f, function (v) { state.f = v; drawDial(); }));
  el.appendChild(dialBody);
  drawDial();

  function stack(cnt) {
    var bar = h("div", { class: "stack", role: "img", "aria-label": cnt.counts.map(function (a) {
      return (a[0] || "(empty)") + " " + a[1]; }).join(", ") });
    var shown = 0, tone = ["--seq-6", "--seq-4", "--seq-3", "--seq-2", "--seq-1", "--seq-1"];
    cnt.counts.forEach(function (a, i) {
      shown += a[1];
      var t = a[0] || "(empty)";
      bar.appendChild(h("span", { style: "flex:" + a[1] + ";background:var(" + tone[i] + ")",
        "data-tip": t + ": " + a[1] + " of " + cnt.n, text: a[1] / cnt.n >= 0.15 && t.length < 14 ? t : "" }));
    });
    if (cnt.n > shown) bar.appendChild(h("span", { class: "rest", style: "flex:" + (cnt.n - shown),
      "data-tip": (cnt.n - shown) + " other answers" }));
    return bar;
  }

  function drawDial() {
    var p = state.p;
    dialBody.innerHTML = "";
    dialBody.appendChild(h("p", { class: "prompt", text: p === "story" ? C.prompts.story : C.prompts.short[p] }));
    var grid = h("div", { class: "grid wide" });
    (state.f === "temperature" ? tempM : effM).forEach(function (m) {
      var d = D[m];
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
    if (p === "number" && state.f === "temperature" && D["gpt-4o"] && D["gpt-4o"].logprobs) dialBody.appendChild(odds(D["gpt-4o"].logprobs, D["gpt-4o"].short.number));
    var blue = 0, all = 0;
    M.forEach(function (m) { var c = (D[m] || {}).short; if (!c || !c.colour) return;
      Object.keys(c.colour).forEach(function (k) { all += c.colour[k].n; c.colour[k].counts.forEach(function (a) { if (a[0] === "blue") blue += a[1]; }); }); });
    dialBody.appendChild(h("p", { class: "note", html: {
      number: "At temperature 0, twelve of the fourteen models give one number twenty times. The exceptions are GPT-4o (42 eighteen times, 27 twice) and GPT-5.4 mini (three different numbers).",
      colour: "Blue is " + pct(blue / all) + " of all " + all.toLocaleString() + " colour answers, at every setting. When a model is near-certain, " +
        "no amount of heat will tip it. Claude Opus 4.8 mostly declines to have a favourite at all, and then says blue anyway.",
      city: "Paris, Tokyo, Lisbon and Kyoto between them take 96% of all city answers.",
      story: "Every story differs, but the titles give the game away: at temperature 0, nine of the fourteen models reuse one title for all eight."
    }[p] }));
  }

  function odds(lp, byCond) {
    var t1 = byCond.t1 || {}, seen = {};
    (t1.counts || []).forEach(function (a) { seen[a[0]] = a[1]; });
    var rows = lp.slice(0, 8).map(function (t) {
      var s = (seen[t[0]] || 0) / (t1.n || 1);
      return h("div", { class: "odds", "data-tip": t[0] + ": the model gives it " + pct(t[1]) +
        "; sampled " + (seen[t[0]] || 0) + " of " + (t1.n || 0) + " times at temperature 1" }, [
        h("span", { class: "lab", text: t[0] }),
        h("span", { class: "track" }, [h("i", { class: "p", style: "width:" + 100 * t[1] + "%" }),
          h("i", { class: "s", style: "width:" + 100 * s + "%" })]),
        h("span", { class: "val", text: pct(t[1]) + " · " + pct(s) })]);
    });
    return h("div", { class: "card oddscard" }, [h("h3", null, ["What GPT-4o believes, and what it says"]),
      h("p", { class: "note", html: "GPT-4o will also report its own odds for the first token of its reply. " +
        "<span class='key p'></span> its odds &nbsp; <span class='key s'></span> share of twenty samples at temperature 1. " +
        "The sampler does what it is told: the randomness is real, it is just drawn from a very lopsided die." })]
      .concat(rows));
  }

  // --- 2. Twenty identical requests.
  sub("2 · Twenty identical requests");
  para("Temperature 0 is meant to make a model pick its single most likely word every time, so the same request should " +
    "give the same reply. We sent the story prompt twenty times to every model, at temperature 0 where it is allowed and " +
    "at default settings otherwise. <em>Meaning</em> is how alike the twenty stories are by an embedding model's reckoning, " +
    "where 1 means the same story every time.");
  var rows = [];
  M.forEach(function (m) { Object.keys(R[m] || {}).forEach(function (c) { rows.push([m, c, R[m][c]]); }); });
  rows.sort(function (a, b) { return (b[2].cosine || 0) - (a[2].cosine || 0); });
  var exact = rows.filter(function (r) { return r[2].identical_pairs > 0; });
  el.appendChild(h("details", { class: "tableview", open: true }, [h("summary", { text: "All " + rows.length + " runs, most alike first" }),
    h("div", { class: "table-wrap scrollbox" }, [h("table", { class: "data" }, [
      h("thead", null, [h("tr", null, ["Model", "Setting", "Different stories", "Identical pairs", "Meaning"].map(function (t, i) {
        return h("th", { class: i > 1 ? "num" : null, text: t }); }))]),
      h("tbody", null, rows.map(function (r) {
        var s = r[2];
        return h("tr", { class: s.identical_pairs ? "hit" : null }, [h("td", null, [who(r[0])]), h("td", { text: COND[r[1]] || r[1] }),
          h("td", { class: "num", text: s.distinct + " of " + s.n }), h("td", { class: "num", text: s.identical_pairs + " of " + s.pairs }),
          h("td", { class: "num", text: s.cosine == null ? "–" : s.cosine.toFixed(2) })]);
      }))])])]));
  para("Only " + exact.length + " of " + rows.length + " runs produced any two identical stories. " +
    exact.map(function (r) { return lab(r[0]) + " (" + r[2].distinct + " different in " + r[2].n + ")"; }).join(", ") +
    ". Claude Haiku 4.5 at temperature 0 is the one model that is truly repeatable: the same story, word for word, twenty times. " +
    "Every other temperature-0 run gave twenty different texts that are nearly the same story.");
  var f = R["gpt-4o"] && R["gpt-4o"].t0 && R["gpt-4o"].t0.fork;
  if (f) {
    var words = f.prefix.split(" "), keep = words.slice(-40).join(" ");
    el.appendChild(h("div", { class: "card forkcard" }, [h("h3", null, ["Where two GPT-4o temperature-0 stories part company"]),
      h("p", { class: "fork" }, [h("span", { class: "same", text: (words.length > 40 ? "… " : "") + keep + " " }),
        h("span", { class: "branch a", text: f.a + " …" }), h("br"),
        h("span", { class: "same ghost", text: "… " }), h("span", { class: "branch b", text: f.b + " …" })]),
      h("div", { class: "meta", text: "word for word for " + f.words + " words, then a different word, then a different story" })]));
  }
  para("Why would temperature 0 vary at all? Our working guess, and the usual explanation, is that providers batch " +
    "requests together, and floating-point sums come out very slightly differently depending on what else is in the batch. " +
    "When two words are nearly tied, that rounding decides which wins, and from then on the story is different. A fixed " +
    "<code>seed</code> (GPT-4o accepts one) narrowed twenty stories at temperature 1 to two main storylines, but made no two identical. " +
    "At default settings the newest models vary most: Claude Fable 5.2, Claude Opus 5 and GPT-6.2 Astra sit around 0.63, while " +
    "GPT-5.6 Sol and Claude Sonnet 5.5 stay above 0.9, telling nearly the same story each time.");

  // --- 3. Wording.
  sub("3 · Asking differently");
  para("Now hold the settings still and change the words: seven ways to ask for a number from 1 to 100, twenty times each, " +
    "at default settings. If the answers move more between wordings than between repeats, the prompt matters more than the dice.");
  var fav = {};
  M.forEach(function (m) { if (W[m]) { var t = W[m].by.base.counts[0][0]; fav[t] = (fav[t] || 0) + 1; } });
  function flips(w) { return M.filter(function (m) { return W[m] && W[m].by[w] && W[m].by[w].counts[0][0] !== W[m].by.base.counts[0][0]; }).length; }
  var nW = M.filter(function (m) { return W[m]; }).length;
  function fam(p) { var v = M.filter(function (m) { return W[m] && prov(m) === p; }).map(function (m) { return W[m].from_wording; });
    return [v.reduce(function (a, b) { return a + b; }, 0) / v.length, v.length]; }
  var gA = fam("anthropic"), gO = fam("openai");
  para("Asked plainly, every model's favourite is one of " + Object.keys(fav).length + " numbers: " +
    Object.keys(fav).sort(function (a, b) { return fav[b] - fav[a]; }).map(function (k) { return k + " (" + fav[k] + " models)"; }).join(", ") +
    ". The word <em>random</em> changes the favourite for " + flips("random") + " of " + nW + " models. All lower case changes it for " +
    flips("lower") + ", and a trailing space for " + flips("space") + ".");
  var ranked = M.filter(function (m) { return W[m]; }).sort(function (a, b) { return W[b].from_wording - W[a].from_wording; });
  el.appendChild(h("div", { class: "card rankcard" }, [h("h3", null, ["Share of the spread that comes from the wording"])].concat(ranked.map(function (m) {
    var w = W[m];
    return h("div", { class: "odds", "data-tip": lab(m) + ": " + pct(w.from_wording) + " of its spread comes from the wording (" +
      w.pooled + " bits over all wordings, " + w.within + " within one)" }, [
      h("span", { class: "lab" }, [who(m)]),
      h("span", { class: "track" }, [h("i", { class: "full " + prov(m), style: "width:" + 100 * w.from_wording + "%" })]),
      h("span", { class: "val", text: pct(w.from_wording) })]);
  }))));
  para("Claude models lean on the wording more: on average " + pct(gA[0]) + " of their spread comes from it, against " +
    pct(gO[0]) + " for GPT models. The share compares the entropy of all 140 answers with the average entropy inside one " +
    "wording; the gap is what the wording added. A model that always says the same number, whatever you ask, scores 0.", "note");
  var WL = { base: "Think of a number…", pick: "Pick a number…", choose: "Choose any number…",
    random: "Give me a random number…", words: "…one and one hundred", lower: "all lower case", space: "a trailing space" };
  var det = h("details", { class: "tableview" }, [h("summary", { text: "Every model's answers, wording by wording" })]);
  var wg = h("div", { class: "grid wide" });
  M.forEach(function (m) {
    var w = W[m];
    if (!w) return;
    wg.appendChild(card(m, Object.keys(WL).filter(function (k) { return w.by[k]; }).map(function (k) {
      var b = w.by[k];
      return h("div", { class: "dialrow" }, [h("span", { class: "cond", text: WL[k], "data-tip": (C.wordings || {})[k] || "" }),
        stack(b), h("span", { class: "n", text: b.counts[0][0].length < 8 ? b.counts[0][0] : "…" })]);
    })));
  });
  det.appendChild(wg);
  el.appendChild(det);

  // --- 4. Relay.
  var RL = C.relay;
  if (RL && RL.chains.length) {
    var models3 = []; RL.chains[0].forEach(function (x) { if (models3.indexOf(x.model) < 0) models3.push(x.model); });
    sub("4 · The same story, five times");
    para("Chapter 3's relay passed one story along a line of models. Here " + models3.map(lab).join(", ") +
      " take turns, twelve sentences in all, five times over, from the same opening line. Does a small difference grow, " +
      "butterfly-style, or do the stories split at once?");
    el.appendChild(h("p", { class: "prompt", text: RL.opening }));
    el.appendChild(h("div", { class: "card" }, [h("h3", null, ["The second sentence, in each of the five runs"]),
      h("ol", { class: "firsts" }, RL.chains.map(function (c) {
        var t = c.filter(function (x) { return x.turn === 1; })[0];
        return h("li", { text: t ? t.text : "" }); }))]));
    var cos = RL.cosine || {}, turns = Object.keys(cos).sort(function (a, b) { return a - b; });
    if (turns.length) {
      el.appendChild(h("div", { class: "card meanbits" }, [h("h3", null, ["How alike the five runs are, turn by turn"])].concat(turns.map(function (t) {
        return h("div", { class: "odds" }, [h("span", { class: "lab", text: "turn " + t }),
          h("span", { class: "track" }, [h("i", { class: "p full", style: "width:" + 100 * cos[t] + "%" }),
            RL.unrelated ? h("b", { class: "floor", style: "left:" + 100 * RL.unrelated + "%" }) : null]),
          h("span", { class: "val", text: cos[t].toFixed(2) })]);
      })).concat([h("div", { class: "meta", text: "mean similarity in meaning between the five runs' sentences; the line marks " +
        (RL.unrelated || 0).toFixed(2) + ", two sentences from different runs and different turns" })])));
    }
    para("They part at once. The second sentence is already five different stories, although most reach for something " +
      "unfolding, glowing or holographic, and from the next turn on the runs hover around the level of unrelated sentences. " +
      "There is no slow butterfly: the split is immediate.");
    var dt = h("details", { class: "tableview" }, [h("summary", { text: "Read all five stories" })]);
    RL.chains.forEach(function (c, i) {
      dt.appendChild(h("div", { class: "card chain" }, [h("h3", null, ["Run " + (i + 1)]),
        h("p", null, [RL.opening + " "].concat(c.map(function (x) {
          return h("span", { class: "sent " + prov(x.model), "data-tip": lab(x.model) + ", turn " + x.turn, text: x.text + " " }); })))]));
    });
    el.appendChild(dt);
  }

  sub("So how random are they?");
  para("Less than a coin, more than a lookup table. On short answers they are close to fixed: twenty tries usually give one, " +
    "two or three answers, and the favourite number is one of five for every model we asked. On anything long they almost " +
    "never repeat themselves, even at temperature 0, but they circle the same few ideas. The dial still works where it " +
    "exists, but it is disappearing: the newer models only let you choose how long they think, and that barely changes " +
    "what they say. The wording moves them instead: one word, <em>random</em>, changed the favourite number for " + flips("random") + " of " + nW + " models.");
  para("Method: twenty samples per setting for short answers, eight stories per setting in the dial and twenty in the repeat " +
    "test, through the OpenAI and Anthropic APIs on 25 November 2026. Effort is OpenAI's <code>reasoning.effort</code> and " +
    "Anthropic's <code>output_config.effort</code>. Models that think unasked were given room to, and a reply cut off by the token " +
    "limit was asked again rather than counted. Answers are compared after lower-casing and dropping punctuation; story meaning " +
    "uses <code>text-embedding-3-small</code>. Left out: the five pro models (minutes per call) and Claude Sonnet 4.5, which our " +
    "proxy no longer serves. Code: <code>tools/stochastic.py</code>; data: <code>data/stoch-*.jsonl</code>.", "note");
});
