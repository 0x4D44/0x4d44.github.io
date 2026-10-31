// Drawing order of the plan (the 2D half of the film): elements with equal keys keep their creation order, the rugs lie under all the furniture, and a
// chair is pushed in under its table or desk.
//   1. the order of EL_SORTED itself: creation order within a layer and kind; the living-room rug before the sofa and the coffee table; every rug before
//      every other piece; every chair after the rugs and before every table, desk and cabinet
//   2. pixels: the finished plan is painted and the outlines of the sofa, the coffee table, the console and the shoe cabinet must show over their rugs
//   3. pixels: where a chair overlaps its table or desk (a 25 mm strip), the table's edge line must run unbroken along the chair and the chair's own front
//      line must lie hidden under the table top
// Guards the fix that made sortElements() use an integer key with the creation index as the tie-break, with a slot of their own for rugs and chairs.
//   usage: node order.test.mjs        (PTB_SITE=<site root> tests another copy of the site)
import { suite } from "./lib/suite.mjs";
import { launch, delay } from "./lib/cdp.mjs";
import { serveDbg } from "./lib/dbg.mjs";
import { waitReady } from "./lib/film.mjs";
import { SITE, PAGE } from "./lib/site.mjs";
import { PLAN } from "./expect.mjs";

const S = suite("order");
await S.run(async () => {
  if (!S.needChrome()) return;
  const srv = await serveDbg(SITE, "paintPlan, SHEET, EL_SORTED, itemBox, itemDef, zTop");
  const br = await launch({ width: 1200, height: 800 });
  try {
    const page = await br.newPage(`${srv.base}/${PAGE}`);
    await waitReady(page, 30000);

    // 1. within one layer and kind, the painter keeps the order the elements were created in
    const L = PLAN.living;
    const g = JSON.parse(await page.eval(`(() => {
      const s = window.__tl._dbg.EL_SORTED, groups = {}, bad = [];
      for (const e of s) { const k = (e.L || '-') + '|' + e.k + (e.k === 'fu' && (e.it.type === 'rug' || e.it.type === 'chair') ? '|' + e.it.type : ''); if (groups[k] !== undefined && e._i < groups[k]) bad.push(k + ' ' + e._i + ' after ' + groups[k]); groups[k] = e._i; }
      const idx = (type, room) => s.findIndex((e) => e.k === 'fu' && e.it.type === type && e.it.room === room);
      const fu = s.map((e, i) => [e, i]).filter(([e]) => e.k === 'fu'), at = (f) => fu.filter(([e]) => f(e.it.type)).map(([, i]) => i);
      const rugs = at((t) => t === 'rug'), chairs = at((t) => t === 'chair'), rest = at((t) => t !== 'rug' && t !== 'chair');
      return JSON.stringify({ n: s.length, bad: bad.slice(0, 5), nbad: bad.length, rug: idx(${JSON.stringify(L.rug)}, ${JSON.stringify(L.room)}), sofa: idx(${JSON.stringify(L.sofa)}, ${JSON.stringify(L.room)}), coffee: idx(${JSON.stringify(L.coffee)}, ${JSON.stringify(L.room)}), rugs: rugs.length, lastRug: Math.max(...rugs), chairs: chairs.length, firstChair: Math.min(...chairs), lastChair: Math.max(...chairs), firstOther: Math.min(...rest) });
    })()`));
    // within a kind the creation order survives, except that a rug and a chair are moved below the other furniture
    S.check("equal layer and kind draw in creation order", g.nbad === 0, g.nbad ? JSON.stringify(g.bad) : `${g.n} elements`);
    S.check("the living-room rug is drawn before the sofa and the coffee table", g.rug >= 0 && g.rug < g.sofa && g.rug < g.coffee, `rug ${g.rug}, sofa ${g.sofa}, coffee ${g.coffee}`);
    S.check("every rug is drawn before every other piece of furniture", g.rugs === PLAN.rugs && g.lastRug < g.firstOther, `${g.rugs} rugs, last at ${g.lastRug}, first other piece at ${g.firstOther}`);
    S.check("every chair is drawn after the rugs and before every table, desk and cabinet", g.chairs === PLAN.chairs && g.lastRug < g.firstChair && g.lastChair < g.firstOther, `${g.chairs} chairs at ${g.firstChair}..${g.lastChair}, first other piece at ${g.firstOther}`);

    // 2. pixels: paint the finished plan and look for the sofa's and the table's outlines inside the rug
    const r = JSON.parse(await page.eval(`(() => {
      const { paintPlan, SHEET } = window.__tl._dbg;
      const KT = 2048 / (SHEET[2] - SHEET[0]), TW = 2048, TH = Math.round((SHEET[3] - SHEET[1]) * KT);
      const c = document.createElement('canvas'); c.width = TW; c.height = TH; const x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#1c2128'; x.fillRect(0, 0, TW, TH);
      paintPlan(x, { k: KT, ox: -SHEET[0] * KT, oy: SHEET[3] * KT, ui: 4.8, tex: true, ga: 1 }, window.__tl.T3.selT, { sel: 0 });
      const blue = (cx, cy, hw, hh) => {
        const x0 = Math.round(-SHEET[0] * KT + (cx - hw) * KT), x1 = Math.round(-SHEET[0] * KT + (cx + hw) * KT);
        const y0 = Math.round(SHEET[3] * KT - (cy + hh) * KT), y1 = Math.round(SHEET[3] * KT - (cy - hh) * KT);
        const d = x.getImageData(x0, y0, x1 - x0, y1 - y0).data; let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 200 && d[i] < 170 && d[i + 1] > 110 && d[i + 2] - d[i] > 70) n++;
        return n;
      };
      const out = {}; for (const [k, b] of ${JSON.stringify(PLAN.outlines.map((o) => [o.key, o.box]))}) out[k] = blue(...b);
      return JSON.stringify(out);
    })()`));
    for (const o of PLAN.outlines) S.check(o.name, r[o.key] > o.min, `${r[o.key]} blue pixels`);

    // 3. pixels: a chair is pushed in under its table or desk. Where their footprints overlap (a 25 mm strip), the table's edge line must run unbroken
    //    along the chair, and the chair's own front line must lie hidden under the table top.
    const c = JSON.parse(await page.eval(`(() => {
      const { paintPlan, EL_SORTED, itemBox } = window.__tl._dbg, K = 0.8;
      const fu = EL_SORTED.filter((e) => e.k === 'fu').map((e) => e.it), out = [];
      // ink = any stroke colour (the chair's is blue, the table's orange); the fill and the sheet are near-black
      const isInk = (d) => Math.max(d[0], d[1], d[2]) > 140;
      for (const ch of fu.filter((it) => it.type === 'chair')) for (const tb of fu.filter((it) => it.type !== 'chair' && it.type !== 'rug')) {
        const A = itemBox(ch), B = itemBox(tb), s = [Math.max(A[0], B[0]), Math.max(A[1], B[1]), Math.min(A[2], B[2]), Math.min(A[3], B[3])];
        const sx = s[2] - s[0], sy = s[3] - s[1];
        if (sx <= 1 || sy <= 1) continue;
        const wx0 = A[0] - 100, wx1 = A[2] + 100, wy0 = A[1] - 100, wy1 = A[3] + 100;
        const cv = document.createElement('canvas'); cv.width = Math.ceil((wx1 - wx0) * K); cv.height = Math.ceil((wy1 - wy0) * K);
        const x = cv.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#1c2128'; x.fillRect(0, 0, cv.width, cv.height);
        paintPlan(x, { k: K, ox: -wx0 * K, oy: wy1 * K, ui: 4.8, tex: true, ga: 1 }, window.__tl.T3.selT, { sel: 0 });
        const px = (wx) => Math.round((wx - wx0) * K), py = (wy) => Math.round((wy1 - wy) * K);
        const thinY = sy < sx;
        // the table's edge is the strip's border that is also the table box's border; the chair's front line is the other one
        const tableAtLow = thinY ? B[1] === s[1] : B[0] === s[0];
        const edgeW = thinY ? (tableAtLow ? s[1] : s[3]) : (tableAtLow ? s[0] : s[2]), frontW = thinY ? (tableAtLow ? s[3] : s[1]) : (tableAtLow ? s[2] : s[0]);
        const lo = (thinY ? s[0] : s[1]) + 0.15 * (thinY ? sx : sy), hi = (thinY ? s[2] : s[3]) - 0.15 * (thinY ? sx : sy);
        const cover = (lineW) => {
          let n = 0, m = 0;
          for (let w = lo; w <= hi; w += 1 / K) {
            let hit = false;
            for (let o = -1; o <= 1 && !hit; o++) {
              const X = thinY ? px(w) : px(lineW) + o, Y = thinY ? py(lineW) + o : py(w);
              const d = x.getImageData(X, Y, 1, 1).data; if (isInk(d)) hit = true;
            }
            m++; if (hit) n++;
          }
          return n / m;
        };
        out.push({ chair: ch.id, table: tb.id, strip: [Math.round(sx), Math.round(sy)], edge: +cover(edgeW).toFixed(2), front: +cover(frontW).toFixed(2) });
      }
      return JSON.stringify(out);
    })()`));
    S.check(`a chair overlaps its table or desk in ${PLAN.chairOverlapsText}`, c.length === PLAN.chairOverlaps, `${c.length} overlaps: ${c.map((o) => o.chair + '/' + o.table).join(' ')}`);
    for (const o of c) {
      S.check(`${o.chair}: the edge of ${o.table} runs unbroken over the chair`, o.edge >= 0.9, `${Math.round(o.edge * 100)} % ink along the edge, strip ${o.strip.join(' x ')} mm`);
      S.check(`${o.chair}: the chair's front line is hidden under ${o.table}`, o.front <= 0.1, `${Math.round(o.front * 100)} % ink along the chair front`);
    }
    const bad = page.logs.filter((l) => /error|exception/i.test(l.type) && !/favicon\.ico/.test(l.text || ""));
    S.check("no console errors", bad.length === 0, bad.length ? JSON.stringify(bad.slice(0, 3)) : "");

    // Report only (the old furnorder.mjs listing, not counted): every pair of furniture items whose footprints overlap, and whether the one DRAWN LAST
    // (on top) is also the HIGHER one. A FLAG is a lower item drawn over a higher one: a chair seat over a table top, a rug over a sofa...
    const f = JSON.parse(await page.eval(`(() => {
      const { EL_SORTED, itemBox, itemDef, zTop } = window.__tl._dbg;
      const fu = EL_SORTED.filter((e) => e.k === 'fu').map((e) => e.it);
      const pos = new Map(fu.map((it, i) => [it.id, i]));
      const top = (it) => { const d = itemDef(it), src = d.pp || d.parts; return Math.max(...src.map((p) => zTop(p))); };
      const res = [];
      for (let i = 0; i < fu.length; i++) for (let j = i + 1; j < fu.length; j++) {
        const a = fu[i], b = fu[j], A = itemBox(a), B = itemBox(b);
        const ox = Math.min(A[2], B[2]) - Math.max(A[0], B[0]), oy = Math.min(A[3], B[3]) - Math.max(A[1], B[1]);
        if (ox <= 1 || oy <= 1) continue;
        const lastIt = pos.get(a.id) > pos.get(b.id) ? a : b, firstIt = lastIt === a ? b : a;
        res.push({ over: lastIt.id, under: firstIt.id, underType: firstIt.type, overTop: top(lastIt), underTop: top(firstIt), ox: Math.round(ox), oy: Math.round(oy), bad: top(lastIt) < top(firstIt) });
      }
      return JSON.stringify({ n: fu.length, res });
    })()`).catch((e) => JSON.stringify({ n: 0, res: [], err: String(e.message || e).slice(0, 120) })));
    // a tucked-in chair is under its table's edge on purpose (its back is the taller part); anything else flagged is worth a look
    const flagged = f.res.filter((x) => x.bad), tucked = flagged.filter((x) => x.underType === "chair"), others = flagged.filter((x) => x.underType !== "chair");
    S.info(`furniture: ${f.n} items, ${f.res.length} overlapping pairs; drawn over a taller piece: ${tucked.length} tucked-in chairs, ${others.length} others${f.err ? " (" + f.err + ")" : ""}`);
    for (const x of others) S.info(`  FLAG ${x.over} (top ${x.overTop}) drawn over ${x.under} (top ${x.underTop})   overlap ${x.ox} x ${x.oy} mm`);
  } finally { await Promise.race([br.close(), delay(8000)]); await Promise.race([srv.close(), delay(2000)]); }
});
