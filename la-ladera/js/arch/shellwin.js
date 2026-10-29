// Windows (frame, glass, iron grille, sill, painted surround) and the static parts of doors (casings, shutter housings, entry steps).
// The openings themselves (reveals) are cut by shell.js; door LEAVES are live objects in doors.js.
import { lin, mulc, mixc, qd, hash01, OUT, wbox } from './mb.js';

const FRAME = 0.05, DEPTH = 0.07;
/** The box face that lies against the wall (never seen): wall running along `dir`, element sitting on the side that looks `s`. */
const back = (dir, s) => (dir === 'x' ? (s > 0 ? 'nz' : 'pz') : (s > 0 ? 'nx' : 'px'));

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
    // frame
    wbox(b, 'frame_paint', dir, uc - ww / 2 + FRAME / 2, (y0 + y1) / 2, pF, FRAME, h, DEPTH, frameCol);
    wbox(b, 'frame_paint', dir, uc + ww / 2 - FRAME / 2, (y0 + y1) / 2, pF, FRAME, h, DEPTH, frameCol);
    wbox(b, 'frame_paint', dir, uc, y1 - FRAME / 2, pF, ww - 2 * FRAME, FRAME, DEPTH, frameCol);
    wbox(b, 'frame_paint', dir, uc, y0 + FRAME / 2, pF, ww - 2 * FRAME, FRAME, DEPTH, frameCol);
    const gu0 = uc - ww / 2 + FRAME, gu1 = uc + ww / 2 - FRAME, gy0 = y0 + FRAME, gy1 = y1 - FRAME;
    const lit = hv(7) < (k === 0 ? 0.25 : 0.4);
    const gm = lit ? 'window_lit' : 'glass';
    const pane = (a, c, p) => {                                               // a glass pane between u=a..c at plane p
      const P = (u, y) => (dir === 'x' ? [u, y, p] : [p, y, u]);
      b.quad(gm, P(a, gy0), P(c, gy0), P(c, gy1), P(a, gy1), { col: [1, 1, 1] });
    };
    if (w.kind === 'louvre') {
      const n = Math.max(3, Math.floor((gy1 - gy0) / 0.075));
      for (let i = 0; i < n; i++) wbox(b, 'frame_paint', dir, uc, gy0 + ((i + 0.5) * (gy1 - gy0)) / n, pF, gu1 - gu0, 0.014, 0.07, mulc(frameCol, 0.85), ['ny']);
    } else if (w.kind === 'casement' || w.kind === 'sliding') {
      wbox(b, 'frame_paint', dir, uc, (gy0 + gy1) / 2, pF, 0.045, gy1 - gy0, DEPTH, frameCol);
      if (w.kind === 'sliding') { pane(gu0, uc, pF - s * 0.012); pane(uc, gu1, pF + s * 0.012); } else { pane(gu0, uc - 0.02, pF); pane(uc + 0.02, gu1, pF); }
      if (h > 1.35) wbox(b, 'frame_paint', dir, uc, y0 + h * 0.72, pF, gu1 - gu0, 0.035, DEPTH, frameCol);
    } else {
      pane(gu0, gu1, pF);
      if (ww > 1.7) wbox(b, 'frame_paint', dir, uc, (gy0 + gy1) / 2, pF, 0.04, gy1 - gy0, DEPTH, frameCol);
    }
    // wrought-iron grille just inside the outer face
    if (w.grille) {
      const pg = pOut - s * 0.04, gc = fs.metal;
      const n = Math.max(3, Math.round((ww + 0.06) / 0.11));
      for (let i = 0; i <= n; i++) wbox(b, 'grille_iron', dir, uc - ww / 2 - 0.03 + ((ww + 0.06) * i) / n, (y0 + y1) / 2, pg, 0.014, h + 0.08, 0.014, gc, ['py', 'ny']);
      for (const yy of [y0 - 0.03, y1 + 0.03, (y0 + y1) / 2]) wbox(b, 'grille_iron', dir, uc, yy, pg, ww + 0.1, 0.022, 0.022, gc);
    }
    // exterior sill + painted surround
    wbox(b, 'concrete_bare', dir, uc, y0 - 0.025, pOut + s * 0.03, ww + 0.16, 0.05, 0.11, [0.93, 0.92, 0.9]);
    if (w.kind !== 'fixed' && hv(2) < 0.75) {
      const sc = hv(3) < 0.5 ? mulc(fs.trim, 1) : lin(0xf2efe6), bw = 0.085, dp = 0.014, pp = pOut + s * dp / 2;
      wbox(b, 'frame_paint', dir, uc - ww / 2 - bw / 2, (y0 + y1) / 2, pp, bw, h + 2 * bw, dp, sc, [back(dir, s)]);
      wbox(b, 'frame_paint', dir, uc + ww / 2 + bw / 2, (y0 + y1) / 2, pp, bw, h + 2 * bw, dp, sc, [back(dir, s)]);
      wbox(b, 'frame_paint', dir, uc, y1 + bw / 2, pp, ww, bw, dp, sc, [back(dir, s)]);
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
      const pp = at + sd * (t / 2 + dp / 2);
      const col = d.ext ? (d.kind === 'shutter' ? mulc(fs.metal, 1) : mulc(fs.trim, 1)) : (sd > 0 ? lin(0xeee8da) : lin(0xe6dfd0));
      const m = 'frame_paint';
      wbox(b, m, dir, uc - d.w / 2 - cw / 2, yk + d.h / 2, pp, cw, d.h, dp, col, [back(dir, sd)]);
      wbox(b, m, dir, uc + d.w / 2 + cw / 2, yk + d.h / 2, pp, cw, d.h, dp, col, [back(dir, sd)]);
      wbox(b, m, dir, uc, yk + d.h + cw / 2, pp, d.w + 2 * cw, cw, dp, col, [back(dir, sd)]);
    }
    if (d.kind === 'shutter') {                                              // roll-up cassette above the opening
      const s = OUT[d.side], pc = at + s * (t / 2 + 0.09);
      wbox(b, 'shutter_steel', dir, uc, yk + d.h + 0.16, pc, d.w + 0.2, 0.3, 0.2, [0.85, 0.87, 0.88]);
    }
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
}
