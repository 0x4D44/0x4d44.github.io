/* eslint-disable */
const { useState, useEffect, useRef, useMemo } = React;

/* =====================================================================
   Reusable Win3.1 window chrome
   ===================================================================== */
function Win({ title, menu, status, children, bodyStyle, id }) {
  return (
    <section className="win" id={id}>
      <div className="win__bar">
        <div className="win__sys" />
        <div className="win__title">{title}</div>
        <div className="win__min" />
        <div className="win__max" />
      </div>
      {menu && (
        <div className="win__menu">
          {menu.map((m, i) => (
            <span key={i}>
              <span className="ul">{m[0]}</span>{m.slice(1)}
            </span>
          ))}
        </div>
      )}
      <div className="win__body" style={bodyStyle}>{children}</div>
      {status && <div className="win__statusbar">{status}</div>}
    </section>
  );
}

/* =====================================================================
   Hero
   ===================================================================== */
function MiniCard({ rank, suit, color, style }) {
  return (
    <div className={"card " + color} style={style}>
      <div className="card__row">
        <div>
          <div className="card__pip">{rank}</div>
          <div className="card__suit">{suit}</div>
        </div>
      </div>
      <div className="card__center">{suit}</div>
      <div className="card__row">
        <div className="card__pip card__pip--br">{rank}</div>
      </div>
    </div>
  );
}

function Hero() {
  // five fanned cards
  const cards = [
    { rank: "A", suit: "♣", color: "black", rot: -22, x: 6 },
    { rank: "K", suit: "♦", color: "red", rot: -11, x: 56 },
    { rank: "7", suit: "♠", color: "black", rot: 0, x: 110 },
    { rank: "Q", suit: "♥", color: "red", rot: 11, x: 164 },
    { rank: "10", suit: "♣", color: "black", rot: 22, x: 214 },
  ];
  return (
    <Win
      title="ESTWHI.EXE — Estimation Whist v1.2"
      menu={[["G", "ame"], ["H", "elp"]]}
      status={<><span style={{ color: "#000" }}>Ready.</span> &nbsp;A 3,952-line tour of a 1994 Pascal card game.</>}
    >
      <div className="hero__body">
        <div>
          <div className="section-label">A codebase explainer</div>
          <h1>
            <span className="stamp">PASCAL · WIN16 · 1994</span><br/>
            Estimation Whist,<br/>
            <span style={{ color: "var(--red-card)" }}>by M.&nbsp;G.&nbsp;Davidson.</span>
          </h1>
          <p className="lead">
            One <code>PROGRAM</code>. One source file. <strong>3,952 lines</strong> of
            Borland Turbo Pascal for Windows 1.5, hand-rolled message handlers, a
            heuristic bidding AI made of two lookup tables — and bitmaps of clubs and
            diamonds that bounce around the green felt when you're not playing.
          </p>
          <p className="lead ink-soft">
            Below: what the program is, how it's built, what holds up, what doesn't,
            and a few interactive demos so you can feel the shape of it.
          </p>
          <div className="hero__chips">
            <div className="chip"><strong>1</strong> .pas file</div>
            <div className="chip"><strong>3,952</strong> lines</div>
            <div className="chip"><strong>11</strong> object types</div>
            <div className="chip"><strong>16</strong> call-button handlers</div>
            <div className="chip"><strong>OWL</strong> + Win31 + CTL3D</div>
            <div className="chip"><strong>~9 yrs</strong> from DOS draft to v1.2</div>
          </div>
          <p className="lead ink-soft" style={{ marginTop: 18 }}>
            <a href="https://0x4d44.github.io/estimation-whist-game/">Play a modern rebuild of the game &rarr;</a>
          </p>
        </div>
        <div className="hand">
          {cards.map((c, i) => (
            <MiniCard
              key={i}
              rank={c.rank}
              suit={c.suit}
              color={c.color}
              style={{
                left: c.x + "px",
                bottom: "20px",
                transform: `rotate(${c.rot}deg)`,
                zIndex: i,
              }}
            />
          ))}
        </div>
      </div>
    </Win>
  );
}

/* =====================================================================
   Quick facts strip
   ===================================================================== */
function Facts() {
  const facts = [
    ["3,952", "lines in estwhi.pas"],
    ["1993 → 2002", "DOS draft → v1.2"],
    ["Turbo Pascal 1.5", "for Windows"],
    ["Win16", "ObjectWindows (OWL)"],
    ["52", "card array, 1‑indexed"],
    ["6", "max players"],
    ["25", "rounds at default settings"],
    ["10", "high scores in ESTWHI.INI"],
  ];
  return (
    <Win title="At a glance" status="GAME|OPTIONS… for more">
      <div className="row row-4" style={{ gap: 12 }}>
        {facts.map(([n, l], i) => (
          <div key={i} className="stat">
            <div className="stat__num">{n}</div>
            <div className="stat__lbl">{l}</div>
          </div>
        ))}
      </div>
    </Win>
  );
}

/* =====================================================================
   What the program does
   ===================================================================== */
function WhatItDoes() {
  return (
    <Win title="What the program does" status="HELP|CONTENTS — Playing the game">
      <div className="row row-2">
        <div>
          <div className="section-label">The game</div>
          <h2>Bid your tricks, then take exactly that many.</h2>
          <p>
            Estimation Whist (also called Oh Hell, Blob, Bust) is a trick-taking
            card game. In round 1 each player is dealt <strong>1 card</strong>, in round 2 two,
            up to a chosen maximum (default 13) — and then back down to 1 again.
            With the default settings that's <strong>25 rounds</strong> per game.
          </p>
          <p>
            Before each round you <em>bid</em> (the program calls it a <em>call</em>)
            how many tricks you'll take. You score big if you hit your bid exactly,
            and very little otherwise. The trump suit cycles — clubs, diamonds,
            spades, hearts — and the program enforces follow-suit.
          </p>
          <p>
            One human plays against up to five computer opponents, with a green
            felt background, classic Win3.1 dialog chrome, an Arial status bar,
            and a help file built with <code>hc 3.1</code>.
          </p>
        </div>
        <div>
          <div className="section-label">Notable extras</div>
          <ul className="list">
            <li><strong>Cheat window</strong> — a second window that shows everyone else's hand. (The author named the class <code>TChetBox</code>.)</li>
            <li><strong>"Random things"</strong> — 1–6 little suit bitmaps doing a drunkard's walk around the felt when no game is running. Inspired by the classic random walk.</li>
            <li><strong>Icon twirl</strong> — when the window is iconised, the icon cycles through three frames on a 1-second timer.</li>
            <li><strong>Probability window</strong> — a stub that prints a 52×N matrix of card‑location probabilities. Mostly skeleton; never finished.</li>
            <li><strong>High scores</strong> — top ten, persisted to <code>ESTWHI.INI</code> via Win3.1's profile API.</li>
            <li><strong>Two scoring modes</strong> — vanilla (tricks + 10) and squared (tricks² + 10), plus an optional "hard scoring" rule for zero‑bids.</li>
          </ul>
        </div>
      </div>
    </Win>
  );
}

