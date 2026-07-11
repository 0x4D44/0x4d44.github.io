// ============================================================================
// Brilliancy — the director.
//
// scenes.js says WHAT happens (verified chess + script); this file makes it
// happen: board rendering (nodes are reused, never rebuilt — see the repo's
// lessons on replaceChildren flicker), pacing, sound, and the interaction
// grammar (instincts → guided move → combo clicks).
// ============================================================================

import {
  parseFEN, START_FEN, playMovetext, fileOf, rankOf, typeOf, colorOf, isCheckmate,
} from "./engine.js";
import { META, SCENES, CROSSTABLE, DEFAULT_NUDGES } from "./scenes.js";

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const STORE_KEY = "0x4d44.brilliancy.v1";
const store = {
  read() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) ?? {}; } catch { return {}; } },
  write(patch) {
    const cur = store.read();
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...cur, ...patch })); } catch { /* private mode */ }
  },
};

// ── pacing ──────────────────────────────────────────────────────────────────

let hurry = false;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const pace = () => (hurry ? 0.22 : reducedMotion ? 0.7 : 1);
/** Keep the CSS --pace variable (which scales transition durations) in lockstep with JS timing. */
const syncPace = () => document.documentElement.style.setProperty("--pace", String(pace()));
syncPace();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * pace()));
const sleepRaw = (ms) => new Promise((r) => setTimeout(r, ms));

// ── sound ───────────────────────────────────────────────────────────────────

const SFX = (() => {
  let ctx = null, master = null, murmurGain = null, muted = store.read().muted ?? false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // crowd murmur bed: looping filtered noise, gain 0 until raised
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995; d[i] = last * 18; }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
      murmurGain = ctx.createGain(); murmurGain.gain.value = 0;
      src.connect(lp).connect(murmurGain).connect(master);
      src.start();
      return true;
    } catch { return false; }
  }
  const now = () => ctx.currentTime;

  function noise(dur, { freq = 1800, q = 1, gain = 0.3, type = "bandpass" } = {}) {
    if (!ensure() || ctx.state !== "running") return;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now());
    g.gain.exponentialRampToValueAtTime(0.001, now() + dur);
    src.connect(f).connect(g).connect(master);
    src.start();
  }
  function tone(freq, dur, { gain = 0.12, type = "sine", slide = null } = {}) {
    if (!ensure() || ctx.state !== "running") return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, now() + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now());
    g.gain.exponentialRampToValueAtTime(0.001, now() + dur);
    o.connect(g).connect(master);
    o.start(); o.stop(now() + dur + 0.05);
  }

  const LYDIAN = [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 24];
  return {
    unlock() { if (ensure() && ctx.state === "suspended") ctx.resume(); },
    get muted() { return muted; },
    setMuted(m) { muted = m; store.write({ muted: m }); if (master) master.gain.value = m ? 0 : 0.5; },
    thock(capture) { noise(0.07, { freq: capture ? 700 : 1100, gain: capture ? 0.5 : 0.32 }); if (capture) tone(140, 0.09, { gain: 0.1 }); },
    tick() { noise(0.025, { freq: 3200, gain: 0.05 }); },
    ratchet() { noise(0.03, { freq: 2400, gain: 0.09 }); },
    thud() { tone(170, 0.16, { gain: 0.15, slide: 90 }); },
    slam() { tone(130, 0.4, { gain: 0.3, slide: 48 }); noise(0.28, { freq: 300, gain: 0.4, type: "lowpass" }); },
    gasp() { noise(0.5, { freq: 900, q: 0.6, gain: 0.16 }); },
    blip(step) { const f = 330 * Math.pow(2, (LYDIAN[Math.min(step, LYDIAN.length - 1)]) / 12); tone(f, 0.14, { gain: 0.13, type: "triangle" }); },
    plink() { const f = 1400 * Math.pow(2, [0, 3, 5, 7, 10][Math.floor(Math.random() * 5)] / 12); tone(f, 0.35, { gain: 0.06 }); },
    applause(dur = 2.2) {
      if (!ensure() || ctx.state !== "running") return;
      const n = Math.floor(dur * 26);
      for (let i = 0; i < n; i++) setTimeout(() => noise(0.045, { freq: 1500 + Math.random() * 2500, gain: 0.1 + Math.random() * 0.14 }), Math.random() * dur * 1000);
    },
    murmur(level, ramp = 1.2) { if (ensure() && murmurGain) { murmurGain.gain.cancelScheduledValues(now()); murmurGain.gain.linearRampToValueAtTime(level * 0.5, now() + ramp); } },
    silence(ms) {
      if (!ensure() || !master) return;
      const g = master.gain;
      g.cancelScheduledValues(now());
      g.setValueAtTime(0.0001, now());
      g.setValueAtTime(muted ? 0 : 0.5, now() + ms / 1000);
    },
    fansDown() { noise(2.4, { freq: 240, gain: 0.2, type: "lowpass" }); tone(110, 2.2, { gain: 0.08, slide: 40 }); },
    fanfare() { [0, 4, 7, 12].forEach((s, i) => setTimeout(() => tone(392 * Math.pow(2, s / 12), 0.5, { gain: 0.1, type: "triangle" }), i * 130)); },
  };
})();

