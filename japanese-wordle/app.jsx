/* ============================================================
   Kotoba — a Japanese kana Wordle (v2)
   Guess a JLPT N5/N4 word in kana. Classic green/amber/grey feedback,
   plus gojūon two-axis pips (consonant row / vowel column). Adds audio,
   a teaching reveal card (kanji · part of speech · example sentence),
   a spaced-repetition Review mode, JLPT level selection, colour-blind
   and sound settings, haptics, and screen-reader support.
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
const SRS_INTERVAL = [0, 1, 2, 4, 8, 16]; // days, indexed by Leitner box 0..5

/* ---------- persistence ---------- */
function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
function save(obj) { try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) {} }
const DEFAULT_STATS = { played: 0, wins: 0, curStreak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0] };
const DEFAULT_PREFS = { romaji: true, pips: true, seenHelp: false, sound: true, palette: "classic", level: "N5" };

/* ---------- time / daily ---------- */
function dayNum(d) { return Math.floor(d.getTime() / 86400000); }
function todayKey(d) {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return "" + y + (m < 10 ? "0" + m : m) + (day < 10 ? "0" + day : day);
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function makeAnswer(w) { return Object.assign({}, w, { cells: splitKana(w.k) }); }

function poolFor(level) {
  if (level === "N5") return WORDS.filter(w => w.lvl === "N5");
  return WORDS; // "all" (N5 + N4)
}
function dailyAnswer(d, level) {
  const pool = poolFor(level);
  return makeAnswer(pool[hashStr("kotoba-" + todayKey(d)) % pool.length]);
}
function randomAnswer(level, len) {
  let pool = poolFor(level);
  if (len) { const f = pool.filter(w => splitKana(w.k).length === len); if (f.length) pool = f; }
  return makeAnswer(pool[Math.floor(Math.random() * pool.length)]);
}

/* ---------- evaluation ---------- */
function evaluate(guess, answer) {
  const n = answer.length, res = new Array(n).fill("absent"), counts = {};
  for (let i = 0; i < n; i++) counts[answer[i]] = (counts[answer[i]] || 0) + 1;
  for (let i = 0; i < n; i++) if (guess[i] === answer[i]) { res[i] = "correct"; counts[guess[i]]--; }
  for (let i = 0; i < n; i++) { if (res[i] === "correct") continue; if (counts[guess[i]] > 0) { res[i] = "present"; counts[guess[i]]--; } }
  return res;
}
function axisHints(gk, ak) {
  const g = KANA[gk], a = KANA[ak];
  return {
    c: !!(g && a && g.c != null && a.c != null && g.c === a.c),
    v: !!(g && a && g.v != null && a.v != null && g.v === a.v)
  };
}

/* ---------- audio (Web Speech) ---------- */
let jaVoice = null;
function pickJaVoice() {
  if (jaVoice) return jaVoice;
  try {
    const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    jaVoice = vs.find(v => (v.lang || "").toLowerCase().indexOf("ja") === 0) || null;
  } catch (e) {}
  return jaVoice;
}
function speak(text, enabled) {
  if (!enabled || !text || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP"; u.rate = 0.85;
    const v = pickJaVoice(); if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {}
}
function buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }

/* ============================================================ */
function App() {
  const st = useRef(load());
  const [stats, setStats] = useState(st.current.stats || DEFAULT_STATS);
  const [prefs, setPrefs] = useState(Object.assign({}, DEFAULT_PREFS, st.current.prefs));
  const srs = useRef(st.current.srs || {});

  const [mode, setMode] = useState("daily");
  const [lenFilter, setLenFilter] = useState(0);
  const [answer, setAnswer] = useState(null);
  const [guesses, setGuesses] = useState([]);
  const [evals, setEvals] = useState([]);
  const [current, setCurrent] = useState([]);
  const [pending, setPending] = useState("");
  const [status, setStatus] = useState("playing"); // playing | won | lost | empty
  const [keyState, setKeyState] = useState({});
  const [toast, setToast] = useState(null);
  const [badRow, setBadRow] = useState(false);
  const [revealRow, setRevealRow] = useState(-1);
  const [dakuten, setDakuten] = useState(false);
  const [panel, setPanel] = useState(null); // 'help' | 'result' | 'settings' | null
  const [announce, setAnnounce] = useState("");
  const toastTimer = useRef(null);

  const soundOn = prefs.sound;
  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1400);
  }, []);

  /* apply colour-blind palette to <html> */
  useEffect(() => {
    document.documentElement.setAttribute("data-palette", prefs.palette === "cb" ? "cb" : "classic");
  }, [prefs.palette]);

  /* review queue */
  const dueList = useCallback(() => {
    const today = dayNum(new Date());
    return WORDS.filter(w => srs.current[w.k] && srs.current[w.k].due <= today)
      .sort((a, b) => (srs.current[a.k].box - srs.current[b.k].box) || (srs.current[a.k].due - srs.current[b.k].due));
  }, []);

  /* ---- start / restore ---- */
  const startGame = useCallback((m, opts) => {
    opts = opts || {};
    const level = opts.level || prefs.level;
    let ans = null, g = [], ev = [], stt = "playing", ks = {};
    if (m === "daily") {
      const now = new Date(), key = todayKey(now);
      ans = dailyAnswer(now, level);
      const dg = st.current.daily;
      if (opts.restore && dg && dg.date === key && dg.k === ans.k) {
        g = dg.guesses.map(splitKana); ev = g.map(gg => evaluate(gg, ans.cells)); stt = dg.status || "playing";
      }
    } else if (m === "review") {
      const due = dueList();
      if (!due.length) { stt = "empty"; }
      else ans = makeAnswer(due[0]);
    } else {
      ans = randomAnswer(level, opts.len != null ? opts.len : lenFilter);
    }
    ev.forEach((row, ri) => row.forEach((s, i) => { const k = g[ri][i]; if (!ks[k] || RANK[s] > RANK[ks[k]]) ks[k] = s; }));
    setAnswer(ans); setGuesses(g); setEvals(ev); setCurrent([]); setPending("");
    setStatus(stt); setKeyState(ks); setRevealRow(-1);
    setPanel(stt !== "playing" && m === "daily" ? "result" : null);
  }, [prefs.level, lenFilter, dueList]);

  useEffect(() => {
    startGame("daily", { restore: true });
    if (!prefs.seenHelp) setPanel("help");
    // prime speech voices (some browsers load them async)
    if (window.speechSynthesis) { try { speechSynthesis.onvoiceschanged = pickJaVoice; pickJaVoice(); } catch (e) {} }
    // eslint-disable-next-line
  }, []);

  const persist = useCallback((nextStats, nextGuesses, nextStatus, ans, m) => {
    const out = { stats: nextStats || stats, prefs, srs: srs.current };
    if ((m || mode) === "daily") {
      out.daily = { date: todayKey(new Date()), k: (ans || answer).k, guesses: (nextGuesses || guesses).map(g => g.join("")), status: nextStatus || status };
    } else { out.daily = st.current.daily; }
    st.current = out; save(out);
  }, [stats, prefs, mode, answer, guesses, status]);

  const setPref = useCallback((k, v) => {
    const np = Object.assign({}, prefs, { [k]: v });
    setPrefs(np);
    st.current = Object.assign({}, st.current, { prefs: np, srs: srs.current });
    save(st.current);
  }, [prefs]);

  /* ---- SRS update ---- */
  function updateSrs(word, won, nGuess) {
    const today = dayNum(new Date());
    const e = srs.current[word.k] || { box: 1, seen: 0, miss: 0 };
    e.seen = (e.seen || 0) + 1;
    if (!won) { e.box = Math.max(1, (e.box || 1) - 1); e.miss = (e.miss || 0) + 1; }
    else { const inc = nGuess <= 2 ? 2 : nGuess <= 4 ? 1 : 0; e.box = Math.min(5, (e.box || 1) + inc); }
    e.due = today + SRS_INTERVAL[e.box];
    e.lvl = word.lvl;
    srs.current[word.k] = e;
  }

  /* ---- input ---- */
  const len = answer ? answer.cells.length : 0;
  const pushKana = useCallback((cells) => {
    if (status !== "playing") return;
    setCurrent(cur => { const n = cur.slice(); for (const c of cells) if (n.length < len) n.push(c); return n; });
  }, [status, len]);
  const onKana = useCallback((k) => { pushKana([k]); setPending(""); }, [pushKana]);
  const onDelete = useCallback(() => {
    if (status !== "playing") return;
    if (pending) { setPending(p => p.slice(0, -1)); return; }
    setCurrent(cur => cur.slice(0, -1));
  }, [status, pending]);

  const submit = useCallback(() => {
    if (status !== "playing" || !answer) return;
    let cur = current.slice(), pend = pending;
    if (pend === "n" && cur.length < len) { cur = cur.concat("ん"); pend = ""; }
    if (cur.length < len) { flash("Not enough kana"); buzz(40); setBadRow(true); setTimeout(() => setBadRow(false), 400); return; }

    const row = evaluate(cur, answer.cells);
    const nextGuesses = guesses.concat([cur]);
    const nextEvals = evals.concat([row]);
    const nextKeys = Object.assign({}, keyState);
    cur.forEach((k, i) => { if (!nextKeys[k] || RANK[row[i]] > RANK[nextKeys[k]]) nextKeys[k] = row[i]; });

    const won = cur.join("") === answer.cells.join("");
    const lost = !won && nextGuesses.length >= MAX_ROWS;
    const nextStatus = won ? "won" : lost ? "lost" : "playing";

    setGuesses(nextGuesses); setEvals(nextEvals); setCurrent([]); setPending("");
    setKeyState(nextKeys); setStatus(nextStatus); setRevealRow(nextGuesses.length - 1);

    const nc = row.filter(s => s === "correct").length, np = row.filter(s => s === "present").length;
    setAnnounce(won ? "Correct! The word is " + answer.k + ", " + answer.m
      : lost ? "Out of guesses. The word was " + answer.k + ", " + answer.m
      : "Row " + nextGuesses.length + ": " + nc + " correct, " + np + " present.");

    let nextStats = stats;
    if (won || lost) {
      updateSrs(answer, won, nextGuesses.length);
      nextStats = Object.assign({}, stats, { dist: stats.dist.slice() });
      nextStats.played += 1;
      if (won) {
        nextStats.wins += 1; nextStats.dist[nextGuesses.length - 1] += 1;
        if (mode === "daily") { nextStats.curStreak += 1; nextStats.maxStreak = Math.max(nextStats.maxStreak, nextStats.curStreak); }
      } else if (mode === "daily") nextStats.curStreak = 0;
      setStats(nextStats);
      buzz(won ? [0, 40, 60, 40] : 60);
      const delay = len * 130 + 320;
      setTimeout(() => { setPanel("result"); speak(answer.k, soundOn); }, delay);
    } else {
      buzz(20);
    }
    persist(nextStats, nextGuesses, nextStatus, answer, mode);
    if (won) flash(["すごい！", "Nice!", "やった！", "Brilliant"][Math.min(nextGuesses.length - 1, 3)]);
  }, [status, answer, current, pending, len, guesses, evals, keyState, stats, mode, persist, flash, soundOn]);

  /* ---- physical keyboard ---- */
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape" && panel) { setPanel(null); return; }
      if (panel) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") { e.preventDefault(); submit(); return; }
      if (e.key === "Backspace") { e.preventDefault(); onDelete(); return; }
      if (e.key === " ") { e.preventDefault(); if (pending === "n") onKana("ん"); return; }
      if (/^[a-z]$/i.test(e.key)) {
        const out = romajiToKana(pending + e.key.toLowerCase());
        if (out.kana.length) pushKana(out.kana);
        setPending(out.rest);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [submit, onDelete, onKana, pushKana, pending, panel]);

  /* ---- mode / controls ---- */
  const switchMode = (m) => { setMode(m); startGame(m, { restore: m === "daily" }); };
  const changeLen = (v) => { setLenFilter(v); if (mode === "free") startGame("free", { len: v }); };
  const changeLevel = (v) => { setPref("level", v); startGame(mode, { level: v, restore: mode === "daily" }); };
  const nextWord = () => {
    if (mode === "review") { startGame("review"); }
    else { startGame("free", { len: lenFilter }); if (mode !== "free") setMode("free"); }
  };

  const dueCount = dueList().length;

  /* ---- tiles ---- */
  function Tile({ kana, state, hint, revealed, delay, filled, popping }) {
    const cls = ["tile"];
    if (state) cls.push(state);
    if (filled) cls.push("filled");
    if (popping) cls.push("pop");
    if (revealed) cls.push("reveal");
    const label = kana ? (KANA[kana] ? KANA[kana].r + " " : "") + (state ? "(" + state + ")" : "") : "empty";
    return (
      <div className={cls.join(" ")} style={revealed ? { animationDelay: delay + "s" } : null}
        role="img" aria-label={label}
        onClick={kana ? () => speak(kana, soundOn) : null}>
        {state && prefs.pips && state !== "correct" && KANA[kana] && (KANA[kana].c != null || KANA[kana].v != null) ? (
          <div className="pips" aria-hidden="true">
            <div className={"pip" + (hint && hint.c ? " hit" : "")}>C</div>
            <div className={"pip" + (hint && hint.v ? " hit" : "")}>V</div>
          </div>
        ) : null}
        <span className="jp" lang="ja">{kana || ""}</span>
        {kana && prefs.romaji ? <span className="romaji" aria-hidden="true">{KANA[kana] ? KANA[kana].r : ""}</span> : null}
      </div>
    );
  }
  const rows = [];
  for (let r = 0; r < MAX_ROWS; r++) {
    const cells = [], submitted = r < guesses.length, isCurrent = r === guesses.length && status === "playing";
    for (let c = 0; c < (len || 5); c++) {
      let kana = "", state = null, hint = null, filled = false, popping = false;
      if (submitted) { kana = guesses[r][c]; state = evals[r][c]; hint = state !== "correct" ? axisHints(kana, answer.cells[c]) : null; filled = true; }
      else if (isCurrent) { kana = current[c] || ""; filled = !!kana; popping = c === current.length - 1; }
      cells.push(<Tile key={c} kana={kana} state={state} hint={hint} revealed={submitted && r === revealRow} delay={c * 0.13} filled={filled} popping={popping} />);
    }
    rows.push(<div key={r} className={"row" + (badRow && isCurrent ? " bad" : "")}>{cells}</div>);
  }

  /* ---- keyboard ---- */
  function Key({ kana }) {
    if (!kana) return <div className="key blank" aria-hidden="true" />;
    const ks = keyState[kana];
    return <button className={"key jp" + (ks ? " " + ks : "")} lang="ja"
      aria-label={(KANA[kana] ? KANA[kana].r : kana) + (ks ? ", " + ks : "")}
      onClick={() => onKana(kana)}>{kana}</button>;
  }
  function KbGrid({ grid, className }) {
    return (<div className={"kb-grid " + (className || "")}>
      {grid.map((row, ri) => <div className="kb-row" key={ri}>{row.map((k, ci) => <Key key={ci} kana={k} />)}</div>)}
    </div>);
  }

  /* ---- share ---- */
  const shareGrid = () => {
    const emoji = { correct: "🟩", present: "🟨", absent: "⬛" };
    const grid = evals.map(row => row.map(s => emoji[s]).join("")).join("\n");
    const line = status === "won" ? (guesses.length + "/" + MAX_ROWS) : ("X/" + MAX_ROWS);
    const text = "Kotoba " + (mode === "daily" ? todayKey(new Date()) : "◆") + " " + line + "\n" + grid;
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => flash("Copied!"), () => flash("Couldn't copy"));
    else flash("Copy unavailable");
  };

  const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const maxDist = Math.max(1, ...stats.dist);
  const closePanel = () => { if (panel === "help") setPref("seenHelp", true); setPanel(null); };

  return (
    <div className="app">
      <p className="sr-only" aria-live="polite" role="status">{announce}</p>

      <header>
        <div className="brand">
          <h1 className="jp" lang="ja">言葉</h1>
          <div className="en">Kotoba</div>
        </div>
        <button className="iconbtn" aria-label="How to play" onClick={() => setPanel("help")}>?</button>
        <button className="iconbtn" aria-label="Statistics" onClick={() => setPanel("result")}>▤</button>
        <button className="iconbtn" aria-label="Settings" onClick={() => setPanel("settings")}>⚙</button>
      </header>

      <div className="modes">
        <div className="seg" role="tablist" aria-label="Game mode">
          <button className={mode === "daily" ? "on" : ""} onClick={() => switchMode("daily")}>Daily</button>
          <button className={mode === "free" ? "on" : ""} onClick={() => switchMode("free")}>Free</button>
          <button className={mode === "review" ? "on" : ""} onClick={() => switchMode("review")}>
            Review{dueCount ? <span className="badge">{dueCount}</span> : null}
          </button>
        </div>
        <div className="spacer" />
        <label className="lenpick">lvl
          <select value={prefs.level} onChange={e => changeLevel(e.target.value)} aria-label="JLPT level">
            <option value="N5">N5</option>
            <option value="all">N5+N4</option>
          </select>
        </label>
        {mode === "free" ? (
          <label className="lenpick">len
            <select value={lenFilter} onChange={e => changeLen(Number(e.target.value))} aria-label="Word length">
              <option value={0}>any</option><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option>
            </select>
          </label>
        ) : null}
      </div>

      <div className="board-wrap">
        {status === "empty" ? (
          <div className="empty-review">
            <div className="big jp" lang="ja">🎉</div>
            <p><b>No reviews due.</b><br />Words you miss come back here, spaced out. Play Daily or Free to build the deck.</p>
            <button className="bigbtn" onClick={() => switchMode("free")}>Free play →</button>
          </div>
        ) : (
          <div className="board" role="group" aria-label="Guesses">{rows}</div>
        )}
      </div>

      {status !== "empty" ? (
        <div className="kb">
          <div className="pending" aria-hidden="true">{pending || (dakuten ? "濁音 · voiced" : " ")}</div>
          {dakuten ? <KbGrid grid={KEYBOARD.dakuten} className="dakuten-grid" /> : <KbGrid grid={KEYBOARD.seion} />}
          <div className="kb-row" style={{ marginTop: "4px" }}>
            <button className={"key mod" + (dakuten ? " on" : "")} aria-label="Toggle voiced kana"
              onClick={() => setDakuten(d => !d)}>゛゜</button>
            {["ん", "っ", "ゃ", "ゅ", "ょ", "ー"].map(k => <Key key={k} kana={k} />)}
          </div>
          <div className="kb-actions">
            <button className="key del" onClick={onDelete} aria-label="Delete">⌫ Del</button>
            <button className="key enter" onClick={submit}>Enter</button>
            <button className="key del" aria-label="Input help" onClick={() => flash("Type romaji or tap kana")}>あ ⇄ a</button>
          </div>
        </div>
      ) : null}

      <footer>N5 · N4 vocabulary · <a href="https://0x4d44.github.io/">0x4d44 almanac</a></footer>

      {toast ? <div className="toast-wrap"><div className="toast jp" lang="ja">{toast}</div></div> : null}

      {panel === "help" ? (
        <Modal onClose={closePanel} title="言葉 · Kotoba">
          <p>Guess the hidden Japanese word in <b>{MAX_ROWS}</b> tries. Each puzzle is a real JLPT N5/N4 word's length in kana. Type <b>romaji</b> (ka → か) or tap the kana keyboard; tap any tile to <b>hear</b> it.</p>
          <div className="legend">
            <div className="legend-row"><div className="tile correct"><span className="jp">こ</span></div><div className="txt">Right kana, right spot.</div></div>
            <div className="legend-row"><div className="tile present"><span className="jp">と</span></div><div className="txt">This kana is in the word, elsewhere.</div></div>
            <div className="legend-row">
              <div className="tile absent"><div className="pips"><div className="pip hit">C</div><div className="pip">V</div></div><span className="jp">か</span></div>
              <div className="txt">Not in the word — but the pips are the <b>gojūon hint</b>: <b>C</b> lit = your kana shares the <b>consonant row</b> with the answer here (か vs こ → both k‑); <b>V</b> = shares the <b>vowel column</b>. Chase the lit pips.</div>
            </div>
          </div>
          <p style={{ fontSize: "13px" }}><b>Daily</b> = one word a day. <b>Free</b> = endless (pick a length). <b>Review</b> = words you've missed, resurfaced on a spaced schedule. On solve you get the kanji, part of speech and an example.</p>
          <button className="bigbtn" onClick={closePanel}>Play</button>
        </Modal>
      ) : null}

      {panel === "settings" ? (
        <Modal onClose={closePanel} title="Settings">
          <Toggle label="Sound (pronounce words)" on={prefs.sound} set={v => setPref("sound", v)} />
          <Toggle label="Romaji under tiles" on={prefs.romaji} set={v => setPref("romaji", v)} />
          <Toggle label="Gojūon hint pips" on={prefs.pips} set={v => setPref("pips", v)} />
          <Toggle label="Colour-blind palette (blue / orange)" on={prefs.palette === "cb"} set={v => setPref("palette", v ? "cb" : "classic")} />
          <p style={{ fontSize: "12px", marginTop: "14px" }}>Level and word length are in the bar under the title. Your streak, stats and review schedule are saved on this device.</p>
        </Modal>
      ) : null}

      {panel === "result" ? (
        <Modal onClose={closePanel} title={status === "playing" ? "Statistics" : null} className="result">
          {status !== "playing" && answer ? (
            <div>
              <div className="rlabel">{status === "won" ? "Solved" : "The word was"}</div>
              <div className="word jp" lang="ja" onClick={() => speak(answer.k, soundOn)} role="button" aria-label={"Hear " + answer.k}>
                {answer.k}<span className="spk">🔊</span>
              </div>
              {answer.kanji ? <div className="kanji jp" lang="ja">{answer.kanji}</div> : null}
              <div className="rom">{answer.r}<span className="pos">{answer.pos}</span><span className="lvlchip">{answer.lvl}</span></div>
              <div className="mean">{answer.m}</div>
              {answer.ex ? (
                <div className="example">
                  <button className="spkbtn" aria-label="Hear the example" onClick={() => speak(answer.ex, soundOn)}>🔊</button>
                  <div><div className="jp" lang="ja">{answer.ex}</div><div className="exen">{answer.exEn}</div></div>
                </div>
              ) : null}
            </div>
          ) : null}
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
                <div className={"bar" + (status === "won" && guesses.length === i + 1 ? " hi" : "")} style={{ width: Math.max(8, (n / maxDist) * 100) + "%" }}>{n}</div>
              </div>
            ))}
          </div>
          {status !== "playing" ? <button className="bigbtn dark" onClick={shareGrid}>Share result</button> : null}
          <button className="bigbtn" onClick={() => { closePanel(); nextWord(); }}>
            {mode === "review" ? "Next review →" : mode === "daily" && status !== "playing" ? "Free play →" : "New word →"}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------- small components ---------- */
function Modal({ title, className, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  return (
    <div className="scrim" onClick={onClose}>
      <div className={"modal " + (className || "")} role="dialog" aria-modal="true"
        aria-label={typeof title === "string" ? title : "dialog"} onClick={e => e.stopPropagation()}>
        <button className="iconbtn close" ref={ref} aria-label="Close" onClick={onClose}>✕</button>
        {title ? <h2 className="jp" lang="ja">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}
function Toggle({ label, on, set }) {
  return (
    <div className="rowtoggle">
      <span>{label}</span>
      <label className="switch">
        <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} aria-label={label} />
        <span className="track" /><span className="knob" />
      </label>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
