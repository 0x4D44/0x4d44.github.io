// How well do the people walk and move? The measuring and scoring half of research/people-motion-rubric.md: pure functions from a RECORDING (world-space body
// landmarks, every frame, from tools/people_motion.html) to measurements, and from measurements to 0-10 scores. Nothing here knows how the motion was made - it takes the
// recording of the old clip-driven walk and of the procedural one alike - and the targets are published normative gait data, never the generator's own parameters.
//
// A recording: { dt, n, names:[...LM], pos:[x,y,z per landmark per frame], root:[x,y,z per frame], yaw, v, state, seg, floor, info:{hipY, hipHalf, ...} }
// y is up; a character faces -z at yaw 0, so its right is +x. The body frame of an analysis comes from the direction of TRAVEL (F forward, R right, U up), not from the
// model's own yaw, so a walker that crabs or drifts is judged by where it goes.
export const LM = ['pelvis', 'spine_01', 'spine_03', 'neck_01', 'head', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r',
  'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r', 'heel_l', 'heel_r', 'toe_l', 'toe_r', 'bs_l', 'bs_r', 'nose'];
const DEG = 180 / Math.PI;
export const NOSE_REST_PITCH = Math.atan2(0.04, 0.12) * DEG;   // the recorder's nose point sits 4 cm up and 12 cm forward of the head bone: that is a level gaze
export const CONTACT_M = 0.008;                                 // a sole point within 8 mm of the floor is on it: standing on it as the eye reads it (slip, flight, clearance)
export const LOAD_M = 0.002;                                    // within 2 mm of it the shoe is carrying weight, as a force plate or foot switch reads it (stance share, double support)

// ------------------------------------------------------------------------------------------------------------------------ scenarios
export const SPEEDS = [0.4, 0.8, 1.2, 1.6, 1.9];            // steady walks (m/s)
export const NORMAL = [0.8, 1.2, 1.6];                      // the everyday range the kinematic categories are judged at
export const SCEN = {
  // A slow walk (0.4 m/s) needs a longer window than its pace to hold the three strides the repeatability item wants. At the everyday speeds the window is 17 s (14 to 21 strides a foot): the
  // variability items (TIM.cvT, TIM.cvL) estimate a spread of about 2 % from the strides in the window, and from the 7 s (5-8 strides) this scenario had until revision 10 that estimate is itself
  // 25-30 % uncertain - a perfectly good walk would have fallen under the band's floor on one recording in ten for nothing but sampling error.
  steady: (v) => (v < 0.6 ? { plan: [{ dur: 1.0, v: 0, state: 'stand' }, { dur: 13, v, state: 'walk' }], win: [3.5, 14] } : { plan: [{ dur: 1.0, v: 0, state: 'stand' }, { dur: 23, v, state: 'walk' }], win: [7, 24] }),
  startstop: () => ({ plan: [{ dur: 1.2, v: 0, state: 'stand' }, { dur: 7.0, v: 1.2, state: 'walk', to: 6.5 }, { dur: 2.5, v: 0 }], win: [0, 10.7] }),
  turn: (deg) => ({ plan: [{ dur: 1.0, v: 0, state: 'stand' }, { dur: 5.0, v: 1.2, state: 'walk' }, { dur: 4.0, v: 1.2, turn: deg }], win: [6, 10] }),
  spin: (deg) => ({ plan: [{ dur: 1.5, v: 0, state: 'stand' }, { dur: 3.5, v: 0, turn: deg }], win: [1.5, 5] }),
};

// ------------------------------------------------------------------------------------------------------------------------ small numerics
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const fall = (x, good, bad) => (Number.isFinite(x) ? 10 * clamp((bad - x) / (bad - good), 0, 1) : 0);              // 10 at <= good, 0 at >= bad
export const rise = (x, bad, good) => (Number.isFinite(x) ? 10 * clamp((x - bad) / (good - bad), 0, 1) : 0);              // 0 at <= bad, 10 at >= good
export const band = (x, lo, hi, zlo, zhi) => (!Number.isFinite(x) ? 0 : x < lo ? 10 * clamp((x - zlo) / (lo - zlo), 0, 1) : x > hi ? 10 * clamp((zhi - x) / (zhi - hi), 0, 1) : 10);
const mean = (a) => { let s = 0, n = 0; for (const x of a) if (Number.isFinite(x)) { s += x; n++; } return n ? s / n : NaN; };
const rms = (a) => (a.length ? Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length) : NaN);
const pct = (a, p) => { const b = Float64Array.from(a).sort(); return b.length ? b[clamp(Math.round(p * (b.length - 1)), 0, b.length - 1)] : NaN; };
const pp = (a) => { if (!a || !a.length) return NaN; let lo = Infinity, hi = -Infinity; for (const x of a) { if (x < lo) lo = x; if (x > hi) hi = x; } return hi - lo; };
const mx = (a) => { let m = -Infinity; for (const x of a) if (x > m) m = x; return m; };
const mn = (a) => { let m = Infinity; for (const x of a) if (x < m) m = x; return m; };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; } return saa > 1e-12 && sbb > 1e-12 ? sab / Math.sqrt(saa * sbb) : 0; };
const smooth = (a, w) => { const n = a.length, o = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { s += a[j]; c++; } o[i] = s / c; } return o; };
function resample(sig, k0, k1, m = 101) { const o = new Array(m); for (let i = 0; i < m; i++) { const x = k0 + (k1 - k0) * i / (m - 1), a = Math.floor(x), b = Math.min(sig.length - 1, a + 1), f = x - a; o[i] = sig[a] * (1 - f) + sig[b] * f; } return o; }
// share of an oscillation's power (mean removed) that sits in harmonic h of a signal repeating every `per` samples
function harmonic(sig, per, h) { const n = sig.length, m = mean(sig); let c = 0, s = 0, tot = 0; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * h * i / per, d = sig[i] - m; c += d * Math.cos(a); s += d * Math.sin(a); tot += d * d; } tot /= n; return tot > 1e-14 ? (c * c + s * s) * 2 / (n * n) / tot : 0; }
const unwrap = (a) => { const o = new Float64Array(a.length); let off = 0; for (let i = 0; i < a.length; i++) { if (i && Math.abs(a[i] - a[i - 1]) > Math.PI) off -= 2 * Math.PI * Math.sign(a[i] - a[i - 1]); o[i] = a[i] + off; } return o; };
// the spread of a repeated quantity as a percentage of its mean. Every list is taken about ITS OWN mean (a left/right difference is judged by the symmetry items, not here) and the lists
// are pooled with (samples - lists) degrees of freedom; NaN with fewer than two degrees of freedom
const pooledCV = (lists) => { let ss = 0, df = 0, sum = 0, cnt = 0; for (const l of lists) { if (l.length < 2) continue; const m = mean(l); for (const x of l) ss += (x - m) ** 2; df += l.length - 1; sum += l.reduce((s, x) => s + x, 0); cnt += l.length; } return df >= 2 && sum > 0 ? 100 * Math.sqrt(ss / df) / (sum / cnt) : NaN; };
// a sampled signal at a fractional index (linear), clamped to its ends
const atF = (arr, x) => { const i = Math.max(0, Math.min(arr.length - 1, Math.floor(x))), j = Math.min(arr.length - 1, i + 1), f = Math.max(0, Math.min(1, x - i)); return arr[i] * (1 - f) + arr[j] * f; };

// ------------------------------------------------------------------------------------------------------------------------ the recording
export class Rec {
  constructor(raw) { Object.assign(this, raw); this.L = raw.names.length; this.ix = Object.fromEntries(raw.names.map((n, i) => [n, i])); this._s = {}; }
  /** one landmark as three typed arrays {x,y,z} over all frames */
  s(name) {
    let c = this._s[name]; if (c) return c; const i = this.ix[name]; if (i == null) throw new Error('no landmark ' + name);
    const x = new Float64Array(this.n), y = new Float64Array(this.n), z = new Float64Array(this.n);
    for (let k = 0; k < this.n; k++) { const o = (k * this.L + i) * 3; x[k] = this.pos[o]; y[k] = this.pos[o + 1]; z[k] = this.pos[o + 2]; }
    return (this._s[name] = { x, y, z });
  }
  /** the root's ground speed per frame (m/s), by differencing over +-w frames */
  speed(w = 3) { const o = new Float64Array(this.n); for (let k = 0; k < this.n; k++) { const a = Math.max(0, k - w), b = Math.min(this.n - 1, k + w); o[k] = Math.hypot(this.root[b * 3] - this.root[a * 3], this.root[b * 3 + 2] - this.root[a * 3 + 2]) / ((b - a) * this.dt || 1); } return o; }
}
function bodyFrame(rec, k0, k1) {   // k1 is one past the window: the last frame in it is k1 - 1
  const kk = k1 - 1; let dx = rec.root[kk * 3] - rec.root[k0 * 3], dz = rec.root[kk * 3 + 2] - rec.root[k0 * 3 + 2]; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  return { fx: dx, fz: dz, rx: -dz, rz: dx, speed: d / ((kk - k0) * rec.dt) };
}
/** body-frame projections of landmarks over [k0,k1): get(name) -> { f: forward coord, r: rightward coord, y: height } */
function proj(rec, fr, k0, k1) {
  const cache = {};
  return (nm) => { let c = cache[nm]; if (c) return c; const s = rec.s(nm), n = k1 - k0, f = new Float64Array(n), r = new Float64Array(n), y = new Float64Array(n); for (let i = 0; i < n; i++) { f[i] = s.x[k0 + i] * fr.fx + s.z[k0 + i] * fr.fz; r[i] = s.x[k0 + i] * fr.rx + s.z[k0 + i] * fr.rz; y[i] = s.y[k0 + i]; } return (cache[nm] = { f, r, y }); };
}
const sagAng = (df, du) => Math.atan2(df, -du) * DEG;   // angle of a segment from straight down, + = forward

