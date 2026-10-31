// The first-person tour, the last 51.5 s of the film: after the HOME orbit a roof slab drops onto the building, ten ceiling lamps come up from zero, the front
// door shuts and swings open, and a hand-authored camera (T3.walk, eye at 1.6 m) dives to the door and walks the apartment room by room, with a tag naming each room.
// What must stay true of it, measured on the camera track (no browser timing involved, so the checks are exact and repeatable):
//   * the walk starts from the orbit's last pose (a standing hand-over: no jump), and the track never jumps, spins or whips: eye step, speed, yaw and pitch rates
//   * inside, the eye stays at head height and never comes near a wall, a column, a tall piece of furniture or an open door leaf
//   * every room tag names the room the camera is looking into while the tag is fully shown
//   * the roof sits on the walls once it has dropped, the lamps never pop on (they come up from zero) and their fittings stay out until the roof hides them, the front door is shut under the roof and open for the walk
//   usage: node tour.test.mjs        (PTB_SITE=<site root> tests another copy of the site; every number is in expect.mjs: TOUR and FILM)
import { suite, problems } from "./lib/suite.mjs";
import { launch, delay } from "./lib/cdp.mjs";
import { serveDbg } from "./lib/dbg.mjs";
import { waitReady, readFilm, state3D } from "./lib/film.mjs";
import { gpuArgs } from "./lib/chrome.mjs";
import { SITE, PAGE } from "./lib/site.mjs";
import { FILM, TOUR } from "./expect.mjs";

