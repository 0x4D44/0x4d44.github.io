/* global React */
// ============================================================
// INTERACTIVES — Liar machine · Gödel encoder · Quiz · Proof
// ============================================================
const { useState, useEffect, useRef, useCallback } = React;

// re-typeset MathJax inside a node after render
function useTypeset(dep) {
  const ref = useRef(null);
  useEffect(() => {
    if (window.MathJax && window.MathJax.typesetPromise && ref.current) {
      window.MathJax.typesetPromise([ref.current]).catch(() => {});
    }
  }, [dep]);
  return ref;
}

// ---------- 1. LIAR'S PARADOX MACHINE ----------
function LiarMachine() {
  const [state, setState] = useState("idle"); // idle | true | false | smoke
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const timer = useRef(null);
  const count = useRef(0);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    setRunning(false);
  }, []);

  const run = () => {
    if (running) { stop(); return; }
    setLog([]); count.current = 0; setRunning(true);
    let cur = true;
    let delay = 620;
    const tick = () => {
      count.current++;
      const n = count.current;
      setState(cur ? "true" : "false");
      setLog((L) => [
        ...L,
        { n, txt: cur
          ? "Suppose S is TRUE → but S says it is false → so S is FALSE."
          : "Suppose S is FALSE → but that is exactly what S claims → so S is TRUE.",
          cur },
      ]);
      cur = !cur;
      delay = Math.max(70, delay * 0.82);
      if (n >= 12) {
        timer.current = setTimeout(() => {
          setState("smoke");
          setLog((L) => [...L, { n: "✺", txt: "MACHINE OVERHEATS. No stable truth value exists. Undecidable.", cur: null }]);
          setRunning(false);
        }, delay);
        return;
      }
      timer.current = setTimeout(tick, delay);
    };
    tick();
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const label = state === "smoke" ? "✺ ✺ ✺" : state === "true" ? "TRUE" : state === "false" ? "FALSE" : "—";

  return (
    <div className="widget">
      <div className="widget-head">
        <span className="widget-kicker">Interactive · Self-reference</span>
      </div>
      <h3 className="widget-title">The Liar Machine</h3>
      <p className="widget-desc">
        Feed the sentence <b>S = “This sentence is false.”</b> into an evaluator that tries to decide
        whether it is true or false. Watch what happens — and notice how the machine speeds up as it
        chases its own tail.
      </p>
      <div className="liar-readout">
        <div className={"liar-state " + state}>{label}</div>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button className="btn primary" onClick={run}>{running ? "Stop" : "Evaluate S"}</button>
        <button className="btn ghost" onClick={() => { stop(); setState("idle"); setLog([]); }}>Reset</button>
      </div>
      <div className="liar-log" ref={logRef}>
        {log.length === 0 && <div style={{ opacity: 0.6 }}>// evaluator idle — press “Evaluate S”</div>}
        {log.map((e, i) => (
          <div key={i}>
            <span className={e.cur === null ? "" : e.cur ? "t" : "f"}>[{e.n}]</span> {e.txt}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 2. GÖDEL NUMBERING ENCODER ----------
// assign each symbol a code, encode a string s1..sn as ∏ prime_i ^ code_i  (BigInt)
const GODEL_SYMS = [
  { s: "0", c: 1 }, { s: "S", c: 3 }, { s: "=", c: 5 }, { s: "+", c: 7 },
  { s: "×", c: 9 }, { s: "(", c: 11 }, { s: ")", c: 13 }, { s: "¬", c: 15 },
  { s: "∨", c: 17 }, { s: "→", c: 19 }, { s: "∀", c: 21 }, { s: "∃", c: 23 },
  { s: "x", c: 25 }, { s: "y", c: 27 },
];
const SYM_PRESETS = [
  { label: "0 = 0", seq: ["0", "=", "0"] },
  { label: "∀x ( x = x )", seq: ["∀", "x", "(", "x", "=", "x", ")"] },
  { label: "S0 = S0", seq: ["S", "0", "=", "S", "0"] },
];
function firstPrimes(n) {
  const out = []; let cand = 2;
  while (out.length < n) {
    let p = true;
    for (let i = 2; i * i <= cand; i++) if (cand % i === 0) { p = false; break; }
    if (p) out.push(cand);
    cand++;
  }
  return out;
}
function ipow(base, exp) { // BigInt power
  let r = 1n, b = BigInt(base), e = exp;
  while (e > 0) { if (e & 1) r *= b; b *= b; e >>= 1; }
  return r;
}

function GodelEncoder() {
  const [seq, setSeq] = useState(["0", "=", "0"]);
  const primes = firstPrimes(Math.max(seq.length, 1));
  let big = 1n;
  seq.forEach((s, i) => {
    const code = GODEL_SYMS.find((g) => g.s === s).c;
    big *= ipow(primes[i], code);
  });
  const numStr = seq.length ? big.toString() : "1";
  const tRef = useTypeset(seq.join(""));

  return (
    <div className="widget">
      <div className="widget-head"><span className="widget-kicker">Interactive · Encoding</span></div>
      <h3 className="widget-title">The Gödel Numbering Machine</h3>
      <p className="widget-desc">
        Gödel's master trick: every symbol, formula, and even whole proofs can be turned into a single
        natural number — a “barcode” for a sentence. Build a formula from the palette and watch it
        collapse into one gigantic integer, exactly like a strand of symbols folding into a genome.
      </p>

      <div className="encoder-strip">
        {GODEL_SYMS.map((g) => (
          <button key={g.s} className="chip" onClick={() => setSeq((q) => q.length < 12 ? [...q, g.s] : q)}>
            {g.s}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn ghost" onClick={() => setSeq((q) => q.slice(0, -1))}>⌫ delete</button>
        <button className="btn ghost" onClick={() => setSeq([])}>clear</button>
        {SYM_PRESETS.map((p) => (
          <button key={p.label} className="btn" onClick={() => setSeq(p.seq)}>{p.label}</button>
        ))}
      </div>

      <div className="encoder-display">
        {seq.length === 0 && <span className="placeholder">build a formula from the palette above…</span>}
        {seq.map((s, i) => (
          <span className="encoder-sym" key={i}>
            <small>{GODEL_SYMS.find((g) => g.s === s).c}</small>{s}
          </span>
        ))}
      </div>

      {seq.length > 0 && (
        <>
          <div className="encoder-factors" ref={tRef}>
            {"\\( \\#(\\sigma) = " + seq.map((s, i) => {
              const code = GODEL_SYMS.find((g) => g.s === s).c;
              return `${primes[i]}^{${code}}${i < seq.length - 1 ? " \\cdot " : ""}`;
            }).join("") + " \\)"}
          </div>
          <div className="godel-number">{numStr}</div>
          <div className="digit-count">
            ↳ that's a {numStr.length}-digit number encoding a {seq.length}-symbol formula. Unique
            prime factorization means it can always be decoded back — losslessly.
          </div>
        </>
      )}
    </div>
  );
}

// ---------- 3. QUIZ / CHECKPOINT ----------
function Quiz({ q, options, answer, explain }) {
  const [picked, setPicked] = useState(null);
  return (
    <div className="widget">
      <div className="widget-head"><span className="widget-kicker">Checkpoint</span></div>
      <h3 className="widget-title" style={{ fontSize: 20 }}>{q}</h3>
      <div style={{ marginTop: 16 }}>
        {options.map((o, i) => {
          let cls = "quiz-option";
          if (picked !== null) {
            if (i === answer) cls += " correct";
            else if (i === picked) cls += " wrong";
          }
          return (
            <button key={i} className={cls} disabled={picked !== null}
              onClick={() => setPicked(i)}>{o}</button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="quiz-feedback">
          {picked === answer ? "✓ Correct. " : "✗ Not quite. "}{explain}
        </div>
      )}
    </div>
  );
}

// ---------- 4. PROOF WALKTHROUGH ----------
const PROOF_STEPS = [
  {
    label: "Setup", title: "We have a formal system F",
    body: (<><p><strong>F</strong> is any consistent formal system rich enough to talk about arithmetic — it has axioms, symbols, and mechanical rules for deriving theorems. Think of it as a closed terrarium: a fixed set of starting conditions and laws of growth.</p><p>“Provable in F” means: there is a finite chain of rule-applications from the axioms to the statement.</p></>),
    math: "\\( F \\vdash \\varphi \\quad\\text{means}\\quad \\varphi \\text{ is provable in } F \\)",
  },
  {
    label: "Encode", title: "Everything becomes a number",
    body: (<><p>Using Gödel numbering, <strong>every formula and every proof gets a unique number</strong>. Statements about formulas become statements about numbers — and arithmetic can talk about numbers.</p><p>So F can now reason <em>about its own sentences</em>, the way DNA encodes the very machinery that reads DNA.</p></>),
    math: "\\( \\sigma \\longmapsto \\#(\\sigma) \\in \\mathbb{N} \\)",
  },
  {
    label: "Provability", title: "Define a provability predicate",
    body: (<><p>Because proofs are just numbers, we can write an arithmetic formula <code>Prov(n)</code> that is true exactly when n is the Gödel number of a provable sentence.</p><p>F can literally <strong>express the sentence “I can prove statement number n.”</strong></p></>),
    math: "\\( \\mathrm{Prov}_F(n) \\;\\equiv\\; \\exists p\\,\\big[\\,p \\text{ encodes a proof of } n\\,\\big] \\)",
  },
  {
    label: "Diagonalize", title: "The Diagonal Lemma — self-reference",
    body: (<><p>Here is the snake biting its tail. The Diagonal Lemma guarantees that for <em>any</em> property P, there is a sentence G that asserts “P holds of my own Gödel number.”</p><p>Choose P to be <strong>“is not provable.”</strong> We obtain a sentence G that says, of itself, <strong>“G is not provable in F.”</strong></p></>),
    math: "\\( F \\vdash \\; G \\;\\leftrightarrow\\; \\neg\\,\\mathrm{Prov}_F(\\#(G)) \\)",
  },
  {
    label: "Case 1", title: "Suppose F could prove G",
    body: (<><p>If <strong>F ⊢ G</strong>, then G is provable — so <code>Prov(#G)</code> is true. But G <em>says</em> it is not provable. F would prove both G and ¬G.</p><p>That makes F <strong>inconsistent</strong>. Since we assumed F is consistent, this case is impossible.</p></>),
    math: "\\( F \\vdash G \\;\\Rightarrow\\; F \\vdash \\neg G \\;\\Rightarrow\\; F \\text{ inconsistent} \\)",
  },
  {
    label: "Case 2", title: "So F cannot prove G",
    body: (<><p>Therefore <strong>F ⊬ G</strong>. But that is <em>exactly what G asserts</em> — that it is not provable. So G is <strong>true</strong>.</p><p>We have a sentence that is true, yet unprovable inside F. The terrarium contains a fact it can never grow to reach.</p></>),
    math: "\\( F \\nvdash G \\;\\Rightarrow\\; G \\text{ is true but unprovable in } F \\)",
  },
  {
    label: "Conclusion", title: "First Incompleteness Theorem",
    body: (<><p>Any consistent, sufficiently expressive formal system F is <strong>incomplete</strong>: there are true statements of arithmetic it cannot prove.</p><p>And you can't fix it by adding G as a new axiom — the same construction immediately builds a fresh unprovable G′. Self-reference always finds a new tail to bite.</p></>),
    math: "\\( \\text{Consistent } F \\;\\Rightarrow\\; \\exists\\, G:\\; G \\text{ true} \\;\\wedge\\; F \\nvdash G \\)",
  },
];

function ProofWalkthrough() {
  const [i, setI] = useState(0);
  const step = PROOF_STEPS[i];
  const tRef = useTypeset(i);
  return (
    <div className="widget">
      <div className="widget-head"><span className="widget-kicker">Interactive · The Proof</span></div>
      <h3 className="widget-title">Building Gödel's Sentence, Step by Step</h3>
      <p className="widget-desc">The whole proof in seven moves. Step through it — or jump to any stage.</p>
      <div className="proof-step-track">
        {PROOF_STEPS.map((_, k) => (
          <button key={k} aria-label={"step " + (k + 1)}
            className={"proof-step-dot " + (k === i ? "now" : k < i ? "done" : "")}
            onClick={() => setI(k)} />
        ))}
      </div>
      <div className="proof-card" ref={tRef}>
        <div className="proof-step-label">{step.label} · Step {i + 1} of {PROOF_STEPS.length}</div>
        <h4>{step.title}</h4>
        <div className="proof-body">{step.body}</div>
        <div className="proof-math">{step.math}</div>
      </div>
      <div className="proof-nav">
        <button className="btn" disabled={i === 0} onClick={() => setI((x) => Math.max(0, x - 1))}>← Prev</button>
        <button className="btn primary" disabled={i === PROOF_STEPS.length - 1}
          onClick={() => setI((x) => Math.min(PROOF_STEPS.length - 1, x + 1))}>Next →</button>
        <span className="proof-count">{i + 1} / {PROOF_STEPS.length}</span>
      </div>
    </div>
  );
}

Object.assign(window, { LiarMachine, GodelEncoder, Quiz, ProofWalkthrough, useTypeset });
