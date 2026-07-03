/* builder.jsx — Build Your Own IPO + scoring engine */

const BUILDER_KEY = "ipo.builder.v1";

/* ---------- scoring engine ---------- */
function scoreEngine(ans) {
  const B = window.BUILDER;
  let sub = { integrity: 55, appeal: 40, governance: 55, credibility: 50 };
  let scrutiny = 0;
  let hype = 1;
  let valBase = 3;
  const flags = [];

  const add = (s) => { if (!s) return; for (const k in s) if (k in sub) sub[k] += s[k]; };

  // 1. archetype
  const arch = find(B.steps[0].options, ans.archetype);
  if (arch) { add(arch.s); scrutiny += arch.scrutiny || 0; hype = arch.hype || 1; valBase = arch.val || 3; }

  // 2. risk factors
  const riskStep = B.steps[1];
  let buriedMaterial = 0, disclosedMaterial = 0;
  riskStep.risks.forEach((r) => {
    const choice = (ans.risks && ans.risks[r.id]) || "disclose";
    if (r.kind === "material") {
      if (choice === "disclose") { sub.integrity += 7; sub.appeal -= 2; disclosedMaterial++; }
      else { sub.integrity -= 16; scrutiny += 10; buriedMaterial++; }
    } else {
      if (choice === "disclose") { sub.integrity += 1; sub.appeal -= 1; }
      else { sub.integrity -= 3; sub.appeal += 1; }
    }
  });
  if (buriedMaterial > 0) flags.push("section11");

  // 3. founder letter
  const letter = find(B.steps[2].options, ans.letter);
  if (letter) { add(letter.s); scrutiny += letter.scrutiny || 0; }

  // 4. governance
  const gov = find(B.steps[3].options, ans.governance);
  if (gov) add(gov.s);

  // 5. use of proceeds
  const proc = find(B.steps[4].options, ans.proceeds);
  if (proc) { add(proc.s); scrutiny += proc.scrutiny || 0; }

  // 6. pricing
  const pr = ans.pricing || {};
  const bank = find(B.steps[5].banks, pr.bank);
  if (bank) add(bank.s);
  const a = typeof pr.aggression === "number" ? pr.aggression : 50;
  // pricing discipline -> credibility
  if (a > 68) sub.credibility -= (a - 68) * 0.45;
  if (a < 28) sub.credibility -= (28 - a) * 0.18;
  if (a > 80) { scrutiny += (a - 80) * 0.5; }

  // clamp sub-scores
  for (const k in sub) sub[k] = clamp(Math.round(sub[k]), 0, 100);

  // readiness
  let readiness =
    sub.integrity * 0.27 +
    sub.credibility * 0.26 +
    sub.governance * 0.22 +
    sub.appeal * 0.25 -
    scrutiny * 0.18;
  readiness = clamp(Math.round(readiness), 1, 99);
  if (buriedMaterial >= 2) readiness = Math.min(readiness, 38);

  // derived: valuation, raise, first-day move
  const valuation =
    valBase * hype * (0.55 + sub.appeal / 100) * (0.7 + (a / 100) * 0.95);
  const raised = valuation * 0.12;
  let move =
    sub.appeal * 0.6 - scrutiny * 0.85 + (50 - a) * 0.95 + (sub.credibility - 50) * 0.2;
  move = clamp(Math.round(move), -55, 185);

  // tier
  const tier = pickTier(readiness, buriedMaterial, ans);

  // reactions
  const reactions = buildReactions({ ans, sub, scrutiny, readiness, move, buriedMaterial, disclosedMaterial, a });

  return { sub, scrutiny, readiness, valuation, raised, move, tier, reactions, flags };
}