// ── board view ──────────────────────────────────────────────────────────────

const Board = (() => {
  const board = $("#board");
  let piecesLayer = null;
  let squares = [];       // 64 DOM squares, indexed by engine square
  let pieceAt = new Map(); // engine square index -> piece element
  let orient = "w";       // which colour sits at the bottom (the player)

  const disp = (i) => orient === "w"
    ? { df: fileOf(i), dr: 7 - rankOf(i) }
    : { df: 7 - fileOf(i), dr: rankOf(i) };

  function place(elp, i) {
    const { df, dr } = disp(i);
    elp.style.setProperty("--df", df);
    elp.style.setProperty("--dr", dr);
  }

  function build(orientation) {
    orient = orientation;
    board.replaceChildren();
    squares = [];
    const frag = document.createDocumentFragment();
    for (let dr = 0; dr < 8; dr++) {
      for (let df = 0; df < 8; df++) {
        const f = orient === "w" ? df : 7 - df;
        const r = orient === "w" ? 7 - dr : dr;
        const i = r * 8 + f;
        const s = el("div", "sq" + ((f + r) % 2 === 0 ? " dark" : ""));
        s.dataset.i = i;
        if (dr === 7) s.appendChild(el("span", "coord file", "abcdefgh"[f]));
        if (df === 0) s.appendChild(el("span", "coord rank", String(r + 1)));
        squares[i] = s;
        frag.appendChild(s);
      }
    }
    piecesLayer = el("div");
    piecesLayer.id = "pieces";
    frag.appendChild(piecesLayer);
    board.appendChild(frag);
  }

  function makePiece(p, i) {
    const d = el("div", `piece ${colorOf(p)} spawn`);
    d.innerHTML = `<svg viewBox="0 0 45 45" aria-hidden="true"><use href="#pc-${typeOf(p)}"/></svg>`;
    place(d, i);
    piecesLayer.appendChild(d);
    d.addEventListener("animationend", () => d.classList.remove("spawn"), { once: true });
    return d;
  }

  function setPosition(state) {
    piecesLayer.replaceChildren();
    pieceAt = new Map();
    for (let i = 0; i < 64; i++) {
      const p = state.board[i];
      if (p) pieceAt.set(i, makePiece(p, i));
    }
  }

  function clearMarks(...classes) {
    const cls = classes.length ? classes : ["lastmove", "pulse-from", "pulse-to", "selected", "trail"];
    for (const s of squares) s.classList.remove(...cls);
  }
  const mark = (i, cls) => squares[i]?.classList.add(cls);

  /** Animate a legal move. Returns after the piece lands. */
  async function animate(move, { sac = false, instant = false } = {}) {
    const mover = pieceAt.get(move.from);
    if (!mover) return;
    const dur = instant ? 90 : (sac ? 950 : 280) * pace();
    // captured piece (including en passant victim)
    let capSq = move.to;
    if (move.ep) capSq = move.to + (colorOf(move.piece) === "w" ? -8 : 8);
    const victim = pieceAt.get(capSq);
    clearMarks("lastmove");
    mark(move.from, "lastmove"); mark(move.to, "lastmove");
    mover.classList.add("moving");
    if (sac) mover.classList.add("sac");
    if (instant) mover.style.transitionDuration = "90ms";
    place(mover, move.to);
    if (victim && victim !== mover) {
      setTimeout(() => { victim.classList.add("captured"); setTimeout(() => victim.remove(), 350); }, dur * 0.7);
      pieceAt.delete(capSq);
    }
    pieceAt.delete(move.from);
    pieceAt.set(move.to, mover);
    if (move.castle) {
      const back = colorOf(move.piece) === "w" ? 0 : 7;
      const [rf, rt] = move.castle === "K" ? [back * 8 + 7, back * 8 + 5] : [back * 8, back * 8 + 3];
      const rook = pieceAt.get(rf);
      if (rook) { place(rook, rt); pieceAt.delete(rf); pieceAt.set(rt, rook); }
    }
    await sleepRaw(dur + 30);
    mover.classList.remove("moving", "sac");
    mover.style.transitionDuration = "";
    if (move.promo) {
      mover.querySelector("use").setAttribute("href", `#pc-${move.promo}`);
    }
    SFX.thock(!!move.capture);
  }

  function tipKing(color, slow = false) {
    for (const [i, p] of pieceAt) {
      const glyph = p.querySelector("use").getAttribute("href");
      if (glyph === "#pc-K" && p.classList.contains(color)) {
        if (slow) p.style.transitionDuration = "1.8s";
        p.classList.add("tipped");
        return;
      }
    }
  }

  function onTap(handler) {
    const fn = (ev) => {
      const sq = ev.target.closest(".sq");
      handler(sq ? Number(sq.dataset.i) : null);
    };
    board.addEventListener("pointerdown", fn);
    return () => board.removeEventListener("pointerdown", fn);
  }

  return { build, setPosition, animate, clearMarks, mark, tipKing, onTap, disp, el: board };
})();

// ── booth: feed, scoresheet, clocks, eval bar ───────────────────────────────

