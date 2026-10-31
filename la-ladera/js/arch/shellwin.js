// Windows (frame, glass, iron grille, sill, painted surround) and the static parts of doors (casings, shutter housings, entry steps).
// The openings themselves (reveals) are cut by shell.js; door LEAVES are live objects in doors.js.
import { lin, mulc, mixc, qd, hash01, OUT, wbox, bar, triFacing, archPts } from './mb.js';
import { shutterFrame } from './shutters.js';
import { buildReja, rejaPattern } from './reja.js';

const FRAME = 0.05, DEPTH = 0.07;

// Geometry diet (R2a: uncapped cost over 12 ms; A1's census: frame_paint was 199 k triangles in the camera frustum and 126-180 k in the sun's, the fattest family in both passes).
// Every part here is a box on the wall, and a box has six faces of which at most three are ever seen: the faces that lie against a jamb, a neighbouring bar, the sill or the
// head are covered by what they touch. `hid(dir, 'u-', 'y+', ...)` names those faces by role so each call says why it drops them: u- / u+ = the sides along the wall (nearer /
// farther along u), y- / y+ = under / over, a- / a+ = the faces across the wall. Painted bands and casings 14-16 mm proud of the wall are quads, not boxes.
const FACE = { x: { 'u-': 'nx', 'u+': 'px', 'a-': 'nz', 'a+': 'pz' }, z: { 'u-': 'nz', 'u+': 'pz', 'a-': 'nx', 'a+': 'px' } };
const hid = (dir, ...roles) => roles.map((r) => (r === 'y-' ? 'ny' : r === 'y+' ? 'py' : FACE[dir][r]));
/** Wall coordinates (u along the wall, y up, a across it) -> building-local [x, y, z]. */
const wp = (dir) => (u, y, a) => (dir === 'x' ? [u, y, a] : [a, y, u]);

/**
 * The rise of a round-headed window's arch, 0 for a square one. Only a window record flagged `arch` (a church's fixed lights: openings.js `addWindow`)
 * has a head: a half circle when the sash is tall enough for one, else a flatter half ellipse; too little height left for a head (< 0.15 m) stays square.
 * shell.js `reveals` cuts the matching soffit and corner fills, `buildWindows` below the frame, glass and trim.
 */
export function archRise(win) {
  if (!win?.arch || win.kind !== 'fixed') return 0;
  const r = Math.max(0, Math.min(win.w / 2, win.h - 0.3));
  return r < 0.15 ? 0 : r;
}