function pickTier(r, buriedMaterial, ans) {
  // WeWork combo easter egg
  const we = ans.letter === "messianic" && ans.governance === "supervote" && ans.proceeds === "secondary";
  if (we) return { tag: "WITHDRAWN", cls: "red", head: "A masterpiece of obfuscation.", body: "Messianic letter, supervoting forever, and proceeds flowing to insiders — the market has seen this exact movie. The bankers stop returning calls; the deal is shelved \"pending market conditions.\" You keep the jet, briefly." };
  if (buriedMaterial >= 2) return { tag: "PULLED · LEGAL HOLD", cls: "red", head: "Effectiveness denied.", body: "You buried risks the disclosure regime calls material. Counsel pulls the deal before the plaintiffs' bar can read past the summary. Disclosure, not merit — you broke the one rule." };
  if (r >= 85) return { tag: "DECLARED EFFECTIVE", cls: "green", head: "A textbook float.", body: "Clean disclosure, a credible story, governance the index funds can live with, and a price the book could clear. The bell rings; the stock trades up and holds. This is what \"a good deal\" actually looks like." };
  if (r >= 70) return { tag: "PRICED & TRADING", cls: "green", head: "A clean debut.", body: "Not flawless, but more than fundable. Demand covered the book, the allocations went out, and the after-market is orderly. A few analysts quibble; nobody panics." };
  if (r >= 55) return { tag: "CHOPPY DEBUT", cls: "amber", head: "It got done — barely.", body: "The deal priced at the low end after the bankers leaned on the book. It trades sideways-to-soft. Survivable, but the cap table is grumbling and the lock-up expiry looms." };
  if (r >= 40) return { tag: "DOWN-ROUND WHISPERS", cls: "amber", head: "The book is soft.", body: "Institutions balked at the story, the governance, or the price. You cut the range and shrank the deal to get it out. The first-day trade is ugly and the post-mortems write themselves." };
  return { tag: "PULLED BEFORE PRICING", cls: "red", head: "The window closed.", body: "Too much risk, too little credibility, too rich a price. The roadshow didn't build a book and the syndicate recommended standing down. You'll \"revisit when markets stabilize.\"" };
}

function buildReactions({ ans, sub, scrutiny, readiness, move, buriedMaterial, disclosedMaterial, a }) {
  const out = [];

  // SEC
  if (buriedMaterial >= 1)
    out.push({ from: "The SEC", say: `Comment letter, round three: "Please expand your risk factor disclosure regarding the items omitted from this filing." They have noticed. They always notice.` });
  else if (sub.integrity >= 75)
    out.push({ from: "The SEC", say: "Two rounds of comments, cleanly resolved. Corp Fin declares the registration effective without drama." });
  else
    out.push({ from: "The SEC", say: "A standard comment letter on MD&A and non-GAAP metrics. Nothing your counsel hasn't seen a hundred times." });

  // The Street / institutions
  if (sub.credibility >= 70 && sub.appeal >= 60)
    out.push({ from: "The Street", say: "The book is multiple-times oversubscribed by lunch on the second day of the roadshow. The bankers start talking about raising the range." });
  else if (sub.credibility < 40)
    out.push({ from: "The Street", say: "\"We love the growth, we don't trust the numbers.\" The long-only funds pass; the book leans on hedge funds and the hot-money crowd." });
  else
    out.push({ from: "The Street", say: "Polite interest. The order book fills, but anchors are asking for a discount and a bigger allocation." });

  // The Press
  if (ans.letter === "messianic")
    out.push({ from: "The Press", say: "The founder's letter is screenshotted and dunked on by every finance account before the filing finishes loading. \"Elevate the world's consciousness,\" they quote, with a single emoji." });
  else if (ans.letter === "ownersmanual")
    out.push({ from: "The Press", say: "The letter earns a respectful column: \"a refreshingly candid stance on long-term management.\" Comparisons to Buffett, which you do not discourage." });
  else if (ans.proceeds === "secondary")
    out.push({ from: "The Press", say: "\"Who's actually cashing out here?\" The ownership table gets a dedicated explainer with arrows pointing at the founder's secondary." });
  else
    out.push({ from: "The Press", say: "Measured coverage. A business-section recap of the numbers and the range; no viral moment, which is its own kind of win." });

  // Retail / first-day tape
  if (move >= 90)
    out.push({ from: "First-day tape", say: `Up ${move}% at the open. Retail is euphoric; the founders are quietly furious they priced so far below what the market would pay. That's your money on someone else's table.` });
  else if (move >= 20)
    out.push({ from: "First-day tape", say: `A healthy ${move}% pop and a close above the offer price. The allocated accounts are happy and the tape is calm.` });
  else if (move >= 0)
    out.push({ from: "First-day tape", say: `Opens flat, +${move}%. No fireworks, no broken syndicate. The bankers call it "priced to perfection"; you call it fine.` });
  else
    out.push({ from: "First-day tape", say: `A broken IPO: ${move}% through the offer price by the close. The stabilization desk is busy and the headlines are unkind.` });

  // governance bonus voice
  if (ans.governance === "supervote")
    out.push({ from: "Index funds", say: "ISS and the big passive houses flag the no-sunset supervoting structure and recommend voting against the directors. You control the vote anyway — which is rather the point, and the problem." });

  return out.slice(0, 5);
}