/* =====================================================================
   Architecture (interactive)
   ===================================================================== */
const ARCH_NODES = [
  {
    name: "TCardApp",
    kind: "TApplication",
    desc: "Three‑line entry object. Its only job is to create the main window.",
    code: `PROCEDURE TCardApp.InitMainWindow;
BEGIN
  DebugEnabled := TRUE;
  MainWindow := New(PMainWindow, Init(nil, 'Estimation Whist'));
END;`,
  },
  {
    name: "TMainWindow",
    kind: "TWindow — the god object",
    desc: "Owns every piece of game state and every drawing routine. The 1‑indexed deck, the legal‑hand bitmap, scores, calls, tricks, all four bitmap brushes, all three pens, and dozens of methods.",
    code: `TMainWindow = OBJECT(TWindow)
  Sel:           ARRAY [1..4, 1..5]  OF INTEGER;  (* hand summary - AutoCall *)
  CardVal:       ARRAY [1..13]       OF REAL;     (* call values *)
  TrumpCardVal:  ARRAY [1..13]       OF REAL;
  DkGrayPen, LtGrayPen, WhitePen: HPEN;
  GreenBrush, BlackBrush, LtGrayBrush: HBRUSH;
  ICON1, ICON2, ICON3: HIcon;
  ... 30+ more fields ...`,
  },
  {
    name: "TCallWin",
    kind: "TDialog — the bidder",
    desc: "Pops up at the start of each round to ask for your bid. Holds sixteen separate button pointers (CallBut0..CallBut15) and sixteen near-identical handlers (CallZer..CallFif), each of which writes one integer and closes the dialog.",
    code: `PROCEDURE TCallWin.CallSev (VAR Msg: TMessage);
BEGIN
  PlayCall[1] := 7;
  TDialog.OK(Msg);
END;
(* …and fifteen more just like it. *)`,
  },
  {
    name: "TStatbar",
    kind: "TWindow — child",
    desc: "The Arial status strip at the bottom. Hand-paints its own 3D bezel because Win3.1 didn't ship one. Reaches up into the parent for its pens.",
  },
  {
    name: "TChetBox",
    kind: "TWindow — the cheat",
    desc: "Optional second window that shows every other player's hand face-up. Named for 'cheat' but the abbreviation, alas, is what it is.",
  },
  {
    name: "TProbWin",
    kind: "TWindow — probabilities",
    desc: "A scrolling matrix of card probabilities. The plumbing is in: 52 rows of 4 players in a SHORTINT[6][52] table, and a Paint method that prints them. The estimation logic that would actually update them is absent.",
  },
  {
    name: "TOptions",
    kind: "TDialog",
    desc: "Number of players, max cards, scoring mode, notify-on-trick mode, cheat-on, confirm-exit, hard-scoring. All settings are persisted to ESTWHI.INI on close.",
  },
  {
    name: "TRandom",
    kind: "TDialog",
    desc: "Configures the drunkard's-walk bitmaps. Three scrollbars: how far they step, how many of them exist, and the timer interval in ms.",
  },
  {
    name: "TScoreBox",
    kind: "TDialog",
    desc: "High-scores table — ten PStatic name controls + ten PStatic value controls, declared one by one as Score1..Score10 and Value1..Value10.",
  },
  {
    name: "TNameBox",
    kind: "TDialog",
    desc: "Prompts you for a name to save next to a new high score. A single PEdit and an OK handler.",
  },
  {
    name: "TAboutBox",
    kind: "TDialog",
    desc: "The about dialog. The .RC source file still has the caption \"About Nonogram Solver\" — left over from the author's previous project. The runtime overrides it, so most users never noticed.",
  },
];

function ArchDiagram() {
  const [active, setActive] = useState(1);
  const node = ARCH_NODES[active];
  return (
    <Win title="Architecture — eleven OBJECTs, one source file" status="Click any object to read about it">
      <div className="section-label">Object hierarchy</div>
      <h2>It's OOP — barely. One giant TWindow holds the game.</h2>
      <p>
        Turbo Pascal 1.5 used <strong>ObjectWindows</strong> (OWL) — Borland's Pascal version
        of an MFC-like framework over the raw Win16 API. The program defines eleven OBJECTs:
        one application, one main window, a status bar, a cheat window, a probability window,
        and six modal dialogs.
      </p>
      <div className="arch gap-16">
        {ARCH_NODES.map((n, i) => (
          <button
            key={i}
            className={"arch__node" + (i === active ? " is-active" : "")}
            onClick={() => setActive(i)}
          >
            <div className="arch__name">{n.name}</div>
            <div className="arch__kind">{n.kind}</div>
          </button>
        ))}
      </div>
      <div className="inset gap-24">
        <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <h3 style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{node.name}</h3>
          <span className="pill">{node.kind}</span>
        </div>
        <p style={{ marginTop: 8 }}>{node.desc}</p>
        {node.code && (
          <pre className="code">{node.code}</pre>
        )}
      </div>
    </Win>
  );
}

/* =====================================================================
   Source map
   ===================================================================== */
// Coarse segmentation of estwhi.pas (line-range → label/color).
// Derived from reading the file: constants, type decls, methods of each
// object in source order, then the main begin/end.
const SRC_REGIONS = [
  // [startLine, endLine, label, color]
  [1, 120, "Program header + CONST", "#fdd7a7"],
  [120, 410, "TYPE declarations (11 OBJECTs)", "#f6b07a"],
  [410, 555, "Global VARs + TCardApp", "#e58f5b"],
  [555, 600, "TStatbar.Init/Done", "#b9d6f2"],
  [600, 800, "TStatbar paint + helpers", "#9fc4e8"],
  [800, 1200, "TMainWindow construction & menu", "#a3d5a3"],
  [1200, 1500, "TMainWindow timer + StartGame/Round", "#83c483"],
  [1500, 1750, "GameControl / DecideWinner / Scoring", "#60b160"],
  [1750, 2400, "Bidding AI: AutoCall, AutoCallTwo, tables", "#d5b5e6"],
  [2400, 2900, "Drawing: cards, played, controls, info", "#f1c7c7"],
  [2900, 3100, "TProbWin (probability window)", "#b9d6f2"],
  [3100, 3200, "TNameBox / TScoreBox", "#9fc4e8"],
  [3200, 3400, "TAboutBox / TOptions / TChetBox", "#83c483"],
  [3400, 3700, "TRandom (drunkard's walk config)", "#d5b5e6"],
  [3700, 3940, "TCallWin + 16 CallButN handlers", "#f6b07a"],
  [3940, 3952, "Main BEGIN ... Ctl3dRegister", "#fdd7a7"],
];

