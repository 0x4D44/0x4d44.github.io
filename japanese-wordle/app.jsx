/* ============================================================
   Kotoba — a Japanese kana Wordle
   Guess a JLPT N5 word in kana. Classic green/amber/grey feedback,
   plus gojūon two-axis pips: for each tile we also tell you whether the
   consonant row (C) and/or vowel column (V) of your kana matches the
   answer's kana in that slot — the signal English Wordle can't give.
   ============================================================ */
const { useState, useEffect, useRef, useCallback } = React;

const KANA = window.KANA;
const KEYBOARD = window.KEYBOARD;
const WORDS = window.WORDS;
const romajiToKana = window.romajiToKana;
const splitKana = window.splitKana;

const MAX_ROWS = 6;
const STORE_KEY = "kotoba.v1";
const RANK = { absent: 1, present: 2, correct: 3 };

/* ---------- persistence ---------- */
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch (e) { return {}; }
}
function save(obj) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) {}
}
const DEFAULT_STATS = { played: 0, wins: 0, curStreak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0] };
const DEFAULT_PREFS = { romaji: true, pips: true, seenHelp: false };

/* ---------- daily selection ---------- */
function todayKey(d) {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return "" + y + (m < 10 ? "0" + m : m) + (day < 10 ? "0" + day : day);
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function makeAnswer(w) {
  return { k: w.k, r: w.r, m: w.m, cells: splitKana(w.k) };
}
function dailyAnswer(d) {
  const idx = hashStr("kotoba-" + todayKey(d)) % WORDS.length;
  return makeAnswer(WORDS[idx]);
}
function randomAnswer(len) {
  const pool = len ? WORDS.filter(w => splitKana(w.k).length === len) : WORDS;
  const src = pool.length ? pool : WORDS;
  // deterministic-free pick; Math.random is fine in the browser runtime
  return makeAnswer(src[Math.floor(Math.random() * src.length)]);
}

/* ---------- evaluation ---------- */
function evaluate(guess, answer) {
  const n = answer.length;
  const res = new Array(n).fill("absent");
  const counts = {};
  for (let i = 0; i < n; i++) counts[answer[i]] = (counts[answer[i]] || 0) + 1;
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) { res[i] = "correct"; counts[guess[i]]--; }
  }
  for (let i = 0; i < n; i++) {
    if (res[i] === "correct") continue;
    if (counts[guess[i]] > 0) { res[i] = "present"; counts[guess[i]]--; }
  }
  return res;
}
// gojūon axis match of a guessed kana vs the answer's kana in the same slot
function axisHints(gk, ak) {
  const g = KANA[gk], a = KANA[ak];
  const c = !!(g && a && g.c != null && a.c != null && g.c === a.c);
  const v = !!(g && a && g.v != null && a.v != null && g.v === a.v);
  return { c, v };
}

