// Reusable chrome + the interactive toys + the case-file modal.
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const SUBS = window.WIN16_SUBSYSTEMS;
const SUBMAP = Object.fromEntries(SUBS.map(s => [s.key, s]));
const catColor = (k) => (SUBMAP[k] ? SUBMAP[k].hex : "#444");
const catLabel = (k) => (SUBMAP[k] ? SUBMAP[k].label : k);

// ---- window chrome (original, colour-coded) ----
function Win({ title, barcol, children, className = "", style = {}, onClose }) {
  return (
    <div className={"win " + className} style={{ "--barcol": barcol, ...style }}>
      <div className="win-bar">
        <span className="dots"><i></i><i></i><i></i></span>
        <span className="title">{title}</span>
        <span className="ctrls">
          <b>–</b>
          <b>▢</b>
          <b onClick={onClose} style={{ cursor: onClose ? "pointer" : "default" }}>✕</b>
        </span>
      </div>
      <div className="win-body">{children}</div>
    </div>
  );
}

function Difficulty({ n, color }) {
  return (
    <span className="spanners" title={`difficulty ${n}/5`} style={{ color }}>
      {"◆".repeat(n)}<span style={{ color: "var(--hair)" }}>{"◇".repeat(5 - n)}</span>
    </span>
  );
}

// =====================================================================
//  TOY 1 — cooperative message queue
// =====================================================================
function QueueToy({ color }) {
  const [running, setRunning] = useState(true);
  const [good, setGood] = useState([]);
  const [bad, setBad] = useState([]);
  const [badFrozen, setBadFrozen] = useState(0);
  const types = useMemo(() => ([
    ["WM_PAINT", "#0E9BA6"], ["WM_MOUSEMOVE", "#2D6BE0"], ["WM_TIMER", "#E0871C"],
    ["WM_COMMAND", "#8A45D6"], ["WM_KEYDOWN", "#1F9B59"], ["WM_SIZE", "#D23F8C"],
  ]), []);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const t = types[Math.floor(Math.random() * types.length)];
      const m = { id: Math.random().toString(36).slice(2), t: t[0], c: t[1] };
      // good app: yields, so its queue drains fast (keep last ~4)
      setGood(q => [m, ...q].slice(0, 4));
      // bad app: hogs the CPU, queue just grows and never drains
      setBad(q => [m, ...q].slice(0, 9));
      setBadFrozen(f => f + 1);
    }, 650);
    return () => clearInterval(id);
  }, [running, types]);
  return (
    <div className="toy" style={{ "--seg": color }}>
      <div className="toy-head">one queue · cooperative scheduling</div>
      <div className="toy-body">
        <div className="mq">
          <div className="pane">
            <h5 style={{ color: "var(--c-memory)" }}>▸ yields at GetMessage — responsive</h5>
            <div className="lane">
              {good.map(m => <div key={m.id} className="msg" style={{ background: m.c }}>{m.t} → dispatched</div>)}
            </div>
          </div>
          <div className="pane">
            <h5 style={{ color: "var(--c-user)" }}>▸ PeekMessage, never yields — frozen</h5>
            <div className="lane">
              {bad.map((m, i) => <div key={m.id} className="msg" style={{ background: m.c, opacity: i === 0 ? 1 : 0.55 }}>{m.t} — waiting…</div>)}
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="t" onClick={() => { setRunning(r => !r); }}>{running ? "❚❚ pause" : "▶ run"}</button>
          <button className="t" onClick={() => { setBad([]); setBadFrozen(0); }}>↺ the hog finally yields</button>
          <span className="mono" style={{ fontSize: 12, color: badFrozen > 6 ? "var(--c-user)" : "var(--ink-soft)" }}>
            desktop blocked for {badFrozen} ticks
          </span>
        </div>
        <div className="legend2">
          The left app calls GetMessage and politely hands back the CPU; the right app spins on PeekMessage
          and starves everything. mddosem must reproduce <i>both</i> — the second is behaviour real apps depend on.
        </div>
      </div>
    </div>
  );
}