function SourceMap() {
  const [hover, setHover] = useState(null);
  // 40 columns × ~100 lines per cell = 4000 lines budget; we have 3952
  const COLS = 40;
  const ROWS = 4;
  const TOTAL = COLS * ROWS; // 160 cells
  const linesPerCell = Math.ceil(3952 / TOTAL); // ~25
  const cellRegion = (i) => {
    const lineStart = i * linesPerCell + 1;
    for (const r of SRC_REGIONS) {
      if (lineStart >= r[0] && lineStart < r[1]) return r;
    }
    return SRC_REGIONS[SRC_REGIONS.length - 1];
  };

  return (
    <Win title="The source, mapped" status="Hover any cell to see what's at that line.">
      <div className="section-label">All 3,952 lines</div>
      <h2>One file, six concerns, sixteen identical button handlers.</h2>
      <p>
        Each cell below represents ~25 lines of <code>estwhi.pas</code>, top‑left first.
        Colours group by concern. The takeaway: the AI tables and drawing code
        dwarf everything else, and the bidder dialog spends its last 240 lines
        repeating itself sixteen times.
      </p>
      <div className="srcmap" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {Array.from({ length: TOTAL }).map((_, i) => {
          const r = cellRegion(i);
          const startLine = i * linesPerCell + 1;
          return (
            <div
              key={i}
              className="srcmap__cell"
              style={{ background: r[3] }}
              onMouseEnter={() => setHover({ line: startLine, label: r[2] })}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </div>
      <div className="srcmap__legend">
        {SRC_REGIONS.map((r, i) => (
          <div key={i}>
            <span className="srcmap__sw" style={{ background: r[3] }}></span>
            <span className="mono">L{r[0]}–{r[1]}</span> &nbsp;{r[2]}
          </div>
        ))}
      </div>
      <div className="callout" style={{ marginTop: 18 }}>
        <strong>Live:</strong>{" "}
        {hover ? (
          <>around line <strong className="mono">{hover.line}</strong> — {hover.label}.</>
        ) : (
          <>Hover the heatmap to see what's at any line.</>
        )}
      </div>
    </Win>
  );
}

/* =====================================================================
   Card encoding (interactive)
   ===================================================================== */
const SUITS = ["♣", "♦", "♠", "♥"];
const SUIT_NAMES = ["Clubs", "Diamonds", "Spades", "Hearts"];
const SUIT_COLORS = ["black", "red", "black", "red"];
const RANK_LABEL = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function decodeCard(n) {
  // Per source: 1..13 = Clubs A..K, 14..26 = Diamonds, 27..39 = Spades,
  // 40..52 = Hearts.  And "Ace is high" via a sentinel of 60 in DecideWinner.
  if (n < 1 || n > 52) return null;
  const suitIdx = Math.floor((n - 1) / 13);   // 0..3
  const rankIdx = (n - 1) % 13;                // 0..12 (Ace=0)
  return {
    n,
    suit: SUITS[suitIdx],
    suitName: SUIT_NAMES[suitIdx],
    rank: RANK_LABEL[rankIdx],
    color: SUIT_COLORS[suitIdx],
    isAce: rankIdx === 0,
    suitIdx,
    rankIdx,
  };
}

function CardEncoder() {
  const [n, setN] = useState(40); // 40 = Ace of Hearts
  const c = decodeCard(n);
  return (
    <Win title="Card encoding" status="Cards[1..52] OF INTEGER — drag the slider">
      <div className="section-label">Interactive: how the deck is stored</div>
      <h2>One integer per card, suit = (n−1) div 13.</h2>
      <p>
        The deck is just a 1‑indexed array of integers from 1 to 52. There's no
        Suit type and no Rank type — both are decoded on the fly. The Ace lives
        at the bottom of each suit's range, and the program patches it up to
        "high" when deciding who won a trick by replacing its sort value with a
        sentinel of <code>60</code>.
      </p>
      <div className="enc">
        <div>
          <div className="slider-row">
            <label>Cards[i] =</label>
            <input
              className="slider"
              type="range"
              min={1}
              max={52}
              value={n}
              onChange={(e) => setN(parseInt(e.target.value))}
            />
            <span className="mono"><strong style={{ fontSize: 16 }}>{n}</strong></span>
          </div>
          <div className="enc__big">
            <div>n = <strong style={{ color: "var(--title-blue)" }}>{n}</strong></div>
            <div>(n − 1) div 13 = <strong>{c.suitIdx}</strong> → {c.suitName}</div>
            <div>(n − 1) mod 13 = <strong>{c.rankIdx}</strong> → {c.rank} {c.isAce && <span style={{ color: "var(--red-card)" }}>(ace‑high)</span>}</div>
            <div style={{ marginTop: 10 }}>DetermineSuit returns <strong>{c.suitIdx + 1}</strong>; trump match uses <code>Trump * 13</code> windows.</div>
          </div>
        </div>
        <div style={{ display: "grid", placeItems: "center" }}>
          <div className={"card " + c.color} style={{ position: "static", width: 180, height: 250 }}>
            <div className="card__row">
              <div>
                <div className="card__pip" style={{ fontSize: 32 }}>{c.rank}</div>
                <div className="card__suit" style={{ fontSize: 32 }}>{c.suit}</div>
              </div>
            </div>
            <div className="card__center" style={{ fontSize: 80 }}>{c.suit}</div>
            <div className="card__row">
              <div className="card__pip card__pip--br" style={{ fontSize: 32 }}>{c.rank}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="gap-24">
        <div className="section-label">The whole pack</div>
        <p style={{ fontSize: 14 }}>Each square is one integer 1..52. Click to select.</p>
        <div className="grid-of-52">
          {Array.from({ length: 52 }).map((_, i) => {
            const cc = decodeCard(i + 1);
            return (
              <div
                key={i}
                className={"gc " + cc.color + (i + 1 === n ? " is-selected" : "")}
                onClick={() => setN(i + 1)}
              >
                {cc.rank}{cc.suit}
              </div>
            );
          })}
        </div>
      </div>
    </Win>
  );
}

/* =====================================================================
   AI table + hand builder (interactive)
   ===================================================================== */
// CallValueOne (used for hands of 2..5 cards)
const CALL_ONE_NORMAL = [1.0, 0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.8];
const CALL_ONE_TRUMP  = [1.0, 0.1, 0.2, 0.2, 0.3, 0.3, 0.3, 0.4, 0.7, 0.9, 1.0, 1.0, 1.0];
// CallValueTwo (used for hands of 6+ cards)
const CALL_TWO_NORMAL = [1.0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.4, 1.0];
const CALL_TWO_TRUMP  = [1.0, 0.1, 0.1, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.5, 0.9, 1.0];

function CallTable({ normal, trump, highlightSet }) {
  return (
    <div className="aitable-wrap">
    <table className="aitable">
      <thead>
        <tr>
          <th></th>
          {RANK_LABEL.map((r, i) => <th key={i}>{r}</th>)}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="rank">non‑trump</td>
          {normal.map((v, i) => (
            <td key={i} className={highlightSet?.normal?.has(i) ? "is-on" : ""}>
              {v.toFixed(1)}
            </td>
          ))}
        </tr>
        <tr>
          <td className="rank">trump</td>
          {trump.map((v, i) => (
            <td key={i} className={highlightSet?.trump?.has(i) ? "is-on" : ""}>
              {v.toFixed(1)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
    </div>
  );
}

function BidAI() {
  // hand = array of card numbers 1..52, length 1..15
  const [hand, setHand] = useState([1, 13, 27, 40, 52]); // A♣ K♣ A♠ A♥ K♥
  const [trumpSuit, setTrumpSuit] = useState(0); // 0=clubs..3=hearts

  const isTrump = (cardN) => Math.floor((cardN - 1) / 13) === trumpSuit;
  const rankOf = (cardN) => (cardN - 1) % 13;

  // Pick which lookup table is active
  const activeTable = hand.length >= 6 ? "two" : "one";
  const normal = activeTable === "two" ? CALL_TWO_NORMAL : CALL_ONE_NORMAL;
  const trump = activeTable === "two" ? CALL_TWO_TRUMP : CALL_ONE_TRUMP;

  // Highlight the cells that the current hand pulls from
  const highlightSet = useMemo(() => {
    const n = new Set();
    const t = new Set();
    if (hand.length >= 2) {
      hand.forEach(c => {
        const r = rankOf(c);
        if (isTrump(c)) t.add(r); else n.add(r);
      });
    }
    return { normal: n, trump: t };
  }, [hand, trumpSuit]);

  // Compute the call as in AutoCallTwo
  let call;
  let breakdown = [];
  if (hand.length === 1) {
    const c = hand[0];
    const isAceOfTrump = rankOf(c) === 0 && isTrump(c);
    if (isAceOfTrump) { call = 1; breakdown.push(["Ace of trump → guaranteed trick", 1]); }
    else if (isTrump(c) && rankOf(c) >= 5) { call = 1; breakdown.push(["Trump higher than 5 → hopeful", 1]); }
    else { call = 0; breakdown.push(["No trump-Ace, no high trump → bid 0", 0]); }
  } else {
    let total = 0;
    hand.forEach(c => {
      const r = rankOf(c);
      const v = isTrump(c) ? trump[r] : normal[r];
      total += v;
      breakdown.push([`${RANK_LABEL[r]}${SUITS[Math.floor((c-1)/13)]}  ${isTrump(c) ? "(trump)" : ""}`, v]);
    });
    call = Math.trunc(total + 0.5);
  }

  // Build a deck of 52 buttons grouped by suit
  const deck = Array.from({ length: 52 }, (_, i) => i + 1);

  const toggleCard = (cardN) => {
    if (hand.includes(cardN)) {
      setHand(hand.filter(c => c !== cardN));
    } else if (hand.length < 15) {
      setHand([...hand, cardN].sort((a, b) => a - b));
    }
  };

  return (
    <Win title="Bidding AI — make a call" status="Pick up to 15 cards, watch what the program would call.">
      <div className="section-label">Interactive: AutoCallTwo</div>
      <h2>An AI made of two tiny lookup tables and a sum.</h2>
      <p>
        Each card has a "trick value" — a real number between 0 and 1 — depending
        on its rank and whether it's a trump. The bot sums those values across
        your hand, rounds half up, and that's its bid. There are two tables: one
        for small hands (2–5 cards), one for big hands (6+). The 1‑card case is a
        hand-written special case.
      </p>

      <div className="row row-2 gap-16">
        <div>
          <div className="section-label">Your hand</div>
          <p style={{ fontSize: 13 }}>Click cards to add or remove. Pick a trump suit. Max 15.</p>
          <div className="panel" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13 }}>Trump:</span>
              {SUITS.map((s, i) => (
                <button
                  key={i}
                  className={"btn" + (i === trumpSuit ? " is-active" : "")}
                  onClick={() => setTrumpSuit(i)}
                  style={{ color: SUIT_COLORS[i] === "red" ? "var(--red-card)" : "var(--ink)", fontSize: 16, padding: "4px 12px" }}
                >
                  {s}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <button className="btn btn--small" onClick={() => setHand([])}>Clear</button>
              <button
                className="btn btn--small"
                onClick={() => {
                  // pick 5 random distinct cards
                  const pool = Array.from({ length: 52 }, (_, i) => i + 1);
                  pool.sort(() => Math.random() - 0.5);
                  setHand(pool.slice(0, 5).sort((a, b) => a - b));
                }}
              >
                Random 5
              </button>
            </div>
          </div>

          {SUIT_NAMES.map((sn, si) => (
            <div key={si} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "'IBM Plex Mono', monospace", margin: "4px 0 2px" }}>
                {sn} {si === trumpSuit && <span style={{ color: "var(--gold)" }}>(trump)</span>}
              </div>
              <div className="hb-deck">
                {RANK_LABEL.map((r, ri) => {
                  const cardN = si * 13 + ri + 1;
                  const inHand = hand.includes(cardN);
                  return (
                    <div
                      key={ri}
                      className={"gc " + SUIT_COLORS[si] + (inHand ? " is-selected" : "")}
                      onClick={() => toggleCard(cardN)}
                      style={{ fontSize: 10 }}
                    >
                      {r}{SUITS[si]}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="section-label">The lookup table in play</div>
          <p style={{ fontSize: 13 }}>
            <strong>{hand.length}</strong> {hand.length === 1 ? "card" : "cards"} in hand →{" "}
            {hand.length === 1 ? (<>special‑case 1‑card branch</>) :
              hand.length < 6 ? (<><code>CallValueOne</code> (2–5 cards)</>) :
              (<><code>CallValueTwo</code> (6+ cards)</>)}
          </p>
          <CallTable normal={normal} trump={trump} highlightSet={highlightSet} />
          <div className="inset gap-16">
            <h3 style={{ fontFamily: "'IBM Plex Mono', monospace" }}>What the AI would bid: <span style={{ color: "var(--red-card)", fontSize: 28 }}>{call}</span></h3>
            <div className="mono ink-soft" style={{ fontSize: 12, marginTop: 6 }}>
              {breakdown.map(([lbl, v], i) => (
                <div key={i}>{lbl} <span style={{ float: "right" }}>+ {Number(v).toFixed(1)}</span></div>
              ))}
              {hand.length > 1 && (
                <>
                  <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />
                  <div>TRUNC(sum + 0.5) <span style={{ float: "right" }}>= {call}</span></div>
                </>
              )}
            </div>
          </div>
          <div className="callout" style={{ marginTop: 14 }}>
            <strong>Caveat from the source:</strong> the "last player" rule patches
            the result so the bids never sum exactly to the dealt cards — same
            house rule used at real Whist tables. There's also an older
            <code> AutoCall </code>routine (different algorithm, pattern-matched
            on suit holdings) that <em>isn't called from anywhere</em>. Dead
            code, kept as a reference.
          </div>
        </div>
      </div>
    </Win>
  );
}

/* =====================================================================
   Random things (drunkard's walk)
   ===================================================================== */
const SUIT_SVGS = {
  club: (
    <svg viewBox="0 0 24 24"><path d="M12 2c-2.2 0-4 1.8-4 4 0 .9.3 1.7.8 2.4-.5-.2-1.1-.4-1.8-.4-2.2 0-4 1.8-4 4s1.8 4 4 4c1 0 1.8-.3 2.5-.9-.4 1.5-1.3 3-2.5 4.3h10c-1.2-1.3-2.1-2.8-2.5-4.3.7.6 1.5.9 2.5.9 2.2 0 4-1.8 4-4s-1.8-4-4-4c-.7 0-1.3.2-1.8.4.5-.7.8-1.5.8-2.4 0-2.2-1.8-4-4-4z" fill="#111"/></svg>
  ),
  diamond: (
    <svg viewBox="0 0 24 24"><path d="M12 2L4 12l8 10 8-10z" fill="#c0181f"/></svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24"><path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5 6 5c2 0 3.5 1 4 2 .5-1 2-2 4-2 3.5 0 5 4 3.5 7-2.5 4.5-9.5 9-9.5 9z" fill="#c0181f"/></svg>
  ),
  spade: (
    <svg viewBox="0 0 24 24"><path d="M12 2C9 5 4 9 4 13c0 2.5 1.8 4.5 4 4.5 1 0 1.8-.3 2.5-.9-.4 1.5-1.3 3-2.5 4.3h8c-1.2-1.3-2.1-2.8-2.5-4.3.7.6 1.5.9 2.5.9 2.2 0 4-2 4-4.5 0-4-5-8-8-11z" fill="#111"/></svg>
  ),
  md: (<div style={{ width: 26, height: 26, background: "white", display: "grid", placeItems: "center", color: "#000", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700 }}>MD</div>),
  ic: (<div style={{ width: 26, height: 26, background: "white", display: "grid", placeItems: "center", color: "#000", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9 }}>♥♣<br/>♦♠</div>),
};
const THING_KEYS = ["club", "diamond", "heart", "spade", "md", "ic"];

function RandomThings() {
  const [count, setCount] = useState(6);
  const [mult, setMult] = useState(6);
  const [interval, setInterval] = useState(120);
  const [running, setRunning] = useState(true);

  const FELT_W = 760;   // logical width; CSS scales
  const FELT_H = 360;
  const THING = 31;

  const [positions, setPositions] = useState(() =>
    Array.from({ length: 6 }, () => ({
      x: Math.random() * (FELT_W - THING),
      y: Math.random() * (FELT_H - THING),
    }))
  );

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setPositions(prev => prev.map(p => {
        let nx = p.x + mult * (Math.floor(Math.random() * 3) - 1);
        let ny = p.y + mult * (Math.floor(Math.random() * 3) - 1);
        if (nx < 0) nx += mult;
        if (nx > FELT_W - THING) nx -= mult;
        if (ny < 0) ny += mult;
        if (ny > FELT_H - THING) ny -= mult;
        // Don't eat the logo
        const lcx = FELT_W / 2 - 31, lcy = FELT_H / 2 - 31;
        if (nx > lcx - THING && nx < lcx + 62 && ny > lcy - THING && ny < lcy + 62) {
          if (nx < FELT_W / 2) nx = lcx - THING; else nx = lcx + 62;
        }
        return { x: nx, y: ny };
      }));
    }, interval);
    return () => window.clearInterval(id);
  }, [running, mult, interval]);

  return (
    <Win title={`"Random things" — the drunkard's walk`} status="Inspired by the random walk. Inhabits the felt when no game is running.">
      <div className="section-label">Interactive recreation</div>
      <h2>1–6 little bitmaps that wander while you idle.</h2>
      <p>
        When you're not in a game, the main window fires a timer every
        20–1000ms. On each tick, every "thing" steps a random multiple in x and
        in y (−1, 0, or +1 times a multiplier). Edge cases nudge them away from
        the buttons and the centre logo so they don't get eaten. It's
        delightful, it has nothing to do with playing cards, and it is the
        biggest single dialog in the options menu.
      </p>
      <div className="row row-2 gap-16" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
        <div className="felt" style={{ width: "100%", height: FELT_H }}>
          <div className="felt__logo">ESTWHI</div>
          {positions.slice(0, count).map((p, i) => (
            <div
              key={i}
              className="felt__thing"
              style={{ left: p.x, top: p.y }}
            >
              {SUIT_SVGS[THING_KEYS[i]]}
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="section-label">Random Things</div>
          <div className="slider-row">
            <label>Multiplier</label>
            <input type="range" min="1" max="20" value={mult} onChange={e => setMult(parseInt(e.target.value))} className="slider" />
            <span className="mono"><strong>{mult}</strong></span>
          </div>
          <div className="slider-row">
            <label>Number of</label>
            <input type="range" min="1" max="6" value={count} onChange={e => setCount(parseInt(e.target.value))} className="slider" />
            <span className="mono"><strong>{count}</strong></span>
          </div>
          <div className="slider-row">
            <label>Time interval</label>
            <input type="range" min="20" max="500" value={interval} onChange={e => setInterval(parseInt(e.target.value))} className="slider" />
            <span className="mono"><strong>{interval}ms</strong></span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className={"btn" + (running ? " is-active" : "")} onClick={() => setRunning(!running)}>
              {running ? "Pause" : "Resume"}
            </button>
          </div>
          <div className="mono ink-soft" style={{ fontSize: 12, marginTop: 12 }}>
            <div>// from estwhi.pas</div>
            <div>XPos[A] := XPos[A] +</div>
            <div>&nbsp;&nbsp;Multiplier*(INTEGER(RANDOM(3)) - 1);</div>
          </div>
        </div>
      </div>
    </Win>
  );
}

/* =====================================================================
   Trump cycle + rounds
   ===================================================================== */
function RoundsAndTrumps() {
  const [round, setRound] = useState(7); // 1..25
  const maxCards = 13;
  const numRounds = 2 * maxCards - 1; // 25
  const cardsDealt = round <= maxCards ? round : 2 * maxCards - round;
  const trumpIdx = ((round - 1) % 4);          // 0..3
  // Per source order: 1=clubs, 2=diamonds, 3=spades, 4=hearts
  const SUIT_ORDER = [0, 1, 2, 3]; // index into our SUITS arr
  const activeSuit = SUIT_ORDER[trumpIdx];

  return (
    <Win title="Rounds and trump cycle" status="The pyramid: 1, 2, 3 … MaxCards, MaxCards-1 … 1.">
      <div className="section-label">Interactive</div>
      <h2>The trump suit cycles. The cards-per-hand pyramids.</h2>
      <p>
        With <code>MaxCards = 13</code>, you play 25 rounds. Round N deals
        <code> min(N, 25−N+1) </code>cards to each player. The trump suit
        advances every round through <strong>clubs → diamonds → spades →
        hearts → clubs</strong>, regardless of who's playing or what was
        dealt. Click a round below to see it.
      </p>

      <div className="trumps gap-16">
        {SUITS.map((s, i) => (
          <React.Fragment key={i}>
            <div className={"trumps__suit " + (SUIT_COLORS[i] === "red" ? "red" : "") + (i === activeSuit ? " is-active" : "")}>
              {s}
            </div>
            {i < 3 && <div className="trumps__arrow">→</div>}
          </React.Fragment>
        ))}
        <div className="trumps__arrow" style={{ fontSize: 14 }}>(loops)</div>
      </div>

      <div className="row row-2 gap-16">
        <div>
          <div className="section-label">Round selector</div>
          <div className="rounds">
            {Array.from({ length: numRounds }).map((_, i) => {
              const r = i + 1;
              const cards = r <= maxCards ? r : 2 * maxCards - r;
              const isHere = r === round;
              const isPassed = r < round;
              return (
                <div
                  key={i}
                  className={"rounds__cell" + (isHere ? " is-here" : isPassed ? " is-passed" : "")}
                  onClick={() => setRound(r)}
                  title={`Round ${r}: ${cards} cards`}
                >
                  {cards}
                </div>
              );
            })}
          </div>
          <p className="mono ink-soft" style={{ fontSize: 12, marginTop: 10 }}>
            Cell value = cards dealt to each player. Cell index = round number.
          </p>
        </div>
        <div className="inset">
          <h3 className="mono">Round {round} of {numRounds}</h3>
          <div className="mono" style={{ marginTop: 8, fontSize: 13 }}>
            <div>cards per player &nbsp; <span style={{ float: "right", color: "var(--red-card)", fontWeight: 700 }}>{cardsDealt}</span></div>
            <div>trump suit &nbsp; <span style={{ float: "right", fontSize: 18 }}>{SUITS[activeSuit]}</span></div>
            <div>direction &nbsp; <span style={{ float: "right" }}>{round <= maxCards ? "ascending" : "descending"}</span></div>
            <div>round-start player &nbsp; <span style={{ float: "right" }}>(round − 1) mod N + 1</span></div>
          </div>
          <div style={{ marginTop: 12, fontSize: 13 }}>
            Maximum possible per game = <strong>15</strong>. That's why the bid
            dialog has buttons 0..15 and the program declares sixteen
            <code> CallButN </code>methods, sixteen <code>ID_CALLxxx</code>
            constants, and a sixteen-way <code>CASE</code> to grey out
            invalid options.
          </div>
        </div>
      </div>
    </Win>
  );
}

/* =====================================================================
   Scoring (interactive)
   ===================================================================== */
function ScoreChart({ mode, call }) {
  // bars showing score for outcomes 0..15 with given call & mode
  const N = 16;
  const data = Array.from({ length: N }, (_, tricks) => {
    if (mode === "vanilla") {
      return tricks === call ? tricks + 10 : tricks;
    } else {
      return tricks === call ? tricks * tricks + 10 : tricks;
    }
  });
  const max = Math.max(...data, 1);
  return (
    <div>
      <div className="score-chart" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
        {data.map((v, i) => (
          <div key={i} className="score-chart__cell">
            <div
              className={"score-chart__bar" + (i === call ? " match" : "")}
              style={{ height: `${(v / max) * 100}%` }}
              title={`${i} tricks → ${v} pts`}
            />
            <div className="score-chart__lbl">{i}</div>
          </div>
        ))}
      </div>
      <div className="mono ink-soft" style={{ fontSize: 11, marginTop: 4, textAlign: "center" }}>
        x: tricks taken &nbsp;·&nbsp; gold = matches your call of {call}
      </div>
    </div>
  );
}

function Scoring() {
  const [call, setCall] = useState(3);

  return (
    <Win title="Scoring — vanilla vs squared" status="Hit your call to get the bonus.">
      <div className="section-label">Interactive</div>
      <h2>Two modes. Same shape, very different incentives.</h2>
      <p>
        In <strong>vanilla</strong> mode, you always score one point per trick taken,
        plus a flat 10‑point bonus if your tricks exactly equal your call.
        In <strong>squared</strong> mode, hitting your call earns <code>tricks² + 10</code>
        — overshooting it wipes out almost all the value. Squared mode rewards
        accurate, ambitious bidding; vanilla mode is gentler.
      </p>
      <div className="slider-row">
        <label>Your call</label>
        <input type="range" min="0" max="15" value={call} onChange={e => setCall(parseInt(e.target.value))} className="slider" />
        <span className="mono"><strong>{call}</strong></span>
      </div>
      <div className="row row-2 gap-16">
        <div className="inset">
          <h3 className="mono">Vanilla</h3>
          <p className="mono ink-soft" style={{ fontSize: 12 }}>
            score += tricks; if tricks = call: score += 10
          </p>
          <ScoreChart mode="vanilla" call={call} />
        </div>
        <div className="inset">
          <h3 className="mono">Squared</h3>
          <p className="mono ink-soft" style={{ fontSize: 12 }}>
            if tricks = call: score += tricks² + 10; else score += tricks
          </p>
          <ScoreChart mode="squared" call={call} />
        </div>
      </div>
      <div className="callout" style={{ marginTop: 14 }}>
        <strong>Hard scoring</strong> (an option). If total bids around the
        table are less than the dealt cards and you bid zero, you forfeit the
        10‑point bonus — punishing the "everyone undershoots" loophole. The
        author commented out the <code>(n)</code> indicator that was supposed
        to display this state on the scoreboard; the comment is still in the
        source.
      </div>
    </Win>
  );
}

/* =====================================================================
   Build / tooling
   ===================================================================== */
function BuildAndTools() {
  return (
    <Win title="The build — Turbo Pascal, OWL, CTL3D and friends" status="USES Win31, WinTypes, WinProcs, WObjects, StdDlgs, WinDos, Strings, Ctl3d;">
      <div className="row row-2">
        <div>
          <div className="section-label">Tooling</div>
          <h2>A pure 1990s Borland toolchain.</h2>
          <ul className="list">
            <li><strong>Compiler:</strong> Borland Turbo Pascal for Windows v1.5 ("TP4W v1.5" in the source header). Compiles 16-bit Pascal to a Windows 3.x .EXE.</li>
            <li><strong>Framework:</strong> ObjectWindows Library 1.x — Borland's Pascal answer to MFC. Provides <code>TApplication</code>, <code>TWindow</code>, <code>TDialog</code>, <code>PButton</code>, <code>PStatic</code>, <code>PScrollBar</code>, etc.</li>
            <li><strong>3D look:</strong> Microsoft's <code>CTL3D.DLL</code>. The main program registers it on entry and unregisters on exit, so dialogs get the chiselled-bezel look that became the Win 3.1 aesthetic.</li>
            <li><strong>Resources:</strong> A separate <code>RESOURCE.BAT</code> shells out to Borland's <code>rc</code> compiler, producing <code>ESTWHI.RES</code> (icons, bitmaps, menus, dialog templates) which Pascal links in via <code>LoadBitmap(HInstance, PChar(N))</code>.</li>
            <li><strong>Help:</strong> Windows Help 3.1 (<code>WinHelp</code> API). The .HPJ project compiles <code>ESTWHI.RTF</code> + segmented hypergraphics (<code>.SHG</code> files) into <code>ESTWHI.HLP</code>.</li>
            <li><strong>Persistence:</strong> <code>GetPrivateProfileInt</code> / <code>WritePrivateProfileString</code> against <code>ESTWHI.INI</code>. No registry.</li>
          </ul>
        </div>
        <div>
          <div className="section-label">Files in the project</div>
          <div className="inset">
            <pre style={{ margin: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, lineHeight: 1.6 }}>
{`estwhi/
├── estwhi.pas      3,952 lines, all source
├── ABOUT.RC          17 lines, dialog template
├── RESOURCE.BAT       1 line, invokes 'rc'
├── ESTWHI.RES                 compiled resources
├── ESTWHI.EXE                 Win16 binary
├── RELEASE/
│   └── ESTWHI.ZIP             shipping archive
└── HELP/
    ├── ESTWHI.HPJ             help project
    ├── ESTWHI.RTF    611 lines, help source
    ├── estwhi.PH              keyword index
    ├── *.BMP, *.SHG           illustrations
    └── BMP.ZIP                image archive`}
            </pre>
          </div>
          <pre className="code" style={{ marginTop: 14 }}>
<span className="tok-com">{`(* Custom controls *)`}</span>{"\n"}
Ctl3dRegister(HInstance);{"\n"}
Ctl3dAutoSubclass(HInstance);{"\n"}
{"\n"}
CardApp.Init(<span className="tok-str">'ESTWHI'</span>);{"\n"}
CardApp.Run;{"\n"}
CardApp.Done;{"\n"}
{"\n"}
Ctl3dUnRegister(HInstance);
          </pre>
        </div>
      </div>
    </Win>
  );
}

/* =====================================================================
   Timeline
   ===================================================================== */
function Timeline() {
  const events = [
    {
      year: "1993",
      ver: "DOS draft",
      body: "Author writes a character-based DOS version first. According to the help file, this is the seed of everything that follows.",
    },
    {
      year: "1994",
      ver: "v1.0 · 20 May",
      body: "First Windows release. Rewritten in Turbo Pascal for Windows with OWL. CTL3D.DLL is added at the last moment to give dialogs their 3D look, and a status bar gets bolted on.",
    },
    {
      year: "2002",
      ver: "v1.1 · 20 Jul",
      body: 'Eight years pass. "Even longer in development than the previous version." The changes are cosmetic — pulling colour values from Windows via GetSysColor instead of hard-coded RGB.',
    },
    {
      year: "2002",
      ver: "v1.2 · 1 Aug",
      body: 'Twelve days later, v1.2. The status bar string and the about box go from "Copyright 1994" to "1994-2002." Other than that, the source diff is small.',
    },
  ];
  return (
    <Win title="Evolution" status="From DOS character UI to a 3D-bezel Win3.1 dialog over nine years.">
      <div className="section-label">Timeline</div>
      <h2>Nine years between draft and final version. Two of them in 2002.</h2>
      <div className="timeline">
        {events.map((e, i) => (
          <div key={i} className="tl-item">
            <div className="tl-item__year">{e.year}</div>
            <div className="tl-item__ver">{e.ver}</div>
            <p style={{ margin: 0, fontSize: 14 }}>{e.body}</p>
          </div>
        ))}
      </div>
      <div className="callout" style={{ marginTop: 18 }}>
        <strong>From the help file:</strong> "Future development might result
        in a v1.2 with a more intelligent playing algorithm. Time will tell.
        Perhaps in another eight years ;-)" — written in v1.1. The smarter
        play algorithm never arrived; v1.2 shipped two weeks later as a
        cosmetic update, and <code>PlayCard</code> still picks legal moves
        uniformly at random.
      </div>
    </Win>
  );
}

/* =====================================================================
   Good / Bad / Curious
   ===================================================================== */
function GoodBadCurious() {
  return (
    <Win title="What holds up, what doesn't, what's hiding" status="Comments and judgment.">
      <div className="row row-3">
        <div>
          <div className="section-label">What holds up</div>
          <h3>♣ Good</h3>
          <ul className="list list--good">
            <li><strong>Genuinely complete.</strong> Persistence, help file, options, high scores, cheat mode, idle animation, status-bar tooltips. Nothing is half there.</li>
            <li><strong>Comments worth reading.</strong> The author explains <em>why</em> there are two paint loops, why the random walk has guard rails, what each AI table flag means.</li>
            <li><strong>Heuristic AI with documented tunables.</strong> The two lookup tables are commented rank-by-rank. Adjusting bot strength is a one-line edit, not an algorithm change.</li>
            <li><strong>Idiomatic OWL.</strong> Proper <code>GetDC</code>/<code>ReleaseDC</code> bracketing, virtual destructors free brushes and bitmaps, child windows are owned by parents — clean Win16 manners.</li>
            <li><strong>Friendly UX.</strong> Hover any menu item and the status bar describes it. Hover any region of the help-file screenshot and you get a context popup.</li>
          </ul>
        </div>
        <div>
          <div className="section-label">What doesn't</div>
          <h3>♠ Could be better</h3>
          <ul className="list list--bad">
            <li><strong>One file, 3,952 lines.</strong> No unit boundaries between game logic, AI, drawing, persistence, and dialogs. Everything reaches into a sea of globals.</li>
            <li><strong>16 identical button handlers.</strong> <code>CallZer</code> through <code>CallFif</code> each set one integer and close. A 5‑line for‑loop would suffice.</li>
            <li><strong>Dumb-play AI.</strong> <code>PlayCard</code> picks a uniformly-random legal card. The bidding is heuristic; the actual play is a coin flip.</li>
            <li><strong>Shuffle is 1000 random swaps</strong> instead of one Fisher–Yates pass. Statistically fine, but the giveaway of someone who learned by intuition.</li>
            <li><strong>Selection sort</strong> on the hand. With at most 15 cards it doesn't matter — but it stands out next to all the careful Win16 code.</li>
            <li><strong>Dead code.</strong> <code>AutoCall</code> (a whole pattern‑matched bidder) is defined and never called. <code>BackPic[1..12]</code> is declared and freed but never loaded. <code>BackNo</code> is declared and never used.</li>
            <li><strong>Probability window</strong> paints a 52×N matrix that is never updated past its initial value of <code>(100 * NoCards) DIV 52</code>.</li>
          </ul>
        </div>
        <div>
          <div className="section-label">Easter eggs &amp; quirks</div>
          <h3>♥ Curious</h3>
          <ul className="list list--cur">
            <li><strong>The leftover title.</strong> <code>ABOUT.RC</code> still says <code>CAPTION "About Nonogram Solver"</code> — copy-pasted from the author's previous app and never updated. The runtime overrides it before display, so users never saw.</li>
            <li><strong>The cheat class</strong> is called <code>TChetBox</code>. Pascal identifier limits, plus an unfortunate elision.</li>
            <li><strong>Self-talk in comments:</strong> "Note to my myself - there is a reason for having two loops which are essentially the same…Thanks."</li>
            <li><strong>Trump cycle is C → D → S → H</strong> — not alphabetical, not the bridge order. The order is hard-coded by a <code>CASE</code> in <code>DrawInformation</code>.</li>
            <li><strong>OutputDebugString in production.</strong> <code>DebugEnabled := TRUE</code> on startup, and a wrapper called <code>ODS</code> fires "Estimation Whist initialised" into the system debugger every launch.</li>
            <li><strong>Help acknowledgements:</strong> the testers section credits "Father and Ross." That's the entire team.</li>
            <li><strong>The cosmetic v1.2 fix:</strong> the about box still says "<code>Copyright (C) M G Davidson 1994</code>" hard-coded in the .RC, but the live version label says 1994–2002. The dialog code overrides the static text on setup.</li>
          </ul>
        </div>
      </div>
    </Win>
  );
}

/* =====================================================================
   Closing — a peek at the actual Pascal
   ===================================================================== */
function TheCallHandler() {
  const code = `PROCEDURE TCallWin.CallZer (VAR Msg: TMessage);
BEGIN
  (* Player has called zero tricks *)
  PlayCall[1] := 0;
  TDialog.OK(Msg);
END;

PROCEDURE TCallWin.CallOne (VAR Msg: TMessage);
BEGIN
  (* Player has called one trick *)
  PlayCall[1] := 1;
  TDialog.OK(Msg);
END;

PROCEDURE TCallWin.CallTwo (VAR Msg: TMessage);
BEGIN
  (* Player has called two tricks *)
  PlayCall[1] := 2;
  TDialog.OK(Msg);
END;

(* ... and thirteen more, all the same shape,
   ending at CallFif which writes 15. *)`;

  return (
    <Win title="A representative excerpt" status="240 lines, 16 procedures, one integer.">
      <div className="section-label">Source — verbatim</div>
      <h2>Sixteen procedures for one integer assignment each.</h2>
      <p>
        This is the bidder dialog's entire action surface. Each of the sixteen
        call buttons gets a dedicated handler that writes the chosen value into
        <code> PlayCall[1] </code>(human player is always player 1) and closes
        the dialog. The whole thing could be one method that reads the button
        ID from the message — but the framework binds methods to message IDs
        statically via the <code>virtual ID_FIRST + ID_CALLxxx;</code> dispatch
        syntax, and writing the macro out by hand is the cheaper local fix
        than building a generic.
      </p>
      <pre className="code">{code}</pre>
    </Win>
  );
}

/* =====================================================================
   Closing console
   ===================================================================== */
function Closing() {
  return (
    <Win title="Wrap-up" status="C:\TPW\BIN\>">
      <div className="row row-2">
        <div>
          <div className="section-label">In one sentence</div>
          <h2>A complete, lived-in, single-file Pascal card game with a real heuristic bidder, a play algorithm that's a coin flip, and decorative suit bitmaps that bounce around the felt while it waits for you to start a new round.</h2>
          <p className="ink-soft">
            The shape of it tells you a lot about the era: heavy OWL boilerplate,
            CTL3D for the look, RTF + WinHelp for documentation, <code>.INI</code>
            files for state, all driven by raw Win16 messages. Today you'd build
            the same thing in a weekend with web components; in 1994 it was nine
            years of work in spare time, and it shows in the affection of the
            comments more than in the code shape.
          </p>
        </div>
        <div>
          <div className="section-label">If you want to keep digging</div>
          <ul className="list">
            <li><code className="mono">estwhi.pas</code> — the whole program. Start at <span className="kbd">L555</span> (globals) and <span className="kbd">L1750</span> (the AI).</li>
            <li><code className="mono">HELP/ESTWHI.RTF</code> — the help file in source form. Reads as a friendly manual.</li>
            <li><code className="mono">ABOUT.RC</code> — 17 lines and the wrong title.</li>
            <li>The author's older game, <em>Stop the Bus</em>, is mentioned in the help history as the predecessor.</li>
          </ul>
          <div className="console">
            <div><span className="prompt">C:\TPW\BIN\&gt;</span> tpc estwhi.pas /win</div>
            <div>Turbo Pascal for Windows  Version 1.5</div>
            <div>Copyright (c) 1992 Borland International</div>
            <div></div>
            <div>estwhi.pas(3952): 3952 lines, 0 errors.</div>
            <div><span className="prompt">C:\TPW\BIN\&gt;</span> _</div>
          </div>
        </div>
      </div>
    </Win>
  );
}

/* =====================================================================
   App
   ===================================================================== */
function App() {
  return (
    <div className="page">
      <Hero />
      <Facts />
      <WhatItDoes />
      <BuildAndTools />
      <ArchDiagram />
      <SourceMap />
      <CardEncoder />
      <BidAI />
      <RoundsAndTrumps />
      <Scoring />
      <RandomThings />
      <TheCallHandler />
      <Timeline />
      <GoodBadCurious />
      <Closing />
      <footer>
        Designed for ESTWHI.EXE v1.2 · 1994–2002 · Martin&nbsp;G&nbsp;Davidson · 3,952 lines accounted for.
      </footer>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
