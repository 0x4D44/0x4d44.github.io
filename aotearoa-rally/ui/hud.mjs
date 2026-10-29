// In-stage HUD. Built once, updated every frame with change-detection (no per-frame allocation
// beyond the occasional string).

import { h, glyphSvg, svgNode, fmtTime, fmtDelta } from "./dom.mjs";
import { drawMinimap, minimapPoint, drawProgressBase } from "./charts.mjs";
import { SURFACE_INFO } from "../core/surfaces.mjs";

const GA0 = 150, GA1 = 390, GCX = 145, GCY = 138, GR = 112;
const pol = (a, r) => [GCX + Math.cos((a * Math.PI) / 180) * r, GCY + Math.sin((a * Math.PI) / 180) * r];
const arcPath = (a0, a1, r) => {
  const [x0, y0] = pol(a0, r), [x1, y1] = pol(a1, r);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

const dmgColour = (v, safe) => {
  const t = Math.min(1, Math.max(0, v));
  return safe ? `hsl(${210 - t * 180} 85% ${60 - t * 8}%)` : `hsl(${125 - t * 125} 78% ${52 - t * 4}%)`;
};

export function createHud(root) {
  const el = {};
  let stage = null, mini = null, base = null, notes = [], noteIdx = 0;
  let units = "kmh", colourSafe = false, redline = 7000, maxRpm = 8000, bestSplits = null, benchSplits = null, noRivals = false;
  const cache = Object.create(null);
  // hoisted so the per-frame path allocates no closures, arrays or key strings
  const miniPt = [0, 0];
  const fnRpm = (n, v) => (n.textContent = v + " rpm");
  const fnTime = (n, v) => (n.textContent = fmtTime(v / 100));
  const fnShift = (n, v) => { for (let i = 0; i < n.children.length; i++) n.children[i].classList.toggle("on", i < v); };
  const fnBoost = (n, v) => (n.style.width = v * 2 + "%");
  const fnDelta = (n, q) => {
    n.hidden = q === null;
    const vEl = n.querySelector(".v");
    vEl.textContent = q === null ? "" : fmtDelta(q / 20);
    vEl.className = "v " + (q !== null && q <= 0 ? "gain" : "loss");
  };
  const set = (key, node, val, fn) => {
    if (cache[key] === val) return;
    cache[key] = val;
    fn ? fn(node, val) : (node.textContent = val);
  };

  root.innerHTML = "";
  // top-centre: time, deltas, progress
  el.time = h("div", { class: "h-time hud-glass mono-ish" }, "0:00.000");
  el.dPB = h("span", null, h("span", { class: "lbl" }, "PB"), h("b", { class: "v" }, ""));
  el.dRiv = h("span", null, h("span", { class: "lbl" }, "Rival"), h("b", { class: "v" }, ""));
  el.prog = h("canvas");
  el.dot = h("i", { style: { position: "absolute", top: "0", width: "2px", bottom: "0", background: "#ffc81e", boxShadow: "0 0 6px #ffc81e", left: "0" } });
  el.fill = h("i", { style: { position: "absolute", top: "0", bottom: "0", left: "0", width: "0", background: "linear-gradient(90deg, rgba(255,200,30,.05), rgba(255,200,30,.34))", mixBlendMode: "screen" } });
  el.progWrap = h("div", { class: "h-prog hud-glass" }, el.prog, el.fill, el.dot);
  el.pen = h("div", { class: "h-hint" });
  root.append(h("div", { class: "h-top" }, el.time, h("div", { class: "h-delta" }, el.dPB, el.dRiv), el.progWrap, el.pen));
  // minimap
  el.mini = h("canvas");
  el.miniDot = h("canvas", { style: { position: "absolute", inset: "0" } });
  el.miniWrap = h("div", { class: "h-mini hud-glass", style: { position: "absolute" } }, el.mini, el.miniDot);
  el.miniWrap.style.position = "absolute";
  root.append(el.miniWrap);
  el.fps = h("div", { class: "h-fps", hidden: true });
  root.append(el.fps);
  // pace notes
  el.notes = h("div", { class: "h-notes" });
  root.append(el.notes);
  // dash
  const arcBg = `<path d="${arcPath(GA0, GA1, GR)}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="12" stroke-linecap="butt" pathLength="100"/>`;
  el.gauge = h("div", { class: "gauge" });
  el.gauge.innerHTML = `<svg viewBox="0 0 290 200" aria-hidden="true">
      <path d="${arcPath(GA0, GA1, GR)}" fill="none" stroke="rgba(3,10,7,.7)" stroke-width="20"/>
      ${arcBg}
      <path id="rpm-red" d="${arcPath(GA0 + 0.88 * 240, GA1, GR)}" fill="none" stroke="rgba(255,90,82,.55)" stroke-width="12"/>
      <path id="rpm-fill" d="${arcPath(GA0, GA1, GR)}" fill="none" stroke="#ffc81e" stroke-width="12" pathLength="100" stroke-dasharray="0 100"/>
      <g id="rpm-ticks" stroke="rgba(255,255,255,.6)" stroke-width="2"></g>
      <g id="rpm-labels" fill="#cfdcd5" font-size="12" font-family="monospace" text-anchor="middle"></g>
    </svg>
    <div class="speed">0</div><div class="unit">KM/H</div><div class="gear">N</div><div class="rpm-n">0 rpm</div>`;
  el.speed = el.gauge.querySelector(".speed");
  el.unit = el.gauge.querySelector(".unit");
  el.gear = el.gauge.querySelector(".gear");
  el.rpmN = el.gauge.querySelector(".rpm-n");
  el.rpmFill = el.gauge.querySelector("#rpm-fill");
  el.shift = h("div", { class: "shiftlight" }, Array.from({ length: 10 }, (_, i) => h("i", { class: i > 6 ? "hi" : i > 3 ? "mid" : "" })));
  el.boostFill = h("i");
  el.boost = h("div", { class: "boost" }, el.boostFill);
  el.dash = h("div", { class: "h-dash" }, el.gauge, el.shift, el.boost);
  root.append(el.dash);
  // left: damage + surface
  el.dmg = svgNode(`<svg class="sil" viewBox="0 0 60 110" aria-label="Damage">
    <rect id="z-engine" x="18" y="6" width="24" height="22" rx="4" fill="#4a4"/>
    <rect id="z-front" x="14" y="2" width="32" height="10" rx="4" fill="#4a4"/>
    <rect id="z-left" x="10" y="14" width="9" height="80" rx="3" fill="#4a4"/>
    <rect id="z-right" x="41" y="14" width="9" height="80" rx="3" fill="#4a4"/>
    <rect id="z-cabin" x="20" y="34" width="20" height="40" rx="6" fill="rgba(255,255,255,.14)"/>
    <rect id="z-rear" x="14" y="98" width="32" height="10" rx="4" fill="#4a4"/>
    <rect id="w0" x="2" y="14" width="9" height="18" rx="3" fill="#4a4"/><rect id="w1" x="49" y="14" width="9" height="18" rx="3" fill="#4a4"/>
    <rect id="w2" x="2" y="76" width="9" height="18" rx="3" fill="#4a4"/><rect id="w3" x="49" y="76" width="9" height="18" rx="3" fill="#4a4"/></svg>`);
  el.dmgWrap = h("div", { class: "h-dmg hud-glass" }, el.dmg);
  el.surfDot = h("i");
  el.surfTxt = h("span", null, "Gravel");
  el.surf = h("div", { class: "h-surf hud-glass" }, el.surfDot, el.surfTxt);
  root.append(h("div", { class: "h-left" }, el.dmgWrap, el.surf));
  // centre
  el.centre = h("div", { class: "h-center" });
  root.append(el.centre);
  el.warn = h("div", { class: "h-warn hud-glass", hidden: true });
  el.banner = h("div", { class: "h-banner hud-glass", hidden: true });
  el.count = h("div", { class: "h-count", hidden: true });
  el.hint = h("div", { class: "h-hint", hidden: true });
  el.centre.append(el.count, el.warn, el.banner, el.hint);
  const zones = {};
  for (const id of ["engine", "front", "left", "right", "rear", "w0", "w1", "w2", "w3"]) zones[id] = el.dmg.querySelector("#" + (id.startsWith("w") ? id : "z-" + id));
  let bannerTimer = 0;

  function buildTicks() {
    const gt = el.gauge.querySelector("#rpm-ticks"), gl = el.gauge.querySelector("#rpm-labels");
    gt.innerHTML = "";
    gl.innerHTML = "";
    for (let k = 0; k * 1000 <= maxRpm; k++) {
      const a = GA0 + (k * 1000 / maxRpm) * 240;
      const [x0, y0] = pol(a, GR - 9), [x1, y1] = pol(a, GR + 1);
      gt.insertAdjacentHTML("beforeend", `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>`);
      const [tx, ty] = pol(a, GR - 22);
      gl.insertAdjacentHTML("beforeend", `<text x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}">${k}</text>`);
    }
    const red = el.gauge.querySelector("#rpm-red");
    red.setAttribute("d", arcPath(GA0 + (redline / maxRpm) * 240, GA1, GR));
  }

  const api = {
    root,
    setCar(spec) {
      redline = spec && spec.engine ? spec.engine.redline : 7000;
      maxRpm = Math.ceil((redline * 1.06) / 1000) * 1000;
      buildTicks();
      cache.rpm = null;
    },
    setOptions(o) {
      units = o.units === "mph" ? "mph" : "kmh";
      colourSafe = !!o.colourSafe;
      document.body.classList.toggle("colour-safe", colourSafe);
      el.unit.textContent = units === "mph" ? "MPH" : "KM/H";
      el.fps.hidden = !o.fps;
      root.style.setProperty("--hs", String(o.hudScale || 1));
      cache.dmgKey = null;
    },
    /** best/bench: arrays of split times aligned with stage.checkpoints (index 0 is the start = 0). */
    setStage(st, { best = null, bench = null, noteList = null } = {}) {
      stage = st;
      bestSplits = best;
      benchSplits = bench;
      notes = (noteList || st.pacenotes || []).filter((n) => n.kind !== "start");
      noteIdx = 0;
      requestAnimationFrame(() => {
        mini = drawMinimap(el.mini, st, { pad: 9 });
        base = drawProgressBase(el.prog, st);
        el.miniDot.width = el.mini.width;
        el.miniDot.height = el.mini.height;
      });
      cache.notesKey = null;
      el.pen.textContent = "";
    },
    show(on) {
      root.hidden = !on;
    },
    toggleHidden() {
      root.classList.toggle("off");
      return root.classList.contains("off");
    },
    get hidden() {
      return root.classList.contains("off");
    },
    banner(text, kind = "", ms = 2200) {
      el.banner.textContent = text;
      el.banner.hidden = false;
      el.banner.style.color = kind === "bad" ? "var(--bad)" : kind === "good" ? "var(--good)" : "var(--kowhai)";
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => (el.banner.hidden = true), ms);
    },
    count(n) {
      if (n == null) {
        el.count.hidden = true;
        return;
      }
      el.count.hidden = false;
      el.count.textContent = n === 0 ? "GO!" : String(n);
      el.count.classList.toggle("go", n === 0);
      if (n === 0) setTimeout(() => (el.count.hidden = true), 700);
    },
    hint(text) {
      el.hint.hidden = !text;
      el.hint.textContent = text || "";
    },
    reset() {
      for (const k of Object.keys(cache)) delete cache[k];
      el.warn.hidden = true;
      el.banner.hidden = true;
      el.count.hidden = true;
      noteIdx = 0;
    },
    /** trial mode: no rival benchmark */
    setNoRivals(v) { noRivals = !!v; },
    setBenchmarks(best, bench) {
      bestSplits = best;
      benchSplits = bench;
    },
    /** frame: { state, run, fps, notes? } */
    update(state, run, fps) {
      const kmh = state.speedKmh != null ? Math.abs(state.speedKmh) : Math.abs(state.speed) * 3.6;
      const spd = units === "mph" ? kmh * 0.621371 : kmh;
      set("spd", el.speed, Math.round(spd));
      const g = state.gear;
      set("gear", el.gear, g < 0 ? "R" : g === 0 ? "N" : String(g));
      const rpmN = Math.round(state.rpm / 50) * 50;
      set("rpmn", el.rpmN, rpmN, fnRpm);
      const rf = Math.min(1, Math.max(0, state.rpm / maxRpm));
      set("rpm", el.rpmFill, Math.round(rf * 200), (n) => {
        n.setAttribute("stroke-dasharray", `${(rf * 100).toFixed(2)} 100`);
        n.setAttribute("stroke", state.rpm > redline * 0.97 ? "#ff5a52" : "#ffc81e");
      });
      const lit = Math.round(Math.min(1, Math.max(0, (state.rpm / redline - 0.8) / 0.18)) * 10);
      set("shift", el.shift, lit, fnShift);
      set("boost", el.boostFill, Math.round((state.boost || 0) * 50), fnBoost);
      el.boost.style.display = state.boost == null ? "none" : "";
      // time
      if (run) {
        const total = run.status === "finished" ? run.finishTime : run.time + run.penaltyTotal;
        set("time", el.time, Math.floor(total * 100), fnTime);
        const pn = run.penaltyTotal > 0 ? `+${run.penaltyTotal.toFixed(0)} s penalties` : "";
        set("pen", el.pen, pn);
      }
      if (stage) {
        const p = state.s / stage.lengthM;
        set("prog", el.dot, Math.round(p * 1000), (n) => { const pc = Math.min(100, Math.max(0, p * 100)).toFixed(1) + "%"; n.style.left = pc; el.fill.style.width = pc; });
        // minimap dot
        if (mini && Math.round(p * 400) !== cache.mdot) {
          cache.mdot = Math.round(p * 400);
          const c = el.miniDot, g2 = c.getContext("2d");
          g2.clearRect(0, 0, c.width, c.height);
          const pt = minimapPoint(mini, stage, state.s, miniPt);
          g2.fillStyle = "#ffc81e";
          g2.strokeStyle = "#000";
          g2.lineWidth = 2 * mini.dpr;
          g2.beginPath();
          g2.arc(pt[0], pt[1], 5.5 * mini.dpr, 0, 6.3);
          g2.stroke();
          g2.fill();
        }
        if (run && run.status === "running") {
          this.deltas(run.time + run.penaltyTotal, state.s);
        }
        this.notesUpdate(state.s);
      }
      // surface
      let sf = 0, cnt = 0;
      if (state.wheels) for (let i = 0; i < 4; i++) if (state.wheels[i].grounded) { sf += state.wheels[i].surf; cnt++; }
      const sid = cnt ? Math.round(sf / cnt) : 0;
      set("surf", el.surfTxt, sid, (n, v) => {
        const info = SURFACE_INFO[v] || SURFACE_INFO[0];
        n.textContent = info.name;
        el.surfDot.style.setProperty("--c", "#" + info.dustColor.toString(16).padStart(6, "0"));
      });
      // damage
      const d = state.damage;
      if (d) {
        const key = (((Math.round(d.total * 40) * 64 + Math.round(d.engine * 20)) * 64 + Math.round((d.body.front + d.body.rear + d.body.left + d.body.right) * 12)) * 64 + Math.round((d.tyres[0] + d.tyres[1] + d.tyres[2] + d.tyres[3]) * 12)) * 2 + (colourSafe ? 1 : 0);
        if (cache.dmgKey !== key) {
          cache.dmgKey = key;
          zones.engine.setAttribute("fill", dmgColour(Math.max(d.engine, d.radiator || 0), colourSafe));
          zones.front.setAttribute("fill", dmgColour(d.body.front, colourSafe));
          zones.rear.setAttribute("fill", dmgColour(d.body.rear, colourSafe));
          zones.left.setAttribute("fill", dmgColour(d.body.left, colourSafe));
          zones.right.setAttribute("fill", dmgColour(d.body.right, colourSafe));
          for (let i = 0; i < 4; i++) zones["w" + i].setAttribute("fill", dmgColour(Math.max(d.tyres[i], d.suspension[i] * 0.8), colourSafe));
        }
      }
      // warnings
      if (run) {
        const w = run.warnings;
        const txt = run.status === "running" ? (w.wrongWay ? "Wrong way" : w.offRoad ? "Off road" : w.corridor ? "Back to the road" : "") : "";
        set("warn", el.warn, txt, (n, v) => {
          n.hidden = !v;
          n.textContent = v;
          n.classList.toggle("bad", v === "Wrong way");
        });
      }
      if (fps != null && !el.fps.hidden) set("fps", el.fps, Math.round(fps), (n, v) => (n.textContent = v + " fps"));
    },
    // live delta vs personal best and vs the rival benchmark (linear interpolation between splits)
    deltas(t, s) {
      const cps = stage.checkpoints;
      const calc = (arr) => {
        if (!arr || s < 150) return NaN;
        let i = 1;
        while (i < cps.length - 1 && cps[i].s < s) i++;
        const s0 = cps[i - 1].s, s1 = cps[i].s;
        const t0 = arr[i - 1] ?? 0, t1 = arr[i];
        if (t1 == null) return NaN;
        const f = (s - s0) / Math.max(1, s1 - s0);
        return t - (t0 + (t1 - t0) * Math.min(1, Math.max(0, f)));
      };
      const a = calc(bestSplits), b = calc(benchSplits);
      set("dpb", el.dPB, Number.isFinite(a) ? Math.round(a * 20) : null, fnDelta);
      set("dr", el.dRiv, Number.isFinite(b) && !noRivals ? Math.round(b * 20) : null, fnDelta);
    },
    notesUpdate(s) {
      // rewind after a respawn / teleport, then advance
      while (noteIdx > 0 && notes[noteIdx - 1].s >= s - 12) noteIdx--;
      while (noteIdx < notes.length && notes[noteIdx].s < s - 12) noteIdx++;
      const key = noteIdx * 100000 + Math.round(s / 5);
      if (cache.notesKey === key) return;
      cache.notesKey = key;
      const kids = el.notes.children;
      for (let k = 0; k < 3; k++) {
        const n = notes[noteIdx + k];
        let row = kids[k];
        if (!n) {
          if (row) row.hidden = true;
          continue;
        }
        if (!row) {
          row = h("div", { class: "note hud-glass" }, h("span", { class: "g" }), h("span", { class: "t" }), h("span", { class: "d" }));
          el.notes.append(row);
        }
        row.hidden = false;
        if (row.dataset.icon !== n.icon) {
          row.dataset.icon = n.icon;
          row.firstChild.innerHTML = glyphSvg(n.icon);
        }
        row.children[1].textContent = n.text;
        row.children[2].textContent = Math.max(0, Math.round((n.s - s) / 10) * 10) + " m";
      }
    },
  };
  api.setCar(null);
  return api;
}