// =====================================================================
//  TOY 2 — palette realization (before / after)
// =====================================================================
function PaletteToy({ color }) {
  const ref = useRef(null);
  const [correct, setCorrect] = useState(true);
  const W = 96, H = 64, S = 4;
  // build an indexed image + a 64-entry logical palette
  const { idx, pal } = useMemo(() => {
    const pal = [];
    for (let i = 0; i < 64; i++) {
      // a pleasant logical palette: sweeping hue ramp
      const h = (i / 64) * 320;
      const l = 35 + 40 * Math.sin((i / 64) * Math.PI);
      pal.push(hsl2rgb(h, 70, l));
    }
    const idx = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const cx = x - W / 2, cy = y - H / 2;
      const r = Math.sqrt(cx * cx + cy * cy);
      const a = Math.atan2(cy, cx);
      let v = Math.floor(((Math.sin(r * 0.28) + Math.sin(a * 3 + r * 0.1)) * 0.5 + 1) * 31);
      v = Math.max(0, Math.min(63, v));
      idx[y * W + x] = v;
    }
    return { idx, pal };
  }, []);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(W, H);
    for (let p = 0; p < W * H; p++) {
      let entry = idx[p];
      let rgb;
      if (correct) {
        // realize into the 236 free slots between the 20 reserved system colours (first 10 + last 10)
        rgb = pal[entry];
      } else {
        // the bug: logical palette written straight to hardware, trampling the
        // reserved slots and mis-ordering the indices → recognisable but lurid
        const scrambled = (entry * 5 + 13) % 64;
        rgb = pal[scrambled];
        // a few entries collapse to a reserved system colour
        if (entry % 9 === 0) rgb = [192, 192, 192];
      }
      img.data[p * 4] = rgb[0]; img.data[p * 4 + 1] = rgb[1];
      img.data[p * 4 + 2] = rgb[2]; img.data[p * 4 + 3] = 255;
    }
    // scale up
    const off = document.createElement("canvas"); off.width = W; off.height = H;
    off.getContext("2d").putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(off, 0, 0, W * S, H * S);
  }, [correct, idx, pal]);
  return (
    <div className="toy" style={{ "--seg": color }}>
      <div className="toy-head">RealizePalette · 256-colour mode</div>
      <div className="toy-body">
        <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
          <canvas ref={ref} width={W * S} height={H * S} style={{ width: W * S, height: H * S, maxWidth: "100%" }}></canvas>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="row">
              <button className="t" onClick={() => setCorrect(true)} style={{ background: correct ? "var(--c-memory)" : "var(--card)", color: correct ? "#fff" : "var(--ink)" }}>after — realized</button>
              <button className="t" onClick={() => setCorrect(false)} style={{ background: !correct ? "var(--c-user)" : "var(--card)", color: !correct ? "#fff" : "var(--ink)" }}>before — trampled</button>
            </div>
            <div className="legend2">
              The same indexed image. <b>Before:</b> the logical palette is written straight to hardware,
              clobbering the 20 reserved system colours and scrambling the index order. <b>After:</b> entries are
              realized into the free slots and references translated. Same picture, vastly improved life choices.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
//  TOY 3 — BitBlt raster operations
// =====================================================================
const ROPS = {
  SRCCOPY:    { f: (s, d, p) => s,            t: "S" },
  SRCAND:     { f: (s, d, p) => s & d,        t: "S AND D" },
  SRCPAINT:   { f: (s, d, p) => s | d,        t: "S OR D" },
  SRCINVERT:  { f: (s, d, p) => s ^ d,        t: "S XOR D" },
  NOTSRCCOPY: { f: (s, d, p) => s ? 0 : 1,    t: "NOT S" },
  MERGEPAINT: { f: (s, d, p) => (s ? 0 : 1) | d, t: "(NOT S) OR D" },
  PATCOPY:    { f: (s, d, p) => p,            t: "P" },
  PATINVERT:  { f: (s, d, p) => p ^ d,        t: "P XOR D" },
  DSTINVERT:  { f: (s, d, p) => d ? 0 : 1,    t: "NOT D" },
};
function RopPanel({ label, r, cvProps }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="mono" style={{ fontSize: 10.5, marginBottom: 5, color: "var(--ink-soft)" }}>{label}</div>
      <canvas ref={r} {...cvProps}></canvas>
    </div>
  );
}
function RopToy({ color }) {
  const [rop, setRop] = useState("SRCINVERT");
  const GW = 40, GH = 26, S = 5;
  // S: an arrow sprite, D: a brick-ish field, P: diagonal stripes (brush)
  const { S_, D_, P_ } = useMemo(() => {
    const S_ = new Uint8Array(GW * GH), D_ = new Uint8Array(GW * GH), P_ = new Uint8Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      // dest: checker blocks
      D_[i] = ((x >> 2) + (y >> 2)) & 1;
      // pattern: diagonal stripes
      P_[i] = ((x + y) % 4 < 2) ? 1 : 0;
      // source: a chunky arrow pointing right, centred
      const cx = x - 12, cy = y - GH / 2;
      const shaft = (x >= 6 && x <= 24 && Math.abs(cy) <= 2);
      const head = (x > 18 && x < 32 && Math.abs(cy) <= (30 - x));
      S_[i] = (shaft || head) ? 1 : 0;
    }
    return { S_, D_, P_ };
  }, []);
  const draw = useCallback((cv, buf, on, off) => {
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(GW, GH);
    for (let i = 0; i < GW * GH; i++) {
      const c = buf[i] ? on : off;
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    const off2 = document.createElement("canvas"); off2.width = GW; off2.height = GH;
    off2.getContext("2d").putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(off2, 0, 0, GW * S, GH * S);
  }, [S_, D_, P_]);
  const sRef = useRef(null), dRef = useRef(null), pRef = useRef(null), rRef = useRef(null);
  const ink = [33, 33, 40], paper = [244, 240, 230];
  const col = hexRgb(color);
  useEffect(() => {
    const R = ROPS[rop].f;
    const res = new Uint8Array(GW * GH);
    for (let i = 0; i < GW * GH; i++) res[i] = (R(S_[i], D_[i], P_[i]) & 1);
    if (sRef.current) draw(sRef.current, S_, ink, paper);
    if (dRef.current) draw(dRef.current, D_, [14, 155, 166], paper);
    if (pRef.current) draw(pRef.current, P_, [224, 135, 28], paper);
    if (rRef.current) draw(rRef.current, res, col, paper);
  }, [rop, S_, D_, P_, draw, color]);
  const cvProps = { width: GW * S, height: GH * S, style: { width: GW * S, height: GH * S, maxWidth: "100%" } };
  return (
    <div className="toy" style={{ "--seg": color }}>
      <div className="toy-head">BitBlt · ternary raster operation</div>
      <div className="toy-body">
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="mono" style={{ fontSize: 12 }}>ROP:</span>
          <select value={rop} onChange={e => setRop(e.target.value)}>
            {Object.keys(ROPS).map(k => <option key={k} value={k}>{k} — {ROPS[k].t}</option>)}
          </select>
        </div>
        <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
          <RopPanel label="source (S)" r={sRef} cvProps={cvProps} />
          <RopPanel label="dest (D)" r={dRef} cvProps={cvProps} />
          <RopPanel label="pattern (P)" r={pRef} cvProps={cvProps} />
          <span style={{ fontFamily: "var(--disp)", fontSize: 26, alignSelf: "center" }}>=</span>
          <RopPanel label="result" r={rRef} cvProps={cvProps} />
        </div>
        <div className="legend2">
          Every BitBlt carries a raster-op: a truth table over Source, Destination and Pattern. Try{" "}
          <b>SRCAND</b> then <b>SRCINVERT</b> — that two-step is how a sprite gets a transparent background.
          SRCCOPY is the boring one. The other 255 are where the fun lives.
        </div>
      </div>
    </div>
  );
}