// ------------------------------------------------------------------------------------------------------------------------ gait events
// Zeni, Richards & Higginson (2008): a foot is at heel strike when it is furthest AHEAD of the pelvis, at toe-off when it is furthest BEHIND. Kinematic, so a foot that
// skates or floats is segmented the same way as one that is planted - the floor is judged separately, by contactOf / slipOf.
// hsF / toF are the same events to a fraction of a frame (the vertex of the parabola through the extremum and its two neighbours), for the items that are about TIME to a fraction of a
// percent - stride-time variability above all: at 60 Hz one frame is 1.5 % of a 1.1 s stride, so integer events read a perfectly regular walk as 0.5-1 % variable (the round-1 reviewer's
// 0-1.05 % was exactly that).
const vertexAt = (s, i) => { if (i <= 0 || i >= s.length - 1) return i; const a = s[i - 1], b = s[i], c = s[i + 1], d = a - 2 * b + c; return Math.abs(d) < 1e-12 ? i : i + clamp(0.5 * (a - c) / d, -1, 1); };
export function zeniEvents(g, dt) {
  const n = g.length, s = smooth(g, Math.max(1, Math.round(0.03 / dt))), m = mean(s), ups = [], gap = Math.round(0.4 / dt);
  for (let i = 1; i < n; i++) if (s[i - 1] < m && s[i] >= m && (!ups.length || i - ups[ups.length - 1] > gap)) ups.push(i);
  const hs = [], to = [], hsF = [], toF = [];
  for (let c = 0; c + 1 < ups.length; c++) { const a = ups[c], b = ups[c + 1]; let imax = a, imin = a; for (let i = a; i < b; i++) { if (s[i] > s[imax]) imax = i; if (s[i] < s[imin]) imin = i; } if (imin > imax) { hs.push(imax); to.push(imin); hsF.push(vertexAt(s, imax)); toF.push(vertexAt(s, imin)); } }
  return { hs, to, hsF, toF };
}

// ------------------------------------------------------------------------------------------------------------------------ floor contact
// WHAT THE FOOT STANDS ON. Contact and slip are judged on the RENDERED shoe when the recording carries it (rec.shoe: per foot, the lowest skinned vertex of the shoe mesh at each frame and
// the horizontal speed of that very vertex - tools/people_motion.html), and on the three sole landmarks (heel, ball of the foot, toe tip: points carried by the foot bones at the
// character's nominal sole) otherwise. The first versions of these items used the landmarks always, which was fair while the gait stood the landmarks on the floor; it stopped being
// fair when the gait began to stand the shoe itself there (gait.footProfile): a rocker sole's real contact point is not any of the three landmarks, which then hang several mm
// under the floor in terminal stance and drag across it while the actual shoe is planted and still. The landmark figures are still computed (slipLm, clearLm) and reported.
const useMesh = (rec, src) => (src || (rec.shoe ? 'mesh' : 'landmarks')) === 'mesh';
function contactOf(rec, k0, k1, src) {   // heights are measured from the real floor (the recorder's y = rec.floor): a foot sunk into it is in contact, and the sinking is judged by GRD.sink
  const sole = {}, c = {}, n = k1 - k0, fl = rec.floor || 0, mesh = useMesh(rec, src);
  for (const s of ['l', 'r']) {
    sole[s] = new Float64Array(n);
    if (mesh) for (let i = 0; i < n; i++) sole[s][i] = rec.shoe[s].y[k0 + i] - fl;
    else { const h = rec.s('heel_' + s), b = rec.s('bs_' + s), t = rec.s('toe_' + s); for (let i = 0; i < n; i++) sole[s][i] = Math.min(h.y[k0 + i], b.y[k0 + i], t.y[k0 + i]) - fl; }
  }
  const ld = {}; for (const s of ['l', 'r']) { c[s] = Array.from(sole[s], (y) => y < CONTACT_M); ld[s] = Array.from(sole[s], (y) => y < LOAD_M); }
  return { sole, c, ld };
}
/** RMS horizontal speed (cm/s) of the sole while it is on the floor and not lifting; and the path (cm) the worst one covers in that time.
 *  On the rendered shoe: the point of each shoe that is lowest at a frame (its own speed, not the foot's). On the landmarks: every one of the three per foot that is within CONTACT_M. */
function slipOf(rec, k0, k1, src) {
  const sp = [], fl = rec.floor || 0; let pathMax = 0;
  const one = (y, v) => {   // y(k): height of the point, v(k): its horizontal speed (m/s)
    let pl = 0;
    for (let k = Math.max(k0, 1); k < Math.min(k1, rec.n - 1); k++) {
      const vy = (y(k + 1) - y(k - 1)) / (2 * rec.dt); if (y(k) - fl > CONTACT_M || Math.abs(vy) > 0.12) continue;
      const w = v(k); sp.push(w * 100); pl += w * rec.dt * 100;
    }
    pathMax = Math.max(pathMax, pl);
  };
  if (useMesh(rec, src)) for (const s of ['l', 'r']) { const S = rec.shoe[s]; one((k) => S.y[k], (k) => S.v[k]); }
  else for (const s of ['l', 'r']) for (const lm of ['heel_', 'bs_', 'toe_']) { const S = rec.s(lm + s); one((k) => S.y[k], (k) => Math.hypot(S.x[k + 1] - S.x[k - 1], S.z[k + 1] - S.z[k - 1]) / (2 * rec.dt)); }
  return { rms: sp.length >= 8 ? rms(sp) : NaN, n: sp.length, pathMax };
}

// ------------------------------------------------------------------------------------------------------------------------ expected values (normative; see the rubric)
// CADENCE AGAINST SPEED comes from the WALK RATIO - step length over cadence, about 0.006 m per (step/min) for healthy adults and roughly constant from a stroll to a brisk walk -
// and not from a table of steps/min that the gait also holds. (Round 1 scored STR against the very table the gait was built from, which the independent review rightly called
// circular: it could only catch a bug in carrying the table out, never a wrong table.) Step length = WR x cadence and speed = step length x cadence / 60 give cadence = sqrt(60 v / WR).
// I met the 0.006 in a 2023 review that cites Sekiya (1996), Zijlstra (2008) and Bogen (2018); those papers I did not read, and the figure is reported to the second significant
// digit only, so STR is a coarse check of the stride against the speed (js/sim/motion.test.mjs holds the gait's table to within 4 % of it, both ways).
export const WALK_RATIO = 0.006;
/** what a healthy adult does at ground speed v (m/s) with a hip joint hipY (m) off the floor. Dynamic similarity: speeds scale with sqrt(leg length), cadence with 1/sqrt(leg length) */
export function expected(v, hipY) {
  const L = hipY || 0.92, s = Math.sqrt(0.92 / L), ve = v * s, cad = Math.sqrt(60 * Math.max(ve, 0.05) / WALK_RATIO) * s;
  return { ve, cadence: cad, stepLen: v * 60 / cad, hipRange: 26 + 13 * ve, kneeSwing: 48 + 11 * ve, armRange: 12 + 19 * ve, bob: 0.040 * Math.pow(Math.max(ve, 0.05) / 1.2, 1.1) * L / 0.92, stance: 61 - 6.4 * (ve - 1.2), ds: 22 - 6 * (ve - 1.2) };
}

