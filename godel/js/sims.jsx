/* global React */
// ============================================================
// SIMS — Snake game · Bacteria/quine · Logistic growth graph
// ============================================================
const { useState: useStateS, useEffect: useEffectS, useRef: useRefS } = React;

// ---------- 1. SNAKE GAME (self-reference) ----------
function SnakeGame() {
  const canvasRef = useRefS(null);
  const [status, setStatus] = useStateS("ready"); // ready | playing | self | wall
  const [score, setScore] = useStateS(0);
  const [best, setBest] = useStateS(() => {
    const v = Number(localStorage.getItem("godel_snake_best"));
    return Number.isFinite(v) ? v : 0;
  });
  const game = useRefS(null);

  const GRID = 22, CELL = 20; // 440px board

  const reset = () => {
    game.current = {
      snake: [{ x: 6, y: 11 }, { x: 5, y: 11 }, { x: 4, y: 11 }],
      dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
      food: { x: 14, y: 11 }, acc: 0, last: 0, step: 130, grow: 0,
    };
    setScore(0);
  };

  const start = () => { reset(); setStatus("playing"); };

  useEffectS(() => {
    const onKey = (e) => {
      const g = game.current; if (!g) return;
      if (status !== "playing") return;
      const k = e.key;
      const map = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
      if (map[k]) {
        e.preventDefault();
        const d = map[k];
        if (d.x !== -g.dir.x || d.y !== -g.dir.y) g.nextDir = d;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status]);

  useEffectS(() => {
    const ctx = canvasRef.current.getContext("2d");
    let raf;
    const placeFood = (g) => {
      let ok = false;
      while (!ok) {
        g.food = { x: (Math.random() * GRID) | 0, y: (Math.random() * GRID) | 0 };
        ok = !g.snake.some((s) => s.x === g.food.x && s.y === g.food.y);
      }
    };
    const draw = () => {
      const g = game.current;
      // board
      ctx.fillStyle = "#0a130d";
      ctx.fillRect(0, 0, GRID * CELL, GRID * CELL);
      ctx.strokeStyle = "rgba(38,69,47,0.5)";
      ctx.lineWidth = 1;
      for (let i = 1; i < GRID; i++) {
        ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, GRID * CELL); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(GRID * CELL, i * CELL); ctx.stroke();
      }
      if (!g) return;
      // food (a microbe)
      ctx.fillStyle = "#6cd6e8";
      ctx.beginPath();
      ctx.arc(g.food.x * CELL + CELL / 2, g.food.y * CELL + CELL / 2, CELL / 2 - 3, 0, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(10,19,13,0.6)";
      ctx.beginPath();
      ctx.arc(g.food.x * CELL + CELL / 2 - 2, g.food.y * CELL + CELL / 2 - 2, 2, 0, 7);
      ctx.fill();
      // snake
      g.snake.forEach((s, i) => {
        const head = i === 0;
        ctx.fillStyle = head ? "#9cf0a8" : `hsl(${135 - i * 1.4}, 50%, ${52 - Math.min(i, 18)}%)`;
        const pad = head ? 1 : 2;
        const r = head ? 6 : 4;
        roundRect(ctx, s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, r);
        ctx.fill();
        if (head) {
          ctx.fillStyle = "#0a130d";
          const ex = g.dir.x, ey = g.dir.y;
          ctx.beginPath(); ctx.arc(s.x * CELL + CELL / 2 + ex * 3 - ey * 3, s.y * CELL + CELL / 2 + ey * 3 - ex * 3, 1.8, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.arc(s.x * CELL + CELL / 2 + ex * 3 + ey * 3, s.y * CELL + CELL / 2 + ey * 3 + ex * 3, 1.8, 0, 7); ctx.fill();
        }
      });
    };
    const loop = (t) => {
      const g = game.current;
      if (g && status === "playing") {
        if (!g.last) g.last = t;
        if (t - g.last >= g.step) {
          g.last = t;
          g.dir = g.nextDir;
          const head = { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y };
          const willGrow = head.x === g.food.x && head.y === g.food.y;
          // when not growing, the tail vacates its cell this tick, so the head may
          // legally move into it — excluding it avoids a spurious game-over on tight turns
          const body = willGrow ? g.snake : g.snake.slice(0, -1);
          if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) {
            setStatus("wall"); finalize(g);
          } else if (body.some((s) => s.x === head.x && s.y === head.y)) {
            setStatus("self"); finalize(g);
          } else {
            g.snake.unshift(head);
            if (willGrow) {
              setScore((s) => { const ns = s + 1; return ns; });
              g.step = Math.max(70, g.step - 3);
              placeFood(g);
            } else {
              g.snake.pop();
            }
          }
        }
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    const finalize = (g) => {
      setScore((s) => {
        setBest((b) => { const nb = Math.max(b, s); localStorage.setItem("godel_snake_best", String(nb)); return nb; });
        return s;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  return (
    <div className="widget">
      <div className="widget-head"><span className="widget-kicker">Interactive · Play</span></div>
      <h3 className="widget-title">Ouroboros — the Self-Reference Arcade</h3>
      <p className="widget-desc">
        Guide Kurt with the arrow keys; eat the cyan microbes to grow. Crash into a wall and it's an
        ordinary game over. But steer into <b>your own tail</b> — and the system collides with itself,
        exactly the move at the heart of Gödel's proof.
      </p>
      <div className="snake-wrap" style={{ maxWidth: GRID * CELL, margin: "0 auto" }}>
        <canvas ref={canvasRef} width={GRID * CELL} height={GRID * CELL}
          style={{ border: "1px solid var(--border)", background: "#0a130d" }} />
        {status !== "playing" && (
          <div className="snake-overlay">
            {status === "ready" && (<><h4>Ouroboros</h4><p>Arrow keys to move. Eat microbes. Try not to eat yourself.</p></>)}
            {status === "wall" && (<><h4>Hit the wall</h4><p>An external limit — the edge of the terrarium. Ordinary game over.</p></>)}
            {status === "self" && (<><h4>You bit your own tail 🐍</h4><p>The snake referred to <em>itself</em>. That self-collision — a system whose statements range over the system itself — is the single ingredient Gödel needed. This is the ouroboros.</p></>)}
            <button className="btn primary" onClick={start}>{status === "ready" ? "Start" : "Play again"}</button>
          </div>
        )}
      </div>
      <div className="snake-hud" style={{ justifyContent: "center" }}>
        <span>length <b>{score + 3}</b></span>
        <span>microbes eaten <b>{score}</b></span>
        <span>best <b>{best}</b></span>
      </div>
    </div>
  );
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- 2. BACTERIA / QUINE ----------
function QuineLab() {
  const [out, setOut] = useStateS("");
  const [gen, setGen] = useStateS(0);
  // a genuine self-printing JS quine
  const quine = "(function q(){var s='(function q(){var s=%J%;console.log(s.replace(/%J%/, JSON.stringify(s)))})()';console.log(s.replace(/%J%/, JSON.stringify(s)))})()";
  const run = () => {
    // emulate: a quine prints its own source
    setOut(quine);
    setGen((g) => g + 1);
  };
  return (
    <div className="widget">
      <div className="widget-head"><span className="widget-kicker">Interactive · Self-replication</span></div>
      <h3 className="widget-title">The Quine — a Program That Births Itself</h3>
      <p className="widget-desc">
        A bacterium is a set of instructions (its genome) that, when executed, builds a complete copy
        of those very instructions. In code, that's a <b>quine</b>: a program whose only output is its
        own source text. Self-reference made mechanical — and the bridge from biology to Gödel.
      </p>
      <div className="quine-code">{quineColored()}</div>
      <div style={{ display: "flex", gap: 10, margin: "16px 0 0" }}>
        <button className="btn primary" onClick={run}>Run / Replicate ⟳</button>
        <button className="btn ghost" onClick={() => { setOut(""); setGen(0); }}>Reset</button>
      </div>
      {out && (
        <>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-faint)", margin: "14px 0 4px", letterSpacing: ".1em" }}>
            OUTPUT — GENERATION {gen} (identical to the source: replication succeeded)
          </div>
          <div className="quine-out">{out}</div>
        </>
      )}
    </div>
  );
}
function quineColored() {
  return (
    <span>
      <span className="k">(function</span> <span className="fn">q</span>(){"{"}
      {"\n  "}<span className="k">var</span> s = <span className="s">'…the program's own text…'</span>;
      {"\n  "}<span className="fn">console.log</span>(s.replace(<span className="s">/%J%/</span>, JSON.stringify(s)))
      {"\n"}{"}"})()
      {"\n"}<span style={{ color: "var(--ink-faint)" }}>{"// reads its own body, prints an exact copy — like a cell dividing"}</span>
    </span>
  );
}

// ---------- 3. LOGISTIC GROWTH GRAPH (calculus aside) ----------
function LogisticGraph() {
  const canvasRef = useRefS(null);
  const [r, setR] = useStateS(0.9);
  const [K, setK] = useStateS(1000);
  const [P0, setP0] = useStateS(20);

  useEffectS(() => {
    const cv = canvasRef.current;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const padL = 52, padB = 36, padT = 18, padR = 16;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const Tmax = 18;
    const yMax = K * 1.15;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0a130d";
    ctx.fillRect(0, 0, W, H);

    const X = (t) => padL + (t / Tmax) * plotW;
    const Y = (p) => padT + plotH - (p / yMax) * plotH;

    // carrying capacity line
    ctx.strokeStyle = "rgba(224,179,94,0.55)";
    ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(padL, Y(K)); ctx.lineTo(W - padR, Y(K)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#e0b35e"; ctx.font = "12px 'IBM Plex Mono', monospace";
    ctx.fillText("K = carrying capacity", padL + 8, Y(K) - 7);

    // axes
    ctx.strokeStyle = "rgba(170,194,177,0.4)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(W - padR, padT + plotH); ctx.stroke();
    ctx.fillStyle = "#71907d"; ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillText("time →", W - padR - 46, padT + plotH + 24);
    ctx.save(); ctx.translate(16, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("population P(t)", -42, 0); ctx.restore();

    // logistic closed form: P(t) = K / (1 + A e^{-rt}),  A = (K-P0)/P0
    const A = (K - P0) / P0;
    ctx.strokeStyle = "#7ddb8a"; ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let px = 0; px <= plotW; px++) {
      const t = (px / plotW) * Tmax;
      const P = K / (1 + A * Math.exp(-r * t));
      const x = padL + px, y = Y(P);
      if (px === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // inflection point at P = K/2  →  t* = ln(A)/r  (max growth rate)
    if (A > 0) {
      const tStar = Math.log(A) / r;
      if (tStar > 0 && tStar < Tmax) {
        ctx.fillStyle = "#b39bff";
        ctx.beginPath(); ctx.arc(X(tStar), Y(K / 2), 4.5, 0, 7); ctx.fill();
        ctx.fillStyle = "#b39bff"; ctx.font = "11px 'IBM Plex Mono', monospace";
        ctx.fillText("max growth (P=K/2)", X(tStar) + 8, Y(K / 2) + 4);
      }
    }
    // P0 dot
    ctx.fillStyle = "#6cd6e8";
    ctx.beginPath(); ctx.arc(X(0), Y(P0), 4, 0, 7); ctx.fill();
  }, [r, K, P0]);

  const tRef = window.useTypeset(0);

  return (
    <div className="widget">
      <div className="widget-head"><span className="widget-kicker">Calculus aside · Microbiology</span></div>
      <h3 className="widget-title">How a Colony Grows — the Logistic Equation</h3>
      <p className="widget-desc">
        A digression Esther insisted on. Bacteria in a flask don't grow without bound; they slow as
        they crowd their resources. That story is told by one of the most elegant differential
        equations in biology. Drag the parameters and watch the curve respond in real time.
      </p>
      <div className="mathblock" ref={tRef}>
        {"$$ \\frac{dP}{dt} = r\\,P\\left(1 - \\frac{P}{K}\\right) \\qquad\\Longrightarrow\\qquad P(t) = \\frac{K}{1 + A e^{-rt}},\\;\\; A = \\frac{K-P_0}{P_0} $$"}
        <div className="math-caption">growth rate r · carrying capacity K · the integral of a logistic curve is the S-shaped sigmoid</div>
      </div>
      <canvas ref={canvasRef} width={680} height={320} style={{ maxWidth: "100%" }} />
      <div style={{ marginTop: 16 }}>
        <div className="slider-row">
          <label>growth rate r</label>
          <input type="range" min="0.2" max="2.5" step="0.05" value={r} onChange={(e) => setR(+e.target.value)} />
          <output>{r.toFixed(2)}</output>
        </div>
        <div className="slider-row">
          <label>carrying cap. K</label>
          <input type="range" min="300" max="2000" step="50" value={K} onChange={(e) => setK(+e.target.value)} />
          <output>{K}</output>
        </div>
        <div className="slider-row">
          <label>start P₀</label>
          <input type="range" min="2" max="400" step="2" value={P0} onChange={(e) => setP0(+e.target.value)} />
          <output>{P0}</output>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SnakeGame, QuineLab, LogisticGraph });