export function buildWindows(G) {
  const { S, b, bp, fs } = G, te = S.te;
  for (const w of bp.windows) {
    const k = w.floor, yk = k * S.fh, s = OUT[w.side], dir = w.side === 'front' || w.side === 'back' ? 'x' : 'z';
    const uc = dir === 'x' ? w.x : w.z, at = dir === 'x' ? w.z : w.x;
    const y0 = yk + w.y, y1 = y0 + w.h, ww = w.w, h = w.h;
    const pOut = at + s * te / 2, pF = at + s * (te / 2 - 0.1);
    const hv = (n) => hash01(w.id, n);
    const frameCol = hv(1) < 0.55 ? mulc(fs.trim, 1) : hv(1) < 0.8 ? lin(0xf2efe6) : fs.metal;
    const room = G.byId.get(w.room);
    const rise = archRise(w), ys = y1 - rise;                                   // a round head springs from the line ys
    const at3 = (u, y, p) => (dir === 'x' ? [u, y, p] : [p, y, u]);
    // frame: the posts stand against the jambs, the head under the soffit, the sill bar on the sill (those faces are never drawn, see `hid`)
    if (!rise) {
      wbox(b, 'frame_paint', dir, uc - ww / 2 + FRAME / 2, (y0 + y1) / 2, pF, FRAME, h, DEPTH, frameCol, hid(dir, 'u-', 'y-', 'y+'));
      wbox(b, 'frame_paint', dir, uc + ww / 2 - FRAME / 2, (y0 + y1) / 2, pF, FRAME, h, DEPTH, frameCol, hid(dir, 'u+', 'y-', 'y+'));
      wbox(b, 'frame_paint', dir, uc, y1 - FRAME / 2, pF, ww - 2 * FRAME, FRAME, DEPTH, frameCol, hid(dir, 'u-', 'u+', 'y+'));
    } else {                                                                    // posts to the springing, then a bent head following the arch of the opening
      wbox(b, 'frame_paint', dir, uc - ww / 2 + FRAME / 2, (y0 + ys) / 2, pF, FRAME, ys - y0, DEPTH, frameCol, hid(dir, 'u-', 'y-'));
      wbox(b, 'frame_paint', dir, uc + ww / 2 - FRAME / 2, (y0 + ys) / 2, pF, FRAME, ys - y0, DEPTH, frameCol, hid(dir, 'u+', 'y-'));
      const c = archPts(uc - ww / 2 + FRAME / 2, uc + ww / 2 - FRAME / 2, y1 - FRAME / 2, rise - FRAME / 2, 10);
      for (let i = 0; i + 1 < c.length; i++) bar(b, 'frame_paint', at3(c[i][0], c[i][1], pF), at3(c[i + 1][0], c[i + 1][1], pF), DEPTH, FRAME, { col: frameCol });
    }
    wbox(b, 'frame_paint', dir, uc, y0 + FRAME / 2, pF, ww - 2 * FRAME, FRAME, DEPTH, frameCol, hid(dir, 'u-', 'u+', 'y-'));
    const gu0 = uc - ww / 2 + FRAME, gu1 = uc + ww / 2 - FRAME, gy0 = y0 + FRAME, gy1 = y1 - FRAME;
    const lit = hv(7) < (k === 0 ? 0.25 : 0.4);
    const gm = lit ? 'window_lit' : 'glass';
    const pane = (a, c, p) => {                                               // a glass pane between u=a..c at plane p (an arched head stops the plain pane at the springing; the arch is filled below)
      const P = (u, y) => (dir === 'x' ? [u, y, p] : [p, y, u]);
      b.quad(gm, P(a, gy0), P(c, gy0), P(c, rise ? ys : gy1), P(a, rise ? ys : gy1), { col: [1, 1, 1] });
    };
    if (w.kind === 'louvre') {
      pane(gu0, gu1, pF + s * 0.03);                                           // glass behind the slats: slats alone leave the room open to the street
      const n = Math.max(3, Math.floor((gy1 - gy0) / 0.075));
      for (let i = 0; i < n; i++) wbox(b, 'frame_paint', dir, uc, gy0 + ((i + 0.5) * (gy1 - gy0)) / n, pF, gu1 - gu0, 0.014, 0.07, mulc(frameCol, 0.85), hid(dir, 'u-', 'u+', 'y-'));   // slats: top and both faces
    } else if (w.kind === 'casement' || w.kind === 'sliding') {
      wbox(b, 'frame_paint', dir, uc, (gy0 + gy1) / 2, pF, 0.045, gy1 - gy0, DEPTH, frameCol, hid(dir, 'y-', 'y+'));        // the mullion runs from the sill bar to the head
      if (w.kind === 'sliding') { pane(gu0, uc, pF - s * 0.012); pane(uc, gu1, pF + s * 0.012); } else { pane(gu0, uc - 0.02, pF); pane(uc + 0.02, gu1, pF); }
      if (h > 1.35) wbox(b, 'frame_paint', dir, uc, y0 + h * 0.72, pF, gu1 - gu0, 0.035, DEPTH, frameCol, hid(dir, 'u-', 'u+'));   // the transom runs from post to post
    } else {
      pane(gu0, gu1, pF);
      if (rise) {                                                              // the glass of the round head: a fan from the middle of the springing line
        const g = archPts(gu0, gu1, gy1, rise - FRAME), want = dir === 'x' ? [0, 0, 1] : [-1, 0, 0];
        for (let i = 0; i + 1 < g.length; i++) triFacing(b, gm, at3(uc, ys, pF), at3(g[i][0], g[i][1], pF), at3(g[i + 1][0], g[i + 1][1], pF), want, { col: [1, 1, 1] });
      }
      if (ww > 1.7) wbox(b, 'frame_paint', dir, uc, (gy0 + gy1) / 2, pF, 0.04, gy1 - gy0, DEPTH, frameCol, hid(dir, 'y-', 'y+'));
    }
    // wrought-iron grille just inside the outer face, one of four patterns (reja.js)
    if (w.grille) {
      const pg = pOut - s * 0.04;
      buildReja(b, 'grille_iron', (u, y, k) => at3(u, y, pg + s * 0.0015 * k), dir === 'x' ? [0, 0, s] : [s, 0, 0], { u0: uc - ww / 2 - 0.03, u1: uc + ww / 2 + 0.03, y0: y0 - 0.04, y1: y1 + 0.04 }, rejaPattern(bp.id, w), fs.metal);
    }
    // exterior sill + painted surround
    wbox(b, 'concrete_bare', dir, uc, y0 - 0.025, pOut + s * 0.03, ww + 0.16, 0.05, 0.11, [0.93, 0.92, 0.9], hid(dir, s > 0 ? 'a-' : 'a+'));   // five faces: the sixth lies 25 mm inside the wall
    if (w.kind !== 'fixed' && hv(2) < 0.75) {                                   // a painted band 14 mm proud of the wall: its face only (the slab edges are a pixel wide at 8 m)
      const sc = hv(3) < 0.5 ? mulc(fs.trim, 1) : lin(0xf2efe6), bw = 0.085, pp = pOut + s * 0.014, want = dir === 'x' ? [0, 0, s] : [s, 0, 0], A = wp(dir);
      for (const [ua, ub, ya, yb] of [[uc - ww / 2 - bw, uc - ww / 2, y0 - bw, y1 + bw], [uc + ww / 2, uc + ww / 2 + bw, y0 - bw, y1 + bw], [uc - ww / 2, uc + ww / 2, y1, y1 + bw]]) qd(b, 'frame_paint', A(ua, ya, pp), A(ub, ya, pp), A(ub, yb, pp), A(ua, yb, pp), want, { col: sc });
    }
    if (rise) {                                                                 // a whitewashed band round the round head, as on the portal
      const bw = 0.085, pp = pOut + s * 0.014, sc = lin(0xf2efe6), want = dir === 'x' ? [0, 0, s] : [s, 0, 0];
      const inn = archPts(uc - ww / 2, uc + ww / 2, y1, rise), out = archPts(uc - ww / 2 - bw, uc + ww / 2 + bw, y1 + bw, rise + bw);
      for (let i = 0; i + 1 < inn.length; i++) qd(b, 'frame_paint', at3(inn[i][0], inn[i][1], pp), at3(inn[i + 1][0], inn[i + 1][1], pp), at3(out[i + 1][0], out[i + 1][1], pp), at3(out[i][0], out[i][1], pp), want, { col: sc });
      for (const sd of [-1, 1]) {                                               // and the strips down both jambs, from the sill to the springing
        const ua = sd < 0 ? uc - ww / 2 - bw : uc + ww / 2, ub = ua + bw;
        qd(b, 'frame_paint', at3(ua, y0, pp), at3(ub, y0, pp), at3(ub, ys, pp), at3(ua, ys, pp), want, { col: sc });
      }
    }
  }
}

