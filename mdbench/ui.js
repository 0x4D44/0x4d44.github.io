// mdbench results: DOM rendering shared by index.html and suite.html. Everything is driven by
// the suite's declared metrics, tasks and groups (see lib.js for the data contract).
import { aggregate, fmt, goodness, validateIndex, validateSuite } from "./lib.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function loadJSON(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export async function loadIndex() {
  const ix = await loadJSON("data/index.json");
  const p = validateIndex(ix);
  if (p.length) throw new Error(`index.json invalid: ${p.slice(0, 5).join("; ")}`);
  ix.seatById = Object.fromEntries(ix.seats.map((s) => [s.id, s]));
  return ix;
}

export async function loadSuite(ix, id) {
  const entry = ix.suites.find((s) => s.id === id);
  if (!entry || !entry.file) throw new Error(`no data for suite ${id}`);
  const su = await loadJSON(`data/${entry.file}`);
  const p = validateSuite(su, ix);
  if (p.length) throw new Error(`${entry.file} invalid: ${p.slice(0, 5).join("; ")}`);
  su.agg = aggregate(su);
  su.metricById = Object.fromEntries(su.metrics.map((m) => [m.id, m]));
  su.taskById = Object.fromEntries(su.tasks.map((t) => [t.id, t]));
  return su;
}

export function seatHTML(ix, id, { link = null } = {}) {
  const s = ix.seatById[id] || { label: id, family: "" };
  const name = link ? `<a href="${esc(link)}">${esc(s.label)}</a>` : esc(s.label);
  return `<span class="dot ${esc(s.family)}" aria-hidden="true"></span>${name}${s.baseline ? ' <span class="badge flag">baseline</span>' : ""}${s.billing === "api" ? ' <span class="badge flag">API</span>' : ""}`;
}

export const sampleBadge = (su) => (su.sample ? ' <span class="badge sample">sample data</span>' : "");

export function sampleBanner(su) {
  return su.sample ? `<div class="banner" role="note"><span class="badge sample">sample data</span> ${esc(su.sample_note || "These numbers are invented to test the page. They are not results.")}</div>` : "";
}

const heatStyle = (t) => (t == null ? "" : `background: color-mix(in oklab, var(--heat-hi) ${Math.round(12 + t * 78)}%, var(--heat-lo));${t > 0.55 ? " color: var(--heat-ink-hi);" : ""}`);