// ------------------------------------------------------------------------------------------------------------------------ the steady-walk analysis
export function analyseSteady(rec, win) {
  const k0 = Math.max(0, Math.round(win[0] / rec.dt)), k1 = Math.min(rec.n, Math.round(win[1] / rec.dt)), n = k1 - k0, fr = bodyFrame(rec, k0, k1), P = proj(rec, fr, k0, k1), dt = rec.dt;
  const hipY = rec.info.hipY, a = { v: fr.speed, hipY, ok: true }; a.ex = expected(fr.speed, hipY);
  // ---- the floor
  // The sole is judged on the RENDERED shoe when the recording carries it (rec.shoeY: the lowest skinned vertex of both shoes, every frame - tools/people_motion.html), and on the
  // sole landmarks otherwise. The landmarks are the gait's own model of the foot, the very points its IK plants, so a walker could score 0.0 mm of sink while the shoe it draws dips
  // 7-10 mm into the floor (the first version of this metric did exactly that): the mesh is the witness that does not share the gait's assumptions.
  const ct = contactOf(rec, k0, k1), fl = rec.floor || 0;
  const low = rec.shoeY ? Float64Array.from({ length: n }, (_, i) => rec.shoeY[k0 + i] - fl) : Float64Array.from(ct.sole.l, (y, i) => Math.min(y, ct.sole.r[i]));   // low: the lower foot, per frame
  a.floorFrom = rec.shoeY ? 'mesh' : 'landmarks';
  a.sinkMm = Math.max(0, -mn(low)) * 1000;
  a.noContactPct = 100 * mean(Array.from(low, (y) => (y > CONTACT_M ? 1 : 0)));
  a.floatMm = pct(Array.from(low, (y) => Math.max(0, y)), 0.5) * 1000;   // a walker that hovers has its lower foot off the floor all the time
  const sl = slipOf(rec, k0, k1); a.slip = sl.rms; a.slipN = sl.n; a.contactFrom = rec.shoe ? 'mesh' : 'landmarks';
  if (rec.shoe) a.slipLm = slipOf(rec, k0, k1, 'landmarks').rms;   // what the three nominal sole landmarks would have said (not scored)
  { const hl = P('thigh_l').y, hr = P('thigh_r').y; a.hipRel = mean(Array.from(hl, (y, i) => (y + hr[i]) / 2)) / hipY; }
  // ---- cycles from the feet's position relative to the pelvis
  const ev = {}; for (const s of ['l', 'r']) { const f = P('foot_' + s).f, pf = P('pelvis').f; ev[s] = zeniEvents(Float64Array.from(f, (x, i) => x - pf[i]), dt); }
  a.cycles = Math.min(ev.l.hs.length, ev.r.hs.length);
  if (ev.l.hs.length < 2 || ev.r.hs.length < 2) { a.ok = false; a.reason = 'fewer than two strides found (' + ev.l.hs.length + ' left, ' + ev.r.hs.length + ' right)'; return a; }
  // Steps are timed, measured and (for the width) placed at the heel strikes to a fraction of a frame, with the heel's position read between the two frames either side (hsF): at 60 Hz one
  // frame is 1.5 % of a stride, and the heel is still travelling 2 cm a frame when Zeni's event fires, so integer events would read a perfectly regular walk as 1 % variable.
  const hsAll = [...ev.l.hsF.map((x) => [x, 'l']), ...ev.r.hsF.map((x) => [x, 'r'])].sort((p, q) => p[0] - q[0]), stepT = { l: [], r: [] }, stepL = { l: [], r: [] }, stepW = { l: [], r: [] };
  for (let i = 1; i < hsAll.length; i++) if (hsAll[i][1] !== hsAll[i - 1][1]) {
    const [xa, sa] = hsAll[i], [xb, sb] = hsAll[i - 1], ha = P('heel_' + sa), hb = P('heel_' + sb);
    stepT[sa].push((xa - xb) * dt); stepL[sa].push(Math.abs(atF(ha.f, xa) - atF(hb.f, xb)));
    const wa = atF(ha.r, xa), wb = atF(hb.r, xb); stepW[sa].push(sa === 'r' ? wa - wb : wb - wa);   // step width: sideways between the two heels, + = the landing heel is on its own side of the one before it, - = it has crossed over
  }
  const all = (o) => o.l.concat(o.r);
  a.stepTime = mean(all(stepT)); a.cadence = 60 / a.stepTime; a.stepLen = mean(all(stepL));
  a.symStepTime = 100 * Math.abs(mean(stepT.l) - mean(stepT.r)) / mean(all(stepT)); a.symStepLen = 100 * Math.abs(mean(stepL.l) - mean(stepL.r)) / mean(all(stepL));
  a.stepWidth = mean(all(stepW)); a.crossPct = 100 * mean(all(stepW).map((w) => (w < 0 ? 1 : 0)));
  { const per = { l: [], r: [] }; for (const s of ['l', 'r']) for (let i = 1; i < ev[s].hsF.length; i++) per[s].push((ev[s].hsF[i] - ev[s].hsF[i - 1]) * dt); a.strideTime = mean(all(per)); a.strideTimeCV = pooledCV([per.l, per.r]); a.stepLenCV = pooledCV([stepL.l, stepL.r]); }   // variability: the stride time (the standard measure) and the step length, each left/right list about its own mean
  const stance = { l: new Uint8Array(n), r: new Uint8Array(n) }; let span0 = n, span1 = 0;   // stance share and double support, from the events
  for (const s of ['l', 'r']) for (let i = 0; i < ev[s].hs.length; i++) { for (let k = ev[s].hs[i]; k < ev[s].to[i]; k++) stance[s][k] = 1; span0 = Math.min(span0, ev[s].hs[i]); span1 = Math.max(span1, ev[s].to[i]); }
  { let st = 0, dsN = 0, tot = 0; for (let k = span0; k < span1; k++) { tot++; if (stance.l[k] && stance.r[k]) dsN++; st += stance.l[k] + stance.r[k]; } a.stanceZ = 100 * st / (2 * tot); a.dsZ = 100 * dsN / tot; }   // from Zeni's events: reported, not scored (see below)
  // STANCE AND DOUBLE SUPPORT are scored from the floor: the share of the window in which the rendered shoe is within LOAD_M of it (one foot: stance; both: double support). The published
  // figures the bands come from are force-plate and foot-switch times - the foot carrying weight - and Zeni's events are a kinematic stand-in for those that over-reads both when the foot slows
  // against the pelvis before it lands. They were scored until revision 10 (a.stanceZ / a.dsZ, still computed). stanceC / dsC are the same shares at CONTACT_M (8 mm), reported: a foot 8 mm up
  // looks down but is not loaded, and at 1.2 m/s that threshold alone adds 2.5 points to stance and 5 to double support (research/people-motion-rubric.md, "Revision 10", has the table).
  { let s2 = 0, d2 = 0, s3 = 0, d3 = 0; for (let i = 0; i < n; i++) { s2 += (ct.c.l[i] ? 1 : 0) + (ct.c.r[i] ? 1 : 0); if (ct.c.l[i] && ct.c.r[i]) d2++; s3 += (ct.ld.l[i] ? 1 : 0) + (ct.ld.r[i] ? 1 : 0); if (ct.ld.l[i] && ct.ld.r[i]) d3++; }
    a.stanceC = 100 * s2 / (2 * n); a.dsC = 100 * d2 / n; a.stance = 100 * s3 / (2 * n); a.ds = 100 * d3 / n; }
  { const sh = (s) => mean(ev[s].hs.map((h, i) => { const nx = ev[s].hs[i + 1]; return nx ? (ev[s].to[i] - h) / (nx - h) : NaN; })); a.stanceSym = 100 * Math.abs(sh('l') - sh('r')); }
  const clearOf = (c) => { const cl = []; for (const s of ['l', 'r']) for (let i = 0; i < ev[s].to.length; i++) { const to = ev[s].to[i], nx = ev[s].hs[i + 1]; if (!nx) continue; let lo = Infinity; for (let k = to + Math.round(0.35 * (nx - to)); k <= to + Math.round(0.8 * (nx - to)); k++) lo = Math.min(lo, c.sole[s][k]); cl.push(lo); } return cl.length ? mean(cl) * 1000 : NaN; };
  a.clearMm = clearOf(ct); if (rec.shoe) a.clearLm = clearOf(contactOf(rec, k0, k1, 'landmarks'));
  // ---- joint angles in the sagittal plane of the direction of travel
  const seg = (A, B) => { const a1 = P(A), b1 = P(B); return { f: Float64Array.from(b1.f, (x, i) => x - a1.f[i]), u: Float64Array.from(b1.y, (y, i) => y - a1.y[i]) }; };
  const J = {};
  for (const s of ['l', 'r']) {
    const th = seg('thigh_' + s, 'calf_' + s), sk = seg('calf_' + s, 'foot_' + s), ua = seg('upperarm_' + s, 'lowerarm_' + s), fa = seg('lowerarm_' + s, 'hand_' + s), fk = seg('foot_' + s, 'calf_' + s);
    J['thigh_' + s] = Array.from(th.f, (f, i) => sagAng(f, th.u[i])); J['shank_' + s] = Array.from(sk.f, (f, i) => sagAng(f, sk.u[i]));
    J['knee_' + s] = J['thigh_' + s].map((t, i) => t - J['shank_' + s][i]);
    J['arm_' + s] = Array.from(ua.f, (f, i) => sagAng(f, ua.u[i])); J['fore_' + s] = Array.from(fa.f, (f, i) => sagAng(f, fa.u[i]));
    J['elbow_' + s] = J['fore_' + s].map((t, i) => t - J['arm_' + s][i]);
    const hp = P('heel_' + s), tp = P('bs_' + s);   // the rigid foot, heel to ball of the foot, toes up = + (the toes bend separately at push-off: heel to toe TIP would read a heel that is 60 degrees up as 30)
    J['pitch_' + s] = Array.from(hp.f, (f, i) => Math.atan2(tp.y[i] - hp.y[i], tp.f[i] - f) * DEG);
    J['ankle_' + s] = Array.from(fk.f, (f, i) => Math.atan2(f, fk.u[i]) * DEG + J['pitch_' + s][i]);   // shank lean + sole pitch: 0 standing, + dorsiflexion
  }
  const cyc = []; for (let i = 0; i + 1 < ev.l.hs.length; i++) cyc.push([ev.l.hs[i], ev.l.hs[i + 1]]);
  const ens = (x) => { const cs = cyc.map(([A, B]) => resample(x, A, B)); return { mean: cs[0].map((_, i) => mean(cs.map((c) => c[i]))), cycles: cs }; };
  const E = {}; for (const k of Object.keys(J)) E[k] = ens(J[k]); a.E = {}; for (const k of Object.keys(E)) a.E[k] = E[k].mean;
  { const th = E.thigh_l.mean, kn = E.knee_l.mean, an = E.ankle_l.mean, pi = E.pitch_l.mean, w2 = (x, p, q) => x.slice(Math.round(p), Math.round(q) + 1);
    a.hip = { range: pp(th), min: mn(th), max: mx(th) };
    a.knee = { loading: mx(w2(kn, 0, 30)), swing: mx(w2(kn, 55, 90)), stanceMin: mn(w2(kn, 15, 45)) };
    a.ankle = { dorsi: mx(w2(an, 10, 55)), plantar: mn(w2(an, 40, 75)) };
    a.hsPitch = mx(w2(pi, 0, 5)); }
  // ---- pelvis and trunk
  { const hl = P('thigh_l'), hr = P('thigh_r'), sl2 = P('upperarm_l'), sr = P('upperarm_r'), pel = P('pelvis'), pelY = Array.from(pel.y), pelR = Array.from(pel.r);
    const mxx = (n - 1) / 2, my = mean(pelR); let sxy = 0, sxx = 0; pelR.forEach((y, i) => { sxy += (i - mxx) * (y - my); sxx += (i - mxx) ** 2; }); const b = sxy / sxx, pelRd = pelR.map((y, i) => y - b * (i - mxx) - my);   // lateral position with the straight-line drift of the heading removed
    const pYaw = Array.from(hl.f, (_, i) => Math.atan2(hr.f[i] - hl.f[i], hr.r[i] - hl.r[i]) * DEG), pObl = Array.from(hl.f, (_, i) => Math.atan2(hr.y[i] - hl.y[i], hr.r[i] - hl.r[i]) * DEG);
    const tYaw = Array.from(hl.f, (_, i) => Math.atan2(sr.f[i] - sl2.f[i], sr.r[i] - sl2.r[i]) * DEG), per = a.strideTime / dt;
    const eY = ens(pelY), eR = ens(pelRd), eP = ens(pYaw), eO = ens(pObl), eT = ens(tYaw);
    a.pelvis = { bobPP: pp(eY.mean) * 1000, bobH2: harmonic(pelY, per, 2), swayPP: pp(eR.mean) * 1000, swayH1: harmonic(pelRd, per, 1), yawPP: pp(eP.mean), oblPP: pp(eO.mean), thoraxPP: pp(eT.mean), anti: corr(eP.mean, eT.mean) };
    a.trunk = { lean: mean(Array.from(pel.f, (_, i) => Math.atan2(P('neck_01').f[i] - pel.f[i], P('neck_01').y[i] - pel.y[i]) * DEG)) }; }
  // ---- arms
  { const rg = ['l', 'r'].map((s) => pp(E['arm_' + s].mean)), cr = ['l', 'r'].map((s) => corr(E['arm_' + s].mean, E['thigh_' + s].mean));
    a.arm = { rangeL: rg[0], rangeR: rg[1], range: mean(rg), sym: 100 * Math.abs(rg[0] - rg[1]) / mean(rg), corr: Math.max(cr[0], cr[1]), flexMean: mean([mean(J.elbow_l), mean(J.elbow_r)]), flexCouple: mean([corr(E.elbow_l.mean, E.arm_l.mean), corr(E.elbow_r.mean, E.arm_r.mean)]) };
    let m = Infinity; for (const s of ['l', 'r']) { const h = P('hand_' + s).r, p = P('pelvis').r; for (let i = 0; i < n; i++) m = Math.min(m, Math.abs(h[i] - p[i]) - (rec.info.hipHalf || 0.1)); } a.arm.clear = m;
    // splay: how far OUTSIDE its own shoulder the hand gets (95th percentile of the hand's sideways distance from the pelvis, less half the shoulder width): a hand that hangs from the shoulder stays
    // within a hand's width of that line; a chicken-wing or a boxer's stance does not, and nothing above (swing, phase, elbow) would notice
    { const ul = P('upperarm_l').r, ur = P('upperarm_r').r, p = P('pelvis').r, out = []; let sh = 0; for (let i = 0; i < n; i++) sh += Math.abs(ur[i] - ul[i]) / 2; sh /= n;
      for (const s of ['l', 'r']) { const h = P('hand_' + s).r; for (let i = 0; i < n; i++) out.push(Math.abs(h[i] - p[i])); }
      a.arm.splay = pct(out, 0.95) - sh; } }
  // ---- head
  { const nk = P('neck_01'), hp = P('head'), np = P('nose');
    const pitch = Array.from(hp.f, (_, i) => Math.atan2(np.y[i] - hp.y[i], Math.hypot(np.f[i] - hp.f[i], np.r[i] - hp.r[i])) * DEG - NOSE_REST_PITCH);
    const yaw = Array.from(np.f, (_, i) => Math.atan2(np.r[i] - hp.r[i], np.f[i] - hp.f[i]) * DEG), roll = Array.from(hp.f, (_, i) => Math.atan2(hp.r[i] - nk.r[i], hp.y[i] - nk.y[i]) * DEG);
    const pPP = pp(ens(pitch).mean), rPP = pp(ens(roll).mean), yPP = pp(ens(yaw).mean);
    // still: the three swings together (root sum of squares) - a head that does not move at all is as wrong as one that nods; poke: the neck bone from the vertical, + = the head is carried ahead of its base
    a.head = { pitchPP: pPP, rollPP: rPP, yawPP: yPP, pitchMean: mean(pitch), yawMean: Math.abs(mean(yaw)), still: Math.hypot(pPP, rPP, yPP), poke: mean(Array.from(hp.f, (_, i) => Math.atan2(hp.f[i] - nk.f[i], hp.y[i] - nk.y[i]) * DEG)) }; }
  // ---- smoothness
  { const hf = (x) => { const m = x.length, mu = mean(x); let hi = 0, tot = 0; for (let f = 1; f < m / 2; f++) { let c = 0, s = 0; for (let i = 0; i < m; i++) { const w = 2 * Math.PI * f * i / m; c += (x[i] - mu) * Math.cos(w); s += (x[i] - mu) * Math.sin(w); } const p = c * c + s * s; tot += p; if (f / (m * dt) > 6) hi += p; } return tot > 0 ? 100 * hi / tot : 0; };
    const keys = Object.keys(J).filter((k) => !/^(pitch|ankle)_/.test(k)); let rate = 0, rateKey = '', rateAt = 0; for (const k of keys) for (let i = 1; i < J[k].length; i++) { const r = Math.abs(J[k][i] - J[k][i - 1]) / dt; if (r > rate) { rate = r; rateKey = k; rateAt = i; } }
    const rep = []; for (const k of ['thigh_l', 'knee_l', 'arm_l', 'elbow_l']) { const e = E[k]; if (e.cycles.length < 3) continue; const r = pp(e.mean) || 1; for (let c = 1; c < e.cycles.length; c++) rep.push(100 * rms(e.cycles[c].map((v, i) => v - e.cycles[c - 1][i])) / r); }
    let jump = 0; for (const nm of ['hand_l', 'hand_r', 'foot_l', 'foot_r', 'head', 'calf_l', 'calf_r']) { const S = rec.s(nm); for (let k = k0 + 1; k < k1; k++) jump = Math.max(jump, Math.hypot(S.x[k] - S.x[k - 1] - (rec.root[k * 3] - rec.root[(k - 1) * 3]), S.y[k] - S.y[k - 1], S.z[k] - S.z[k - 1] - (rec.root[k * 3 + 2] - rec.root[(k - 1) * 3 + 2]))); }
    // the pelvis's vertical acceleration (central second difference of the height, over the window): a walker's moves at a few m/s^2 and, however brisk, has no spikes. REVIEW_1 never saw this one - nothing in the rubric did - and the gait's pelvis was
    // being held to the legs' reach so hard that it stomped at every step, 15 - 59 m/s^2 at the 99th percentile; the joint-angle items and the 1-frame jump do not see a move that is 3 cm over 4 frames
    const pyv = P('pelvis').y, pacc = []; for (let i = 1; i < pyv.length - 1; i++) pacc.push(Math.abs(pyv[i + 1] - 2 * pyv[i] + pyv[i - 1]) / (dt * dt)); pacc.sort((x, y) => x - y);
    a.smooth = { hf: Math.max(...['thigh_l', 'knee_l', 'arm_l', 'elbow_l', 'thigh_r'].map((k) => hf(J[k]))), rate, rateKey, rateAt, period: rep.length ? mean(rep) : NaN, jumpCm: jump * 100, pelAcc: pacc.length ? pacc[Math.min(pacc.length - 1, Math.floor(0.99 * pacc.length))] : NaN, trem: tremorMm(P, ['hand_l', 'hand_r', 'head', 'spine_03', 'pelvis'], ev.l.hsF.slice(1).map((x, i) => [ev.l.hsF[i], x]), n, dt) }; }   // (cycles bounded at the sub-frame heel strikes: with whole-frame ones every cycle is shifted by up to half a frame against the mean, which a hand moving 8 mm a frame reads as 2-3 mm of shake)
  return a;
}
/** Shake: what is left of a landmark's motion once the slow wander (a moving average of a third of a second: steering, speed) and the stride-locked waveform (the mean over the left-heel-strike
 *  cycles, harmonics and all) are taken out. RMS of the three axes together in mm, the worst of the landmarks; NaN with fewer than three whole cycles inside the window (a moving average has
 *  no neighbours at the ends of it, so those samples are dropped). The joint-angle items cannot see this: they are sagittal angles, and shake is sideways, or small, or not in a joint. */