/** Casings around doors, shutter housings, and the entry step outside ground-floor doors. */
export function buildDoorFrames(G) {
  const { S, b, bp, fs } = G, te = S.te;
  for (const d of bp.doors) {
    const dir = d.wall.dir, t = d.wall.t, at = d.wall.at, uc = dir === 'x' ? d.x : d.z, yk = d.floor * S.fh;
    if (d.kind === 'arch') continue;
    const cw = 0.075, dp = 0.016;
    const faces = d.ext ? [OUT[d.side]] : [1, -1];
    for (const sd of faces) {
      const col = d.ext ? (d.kind === 'shutter' ? mulc(fs.metal, 1) : mulc(fs.trim, 1)) : (sd > 0 ? lin(0xeee8da) : lin(0xe6dfd0));
      const m = 'frame_paint', A = wp(dir), p0 = at + sd * (t / 2), pf = p0 + sd * dp, ua = uc - d.w / 2, ub = uc + d.w / 2, yt = yk + d.h;
      const look = dir === 'x' ? [0, 0, sd] : [sd, 0, 0], inward = dir === 'x' ? [1, 0, 0] : [0, 0, 1];
      // a casing is a 16 mm band: the three bars (two jambs and the head over both) as faces, plus the three edges that look into the opening (a jamb's side, the head's soffit)
      for (const [u0, u1, y0, y1] of [[ua - cw, ua, yk, yt], [ub, ub + cw, yk, yt], [ua - cw, ub + cw, yt, yt + cw]]) qd(b, m, A(u0, y0, pf), A(u1, y0, pf), A(u1, y1, pf), A(u0, y1, pf), look, { col });
      qd(b, m, A(ua, yk, p0), A(ua, yk, pf), A(ua, yt, pf), A(ua, yt, p0), inward, { col });
      qd(b, m, A(ub, yk, p0), A(ub, yk, pf), A(ub, yt, pf), A(ub, yt, p0), [-inward[0], 0, -inward[2]], { col });
      qd(b, m, A(ua, yt, p0), A(ub, yt, p0), A(ub, yt, pf), A(ua, yt, pf), [0, -1, 0], { col });
    }
    if (d.kind === 'shutter') shutterFrame(G, d, G.shopLook());              // the housing of the shop's look: cassette and rails, lintel box, or plastered surround
  }
}

/** A concrete step in front of ground-floor doors whose outside ground is below the sill (data from plan: S.steps). */
export function buildEntrySteps(G) {
  const { S, b } = G;
  for (const st of S.steps ?? []) {
    const r = st.rect, h = st.y1 - st.y0;
    if (h < 0.02) continue;
    b.box('concrete_bare', (r.x0 + r.x1) / 2, st.y0 + h / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, h, r.z1 - r.z0, { col: [0.9, 0.9, 0.88] });
  }
  for (const p of S.platforms ?? []) {                                                  // a stage: a plank deck on the room's own floor
    const r = p.rect, y0 = p.floor * S.fh;
    b.box('wood_pine', (r.x0 + r.x1) / 2, y0 + p.h / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, p.h, r.z1 - r.z0, { col: [0.62, 0.44, 0.3] });
  }
}