/** Leaderboard: one row per seat, headline mean plus cost/time/value columns that exist. */
export function leaderboard(ix, su, { compact = false, seatLink = null } = {}) {
  const { head, cost, time, seats, ntasks } = su.agg;
  const gate = su.metrics.find((m) => m.role === "gate") || su.metrics.find((m) => m.type === "bool");
  const anyRuns = seats.some((s) => s.maxRuns > 1);
  const cols = [
    ["#", (s, i) => i + 1, "num"],
    ["Seat", (s) => seatHTML(ix, s.seat, { link: seatLink ? seatLink(s.seat) : null }), "seatcell"],
    [head.label, (s) => `${fmt(head, s.per[head.id])}${head.max ? `<span class="scorebar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, (100 * (s.per[head.id] - (head.min ?? 0))) / (head.max - (head.min ?? 0))))}%"></i></span>` : ""}`, "num"],
  ];
  if (anyRuns && !compact) cols.push(["Run spread", (s) => (s.runSd == null ? "–" : `±${s.runSd.toFixed(1)}`), "num"]);
  if (!compact) cols.push(["Tasks", (s) => `${s.n}/${ntasks}`, "num"]);
  if (cost) cols.push([`${cost.label} / task`, (s) => fmt(cost, s.per[cost.id]), "num"]);
  if (time && !compact) cols.push([`${time.label} / task`, (s) => fmt(time, s.per[time.id]), "num"]);
  if (cost) cols.push([`${head.unit === "points" ? "Pts" : head.label} per $`, (s) => (s.perDollar == null ? "–" : s.perDollar >= 100 ? s.perDollar.toFixed(0) : s.perDollar.toFixed(1)), "num"]);
  if (time) cols.push([`${head.unit === "points" ? "Pts" : head.label} per hour`, (s) => (s.perHour == null ? "–" : s.perHour.toFixed(0)), "num"]);
  if (gate && !compact) cols.push([`${gate.label} pass`, (s) => fmt(gate, s.per[gate.id]), "num"]);
  const th = cols.map(([h, , c]) => `<th class="${c}" scope="col">${esc(h)}</th>`).join("");
  const rows = seats.map((s, i) => `<tr>${cols.map(([, f, c]) => `<td class="${c}">${f(s, i)}</td>`).join("")}</tr>`).join("");
  return `<div class="tw"><table class="leaderboard"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** Seat x task heat table for one metric, tasks grouped under their lane/category; groupId
 * limits it to one group (null shows every group). */
export function heatTable(ix, su, metricId, groupId = null) {
  const m = su.metricById[metricId];
  const { cells, seats } = su.agg;
  const groups = su.group.values.filter((g) => groupId == null || g.id === groupId)
    .map((g) => ({ g, tasks: su.tasks.filter((t) => t.group === g.id) })).filter((x) => x.tasks.length);
  const shown = groups.flatMap((x) => x.tasks);
  const vals = seats.flatMap((s) => shown.map((t) => cells[s.seat]?.[t.id]?.[m.id]?.mean)).filter((v) => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  let h = `<div class="tw"><table class="heat"><thead><tr><th rowspan="2" scope="col">Seat</th>`;
  h += groups.map(({ g, tasks }) => `<th class="grp" colspan="${tasks.length}" scope="colgroup">${esc(g.label)}</th>`).join("") + "</tr><tr>";
  h += groups.flatMap(({ tasks }) => tasks.map((t) => {
    // A long id (recall's text-declaration) only repeats the title, so it moves to the tooltip.
    const longId = t.title && t.title !== t.id && t.id.length > 8;
    const tip = longId ? `${t.id}: ${t.description || t.title}` : t.description;
    return `<th class="task" scope="col" title="${esc(tip)}">${longId ? "" : esc(t.id)}${t.note ? '<sup class="nm">note</sup>' : ""}<span>${esc(t.title)}</span></th>`;
  })).join("") + "</tr></thead><tbody>";
  for (const s of seats) {
    h += `<tr><td class="seatcell">${seatHTML(ix, s.seat)}</td>`;
    for (const { tasks } of groups) for (const t of tasks) {
      const c = cells[s.seat]?.[t.id];
      const v = c?.[m.id];
      if (!v) { h += `<td class="heat empty" title="no result">–</td>`; continue; }
      const flags = c.flags.length ? ` · ${c.flags.join(", ")}` : "";
      const spread = v.sd != null ? `<br><span class="sd">±${fmt({ ...m, format: { ...(m.format || {}), prefix: "", signed: false } }, v.sd)} (n=${v.n})</span>` : "";
      const tip = `${ix.seatById[s.seat]?.label || s.seat} · ${t.id}: ${fmt(m, v.mean, { single: v.n === 1 })}${v.n > 1 ? ` mean of ${v.n} runs` : ""}${flags}`;
      h += `<td class="heat" style="${heatStyle(goodness(m, v.mean, lo, hi))}" title="${esc(tip)}">${fmt(m, v.mean, { single: v.n === 1 })}${c.flags.length ? "*" : ""}${spread}</td>`;
    }
    h += "</tr>";
  }
  return h + "</tbody></table></div>" + taskNotes(su, shown);
}

/** Listen table for one task: the reference rendering, then every seat's answer in score order.
 * man is the suite's audio manifest (paths relative to base). */
export function listenTable(ix, su, man, taskId, base) {
  const e = man[taskId];
  if (!e) return "";
  const head = su.agg.head;
  const player = (v, label) => v && v.status === "ok" && v.opus
    ? `<audio controls preload="none" src="${esc(base + v.opus)}" aria-label="${esc(label)}"></audio>`
    : `<span class="note">no notes to play</span>`;
  const mid = (v, name) => v && v.mid ? `<a href="${esc(base + v.mid)}" download="${esc(name)}">.mid</a>` : "";
  const rows = [`<tr class="ref"><td class="seatcell"><b>Reference</b></td><td class="num">–</td><td>${player(e.reference, `Reference: ${taskId}`)}</td><td>${mid(e.reference, `${taskId}-reference.mid`)}</td></tr>`];
  const seats = Object.keys(e.seats || {}).map((sid) => ({ sid, v: e.seats[sid], score: su.agg.cells[sid]?.[taskId]?.[head.id]?.mean }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  for (const { sid, v, score } of seats) {
    const label = ix.seatById[sid]?.label || sid;
    rows.push(`<tr><td class="seatcell">${seatHTML(ix, sid)}</td><td class="num">${score == null ? "–" : fmt(head, score)}</td><td>${player(v, `${label}: ${taskId}`)}</td><td>${mid(v, `${taskId}-${sid}.mid`)}</td></tr>`);
  }
  return `<div class="tw"><table class="listen"><thead><tr><th scope="col">Seat</th><th class="num" scope="col">${esc(head.label)}</th><th scope="col">Listen</th><th scope="col">MIDI</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

/** One line per task that carries a note (task.note in the suite data). */
export function taskNotes(su, tasks = su.tasks) {
  const noted = tasks.filter((t) => t.note);
  return noted.length ? `<ul class="tasknotes">${noted.map((t) => `<li><span class="badge flag">note</span> <b>${esc(t.id)}</b>: ${esc(t.note)}</li>`).join("")}</ul>` : "";
}

/** Seat x group table of headline means: the per-lane / per-category breakdown. */
export function groupTable(ix, su) {
  const { head, seats } = su.agg;
  const groups = su.group.values.filter((g) => su.tasks.some((t) => t.group === g.id));
  const vals = seats.flatMap((s) => groups.map((g) => s.groups[g.id]?.mean)).filter((v) => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  let h = `<div class="tw"><table class="groups"><thead><tr><th scope="col">Seat</th>${groups.map((g) => `<th class="num" scope="col" title="${esc(g.description || "")}">${esc(g.label)}</th>`).join("")}<th class="num" scope="col">All</th></tr></thead><tbody>`;
  for (const s of seats) {
    h += `<tr><td class="seatcell">${seatHTML(ix, s.seat)}</td>`;
    for (const g of groups) {
      const v = s.groups[g.id];
      h += v ? `<td class="heat" style="${heatStyle(goodness(head, v.mean, lo, hi))}" title="${esc(`${g.label}: mean of ${v.n} task(s)`)}">${fmt(head, v.mean)}</td>` : `<td class="heat empty">–</td>`;
    }
    h += `<td class="num"><b>${fmt(head, s.per[head.id])}</b></td></tr>`;
  }
  return h + "</tbody></table></div>";
}

let tipEl = null;
function tip(html, ev) {
  if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip"; tipEl.setAttribute("role", "tooltip"); document.body.append(tipEl); }
  if (html == null) { tipEl.hidden = true; return; }
  tipEl.hidden = false;
  tipEl.innerHTML = html;
  const w = tipEl.offsetWidth, x = ev.clientX + 14 + w > innerWidth ? ev.clientX - w - 10 : ev.clientX + 14;
  tipEl.style.left = `${Math.max(4, x)}px`;
  tipEl.style.top = `${ev.clientY + 14}px`;
}

/** Scatter of seat mean headline (y) against a per-seat value (x), log x. Direct labels. */
export function scatter(el, ix, su, { xMetric, xValue, xLabel }) {
  const { head, seats } = su.agg;
  const pts = seats.map((s) => ({ s, x: xValue(s), y: s.per[head.id] })).filter((p) => p.x > 0 && p.y != null);
  if (pts.length < 2) { el.innerHTML = `<p class="note">Not enough data.</p>`; return; }
  const W = 520, H = 340, L = 44, R = 16, T = 12, B = 40;
  const lx = pts.map((p) => Math.log10(p.x));
  let x0 = Math.floor(Math.min(...lx) * 2) / 2, x1 = Math.ceil(Math.max(...lx) * 2) / 2;
  if (x1 - x0 < 1) { x0 -= 0.5; x1 += 0.5; }
  const ys = pts.map((p) => p.y);
  let y0 = Math.floor((Math.min(...ys) - 3) / 5) * 5, y1 = Math.ceil((Math.max(...ys) + 3) / 5) * 5;
  if (head.min != null) y0 = Math.max(head.min, y0);
  if (head.max != null) y1 = Math.min(head.max, y1);
  const X = (v) => L + ((Math.log10(v) - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  let g = "";
  for (let e = Math.ceil(x0); e <= Math.floor(x1); e++) for (const k of [1, 2, 5]) {
    const v = k * 10 ** e;
    if (Math.log10(v) < x0 - 1e-9 || Math.log10(v) > x1 + 1e-9) continue;
    g += `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${H - B}"/><text x="${X(v)}" y="${H - B + 15}" text-anchor="middle">${esc(fmt(xMetric, v).replace(/(\.\d*?)0+(?=\D*$)/, "$1").replace(/\.(?=\D*$)/, ""))}</text>`;
  }
  const step = (y1 - y0) / 5 >= 5 ? 10 : 5;
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  g += `<line class="ax" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><line class="ax" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/>`;
  g += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">${esc(xLabel)} (log scale)</text>`;
  g += `<text transform="translate(11 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(head.label)}</text>`;
  // Direct labels: greedy placement, trying right/left and a line above/below, avoiding other
  // labels, every point, and the plot edges.
  const lab = pts.map((p) => ({ p, x: X(p.x), y: Y(p.y), name: ix.seatById[p.s.seat]?.label || p.s.seat }))
    .sort((a, b) => a.y - b.y);
  const boxes = lab.map((l) => ({ x0: l.x - 7, x1: l.x + 7, y0: l.y - 7, y1: l.y + 7 }));
  const hit = (b) => boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
  for (const l of lab) {
    const w = l.name.length * 6.1 + 2;
    const cands = [[9, 0], [-9, 0], [9, -12], [9, 12], [-9, -12], [-9, 12], [9, -24], [9, 24], [-9, -24], [-9, 24]];
    let best = null;
    for (const [dx, dy] of cands) {
      const x0 = dx > 0 ? l.x + dx : l.x + dx - w, b = { x0, x1: x0 + w, y0: l.y + dy - 7, y1: l.y + dy + 6 };
      if (b.x0 < L + 2 || b.x1 > W - 2 || b.y0 < T - 6 || b.y1 > H - B) continue;
      if (!hit(b)) { best = { dx, dy, b }; break; }
      best ??= { dx, dy, b };
    }
    boxes.push(best.b);
    const lx = l.x + best.dx, ly = l.y + best.dy + 4;
    if (best.dy) g += `<line class="ax" x1="${l.x}" y1="${l.y}" x2="${lx}" y2="${ly - 4}"/>`;
    g += `<text class="lbl" x="${lx}" y="${ly}" text-anchor="${best.dx > 0 ? "start" : "end"}">${esc(l.name)}</text>`;
  }
  for (const l of lab) {
    const fam = ix.seatById[l.p.s.seat]?.family || "";
    g += `<circle class="pt ${esc(fam)}" cx="${l.x}" cy="${l.y}" r="6" data-seat="${esc(l.p.s.seat)}" data-x="${l.p.x}" data-y="${l.p.y}"/>`;
    g += `<circle cx="${l.x}" cy="${l.y}" r="14" fill="transparent" data-hit="${esc(l.p.s.seat)}"/>`;
  }
  el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${head.label} against ${xLabel}`)}">${g}</svg>`;
  for (const c of el.querySelectorAll("[data-hit]")) {
    const p = pts.find((q) => q.s.seat === c.dataset.hit);
    const html = `<b>${esc(ix.seatById[p.s.seat]?.label || p.s.seat)}</b><br>${esc(head.label)}: ${fmt(head, p.y)}<br>${esc(xLabel)}: ${fmt(xMetric, p.x)}<br>${p.s.n}/${su.agg.ntasks} tasks`;
    c.addEventListener("pointermove", (ev) => tip(html, ev));
    c.addEventListener("pointerleave", () => tip(null));
  }
}

export const familyLegend = (ix) => `<div class="legend">${ix.families.map((f) => `<span><span class="dot ${esc(f.id)}"></span>${esc(f.label)} (${esc(f.vendor)})</span>`).join("")}</div>`;

/** Per-seat detail: settings plus one row per task with every metric that has a value. */
export function seatDetail(ix, su, seatId) {
  const s = ix.seatById[seatId];
  const a = su.agg.seats.find((x) => x.seat === seatId);
  const cells = su.agg.cells[seatId] || {};
  const used = su.metrics.filter((m) => su.tasks.some((t) => cells[t.id]?.[m.id]));
  let h = `<div class="seathead"><span><b>${esc(s.label)}</b></span><span>model <code>${esc(s.model)}</code></span><span>effort <b>${esc(s.effort || "–")}</b></span><span>${esc(s.harness)}</span><span>${s.billing === "api" ? "pay-per-token API" : "subscription"}</span><span>cost ${esc(s.cost_note)}</span>${s.released ? `<span>released ${esc(s.released)}</span>` : ""}${s.baseline ? '<span class="badge flag">older baseline</span>' : ""}</div>`;
  if (a) h += `<p class="note">Rank ${su.agg.seats.indexOf(a) + 1} of ${su.agg.seats.length} by mean ${esc(su.agg.head.label.toLowerCase())}: ${fmt(su.agg.head, a.per[su.agg.head.id])} over ${a.n} of ${su.agg.ntasks} tasks.</p>`;
  else return h + `<p class="note">No results for this seat in this suite yet.</p>`;
  h += `<div class="tw"><table><thead><tr><th scope="col">Task</th>${used.map((m) => `<th class="num" scope="col" title="${esc(m.description || "")}">${esc(m.label)}</th>`).join("")}<th scope="col">Notes</th></tr></thead><tbody>`;
  for (const t of su.tasks) {
    const c = cells[t.id];
    h += `<tr><td class="taskcell" title="${esc(t.description)}"><code>${esc(t.id)}</code> ${esc(t.title)}</td>`;
    for (const m of used) {
      const v = c?.[m.id];
      const txt = v ? fmt(m, v.mean, { single: v.n === 1 }) : "–";
      const cls = m.type === "bool" && v ? (v.mean >= 1 ? "pass" : v.mean <= 0 ? "fail" : "") : "";
      h += `<td class="num ${cls}">${txt}${v?.sd != null ? ` <span class="sd">±${v.sd.toFixed(1)}</span>` : ""}</td>`;
    }
    h += `<td>${t.note ? `<span class="badge flag" title="${esc(t.note)}">note</span> ` : ""}${c ? c.flags.map((f) => `<span class="badge flag">${esc(f)}</span>`).join(" ") + (c.runs > 1 ? ` <span class="note">${c.runs} runs</span>` : "") : '<span class="note">not run</span>'}</td></tr>`;
  }
  return h + "</tbody></table></div>" + taskNotes(su);
}

export function methodology(su) {
  return `<div class="stack col"><h3>How it is scored</h3>${su.methodology.scoring.map((p) => `<p>${esc(p)}</p>`).join("")}
  <h3>Caveats</h3><ul class="plain">${su.methodology.caveats.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
  <h3>Metrics</h3><ul class="plain">${su.metrics.map((m) => `<li><b>${esc(m.label)}</b>${m.unit ? ` (${esc(m.unit)}, ${m.higher_is_better ? "higher" : "lower"} is better)` : ""}: ${esc(m.description || "")}</li>`).join("")}</ul></div>`;
}

export function showError(el, e) {
  el.innerHTML = `<p class="err">Could not load the results: ${esc(e.message)}</p>`;
  console.error(e);
}