export function tremorMm(P, names, cyc, n, dt) {
  const w = Math.max(2, Math.round(0.165 / dt)), ok = cyc.filter(([A, B]) => A >= w && B <= n - w);
  if (ok.length < 3) return NaN;
  let worst = 0;
  for (const nm of names) {
    let ss = 0, cnt = 0;
    for (const ax of ['f', 'r', 'y']) {
      const x = P(nm)[ax], lp = smooth(x, w), hp = Float64Array.from(x, (v, i) => v - lp[i]), cs = ok.map(([A, B]) => resample(hp, A, B)), m = cs[0].map((_, i) => mean(cs.map((c) => c[i])));
      ok.forEach(([A, B]) => { for (let i = Math.ceil(A); i < B; i++) { const u = (i - A) / (B - A) * 100, j = Math.min(99, Math.floor(u)), f = u - j; ss += (hp[i] - (m[j] * (1 - f) + m[j + 1] * f)) ** 2; cnt++; } });
    }
    worst = Math.max(worst, Math.sqrt(ss / (cnt / 3)));
  }
  return worst * 1000;
}

// ------------------------------------------------------------------------------------------------------------------------ transitions
const speedSeries = (rec) => rec.speed(Math.max(1, Math.round(0.05 / rec.dt)));
const accelSeries = (rec) => { const sp = speedSeries(rec), w = Math.max(1, Math.round(0.05 / rec.dt)), o = new Float64Array(rec.n); for (let k = w; k < rec.n - w; k++) o[k] = (sp[k + w] - sp[k - w]) / (2 * w * rec.dt); return o; };
/** setting off: from the walk command (the first frame of the walking segment) to the first step */
export function analyseStart(rec) {
  const k0 = rec.seg.findIndex((s) => s === 1); if (k0 < 0) return { ok: false, reason: 'no walking segment' };
  const sp = speedSeries(rec), ac = accelSeries(rec), ct = contactOf(rec, 0, rec.n);
  let kMove = -1; for (let k = k0; k < rec.n; k++) if (sp[k] > 0.15) { kMove = k; break; }
  let kTO = -1, kHS = -1, foot = null;   // the first foot to leave the floor, then its next landing
  for (let k = Math.max(k0, 1); k < rec.n && kTO < 0; k++) for (const s of ['l', 'r']) if (ct.c[s][k - 1] && !ct.c[s][k]) { kTO = k; foot = s; break; }
  if (kTO >= 0) for (let k = kTO + 1; k < rec.n && kHS < 0; k++) if (!ct.c[foot][k - 1] && ct.c[foot][k]) kHS = k;
  let glide = 0; const kg = kTO < 0 ? rec.n - 1 : kTO; for (let k = Math.max(k0, 1); k <= kg; k++) glide += Math.hypot(rec.root[k * 3] - rec.root[(k - 1) * 3], rec.root[k * 3 + 2] - rec.root[(k - 1) * 3 + 2]);
  let peak = 0; for (let k = k0; k < Math.min(rec.n, k0 + Math.round(1.8 / rec.dt)); k++) peak = Math.max(peak, ac[k]);
  return { ok: true, latency: kHS < 0 ? NaN : (kHS - k0) * rec.dt, toLatency: kTO < 0 ? NaN : (kTO - k0) * rec.dt, glide, peakAccel: peak, moveAt: kMove < 0 ? NaN : (kMove - k0) * rec.dt };
}
/** stopping: from the arrival (the harness puts the person into 'stand') to standing still */
export function analyseStop(rec) {
  const kw = rec.seg.findIndex((s) => s === 1); let kStop = -1; if (kw >= 0) for (let k = kw; k < rec.n; k++) if (rec.state[k] === 'stand') { kStop = k; break; }
  if (kw < 0 || kStop < 0) return { ok: false, reason: 'never arrived' };
  const ac = accelSeries(rec), ct = contactOf(rec, 0, rec.n), kEnd = rec.n - 1;
  let dec = 0; for (let k = Math.max(0, kStop - Math.round(1.2 / rec.dt)); k < Math.min(rec.n, kStop + Math.round(1.0 / rec.dt)); k++) dec = Math.max(dec, -ac[k]);
  let last = kStop;   // settled: the last frame at which a sole point is still moving faster than 2 cm/s (over 0.2 s), so a foot that creeps while the person stands has not settled
  const w = Math.max(1, Math.round(0.1 / rec.dt));
  for (const nm of ['heel_l', 'heel_r', 'bs_l', 'bs_r', 'toe_l', 'toe_r']) { const S = rec.s(nm); for (let k = kEnd - w; k >= kStop; k--) if (Math.hypot(S.x[k + w] - S.x[Math.max(0, k - w)], S.y[k + w] - S.y[Math.max(0, k - w)], S.z[k + w] - S.z[Math.max(0, k - w)]) / (2 * w * rec.dt) > 0.02) { last = Math.max(last, k); break; } }
  const sl = slipOf(rec, kStop, rec.n), fa = rec.s('foot_l'), fb = rec.s('foot_r'), hx = -Math.sin(rec.yaw[kEnd]), hz = -Math.cos(rec.yaw[kEnd]);
  return { ok: true, decel: dec, settle: (last - kStop) * rec.dt, slideCm: sl.pathMax, finalStagger: Math.abs((fa.x[kEnd] - fb.x[kEnd]) * hx + (fa.z[kEnd] - fb.z[kEnd]) * hz), kStop };
}
/** a turn while walking: the slip through it and the fastest the body swings round */
export function analyseTurn(rec, win) {
  const k0 = Math.round(win[0] / rec.dt), k1 = Math.min(rec.n, Math.round(win[1] / rec.dt)), y = unwrap(Array.from(rec.yaw)), w = Math.max(1, Math.round(0.05 / rec.dt));
  let rate = 0; for (let k = Math.max(k0, w); k < k1 - w; k++) rate = Math.max(rate, Math.abs(y[k + w] - y[k - w]) / (2 * w * rec.dt) * DEG);
  return { ok: true, slip: slipOf(rec, k0, k1).rms, yawRate: rate, turned: Math.abs(y[k1 - 1] - y[k0]) * DEG };
}
/** a turn on the spot: how far the feet drag across the floor, and how long the body takes */
export function analyseSpin(rec, win) {
  const k0 = Math.round(win[0] / rec.dt), k1 = Math.min(rec.n, Math.round(win[1] / rec.dt)), y = unwrap(Array.from(rec.yaw)), w = Math.max(1, Math.round(0.05 / rec.dt));
  let rate = 0; for (let k = Math.max(k0, w); k < k1 - w; k++) rate = Math.max(rate, Math.abs(y[k + w] - y[k - w]) / (2 * w * rec.dt) * DEG);
  const tot = Math.abs(y[k1 - 1] - y[k0]) * DEG; let tDone = NaN; for (let k = k0; k < k1; k++) if (Math.abs(y[k] - y[k0]) * DEG >= 0.95 * tot) { tDone = (k - k0) * rec.dt; break; }
  return { ok: true, slipPath: slipOf(rec, k0, k1).pathMax, yawRate: rate, turned: tot, tDone };
}