const Feed = (() => {
  const box = $("#feed");
  const TAGS = { cass: "CASS", ply: "DR PLY", mach: "PROMETHEUS", room: "", beat: "" };
  async function say(who, text, { type = true } = {}) {
    const line = el("div", `feed-line ${who}`);
    if (TAGS[who]) line.appendChild(el("span", "tag", TAGS[who]));
    // Screen readers get the whole line at once; the typewriter below is visual-only.
    line.appendChild(el("span", "sr-only", text));
    const txt = el("span", "txt");
    txt.setAttribute("aria-hidden", "true");
    line.appendChild(txt);
    box.appendChild(line);
    while (box.children.length > 90) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
    if (!type || hurry || reducedMotion) {
      txt.textContent = text;
      box.scrollTop = box.scrollHeight;
      if (!hurry) await sleepRaw(Math.min(900, 240 + text.length * 6));
      return;
    }
    const caret = el("span", "caret", "▌");
    line.appendChild(caret);
    const step = Math.min(16, 2400 / text.length);
    for (let i = 0; i < text.length; i++) {
      if (hurry) { txt.textContent = text; break; } // ≫ pressed mid-line: finish instantly
      txt.textContent = text.slice(0, i + 1);
      if (i % 3 === 0) box.scrollTop = box.scrollHeight;
      await sleepRaw(step);
    }
    caret.remove();
    box.scrollTop = box.scrollHeight;
    await sleepRaw(200);
  }
  async function script(lines) {
    for (const [who, text] of lines ?? []) {
      await say(who, text);
      await sleep(who === "room" ? 220 : 380);
    }
  }
  return { say, script, clear: () => box.replaceChildren() };
})();

const Sheet = (() => {
  const list = $("#scoresheet");
  let liByMoveNo = new Map();
  let plyBase = 1; // fullmove number of the first recorded ply's position
  let lastSpan = null;
  function reset(startFullmove, startTurn) {
    list.replaceChildren();
    liByMoveNo = new Map();
    plyBase = startFullmove;
    lastSpan = null;
    if (startTurn === "b") {
      // black to move first: pad the white cell
      addSan("…", "w", startFullmove, true);
    }
  }
  function addSan(san, color, fullmove, pad = false) {
    let li = liByMoveNo.get(fullmove);
    if (!li) {
      li = el("li");
      li.appendChild(el("span", "no", fullmove + "."));
      li.appendChild(el("span", "wm"));
      li.appendChild(el("span", "bm"));
      liByMoveNo.set(fullmove, li);
      list.appendChild(li);
    }
    const span = li.querySelector(color === "w" ? ".wm" : ".bm");
    span.textContent = san;
    if (!pad) {
      lastSpan?.classList.remove("cur");
      span.classList.add("cur");
      lastSpan = span;
    }
    list.parentElement.scrollTop = list.parentElement.scrollHeight;
  }
  function addNote(text) {
    const li = el("li", "note", text);
    list.appendChild(li);
    list.parentElement.scrollTop = list.parentElement.scrollHeight;
  }
  return { reset, addSan, addNote };
})();

const Clocks = (() => {
  let time = { you: 5400, opp: 5400 };
  const fmt = (s) => {
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
  };
  const render = () => {
    $("#you-clock").textContent = fmt(time.you);
    $("#opp-clock").textContent = fmt(time.opp);
    $("#opp-clock").classList.toggle("burning", time.opp < 300);
  };
  return {
    reset(secs) { time = { you: secs, opp: secs }; render(); },
    burn(side, secs) { time[side] -= secs; render(); },
    async think(side, secs, ms) {
      // animate `secs` draining over `ms` wall-clock (compressed when hurried)
      const t0 = time[side];
      const wall = ms * pace();
      const steps = Math.max(3, Math.floor(wall / 250));
      for (let i = 1; i <= steps; i++) {
        time[side] = t0 - (secs * i) / steps;
        render();
        if (i % 4 === 0) SFX.tick();
        await sleepRaw(wall / steps);
      }
    },
    stop() { $("#you-clock").classList.add("stopped"); $("#opp-clock").classList.add("stopped"); },
  };
})();

const Eval = (() => {
  const bar = $("#evalbar"), fill = $("#evalbar-you");
  let cur = 0;
  const pct = (e) => 50 + 50 * Math.tanh(e / 4.5);
  function set(e, { slam = false } = {}) {
    cur = e;
    fill.style.height = pct(e) + "%";
    if (slam) {
      const hw = el("div", "hiwater");
      hw.style.bottom = Math.min(99, pct(e) + 2.5) + "%";
      bar.appendChild(hw);
      requestAnimationFrame(() => { hw.style.opacity = "0"; setTimeout(() => hw.remove(), 3600); });
      SFX.slam();
    }
  }
  async function flicker(dip, then) {
    set(dip);
    await sleep(850);
    set(then, { slam: true });
  }
  return { set, flicker, get: () => cur, die() { bar.classList.add("dead"); }, revive() { bar.classList.remove("dead"); } };
})();

// ── board FX ────────────────────────────────────────────────────────────────