const TOYS = { queue: QueueToy, palette: PaletteToy, rop: RopToy };

// =====================================================================
//  CASE FILE MODAL
// =====================================================================
function CaseModal({ fix, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  if (!fix) return null;
  const c = catColor(fix.cat);
  const Toy = fix.toy ? TOYS[fix.toy] : null;
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="win modal" style={{ "--seg": c }} onClick={e => e.stopPropagation()}>
        <div className="win-bar">
          <span className="dots"><i></i><i></i><i></i></span>
          <span className="title">CASE FILE {fix.n} — {catLabel(fix.cat)}.DLL</span>
          <span className="ctrls"><b>–</b><b>▢</b><b onClick={onClose} style={{ cursor: "pointer" }}>✕</b></span>
        </div>
        <div className="win-body">
          <div className="case-head">
            <div className="meta">
              <span className="chip" style={{ background: c, color: "#fff", borderColor: "var(--ink)" }}>{catLabel(fix.cat)}</span>
              <span className="mono" style={{ color: "var(--ink-faint)" }}>{fix.ord}</span>
              <span style={{ marginLeft: "auto" }}><Difficulty n={fix.spanners} color={c} /></span>
            </div>
            <h3>{fix.title}</h3>
          </div>
          <div className="case-body">
            <Row label="Symptom" text={fix.symptom} />
            <Row label="Root cause" text={fix.cause} />
            <Row label="The fix" text={fix.fix} />
            {Toy ? <div style={{ paddingTop: 4 }}><Toy color={c} /></div> : null}
            <div className="case-row unlocks">
              <div className="rl">What it unlocks</div>
              <p>{fix.unlocks}</p>
            </div>
            <Row label="War story" text={fix.war} cls="war" />
          </div>
          <div className="kbd-hint">press ESC or click outside to close · case {fix.n} of 30</div>
        </div>
      </div>
    </div>
  );
}
function Row({ label, text, cls = "" }) {
  return (
    <div className={"case-row " + cls}>
      <div className="rl">{label}</div>
      <p>{text}</p>
    </div>
  );
}

// ---- colour helpers ----
function hsl2rgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
function hexRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

Object.assign(window, {
  Win, Difficulty, QueueToy, PaletteToy, RopToy, CaseModal, Row,
  catColor, catLabel, SUBS, SUBMAP, hsl2rgb, hexRgb,
});