// ------------------------------------------------------------------------------------------------------------------------ the rubric: every sub-metric, its weight and its bands
// fall [good, bad]: 10 at <= good, 0 at >= bad | rise [bad, good] | band [lo, hi, zeroBelow, zeroAbove]; a band may be a function of the analysis (expected values scale with speed and leg length)
const rel = (key, lo, hi, zlo, zhi) => (a) => [a.ex[key] * lo, a.ex[key] * hi, a.ex[key] * zlo, a.ex[key] * zhi];
const off = (key, d, z) => (a) => [a.ex[key] - d, a.ex[key] + d, a.ex[key] - z, a.ex[key] + z];
export const CATS = { GRD: 16, STR: 10, TIM: 7, LEG: 13, PEL: 11, ARM: 13, HEA: 5, SMO: 7, TRN: 12, RNG: 6 };
export const CAT_NAMES = { GRD: 'grounding', STR: 'stride and cadence against speed', TIM: 'timing and symmetry', LEG: 'lower-limb kinematics', PEL: 'pelvis and trunk', ARM: 'arm swing', HEA: 'head and gaze', SMO: 'smoothness and repeatability', TRN: 'starts, stops and turns', RNG: 'speed range and individuality' };
export const STEADY_AT = { GRD: SPEEDS, STR: SPEEDS, SMO: SPEEDS, TIM: NORMAL, LEG: NORMAL, PEL: NORMAL, ARM: NORMAL, HEA: NORMAL };   // the speeds each category is judged at
export const ITEMS = [
  { id: 'GRD.slip', w: 7, label: 'planted-foot slip, RMS', unit: 'cm/s', v: (a) => a.slip, fall: [1.5, 12] },
  { id: 'GRD.sink', w: 2, label: 'deepest a sole goes below the floor', unit: 'mm', v: (a) => a.sinkMm, fall: [3, 15] },
  { id: 'GRD.float', w: 2, label: 'height of the planted sole', unit: 'mm', v: (a) => a.floatMm, fall: [4, 20] },
  { id: 'GRD.flight', w: 1.5, label: 'time with neither foot on the floor', unit: '%', v: (a) => a.noContactPct, fall: [2, 15] },
  { id: 'GRD.clear', w: 1.5, label: 'swing-foot clearance (mid-swing)', unit: 'mm', v: (a) => a.clearMm, band: [10, 45, 0, 110] },
  { id: 'GRD.hipH', w: 2, label: 'hip height / standing hip height', unit: '', v: (a) => a.hipRel, band: [0.93, 1.0, 0.84, 1.04] },
  { id: 'STR.cad', w: 5, label: 'cadence against speed', unit: 'steps/min', v: (a) => a.cadence, band: rel('cadence', 0.92, 1.08, 0.7, 1.3) },
  { id: 'STR.step', w: 5, label: 'step length against speed', unit: 'm', v: (a) => a.stepLen, band: rel('stepLen', 0.92, 1.08, 0.7, 1.3) },
  { id: 'TIM.symT', w: 2, label: 'left/right step-time difference', unit: '%', v: (a) => a.symStepTime, fall: [3, 12] },
  { id: 'TIM.symL', w: 1.5, label: 'left/right step-length difference', unit: '%', v: (a) => a.symStepLen, fall: [4, 15] },
  { id: 'TIM.stance', w: 2, label: 'stance share of the stride', unit: '%', v: (a) => a.stance, band: off('stance', 3, 10) },
  { id: 'TIM.ds', w: 1.5, label: 'double support', unit: '%', v: (a) => a.ds, band: off('ds', 4, 12) },
  { id: 'TIM.cvT', w: 1.5, label: 'stride-time variability (CV)', unit: '%', v: (a) => a.strideTimeCV, band: [1.0, 3.5, 0.3, 8] },
  { id: 'TIM.cvL', w: 1, label: 'step-length variability (CV)', unit: '%', v: (a) => a.stepLenCV, band: [1.0, 4.0, 0.3, 9] },
  { id: 'LEG.hip', w: 3, label: 'hip flexion-extension range', unit: 'deg', v: (a) => a.hip.range, band: off('hipRange', 6, 18) },
  { id: 'LEG.kneeSw', w: 3, label: 'knee flexion peak in swing', unit: 'deg', v: (a) => a.knee.swing, band: off('kneeSwing', 7, 22) },
  { id: 'LEG.kneeLd', w: 2, label: 'knee flexion in loading response', unit: 'deg', v: (a) => a.knee.loading, band: [8, 24, 0, 40] },
  { id: 'LEG.kneeSt', w: 1, label: 'knee in mid-stance (least flexion)', unit: 'deg', v: (a) => a.knee.stanceMin, band: [0, 14, -8, 30] },
  { id: 'LEG.plantar', w: 2, label: 'ankle plantarflexion at push-off', unit: 'deg', v: (a) => a.ankle.plantar, band: [-28, -8, -45, 2] },
  { id: 'LEG.dorsi', w: 1, label: 'ankle dorsiflexion in late stance', unit: 'deg', v: (a) => a.ankle.dorsi, band: [6, 20, 0, 34] },
  { id: 'LEG.hsPitch', w: 1, label: 'foot pitch at heel strike (toes up)', unit: 'deg', v: (a) => a.hsPitch, band: [8, 30, 0, 45] },
  { id: 'LEG.width', w: 1.5, label: 'step width, heel to heel (- = crossed over)', unit: 'm', v: (a) => a.stepWidth, band: [0.05, 0.14, 0, 0.20] },
  { id: 'PEL.bob', w: 3, label: 'pelvis vertical excursion, peak to peak', unit: 'mm', v: (a) => a.pelvis.bobPP, band: (a) => [a.ex.bob * 650, a.ex.bob * 1400, a.ex.bob * 300, a.ex.bob * 2200] },
  { id: 'PEL.bobH2', w: 1, label: 'bob at twice the stride rate (two per stride)', unit: 'share', v: (a) => a.pelvis.bobH2, rise: [0.4, 0.8] },
  { id: 'PEL.sway', w: 2, label: 'pelvis lateral excursion, peak to peak', unit: 'mm', v: (a) => a.pelvis.swayPP, band: [25, 65, 8, 105] },
  { id: 'PEL.swayH1', w: 1, label: 'sway at the stride rate (one per stride)', unit: 'share', v: (a) => a.pelvis.swayH1, rise: [0.4, 0.8] },
  { id: 'PEL.yaw', w: 1.5, label: 'pelvis rotation, peak to peak', unit: 'deg', v: (a) => a.pelvis.yawPP, band: [5, 14, 1.5, 26] },
  { id: 'PEL.obl', w: 1, label: 'pelvic obliquity, peak to peak', unit: 'deg', v: (a) => a.pelvis.oblPP, band: [3, 10, 0.5, 18] },
  { id: 'PEL.thorax', w: 1, label: 'shoulder-line rotation, peak to peak', unit: 'deg', v: (a) => a.pelvis.thoraxPP, band: [4, 16, 1, 28] },
  { id: 'PEL.anti', w: 0.5, label: 'thorax against pelvis rotation (correlation)', unit: 'r', v: (a) => a.pelvis.anti, fall: [-0.5, 0.4] },
  { id: 'PEL.lean', w: 1.5, label: 'trunk lean from the vertical, pelvis to neck (+ = forward)', unit: 'deg', v: (a) => a.trunk.lean, band: [-4, 12, -16, 28] },
  { id: 'ARM.range', w: 3, label: 'upper-arm swing, peak to peak', unit: 'deg', v: (a) => a.arm.range, band: off('armRange', 10, 25) },
  { id: 'ARM.phase', w: 3, label: 'arm against same-side thigh (correlation)', unit: 'r', v: (a) => a.arm.corr, fall: [-0.8, -0.2] },
  { id: 'ARM.elbow', w: 2, label: 'elbow flexion, mean', unit: 'deg', v: (a) => a.arm.flexMean, band: [15, 50, 0, 80] },
  { id: 'ARM.couple', w: 1, label: 'elbow bends as the arm swings forward (correlation)', unit: 'r', v: (a) => a.arm.flexCouple, rise: [0.1, 0.6] },
  { id: 'ARM.sym', w: 2, label: 'left/right swing difference', unit: '%', v: (a) => a.arm.sym, fall: [15, 50] },
  { id: 'ARM.clear', w: 2, label: 'hand beyond the hip joint, closest', unit: 'm', v: (a) => a.arm.clear, rise: [-0.02, 0.03] },
  { id: 'ARM.splay', w: 1.5, label: 'hand outside its own shoulder line (95th percentile)', unit: 'm', v: (a) => a.arm.splay, fall: [0.10, 0.20] },
  { id: 'HEA.pitch', w: 1.5, label: 'head pitch, peak to peak', unit: 'deg', v: (a) => a.head.pitchPP, fall: [4, 12] },
  { id: 'HEA.roll', w: 1, label: 'head roll, peak to peak', unit: 'deg', v: (a) => a.head.rollPP, fall: [3, 10] },
  { id: 'HEA.yaw', w: 1, label: 'head yaw, peak to peak', unit: 'deg', v: (a) => a.head.yawPP, fall: [6, 16] },
  { id: 'HEA.gaze', w: 1, label: 'gaze pitch off level, mean', unit: 'deg', v: (a) => Math.abs(a.head.pitchMean), fall: [8, 25] },
  { id: 'HEA.dir', w: 0.5, label: 'head turned off the direction of travel, mean', unit: 'deg', v: (a) => a.head.yawMean, fall: [6, 20] },
  { id: 'HEA.poke', w: 1, label: 'neck bone from the vertical (+ = head carried ahead of its base)', unit: 'deg', v: (a) => a.head.poke, fall: [35, 55] },
  { id: 'HEA.still', w: 1, label: 'head swing in pitch, roll and yaw together (a head that never moves is wrong too)', unit: 'deg', v: (a) => a.head.still, rise: [0.3, 1.2] },
  { id: 'SMO.hf', w: 2, label: 'joint-angle power above 6 Hz', unit: '%', v: (a) => a.smooth.hf, fall: [2, 12] },
  { id: 'SMO.rate', w: 2, label: 'fastest joint-angle change', unit: 'deg/s', v: (a) => a.smooth.rate, fall: [700, 1800] },
  { id: 'SMO.rep', w: 1.5, label: 'stride-to-stride difference, of the range', unit: '%', v: (a) => a.smooth.period, fall: [5, 25] },
  { id: 'SMO.jump', w: 1.5, label: 'biggest one-frame move of a hand, foot or head', unit: 'cm', v: (a) => a.smooth.jumpCm, fall: [12, 30] },
  { id: 'SMO.trem', w: 1.5, label: 'shake of hand, head, spine or pelvis, not stride-locked (RMS, worst landmark)', unit: 'mm', v: (a) => a.smooth.trem, fall: [1.5, 6] },
  { id: 'SMO.pelAcc', w: 2, label: 'vertical acceleration of the pelvis, 99th percentile', unit: 'm/s^2', v: (a) => a.smooth.pelAcc, fall: [8, 20] },
];
export const TRN_ITEMS = [
  { id: 'TRN.lat', w: 1.5, label: 'walk command to first heel strike', unit: 's', v: (t) => t.start.latency, fall: [0.7, 1.6] },
  { id: 'TRN.glide', w: 1.5, label: 'distance covered before the first foot leaves the floor', unit: 'm', v: (t) => t.start.glide, fall: [0.25, 0.7] },
  { id: 'TRN.acc', w: 0.5, label: 'peak acceleration setting off', unit: 'm/s2', v: (t) => t.start.peakAccel, fall: [3, 8] },
  { id: 'TRN.dec', w: 1.5, label: 'peak deceleration stopping', unit: 'm/s2', v: (t) => t.stop.decel, fall: [3, 8] },
  { id: 'TRN.settle', w: 1.5, label: 'time from arrival until the feet are still', unit: 's', v: (t) => t.stop.settle, fall: [0.8, 2.5] },
  { id: 'TRN.slide', w: 1.5, label: 'distance the planted feet drag after arriving', unit: 'cm', v: (t) => t.stop.slideCm, fall: [3, 15] },
  { id: 'TRN.stand', w: 1, label: 'one foot ahead of the other once stopped', unit: 'm', v: (t) => t.stop.finalStagger, fall: [0.22, 0.45] },
  { id: 'TRN.tslip', w: 1, label: 'planted-foot slip through a 90-degree turn, RMS', unit: 'cm/s', v: (t) => t.turn.slip, fall: [3, 14] },
  { id: 'TRN.trate', w: 1, label: 'fastest heading change in a walking turn', unit: 'deg/s', v: (t) => t.turn.yawRate, fall: [200, 500] },
  { id: 'TRN.spin', w: 1, label: 'foot drag turning 120 degrees on the spot', unit: 'cm', v: (t) => t.spin.slipPath, fall: [8, 40] },
];
export const RNG_ITEMS = [
  { id: 'RNG.mono', w: 1.5, label: 'cadence and step length both rise with speed (rank correlation)', unit: 'r', v: (r) => r.mono, rise: [0.5, 0.95] },
  { id: 'RNG.slope', w: 1.5, label: 'step-length growth with speed, against normative', unit: 'ratio', v: (r) => r.slope, band: [0.7, 1.3, 0.2, 2.2] },
  { id: 'RNG.cv', w: 2, label: 'spread of cadence between people at 1.2 m/s', unit: '% CV', v: (r) => r.cadCV, band: [2, 15, 0.3, 30] },
  { id: 'RNG.legs', w: 1, label: 'shorter legs, faster cadence (correlation with hip height)', unit: 'r', v: (r) => r.legCorr, fall: [-0.4, 0.3] },
];
// WHERE EACH BAND COMES FROM. Added after the independent review found the rubric read as better founded than it is (REVIEW_1, R7): every edge of every band is tagged with the weakest
// honest description of its source, and the doc prints the share of the weight that rests on each.
//   pub      a figure I read in a published source this session (Winter 1992 minimum toe clearance 1.29 cm)
//   derived  computed from a published relation: the walk ratio, dynamic similarity (Alexander)
//   text     my reading of standard gait texts and norms that I did NOT re-read (Perry & Burnfield, Winter's book, Saunders et al. 1953, Meyns et al. 2013): lines fitted by eye
//   phys     geometry or physics: a sole under the floor, a foot dragging while it is down, a hand through the hip
//   judge    my judgement - there is no published figure behind the edge (a published figure may sit nearby: the doc says where). Attack these first.
export const BASIS = ['pub', 'derived', 'text', 'phys', 'judge'];
const SRC = {
  'GRD.slip': 'phys', 'GRD.sink': 'phys', 'GRD.float': 'phys', 'GRD.flight': 'phys', 'GRD.clear': 'pub', 'GRD.hipH': 'judge',
  'STR.cad': 'derived', 'STR.step': 'derived',
  'TIM.symT': 'judge', 'TIM.symL': 'judge', 'TIM.stance': 'text', 'TIM.ds': 'text', 'TIM.cvT': 'judge', 'TIM.cvL': 'judge',
  'LEG.hip': 'text', 'LEG.kneeSw': 'text', 'LEG.kneeLd': 'text', 'LEG.kneeSt': 'text', 'LEG.plantar': 'text', 'LEG.dorsi': 'text', 'LEG.hsPitch': 'text', 'LEG.width': 'judge',
  'PEL.bob': 'text', 'PEL.bobH2': 'judge', 'PEL.sway': 'text', 'PEL.swayH1': 'judge', 'PEL.yaw': 'text', 'PEL.obl': 'text', 'PEL.thorax': 'text', 'PEL.anti': 'text', 'PEL.lean': 'judge',
  'ARM.range': 'text', 'ARM.phase': 'text', 'ARM.elbow': 'text', 'ARM.couple': 'text', 'ARM.sym': 'judge', 'ARM.clear': 'phys', 'ARM.splay': 'judge',
  'HEA.pitch': 'judge', 'HEA.roll': 'judge', 'HEA.yaw': 'judge', 'HEA.gaze': 'judge', 'HEA.dir': 'judge', 'HEA.poke': 'judge', 'HEA.still': 'judge',
  'SMO.hf': 'judge', 'SMO.rate': 'judge', 'SMO.rep': 'judge', 'SMO.jump': 'phys', 'SMO.trem': 'judge', 'SMO.pelAcc': 'judge',
  'TRN.lat': 'judge', 'TRN.glide': 'judge', 'TRN.acc': 'judge', 'TRN.dec': 'judge', 'TRN.settle': 'judge', 'TRN.slide': 'phys', 'TRN.stand': 'judge', 'TRN.tslip': 'judge', 'TRN.trate': 'judge', 'TRN.spin': 'judge',
  'RNG.mono': 'derived', 'RNG.slope': 'derived', 'RNG.cv': 'judge', 'RNG.legs': 'derived',
};
for (const it of [...ITEMS, ...TRN_ITEMS, ...RNG_ITEMS]) it.src = SRC[it.id];
/** the weight resting on each kind of basis, over all the items of the categories the steady walks, the transitions and the range are judged on (weights as a share of the item weights in their own category x the category weight) */
export function basisShares() {
  const out = Object.fromEntries(BASIS.map((b) => [b, 0])), by = {}; for (const it of [...ITEMS, ...TRN_ITEMS, ...RNG_ITEMS]) (by[it.id.split('.')[0]] = by[it.id.split('.')[0]] || []).push(it);
  for (const c of Object.keys(by)) { const W = by[c].reduce((s, i) => s + i.w, 0); for (const it of by[c]) out[it.src] += CATS[c] * it.w / W; }
  return out;
}
const evalItem = (it, ctx) => { let value = NaN, s = 0; try { value = it.v(ctx); } catch (e) { value = NaN; } if (it.fall) s = fall(value, ...it.fall); else if (it.rise) s = rise(value, ...it.rise); else { const b = typeof it.band === 'function' ? it.band(ctx) : it.band; s = band(value, ...b); } return { id: it.id, w: it.w, label: it.label, unit: it.unit, value, score: s, src: it.src }; };
/** category score of a list of scored items: 0.6 x weighted mean + 0.4 x the worst, so one broken sub-metric cannot hide in an average */
export const catScore = (items) => { if (!items.length) return NaN; const W = items.reduce((s, i) => s + i.w, 0), m = items.reduce((s, i) => s + i.w * i.score, 0) / W; return 0.6 * m + 0.4 * Math.min(...items.map((i) => i.score)); };
/** the steady-walk items of one analysis, grouped by category */
export function scoreSteady(a) {
  const out = {}; for (const c of Object.keys(CATS)) out[c] = [];
  for (const it of ITEMS) out[it.id.split('.')[0]].push(a.ok ? evalItem(it, a) : { id: it.id, w: it.w, label: it.label, unit: it.unit, value: NaN, score: 0 });
  return out;
}
export const scoreTransitions = (t) => TRN_ITEMS.map((it) => evalItem(it, t));
/** how the speed ladder behaves, and how people differ. steady[person][speed] -> analysis */
export function rangeStats(steady) {
  const people = Object.keys(steady), ladders = people.map((p) => SPEEDS.map((v) => steady[p][v]).filter((a) => a && a.ok));
  const rank = (xs) => { const idx = xs.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = new Array(xs.length); idx.forEach(([, i], j) => { r[i] = j; }); return r; };
  const monos = [], slopes = [];
  for (const L of ladders) {
    if (L.length < 3) { monos.push(0); slopes.push(NaN); continue; }
    const v = L.map((a) => a.v), c = L.map((a) => a.cadence), s = L.map((a) => a.stepLen);
    monos.push(Math.min(corr(rank(v), rank(c)), corr(rank(v), rank(s))));
    slopes.push(((s[s.length - 1] - s[0]) / (v[v.length - 1] - v[0])) / ((L[L.length - 1].ex.stepLen - L[0].ex.stepLen) / (v[v.length - 1] - v[0])));
  }
  const at12 = people.map((p) => steady[p][1.2]).filter((a) => a && a.ok), cad = at12.map((a) => a.cadence);
  return { mono: mean(monos), slope: mean(slopes), cadCV: 100 * Math.sqrt(mean(cad.map((c) => (c - mean(cad)) ** 2))) / mean(cad), legCorr: at12.length > 2 ? corr(at12.map((a) => a.hipY), cad) : NaN };
}
export function scoreRange(steady) { const r = rangeStats(steady); return { stats: r, items: RNG_ITEMS.map((it) => evalItem(it, r)) }; }

