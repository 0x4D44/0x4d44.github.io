/* builder.jsx — drag (or tap) blocks into a workflow, then RUN it.
   Simulates a dynamic-workflow run with a live log + a subagent swarm. */
const { useState: useStateB, useRef: useRefB, useEffect: useEffectB } = React;

const cwSleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cwUid = 0;

function Builder() {
  const blocks = window.BUILDER_BLOCKS;
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  const [flow, setFlow] = useStateB([]);          // [{uid, id}]
  const [running, setRunning] = useStateB(false);
  const [runIdx, setRunIdx] = useStateB(-1);
  const [doneSet, setDoneSet] = useStateB({});
  const [log, setLog] = useStateB([]);
  const [agents, setAgents] = useStateB([]);
  const [dropHot, setDropHot] = useStateB(false);
  const cancel = useRefB(false);
  const logRef = useRefB(null);

  useEffectB(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const add = (id) => { if (!running) setFlow((f) => [...f, { uid: ++cwUid, id }]); };
  const remove = (uid) => { if (!running) setFlow((f) => f.filter((s) => s.uid !== uid)); };
  const clear = () => { if (running) return; setFlow([]); setLog([]); setDoneSet({}); setRunIdx(-1); setAgents([]); };

  const loadBun = () => {
    if (running) return;
    setFlow(["plan", "map", "fanout", "verify", "refute", "fixloop", "converge", "deliver"].map((id) => ({ uid: ++cwUid, id })));
    setLog([]); setDoneSet({}); setRunIdx(-1);
  };

  const onDrop = (e) => {
    e.preventDefault(); setDropHot(false);
    const id = e.dataTransfer.getData("text/cw");
    if (id && byId[id]) add(id);
  };

  const pushLog = (cls, text) => setLog((l) => [...l, { cls, text }]);

  async function spawnSwarm(color, count, label) {
    const dots = Array.from({ length: count }).map((_, i) => ({
      id: ++cwUid, color,
      x: 4 + Math.random() * 92, y: 8 + Math.random() * 70,
      delay: i * 35,
    }));
    setAgents(dots);
    pushLog("warn", `   ↳ spawning ${count} parallel subagents · ${label}`);
    await cwSleep(900);
  }

  async function run() {
    if (!flow.length || running) return;
    cancel.current = false;
    setRunning(true); setLog([]); setDoneSet({}); setAgents([]);
    pushLog("t", "$ claude › creating dynamic workflow…");
    await cwSleep(500);
    pushLog("", "  plan shown — confirm? [y] (the first trigger always asks)");
    await cwSleep(650);

    const hasFan = flow.some((s) => byId[s.id].kind === "fan");
    if (!hasFan) pushLog("warn", "  ! no fan-out step — this is basically a normal chat in a trench coat.");

    for (let i = 0; i < flow.length; i++) {
      if (cancel.current) break;
      const b = byId[flow[i].id];
      setRunIdx(i);
      pushLog("t", `▸ ${b.label.toUpperCase()}`);
      await cwSleep(420);

      if (b.kind === "fan") {
        const count = 8 + Math.floor(Math.random() * 90);
        await spawnSwarm(b.color, Math.min(16, Math.ceil(count / 8)), `${count} agents, each own context window`);
        pushLog("ok", `   ✓ ${count} subagents returned · intermediate results stored outside the chat`);
      } else if (b.kind === "loop") {
        for (let k = 1; k <= 3; k++) {
          if (cancel.current) break;
          pushLog("", `   ↻ iteration ${k}: build + tests…`);
          await cwSleep(420);
        }
        pushLog("ok", "   ✓ build green, suite green — loop exits");
      } else if (b.kind === "silly") {
        pushLog("warn", "   🦵 Ministry of Silly Walks engaged. Gait acquired. Productivity: gone.");
        window.cwFireEgg("silly");
        await cwSleep(900);
      } else if (b.id === "refute") {
        await spawnSwarm("var(--cw-red)", 6, "adversaries attacking the findings");
        pushLog("ok", "   ✓ survivors held up under attack — the weak claims did not");
      } else if (b.id === "verify") {
        pushLog("ok", "   ✓ every finding independently re-checked before folding in");
        await cwSleep(500);
      } else if (b.id === "converge") {
        pushLog("", "   ◎ attempts + adversaries iterating…");
        await cwSleep(700);
        pushLog("ok", "   ✓ answers converged");
      } else {
        await cwSleep(620);
        pushLog("ok", "   ✓ done");
      }

      setAgents([]);
      setDoneSet((d) => ({ ...d, [flow[i].uid]: true }));
    }

    if (!cancel.current) {
      const hasDeliver = flow.some((s) => s.id === "deliver");
      pushLog("t", hasDeliver ? "★ DELIVER → one coordinated, pre-checked answer." : "✦ run complete (tip: end with a Deliver step for the tidy bow).");
      pushLog("warn", "  i this run used meaningfully more usage than a typical session. Check /usage.");
    } else {
      pushLog("warn", "  ⊘ run stopped. It's not dead — it's resting. Progress saved.");
    }
    setRunning(false); setRunIdx(-1);
  }

  const stop = () => { cancel.current = true; };

  return (
    <section id="build" className="cw-section">
      <CWReveal>
        <span className="cw-eyebrow">§ build one yourself</span>
        <h2 className="cw-h2">Assemble a workflow. <span style={{ color: "var(--cw-orange)" }}>Then watch it go.</span></h2>
        <p className="cw-lede">
          Drag steps from the bin into the pipeline (or just tap them). Press <b>RUN</b> and watch the
          orchestrator fan out subagents, verify, fend off adversaries and converge. Try the real
          <b> Bun port</b> recipe, or invent your own nonsense.
        </p>
      </CWReveal>

      <CWReveal style={{ marginTop: 22 }}>
        <div className="cw-builder-grid">
          {/* palette */}
          <div className="cw-palette">
            <div className="phead">▾ step bin · drag or tap</div>
            {blocks.map((b) => (
              <div
                key={b.id}
                className="cw-block"
                draggable={!running}
                onDragStart={(e) => e.dataTransfer.setData("text/cw", b.id)}
                onClick={() => add(b.id)}
                title={b.note}
              >
                <span className="g" style={{ background: b.color }}>{b.glyph}</span>
                {b.label}
              </div>
            ))}
          </div>

          {/* canvas */}
          <div>
            <div className="phead">▾ your workflow {flow.length ? `· ${flow.length} steps` : ""}</div>
            <div
              className={"cw-canvas" + (dropHot ? " drop" : "")}
              onDragOver={(e) => { e.preventDefault(); setDropHot(true); }}
              onDragLeave={() => setDropHot(false)}
              onDrop={onDrop}
            >
              {!flow.length ? (
                <div className="cw-canvas-empty">
                  ▾ drop the orchestration script here ▾{"\n"}
                  drag steps from the bin, or tap them.{"\n\n"}
                  a tidy run likes: plan → fan out → verify → refute → converge → deliver
                </div>
              ) : (
                <div className="cw-flow">
                  {flow.map((s, i) => {
                    const b = byId[s.id];
                    const cls = "cw-flowstep" + (runIdx === i ? " running" : "") + (doneSet[s.uid] ? " done" : "");
                    return (
                      <React.Fragment key={s.uid}>
                        <div className={cls}>
                          <span className="g" style={{ background: b.color }}>{b.glyph}</span>
                          <span>
                            <span className="lbl">{b.label}</span>
                            <span className="note" style={{ display: "block" }}>{b.note}</span>
                          </span>
                          <button className="rm" onClick={() => remove(s.uid)} aria-label="remove" disabled={running}>✕</button>
                        </div>
                        {i < flow.length - 1 && <div className="cw-connector"></div>}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* controls */}
        <div className="cw-controls">
          {!running ? (
            <button className="cw-btn go" onClick={run} disabled={!flow.length}>▶ RUN workflow</button>
          ) : (
            <button className="cw-btn danger" onClick={stop}>■ Stop the run</button>
          )}
          <button className="cw-btn ghost" onClick={loadBun} disabled={running}>⇶ Load the Bun port</button>
          <button className="cw-btn ghost" onClick={clear} disabled={running}>♻ Clear</button>
        </div>

        {/* run monitor */}
        <div style={{ marginTop: 14, border: "var(--cw-out)", background: "#1c1610", position: "relative", height: 96, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 8, left: 12, fontFamily: "var(--cw-mono)", fontSize: 11, color: "#c9b48c", letterSpacing: 1 }}>
            ⚙ subagent swarm
          </div>
          <div className="cw-swarm">
            {agents.map((a) => (
              <span key={a.id} className="cw-agent" style={{
                left: a.x + "%", top: a.y + "%", background: a.color,
                animation: `cw-pop .4s ${a.delay}ms both`,
              }} />
            ))}
          </div>
        </div>

        <div className="cw-runlog" ref={logRef}>
          {log.length === 0 && <div className="ln" style={{ color: "#6f5c3a" }}>// run log — press RUN. Strange runtimes distributing scripts is no basis for a system of orchestration. But it works rather well.</div>}
          {log.map((l, i) => <div key={i} className={"ln " + l.cls}>{l.text}</div>)}
        </div>
      </CWReveal>
    </section>
  );
}

Object.assign(window, { Builder });
