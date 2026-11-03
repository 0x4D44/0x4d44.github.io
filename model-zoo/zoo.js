/* The Model Zoo: shared helpers and the chapter loader.
   Each chapter lives in js/ch-<id>.js and registers itself:
     Zoo.chapter("numbers", ["numbers", "models"], function (el, data) { ... });
   The loader fetches the named site/*.json files and calls the renderer with
   data[name] for each. Chapters render lazily as they near the viewport. */
(function () {
  "use strict";
  var cache = {};
  var registry = {};

  function json(name) {
    if (!cache[name]) {
      cache[name] = fetch("site/" + name + ".json").then(function (r) {
        if (!r.ok) throw new Error(name + ": " + r.status);
        return r.json();
      });
    }
    return cache[name];
  }

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    [].concat(kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }

  var models = null;  // [{id,label,provider,created,variant}] oldest first
  function model(id) {
    for (var i = 0; i < models.length; i++) if (models[i].id === id) return models[i];
    // Models outside the question set (the image models): a readable name from the id.
    var label = id === "chatgpt-image-latest" ? "ChatGPT Image (latest)"
      : id.replace(/^gpt-image-/, "GPT Image ").replace(/-mini$/, " mini").replace(/-(flare|sunburst)$/, function (_, w) {
        return " " + w.charAt(0).toUpperCase() + w.slice(1); });
    return { id: id, label: label, provider: id.indexOf("claude-") === 0 ? "anthropic" : "openai", created: "" };
  }
  function order(ids) {  // model ids, oldest first
    var pos = {};
    models.forEach(function (m, i) { pos[m.id] = i; });
    return ids.slice().sort(function (a, b) { return (pos[a] == null ? 999 : pos[a]) - (pos[b] == null ? 999 : pos[b]); });
  }
  function name(id) {  // a label node: provider dot + model name
    var m = model(id);
    return h("span", { class: "who" }, [h("span", { class: "dot " + m.provider, "aria-hidden": "true" }), m.label]);
  }
  function cardHead(id) {
    var m = model(id);
    return h("h3", null, [name(id), h("span", { class: "when", text: (m.created || "").slice(0, 7) })]);
  }
  function money(x) {
    if (x == null) return "–";
    if (x === 0) return "$0";
    if (x < 0.01) return "$" + x.toFixed(4);
    if (x < 1) return "$" + x.toFixed(3);
    return "$" + x.toFixed(2);
  }
  function secs(x) { return x == null ? "–" : (x < 10 ? x.toFixed(1) : Math.round(x)) + " s"; }
  function metaLine(r) {
    var bits = [secs(r.secs), money(r.cost)];
    if (r.out) bits.push(r.out.toLocaleString() + " tok" + (r.reasoning ? " (" + r.reasoning.toLocaleString() + " thinking)" : ""));
    if (r.incomplete) bits.push("ran out of tokens");
    return h("div", { class: "meta", text: bits.join(" · ") });
  }
  function legend() {
    return h("div", { class: "legend" }, [
      h("span", null, [h("span", { class: "dot openai" }), "OpenAI (GPT, o-series)"]),
      h("span", null, [h("span", { class: "dot anthropic" }), "Anthropic (Claude)"]),
    ]);
  }
  function toggles(options, current, onPick) {  // a single-select pill row
    var row = h("div", { class: "controls", role: "group" });
    options.forEach(function (o) {
      var b = h("button", { type: "button", "aria-pressed": String(o.value === current), text: o.label });
      b.addEventListener("click", function () {
        [].forEach.call(row.querySelectorAll("button"), function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        onPick(o.value);
      });
      row.appendChild(b);
    });
    return row;
  }
  // Sequential colour for a 0..1 share (light = rare, dark = common).
  var SEQ = ["--seq-0", "--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6", "--seq-7"];
  function seq(t) {
    if (!(t > 0)) return "var(--seq-0)";
    return "var(" + SEQ[Math.min(7, 1 + Math.floor(t * 6.999))] + ")";
  }
  // Tooltip on hover/focus for any element carrying data-tip.
  function tips(root) {
    var tip = document.getElementById("tip");
    function show(e) {
      var t = e.target.closest && e.target.closest("[data-tip]");
      if (!t || !root.contains(t)) return;
      tip.textContent = t.getAttribute("data-tip");
      var r = t.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min(window.innerWidth - 290, r.left + r.width / 2 - 60)) + "px";
      tip.style.top = (r.top > 60 ? r.top - 34 : r.bottom + 6) + "px";
      tip.classList.add("on");
    }
    function hide() { tip.classList.remove("on"); }
    root.addEventListener("mouseover", show);
    root.addEventListener("focusin", show);
    root.addEventListener("mouseout", hide);
    root.addEventListener("focusout", hide);
  }
  function head(el, kicker, title, lede, prompt) {
    el.appendChild(h("h2", null, [h("small", { text: kicker }), title]));
    if (lede) el.appendChild(h("p", { class: "lede", html: lede }));
    if (prompt) el.appendChild(h("p", { class: "prompt", text: prompt }));
  }

  function chapter(id, needs, render) { registry[id] = { needs: needs, render: render }; }

  function renderChapter(el) {
    var c = registry[el.id];
    if (!c || el.dataset.done) return;
    el.dataset.done = "1";
    Promise.all(c.needs.map(json)).then(function (parts) {
      var data = {};
      c.needs.forEach(function (n, i) { data[n] = parts[i]; });
      c.render(el, data);
      tips(el);
    }).catch(function (err) {
      el.appendChild(h("p", { class: "note", text: "This chapter could not load (" + err.message + ")." }));
    });
  }

  function start() {
    var toc = document.getElementById("toc");
    var sections = [].slice.call(document.querySelectorAll("section.chapter"));
    sections.forEach(function (s) {
      toc.appendChild(h("li", null, [h("a", { href: "#" + s.id, text: s.dataset.title })]));
    });
    json("models").then(function (m) {
      models = m;
      return Promise.all([json("bill")]);
    }).then(function (parts) {
      var bill = parts[0], total = 0, calls = 0;
      Object.keys(bill.models).forEach(function (k) { total += bill.models[k].cost; calls += bill.models[k].calls; });
      Object.keys(bill.extra).forEach(function (k) { total += bill.extra[k]; });
      var nOpen = models.filter(function (m) { return m.provider === "openai"; }).length;
      var stats = document.getElementById("stats");
      [[models.length, "models (" + nOpen + " GPT, " + (models.length - nOpen) + " Claude)"],
       [calls.toLocaleString(), "answers collected"],
       [money(total), "estimated total cost"]].forEach(function (s) {
        stats.appendChild(h("div", { class: "stat" }, [h("b", { text: String(s[0]) }), h("span", { text: s[1] })]));
      });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) renderChapter(e.target); });
      }, { rootMargin: "800px 0px" });
      sections.forEach(function (s) { io.observe(s); });
      if (location.hash) {
        var target = document.querySelector(location.hash);
        if (target) renderChapter(target);
      }
    });
    var links = toc.querySelectorAll("a");
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        [].forEach.call(links, function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id); });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  window.Zoo = { h: h, json: json, chapter: chapter, start: start, model: model, order: order, name: name,
    cardHead: cardHead, money: money, secs: secs, metaLine: metaLine, legend: legend, toggles: toggles,
    seq: seq, head: head, models: function () { return models; } };
})();
