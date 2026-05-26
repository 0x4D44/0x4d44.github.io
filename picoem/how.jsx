// how.jsx — fetch decode execute + cycle counter
const HowSection = () => {
  const program = [
    { pc: 0x10000000, hex: "0x2001",     mnem: "MOVS r0, #1",            desc:"load immediate 1 into r0",            after:{r0:0x00000001}, cyc:1 },
    { pc: 0x10000002, hex: "0x2102",     mnem: "MOVS r1, #2",            desc:"load immediate 2 into r1",            after:{r1:0x00000002}, cyc:1 },
    { pc: 0x10000004, hex: "0x4408",     mnem: "ADD  r0, r1",            desc:"r0 += r1",                            after:{r0:0x00000003}, cyc:1 },
    { pc: 0x10000006, hex: "0x4770",     mnem: "BX   lr",                desc:"return; pipeline refill",             after:{},               cyc:3 },
    { pc: 0x100000a8, hex: "0xB510",     mnem: "PUSH {r4, lr}",          desc:"stack push, 1+N cycles, +bank check", after:{},               cyc:3 },
    { pc: 0x100000aa, hex: "0xF000F812", mnem: "BL   delay",             desc:"branch with link, 4 cycles",          after:{},               cyc:4 },
  ];

  const stages = ["FETCH", "DECODE", "EXECUTE"];
  const [step, setStep] = React.useState(0);
  const [stage, setStage] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [cycles, setCycles] = React.useState(0);

  const [regs, setRegs] = React.useState({
    r0:0, r1:0, r2:0, r3:0, r4:0, r5:0, r6:0, r7:0,
    sp:0x20081ff0, lr:0xffffffff, pc:program[0].pc, xpsr:0x01000000,
  });
  const [changed, setChanged] = React.useState({});

  React.useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setStage((s) => {
        if (s < 2) return s + 1;
        // commit
        const insn = program[step];
        setRegs((r) => {
          const next = { ...r, ...insn.after, pc: insn.pc + (insn.hex.length > 6 ? 4 : 2) };
          return next;
        });
        setChanged(insn.after);
        setCycles((c) => c + insn.cyc);
        setStep((st) => (st + 1) % program.length);
        return 0;
      });
    }, 700);
    return () => clearInterval(id);
  }, [playing, step]);

  React.useEffect(() => {
    // clear change highlight after a beat
    if (Object.keys(changed).length === 0) return;
    const id = setTimeout(() => setChanged({}), 500);
    return () => clearTimeout(id);
  }, [changed]);

  const cur = program[step];
  const hex = (n, w=8) => "0x" + (n >>> 0).toString(16).toUpperCase().padStart(w, "0");

  return (
    <section id="how">
      <div className="container">
        <div className="eyebrow">§03 · how it works</div>
        <h2>One master cycle counter. Everything else is derived.</h2>
        <p className="lead">
          The emulator is a single <code>u64</code> cycle clock with a fetch-decode-execute loop
          per core. Bus accesses, peripheral ticks, NVIC, DMA, PIO and pacing all latch off that one
          counter. The hot path is two functions: <code>step()</code> on each <code>CortexM33</code>{" "}
          / <code>CortexM0Plus</code>, and <code>Bus::read/write</code>.
        </p>

        <div className="cpu-vis">
          <div>
            <h4>Pipeline</h4>
            <div className="pipe">
              {stages.map((s, i) => (
                <div key={s} className={"stage " + (stage === i ? "active" : "")}>
                  <div className="ph">{i === 0 ? "T0" : i === 1 ? "T1" : "T2"} · {s}</div>
                  <div className="name">
                    {i === 0 && hex(cur.pc)}
                    {i === 1 && cur.hex}
                    {i === 2 && cur.mnem.split(" ")[0]}
                  </div>
                  <div className="v">
                    {i === 1 && stage >= 1 ? cur.mnem : ""}
                    {i === 2 && stage >= 2 ? cur.desc : ""}
                  </div>
                </div>
              ))}
            </div>

            <div className="cycle-counter">
              <div className="label">master cycles · clk_sys</div>
              <div className="num">{cycles.toString().padStart(8, "0")}</div>
            </div>
            <div className="muted text-xs text-mono">
              ↳ this run: {step + 1} / {program.length} instructions · current = {cur.cyc} cyc
            </div>

            <div className="ctrl-row">
              <button className={"btn-sm " + (playing ? "on" : "")} onClick={() => setPlaying(!playing)}>
                {playing ? "■ pause" : "▶ run"}
              </button>
              <button className="btn-sm" onClick={() => {
                // single step
                setStage((s) => {
                  if (s < 2) return s + 1;
                  const insn = program[step];
                  setRegs((r) => ({ ...r, ...insn.after, pc: insn.pc + (insn.hex.length > 6 ? 4 : 2) }));
                  setChanged(insn.after);
                  setCycles((c) => c + insn.cyc);
                  setStep((st) => (st + 1) % program.length);
                  return 0;
                });
              }}>↳ step</button>
              <button className="btn-sm" onClick={() => {
                setPlaying(false); setStep(0); setStage(0); setCycles(0);
                setRegs({ r0:0,r1:0,r2:0,r3:0,r4:0,r5:0,r6:0,r7:0,sp:0x20081ff0,lr:0xffffffff,pc:program[0].pc,xpsr:0x01000000 });
                setChanged({});
              }}>↺ reset</button>
            </div>
          </div>

          <div>
            <div className="regs">
              <h4>core 0 — r0..r7 + SP/LR/PC/xPSR</h4>
              {["r0","r1","r2","r3","r4","r5","r6","r7"].map((k) => (
                <div className="row" key={k}>
                  <b>{k.toUpperCase()}</b>
                  <span className={changed[k] !== undefined ? "changed" : ""}>{hex(regs[k])}</span>
                </div>
              ))}
              <div className="row"><b>SP</b><span>{hex(regs.sp)}</span></div>
              <div className="row"><b>LR</b><span>{hex(regs.lr)}</span></div>
              <div className="row"><b>PC</b><span className="changed">{hex(regs.pc)}</span></div>
              <div className="row"><b>xPSR</b><span>{hex(regs.xpsr)}</span></div>
            </div>
          </div>
        </div>

        <div className="grid-3 mt-8">
          <div className="card">
            <h4>FETCH</h4>
            <p className="text-sm muted">Read the 16- or 32-bit instruction word at <code>PC</code> through <code>Bus::read16</code>. The bus classifies the access — sequential vs non-sequential, ROM / SRAM bank / XIP / peripheral — and reports the cycle cost.</p>
          </div>
          <div className="card">
            <h4>DECODE</h4>
            <p className="text-sm muted">A table-driven decoder splits Thumb-16 from Thumb-32. The result is a typed operation enum; pathological encodings raise <code>Fault::UndefinedInstruction</code> rather than silently aliasing.</p>
          </div>
          <div className="card">
            <h4>EXECUTE</h4>
            <p className="text-sm muted">Instruction semantics live in <code>execute.rs</code>, <code>execute_thumb32.rs</code>, and <code>execute_fpu.rs</code>. The function returns the cycle cost of the operation, which the loop accumulates into the master counter.</p>
          </div>
        </div>

        <div className="grid-3 mt-6">
          <div className="card">
            <h4>BUS</h4>
            <p className="text-sm muted">AHB5 address decode, atomic-access aliases (<code>+0x1000</code> XOR, <code>+0x2000</code> SET, <code>+0x3000</code> CLR), APB bridge latency (3R / 4W), peripheral dispatch. No bank contention on RP2350; explicit contention model on the RP2040 Serial path.</p>
          </div>
          <div className="card">
            <h4>NVIC / EXCEPTIONS</h4>
            <p className="text-sm muted">Vector table, stacking (basic frame + lazy FP), <code>EXC_RETURN</code>, tail-chaining, banked MSP/PSP × Secure/NS, stack-limit (MSPLIM/PSPLIM) checks. Tested against silicon by <code>silicon_isr_diff_rp2350</code>.</p>
          </div>
          <div className="card">
            <h4>PACER</h4>
            <p className="text-sm muted">Wall-clock pacing maps emulated cycles to real time. <code>x86_64</code>-only because it uses platform atomic counters; the library still runs on other targets, just without real-time pacing.</p>
          </div>
        </div>
      </div>
    </section>
  );
};

window.HowSection = HowSection;