const FX = {
  async stamp(text) {
    const s = $("#stamp");
    s.textContent = text;
    s.classList.remove("hit");
    void s.offsetWidth;
    s.classList.add("hit");
    $("#board-frame").classList.add("shake");
    setTimeout(() => $("#board-frame").classList.remove("shake"), 420);
    await sleep(500);
  },
  whisper(text, ms = 2400) {
    const w = $("#whisper");
    w.textContent = text;
    w.classList.add("show");
    clearTimeout(w._t);
    w._t = setTimeout(() => w.classList.remove("show"), ms * pace());
  },
  coins() {
    const box = $("#coins");
    const n = reducedMotion ? 14 : 46;
    const drop = box.clientHeight || 360; // fall distance in px — %-translate would be relative to the coin itself
    for (let i = 0; i < n; i++) {
      const c = el("div", "coin");
      c.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><use href="#orn-coin"/></svg>`;
      c.style.setProperty("--x", (3 + Math.random() * 92) + "%");
      c.style.setProperty("--s", (8 + Math.random() * 8) + "px");
      c.style.setProperty("--d", (0.8 + Math.random() * 0.9) + "s");
      c.style.setProperty("--delay", (Math.random() * 1.6) + "s");
      c.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
      c.style.setProperty("--fall", Math.round(drop * (0.72 + Math.random() * 0.24)) + "px");
      box.appendChild(c);
      setTimeout(() => SFX.plink(), (parseFloat(c.style.getPropertyValue("--delay")) * 1000 + parseFloat(c.style.getPropertyValue("--d")) * 780));
    }
  },
  clearCoins() { $("#coins").replaceChildren(); },
};

// ── overlay ─────────────────────────────────────────────────────────────────

const Overlay = (() => {
  const ov = $("#overlay");
  function show(card) {
    ov.replaceChildren(card);
    ov.hidden = false;
    ov.classList.remove("fading");
    ov.scrollTop = 0;
  }
  async function hide() {
    ov.classList.add("fading");
    await sleepRaw(600);
    ov.hidden = true;
    ov.classList.remove("fading");
    ov.replaceChildren();
  }
  function button(label, quiet = false) {
    return el("button", "ov-btn" + (quiet ? " quiet" : ""), label);
  }
  const waitFor = (btn) => new Promise((r) => btn.addEventListener("click", () => { SFX.unlock(); SFX.thock(false); r(); }, { once: true }));
  return { show, hide, button, waitFor, el: ov };
})();

// odometer: rolling digit columns
function odometer(value) {
  const wrap = el("span", "odo");
  const s = String(value);
  for (const ch of s) {
    const d = el("span", "digit");
    const reel = el("span", "reel");
    if (/\d/.test(ch)) {
      for (let i = 0; i <= 9; i++) reel.appendChild(el("span", null, String(i))).style.display = "block";
      d.appendChild(reel);
      d._set = (n) => { reel.style.transform = `translateY(${-n * 1.25}em)`; };
      d._set(0);
    } else {
      d.textContent = ch;
    }
    wrap.appendChild(d);
  }
  wrap._roll = async (target) => {
    const digits = [...wrap.querySelectorAll(".digit")].filter((d) => d._set);
    const str = String(target).padStart(digits.length, "0");
    digits.forEach((d, i) => setTimeout(() => d._set(Number(str[i])), i * 120));
    await sleepRaw(digits.length * 120 + 900);
  };
  return wrap;
}

function miniBoard(fen) {
  const st = parseFEN(fen);
  const b = el("div", "mini-board");
  for (let dr = 0; dr < 8; dr++) {
    for (let df = 0; df < 8; df++) {
      const f = df, r = 7 - dr;
      const p = st.board[r * 8 + f];
      const s = el("div", "msq" + ((f + r) % 2 === 0 ? " dark" : "") + (p ? " " + colorOf(p) : ""));
      if (p) s.innerHTML = `<svg viewBox="0 0 45 45" aria-hidden="true"><use href="#pc-${typeOf(p)}"/></svg>`;
      b.appendChild(s);
    }
  }
  return b;
}

function crosstable(roundsDone) {
  const t = el("table", "xtable");
  const head = el("tr");
  head.appendChild(el("th", "name-col", ""));
  CROSSTABLE.seats.forEach((_, i) => head.appendChild(el("th", null, String(i + 1))));
  head.appendChild(el("th", null, "Σ"));
  t.appendChild(head);
  CROSSTABLE.seats.forEach((name, i) => {
    const tr = el("tr", name === "You" ? "you" : null);
    const nameCell = el("td", "name-col", `${i + 1}  ${name}`);
    tr.appendChild(nameCell);
    let score = 0;
    CROSSTABLE.seats.forEach((_, j) => {
      const td = el("td");
      if (i === j) td.textContent = "×";
      else {
        const r = CROSSTABLE.result(i, j, roundsDone);
        td.textContent = r === null ? "·" : r === 1 ? "1" : r === 0 ? "0" : "½";
        if (r === 1) td.classList.add("win");
        if (r !== null) score += r;
      }
      tr.appendChild(td);
    });
    tr.appendChild(el("td", null, score % 1 ? score - 0.5 + "½" : String(score)));
    t.appendChild(tr);
  });
  const wrap = el("div");
  wrap.style.overflowX = "auto";
  wrap.appendChild(t);
  return wrap;
}

// ── interaction: instincts sheet ────────────────────────────────────────────

const Choices = (() => {
  const box = $("#choices");
  /** Present instincts; resolves when the destiny option is chosen. */
  function present(moment, bpm) {
    return new Promise((resolve) => {
      box.replaceChildren();
      box.hidden = false;
      const p = el("div", "prompt", moment.prompt);
      box.appendChild(p);
      for (const inst of moment.instincts) {
        const b = el("button", "instinct");
        const label = el("span", "label", inst.text);
        b.appendChild(label);
        if (inst.sub) b.appendChild(el("span", "sub", inst.sub));
        if (inst.destiny) {
          b.classList.add("heartbeat");
          b.style.setProperty("--bpm", bpm);
        }
        b.addEventListener("click", async () => {
          SFX.unlock();
          if (inst.destiny) {
            SFX.gasp();
            box.classList.add("leaving");
            await sleepRaw(320);
            box.hidden = true;
            box.classList.remove("leaving");
            resolve();
          } else if (!b.classList.contains("spent")) {
            SFX.thud();
            b.classList.add("spent");
            if (inst.refusal) b.appendChild(el("span", "footnote", inst.refusal));
          }
        });
        box.appendChild(b);
      }
    });
  }
  return { present, hide: () => { box.hidden = true; } };
})();

/** Guided move input: the player must click the from-square then the to-square. */
let guidedTaught = false;
function awaitGuidedMove(move, nudges = []) {
  return new Promise((resolve) => {
    let selected = false;
    let nudgeIdx = 0;
    const hintTimer = setTimeout(() => {
      Board.mark(move.from, "pulse-from");
      if (!guidedTaught) {
        guidedTaught = true;
        FX.whisper("Your hand knows. Touch the glowing square — then the square it aches for.", 4600);
      }
    }, 2600 * pace());
    const destTimer = { t: null };
    const off = Board.onTap((i) => {
      SFX.unlock();
      if (i === null) return;
      if (!selected) {
        if (i === move.from) {
          selected = true;
          clearTimeout(hintTimer);
          Board.clearMarks("pulse-from");
          Board.mark(move.from, "selected");
          SFX.tick();
          destTimer.t = setTimeout(() => Board.mark(move.to, "pulse-to"), 1500 * pace());
        } else {
          const line = nudges.length ? nudges[nudgeIdx++ % nudges.length] : "Not that one. You know it is not that one.";
          FX.whisper(line);
          SFX.thud();
        }
      } else {
        if (i === move.to) {
          clearTimeout(destTimer.t);
          Board.clearMarks("selected", "pulse-to", "pulse-from");
          off();
          resolve();
        } else if (i === move.from) { /* re-tap: stay selected */ }
        else {
          FX.whisper(nudges.length ? nudges[nudgeIdx++ % nudges.length] : "Deeper. The move goes deeper.");
          SFX.thud();
        }
      }
    });
  });
}

/** Combo tap: destination pre-glows; any tap fires. */
let comboTaught = false;
function awaitComboTap(move) {
  return new Promise((resolve) => {
    Board.mark(move.from, "pulse-from");
    Board.mark(move.to, "pulse-to");
    if (!comboTaught) {
      comboTaught = true;
      FX.whisper("Tap the board — anywhere. Keep tapping. It is a drumroll now.", 3600);
    }
    const off = Board.onTap(() => {
      Board.clearMarks("pulse-from", "pulse-to");
      off();
      resolve();
    });
  });
}

// ── the director ────────────────────────────────────────────────────────────

const Director = {
  async run() {
    const saved = store.read();
    let startAt = Math.min(saved.round ?? 0, SCENES.length);
    document.querySelector("#event-title").textContent = META.event;
    $("#event-sub").textContent = META.venue;

    await this.title(startAt);
    if (startAt >= SCENES.length) startAt = 0; // finished before; play again

    for (let i = startAt; i < SCENES.length; i++) {
      await this.roundCard(i);
      await this.scene(SCENES[i]);
      // Keep the finale un-marked until the reveal has played: an interrupted
      // reveal then resumes at Round VIII instead of skipping the payoff.
      if (i < SCENES.length - 1) store.write({ round: i + 1 });
    }
    await this.reveal();
    store.write({ round: SCENES.length });
    await this.certificate(); // "play the night again" writes round: 0 and reloads
  },

  async title(startAt) {
    const card = el("div", "ov-card");
    card.appendChild(el("span", "ov-kicker smallcaps", META.venue));
    card.appendChild(el("div", "ov-title", "Brilliancy"));
    card.appendChild(el("div", "ov-sub", "an evening of impossible chess"));
    card.appendChild(el("div", "rule"));
    const body = el("div", "ov-body");
    for (const p of META.titleText) body.appendChild(el("p", null, p));
    body.appendChild(el("p", "dim", META.titleFoot));
    card.appendChild(body);
    const actions = el("div", "ov-actions");
    const btn = Overlay.button(startAt > 0 && startAt < SCENES.length ? `Return to the hall — round ${startAt + 1}` : "Take your seat");
    actions.appendChild(btn);
    if (startAt > 0) {
      const again = Overlay.button("Begin the night again", true);
      again.style.marginLeft = "10px";
      actions.appendChild(again);
      again.addEventListener("click", () => { store.write({ round: 0 }); location.reload(); });
    }
    card.appendChild(actions);
    Overlay.show(card);
    await Overlay.waitFor(btn);
    SFX.murmur(0.12);
    await Overlay.hide();
  },

  async roundCard(idx) {
    const scene = SCENES[idx];
    const prev = idx > 0 ? SCENES[idx - 1] : null;
    const card = el("div", "ov-card");

    if (prev?.outcome.headlines?.length) {
      card.appendChild(el("span", "ov-kicker smallcaps", "the morning papers, somehow already printed"));
      const clips = el("div", "clips");
      for (const h of prev.outcome.headlines) {
        const c = el("div", `clip ${h.style}`);
        c.appendChild(el("span", "clip-src", h.src ?? "The Vosskerry Intelligencer"));
        c.appendChild(document.createTextNode(h.text));
        clips.appendChild(c);
      }
      card.appendChild(clips);

      const plaque = el("div", "rating-plaque");
      plaque.appendChild(el("span", "rp-label", "your rating"));
      const odo = odometer(prev.youRatingAfter);
      plaque.appendChild(odo);
      card.appendChild(el("div")).appendChild(plaque);
      setTimeout(() => odo._roll(prev.youRatingAfter), 700);

      if (!scene.exhibition) card.appendChild(crosstable(idx));
      else {
        card.appendChild(crosstable(idx));
        const note = el("p", "dim");
        note.style.marginTop = "10px";
        note.textContent = META.sevenNote;
        card.appendChild(note);
      }
      card.appendChild(el("div", "rule"));
    }

    card.appendChild(el("span", "ov-kicker smallcaps", scene.exhibition ? "after the banquet — an exhibition" : `round ${scene.roundLabel}`));
    card.appendChild(el("div", "ov-title", scene.title));
    const body = el("div", "ov-body");
    for (const p of scene.intro) body.appendChild(el("p", null, p));
    card.appendChild(body);

    const oc = el("div", "opp-card");
    const pf = el("div", "plate-portrait", scene.opponent.glyph);
    oc.appendChild(pf);
    const meta = el("div");
    meta.appendChild(el("div", "oc-name", scene.opponent.name));
    meta.appendChild(el("div", "oc-rating", scene.opponent.ratingLabel ?? `FIDE ${scene.opponent.rating}`));
    meta.appendChild(el("div", "oc-bio", scene.opponent.bio));
    oc.appendChild(meta);
    card.appendChild(oc);

    if (scene.arbiterNote) {
      const an = el("p", "dim");
      an.style.marginTop = "12px";
      an.textContent = scene.arbiterNote;
      card.appendChild(an);
    }

    const actions = el("div", "ov-actions");
    const btn = Overlay.button(scene.exhibition ? "Approach the machine" : "Sit down");
    actions.appendChild(btn);
    card.appendChild(actions);
    Overlay.show(card);
    await Overlay.waitFor(btn);
    await Overlay.hide();
  },

  async scene(scene) {
    const you = scene.youAre;
    document.body.classList.toggle("mach-mode", !!scene.machine);
    $("#round-label").textContent = scene.exhibition ? "Exhibition" : `Round ${scene.roundLabel} of VII`;
    $("#opp-name").textContent = scene.opponent.name;
    $("#opp-sub").textContent = scene.opponent.sub;
    $("#opp-portrait").textContent = scene.opponent.glyph;
    $("#opp-plate").classList.toggle("opp-mach", !!scene.machine);
    $("#you-sub").textContent = scene.youRatingBefore;
    Feed.clear();
    FX.clearCoins();
    Eval.revive();

    // build board + position
    const startState = parseFEN(scene.startFen ?? START_FEN);
    const { moves, sans, states } = playMovetext(startState, scene.line);
    Board.build(you);
    Board.setPosition(startState);
    Clocks.reset(scene.clockSecs ?? 5400);
    Sheet.reset(startState.fullmove, startState.turn);
    Eval.set(scene.evalStart ?? 0);
    if (scene.oldStyleNote) Sheet.addNote(scene.oldStyleNote);

    await Feed.script(scene.onSit);

    const beats = scene.beats ?? {};
    let comboUntil = -1, comboStep = 0, comboLines = null, comboLineIdx = 0, comboSilence = false;

    let ply = 0;
    while (ply < sans.length) {
      const beat = beats[ply] ?? {};
      const isYours = states[ply].turn === you;
      const move = moves[ply];
      const fullmove = states[ply].fullmove;

      // ── montage stretches ──
      if (ply < scene.preludeTo || beat.montageTo || beat.techniqueTo) {
        const wasPrelude = ply < scene.preludeTo;
        const end = wasPrelude ? scene.preludeTo : (beat.montageTo ?? beat.techniqueTo);
        if (beat.say) await Feed.script(beat.say);
        $("#board").classList.add("montage");
        const n = end - ply;
        const t0 = scene.montagePace?.[0] ?? 420, t1 = scene.montagePace?.[1] ?? 110;
        for (let k = 0; ply < end; k++, ply++) {
          const ease = 1 - Math.pow(1 - Math.min(1, k / Math.max(1, n - 1)), 2);
          const mSan = scene.oldStyle && ply < scene.oldStyle.length ? scene.oldStyle[ply] : sans[ply];
          Board.animate(moves[ply], { instant: true });
          Sheet.addSan(mSan, states[ply].turn, states[ply].fullmove);
          SFX.ratchet();
          const drift = scene.montageDrift?.[ply];
          if (drift) Feed.say(drift[0], drift[1], { type: false });
          await sleep(t0 - (t0 - t1) * ease);
        }
        $("#board").classList.remove("montage");
        Clocks.burn("opp", 600 + Math.random() * 900);
        Clocks.burn("you", 40 + Math.random() * 60);
        SFX.thud();
        if (scene.oldStyleAfter && scene.oldStyle) Sheet.addNote(scene.oldStyleAfter);
        // Scene-level crystallize belongs to the opening prelude only — a later
        // technique montage must not replay it out of context.
        const crys = ply < sans.length ? (beats[ply]?.crystallize ?? (wasPrelude ? scene.crystallize : null)) : null;
        if (crys) await Feed.script(crys);
        continue;
      }

      // ── spoken lines before the ply ──
      if (beat.say) await Feed.script(beat.say);
      if (beat.think) {
        $("#opp-plate").classList.add("thinking");
        await Clocks.think("opp", beat.think, beat.thinkMs ?? 2600);
        $("#opp-plate").classList.remove("thinking");
      }
      if (beat.mono) $("#board").classList.add("mono");

      // ── the ply itself ──
      if (beat.type === "moment") {
        await Choices.present(beat, 50 + (scene.round ?? 1) * 6);
        await awaitGuidedMove(move, beat.nudges ?? scene.nudges ?? DEFAULT_NUDGES);
        if (beat.silence) SFX.silence(420);
        await Board.animate(move, { sac: beat.slow });
        Sheet.addSan(sans[ply], states[ply].turn, fullmove);
        Clocks.burn("you", 2 + Math.random() * 4);
        if (beat.stamp) { await FX.stamp(beat.stamp); }
        if (beat.evalFlicker !== undefined) await Eval.flicker(beat.evalFlicker, beat.eval);
        else if (beat.eval !== undefined) Eval.set(beat.eval, { slam: true });
        SFX.murmur(0.3); setTimeout(() => SFX.murmur(0.12, 3), 2500);
        if (beat.after) await Feed.script(beat.after);
      } else if (beat.type === "combo" || (comboUntil >= ply && isYours)) {
        if (beat.type === "combo") {
          comboUntil = beat.until;
          comboStep = 0;
          comboLines = beat.lines ?? ["Check."];
          comboLineIdx = 0;
          comboSilence = !!beat.silence;
          if (beat.wind) await Feed.script(beat.wind);
        }
        await awaitComboTap(move);
        // The hall goes silent on the combo's FINAL blow (the mate), not its first check.
        if (comboSilence && ply === comboUntil) SFX.silence(420);
        await Board.animate(move, { instant: comboStep > 0 });
        Sheet.addSan(sans[ply], states[ply].turn, fullmove);
        SFX.blip(comboStep);
        SFX.murmur(Math.min(0.65, 0.15 + comboStep * 0.07), 0.4);
        Feed.say("beat", comboLines[comboLineIdx++ % comboLines.length], { type: false });
        comboStep++;
        await sleepRaw(Math.min(90, 25 + comboStep * 8)); // growing hit-stop
        if (beat.eval !== undefined) Eval.set(beat.eval);
        if (ply >= comboUntil) {
          comboUntil = -1;
          SFX.murmur(0.14, 2.5);
          if (beat.after) await Feed.script(beat.after);
        }
      } else {
        // auto ply (opponent replies inside a combo run land instantly)
        const inCombo = comboUntil >= ply;
        const base = inCombo ? 130 : isYours ? 620 : (scene.machine ? 260 : 1300);
        await sleep(beat.pace ?? base);
        if (!isYours && !scene.machine && (beat.pace ?? base) > 900) Clocks.burn("opp", 20 + Math.random() * 90);
        if (!isYours && scene.machine) SFX.tick();
        await Board.animate(move, { sac: beat.slow, instant: inCombo });
        Sheet.addSan(sans[ply], states[ply].turn, fullmove);
        if (beat.stamp) await FX.stamp(beat.stamp);
        if (beat.evalFlicker !== undefined) await Eval.flicker(beat.evalFlicker, beat.eval);
        else if (beat.eval !== undefined) Eval.set(beat.eval, { slam: Math.abs(beat.eval - Eval.get()) > 2 });
        if (beat.after) await Feed.script(beat.after);
      }
      ply++;
    }

    // ── outcome ──
    const finalState = states[states.length - 1];
    const out = scene.outcome;
    if (out.kind === "mate" && isCheckmate(finalState)) {
      await FX.stamp("#");
      Eval.set(10);
    }
    await this.ritual(scene, out);
    await Feed.script(out.say);
    if (out.kind !== "machine") { SFX.applause(2.6); SFX.murmur(0.35); setTimeout(() => SFX.murmur(0.08, 4), 3000); }
    await sleep(1400);
    document.body.classList.remove("mach-mode");
    $("#board").classList.remove("mono");
    // small inline continue affordance via whisper + tap
    FX.whisper(out.kind === "machine" ? "tap the board to stand up" : "tap the board to rise from the table", 60000);
    await new Promise((r) => { const off = Board.onTap(() => { off(); r(); }); });
    $("#whisper").classList.remove("show");
  },

  async ritual(scene, out) {
    const oppColor = scene.youAre === "w" ? "b" : "w";
    for (const step of out.ritual ?? []) {
      const [kind, a, b] = step;
      if (kind === "say") await Feed.say(a, b);
      else if (kind === "room") await Feed.say("room", a);
      else if (kind === "whisper") FX.whisper(a);
      else if (kind === "pause") await sleep(a);
      else if (kind === "tip") Board.tipKing(oppColor, a === "slow");
      else if (kind === "coins") { FX.coins(); await sleep(2000); }
      else if (kind === "fans") { SFX.fansDown(); Eval.die(); }
      else if (kind === "clocks") Clocks.stop();
      else if (kind === "burnOpp") Clocks.burn("opp", a);
      else if (kind === "tremor") { $("#board-frame").classList.add("tremor"); setTimeout(() => $("#board-frame").classList.remove("tremor"), a); }
    }
  },

  async reveal() {
    const card = el("div", "ov-card");
    card.appendChild(el("span", "ov-kicker smallcaps", "the hall has emptied. someone turns the lamps down."));
    card.appendChild(el("div", "ov-title", "What you played"));
    card.appendChild(el("div", "rule"));
    const list = el("div", "reveal-list");
    card.appendChild(list);
    const actions = el("div", "ov-actions");
    const btn = Overlay.button("The certificate");
    Overlay.show(card);

    for (const scene of SCENES) {
      const row = el("div", "reveal-row");
      row.appendChild(miniBoard(scene.finalFen));
      const cap = el("div", "reveal-cap");
      const r = scene.reveal;
      cap.appendChild(el("span", "where", `${scene.exhibition ? "The exhibition" : "Round " + scene.roundLabel}. ${r.place}${r.year ? ", " + r.year : ""}.`));
      cap.appendChild(document.createTextNode(" " + r.players));
      cap.appendChild(el("span", "note", r.note));
      row.appendChild(cap);
      list.appendChild(row);
      row.classList.add("shown");
      Overlay.el.scrollTop = Overlay.el.scrollHeight;
      SFX.tick();
      await sleep(1250);
    }
    await sleep(800);
    const foot = el("p", "dim");
    foot.style.marginTop = "16px";
    foot.textContent = META.revealFoot;
    card.appendChild(foot);
    actions.appendChild(btn);
    card.appendChild(actions);
    Overlay.el.scrollTop = Overlay.el.scrollHeight;
    await Overlay.waitFor(btn);
    await Overlay.hide();
  },

  async certificate() {
    const card = el("div", "ov-card");
    card.appendChild(el("span", "ov-kicker smallcaps", "the brilliancy prize"));
    const cert = el("div", "cert");
    cert.appendChild(el("div", "cert-line", META.certHead));
    cert.appendChild(el("div", "cert-name", META.certName));
    cert.appendChild(el("div", "cert-body", META.certBody));
    const plaque = el("div", "rating-plaque");
    plaque.appendChild(el("span", "rp-label", "final rating"));
    const odo = odometer(2883);
    plaque.appendChild(odo);
    cert.appendChild(plaque);
    cert.appendChild(el("div", "cert-body dim", META.certFoot));
    cert.appendChild(el("div", "cert-sig", META.certSig));
    card.appendChild(cert);
    const actions = el("div", "ov-actions");
    const again = Overlay.button("Play the night again");
    actions.appendChild(again);
    card.appendChild(actions);
    Overlay.show(card);
    SFX.fanfare();
    // the odometer hesitates at 2882 — one point above the old record — then clicks over.
    setTimeout(async () => { await odo._roll(2882); await sleepRaw(750); SFX.tick(); odo._roll(2883); }, 600);
    await Overlay.waitFor(again);
    store.write({ round: 0 });
    location.reload();
  },
};

// ── chrome buttons ──────────────────────────────────────────────────────────

$("#btn-sound").setAttribute("aria-pressed", String(!SFX.muted));
$("#btn-sound").addEventListener("click", () => {
  SFX.unlock();
  SFX.setMuted(!SFX.muted);
  $("#btn-sound").setAttribute("aria-pressed", String(!SFX.muted));
});
$("#btn-ff").addEventListener("click", () => {
  hurry = !hurry;
  syncPace();
  $("#btn-ff").classList.toggle("ff-on", hurry);
});

// ── boot ────────────────────────────────────────────────────────────────────

Director.run().catch((e) => {
  console.error(e);
  Feed.say("room", "Something has gone wrong in the hall. Refresh, and Caïssa will re-set the pieces.");
});
