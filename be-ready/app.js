(function () {
  "use strict";
  var KEY = "br.v1";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  /* ---------- state (localStorage is optional) ---------- */
  var state = { hh: { adults: 2, children: 0, babies: 0, dogs: 0, cats: 0, days: 3 }, done: {}, food: {}, dev: {}, quiz: {}, fuel: { kw: 3, h: 10, d: 3 } };
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var s = JSON.parse(raw); for (var k in state) if (s[k] && typeof s[k] === "object") state[k] = Object.assign(state[k], s[k]); }
    } catch (e) { /* private mode etc. */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  var num = function (v, lo, hi, d) { v = parseFloat(v); if (!isFinite(v)) return d; return Math.min(hi, Math.max(lo, v)); };
  var fmt = function (n) { return Math.round(n).toLocaleString("en-GB"); };

  /* ---------- household calculator ---------- */
  function calc() {
    var h = state.hh, people = h.adults + h.children, d = h.days;
    var waterDrink = people * 3 * d;
    var waterComfort = (people * 10 + h.babies * 3 + h.dogs * 1 + h.cats * 0.25) * d;
    var waterExtra = (h.babies * 1 + h.dogs * 1 + h.cats * 0.25) * d;
    var kcal = (h.adults * 2000 + h.children * 1500) * d;
    var fuelDay = state.fuel.kw * state.fuel.h / 3;
    var phoneWh = people * d * 15;
    return { people: people, waterDrink: waterDrink, waterComfort: waterComfort, waterExtra: waterExtra, waterWeek: people * 3 * 7,
      foodKcal: kcal, fuel3: fuelDay * 3, fuel7: fuelDay * 7, fuelDay: fuelDay, phoneWh: phoneWh,
      powerBank: phoneWh };
  }
  var QTY = {
    waterDrink: function (c) { return "≈ " + fmt(c.waterDrink) + " L drinking (" + fmt(c.waterDrink / 1.5) + " × 1.5 L bottles)"; },
    waterComfort: function (c) { return "≈ " + fmt(c.waterComfort) + " L in total with cooking, washing, pets"; },
    waterWeek: function (c) { return "≈ " + fmt(c.waterWeek) + " L for 7 days"; },
    foodKcal: function (c) { return "≈ " + fmt(c.foodKcal) + " kcal in total"; },
    powerBank: function (c) { return "≈ " + fmt(c.phoneWh) + " Wh of phone charging (a ~" + fmt(c.phoneWh / 0.7) + " Wh bank)"; },
    fuel3: function (c) { return "≈ " + fmt(c.fuelDay * 3) + " kg (per the stove estimator)"; },
    fuel7: function (c) { return "≈ " + fmt(c.fuelDay * 7) + " kg (per the stove estimator)"; }
  };

  function renderCalc() {
    var c = calc(), h = state.hh;
    var stats = [
      [fmt(c.waterDrink) + " L", "Drinking water (Gov: 3 L / person / day × " + h.days + " days)"],
      [fmt(c.waterComfort) + " L", "Comfortable total incl. washing, babies, pets (10 L / person / day)"],
      [fmt(c.foodKcal) + " kcal", "Food energy for " + h.days + " days (2,000 adult / 1,500 child per day)"],
      [fmt(c.phoneWh) + " Wh", "One phone charge per person per day, as power-bank capacity"]
    ];
    $("#calcOut").innerHTML = stats.map(function (s) { return '<div class="stat"><b>' + s[0] + "</b><span>" + s[1] + "</span></div>"; }).join("");
    var notes = [];
    if (h.babies) notes.push("Babies: choose ready-to-feed formula; about " + fmt(h.babies * 3 * h.days) + " L extra water (3 L a day each, included in the comfortable total) for sterilising and washing bottles.");
    if (h.dogs || h.cats) notes.push("Pets: about " + fmt(h.dogs * 1 * h.days + h.cats * 0.25 * h.days) + " L extra for animals.");
    if (c.people === 0) notes.push("Enter at least one adult or child to see the numbers.");
    $("#calcNote").textContent = notes.join(" ");
  }

  /* ---------- checklist ---------- */
  var filter = "all", query = "";
  function itemHTML(it, c) {
    var q = it.q && QTY[it.q] ? '<span class="qty">' + esc(QTY[it.q](c)) + "</span>" : "";
    var badge = it.tier === "core" ? '<span class="badge gov">Gov</span>' : '<span class="badge stretch">Stretch</span>';
    var on = !!state.done[it.id];
    return '<li class="item' + (on ? " done" : "") + '" data-id="' + it.id + '" data-tier="' + it.tier + '">' +
      '<input type="checkbox" id="c_' + it.id + '"' + (on ? " checked" : "") + ">" +
      '<div class="txt"><label for="c_' + it.id + '">' + esc(it.t) + "</label> " + badge +
      (it.d ? '<span class="d">' + esc(it.d) + "</span>" : "") + q + "</div></li>";
  }
  function renderCats() {
    var c = calc(), open = {};
    $$("#cats details").forEach(function (d) { open[d.dataset.cat] = d.open; });
    var first = !$("#cats details");
    $("#cats").innerHTML = window.BR_CATS.map(function (cat, i) {
      var items = window.BR_ITEMS.filter(function (it) { return it.cat === cat.id; });
      var isOpen = first ? i < 2 : open[cat.id];
      return '<details class="cat" data-cat="' + cat.id + '"' + (isOpen ? " open" : "") + "><summary><span aria-hidden=\"true\">" + cat.icon + "</span> " + esc(cat.name) + '<span class="cnt"></span></summary>' +
        '<p class="blurb">' + esc(cat.blurb) + '</p><ul class="items">' + items.map(function (it) { return itemHTML(it, c); }).join("") + "</ul></details>";
    }).join("");
    applyFilter();
    progress();
  }
  function applyFilter() {
    var q = query.trim().toLowerCase();
    $$("#cats .item").forEach(function (li) {
      var it = window.BR_ITEMS.filter(function (x) { return x.id === li.dataset.id; })[0];
      var show = true;
      if (filter === "core") show = it.tier === "core";
      else if (filter === "stretch") show = it.tier === "stretch";
      else if (filter === "todo") show = !state.done[it.id];
      if (show && q) show = (it.t + " " + (it.d || "")).toLowerCase().indexOf(q) >= 0;
      li.hidden = !show;
    });
    $$("#cats details").forEach(function (d) {
      var vis = $$(".item", d).filter(function (li) { return !li.hidden; });
      d.hidden = vis.length === 0;
      var all = $$(".item", d), done = all.filter(function (li) { return state.done[li.dataset.id]; }).length;
      $(".cnt", d).textContent = "(" + done + "/" + all.length + ")";
      if (q && vis.length) d.open = true;
    });
    var nm = $("#noMatch");
    if (nm) {
      var any = $$("#cats .item").some(function (li) { return !li.hidden; });
      nm.hidden = any;
      nm.textContent = (!q && filter === "todo") ? "Everything is ticked. Well done." : "No items match. Clear the search or pick \u201cAll\u201d.";
    }
  }
  function ringSVG(pct, label, sub, title) {
    var r = 48, C = 2 * Math.PI * r;
    return '<svg viewBox="0 0 120 120" role="img" aria-label="' + esc(title) + '"><circle class="bg" cx="60" cy="60" r="' + r + '" fill="none" stroke-width="10"/>' +
      '<circle class="fg" cx="60" cy="60" r="' + r + '" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - pct)).toFixed(1) + '" transform="rotate(-90 60 60)"/>' +
      '<text class="num" x="60" y="68" text-anchor="middle" font-size="26">' + Math.round(pct * 100) + "%</text></svg><b>" + label + "</b><span>" + sub + "</span>";
  }
  function progress() {
    ["core", "stretch"].forEach(function (t) {
      var all = window.BR_ITEMS.filter(function (i) { return i.tier === t; }), done = all.filter(function (i) { return state.done[i.id]; }).length;
      var el = $(t === "core" ? "#ringCore" : "#ringStretch");
      el.innerHTML = ringSVG(all.length ? done / all.length : 0, t === "core" ? "Government core" : "Stretch list", done + " of " + all.length + " done", (t === "core" ? "Government core" : "Stretch") + " progress " + done + " of " + all.length);
    });
  }

  /* ---------- power budget ---------- */
  var DEVICES = [
    { id: "phone", n: "Phone charges (15 Wh each)", unit: "charges", wh: 15, def: 2, perHour: false },
    { id: "led", n: "LED lantern, 5 W", unit: "hours", wh: 5, def: 5, perHour: true },
    { id: "head", n: "Head torch, 3 W", unit: "hours", wh: 3, def: 2, perHour: true },
    { id: "router", n: "Wi-Fi router, 8 W", unit: "hours", wh: 8, def: 0, perHour: true },
    { id: "laptop", n: "Laptop, ~45 W", unit: "hours", wh: 45, def: 0, perHour: true },
    { id: "cpap", n: "CPAP machine, ~30 W (check yours)", unit: "hours", wh: 30, def: 0, perHour: true },
    { id: "fridge", n: "Fridge-freezer, ~1,000 Wh a day", unit: "days", wh: 1000, def: 0, perHour: false }
  ];
  function renderDevs() {
    $("#devs").innerHTML = '<div class="dev"><span class="h">Device</span><span class="h">Per day</span><span class="h">Unit</span></div>' + DEVICES.map(function (d) {
      var v = state.dev[d.id]; if (v === undefined) v = d.def;
      return '<div class="dev"><label for="d_' + d.id + '">' + esc(d.n) + '</label><input type="number" id="d_' + d.id + '" min="0" max="24" step="' + (d.id === "fridge" ? 1 : 0.5) + '" value="' + v + '" inputmode="decimal"><span>' + d.unit + "</span></div>";
    }).join("");
    powerOut();
  }
  function powerOut() {
    var wh = DEVICES.reduce(function (s, d) { var v = state.dev[d.id]; if (v === undefined) v = d.def; return s + v * d.wh; }, 0);
    var days = state.hh.days, tot = wh * days;
    var stats = [
      [fmt(wh) + " Wh", "per day"],
      [fmt(tot) + " Wh", "for " + days + " days (usable battery capacity needed)"],
      [wh ? (70 * 0.8 / wh).toFixed(1) + " days" : "—", "from a 20,000 mAh power bank (~70 Wh, 80% usable)"],
      [wh ? (500 * 0.85 / wh).toFixed(1) + " days" : "—", "from a 500 Wh power station (85% usable)"]
    ];
    $("#powerOut").innerHTML = stats.map(function (s) { return '<div class="stat"><b>' + s[0] + "</b><span>" + s[1] + "</span></div>"; }).join("");
  }

  /* ---------- food planner ---------- */
  var FOODS = [
    { id: "beans", n: "Baked beans / chickpeas tin (400 g)", k: 330 },
    { id: "meat", n: "Tinned meat / stew / chilli (400 g)", k: 450 },
    { id: "fish", n: "Tinned fish: tuna, sardines, salmon (120 g)", k: 180 },
    { id: "soup", n: "Tinned soup (400 g)", k: 220 },
    { id: "veg", n: "Tinned veg / tomatoes (400 g)", k: 100 },
    { id: "fruit", n: "Tinned fruit / dried fruit pack (250 g)", k: 230 },
    { id: "nuts", n: "Nuts / seeds bag (200 g)", k: 1200 },
    { id: "pb", n: "Peanut butter jar (340 g)", k: 2050 },
    { id: "oats", n: "Porridge oats, 1 kg (needs hot water)", k: 3700 },
    { id: "rice", n: "Rice / pasta, 1 kg (needs cooking)", k: 3500 },
    { id: "crack", n: "Crackers / oatcakes pack (200 g)", k: 850 },
    { id: "choc", n: "Chocolate / cereal bars (pack of 6)", k: 900 }
  ];
  function renderFood() {
    $("#foodList").innerHTML = FOODS.map(function (f) {
      var v = state.food[f.id] || 0;
      return '<div class="dev"><label for="fd_' + f.id + '">' + esc(f.n) + ' <span class="small">~' + f.k + " kcal</span></label>" +
        '<input type="number" id="fd_' + f.id + '" min="0" max="99" value="' + v + '" inputmode="numeric"><span>packs</span></div>';
    }).join("");
    foodOut();
  }
  function foodOut() {
    var have = FOODS.reduce(function (s, f) { return s + (state.food[f.id] || 0) * f.k; }, 0);
    var h = state.hh, perDay = h.adults * 2000 + h.children * 1500, need = perDay * h.days;
    var days = perDay ? have / perDay : 0, gap = Math.max(0, need - have);
    var stats = [
      [fmt(have) + " kcal", "in your planned larder"],
      [perDay ? days.toFixed(1) + " days" : "—", "of food for your household"],
      [gap ? fmt(gap) + " kcal" : "Covered", gap ? "still needed for " + h.days + " days" : "target of " + h.days + " days met"]
    ];
    $("#foodOut").innerHTML = stats.map(function (s) { return '<div class="stat"><b>' + s[0] + "</b><span>" + s[1] + "</span></div>"; }).join("");
  }

  /* ---------- stove check ---------- */
  var QUIZ = [
    { id: "inst", q: "Was the stove installed by a competent person (e.g. HETAS-registered), with paperwork?" },
    { id: "sweep", q: "Has the chimney been swept in the last 6 months (HETAS: at least twice a year when burning wood)?" },
    { id: "co", q: "Is there a working battery carbon monoxide alarm in the stove room (and near bedrooms)?" },
    { id: "wood", q: "Do you have dry logs (20% moisture or less) for at least 3 days of cold weather?" },
    { id: "air", q: "Is there a permanent air supply if your stove needs one, and are you able to keep extractor fans off while it burns?" },
    { id: "fire", q: "Are there working smoke alarms, and a fire blanket or extinguisher within reach?" },
    { id: "top", q: "Does the stove have a flat, hot top you could put a kettle or pan on (and does the manual allow it)?" },
    { id: "boiler", q: "Is the stove connected to radiators or hot water (a back boiler or boiler stove)?", flip: true }
  ];
  function renderQuiz() {
    $("#quiz").innerHTML = QUIZ.map(function (q) {
      var v = state.quiz[q.id] || "";
      return '<fieldset><legend>' + esc(q.q) + '</legend>' + ["yes", "no", "unsure"].map(function (o) {
        return '<label><input type="radio" name="q_' + q.id + '" value="' + o + '"' + (v === o ? " checked" : "") + "> " + o.charAt(0).toUpperCase() + o.slice(1) + "</label>";
      }).join("") + "</fieldset>";
    }).join("");
    verdict();
  }
  function verdict() {
    var answered = Object.keys(state.quiz).filter(function (k) { return state.quiz[k]; }).length;
    var el = $("#verdict");
    if (!answered) { el.innerHTML = '<div class="note">Answer the questions above to get a verdict.</div>'; return; }
    var fix = [], doCook = state.quiz.top === "yes", danger = false;
    var Q = state.quiz;
    if (Q.inst !== "yes") fix.push("Get it checked by a registered installer (HETAS or the local competent-person route) and keep the certificate.");
    if (Q.sweep !== "yes") fix.push("Book a sweep before you rely on it. Sweep at least twice a year when burning wood.");
    if (Q.co !== "yes") { fix.push("Fit battery CO alarms (EN 50291) in the stove room and by bedrooms &mdash; this is not optional."); danger = true; }
    if (Q.wood !== "yes") fix.push("Buy or season dry logs: a moisture meter reading of 20% or less. Wet wood smokes, tars the flue and gives little heat.");
    if (Q.air !== "yes") fix.push("Check the manual for the air supply the stove needs; don't run extractor fans or cooker hoods while it burns.");
    if (Q.fire !== "yes") fix.push("Test smoke alarms and put a fire blanket or small extinguisher near the stove and in the kitchen.");
    var boiler = Q.boiler !== "no";
    var html = "";
    if (boiler) html += '<div class="warn"><b>' + (Q.boiler ? "Check your boiler stove first." : "Answer the boiler question.") + '</b> If it feeds radiators or a hot-water cylinder, its pump or valves might need electricity. Ask your installer in writing whether it is safe to light without power, and what protects it from overheating. Until you know, don\'t rely on it in a power cut.</div>';
    if (danger) html += '<div class="warn"><b>Priority:</b> no working CO alarm means you cannot know if the stove is safe. Fix that first.</div>';
    if (fix.length) html += '<div class="tip"><b>Fix before you rely on it (' + fix.length + ')</b><ul>' + fix.map(function (f) { return "<li>" + f + "</li>"; }).join("") + "</ul></div>";
    else if (boiler) html += '<div class="note"><b>Not cleared yet.</b> Nothing else is outstanding, but the boiler question decides whether the stove is safe in a power cut.</div>';
    else html += '<div class="ok"><b>Looking good.</b> On what you\'ve told us, your stove is a solid part of your plan. Light a trial fire this autumn to be sure.</div>';
    html += doCook ? '<div class="ok"><b>Cooking:</b> a flat hot top means you can boil water (1 minute rolling for purification), make soup, porridge, rice and pasta. Use heavy pans and embers, not flames.</div>'
      : '<div class="note"><b>Cooking:</b> ' + (Q.top === "no" ? "without a usable top, treat the stove as heat only and plan to cook outdoors on a camping stove or barbecue." : "check the manual; some stoves forbid cooking or have glass tops.") + "</div>";
    el.innerHTML = html;
  }

  /* ---------- fuel estimator ---------- */
  function fuelOut() {
    var f = state.fuel, kgDay = f.kw * f.h / 3, kg = kgDay * f.d;
    var stats = [
      [kgDay.toFixed(1) + " kg", "dry logs per day"],
      [fmt(kg) + " kg", "for " + f.d + " day" + (f.d === 1 ? "" : "s")],
      ["≈ " + (kg / 350).toFixed(2) + " m³", "stacked (roughly 350 kg per stacked m³, mixed hardwood; very rough)"]
    ];
    $("#fuelOut").innerHTML = stats.map(function (s) { return '<div class="stat"><b>' + s[0] + "</b><span>" + s[1] + "</span></div>"; }).join("");
  }

  /* ---------- wiring ---------- */
  function setHH() {
    var h = state.hh;
    h.adults = num($("#in_adults").value, 0, 20, 2); h.children = num($("#in_children").value, 0, 20, 0);
    h.babies = num($("#in_babies").value, 0, 10, 0); h.dogs = num($("#in_dogs").value, 0, 10, 0); h.cats = num($("#in_cats").value, 0, 10, 0);
    h.days = num($("#in_days").value, 1, 30, 3);
    save(); renderCalc(); refreshQty(); foodOut(); powerOut();
  }
  function refreshQty() {
    var c = calc();
    $$("#cats .item").forEach(function (li) {
      var it = window.BR_ITEMS.filter(function (x) { return x.id === li.dataset.id; })[0];
      var el = $(".qty", li);
      if (it.q && QTY[it.q]) { if (el) el.textContent = QTY[it.q](c); }
    });
  }
  function init() {
    load();
    $("#in_adults").value = state.hh.adults; $("#in_children").value = state.hh.children; $("#in_babies").value = state.hh.babies;
    $("#in_dogs").value = state.hh.dogs; $("#in_cats").value = state.hh.cats; $("#in_days").value = String(state.hh.days);
    $$("#calcForm input, #calcForm select").forEach(function (e) { e.addEventListener("input", setHH); e.addEventListener("change", setHH); });

    renderCalc(); renderCats(); renderDevs(); renderFood(); renderQuiz();
    $("#f_kw").value = state.fuel.kw; $("#f_h").value = state.fuel.h; $("#f_d").value = state.fuel.d; fuelOut();
    ["f_kw", "f_h", "f_d"].forEach(function (id) {
      $("#" + id).addEventListener("input", function () {
        state.fuel.kw = num($("#f_kw").value, 1, 12, 3); state.fuel.h = num($("#f_h").value, 1, 24, 10); state.fuel.d = num($("#f_d").value, 1, 30, 3);
        save(); fuelOut(); refreshQty();
      });
    });

    $("#cats").addEventListener("change", function (e) {
      if (e.target.type !== "checkbox") return;
      var li = e.target.closest(".item"); state.done[li.dataset.id] = e.target.checked; if (!e.target.checked) delete state.done[li.dataset.id];
      li.classList.toggle("done", e.target.checked); save(); applyFilter(); progress();
    });
    $$(".filters [data-f]").forEach(function (b) {
      b.addEventListener("click", function () {
        filter = b.dataset.f;
        $$(".filters [data-f]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        applyFilter();
      });
    });
    $("#q").addEventListener("input", function (e) { query = e.target.value; applyFilter(); });
    $("#resetBtn").addEventListener("click", function () {
      if (!Object.keys(state.done).length || window.confirm("Clear all ticks on this device?")) { state.done = {}; save(); renderCats(); }
    });
    $("#devs").addEventListener("input", function (e) { if (e.target.id && e.target.id.indexOf("d_") === 0) { state.dev[e.target.id.slice(2)] = num(e.target.value, 0, 24, 0); save(); powerOut(); } });
    $("#foodList").addEventListener("input", function (e) { if (e.target.id && e.target.id.indexOf("fd_") === 0) { state.food[e.target.id.slice(3)] = num(e.target.value, 0, 99, 0); save(); foodOut(); } });
    $("#quiz").addEventListener("change", function (e) { if (e.target.type === "radio") { state.quiz[e.target.name.slice(2)] = e.target.value; save(); verdict(); } });

    $("#printBtn").addEventListener("click", function () { window.print(); });
    window.addEventListener("beforeprint", function () { $$("#cats details").forEach(function (d) { d.open = true; }); });
    $("#themeBtn").addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      var dark = cur ? cur === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      var next = dark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("br.theme", next); } catch (e) { /* ignore */ }
    });

    // current-section highlight in the nav
    var links = $$("nav.sec a");
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) links.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + en.target.id); }); });
      }, { rootMargin: "-20% 0px -70% 0px" });
      $$("main section").forEach(function (s) { io.observe(s); });
    }

    // transcript, from the same script the video is rendered from
    if (window.BR_SCRIPT) {
      $("#transcript").innerHTML = window.BR_SCRIPT.map(function (sc) {
        return "<h3>" + esc(sc.title) + "</h3><p>" + sc.lines.map(function (l) { return esc(l.say); }).join(" ") + "</p>";
      }).join("");
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