// ------------------------------------------------------------------------------------------------------------------------ the whole thing
/** THE GATE, every clause, so that a failure says which: overall > 9, the discriminating 55 points > 9, every category's mean >= 8, every category's 10th percentile >= 8, no steady recording
 *  below 8, it only counts on the whole roster (--people all: six chosen people can hide the one whose shoes hover), and only when the floor was judged on the rendered shoe for everybody
 *  (not on the landmarks the gait itself plants). Returns the list of clauses that fail (empty = met). */
export function gateOf({ overall, disc, cats, p10, worst, roster, meshOk }) {
  const why = [], f = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
  if (!(overall > 9.0)) why.push(`overall ${f(overall)} <= 9`);
  if (!(disc > 9.0)) why.push(`discriminating 55 points ${f(disc)} <= 9`);
  for (const c of Object.keys(CATS)) if (!(cats[c] >= 8.0)) why.push(`${c} ${f(cats[c])} < 8`);
  for (const c of Object.keys(CATS)) if (!(p10[c] >= 8.0)) why.push(`${c} p10 ${f(p10[c])} < 8`);
  if (worst && !(worst.score >= 8.0)) why.push(`worst recording ${worst.person}@${worst.v} ${f(worst.score)} < 8`);
  if (!roster) why.push('not the whole roster');
  if (meshOk === false) why.push('the floor was not judged on the rendered shoe for everybody');
  return why;
}
/** results = { steady:{ person:{ speed: analysis } }, trans:{ person:{ start, stop, turn, spin } } }  ->  { cats, overall, worst, rows, trn, rng, gate } */
export function scoreAll(results) {
  const people = Object.keys(results.steady), rows = [], perCat = {}; for (const c of Object.keys(CATS)) perCat[c] = [];
  for (const p of people) for (const v of SPEEDS) {
    const a = results.steady[p][v]; if (!a) continue; const sc = scoreSteady(a), row = { person: p, v, cat: {}, items: [], a };
    for (const c of Object.keys(STEADY_AT)) if (STEADY_AT[c].includes(v)) { row.cat[c] = catScore(sc[c]); perCat[c].push(row.cat[c]); row.items.push(...sc[c]); }
    rows.push(row);
  }
  const trn = {}; for (const p of people) { const t = results.trans && results.trans[p]; if (!t) continue; const items = scoreTransitions(t); trn[p] = { items, score: catScore(items) }; perCat.TRN.push(trn[p].score); }
  const rng = scoreRange(results.steady); perCat.RNG.push(catScore(rng.items));
  const cats = {}; for (const c of Object.keys(CATS)) cats[c] = mean(perCat[c]);
  const overall = Object.keys(CATS).reduce((s, c) => s + CATS[c] * (Number.isFinite(cats[c]) ? cats[c] : 0), 0) / 100;
  // The DISCRIMINATING subscore: the five categories whose targets are not the gait's own design numbers or a table both sides share (grounding, timing, legs, smoothness, starts/stops/turns: 55
  // of the 100 points). STR and RNG are consistency checks against the relation the gait was built from; PEL, ARM and HEA are bands round the amplitudes it is designed to produce. A walk can
  // score 10 on those 45 points by being built to, which is why the first overall (9.4) was a good deal rosier than the 8.9 these 55 give.
  const DISC = ['GRD', 'TIM', 'LEG', 'SMO', 'TRN'], disc = DISC.reduce((s, c) => s + CATS[c] * (Number.isFinite(cats[c]) ? cats[c] : 0), 0) / DISC.reduce((s, c) => s + CATS[c], 0);
  const p10 = {}; for (const c of Object.keys(CATS)) p10[c] = pct(perCat[c].filter(Number.isFinite), 0.1);   // the category score that nine recordings in ten reach: a category can hold 8 on average and fail on one person in five
  const per = rows.map((r) => { let w = 0, s = 0; for (const c of Object.keys(r.cat)) { w += CATS[c]; s += CATS[c] * r.cat[c]; } return { person: r.person, v: r.v, score: s / w }; });   // each recording on its own, over the steady categories it is judged on
  const worst = per.length ? per.reduce((m, r) => (r.score < m.score ? r : m)) : null;
  const why = gateOf({ overall, disc, cats, p10, worst, roster: results.rosterAll !== false, meshOk: results.meshOk !== false });
  return { cats, overall, disc, p10, worst, per, rows, trn, rng, gate: why.length === 0, why, roster: results.rosterAll !== false, meshOk: results.meshOk !== false };
}
/** the rubric as a markdown table (the doc quotes this, so the two cannot drift), the bands evaluated for a 0.92 m hip at 1.2 m/s */
export function rubricTable() {
  const ref = { ex: expected(1.2, 0.92) }, f = (x) => String(+x.toFixed(3)), line = (it) => {
    const b = it.fall ? it.fall : it.rise ? it.rise : typeof it.band === 'function' ? it.band(ref) : it.band;
    const full = it.fall ? `<= ${f(b[0])}` : it.rise ? `>= ${f(b[1])}` : `${f(b[0])} to ${f(b[1])}`, zero = it.fall ? `>= ${f(b[1])}` : it.rise ? `<= ${f(b[0])}` : `<= ${f(b[2])} or >= ${f(b[3])}`;
    return `| ${it.id} | ${it.w} | ${it.label} | ${it.unit} | ${full} | ${zero} | ${it.src} |`;
  };
  return ['| item | weight | measured | unit | full marks | no marks | basis |', '|---|---|---|---|---|---|---|', ...ITEMS.map(line), ...TRN_ITEMS.map(line), ...RNG_ITEMS.map(line)].join('\n');
}