function find(arr, id) { return (arr || []).find((x) => x.id === id); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function fmtB(v) {
  if (v >= 100) return "$" + Math.round(v) + "B";
  if (v >= 1) return "$" + v.toFixed(1) + "B";
  return "$" + Math.round(v * 1000) + "M";
}

/* ---------- gauge ---------- */
function Gauge({ value }) {
  const r = 84, c = 2 * Math.PI * r;
  const frac = value / 100;
  const col = value >= 70 ? "var(--green)" : value >= 45 ? "var(--amber)" : "var(--ledger)";
  return (
    <div className="gauge">
      <svg viewBox="0 0 200 200" width="200" height="200">
        <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(26,36,24,0.14)" strokeWidth="14" />
        <circle
          cx="100" cy="100" r={r} fill="none" stroke={col} strokeWidth="14" strokeLinecap="butt"
          strokeDasharray={`${c * frac} ${c}`}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="gnum">
        <div className="g-big" style={{ color: col }}>{value}</div>
        <div className="g-of">IPO Readiness</div>
      </div>
    </div>
  );
}

/* ---------- main builder ---------- */
function Builder() {
  const B = window.BUILDER;
  const [step, setStep] = React.useState(0);
  const [phase, setPhase] = React.useState("build"); // build | result
  const [ans, setAns] = React.useState(() => {
    const defaults = { archetype: null, risks: {}, letter: null, governance: null, proceeds: null, pricing: { bank: null, aggression: 40 } };
    try {
      const saved = JSON.parse(localStorage.getItem(BUILDER_KEY) || "null");
      if (saved) return {
        ...defaults, ...saved,
        risks: { ...defaults.risks, ...(saved.risks || {}) },
        pricing: { ...defaults.pricing, ...(saved.pricing || {}) },
      };
    } catch (e) {}
    return defaults;
  });

  React.useEffect(() => {
    try { localStorage.setItem(BUILDER_KEY, JSON.stringify(ans)); } catch (e) {}
  }, [ans]);

  const steps = B.steps;
  const cur = steps[step];

  const setSingle = (key, id) => setAns((a) => ({ ...a, [key]: id }));
  const setRisk = (rid, val) => setAns((a) => ({ ...a, risks: { ...a.risks, [rid]: val } }));
  const setPricing = (patch) => setAns((a) => ({ ...a, pricing: { ...a.pricing, ...patch } }));

  const stepComplete = (i) => {
    const s = steps[i];
    if (s.kind === "single") return !!ans[s.id];
    if (s.kind === "risks") return true; // defaults to disclose
    if (s.kind === "pricing") return !!(ans.pricing && ans.pricing.bank);
    return false;
  };
  const canNext = stepComplete(step);
  const allDone = steps.every((_, i) => stepComplete(i));

  const result = phase === "result" ? scoreEngine(ans) : null;

  return (
    <Section id="builder">
      <SectionHead
        num="§ 04 — The Workshop"
        title='Build your own <span class="serif">IPO</span>'
        intro="You're the issuer. Make six decisions the way a real working group would — archetype, risk factors, the founder's letter, governance, use of proceeds, and the price. A scoring engine grades the filing the way the SEC, the Street and the press actually would."
      />

      <div className="builder">
        <div className="builder-head">
          <span className="bh-title">▸ FORM S-1 · DRAFTING TERMINAL</span>
          <span className="bh-file">REGISTRANT: NEWCO, INC. · FILE NO. 333-{String(101 + step)}</span>
        </div>

        {phase === "build" ? (
          <div className="builder-body">
            <div className="builder-main">
              <div className="steps">
                {steps.map((_, i) => (
                  <div key={i} className={"step-pip " + (i < step ? "done" : i === step ? "now" : "")}></div>
                ))}
              </div>

              <div className="q-num">Decision {cur.num}</div>
              <h3 className="q-title">{cur.title}</h3>
              <p className="q-help">{cur.help}</p>

              {cur.kind === "single" && (
                <div className="opts">
                  {cur.options.map((o) => (
                    <button
                      key={o.id}
                      className={"opt" + (ans[cur.id] === o.id ? " sel" : "")}
                      onClick={() => setSingle(cur.id, o.id)}
                    >
                      <span className="opt-mark">{ans[cur.id] === o.id ? "✓" : ""}</span>
                      <span>
                        <span className="opt-name">{o.name} {o.side && <span className="opt-side">· {o.side}</span>}</span>
                        <span className="opt-desc" style={{ display: "block" }}>{o.desc}</span>
                        {o.flag && <span className={"opt-flag " + o.flag.c} style={{ display: "block" }}>▸ {o.flag.t}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {cur.kind === "risks" && (
                <div>
                  {cur.risks.map((r) => {
                    const choice = (ans.risks && ans.risks[r.id]) || "disclose";
                    return (
                      <div className="risk-row" key={r.id}>
                        <div className="risk-text">
                          {r.text}
                          <span className={"rt-tag " + (r.kind === "material" ? "material" : "boiler")}>
                            [{r.kind === "material" ? "material" : "boilerplate"}]
                          </span>
                        </div>
                        <div className="toggle">
                          <button
                            className={"disclose" + (choice === "disclose" ? " on" : "")}
                            onClick={() => setRisk(r.id, "disclose")}
                          >Disclose</button>
                          <button
                            className={"bury" + (choice === "bury" ? " on" : "")}
                            onClick={() => setRisk(r.id, "bury")}
                          >Bury</button>
                        </div>
                      </div>
                    );
                  })}
                  <p className="note" style={{ marginTop: 12 }}>
                    ▸ Material risks must be disclosed — that's the law, not a preference. Bury one and you're betting against the plaintiffs' bar.
                  </p>
                </div>
              )}

              {cur.kind === "pricing" && (
                <div>
                  <div className="opts" style={{ marginBottom: 22 }}>
                    {cur.banks.map((o) => (
                      <button
                        key={o.id}
                        className={"opt" + (ans.pricing.bank === o.id ? " sel" : "")}
                        onClick={() => setPricing({ bank: o.id })}
                      >
                        <span className="opt-mark">{ans.pricing.bank === o.id ? "✓" : ""}</span>
                        <span>
                          <span className="opt-name">{o.name}</span>
                          <span className="opt-desc" style={{ display: "block" }}>{o.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="q-num">Pricing aggressiveness</div>
                  <div className="slider-wrap">
                    <input
                      type="range" min="0" max="100" step="1"
                      value={ans.pricing.aggression}
                      onChange={(e) => setPricing({ aggression: Number(e.target.value) })}
                    />
                    <div className="slider-labels">
                      <span>Conservative · pop, leave money</span>
                      <span>Priced to perfection · risk a break</span>
                    </div>
                    <div className="slider-read">
                      {aggressionLabel(ans.pricing.aggression)}
                    </div>
                  </div>
                </div>
              )}

              <div className="builder-nav">
                <button className="btn" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>← Back</button>
                {step < steps.length - 1 ? (
                  <button className="btn solid" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next →</button>
                ) : (
                  <button className="btn solid" disabled={!allDone} onClick={() => { setPhase("result"); window.scrollTo({ top: document.getElementById("builder").offsetTop - 20, behavior: "smooth" }); }}>
                    File it & score →
                  </button>
                )}
              </div>
            </div>

            {/* live deal sheet */}
            <DealSheet ans={ans} />
          </div>
        ) : (
          <Scorecard result={result} ans={ans} onRedo={() => { setPhase("build"); setStep(0); }} onEdit={() => { setPhase("build"); }} />
        )}
      </div>

      <p className="note" style={{ marginTop: 14 }}>
        ▸ The scoring model is a deliberate caricature — a real book-build weighs a hundred more variables — but every lever here maps to a real decision a real working group fights over.
      </p>
    </Section>
  );
}

function aggressionLabel(a) {
  if (a < 25) return "Underpriced — expect a big day-one pop (and regret).";
  if (a < 45) return "Conservative — a comfortable cushion for the book.";
  if (a < 62) return "Market price — splitting the difference.";
  if (a < 80) return "Aggressive — capturing value, thinning the cushion.";
  return "Priced to perfection — one soft order from a broken deal.";
}

function DealSheet({ ans }) {
  const B = window.BUILDER;
  const arch = find(B.steps[0].options, ans.archetype);
  const letter = find(B.steps[2].options, ans.letter);
  const gov = find(B.steps[3].options, ans.governance);
  const proc = find(B.steps[4].options, ans.proceeds);
  const bank = find(B.steps[5].banks, ans.pricing && ans.pricing.bank);
  const buried = ans.risks ? Object.values(ans.risks).filter((v) => v === "bury").length : 0;

  const row = (k, v) => (
    <div className="ds-row">
      <div className="ds-k">{k}</div>
      <div className={"ds-v" + (v ? "" : " empty")}>{v || "—"}</div>
    </div>
  );

  return (
    <aside className="dealsheet">
      <div className="ds-head">▸ Live Deal Sheet</div>
      {row("Company", arch ? arch.name : "")}
      {row("Risks buried", buried ? buried + " factor" + (buried > 1 ? "s" : "") : "none")}
      {row("Letter", letter ? letter.name : "")}
      {row("Governance", gov ? gov.name : "")}
      {row("Proceeds", proc ? proc.name : "")}
      {row("Underwriter", bank ? bank.name : "")}
      {row("Pricing", ans.pricing && typeof ans.pricing.aggression === "number" ? ans.pricing.aggression + " / 100" : "")}
      <p className="note" style={{ marginTop: 12, fontSize: 10 }}>
        Updates as you draft. Your choices are saved locally.
      </p>
    </aside>
  );
}

function Scorecard({ result, ans, onRedo, onEdit }) {
  const { sub, readiness, valuation, raised, move, tier, reactions } = result;
  const subOrder = [
    ["integrity", "Disclosure Integrity"],
    ["appeal", "Investor Appeal"],
    ["credibility", "Credibility"],
    ["governance", "Governance"],
  ];
  const barClass = (v) => (v >= 66 ? "hi" : v <= 38 ? "lo" : "");

  return (
    <div className="scorecard">
      <div className="sc-top">
        <Gauge value={readiness} />
        <div className="sc-verdict">
          <div className="v-tier">
            <Stamp variant={tier.cls === "green" ? "green" : tier.cls === "red" ? "" : "blue"} flat>{tier.tag}</Stamp>
          </div>
          <h3 className="v-head">{tier.head}</h3>
          <p className="v-body">{tier.body}</p>
        </div>
      </div>

      <div className="subscores">
        {subOrder.map(([k, lab]) => (
          <div className="subscore" key={k}>
            <div className="ss-lab"><span>{lab}</span><b>{sub[k]}</b></div>
            <div className="ss-bar"><i className={barClass(sub[k])} style={{ width: sub[k] + "%" }}></i></div>
          </div>
        ))}
      </div>

      {/* deal economics */}
      <div className="statrow" style={{ marginTop: 26 }}>
        <div className="cell">
          <div className="num">{fmtB(valuation)}</div>
          <div className="lab">Implied valuation</div>
        </div>
        <div className="cell">
          <div className="num">{fmtB(raised)}</div>
          <div className="lab">Capital raised</div>
        </div>
        <div className="cell">
          <div className="num" style={{ color: move >= 0 ? "var(--green)" : "var(--ledger)" }}>{move >= 0 ? "+" : ""}{move}%</div>
          <div className="lab">First-day move</div>
        </div>
        <div className="cell">
          <div className="num">{readiness}</div>
          <div className="lab">Readiness / 100</div>
        </div>
      </div>

      <div className="reactions">
        <div className="rx-head">▸ The reaction from the room</div>
        {reactions.map((r, i) => (
          <div className="rx" key={i}>
            <div className="rx-from">{r.from}</div>
            <div className="rx-say">{r.say}</div>
          </div>
        ))}
      </div>

      <div className="sc-actions">
        <button className="btn solid" onClick={onEdit}>← Revise the filing</button>
        <button className="btn" onClick={onRedo}>Start a new registrant</button>
      </div>
    </div>
  );
}

window.Builder = Builder;
