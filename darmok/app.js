/* ============================================================
   DARMOK — app UI. Vanilla JS, no build step.
   Views: boot, bridge, missions, lesson, drill, reference, log.
   ============================================================ */
(function () {
  "use strict";
  const $app = document.getElementById("app");
  const P = DK.load();
  P.days = P.days || [];
  const S = {
    view: "bridge",
    missionOpen: null,
    refTab: "hira",
    lesson: null, // {wi, li, phase, queue, idx, firstTry:{}, wrongTotal, medals:[]}
    drill: null,
    onboard: null,   // number = orientation step showing; null = hidden
    kanjiOpen: null, // a kanji char whose breakdown modal is open
  };
  window.APP = { S, P, go }; // for tests

  const snd = (n) => DK.beep(n, P.settings.sound);
  const say = (t) => { if (P.settings.speech) DK.speak(t, { rate: P.settings.rate }); };

  /* ----------------------------------------------------------
     Commendations
     ---------------------------------------------------------- */
  const MEDALS = [
    { id: "first-contact", ic: "🖖", name: "First Contact", desc: "Complete your first duty shift." },
    { id: "picard-maneuver", ic: "🎖️", name: "The Picard Maneuver", desc: "Finish a simulation with a perfect first-attempt score." },
    { id: "chief-engineer", ic: "🔧", name: "Chief Engineer", desc: "Complete Mission 05 — the te-form is the warp core of Japanese." },
    { id: "make-it-so", ic: "☕", name: "Make It So", desc: "Complete shift 8.3 and learn to say そうしよう like the Captain." },
    { id: "dragon-rider", ic: "🐉", name: "Dragon Rider", desc: "Complete shift 7.2 — count every last dragon." },
    { id: "leap-of-faith", ic: "🦅", name: "Leap of Faith", desc: "Complete shift 9.2 — nothing is true, everything is permitted." },
    { id: "darmok-jalad", ic: "🌊", name: "Darmok and Jalad", desc: "Complete Mission 09 — speak in stories, at Tanagra." },
    { id: "earl-grey", ic: "🫖", name: "Tea. Earl Grey. Hot.", desc: "Complete shift 12.3 and order tea with proper diplomacy." },
    { id: "red-alert", ic: "🚨", name: "Shields Held", desc: "Finish a simulation despite five or more misses. Persistence is a Starfleet virtue." },
    { id: "universal-translator", ic: "🛰️", name: "Universal Translator", desc: "Answer 300 tactical drill reviews." },
    { id: "long-tour", ic: "📅", name: "The Long Tour", desc: "Train on 30 different days." },
    { id: "number-one", ic: "⭐", name: "Number One", desc: "Reach the rank of Commander." },
    { id: "kobayashi", ic: "🏆", name: "Kobayashi Protocol", desc: "Complete Mission 12. There are always possibilities." },
  ];
  function award(id, popList) {
    if (P.medals.includes(id)) return false;
    P.medals.push(id);
    if (popList) popList.push(MEDALS.find((m) => m.id === id));
    return true;
  }
  function weekDone(w) {
    return w.lessons.every((l) => P.done[l.id]);
  }
  function checkMedals(ctx, pops) {
    if (Object.keys(P.done).length >= 1) award("first-contact", pops);
    if (ctx && ctx.perfect) award("picard-maneuver", pops);
    if (ctx && ctx.wrongTotal >= 5) award("red-alert", pops);
    if (P.done["8.3"]) award("make-it-so", pops);
    if (P.done["7.2"]) award("dragon-rider", pops);
    if (P.done["9.2"]) award("leap-of-faith", pops);
    if (P.done["12.3"]) award("earl-grey", pops);
    const w5 = DK.CURRICULUM.find((w) => w.n === 5);
    const w9 = DK.CURRICULUM.find((w) => w.n === 9);
    const w12 = DK.CURRICULUM.find((w) => w.n === 12);
    if (w5 && weekDone(w5)) award("chief-engineer", pops);
    if (w9 && weekDone(w9)) award("darmok-jalad", pops);
    if (w12 && weekDone(w12)) award("kobayashi", pops);
    if (P.reviews >= 300) award("universal-translator", pops);
    if (P.days.length >= 30) award("long-tour", pops);
    if (DK.rankFor(P.xp).name === "Commander" || DK.rankFor(P.xp).name === "Captain") award("number-one", pops);
  }

  /* ----------------------------------------------------------
     Frame + navigation
     ---------------------------------------------------------- */
  function officerName() {
    return P.name ? P.name : "Officer";
  }
  function rankTitle() {
    return DK.rankFor(P.xp).name;
  }
  function dueCount() {
    return DK.srsDue(P).length;
  }

  function go(view, opts) {
    S.view = view;
    if (opts && opts.missionOpen !== undefined) S.missionOpen = opts.missionOpen;
    window.scrollTo(0, 0);
    render();
  }

  function pipsHtml(rank) {
    let h = '<span class="rank-pips">';
    for (let i = 0; i < rank.pips; i++) h += "<i></i>";
    if (rank.half) h += '<i class="hollow"></i>';
    h += "</span>";
    return h;
  }

  function frame(inner, active) {
    const due = dueCount();
    return `
    <div class="frame">
      <div class="elbow" data-nav="bridge"><span class="elbow-label">LCARS ${Math.floor(Number(DK.stardate()))}</span></div>
      <header class="header">
        <div class="h-bar h-cap-l" style="background:var(--lilac);width:30px;border-radius:13px 0 0 13px"></div>
        <div class="h-title">DARMOK <span class="jp">・日本語作戦</span></div>
        <div class="h-bar grow" style="background:var(--gold)"></div>
        <div class="h-stardate">STARDATE ${DK.stardate()}</div>
        <div class="h-bar h-cap-r" style="background:var(--salmon)"></div>
      </header>
      <nav class="rail">
        <button class="rail-btn ${active === "bridge" ? "active" : ""}" data-nav="bridge" style="border-radius:0">BRIDGE<small>メイン</small></button>
        <button class="rail-btn ${active === "missions" ? "active" : ""}" data-nav="missions" style="background:var(--lilac)">MISSIONS<small>レッスン</small></button>
        <button class="rail-btn ${active === "drill" ? "active" : ""}" data-nav="drill" style="background:var(--salmon)">DRILLS${due ? " • " + due : ""}<small>復習</small></button>
        <button class="rail-btn ${active === "reference" ? "active" : ""}" data-nav="reference" style="background:var(--blue)">REFERENCE<small>参考</small></button>
        <button class="rail-btn ${active === "log" ? "active" : ""}" data-nav="log" style="background:var(--peach)">LOG<small>記録</small></button>
        <div class="rail-spacer"><div class="cascade" id="cascade"></div></div>
        <div class="rail-cap"></div>
      </nav>
      <main class="main">${inner}</main>
    </div>`;
  }

  // data cascade animation
  let cascadeTimer = null;
  function startCascade() {
    const el = document.getElementById("cascade");
    if (cascadeTimer) clearInterval(cascadeTimer);
    if (!el) return;
    const line = () =>
      `<span class="${Math.random() < 0.18 ? "hot" : ""}">${Math.floor(Math.random() * 9000 + 1000)}·${Math.floor(Math.random() * 99)}</span>`;
    const fill = () => {
      const n = Math.max(3, Math.floor(el.clientHeight / 19));
      el.innerHTML = Array.from({ length: n }, line).join("");
    };
    fill();
    cascadeTimer = setInterval(() => { if (document.visibilityState === "visible") fill(); }, 900);
  }

  /* ----------------------------------------------------------
     Boot sequence
     ---------------------------------------------------------- */
  function boot() {
    const colors = ["var(--gold)", "var(--lilac)", "var(--salmon)", "var(--peri)", "var(--blue)", "var(--peach)"];
    const bars = colors.map((c, i) => `<i style="background:${c};animation-delay:${i * 0.12}s"></i>`).join("");
    $app.innerHTML = `
      <div id="boot">
        <div class="boot-bars">${bars}</div>
        <div class="boot-line" style="animation-delay:.7s">United Federation of Planets</div>
        <div class="boot-line" style="animation-delay:1.1s">Starfleet Linguistics · Diplomatic Academy</div>
        <div class="boot-title" style="animation-delay:1.5s">DARMOK</div>
        <div class="boot-jp" style="animation-delay:1.9s">日本語作戦モジュール ・ ダーモック</div>
        <div class="boot-line" style="animation-delay:2.4s">Universal translator offline — manual acquisition required</div>
        <div class="boot-skip">TAP TO ENGAGE</div>
      </div>`;
    let finished = false;
    const fin = () => {
      if (finished) return; // idempotent: skip-click and auto-advance must not both render
      finished = true;
      P.settings.booted = true;
      DK.save(P);
      render();
    };
    const skipTimer = setTimeout(fin, 4200);
    document.getElementById("boot").addEventListener("click", () => { clearTimeout(skipTimer); snd("nav"); fin(); });
  }

  /* ----------------------------------------------------------
     BRIDGE (home)
     ---------------------------------------------------------- */
  function nextLesson() {
    for (const w of DK.CURRICULUM) {
      for (let i = 0; i < w.lessons.length; i++) {
        if (!P.done[w.lessons[i].id]) return { w, li: i };
      }
    }
    return null;
  }
  function totalLessons() {
    return DK.CURRICULUM.reduce((s, w) => s + w.lessons.length, 0);
  }
  function doneLessons() {
    return Object.keys(P.done).length;
  }
  function greeting() {
    const h = new Date().getHours();
    const en = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    const jp = h < 12 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";
    return { en, jp };
  }
  function viewBridge() {
    const g = greeting();
    const nxt = nextLesson();
    const due = dueCount();
    const rank = DK.rankFor(P.xp);
    const nextR = DK.nextRank(P.xp);
    const words = Object.keys(P.srs).length;
    const dl = doneLessons(), tl = totalLessons();
    const courseBar = DK.CURRICULUM.map((w) => {
      const d = w.lessons.filter((l) => P.done[l.id]).length;
      return `<i class="${d === w.lessons.length ? "full" : d > 0 ? "part" : ""}" title="Mission ${w.n}: ${d}/${w.lessons.length}"></i>`;
    }).join("");
    const firstTime = dl === 0;
    const earned = P.medals.length;

    return `
      <div class="kicker">USS LINGUIST · NCC-${1701 + 47} · BRIDGE</div>
      <h1 class="viewtitle">${g.en}, ${rankTitle()} ${DK.esc(officerName())} ${pipsHtml(rank)}</h1>
      <p class="viewsub"><span class="j" style="font-size:18px">${g.jp}</span> — the computer has your Japanese training ready.</p>

      ${firstTime ? `
      <div class="panel lilac-p">
        <div class="kicker" style="color:var(--lilac)">YOUR MISSION</div>
        <p>The universal translator is offline for this sector, ${DK.esc(officerName())}. Starfleet needs you to learn <b>Japanese</b> the old way — by actually understanding it.</p>
        <p style="margin-top:8px">Twelve missions. Five duty shifts each — about three months of training. Every shift gives you a proper <b>briefing</b> (real grammar explanations, not hand-waving), a <b>vocabulary database</b> with audio and furigana, and a <b>holodeck simulation</b> where every answer — right or wrong — is explained.</p>
        <p style="margin-top:8px">No hearts. No streak guilt. No little green owl. Rank is earned, never lost, and nothing is locked — the whole course is open from day one.</p>
      </div>` : ""}

      <div class="bridge-grid">
        <div class="stat-tile">
          <div class="st-label">Course Progress</div>
          <div class="st-value">${dl}<small style="font-size:20px;color:var(--dim)"> / ${tl} shifts</small></div>
          <div class="course-bar">${courseBar}</div>
          <div class="st-sub">12 missions · one per week</div>
        </div>
        <div class="stat-tile blue-t">
          <div class="st-label">Rank</div>
          <div class="st-value" style="font-size:26px">${rank.name}</div>
          <div class="st-sub">${P.xp} XP${nextR ? " · " + (nextR.xp - P.xp) + " to " + nextR.name : " · maximum rank"}</div>
        </div>
        <div class="stat-tile lilac-t">
          <div class="st-label">Word Database</div>
          <div class="st-value">${words}</div>
          <div class="st-sub">words under spaced review</div>
        </div>
        <div class="stat-tile peri-t">
          <div class="st-label">Drills Due</div>
          <div class="st-value">${due}</div>
          <div class="st-sub">${due ? "review before they decay" : "all systems nominal"}</div>
        </div>
      </div>

      <div class="btnrow">
        ${nxt ? `<button class="btn big" data-act="resume">ENGAGE — ${nxt.w.lessons[nxt.li].review ? "Review" : "Shift"} ${nxt.w.lessons[nxt.li].id}: ${DK.esc(nxt.w.lessons[nxt.li].title)}</button>` : `<button class="btn big" data-nav="missions">COURSE COMPLETE — REPLAY ANY MISSION</button>`}
        ${due ? `<button class="btn salmon big" data-nav="drill">TACTICAL DRILLS (${due})</button>` : ""}
      </div>

      <div class="tbar lilacs"><div class="cap"></div><div class="lab">Commendations · ${earned}/${MEDALS.length}</div><div class="rule"></div></div>
      <div class="medals">${MEDALS.slice(0, 6).map(medalHtml).join("")}</div>
      <div class="btnrow"><button class="btn ghost" data-nav="log">FULL SERVICE RECORD</button><button class="btn ghost" data-act="orientation">▸ ORIENTATION</button></div>
    `;
  }
  function medalHtml(m) {
    const earned = P.medals.includes(m.id);
    return `<div class="medal ${earned ? "earned" : ""}"><div class="m-ic">${earned ? m.ic : "🔒"}</div><div><div class="m-name">${m.name}</div><div class="m-desc">${m.desc}</div></div></div>`;
  }

  /* ----------------------------------------------------------
     MISSIONS
     ---------------------------------------------------------- */
  function viewMissions() {
    let h = `
      <div class="kicker">MISSION ROSTER · 12 WEEKS · ${totalLessons()} DUTY SHIFTS</div>
      <h1 class="viewtitle">Missions</h1>
      <p class="viewsub">Nothing is locked. The recommended order builds grammar step by step, but you have the conn.</p>`;
    DK.CURRICULUM.forEach((w, wi) => {
      const d = w.lessons.filter((l) => P.done[l.id]).length;
      const open = S.missionOpen === wi;
      const complete = d === w.lessons.length;
      h += `
      <div class="mission ${complete ? "done" : ""}">
        <button class="mission-head" data-act="toggle-mission" data-wi="${wi}">
          <span class="m-code">WEEK ${String(w.n).padStart(2, "0")}</span>
          <span class="m-name">${DK.esc(w.name)}</span>
          <span class="m-count">${d}/${w.lessons.length}</span>
        </button>
        ${open ? `<div class="mission-body">
          <p class="mission-brief">${DK.md(w.brief)}</p>
          ${w.lessons.map((l, li) => {
            const rec = P.done[l.id];
            return `<button class="shift-row ${rec ? "done" : ""} ${l.review ? "review-shift" : ""}" data-act="start-lesson" data-wi="${wi}" data-li="${li}">
              <span class="s-day">${l.review ? "REVIEW" : "DAY " + (li + 1)}</span>
              <span class="s-title">${DK.esc(l.title)}<small>${DK.md(l.sub || "")}</small></span>
              <span class="s-score">${rec ? DK.esc(rec.best) + "%" : ""}</span>
            </button>`;
          }).join("")}
        </div>` : ""}
      </div>`;
    });
    return h;
  }

  /* ----------------------------------------------------------
     LESSON PLAYER
     ---------------------------------------------------------- */
  function startLesson(wi, li) {
    const w = DK.CURRICULUM[wi];
    const l = w.lessons[li];
    S.lesson = {
      wi, li, w, l,
      phase: "brief",
      queue: null, idx: 0,
      firstTry: {}, wrongTotal: 0, answered: false,
      pops: [],
    };
    go("lesson");
  }

  function briefBlockHtml(b) {
    const [kind, a, c] = b;
    if (kind === "h") return `<h3>${DK.md(a)}</h3>`;
    if (kind === "p") return `<p>${DK.md(a)}</p>`;
    if (kind === "note") return `<div class="note">${DK.md(a)}</div>`;
    if (kind === "tip") return `<div class="tip">${DK.md(a)}</div>`;
    if (kind === "ul") return `<ul>${a.map((x) => `<li>${DK.md(x)}</li>`).join("")}</ul>`;
    if (kind === "ex") {
      return a.map((e) => `
        <div class="exline">
          <button class="say" data-say="${DK.esc(DK.readingFold(e[0]))}" title="Speak">▶</button>
          <div class="jp-line">${DK.ruby(e[0])}</div>
          <div class="en-line">${DK.esc(e[2])}${e[3] ? ` <span class="lit">· lit. ${DK.esc(e[3])}</span>` : ""}</div>
        </div>`).join("");
    }
    if (kind === "table") {
      return `<div class="btable-wrap"><table class="btable">
        <tr>${a.map((hcell) => `<th>${DK.esc(hcell)}</th>`).join("")}</tr>
        ${c.map((row) => `<tr>${row.map((cell) => `<td>${DK.md(cell)}</td>`).join("")}</tr>`).join("")}
      </table></div>`;
    }
    return "";
  }
  // Speak string: keep kanji (TTS reads them), strip furigana brackets
  DK.readingFold = DK.readingFold || function (s) { return DK.plain(s); };

  function viewLesson() {
    const L = S.lesson;
    const l = L.l, w = L.w;
    const head = `
      <div class="kicker">WEEK ${String(w.n).padStart(2, "0")} · ${DK.esc(w.name)} · ${l.review ? "REVIEW SHIFT" : "DUTY SHIFT " + l.id}</div>
      <h1 class="viewtitle">${DK.esc(l.title)}</h1>
      <p class="viewsub">${DK.md(l.sub || "")}</p>`;

    if (L.phase === "brief") {
      return `${head}
        <div class="tbar"><div class="cap"></div><div class="lab">Mission Briefing</div><div class="rule"></div></div>
        <div class="brief">${(l.briefing || []).map(briefBlockHtml).join("")}</div>
        <div class="btnrow">
          <button class="btn big" data-act="phase" data-phase="${(l.vocab || []).length ? "vocab" : "sim"}">${(l.vocab || []).length ? "PROCEED TO VOCABULARY" : "BEGIN SIMULATION"}</button>
          <button class="btn ghost" data-nav="missions">RETURN TO ROSTER</button>
        </div>`;
    }

    if (L.phase === "vocab") {
      return `${head}
        <div class="tbar lilacs"><div class="cap"></div><div class="lab">Vocabulary Database · ${l.vocab.length} entries</div><div class="rule"></div></div>
        <p class="viewsub">Tap ▶ to hear each word. These enter your spaced-review deck when you finish the shift.</p>
        <div class="vgrid ${P.settings.romaji ? "" : "no-romaji"}">
          ${l.vocab.map((v) => `
            <div class="vcard">
              <div class="v-jp">${DK.rubyK(v[0])}</div>
              ${v[1] && v[1] !== DK.plain(v[0]) ? `<div class="v-kana">${DK.esc(v[1])}</div>` : ""}
              <div class="v-romaji">${DK.esc(v[2] || "")}</div>
              <div class="v-en">${DK.esc(v[3])}</div>
              <div class="v-foot"><span class="v-type">${DK.esc(v[4] || "word")}</span>
              <button class="say small" data-say="${DK.esc(v[1] || DK.plain(v[0]))}">▶</button></div>
            </div>`).join("")}
        </div>
        <div class="btnrow">
          <button class="btn big" data-act="phase" data-phase="sim">BEGIN SIMULATION</button>
          <button class="btn ghost" data-act="phase" data-phase="brief">BACK TO BRIEFING</button>
        </div>`;
    }

    if (L.phase === "sim") {
      if (!L.queue) {
        L.queue = DK.buildSession(w, l);
        L.total = L.queue.length;
        L.idx = 0;
      }
      return `${head}${simHtml()}`;
    }

    if (L.phase === "done") return doneHtml();
    return "";
  }

  function simHtml() {
    const L = S.lesson;
    const segs = [];
    for (let i = 0; i < L.total; i++) {
      const r = L.results && L.results[i];
      segs.push(`<i class="${i === L.idx && i < L.total ? "cur" : r === true ? "ok" : r === false ? "bad" : ""}"></i>`);
    }
    const ex = L.queue[L.idx];
    return `
      <div class="tbar blues"><div class="cap"></div><div class="lab">Holodeck Simulation</div><div class="rule"></div></div>
      <div class="sim-head">
        <div class="sim-progress">${segs.join("")}</div>
        <div class="sim-count">${Math.min(L.idx + 1, L.total)} / ${L.total}</div>
      </div>
      <div id="excard">${exerciseHtml(ex)}</div>`;
  }

  /* ---------- Lt. Cmdr. Data: progressive hints ---------- */
  function maxHints(ex) {
    if (ex.t === "type") return ex.show ? 2 : 1;
    if (ex.t === "mc" || ex.t === "listen") return 2;
    if (ex.t === "build") return ex.tokens && ex.tokens[1] ? 2 : 1;
    if (ex.t === "match") return 1;
    return 0;
  }
  function hintLines(ex) {
    const out = [];
    if (ex.t === "type") {
      const reading = DK.plain(DK.readingForm(ex.show || (ex.accept && ex.accept[0]) || ""));
      if (reading) out.push(`The reading is 「${DK.esc(reading)}」 — enter that in rōmaji.`);
      if (ex.show) out.push(`In writing: ${DK.ruby(ex.show)}`);
    } else if (ex.t === "mc" || ex.t === "listen") {
      out.push("I have eliminated two incorrect options for you.");
      const ans = ex.choices[ex.a] || "";
      // Only the "reverse" MC has a Japanese answer that has a reading; "meaning" and
      // "listen" answers are the English gloss, so don't mislabel English as a reading.
      if (JP_RE.test(ans)) {
        const rd = DK.plain(DK.readingForm(ans));
        if (rd) out.push(`The correct entry reads 「${DK.esc(rd)}」.`);
      } else if (ans) {
        out.push(`The correct answer is 「${DK.esc(ans)}」.`);
      }
    } else if (ex.t === "build") {
      if (ex.tokens && ex.tokens[0]) out.push(`Begin with 「${DK.esc(ex.tokens[0])}」.`);
      if (ex.tokens && ex.tokens[1]) out.push(`Then 「${DK.esc(ex.tokens[1])}」 comes next.`);
    } else if (ex.t === "match") {
      const p = ex.pairs && ex.pairs[0];
      if (p) out.push(`One correct pairing: ${DK.ruby(p[0])} = ${DK.esc(p[1])}.`);
    }
    return out;
  }
  // The comm panel + ASK DATA button shown under a live (un-answered) exercise.
  function dataAssistHtml(ex) {
    const L = S.lesson || S.drill;
    if (!L || L.answered) return "";
    const mx = maxHints(ex);
    if (!mx) return "";
    const shown = Math.min(ex._hints || 0, mx);
    const lines = hintLines(ex).slice(0, shown);
    const nudge = ex._dataNudge && !lines.length;
    const panel = (lines.length || nudge) ? `
      <div class="data-panel">
        <div class="data-badge">◈</div>
        <div class="data-body">
          <div class="data-name">LT. CMDR. DATA</div>
          ${nudge ? `<div class="data-line">I have observed some difficulty, Officer. Permit me to assist — it is no trouble at all.</div>` : ""}
          ${lines.map((l) => `<div class="data-line">${l}</div>`).join("")}
        </div>
      </div>` : "";
    const btn = shown < mx
      ? `<button class="btn ghost assist-btn" data-act="hint">${shown ? "DATA, MORE ◈" : "ASK DATA ◈"}</button>`
      : "";
    return `<div class="assist">${panel}${btn}</div>`;
  }

  /* ---------- Orientation (first-run tour, narrated by Data) ---------- */
  const ONBOARD = [
    { t: "Lt. Commander Data reporting", b: "I am the ship's operations officer — and your language instructor. Allow me to orient you before your first duty shift. It will take under a minute." },
    { t: "Missions &amp; duty shifts", b: "The course is twelve <b>missions</b>, each about five <b>duty shifts</b> — roughly three months of study. Nothing is locked; you may begin, repeat, or revisit any shift whenever you wish." },
    { t: "How a shift runs", b: "Each shift has three parts: a <b>Mission Briefing</b> that genuinely explains the grammar, a <b>Vocabulary Database</b> with audio and furigana, and a <b>Holodeck Simulation</b> where every answer — right or wrong — is explained." },
    { t: "No hearts. No streaks.", b: "There is no punishment here. Rank is <b>earned and never lost</b>; an error is merely data. I will quietly bring difficult words back until they are secure." },
    { t: "When uncertain, ask me", b: "In any exercise, tap <b>ASK DATA&nbsp;◈</b> and I will narrow the options or reveal the reading. Type answers in rōmaji — <b>ko-n-ni-chi-ha → こんにちは</b> — the console converts it to kana as you type." },
    { t: "The writing system", b: "Tap any <b>kanji</b> — in a word, on a card, or in the Reference database — and I will show its meaning, its readings, and the radicals it is built from. Understanding a character beats memorising it." },
  ];
  function onboardHtml() {
    const i = S.onboard || 0;
    const s = ONBOARD[i];
    if (!s) return "";
    const last = i + 1 >= ONBOARD.length;
    return `
      <div class="onboard-scrim">
        <div class="onboard" role="dialog" aria-modal="true" aria-label="Orientation">
          <div class="data-badge big">◈</div>
          <div class="ob-step">ORIENTATION · ${i + 1} / ${ONBOARD.length}</div>
          <h2 class="ob-title">${s.t}</h2>
          <p class="ob-body">${s.b}</p>
          <div class="ob-dots">${ONBOARD.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
          <div class="btnrow">
            <button class="btn big" data-act="onboard-next">${last ? "BEGIN ▸" : "CONTINUE ▸"}</button>
            ${last ? "" : `<button class="btn ghost" data-act="onboard-skip">SKIP</button>`}
          </div>
        </div>
      </div>`;
  }

  /* ---------- exercise rendering ---------- */
  const JP_RE = /[぀-ヿ一-鿿]/;

  function exerciseHtml(ex) {
    const kind = ex.kind || ({ mc: "TACTICAL ANALYSIS", type: "TRANSLATION MATRIX", build: "SENTENCE ASSEMBLY", listen: "AUDIO INTERCEPT", match: "PATTERN MATCH" })[ex.t];
    let body = "";
    if (ex.t === "mc" || ex.t === "listen") {
      const jpChoices = ex.choices.some((c) => JP_RE.test(c));
      // 50/50: the first hint fades two wrong options (chosen once, kept stable).
      if ((ex._hints || 0) >= 1 && !ex._hidden) {
        const wrong = ex.choices.map((_, i) => i).filter((i) => i !== ex.a);
        ex._hidden = DK.shuffle(wrong).slice(0, Math.min(2, Math.max(0, wrong.length - 1)));
      }
      const hidden = ex._hidden || [];
      body = `
        ${ex.q ? `<div class="ex-q">${DK.md(ex.q)}</div>` : ""}
        ${ex.t === "listen" ? `<div class="ex-jp"><button class="say" data-say="${DK.esc(ex.speak)}">▶</button><span style="color:var(--dim);font-size:15px">play again</span></div>` : ""}
        ${ex.jp && ex.t !== "listen" ? `<div class="ex-jp">${ex.speak !== false ? `<button class="say" data-say="${DK.esc(ex.speakText || DK.plain(ex.jp))}">▶</button>` : ""}<span>${DK.ruby(ex.jp).replace(/(＿＿+|___+)/g, '<span class="blank">［&nbsp;?&nbsp;］</span>')}</span></div>` : ""}
        <div class="choices ${jpChoices && ex.choices.every((c) => c.length <= 6) ? "two-col" : ""}">
          ${ex.choices.map((c, i) => `<button class="choice ${hidden.includes(i) ? "hint-out" : ""}" data-choice="${i}" ${hidden.includes(i) ? "disabled" : ""} ${JP_RE.test(c) ? 'style="font-size:20px"' : ""}><span class="ck">${i + 1}</span>${DK.ruby(c)}</button>`).join("")}
        </div>`;
    } else if (ex.t === "type") {
      body = `
        <div class="ex-q">${DK.md(ex.q)}</div>
        ${ex.jp ? `<div class="ex-jp"><button class="say" data-say="${DK.esc(DK.plain(ex.jp))}">▶</button><span>${DK.ruby(ex.jp)}</span></div>` : ""}
        <div class="type-row">
          <input class="type-in" id="type-in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="type rōmaji → かな" value="${DK.esc(ex._typed || "")}" ${S.imeOff ? "data-ime-off" : ""}>
          <button class="btn" data-act="submit-type">SUBMIT</button>
          <button class="btn ghost" data-act="toggle-ime" title="Turn the built-in rōmaji converter on/off">${S.imeOff ? "あ→A OFF" : "A→あ ON"}</button>
          <div class="ime-hint">Type in rōmaji and it becomes kana as you type (<b>ko-n-ni-chi-ha → こんにちは</b>). Kanji also accepted. Toggle the converter off if you use your own Japanese keyboard.</div>
        </div>`;
    } else if (ex.t === "build") {
      const bank = ex._bank || (ex._bank = DK.shuffle(ex.tokens.concat(ex.extra || []).map((t, i) => ({ t, i }))));
      ex._placed = ex._placed || [];
      body = `
        <div class="ex-q">${DK.md(ex.q || "Assemble the sentence:")} <b>“${DK.esc(ex.en)}”</b></div>
        <div class="build-slots" id="slots">${ex._placed.map((b, i) => `<button class="token placed" data-unplace="${i}">${DK.esc(b.t)}</button>`).join("") || '<span style="color:#4a4436;font-family:var(--font-ui);letter-spacing:.15em;font-size:13px">TAP TOKENS BELOW IN ORDER</span>'}</div>
        <div class="build-bank">${bank.map((b, i) => `<button class="token ${ex._placed.includes(b) ? "used" : ""}" data-place="${i}">${DK.esc(b.t)}</button>`).join("")}</div>
        <div class="btnrow"><button class="btn" data-act="submit-build" ${ex._placed.length ? "" : "disabled"}>SUBMIT</button>
        <button class="btn ghost" data-act="clear-build">CLEAR</button></div>`;
    } else if (ex.t === "match") {
      ex._left = ex._left || DK.shuffle(ex.pairs.map((p, i) => ({ txt: p[0], i })));
      ex._right = ex._right || DK.shuffle(ex.pairs.map((p, i) => ({ txt: p[1], i })));
      ex._done = ex._done || new Set();
      body = `
        <div class="ex-q">${DK.md(ex.q || "Match each term with its meaning.")}</div>
        <div class="match-grid">
          ${ex._left.map((c, i) => `<button class="choice mleft ${ex._done.has(c.i) ? "done" : ""} ${S.matchSel === i ? "sel" : ""}" data-mleft="${i}" style="font-size:19px">${DK.ruby(c.txt)}</button>`).join("")}
        </div>
        <div class="match-grid" style="margin-top:10px">
          ${ex._right.map((c, i) => `<button class="choice mright ${ex._done.has(c.i) ? "done" : ""}" data-mright="${i}">${DK.esc(c.txt)}</button>`).join("")}
        </div>`;
    }
    return `<div class="ex-card"><div class="ex-kind">${kind}</div>${body}${dataAssistHtml(ex)}<div id="feedback"></div></div>`;
  }

  // Why *this* answer was wrong — the specific mistake, not just the right answer.
  // Authored `whyWrong` (keyed by the chosen option) wins; otherwise the
  // generated exercise names the word the wrong option actually was; for typed
  // answers, a slip that is itself a real word gets named back.
  function wrongExplain(ex, userWrongText) {
    if (userWrongText == null || userWrongText === "") return "";
    if (ex.whyWrong) {
      if (ex.whyWrong[userWrongText] != null) return ex.whyWrong[userWrongText];
      const plain = DK.plain(userWrongText);
      if (ex.whyWrong[plain] != null) return ex.whyWrong[plain];
    }
    if (ex.wrongGloss && ex.wrongGloss[userWrongText]) return ex.wrongGloss[userWrongText];
    if (ex.t === "type" && DK.identifyAnswer) {
      const hit = DK.identifyAnswer(userWrongText);
      const isAccepted = hit && (ex.accept || []).some(
        (a) => DK.normalizeAnswer(a) === DK.normalizeAnswer(DK.plain(hit[0]))
      );
      if (hit && !isAccepted) return "You wrote " + hit[0] + " — that means “" + hit[3] + "”.";
    }
    return "";
  }

  function feedbackHtml(ok, ex, userWrongText) {
    const answerLine = answerText(ex);
    const contrast = ok ? "" : wrongExplain(ex, userWrongText);
    return `
      <div class="feedback ${ok ? "good" : "bad"}">
        <div class="f-head">${ok ? "CONFIRMED ✓" : "REVISION REQUIRED"}</div>
        ${!ok && userWrongText ? `<div class="f-you">You answered: ${DK.esc(userWrongText)}</div>` : ""}
        ${contrast ? `<div class="f-wrong">${DK.md(contrast)}</div>` : ""}
        <div class="f-answer">${answerLine}</div>
        ${ex.why ? `<div class="f-why">${DK.md(ex.why)}</div>` : ""}
        <div class="btnrow"><button class="btn ${ok ? "" : "salmon"}" data-act="next-ex">CONTINUE ▸</button></div>
      </div>`;
  }
  function answerText(ex) {
    if (ex.t === "mc" || ex.t === "listen") {
      const full = ex.reveal ? DK.ruby(ex.reveal) + " — " : "";
      return full + DK.ruby(ex.choices[ex.a]);
    }
    if (ex.t === "type") return DK.ruby(ex.show || ex.accept[0]);
    if (ex.t === "build") return DK.ruby(ex.tokens.join(""));
    return "";
  }

  function gradeSRS(ex, ok) {
    if (!ex.gen) return;
    DK.srsAdd(P, ex.gen);
    DK.srsAnswer(P.srs[ex.gen], ok);
  }

  function answer(ok, userWrongText) {
    const L = S.lesson || S.drill;
    if (L.answered) return;
    L.answered = true;
    const ex = L.queue[L.idx];
    L.results = L.results || [];
    L.results[L.idx] = ok;
    if (!ex._retry) {
      // A hint-assisted correct answer isn't a clean first try (medals / score).
      L.firstTry[L.idx] = ok && !ex._assisted;
    }
    L.streakWrong = ok ? 0 : (L.streakWrong || 0) + 1;
    if (!ok) {
      L.wrongTotal++;
      // requeue once at the end; if the officer is struggling, Data pre-offers help
      // on the retry (fresh hint state + a proactive nudge in the comm panel).
      if (!ex._retry) {
        // Build the retry from the exercise definition only: strip EVERY transient
        // _-prefixed field (so _matchMistakes, _placed, _hints, ... all reset by
        // construction — an omitted field is how a flawless match retry was still
        // graded wrong), then set just the two the retry needs.
        const copy = Object.fromEntries(Object.entries(ex).filter(([k]) => !k.startsWith("_")));
        copy._retry = true;
        copy._dataNudge = L.streakWrong >= 2;
        L.queue.push(copy);
        L.total = L.queue.length;
      }
    }
    gradeSRS(ex, ok);
    if (S.drill && S.drill === L) { P.reviews++; if (ok) P.xp += 1; }
    DK.save(P);
    snd(ok ? "ok" : "no");
    if (!ok) {
      const card = document.querySelector(".ex-card");
      if (card) { card.classList.add("alert-flash"); }
    }
    const fb = document.getElementById("feedback");
    if (fb) fb.innerHTML = feedbackHtml(ok, ex, userWrongText);
    // refresh progress segments
    const simhead = document.querySelector(".sim-progress");
    if (simhead) {
      const segs = simhead.querySelectorAll("i");
      if (segs[L.idx]) segs[L.idx].className = ok ? "ok" : "bad";
    }
    const btn = document.querySelector('[data-act="next-ex"]');
    if (btn) btn.focus();
  }

  function nextExercise() {
    const L = S.lesson || S.drill;
    L.answered = false;
    S.matchSel = null;
    L.idx++;
    if (L.idx >= L.queue.length) {
      finishSession();
      return;
    }
    render();
    autoplayListen();
  }

  function autoplayListen() {
    const L = S.lesson || S.drill;
    if (!L || !L.queue) return;
    const ex = L.queue[L.idx];
    if (ex && ex.t === "listen") setTimeout(() => say(ex.speak), 350);
  }

  function finishSession() {
    if (S.drill) {
      S.drill.finished = true;
      // A completed drill counts as a training day too — it is the everyday habit the app
      // promotes, and the Long Tour medal (30 days) must be reachable by drilling alone.
      const today = new Date().toISOString().slice(0, 10);
      if (!P.days.includes(today)) P.days.push(today);
      // Collect medals crossed during the drill so they can be shown + chimed, not
      // recorded silently (Universal Translator is earnable ONLY in a drill).
      const pops = [];
      checkMedals(null, pops);
      S.drill.pops = pops;
      DK.save(P);
      snd("done");
      if (pops.length) setTimeout(() => snd("medal"), 500);
      render();
      return;
    }
    const L = S.lesson;
    const l = L.l;
    // score = first-try accuracy over the original queue
    const keys = Object.keys(L.firstTry);
    const right = keys.filter((k) => L.firstTry[k]).length;
    const score = keys.length ? Math.round((right / keys.length) * 100) : 100;
    const prev = P.done[l.id];
    const firstClear = !prev;
    P.done[l.id] = { best: Math.max(score, prev ? prev.best : 0), times: (prev ? prev.times : 0) + 1, last: Date.now() };
    // vocab into SRS deck
    for (const v of l.vocab || []) DK.srsAdd(P, DK.vocabKey(v));
    // XP: full on first clear, quarter on replays
    const xp = Math.round((20 + score / 10) * (firstClear ? 1 : 0.25));
    P.xp += xp;
    L.xpEarned = xp;
    L.score = score;
    const today = new Date().toISOString().slice(0, 10);
    if (!P.days.includes(today)) P.days.push(today);
    L.pops = [];
    checkMedals({ perfect: score === 100, wrongTotal: L.wrongTotal }, L.pops);
    DK.save(P);
    L.phase = "done";
    snd("done");
    if (L.pops.length) setTimeout(() => snd("medal"), 500);
    render();
  }

  function doneHtml() {
    const L = S.lesson;
    const nxt = nextLesson();
    return `
      <div class="done-splash">
        <div class="kicker">SIMULATION COMPLETE · SHIFT ${L.l.id}</div>
        <div class="d-big">${L.score === 100 ? "EXEMPLARY" : L.score >= 80 ? "COMMENDABLE" : L.score >= 60 ? "SATISFACTORY" : "LOGGED — REVIEW ADVISED"}</div>
        <div class="d-score">${L.score}<small>%</small></div>
        <div class="d-line">+${L.xpEarned} XP · ${(L.l.vocab || []).length} words added to your review deck · rank: ${rankTitle()}</div>
        ${L.pops.map((m) => `<div class="medal-pop"><span style="font-size:26px">${m.ic}</span><span><b style="color:var(--gold);font-family:var(--font-ui);letter-spacing:.06em">COMMENDATION: ${m.name}</b><br><small style="color:var(--dim)">${m.desc}</small></span></div>`).join("")}
        <div class="btnrow" style="justify-content:center">
          ${nxt ? `<button class="btn big" data-act="start-next">NEXT: ${DK.esc(nxt.w.lessons[nxt.li].id)} ${DK.esc(nxt.w.lessons[nxt.li].title)} ▸</button>` : ""}
          <button class="btn lilac" data-nav="missions">MISSION ROSTER</button>
          <button class="btn ghost" data-nav="bridge">BRIDGE</button>
        </div>
      </div>`;
  }

  /* ----------------------------------------------------------
     DRILLS (SRS)
     ---------------------------------------------------------- */
  function viewDrill() {
    if (S.drill && !S.drill.finished) {
      const D = S.drill;
      const segs = [];
      for (let i = 0; i < D.total; i++) {
        const r = D.results && D.results[i];
        segs.push(`<i class="${i === D.idx ? "cur" : r === true ? "ok" : r === false ? "bad" : ""}"></i>`);
      }
      return `
        <div class="kicker">TACTICAL DRILLS · SPACED REVIEW</div>
        <h1 class="viewtitle">Drill Session</h1>
        <div class="sim-head">
          <div class="sim-progress">${segs.join("")}</div>
          <div class="sim-count">${Math.min(D.idx + 1, D.total)} / ${D.total}</div>
        </div>
        <div id="excard">${exerciseHtml(D.queue[D.idx])}</div>`;
    }
    if (S.drill && S.drill.finished) {
      const D = S.drill;
      const right = (D.results || []).filter(Boolean).length;
      const due = dueCount();
      return `
        <div class="done-splash">
          <div class="kicker">DRILL SESSION COMPLETE</div>
          <div class="d-big">${right} / ${D.total}</div>
          <div class="d-line">Each answer reschedules the word — misses come back sooner, hits drift further out. ${due ? due + " still due." : "Queue clear."}</div>
          ${(D.pops || []).map((m) => `<div class="medal-pop"><span style="font-size:26px">${m.ic}</span><span><b style="color:var(--gold);font-family:var(--font-ui);letter-spacing:.06em">COMMENDATION: ${m.name}</b><br><small style="color:var(--dim)">${m.desc}</small></span></div>`).join("")}
          <div class="btnrow" style="justify-content:center">
            ${due ? '<button class="btn salmon big" data-act="start-drill">ANOTHER ROUND</button>' : ""}
            <button class="btn ghost" data-nav="bridge">BRIDGE</button>
          </div>
        </div>`;
    }
    const due = dueCount();
    const total = Object.keys(P.srs).length;
    let nextDue = null;
    for (const k of Object.keys(P.srs)) {
      if (P.srs[k].due > Date.now() && (!nextDue || P.srs[k].due < nextDue)) nextDue = P.srs[k].due;
    }
    return `
      <div class="kicker">TACTICAL DRILLS · SPACED REVIEW</div>
      <h1 class="viewtitle">Review Queue</h1>
      <p class="viewsub">Every word you meet in a shift joins this deck. The computer schedules each one just before you'd forget it — answer well and the gap grows (4&nbsp;h → 1&nbsp;d → 3&nbsp;d → 1&nbsp;w → 2&nbsp;w → 1&nbsp;m → 3&nbsp;m); miss and it comes back sooner. Ten minutes a day here beats an hour of cramming.</p>
      <div class="bridge-grid">
        <div class="stat-tile"><div class="st-label">Due now</div><div class="st-value">${due}</div><div class="st-sub">${total} words tracked in total</div></div>
        <div class="stat-tile blue-t"><div class="st-label">Reviews answered</div><div class="st-value">${P.reviews}</div><div class="st-sub">${nextDue && !due ? "next due " + new Date(nextDue).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "lifetime total"}</div></div>
      </div>
      <div class="btnrow">
        ${due ? `<button class="btn salmon big" data-act="start-drill">BEGIN DRILL (${Math.min(due, 15)})</button>` : `<button class="btn big" data-act="resume">NOTHING DUE — CONTINUE THE COURSE</button>`}
      </div>
      ${total === 0 ? '<div class="panel lilac-p"><p>Your deck is empty, Officer. Complete a duty shift first — its vocabulary reports here automatically.</p></div>' : ""}`;
  }
  function startDrill() {
    const queue = DK.buildDrill(P, 15);
    if (!queue.length) { go("drill"); return; }
    S.drill = { queue, total: queue.length, idx: 0, results: [], firstTry: {}, wrongTotal: 0, answered: false, finished: false };
    go("drill");
    autoplayListen();
  }

  /* ----------------------------------------------------------
     REFERENCE
     ---------------------------------------------------------- */
  /* ---------- Kanji breakdown (modal + reference grid) ---------- */
  function kanjiReady() { return !!(window.DK && DK.KANJI && Object.keys(DK.KANJI).length); }

  function kanjiModalHtml(ch) {
    const k = kanjiReady() && DK.KANJI[ch];
    if (!k) return "";
    const readRow = (lab, arr, cls) => (arr && arr.length)
      ? `<div class="kd-read"><span class="kd-lab">${lab}</span><span class="kd-vals ${cls}">${arr.map((r) => `<span>${DK.esc(r)}</span>`).join("")}</span></div>`
      : "";
    const kun = (k.kun || []).map((x) => x.replace(/\./g, "・"));
    const rad = (k.rad && k.rad.length)
      ? `<div class="kd-sec"><div class="kd-h">Built from</div>${k.rad.map((r) => `<div class="kd-rad"><span class="kd-radc">${DK.esc(r.c)}</span><span class="kd-radm">${DK.esc(r.m)}</span></div>`).join("")}</div>`
      : "";
    const mn = k.mn ? `<div class="kd-sec"><div class="kd-h">Mnemonic</div><p class="kd-p">${DK.esc(k.mn)}</p></div>` : "";
    const cn = k.cn ? `<div class="kd-sec kd-cn"><div class="kd-h">日本 vs 中文</div><p class="kd-p">${DK.esc(k.cn)}</p></div>` : "";
    const say = (k.on && k.on[0]) || (k.kun && k.kun[0] && k.kun[0].replace(/\./g, "")) || ch;
    return `
      <div class="kanji-scrim">
        <div class="kanji-modal" role="dialog" aria-modal="true" aria-label="Kanji ${ch}">
          <button class="kd-x" data-act="close-kanji" aria-label="Close">✕</button>
          <div class="kd-top">
            <div class="kd-glyph">${ch}<button class="say small kd-say" data-say="${DK.esc(say)}">▶</button></div>
            <div class="kd-meta">
              <div class="kd-mean">${DK.esc(k.m)}</div>
              ${readRow("音", k.on, "on")}
              ${readRow("訓", kun, "kun")}
            </div>
          </div>
          ${rad}${mn}${cn}
        </div>
      </div>`;
  }
  function openKanji(ch) {
    if (!kanjiReady() || !DK.KANJI[ch]) return;
    closeKanji();
    S.kanjiOpen = ch;
    document.body.insertAdjacentHTML("beforeend", kanjiModalHtml(ch));
  }
  function closeKanji() {
    S.kanjiOpen = null;
    const m = document.querySelector(".kanji-scrim");
    if (m) m.remove();
  }
  // Ordered, de-duplicated kanji actually taught, grouped by mission.
  function kanjiByWeek() {
    const seen = new Set();
    return DK.CURRICULUM.map((w) => {
      const chars = [];
      w.lessons.forEach((l) => (l.vocab || []).forEach((v) => {
        DK.plain(v[0]).replace(/[㐀-䶿一-鿿]/g, (ch) => {
          if (kanjiReady() && DK.KANJI[ch] && !seen.has(ch)) { seen.add(ch); chars.push(ch); }
          return ch;
        });
      }));
      return { n: w.n, name: w.name, chars };
    }).filter((g) => g.chars.length);
  }
  function kanjiTabHtml() {
    if (!kanjiReady()) return `<p class="viewsub">Kanji database offline.</p>`;
    const groups = kanjiByWeek();
    const total = new Set(groups.flatMap((g) => g.chars)).size;
    return `<p class="viewsub">All ${total} kanji in the course. Tap one for its meaning, readings, and the radicals it is built from.</p>`
      + groups.map((g) => `
        <div class="tbar"><div class="cap"></div><div class="lab">Mission ${g.n} · ${DK.esc(g.name)}</div><div class="rule"></div></div>
        <div class="kanji-grid">${g.chars.map((ch) => `<button class="kanji-cell" data-kanji="${ch}"><span class="kc-char">${ch}</span><span class="kc-m">${DK.esc((DK.KANJI[ch].m || "").split(/[;,(，、]/)[0].trim())}</span></button>`).join("")}</div>`).join("");
  }

  function viewReference() {
    const tabs = [
      ["hira", "Hiragana"], ["kata", "Katakana"], ["kanji", "Kanji"], ["grammar", "Grammar Index"], ["verbs", "Verb Engine"], ["numbers", "Numbers"],
    ];
    let body = "";
    if (S.refTab === "hira" || S.refTab === "kata") {
      const kata = S.refTab === "kata";
      body = `<p class="viewsub">Tap any kana to hear it.</p><div class="kana-grid">`;
      DK.KANA_ROWS.forEach((row, r) => {
        row.forEach((k, c) => {
          if (!k) { body += '<div class="kana-cell empty"></div>'; return; }
          const shown = kata ? DK.hiraToKata(k) : k;
          body += `<button class="kana-cell" data-say="${k}">${shown}<small>${DK.KANA_ROMAJI[r][c]}</small></button>`;
        });
      });
      body += "</div>";
    } else if (S.refTab === "kanji") {
      body = kanjiTabHtml();
    } else if (S.refTab === "grammar") {
      body = `<p class="viewsub">Every grammar point in the course. Tap one to reopen its briefing.</p>`;
      DK.CURRICULUM.forEach((w, wi) => {
        w.lessons.forEach((l, li) => {
          (l.briefing || []).forEach((b) => {
            if (b[0] === "h") {
              body += `<button class="gindex-item" data-act="start-lesson" data-wi="${wi}" data-li="${li}"><span class="gi-loc">${l.id}</span><span>${DK.md(b[1])}</span></button>`;
            }
          });
        });
      });
    } else if (S.refTab === "verbs") {
      body = verbCheatSheet();
    } else if (S.refTab === "numbers") {
      body = numberSheet();
    }
    return `
      <div class="kicker">REFERENCE DATABASE · 参考資料</div>
      <h1 class="viewtitle">Reference</h1>
      <div class="tabs">${tabs.map(([id, name]) => `<button class="tab ${S.refTab === id ? "active" : ""}" data-tab="${id}">${name}</button>`).join("")}</div>
      ${body}`;
  }

  function verbCheatSheet() {
    return `
    <div class="brief">
      <h3>The three verb classes</h3>
      <p><b>Godan</b> (u-verbs) end in an -u sound and conjugate by shifting that final syllable along its kana row. <b>Ichidan</b> (ru-verbs) end in -iru/-eru and just swap る for the ending. Two verbs are <b>irregular</b>: {{する}} (do) and {{来[く]る}} (come).</p>
      <div class="btable-wrap"><table class="btable">
        <tr><th>Form</th><th>書く kaku (godan)</th><th>食べる taberu (ichidan)</th><th>する</th><th>来る</th></tr>
        <tr><td>polite ます</td><td>書きます</td><td>食べます</td><td>します</td><td>来[き]ます</td></tr>
        <tr><td>negative ません</td><td>書きません</td><td>食べません</td><td>しません</td><td>来[き]ません</td></tr>
        <tr><td>past ました</td><td>書きました</td><td>食べました</td><td>しました</td><td>来[き]ました</td></tr>
        <tr><td>te-form</td><td>書いて</td><td>食べて</td><td>して</td><td>来[き]て</td></tr>
        <tr><td>plain negative</td><td>書かない</td><td>食べない</td><td>しない</td><td>来[こ]ない</td></tr>
        <tr><td>plain past</td><td>書いた</td><td>食べた</td><td>した</td><td>来[き]た</td></tr>
        <tr><td>potential</td><td>書ける</td><td>食べられる</td><td>できる</td><td>来[こ]られる</td></tr>
        <tr><td>volitional</td><td>書こう</td><td>食べよう</td><td>しよう</td><td>来[こ]よう</td></tr>
      </table></div>
      <h3>Te-form by godan ending</h3>
      <div class="btable-wrap"><table class="btable">
        <tr><th>Dictionary ends in</th><th>Te-form</th><th>Example</th></tr>
        <tr><td>う・つ・る</td><td>って</td><td>買う→買って, 待つ→待って, 乗る→乗って</td></tr>
        <tr><td>む・ぶ・ぬ</td><td>んで</td><td>飲む→飲んで, 遊ぶ→遊んで, 死ぬ→死んで</td></tr>
        <tr><td>く</td><td>いて</td><td>書く→書いて（例外: 行く→行って）</td></tr>
        <tr><td>ぐ</td><td>いで</td><td>泳ぐ→泳いで</td></tr>
        <tr><td>す</td><td>して</td><td>話す→話して</td></tr>
      </table></div>
      <div class="tip">Full explanations live in Mission 03 (verb classes), Mission 05 (te-form) and Mission 06 (plain form). This sheet is just the pocket version.</div>
    </div>`;
  }

  function numberSheet() {
    return `
    <div class="brief">
      <h3>Core numbers</h3>
      <div class="btable-wrap"><table class="btable">
        <tr><th>#</th><th>Reading</th><th>#</th><th>Reading</th></tr>
        <tr><td>1 一</td><td>いち</td><td>10 十</td><td>じゅう</td></tr>
        <tr><td>2 二</td><td>に</td><td>100 百</td><td>ひゃく（300 さんびゃく・600 ろっぴゃく・800 はっぴゃく）</td></tr>
        <tr><td>3 三</td><td>さん</td><td>1,000 千</td><td>せん（3,000 さんぜん・8,000 はっせん）</td></tr>
        <tr><td>4 四</td><td>よん・し</td><td>10,000 万</td><td>まん（always いちまん for 10,000）</td></tr>
        <tr><td>5 五</td><td>ご</td><td>100,000</td><td>じゅうまん</td></tr>
        <tr><td>6 六</td><td>ろく</td><td>1,000,000</td><td>ひゃくまん</td></tr>
        <tr><td>7 七</td><td>なな・しち</td><td colspan="2">Japanese groups by 10,000 (万), not 1,000.</td></tr>
        <tr><td>8 八</td><td>はち</td><td colspan="2"></td></tr>
        <tr><td>9 九</td><td>きゅう・く</td><td colspan="2"></td></tr>
      </table></div>
      <h3>Common counters</h3>
      <div class="btable-wrap"><table class="btable">
        <tr><th>Counter</th><th>Counts</th><th>Watch out</th></tr>
        <tr><td>〜つ</td><td>things in general (1–10)</td><td>ひとつ・ふたつ・みっつ・よっつ・いつつ・むっつ・ななつ・やっつ・ここのつ・とお</td></tr>
        <tr><td>〜人 にん</td><td>people</td><td>1人 ひとり・2人 ふたり</td></tr>
        <tr><td>〜本 ほん</td><td>long thin things</td><td>1本 いっぽん・3本 さんぼん・6本 ろっぽん</td></tr>
        <tr><td>〜枚 まい</td><td>flat things</td><td>regular — a rare mercy</td></tr>
        <tr><td>〜匹 ひき</td><td>small animals (and dragons)</td><td>1匹 いっぴき・3匹 さんびき・6匹 ろっぴき</td></tr>
        <tr><td>〜台 だい</td><td>machines, vehicles</td><td>regular</td></tr>
        <tr><td>〜冊 さつ</td><td>books</td><td>1冊 いっさつ・8冊 はっさつ</td></tr>
      </table></div>
      <div class="tip">Mission 07 covers all of this properly, with drills.</div>
    </div>`;
  }

  /* ----------------------------------------------------------
     LOG (service record + settings)
     ---------------------------------------------------------- */
  function viewLog() {
    const rank = DK.rankFor(P.xp);
    const nextR = DK.nextRank(P.xp);
    const scores = Object.values(P.done);
    const avg = scores.length ? Math.round(scores.reduce((s, r) => s + r.best, 0) / scores.length) : 0;
    return `
      <div class="kicker">CAPTAIN'S LOG · SERVICE RECORD</div>
      <h1 class="viewtitle">Service Record</h1>

      <div class="tbar"><div class="cap"></div><div class="lab">Officer Identity</div><div class="rule"></div></div>
      <div class="setting-row">
        <div class="s-label">Officer name<small>Used on the bridge. The computer will address you properly.</small></div>
        <input class="name-in" id="name-in" value="${DK.esc(P.name)}" placeholder="e.g. Deanna" maxlength="24">
      </div>

      <div class="bridge-grid" style="margin-top:16px">
        <div class="stat-tile"><div class="st-label">Rank</div><div class="st-value" style="font-size:24px">${rank.name} ${pipsHtml(rank)}</div><div class="st-sub">${P.xp} XP${nextR ? " · next: " + nextR.name + " at " + nextR.xp : ""}</div></div>
        <div class="stat-tile blue-t"><div class="st-label">Shifts completed</div><div class="st-value">${doneLessons()}<small style="font-size:18px;color:var(--dim)">/${totalLessons()}</small></div><div class="st-sub">average best score ${avg}%</div></div>
        <div class="stat-tile lilac-t"><div class="st-label">Training days</div><div class="st-value">${P.days.length}</div><div class="st-sub">no streaks. days simply count up.</div></div>
        <div class="stat-tile peri-t"><div class="st-label">Drill reviews</div><div class="st-value">${P.reviews}</div><div class="st-sub">${Object.keys(P.srs).length} words tracked</div></div>
      </div>

      <div class="tbar lilacs"><div class="cap"></div><div class="lab">Commendations</div><div class="rule"></div></div>
      <div class="medals">${MEDALS.map(medalHtml).join("")}</div>

      <div class="tbar blues"><div class="cap"></div><div class="lab">Ship Systems</div><div class="rule"></div></div>
      ${settingRow("sound", "Console audio", "LCARS chirps and alert tones.")}
      ${settingRow("speech", "Voice synthesis", DK.canSpeak() ? "Japanese speech via this device's voices." : "⚠ No Japanese voice found on this device — install one in system settings for audio.")}
      ${settingRow("furigana", "Furigana", "Small readings above kanji. Turn off to test yourself.")}
      ${settingRow("romaji", "Rōmaji", "Latin transliteration on vocabulary cards. Wean off when ready.")}
      <div class="setting-row">
        <div class="s-label">Speech rate<small>How fast the computer speaks Japanese.</small></div>
        <div>
          <button class="btn ${P.rateBtn === 0.75 || P.settings.rate === 0.75 ? "" : "ghost"}" data-rate="0.75">SLOW</button>
          <button class="btn ${P.settings.rate === 0.9 ? "" : "ghost"}" data-rate="0.9">STANDARD</button>
          <button class="btn ${P.settings.rate === 1.05 ? "" : "ghost"}" data-rate="1.05">NATIVE-ISH</button>
        </div>
      </div>

      <div class="tbar" style="margin-top:30px"><div class="cap" style="background:var(--salmon)"></div><div class="lab" style="color:var(--salmon)">Data Core</div><div class="rule"></div></div>
      <div class="btnrow">
        <button class="btn peri" data-act="export">EXPORT PROGRESS</button>
        <button class="btn ghost" data-act="import">IMPORT</button>
        <button class="btn salmon" data-act="reset">FACTORY RESET</button>
      </div>
      <p class="viewsub" style="margin-top:8px">Progress lives in this browser (localStorage). Export before switching devices.</p>`;
  }
  function settingRow(key, label, sub) {
    return `<div class="setting-row">
      <div class="s-label">${label}<small>${sub}</small></div>
      <button class="toggle ${P.settings[key] ? "on" : ""}" data-setting="${key}" role="switch" aria-checked="${P.settings[key]}" aria-label="${label}"></button>
    </div>`;
  }

  /* ----------------------------------------------------------
     RENDER + EVENTS
     ---------------------------------------------------------- */
  function render() {
    if (!P.settings.booted) { boot(); return; }
    // First-run orientation: fire once, on the bridge, until the officer completes it.
    if (!P.settings.onboarded && S.onboard === null && S.view === "bridge") S.onboard = 0;
    let inner = "";
    if (S.view === "bridge") inner = viewBridge();
    else if (S.view === "missions") inner = viewMissions();
    else if (S.view === "lesson") inner = viewLesson();
    else if (S.view === "drill") inner = viewDrill();
    else if (S.view === "reference") inner = viewReference();
    else if (S.view === "log") inner = viewLog();
    $app.innerHTML = frame(inner, S.view === "lesson" ? "missions" : S.view);
    if (typeof S.onboard === "number") $app.insertAdjacentHTML("beforeend", onboardHtml());
    document.body.classList.toggle("no-furi", !P.settings.furigana);
    document.body.classList.toggle("no-romaji", !P.settings.romaji);
    startCascade();
    const ti = document.getElementById("type-in");
    if (ti) wireTypeInput(ti);
    const ni = document.getElementById("name-in");
    if (ni) {
      ni.addEventListener("change", () => { P.name = ni.value.trim(); DK.save(P); });
      ni.addEventListener("blur", () => { P.name = ni.value.trim(); DK.save(P); });
    }
  }

  function wireTypeInput(ti) {
    ti.addEventListener("input", () => {
      if (S.imeOff) return;
      const v = ti.value;
      // don't convert if user is typing actual kana/kanji already
      const converted = DK.imeConvert(v);
      if (converted !== v) {
        ti.value = converted;
        ti.setSelectionRange(ti.value.length, ti.value.length);
      }
    });
    ti.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submitType(); }
    });
    setTimeout(() => ti.focus(), 60);
  }

  function submitType() {
    const L = S.lesson || S.drill;
    if (!L || L.answered) return;
    const ti = document.getElementById("type-in");
    const ex = L.queue[L.idx];
    const val = (ti && ti.value) || "";
    if (!val.trim()) return;
    const accepts = ex.accept.concat(ex.accept.map((a) => DK.readingForm(a)));
    answer(DK.answersMatch(val, accepts), val);
  }

  function submitBuild() {
    const L = S.lesson || S.drill;
    if (!L || L.answered) return;
    const ex = L.queue[L.idx];
    const built = ex._placed.map((b) => b.t).join("");
    const target = ex.tokens.join("");
    const alt = (ex.alsoOk || []).map((seq) => seq.join(""));
    answer(built === target || alt.includes(built), built);
  }

  document.addEventListener("click", (e) => {
    // Tap on the kanji-modal backdrop closes it.
    if (e.target.classList && e.target.classList.contains("kanji-scrim")) { closeKanji(); return; }
    const t = e.target.closest("[data-nav],[data-act],[data-say],[data-choice],[data-tab],[data-setting],[data-rate],[data-place],[data-unplace],[data-mleft],[data-mright],[data-kanji]");
    if (!t) return;

    if (t.dataset.kanji) { snd("tap"); openKanji(t.dataset.kanji); return; }

    if (t.dataset.say !== undefined) {
      snd("tap");
      const b = t;
      b.classList.add("speaking");
      DK.speak(t.dataset.say, { rate: P.settings.rate, onend: () => b.classList.remove("speaking") });
      setTimeout(() => b.classList.remove("speaking"), 4000);
      return;
    }
    if (t.dataset.nav) {
      snd("nav");
      S.lesson = null; S.drill = null;
      go(t.dataset.nav);
      return;
    }
    if (t.dataset.tab) { snd("tap"); S.refTab = t.dataset.tab; render(); return; }
    if (t.dataset.setting) {
      P.settings[t.dataset.setting] = !P.settings[t.dataset.setting];
      DK.save(P); snd("tap"); render(); return;
    }
    if (t.dataset.rate) { P.settings.rate = parseFloat(t.dataset.rate); DK.save(P); snd("tap"); say("こんにちは"); render(); return; }

    const L = S.lesson || S.drill;

    if (t.dataset.choice !== undefined && L && !L.answered) {
      const ex = L.queue[L.idx];
      const i = parseInt(t.dataset.choice, 10);
      // paint selection
      document.querySelectorAll(".choice").forEach((c, ci) => {
        c.disabled = true;
        if (ci === ex.a) c.classList.add("right");
        else if (ci === i) c.classList.add("wrong");
      });
      answer(i === ex.a, ex.choices[i]);
      return;
    }
    if (t.dataset.place !== undefined && L && !L.answered) {
      const ex = L.queue[L.idx];
      const b = ex._bank[parseInt(t.dataset.place, 10)];
      if (!ex._placed.includes(b)) { ex._placed.push(b); snd("tap"); rerenderEx(); }
      return;
    }
    if (t.dataset.unplace !== undefined && L && !L.answered) {
      const ex = L.queue[L.idx];
      ex._placed.splice(parseInt(t.dataset.unplace, 10), 1);
      snd("tap"); rerenderEx();
      return;
    }
    if (t.dataset.mleft !== undefined && L && !L.answered) {
      S.matchSel = parseInt(t.dataset.mleft, 10);
      snd("tap"); rerenderEx();
      return;
    }
    if (t.dataset.mright !== undefined && L && !L.answered) {
      const ex = L.queue[L.idx];
      if (S.matchSel === null || S.matchSel === undefined) return;
      const left = ex._left[S.matchSel];
      const right = ex._right[parseInt(t.dataset.mright, 10)];
      if (left.i === right.i) {
        ex._done.add(left.i);
        S.matchSel = null;
        snd("ok");
        if (ex._done.size === ex.pairs.length) {
          ex._matchMistakes = ex._matchMistakes || 0;
          answer(ex._matchMistakes <= Math.ceil(ex.pairs.length / 2), null);
          return;
        }
        rerenderEx();
      } else {
        ex._matchMistakes = (ex._matchMistakes || 0) + 1;
        S.matchSel = null;
        snd("no");
        rerenderEx();
      }
      return;
    }

    const act = t.dataset.act;
    if (!act) return;
    snd(act === "next-ex" || act === "hint" ? "tap" : "nav");

    if (act === "close-kanji") {
      closeKanji();
    } else if (act === "toggle-mission") {
      const wi = parseInt(t.dataset.wi, 10);
      S.missionOpen = S.missionOpen === wi ? null : wi;
      render();
    } else if (act === "start-lesson") {
      startLesson(parseInt(t.dataset.wi, 10), parseInt(t.dataset.li, 10));
    } else if (act === "resume") {
      const nxt = nextLesson();
      if (nxt) startLesson(DK.CURRICULUM.indexOf(nxt.w), nxt.li);
      else go("missions");
    } else if (act === "start-next") {
      const nxt = nextLesson();
      S.lesson = null;
      if (nxt) startLesson(DK.CURRICULUM.indexOf(nxt.w), nxt.li);
      else go("missions");
    } else if (act === "phase") {
      S.lesson.phase = t.dataset.phase;
      window.scrollTo(0, 0);
      render();
      autoplayListen();
    } else if (act === "next-ex") {
      nextExercise();
    } else if (act === "submit-type") {
      submitType();
    } else if (act === "toggle-ime") {
      S.imeOff = !S.imeOff;
      rerenderEx();
    } else if (act === "submit-build") {
      submitBuild();
    } else if (act === "clear-build") {
      const ex = L.queue[L.idx];
      ex._placed = [];
      rerenderEx();
    } else if (act === "start-drill") {
      startDrill();
    } else if (act === "export") {
      const data = JSON.stringify(P);
      (navigator.clipboard ? navigator.clipboard.writeText(data) : Promise.reject()).then(
        () => alert("Progress copied to clipboard. Paste it somewhere safe."),
        () => prompt("Copy this:", data)
      );
    } else if (act === "import") {
      const raw = prompt("Paste an exported progress string:");
      if (raw) {
        try {
          const p = JSON.parse(raw);
          if (!p || typeof p !== "object" || !("xp" in p)) throw new Error("bad");
          localStorage.setItem("darmok.progress.v1", JSON.stringify(p));
          location.reload();
        } catch (err) { alert("That didn't parse as DARMOK progress data."); }
      }
    } else if (act === "reset") {
      if (confirm("Wipe all progress? This cannot be undone. (Auto-destruct sequence requires confirmation.)")) {
        DK.reset();
        location.reload();
      }
    } else if (act === "hint") {
      if (!L || L.answered) return;
      const ex = L.queue[L.idx];
      ex._hints = (ex._hints || 0) + 1;
      ex._assisted = true;
      ex._dataNudge = false;
      rerenderEx();
    } else if (act === "orientation") {
      S.onboard = 0; render();
    } else if (act === "onboard-next") {
      S.onboard = (S.onboard || 0) + 1;
      if (S.onboard >= ONBOARD.length) { S.onboard = null; P.settings.onboarded = true; DK.save(P); }
      render();
    } else if (act === "onboard-skip") {
      S.onboard = null; P.settings.onboarded = true; DK.save(P); render();
    }
  });

  function rerenderEx() {
    const L = S.lesson || S.drill;
    const holder = document.getElementById("excard");
    if (holder && L) {
      // Preserve the in-progress typed answer across a re-render: ASK DATA (hint) and the
      // A→かな toggle both rebuild #excard, which would otherwise discard the input node
      // and wipe what the learner has typed. Stash it so exerciseHtml can render it back.
      const cur = document.getElementById("type-in");
      if (cur) L.queue[L.idx]._typed = cur.value;
      holder.innerHTML = exerciseHtml(L.queue[L.idx]);
      const ti = document.getElementById("type-in");
      if (ti) wireTypeInput(ti);
    }
  }

  // keyboard shortcuts: 1-4 pick choices, Enter continues
  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    // Escape closes the kanji breakdown modal — it can open outside a lesson/drill,
    // so this must run before the queue guard below.
    if (S.kanjiOpen && e.key === "Escape") { e.preventDefault(); closeKanji(); return; }
    const L = S.lesson || S.drill;
    if (!L || !L.queue) return;
    if (e.key === "Enter") {
      const btn = document.querySelector('[data-act="next-ex"]');
      if (btn) { e.preventDefault(); btn.click(); }
      return;
    }
    if (!L.answered && /^[1-9]$/.test(e.key)) {
      const btns = document.querySelectorAll("[data-choice]");
      const i = parseInt(e.key, 10) - 1;
      if (btns[i]) btns[i].click();
    }
  });

  render();
})();