const T = suite("tour");
const near = (a, b, tol) => Math.abs(a - b) <= tol;
await T.run(async () => {
  if (!T.needChrome()) return;
  const srv = await serveDbg(SITE, "T3, walkAt3, camAt3, orbitPose, WALLS, wallPieces, COLUMNS, ITEMS, itemBox, itemDef, OPENINGS, doorGeom, FLOOR_TOP, ROOMS, INN, G3, MAT3");
  const br = await launch({ width: 1200, height: 800, args: gpuArgs() });
  try {
    const page = await br.newPage(`${srv.base}/${PAGE}`);
    const ready = await waitReady(page, 30000), g3 = await state3D(page);
    T.check("page ready", ready && g3.ok, g3.detail);
    const film = await readFilm(page);

    // ---- everything that is a number on the camera track, measured in the page in one pass (1/60 s steps from Z to the end of the film)
    const M = JSON.parse(await page.eval(`(() => {
      const d = window.__tl._dbg, T3 = d.T3, K = ${JSON.stringify(TOUR)}, DEG = Math.PI / 180, DT = 1 / 60;
      const Z = T3.walk[0][0], END = T3.end, out = { Z, END, nKeys: T3.walk.length };
      out.keysIncreasing = T3.walk.every((k, i) => i === 0 || k[0] > T3.walk[i - 1][0]);
      // the hand-over: the orbit just before Z against the walk at Z
      { const c = d.camAt3(Z - 1e-6), o = d.orbitPose(c), w = d.walkAt3(Z);
        out.handoff = { ex: o.ex - w.ex, ey: o.ey - w.ey, ez: o.ez - w.ez, hd: (90 + c.az) - w.hd, pd: c.el - w.pd, lp: c.lp - w.lp }; out.orbitEye = o.ey; }
      // what the eye could hit at head height: wall pieces, columns, furniture that reaches the eye, and every door leaf as it stands open (plan mm rectangles)
      const eyeMm = (d.FLOOR_TOP + 1.6) * 1000, sol = [], walls = [];
      const top = (it) => { const def = d.itemDef(it); let m = 0; for (const p of def.parts) { const k = p[0]; let z = 0; if (k === 'b') z = p[3] + p[6]; else if (k === 'c') z = p[3] + p[5]; else if (k === 's') z = p[3] + p[4]; else if (k === 'k') z = p[3] + p[6]; if (z > m) m = z; } return m * (it.s || 1); };
      for (const id of Object.keys(d.WALLS)) for (const p of d.wallPieces(d.WALLS[id])) if (p.z0 <= eyeMm + 60 && p.z1 >= eyeMm - 60) { sol.push({ n: 'wall ' + id, r: p.r }); walls.push(p.r); }
      for (const c of d.COLUMNS) { sol.push({ n: 'column ' + c.id, r: c.r }); walls.push(c.r); }
      for (const it of d.ITEMS) if (top(it) >= eyeMm - 150) sol.push({ n: 'item ' + it.id, r: d.itemBox(it) });
      for (const o of d.OPENINGS) if (o.isDoor) {
        const G = d.doorGeom(o), lw = o.w - 30, hx = G.H[0] + G.cl[0] * 12 + G.op[0] * 14, hy = G.H[1] + G.cl[1] * 12 + G.op[1] * 14, ex = hx + G.op[0] * lw, ey = hy + G.op[1] * lw;
        sol.push({ n: 'door leaf ' + o.id, r: [Math.min(hx, ex) - 22, Math.min(hy, ey) - 22, Math.max(hx, ex) + 22, Math.max(hy, ey) + 22] });
      }
      const dist = (x, y, r) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3]));
      // the track
      const mx = { step: { v: 0, t: 0 }, speed: { v: 0, t: 0 }, yaw: { v: 0, t: 0 }, pitch: { v: 0, t: 0 }, clear: { v: 1e9, who: '', t: 0 } };
      let eyeLo = 1e9, eyeHi = -1e9, lensLo = 1e9, lensHi = -1e9, outside = 0, prev = null;
      for (let t = Z; t <= END + 1e-9; t += DT) {
        const w = d.walkAt3(t), r = t - Z, x = w.ex * 1000, y = -w.ez * 1000;
        if (prev) {
          const step = Math.hypot(w.ex - prev.ex, w.ey - prev.ey, w.ez - prev.ez), yaw = Math.abs(w.hd - prev.hd) / DT, pit = Math.abs(w.pd - prev.pd) / DT;
          if (step > mx.step.v) mx.step = { v: step, t: r };
          if (r >= K.inside && step / DT > mx.speed.v) mx.speed = { v: step / DT, t: r };
          if (yaw > mx.yaw.v) mx.yaw = { v: yaw, t: r };
          if (pit > mx.pitch.v) mx.pitch = { v: pit, t: r };
        }
        if (r >= K.down) { eyeLo = Math.min(eyeLo, w.ey); eyeHi = Math.max(eyeHi, w.ey); const f = 2 * Math.atan(Math.exp(w.lp)) / DEG; lensLo = Math.min(lensLo, f); lensHi = Math.max(lensHi, f); }
        if (r >= K.inside) {
          const I = d.INN; if (x < I[0] || x > I[2] || y < I[1] || y > I[3]) outside++;
          for (const s of sol) { const q = dist(x, y, s.r) / 1000; if (q < mx.clear.v) mx.clear = { v: q, who: s.n, t: r }; }
        }
        prev = w;
      }
      Object.assign(out, { maxStep: mx.step, maxSpeed: mx.speed, maxYaw: mx.yaw, maxPitch: mx.pitch, minClear: mx.clear, eyeLo, eyeHi, lensLo, lensHi, outside, solids: sol.length });
      // the rooms the camera looks into: the room the eye is in, and every room its heading runs through from the eye to the first wall (or 14 m): through an open door, into the next room
      const roomAt = (x, y) => { const q = d.ROOMS.find((r) => x >= r.r[0] && x <= r.r[2] && y >= r.r[1] && y <= r.r[3]); return q ? q.id : null; };
      const hit = (x, y, hd) => {
        const dx = Math.cos(hd * DEG), dy = Math.sin(hd * DEG); let best = 14000;
        for (const r of walls) {
          let a = 0, b = best, ok = true;
          for (const [o, dd, lo, hi] of [[x, dx, r[0], r[2]], [y, dy, r[1], r[3]]]) {
            if (Math.abs(dd) < 1e-9) { if (o < lo || o > hi) ok = false; }
            else { let u = (lo - o) / dd, v = (hi - o) / dd; if (u > v) { const s = u; u = v; v = s; } a = Math.max(a, u); b = Math.min(b, v); }
          }
          if (ok && a <= b && a > 1) best = Math.min(best, a);
        }
        return best;
      };
      const looksInto = (t) => {
        const w = d.walkAt3(t), x = w.ex * 1000, y = -w.ez * 1000, h = hit(x, y, w.hd), seen = new Set(), r0 = roomAt(x, y);
        if (r0) seen.add(r0);
        for (let s = 25; s < h; s += 25) { const q = roomAt(x + Math.cos(w.hd * DEG) * s, y + Math.sin(w.hd * DEG) * s); if (q) seen.add(q); }
        return seen;
      };
      // every 50 ms while a tag is fully shown (its fades take tagMargin at each end): is its room in view?
      out.tags = T3.tags.map((g) => {
        let n = 0, miss = 0, first = null, last = null;
        for (let t = g.t0 + K.tagMargin; t <= g.t1 - K.tagMargin + 1e-9; t += 0.05) { n++; if (!looksInto(t).has(g.name)) { miss++; if (first === null) first = t - Z; last = t - Z; } }
        return { name: g.name, area: g.area, t0: g.t0 - Z, t1: g.t1 - Z, n, miss, first, last };
      });
      out.rooms = d.ROOMS.map((r) => ({ id: r.id, area: r.area.toFixed(1) + ' m\\u00b2' }));
      out.tourT = Object.fromEntries(Object.entries(T3.tourT).map(([k, v]) => [k, Array.isArray(v) ? v.map((q) => q - Z) : v - Z]));
      out.titleT = T3.titleT - Z; out.cmdOut = T3.cmdOut - Z;
      return JSON.stringify(out);
    })()`, { timeout: 120000 }));
    const Z = M.Z, rel = (t) => (t - Z).toFixed(2);

    // ---- the film's own structure
    const last = film.chapters[film.chapters.length - 1];
    T.check(`the tour is the last chapter, "${TOUR.chapter}", and it opens just before the walk (Z - 1 s .. Z)`, last.name === TOUR.chapter && last.t >= Z - 1 && last.t <= Z, `${last.num} ${last.name} at Z${last.t - Z >= 0 ? "+" : ""}${(last.t - Z).toFixed(2)}`);
    T.check(`the tour lasts ${TOUR.seconds} s: the film ends where the walk ends`, near(film.T - Z, TOUR.seconds, FILM.secondsTol) && near(M.END, film.T, 1e-9), `Z = ${Z.toFixed(2)}, end ${M.END.toFixed(2)}, film ${film.T.toFixed(2)}`);
    T.check("the walk's keys are in strict time order", M.keysIncreasing && M.nKeys > 10, `${M.nKeys} keys`);
    const rl = (k) => JSON.stringify(M.tourT[k].map((v) => +v.toFixed(3)));
    for (const k of ["roof", "lights", "shut", "open"]) T.check(`the ${k} window is ${JSON.stringify(TOUR[k])} s after Z`, M.tourT[k].every((v, i) => near(v, TOUR[k][i], 1e-6)), `page says ${rl(k)}`);
    T.check("the command line leaves once the door is open, and the end title comes late in the walk", M.cmdOut >= TOUR.open[1] - 0.5 && M.titleT > M.cmdOut + 20 && M.titleT < TOUR.seconds - 3, `command line out at Z+${M.cmdOut.toFixed(2)}, end title at Z+${M.titleT.toFixed(2)}`);

    // ---- the hand-over from the orbit, and the track as a whole
    const worst = Object.entries(M.handoff).reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
    T.check(`the walk starts from the orbit's last pose (eye, heading, pitch, lens agree to ${TOUR.handoffTol})`, Math.abs(worst[1]) <= TOUR.handoffTol, `largest difference ${worst[0]} ${worst[1].toExponential(2)}; the orbit's eye is ${M.orbitEye.toFixed(1)} m up`);
    T.check(`the eye never moves more than ${TOUR.maxStep} m in one frame (the dive peaks near 0.10)`, M.maxStep.v <= TOUR.maxStep, `${(M.maxStep.v * 1000).toFixed(1)} mm at Z+${M.maxStep.t.toFixed(2)}`);
    T.check(`inside, the eye never moves faster than ${TOUR.maxSpeedInside} m/s`, M.maxSpeed.v <= TOUR.maxSpeedInside, `${M.maxSpeed.v.toFixed(2)} m/s at Z+${M.maxSpeed.t.toFixed(2)}`);
    T.check(`the head never turns faster than ${TOUR.maxYaw} deg/s (a wrapped heading would spin the camera)`, M.maxYaw.v <= TOUR.maxYaw, `${M.maxYaw.v.toFixed(1)} deg/s at Z+${M.maxYaw.t.toFixed(2)}`);
    T.check(`the head never tips faster than ${TOUR.maxPitch} deg/s`, M.maxPitch.v <= TOUR.maxPitch, `${M.maxPitch.v.toFixed(1)} deg/s at Z+${M.maxPitch.t.toFixed(2)}`);
    T.check(`from Z+${TOUR.down} s the eye stays at head height (${TOUR.eye} m)`, M.eyeLo >= TOUR.eye - TOUR.eyeTol && M.eyeHi <= TOUR.eye + TOUR.eyeTol, `${M.eyeLo.toFixed(4)} .. ${M.eyeHi.toFixed(4)} m`);
    T.check(`the lens stays between ${TOUR.lens[0]} and ${TOUR.lens[1]} deg from Z+${TOUR.down} s`, M.lensLo >= TOUR.lens[0] && M.lensHi <= TOUR.lens[1], `${M.lensLo.toFixed(1)} .. ${M.lensHi.toFixed(1)} deg`);
    T.check(`from Z+${TOUR.inside} s the eye is inside the building`, M.outside === 0, `${M.outside} frame(s) outside`);
    T.check(`inside, the eye is never within ${TOUR.clear} m of a wall, a column, a tall piece of furniture or an open door leaf`, M.minClear.v >= TOUR.clear && M.solids > 40, `closest ${(M.minClear.v * 1000).toFixed(0)} mm to ${M.minClear.who} at Z+${M.minClear.t.toFixed(2)}; ${M.solids} solids at eye height`);

    // ---- the room tags
    const ids = M.rooms.map((r) => r.id).sort(), tn = M.tags.map((g) => g.name).sort();
    T.check("every room has one tag, and no other tag exists", JSON.stringify(ids) === JSON.stringify(tn), `rooms ${ids.join(", ")}; tags ${tn.join(", ")}`);
    T.check("each tag shows its room's floor area", M.tags.every((g) => g.area === M.rooms.find((r) => r.id === g.name)?.area), M.tags.map((g) => `${g.name} ${g.area}`).join(", "));
    const ordered = M.tags.every((g, i) => g.t1 > g.t0 + 2 * TOUR.tagMargin && (i === 0 || g.t0 >= M.tags[i - 1].t1) && g.t0 >= TOUR.inside - 2 && g.t1 <= TOUR.seconds + 1e-9);
    T.check("the tags come one after another, inside the walk, each long enough to be read", ordered, M.tags.map((g) => `${g.name} ${g.t0.toFixed(1)}..${g.t1.toFixed(1)}`).join("  "));
    for (const g of M.tags) T.check(`${g.name}: the camera looks into that room for the whole time the tag is fully shown`, g.miss === 0 && g.n > 10,
      g.miss === 0 ? `in view at all ${g.n} instants, Z+${(g.t0 + TOUR.tagMargin).toFixed(2)} .. Z+${(g.t1 - TOUR.tagMargin).toFixed(2)}` : `out of view at ${g.miss} of ${g.n} instants, from Z+${g.first.toFixed(2)} to Z+${g.last.toFixed(2)}`);

    // ---- the roof, the lamps and the door, at chosen instants of the film (the page seeks and draws, as the player does)
    const R = JSON.parse(await page.eval(`(() => {
      const d = window.__tl._dbg, G3 = d.G3, MAT3 = d.MAT3, K = ${JSON.stringify(TOUR)}, Z = ${Z}, out = {};
      let roof = null; const lamps = [], fits = [];
      G3.root.traverse((o) => { if (o.isMesh && Array.isArray(o.material) && o.material.includes(MAT3.roofT)) roof = o; if (o.isPointLight) lamps.push(o); if (o.isMesh && o.material === MAT3.fitting) fits.push(o); });
      out.found = { roof: !!roof, lamps: lamps.length, fits: fits.length };
      if (!roof) return JSON.stringify(out);
      const under = () => roof.position.y - roof.geometry.parameters.height / 2;
      const at = (r) => { window.__tl.at(Z + r); };
      at(K.roof[0] - 0.1); out.before = { visible: roof.visible };
      at((K.roof[0] + K.roof[1]) / 2); out.mid = { visible: roof.visible, under: under() };
      at(K.roof[1] + 0.3); out.after = { visible: roof.visible, under: under(), shadow: roof.castShadow, receive: roof.receiveShadow };
      at(K.roof[1] + 20); out.late = { visible: roof.visible, under: under() };
      // the lamps frame by frame across their ramp: when they first count, how hard, and the biggest jump from one frame to the next
      let prev = 0, jump = 0, first = null, firstT = null, countAtFirst = 0, peak = 0;
      for (let r = K.lights[0] - 0.4; r <= K.lights[1] + 0.4 + 1e-9; r += 1 / 60) {
        at(r); const on = lamps.filter((l) => l.visible), v = on.length ? on[0].intensity : 0;
        if (first === null && on.length) { first = v; firstT = r; countAtFirst = on.length; }
        jump = Math.max(jump, Math.abs(v - prev)); prev = v; peak = Math.max(peak, v);
      }
      out.lamps = { first, firstT, countAtFirst, jump, peak };
      at(K.lights[0] - 0.2); out.lampsBefore = lamps.filter((l) => l.visible).length;
      at(K.lights[1] + 5); out.lampsAfter = { visible: lamps.filter((l) => l.visible).length, intensity: lamps[0].intensity };
      // the round ceiling fittings: the dive still sees under the roof while it comes down, so they stay out until the roof is over them
      at(K.lights[0] + 0.1); out.fitsEarly = fits.filter((f) => f.visible).length;
      at(K.roof[1] + 0.3); out.fitsLate = fits.filter((f) => f.visible).length;
      return JSON.stringify(out);
    })()`, { timeout: 120000 }));
    T.check("the page has the roof slab, the ceiling lamps and their fittings", R.found.roof && R.found.lamps === TOUR.lamps && R.found.fits === TOUR.lamps, JSON.stringify(R.found));
    if (R.found.roof) {
      T.check("the roof is not there before it drops", R.before.visible === false, JSON.stringify(R.before));
      T.check("half way through its drop the roof is in the air", R.mid.visible && R.mid.under > TOUR.roofUnder + 0.5, `underside ${R.mid.under.toFixed(3)} m`);
      T.check(`once dropped the roof sits on the walls: its underside is at ${TOUR.roofUnder} m, it casts and receives the sun's shadow`, R.after.visible && near(R.after.under, TOUR.roofUnder, 1e-6) && R.after.shadow && R.after.receive, JSON.stringify(R.after));
      T.check("and it stays there for the rest of the film", R.late.visible && near(R.late.under, TOUR.roofUnder, 1e-6), JSON.stringify(R.late));
      T.check(`the lamps are off before their ramp and ${TOUR.lamps} are on after it, at ${TOUR.lampPeak}`, R.lampsBefore === 0 && R.lampsAfter.visible === TOUR.lamps && near(R.lampsAfter.intensity, TOUR.lampPeak, 1e-9), `before ${R.lampsBefore}; after ${R.lampsAfter.visible} at ${R.lampsAfter.intensity}`);
      T.check(`a lamp first counts at no more than ${TOUR.lampFirst} (it never pops on)`, R.lamps.first !== null && R.lamps.first <= TOUR.lampFirst && R.lamps.countAtFirst === TOUR.lamps, `first seen at Z+${(R.lamps.firstT ?? 0).toFixed(2)}: ${R.lamps.countAtFirst} lamps at ${(R.lamps.first ?? -1).toExponential(2)}`);
      T.check(`a lamp's intensity never changes by more than ${TOUR.lampStep} in one frame, and reaches ${TOUR.lampPeak}`, R.lamps.jump <= TOUR.lampStep && near(R.lamps.peak, TOUR.lampPeak, 1e-9), `largest step ${R.lamps.jump.toFixed(3)}, peak ${R.lamps.peak}`);
      T.check("the ceiling fittings wait until the roof is over them (the dive would see them floating) and are all there once it is", R.fitsEarly === 0 && R.fitsLate === TOUR.lamps, `at Z+${TOUR.lights[0] + 0.1}: ${R.fitsEarly} shown; at Z+${TOUR.roof[1] + 0.3}: ${R.fitsLate} shown`);
    }

    // the front door D01, seen straight on from the walk's own camera: the middle of the frame is the dark leaf while it is shut, the lit corridor once it is open
    const luma = (r) => page.eval(`(async () => {
      const im = new Image(); im.src = window.__tl.png(${Z + r}, 640); await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const [a, b, e, f] = ${JSON.stringify(TOUR.door.box)}, x0 = Math.round(a * c.width), y0 = Math.round(b * c.height), x1 = Math.round(e * c.width), y1 = Math.round(f * c.height);
      const px = g.getImageData(x0, y0, x1 - x0, y1 - y0).data; let s = 0;
      for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      return s / (px.length / 4);
    })()`, { timeout: 60000 });
    const shut = await luma(TOUR.door.shutAt), open = await luma(TOUR.door.openAt);
    T.check(`the front door is shut under the roof: the doorway is dark at Z+${TOUR.door.shutAt} (mean luminance <= ${TOUR.door.shutMax})`, shut <= TOUR.door.shutMax, `${shut.toFixed(1)}`);
    T.check(`and open for the walk: the doorway shows the lit corridor at Z+${TOUR.door.openAt} (mean luminance >= ${TOUR.door.openMin})`, open >= TOUR.door.openMin, `${open.toFixed(1)}`);

    const bad = problems(page, /favicon|X4122/);
    T.check("no console errors", bad.length === 0, JSON.stringify(bad.slice(0, 3)));
  } finally { await Promise.race([br.close(), delay(8000)]); await Promise.race([srv.close(), delay(2000)]); }
});
