/* Web deck — interactive widgets. */
(function () {
  "use strict";
  const HC = window.HC;
  const el = HC.el;

  /* ============ Site structure ============ */
  function sitemap(box) {
    const P = {
      home: { t: "Home", x: 330, y: 20, nav: true },
      fly: { t: "Flying", x: 30, y: 120, nav: true, parent: "home" },
      sea: { t: "Sea Training", x: 210, y: 120, nav: true, parent: "home" },
      ev: { t: "Events", x: 390, y: 120, nav: true, parent: "home" },
      join: { t: "Join", x: 570, y: 120, nav: true, parent: "home" },
      glide: { t: "Gliding", x: 0, y: 230, parent: "fly" },
      aef: { t: "Air Experience", x: 140, y: 230, parent: "fly" },
      red: { t: "HMS Redstone", x: 290, y: 230, parent: "sea" },
      kit: { t: "Kit List", x: 570, y: 230, parent: "join" },
    };
    const W = 130, H = 40;
    const svg = HC.svg("svg", { viewBox: "0 0 720 290", role: "img", "aria-label": "Site structure diagram. Home and the four level-one pages are shaded because they are in the navigation bar. Gliding and Air Experience are below Flying, HMS Redstone below Sea Training, Kit List below Join." });
    const note = el("p", { class: "stepper-note", "aria-live": "polite" });
    const btns = el("div", { class: "btn-row", role: "group", "aria-label": "Choose a page" });
    box.append(el("div", { class: "diagram-scroll" }, svg), btns, note);
    const navIds = Object.keys(P).filter((k) => P[k].nav);
    function linksFrom(id) {
      const kids = Object.keys(P).filter((k) => P[k].parent === id && !P[k].nav);
      return [...new Set([...navIds.filter((k) => k !== id), ...kids])];
    }
    function draw(sel) {
      const L = sel ? linksFrom(sel) : [];
      let s = `<text x="0" y="14" font-size="11" class="muted">Level 0</text><text x="0" y="112" font-size="11" class="muted">Level 1</text><text x="0" y="222" font-size="11" class="muted" dy="-4">Level 2</text>`;
      s += `<path d="M95 100 H635 M395 60 V100" stroke="var(--ink)" stroke-width="2" fill="none"/>`;
      navIds.filter((k) => k !== "home").forEach((k) => { s += `<path d="M${P[k].x + W / 2} 100 V120" stroke="var(--ink)" stroke-width="2"/>`; });
      Object.entries(P).forEach(([k, p]) => {
        if (!p.nav) { const q = P[p.parent]; s += `<path d="M${q.x + W / 2} ${q.y + H} V${(q.y + H + p.y) / 2} H${p.x + W / 2} V${p.y}" stroke="var(--ink)" stroke-width="2" fill="none" marker-end="url(#sm-a)"/>`; }
      });
      Object.entries(P).forEach(([k, p]) => {
        const on = k === sel, lit = L.includes(k);
        s += `<g data-k="${k}" style="cursor:pointer"><rect x="${p.x}" y="${p.y}" width="${W}" height="${H}" fill="${on ? "var(--gold-bright)" : p.nav ? "var(--paper-2)" : "var(--card)"}" stroke="${lit ? "var(--redstone)" : "var(--ink)"}" stroke-width="${lit ? 4 : 2}"/><text x="${p.x + W / 2}" y="${p.y + 25}" text-anchor="middle" font-size="13" class="ink">${p.t}</text></g>`;
      });
      svg.innerHTML = `<defs><marker id="sm-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="var(--ink)"/></marker></defs>` + s;
      svg.querySelectorAll("g[data-k]").forEach((g) => g.addEventListener("click", () => pick(g.dataset.k)));
      if (sel) note.innerHTML = `<b>${P[sel].t}</b> links to: ${L.map((k) => P[k].t).join(", ")}. ` + (P[sel].nav ? "It is in the navigation bar (shaded), so every page in the site links to it." : `It is not in the navigation bar, so it is reached only from ${P[P[sel].parent].t}. Because the navigation bar is on every page, it can still link back to all the shaded pages.`);
      else note.textContent = "Five shaded pages appear in the navigation bar, and four sub-pages sit at level 2. That is at most four pages at each level below the home page.";
    }
    function pick(k) { draw(k); [...btns.children].forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === k ? "true" : "false")); }
    Object.entries(P).forEach(([k, p]) => { const b = el("button", { class: "btn small", type: "button", "data-k": k, "aria-pressed": "false" }, p.t); b.addEventListener("click", () => pick(k)); btns.append(b); });
    draw(null);
  }

  /* ============ Page anatomy ============ */
  function layout(box) {
    const PARTS = [
      ["header", "&lt;header&gt; … &lt;/header&gt;", "The page banner: the site title or logo, often a link back to the home page."],
      ["nav", "&lt;nav&gt; &lt;ul&gt;&lt;li&gt;…&lt;/li&gt;&lt;/ul&gt; &lt;/nav&gt;", "Holds the navigation bar: an unordered list of links to the main pages."],
      ["main", "&lt;main&gt;", "Wraps the main content of the page. Each page has one main element."],
      ["section", "  &lt;section id=\"gunnery\"&gt; … &lt;/section&gt;", "Divides the main content into themed areas: text, images, video, audio. The id makes one section unique, so CSS (#gunnery) or JavaScript (getElementById) can target it."],
      ["section2", "  &lt;section&gt; &lt;form&gt; … &lt;/form&gt; &lt;/section&gt;", "A second section, holding a form that collects user input."],
      ["mainend", "&lt;/main&gt;", "The end of the main content."],
      ["footer", "&lt;footer&gt; … &lt;/footer&gt;", "General information at the bottom: contact details, copyright, legal links."],
    ];
    const code = el("ul", { class: "anat-code", "aria-label": "Page code. Select a line." });
    const page = el("div", { class: "anat-page", "aria-hidden": "true" });
    const note = el("p", { class: "stepper-note", "aria-live": "polite" }, "Select a line of code.");
    box.append(el("div", { class: "stepper-grid" }, code, page), note);
    page.innerHTML = `<div data-k="header" class="ap-b">header</div><div data-k="nav" class="ap-b">nav: Home · Flying · Sea · Join</div><div data-k="main" class="ap-b ap-main"><span>main</span><div data-k="section" class="ap-b">section #gunnery</div><div data-k="section2" class="ap-b">section: form</div></div><div data-k="footer" class="ap-b">footer</div>`;
    function pick(k) {
      if (k === "mainend") k = "main";
      code.querySelectorAll("button").forEach((b) => { const on = b.dataset.k === k || (k === "main" && b.dataset.k === "mainend"); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
      page.querySelectorAll("[data-k]").forEach((d) => d.classList.toggle("on", d.dataset.k === k));
      note.innerHTML = PARTS.find((p) => p[0] === k)[2];
    }
    PARTS.forEach(([k, c]) => { const b = el("button", { type: "button", class: "anat-line", "data-k": k, "aria-pressed": "false", html: c }); b.addEventListener("click", () => pick(k)); code.append(el("li", null, b)); });
    page.querySelectorAll("[data-k]").forEach((d) => d.addEventListener("click", (e) => { e.stopPropagation(); pick(d.dataset.k); }));
  }

  /* ============ Box model, 800px deck ============ */
  function boxModel(box) {
    const m = el("input", { type: "range", min: 0, max: 20, value: 5, "aria-label": "Margin in pixels" });
    const p = el("input", { type: "range", min: 0, max: 20, value: 0, "aria-label": "Padding in pixels" });
    const ml = el("span", { class: "readout" }), pl = el("span", { class: "readout" });
    const wrap = el("div", { class: "bm-wrap" });
    const inner = el("div", { class: "bm-inner" });
    wrap.append(inner);
    const sum = el("div", { class: "output-box", "aria-live": "polite" });
    const css = el("pre", { "data-lang": "CSS" });
    box.append(el("div", { class: "btn-row" }, el("label", null, "margin ", m), ml, el("label", null, "padding ", p), pl), wrap, sum, css);
    for (let i = 0; i < 4; i++) inner.append(el("div", { class: "bm-img" }, el("span", null, ["🚩", "⚓", "🧭", "⛵"][i])));
    function upd() {
      const M = +m.value, Pd = +p.value, IMG = 186, B = 2;
      ml.textContent = M + "px"; pl.textContent = Pd + "px";
      inner.querySelectorAll(".bm-img").forEach((d) => Object.assign(d.style, { margin: M + "px", padding: Pd + "px", width: IMG + "px" }));
      const each = IMG + 2 * Pd + 2 * B + 2 * M, total = 4 * each;
      const s = (wrap.clientWidth || 600) / 800;
      inner.style.transform = `scale(${s})`;
      wrap.style.height = inner.offsetHeight * s + "px";
      sum.innerHTML = `Each image takes: ${IMG} width + 2 × ${Pd} padding + 2 × ${B} border + 2 × ${M} margin = <b>${each}px</b>\nFour images need ${total}px, and the section is 800px wide. ` + (total <= 800 ? `<span class="ok">They fit on one row (${800 - total}px to spare).</span>` : `<span class="bad">That is ${total - 800}px too wide, so the last image drops onto a new line, and the page no longer matches the wireframe.</span>`);
      css.textContent = `section {width:800px}\n.shipImage {float:left; width:${IMG}px; border:${B}px solid; padding:${Pd}px; margin:${M}px}`;
    }
    [m, p].forEach((x) => x.addEventListener("input", upd));
    window.addEventListener("resize", upd);
    upd();
  }

  /* ============ display ============ */
  function display(box) {
    const sel = el("select", { "aria-label": "display value of the highlighted element" }, ...["inline", "block", "none"].map((v) => el("option", { value: v }, "display: " + v)));
    const demo = el("div", { class: "disp-demo" });
    demo.innerHTML = `The captain's orders read <span class="disp-el">⚑ BEAT TO QUARTERS ⚑</span> and the crew ran to their guns. Every cadet knew the drill by heart.`;
    const note = el("p", { class: "stepper-note", "aria-live": "polite" });
    const T = {
      inline: "<b>inline</b>: the element sits <em>within</em> the line of text and is only as wide as its content, like a link inside a paragraph. (<code>&lt;a&gt;</code>, <code>&lt;span&gt;</code>, <code>&lt;img&gt;</code> are inline by default.)",
      block: "<b>block</b>: the element starts on a <em>new line</em> and stretches across the <em>full width</em> of its container. The text after it starts on another new line. (<code>&lt;p&gt;</code>, <code>&lt;section&gt;</code>, <code>&lt;div&gt;</code> are block by default.) Nav bar links use <code>display:block</code> so the whole box is clickable.",
      none: "<b>none</b>: the element is not displayed at all, and its space <em>collapses</em> as if it wasn't there. JavaScript can switch it back to block, which is how the reveal demos below work.",
    };
    box.append(el("label", null, sel), demo, note);
    const upd = () => { demo.querySelector(".disp-el").style.display = sel.value; note.innerHTML = T[sel.value]; };
    sel.addEventListener("change", upd); upd();
  }

  /* ============ float / clear workbench ============ */
  function floatW(box) {
    const ctl = (lab) => el("select", { "aria-label": lab }, ...["none", "left", "right"].map((v) => el("option", { value: v }, v)));
    const a = ctl("Float for image A"), b = ctl("Float for image B");
    const clr = el("input", { type: "checkbox", id: "fl-clear" });
    const stage = el("div", { class: "fl-stage" });
    const code = el("pre", { "data-lang": "CSS" });
    const note = el("p", { class: "stepper-note", "aria-live": "polite" });
    box.append(el("div", { class: "btn-row" }, el("label", null, "A: float ", a), el("label", null, "B: float ", b), el("span", null, clr, el("label", { for: "fl-clear" }, " footer: clear:both"))), stage, note, code);
    stage.innerHTML = `<div class="fl-a fl-box">A ⚓</div><div class="fl-b fl-box">B 🧭</div><p class="fl-text">The squadron sailed from Leith at dawn.</p><div class="fl-foot">footer</div>`;
    function upd() {
      const A = stage.querySelector(".fl-a"), B = stage.querySelector(".fl-b"), F = stage.querySelector(".fl-foot"), Tx = stage.querySelector(".fl-text");
      A.style.float = a.value; B.style.float = b.value; F.style.clear = clr.checked ? "both" : "none";
      Tx.style.display = "block";
      code.textContent = `.imageA {float:${a.value}; width:90px; height:90px; margin:6px}\n.imageB {float:${b.value}; width:90px; height:120px; margin:6px}\nfooter {clear:${clr.checked ? "both" : "none"}}`;
      const anyFloat = a.value !== "none" || b.value !== "none";
      note.innerHTML = !anyFloat ? "With no float, every block sits on its own line, stacked down the page."
        : clr.checked ? "<b>clear:both</b> makes the footer start below every floated element. The layout is back under control."
        : "The short paragraph wraps beside the floated images. Because the images are taller than the text, the footer rides up beside them as well: it is affected by the floats too. Tick <b>clear:both</b> to make the footer start below every float.";
    }
    [a, b, clr].forEach((x) => x.addEventListener("change", upd));
    a.value = "left"; b.value = "right"; upd();
  }

  /* ============ nav bar builder ============ */
  function navbar(box) {
    const RULES = [
      ["", "Plain HTML: a nav containing an unordered list of links. The browser shows it as a bulleted list."],
      ["nav ul {list-style-type:none}", "<b>list-style-type:none</b> removes the bullets. The descendant selector <code>nav ul</code> means only lists <em>inside nav</em> are affected."],
      ["nav ul li {float:left}", "<b>float:left</b> on each list item lines them up side by side, left to right. But look: the page content has crept up <em>beside</em> the links, because floated items are taken out of the normal flow. That runaway needs fixing."],
      ["p {clear:both}", "<b>clear:both</b> on the content after the bar makes it start <b>below</b> every floated element. The runaway is fixed."],
      ["nav ul li {float:left; width:70px; text-align:center}", "A fixed <b>width</b> spaces the items evenly, and <b>text-align:center</b> centres each link in its space."],
      ["nav ul li a {display:block; padding:8px}", "<b>display:block</b> turns each link into a box, so the whole area is clickable, not just the word. <b>padding</b> gives it room."],
      ["nav {height:35px; background-color:#12284a}\nnav ul li a {color:white; text-decoration:none}", "A fixed <b>height</b> and a background turn it into a bar. White links with no underline."],
      ["nav ul li a:hover {background-color:#e0b23a; color:black}", "<b>:hover</b> styles a link while the pointer is over it. Try it on the bar above!"],
    ];
    const demo = el("div", { class: "nb-demo" });
    demo.innerHTML = `<nav aria-label="Demonstration navigation bar"><ul><li><a href="#">Home</a></li><li><a href="#">Fly</a></li><li><a href="#">Sea</a></li><li><a href="#">Join</a></li></ul></nav><p class="nb-after">Page content starts here…</p>`;
    demo.querySelectorAll("a").forEach((x) => x.addEventListener("click", (e) => e.preventDefault()));
    const style = el("style");
    document.head.append(style);
    const code = el("pre", { "data-lang": "CSS" });
    const note = el("p", { class: "stepper-note", "aria-live": "polite" });
    const back = el("button", { class: "btn small", type: "button" }, "◀ Remove rule");
    const next = el("button", { class: "btn small primary", type: "button" }, "Add rule ▶");
    const pos = el("span", { class: "hint", style: "margin:0" });
    box.append(el("div", { class: "btn-row" }, back, next, pos), demo, note, code);
    let i = 0;
    function upd() {
      const css = RULES.slice(1, i + 1).map((r) => r[0]).join("\n");
      // scope every rule to the demo
      style.textContent = css.split("\n").map((line) => line.replace(/^(\s*)([^{]+)\{/, (m0, sp, sel) => sp + sel.split(",").map((x) => ".nb-demo " + x.trim()).join(", ") + " {")).join("\n");
      code.innerHTML = (RULES.slice(1, i + 1).map((r, k) => (k === i - 1 ? `<span class="hl">${HC.esc(r[0])}</span>` : HC.esc(r[0]))).join("\n") || "/* no CSS yet */");
      note.innerHTML = RULES[i][1];
      pos.textContent = `Rule ${i} of ${RULES.length - 1}`;
      back.disabled = i === 0; next.disabled = i === RULES.length - 1;
    }
    back.addEventListener("click", () => { i--; upd(); });
    next.addEventListener("click", () => { i++; upd(); });
    upd();
  }

  /* ============ live form ============ */
  function form(box) {
    const html = `<form id="enlist" novalidate>
  Name:<br>
  <input type="text" name="cadetName" size="25" minlength="2" maxlength="20" required><br>
  Age (12 to 17):<br>
  <input type="number" name="age" min="12" max="17" required><br>
  Squadron:<br>
  <select name="squadron">
    <option value="1805">1805 Blockhaven</option>
    <option value="2212">2212 Creeperford</option>
  </select><br>
  Preferred section:<br>
  <input type="radio" name="section" value="flying" checked> Flying
  <input type="radio" name="section" value="sea"> Sea training<br>
  Anything else? (max 100 characters)<br>
  <textarea name="notes" rows="3" cols="30" maxlength="100"></textarea><br>
  <input type="submit" value="Enlist">
</form>`;
    const live = el("div", { class: "form-live", html: html });
    const res = el("div", { class: "output-box", "aria-live": "polite" }, "Results appear here when you press Enlist.");
    const code = el("pre", { "data-lang": "HTML" });
    code.textContent = html.replace(" novalidate", "");
    box.append(live, res, el("p", { class: "hint" }, "The HTML (we've switched off the browser's pop-up messages with novalidate, so that this panel can report every check at once):"), code);
    const f = live.querySelector("form");
    f.querySelectorAll("input:not([type=radio]):not([type=submit]), textarea, select").forEach((x, k) => x.setAttribute("aria-label", ["Name", "Age", "Squadron", "Notes"][k] || x.name));
    f.querySelectorAll("input[type=radio]").forEach((x) => x.setAttribute("aria-label", x.value === "flying" ? "Flying" : "Sea training"));
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const n = f.cadetName, a = f.age;
      const lines = [
        `Name, presence check (required): ${n.validity.valueMissing ? "<span class='bad'>✘ empty</span>" : "<span class='ok'>✔</span>"}`,
        `Name, length check (minlength=2 maxlength=20): ${n.validity.tooShort ? "<span class='bad'>✘ too short, at least 2 characters</span>" : "<span class='ok'>✔</span>"} (the browser simply won't let you type a 21st character)`,
        `Age, presence check (required): ${a.validity.valueMissing ? "<span class='bad'>✘ empty</span>" : "<span class='ok'>✔</span>"}`,
        `Age, range check (min=12 max=17): ${a.value === "" ? "–" : a.validity.rangeUnderflow || a.validity.rangeOverflow || a.validity.badInput ? `<span class='bad'>✘ ${HC.esc(a.value)} is out of range</span>` : "<span class='ok'>✔</span>"}`,
      ];
      res.innerHTML = lines.join("\n") + "\n" + (f.checkValidity() ? `<span class="ok">Enlisted! Welcome aboard, ${HC.esc(n.value)}.</span>` : "<span class='bad'>The form is not submitted until every check passes.</span>");
    });
  }

  /* ============ JavaScript demos ============ */
  function js(box) {
    const ship = (c, extra = "") => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"><rect width="32" height="32" fill="#9fc6e8"/><rect y="24" width="32" height="8" fill="#2f6fb5"/><rect x="4" y="18" width="24" height="6" fill="${c}"/><rect x="6" y="20" width="2" height="2" fill="#e0b23a"/><rect x="12" y="20" width="2" height="2" fill="#e0b23a"/><rect x="18" y="20" width="2" height="2" fill="#e0b23a"/><rect x="15" y="4" width="2" height="14" fill="#3b2a1a"/><rect x="9" y="6" width="12" height="9" fill="#f4ecd8"/>${extra}</svg>`);
    const idle = ship("#7a5532"), fire = ship("#7a5532", `<rect x="0" y="17" width="5" height="5" fill="#ffb21e"/><rect x="27" y="17" width="5" height="5" fill="#ffb21e"/><rect x="2" y="12" width="4" height="4" fill="#ddd"/><rect x="26" y="12" width="4" height="4" fill="#ddd"/>`);
    window.hcShow = function (id) {
      document.getElementById("gunnery").style.display = "none";
      document.getElementById("signals").style.display = "none";
      document.getElementById("rigging").style.display = "none";
      document.getElementById(id).style.display = "block";
    };
    const demos = [
      ["1 · Enlarge on hover (this element)", `<img src="../images/ship.png" alt="A ship" style="width:100px;height:100px;image-rendering:pixelated"
  onmouseover="this.style.width='150px';this.style.height='150px'"
  onmouseout="this.style.width='100px';this.style.height='100px'">`, "<code>this</code> means the element that has the event, here the image. <code>style.width</code> changes its CSS. Each action ends with a semicolon."],
      ["2 · Rollover image (change the src)", `<img src="../images/ship.png" alt="A ship, which fires a broadside when the pointer is over it" style="width:120px;height:120px;image-rendering:pixelated"
  onmouseover="this.src='../images/ship-firing.png'"
  onmouseout="this.src='../images/ship.png'">`, "Changing <code>this.src</code> swaps the picture. <code>onmouseout</code> puts the original back."],
      ["3 · Highlight a different element (by id)", `<img src="../images/ship.png" alt="A ship. Point at it to highlight the paragraph." style="width:80px;height:80px;image-rendering:pixelated"
  onmouseover="document.getElementById('orders').style.color='darkRed'"
  onmouseout="document.getElementById('orders').style.color=''">
<p id="orders">Orders: the squadron sails from Leith at dawn.</p>`, "The event is on the <b>image</b>, but the action changes a <b>different</b> element, the paragraph, found with <code>document.getElementById('orders')</code>. Changing <code>style.color</code> changes the look of its text."],
      ["4 · Reveal one section (onclick, by id)", `<button onclick="hcShow('gunnery')">Gunnery</button>
<button onclick="hcShow('signals')">Signals</button>
<button onclick="hcShow('rigging')">Rigging</button>
<section id="gunnery" style="display:none">Gunnery: 32-pounders on the lower deck.</section>
<section id="signals" style="display:none">Signals: Popham's numbered flags.</section>
<section id="rigging" style="display:none">Rigging: up the ratlines, one hand for the ship.</section>`, "The function hides all three sections, then shows the chosen one by setting <code>style.display</code> to <code>\"block\"</code>. It finds each section by its <b>id</b>. SQA's own example uses one function per section (<code>displayJC()</code> and so on). Passing the id as a parameter does the same job with less code."],
    ];
    demos.forEach(([t, code, why]) => {
      const live = el("div", { class: "js-live", html: code.split("../images/ship-firing.png").join(fire).split("../images/ship.png").join(idle) });
      // the live copy also responds to keyboard focus (and taps), so everyone can try it
      live.querySelectorAll("[onmouseover]").forEach((x) => {
        x.tabIndex = 0;
        x.addEventListener("focus", () => x.dispatchEvent(new MouseEvent("mouseover")));
        x.addEventListener("blur", () => x.dispatchEvent(new MouseEvent("mouseout")));
      });
      live.querySelectorAll("button").forEach((b) => (b.className = "btn small"));
      const pre = el("pre", { "data-lang": "HTML" });
      pre.textContent = code;
      box.append(el("h4", null, t), el("div", { class: "js-demo" }, live, pre), el("p", { class: "hint", html: why }));
    });
    const fn = el("pre", { "data-lang": "JavaScript" });
    fn.textContent = `<script>\nfunction hcShow(id) {\n  document.getElementById("gunnery").style.display = "none";\n  document.getElementById("signals").style.display = "none";\n  document.getElementById("rigging").style.display = "none";\n  document.getElementById(id).style.display = "block";\n}\n</script>`;
    box.append(el("p", { class: "hint" }, "The function for demo 4, placed in the page's <head>:"), fn);
    box.prepend(el("p", { class: "hint" }, "On a touchscreen, tap an image (or tab to it with a keyboard) to trigger its mouse-over event."));
    HC.highlight(fn);
  }

  function init() {
    const map = { "w-sitemap": sitemap, "w-layout": layout, "w-box": boxModel, "w-display": display, "w-float": floatW, "w-navbar": navbar, "w-form": form, "w-js": js };
    for (const [id, fn] of Object.entries(map)) {
      const box = document.getElementById(id);
      if (box) try { fn(box); } catch (e) { console.error(id, e); box.append(el("p", { class: "bad" }, "This interactive failed to load.")); }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