/* ============================================================ */
function App() {
  const st = useRef(load());
  const [stats, setStats] = useState(st.current.stats || DEFAULT_STATS);
  const [prefs, setPrefs] = useState(Object.assign({}, DEFAULT_PREFS, st.current.prefs));

  const [mode, setMode] = useState("daily");
  const [lenFilter, setLenFilter] = useState(0);
  const [answer, setAnswer] = useState(null);
  const [guesses, setGuesses] = useState([]);   // submitted kana arrays
  const [evals, setEvals] = useState([]);        // matching state arrays
  const [current, setCurrent] = useState([]);
  const [pending, setPending] = useState("");    // romaji-in-progress
  const [status, setStatus] = useState("playing");
  const [keyState, setKeyState] = useState({});
  const [toast, setToast] = useState(null);
  const [badRow, setBadRow] = useState(false);
  const [revealRow, setRevealRow] = useState(-1);
  const [showHelp, setShowHelp] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [dakuten, setDakuten] = useState(false);
  const toastTimer = useRef(null);

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1400);
  }, []);

  /* ---- start / restore a game ---- */
  const startGame = useCallback((m, len, restore) => {
    let ans, g = [], ev = [], stt = "playing", ks = {};
    if (m === "daily") {
      const now = new Date();
      const key = todayKey(now);
      ans = dailyAnswer(now);
      const dg = st.current.daily;
      if (restore && dg && dg.date === key && dg.k === ans.k) {
        g = dg.guesses.map(splitKana);
        ev = g.map(gg => evaluate(gg, ans.cells));
        stt = dg.status || "playing";
      }
    } else {
      ans = randomAnswer(len);
    }
    ev.forEach((row, ri) => row.forEach((s, i) => {
      const kana = g[ri][i];
      if (!ks[kana] || RANK[s] > RANK[ks[kana]]) ks[kana] = s;
    }));
    setAnswer(ans); setGuesses(g); setEvals(ev); setCurrent([]);
    setPending(""); setStatus(stt); setKeyState(ks);
    setRevealRow(-1); setShowResult(stt !== "playing" && m === "daily");
  }, []);

  useEffect(() => {
    startGame("daily", 0, true);
    if (!prefs.seenHelp) setShowHelp(true);
    // eslint-disable-next-line
  }, []);

  const persist = useCallback((nextStats, nextGuesses, nextStatus, ans, m) => {
    const out = { stats: nextStats || stats, prefs };
    if ((m || mode) === "daily") {
      out.daily = {
        date: todayKey(new Date()),
        k: (ans || answer).k,
        guesses: (nextGuesses || guesses).map(g => g.join("")),
        status: nextStatus || status
      };
    } else {
      out.daily = st.current.daily;
    }
    st.current = out;
    save(out);
  }, [stats, prefs, mode, answer, guesses, status]);

  /* ---- input ---- */
  const len = answer ? answer.cells.length : 0;

  const pushKana = useCallback((cells) => {
    if (status !== "playing") return;
    setCurrent(cur => {
      const next = cur.slice();
      for (const c of cells) { if (next.length < len) next.push(c); }
      return next;
    });
  }, [status, len]);

  const onKana = useCallback((kana) => { pushKana([kana]); setPending(""); }, [pushKana]);

  const onDelete = useCallback(() => {
    if (status !== "playing") return;
    if (pending) { setPending(p => p.slice(0, -1)); return; }
    setCurrent(cur => cur.slice(0, -1));
  }, [status, pending]);

  const submit = useCallback(() => {
    if (status !== "playing" || !answer) return;
    let cur = current.slice();
    // flush a trailing romaji "n" into ん
    let pend = pending;
    if (pend === "n" && cur.length < len) { cur = cur.concat("ん"); pend = ""; }
    if (cur.length < len) { flash("Not enough kana"); setBadRow(true); setTimeout(() => setBadRow(false), 400); return; }

    const row = evaluate(cur, answer.cells);
    const nextGuesses = guesses.concat([cur]);
    const nextEvals = evals.concat([row]);
    const nextKeys = Object.assign({}, keyState);
    cur.forEach((k, i) => { if (!nextKeys[k] || RANK[row[i]] > RANK[nextKeys[k]]) nextKeys[k] = row[i]; });

    const won = cur.join("") === answer.cells.join("");
    const lost = !won && nextGuesses.length >= MAX_ROWS;
    const nextStatus = won ? "won" : lost ? "lost" : "playing";

    setGuesses(nextGuesses); setEvals(nextEvals); setCurrent([]); setPending("");
    setKeyState(nextKeys); setStatus(nextStatus);
    setRevealRow(nextGuesses.length - 1);

    let nextStats = stats;
    if (won || lost) {
      nextStats = Object.assign({}, stats, { dist: stats.dist.slice() });
      nextStats.played += 1;
      if (won) {
        nextStats.wins += 1;
        nextStats.dist[nextGuesses.length - 1] += 1;
        if (mode === "daily") {
          nextStats.curStreak += 1;
          nextStats.maxStreak = Math.max(nextStats.maxStreak, nextStats.curStreak);
        }
      } else if (mode === "daily") {
        nextStats.curStreak = 0;
      }
      setStats(nextStats);
      setTimeout(() => setShowResult(true), len * 130 + 350);
    }
    persist(nextStats, nextGuesses, nextStatus, answer, mode);
    if (won) flash(["すごい！", "Nice!", "やった！", "Brilliant"][Math.min(nextGuesses.length - 1, 3)]);
  }, [status, answer, current, pending, len, guesses, evals, keyState, stats, mode, persist, flash]);

  /* ---- physical keyboard (romaji) ---- */
  useEffect(() => {
    const h = (e) => {
      if (showHelp || showResult) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") { e.preventDefault(); submit(); return; }
      if (e.key === "Backspace") { e.preventDefault(); onDelete(); return; }
      if (e.key === " ") {
        e.preventDefault();
        if (pending === "n") { onKana("ん"); }
        return;
      }
      if (/^[a-z]$/i.test(e.key)) {
        const buf = (pending + e.key.toLowerCase());
        const out = romajiToKana(buf);
        if (out.kana.length) pushKana(out.kana);
        setPending(out.rest);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [submit, onDelete, onKana, pushKana, pending, showHelp, showResult]);

  /* ---- mode changes ---- */
  const switchMode = (m) => { setMode(m); startGame(m, lenFilter, m === "daily"); setShowResult(false); };
  const changeLen = (v) => { setLenFilter(v); if (mode === "free") { startGame("free", v, false); setShowResult(false); } };
  const playAgain = () => { startGame("free", lenFilter, false); setShowResult(false); if (mode !== "free") setMode("free"); };

  const setPref = (k, v) => {
    const np = Object.assign({}, prefs, { [k]: v });
    setPrefs(np);
    st.current = Object.assign({}, st.current, { prefs: np });
    save(st.current);
  };

  /* ---- render helpers ---- */
  function Tile({ kana, state, hint, revealed, delay, filled, popping }) {
    const cls = ["tile"];
    if (state) cls.push(state);
    if (filled) cls.push("filled");
    if (popping) cls.push("pop");
    if (revealed) cls.push("reveal");
    const style = revealed ? { animationDelay: delay + "s" } : null;
    return (
      <div className={cls.join(" ")} style={style}>
        {state && prefs.pips && state !== "correct" && (KANA[kana] && (KANA[kana].c != null || KANA[kana].v != null)) ? (
          <div className="pips">
            <div className={"pip" + (hint && hint.c ? " hit" : "")} title="consonant row">C</div>
            <div className={"pip" + (hint && hint.v ? " hit" : "")} title="vowel column">V</div>
          </div>
        ) : null}
        <span>{kana || ""}</span>
        {kana && prefs.romaji ? <span className="romaji">{KANA[kana] ? KANA[kana].r : ""}</span> : null}
      </div>
    );
  }

  const rows = [];
  for (let r = 0; r < MAX_ROWS; r++) {
    const cells = [];
    const submitted = r < guesses.length;
    const isCurrent = r === guesses.length && status === "playing";
    for (let c = 0; c < (len || 5); c++) {
      let kana = "", state = null, hint = null, filled = false, popping = false;
      if (submitted) {
        kana = guesses[r][c]; state = evals[r][c];
        hint = state !== "correct" ? axisHints(kana, answer.cells[c]) : null;
        filled = true;
      } else if (isCurrent) {
        kana = current[c] || "";
        filled = !!kana;
        popping = c === current.length - 1;
      }
      cells.push(
        <Tile key={c} kana={kana} state={state} hint={hint}
          revealed={submitted && r === revealRow} delay={c * 0.13}
          filled={filled} popping={popping} />
      );
    }
    rows.push(<div key={r} className={"row" + (badRow && isCurrent ? " bad" : "")}>{cells}</div>);
  }

  /* keyboard */
  function Key({ kana }) {
    if (!kana) return <div className="key blank" />;
    const ks = keyState[kana];
    return <button className={"key" + (ks ? " " + ks : "")} onClick={() => onKana(kana)}>{kana}</button>;
  }
  function KbGrid({ grid, className }) {
    return (
      <div className={"kb-grid " + (className || "")}>
        {grid.map((row, ri) => (
          <div className="kb-row" key={ri}>
            {row.map((k, ci) => <Key key={ci} kana={k} />)}
          </div>
        ))}
      </div>
    );
  }

  /* result / share */
  const shareGrid = () => {
    const emoji = { correct: "🟩", present: "🟨", absent: "⬛" };
    const grid = evals.map(row => row.map(s => emoji[s]).join("")).join("\n");
    const line = status === "won" ? (guesses.length + "/" + MAX_ROWS) : ("X/" + MAX_ROWS);
    const head = "Kotoba " + (mode === "daily" ? todayKey(new Date()) : "◆") + " " + line;
    const text = head + "\n" + grid;
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => flash("Copied!"), () => flash("Couldn't copy"));
    else flash("Copy unavailable");
  };

  const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const maxDist = Math.max(1, ...stats.dist);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <h1 className="jp">言葉</h1>
          <div>
            <div className="en">Kotoba</div>
          </div>
        </div>
        <button className="iconbtn" title="How to play" onClick={() => setShowHelp(true)}>?</button>
        <button className="iconbtn" title="Stats" onClick={() => setShowResult(true)}>▤</button>
      </header>

      <div className="modes">
        <div className="seg">
          <button className={mode === "daily" ? "on" : ""} onClick={() => switchMode("daily")}>Daily</button>
          <button className={mode === "free" ? "on" : ""} onClick={() => switchMode("free")}>Free play</button>
        </div>
        <div className="spacer" />
        {mode === "free" ? (
          <label className="lenpick">
            length
            <select value={lenFilter} onChange={e => changeLen(Number(e.target.value))}>
              <option value={0}>any</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </label>
        ) : null}
      </div>

      <div className="board-wrap">
        <div className="board">{rows}</div>
      </div>

      <div className="kb">
        <div className="pending">{pending || (dakuten ? "濁音 · voiced" : " ")}</div>
        {dakuten
          ? <KbGrid grid={KEYBOARD.dakuten} className="dakuten-grid" />
          : <KbGrid grid={KEYBOARD.seion} />}
        <div className="kb-row" style={{ marginTop: "4px" }}>
          <button className={"key mod" + (dakuten ? " on" : "")} title="voiced kana ゛ ゜"
            onClick={() => setDakuten(d => !d)}>゛゜</button>
          {["ん", "っ", "ゃ", "ゅ", "ょ", "ー"].map(k => <Key key={k} kana={k} />)}
        </div>
        <div className="kb-actions">
          <button className="key del" onClick={onDelete}>⌫ Del</button>
          <button className="key enter" onClick={submit}>Enter</button>
          <button className="key del" onClick={() => flash("Type romaji or tap kana")}>あ ⇄ a</button>
        </div>
      </div>

      <footer>N5 vocabulary · <a href="https://0x4d44.github.io/">0x4d44 almanac</a></footer>

      {toast ? <div className="toast-wrap"><div className="toast jp">{toast}</div></div> : null}

      {showHelp ? (
        <div className="scrim" onClick={() => { setShowHelp(false); setPref("seenHelp", true); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="iconbtn close" onClick={() => { setShowHelp(false); setPref("seenHelp", true); }}>✕</button>
            <h2 className="jp">言葉 · Kotoba</h2>
            <p>Guess the hidden Japanese word in <b>{MAX_ROWS}</b> tries. Each guess is a real N5 word's length in kana. Type <b>romaji</b> (ka → か) or tap the kana keyboard.</p>
            <div className="legend">
              <div className="legend-row">
                <div className="tile correct" style={{ position: "relative" }}><span>こ</span></div>
                <div className="txt">Right kana, right spot.</div>
              </div>
              <div className="legend-row">
                <div className="tile present"><span>と</span></div>
                <div className="txt">This kana is in the word, but a different spot.</div>
              </div>
              <div className="legend-row">
                <div className="tile absent" style={{ position: "relative" }}>
                  <div className="pips"><div className="pip hit">C</div><div className="pip">V</div></div>
                  <span>か</span>
                </div>
                <div className="txt">Not in the word — but the little pips are the <b>gojūon hint</b>: <b>C</b> lit means your kana shares the <b>consonant row</b> with the answer's kana here (か vs こ → both k‑); <b>V</b> lit means it shares the <b>vowel column</b>. Chase the lit pips toward the right kana.</div>
              </div>
            </div>
            <p style={{ fontSize: "13px" }}>A new <b>Daily</b> word appears each day. <b>Free play</b> gives endless words — pick a length if you like.</p>
            <button className="bigbtn" onClick={() => { setShowHelp(false); setPref("seenHelp", true); }}>Play</button>
          </div>
        </div>
      ) : null}

      {showResult ? (
        <div className="scrim" onClick={() => setShowResult(false)}>
          <div className="modal result" onClick={e => e.stopPropagation()}>
            <button className="iconbtn close" onClick={() => setShowResult(false)}>✕</button>
            {status !== "playing" && answer ? (
              <div>
                <div style={{ color: "var(--muted)", fontWeight: 600, fontSize: "13px" }}>
                  {status === "won" ? "Solved" : "The word was"}
                </div>
                <div className="word jp">{answer.k}</div>
                <div className="rom">{answer.r}</div>
                <div className="mean">{answer.m}</div>
              </div>
            ) : (
              <h2 style={{ textAlign: "center" }}>Statistics</h2>
            )}
            <div className="stats">
              <div className="stat"><b>{stats.played}</b><span>Played</span></div>
              <div className="stat"><b>{winPct}</b><span>Win %</span></div>
              <div className="stat"><b>{stats.curStreak}</b><span>Streak</span></div>
              <div className="stat"><b>{stats.maxStreak}</b><span>Max</span></div>
            </div>
            <div className="dist">
              {stats.dist.map((n, i) => (
                <div className="dist-row" key={i}>
                  <div className="n">{i + 1}</div>
                  <div className={"bar" + (status === "won" && guesses.length === i + 1 ? " hi" : "")}
                    style={{ width: Math.max(8, (n / maxDist) * 100) + "%" }}>{n}</div>
                </div>
              ))}
            </div>
            {status !== "playing" ? (
              <button className="bigbtn" onClick={shareGrid} style={{ background: "var(--ink)" }}>Share result</button>
            ) : null}
            <button className="bigbtn" onClick={playAgain}>{mode === "daily" && status !== "playing" ? "Free play →" : "New word →"}</button>
            <div className="rowtoggle">
              <span>romaji under tiles</span>
              <label className="switch">
                <input type="checkbox" checked={prefs.romaji} onChange={e => setPref("romaji", e.target.checked)} />
                <span className="track" /><span className="knob" />
              </label>
            </div>
            <div className="rowtoggle">
              <span>gojūon hint pips</span>
              <label className="switch">
                <input type="checkbox" checked={prefs.pips} onChange={e => setPref("pips", e.target.checked)} />
                <span className="track" /><span className="knob" />
              </label>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
