// ============================================================
// mos-6502 — the lab bench
// ------------------------------------------------------------
// Assembles and runs the page's worked examples. The page uses it to
// produce what you see; the test suite uses it to check that what you
// see is true. One implementation, so the two cannot drift apart.
// ============================================================
(function (global) {
  "use strict";

  const MOS = global.MOS6502 || (typeof require === "function" ? require("./cpu.js") : null);
  const ASM = global.MOS6502ASM || (typeof require === "function" ? require("./asm.js") : null);

  const DEFAULT_ORG = 0x0600;

  // Build a machine with a program in it, its reset vector pointing at
  // the program, and a record of every write.
  function load(source, options) {
    const opts = options || {};
    const assembled = ASM.assemble(source, { org: opts.org === undefined ? DEFAULT_ORG : opts.org });
    const writes = [];
    const cpu = MOS.create({
      recordCycles: opts.recordCycles !== false,
      onWrite: (addr, value) => writes.push({ addr, value }),
      onRead: opts.onRead || null,
    });
    if (assembled.end >= assembled.start) {
      for (let addr = assembled.start; addr <= assembled.end; addr++) {
        if (assembled.written[addr]) cpu.poke(addr, assembled.image[addr]);
      }
    }
    const start = assembled.start;
    cpu.poke(0xfffc, start & 0xff);
    cpu.poke(0xfffd, start >> 8);
    const vectors = opts.vectors || {};
    if (vectors.irq !== undefined) { cpu.poke(0xfffe, vectors.irq & 0xff); cpu.poke(0xffff, vectors.irq >> 8); }
    if (vectors.nmi !== undefined) { cpu.poke(0xfffa, vectors.nmi & 0xff); cpu.poke(0xfffb, vectors.nmi >> 8); }
    cpu.pc = start;
    cpu.s = 0xfd;
    return { cpu, assembled, writes };
  }

  // Run one of the quirk demonstrations and report what happened.
  function runQuirk(quirk) {
    const { cpu, assembled, writes } = load(quirk.source, { vectors: quirk.vectors });
    if (!assembled.ok) {
      return { ok: false, error: assembled.errors[0], report: "the demonstration did not assemble" };
    }
    const traces = [];
    for (let i = 0; i < (quirk.steps || 1); i++) {
      const step = cpu.step();
      traces.push({ pc: step.pc, name: step.name, cycles: step.cycles, trace: step.trace.slice() });
      if (cpu.halted) break;
    }
    const report = quirk.report(cpu, writes, traces);
    const ok = quirk.expect ? !!quirk.expect(cpu, writes, traces) : true;
    return { ok, cpu, assembled, writes, traces, report };
  }

  // Run one addressing-mode example: set the machine up as described,
  // then execute exactly one instruction and hand back its bus trace.
  function runAddressing(entry) {
    const { cpu, assembled } = load(entry.sample, { vectors: entry.vectors });
    if (!assembled.ok) return { ok: false, error: assembled.errors[0] };
    const setup = entry.setup || {};
    for (const key of ["a", "x", "y", "s", "c", "z", "i", "d", "v", "n"]) {
      if (setup[key] !== undefined) cpu[key] = setup[key];
    }
    for (const [addr, value] of Object.entries(setup.mem || {})) cpu.poke(Number(addr), value);
    const step = cpu.step();
    return { ok: true, cpu, step, assembled };
  }

  // Run a program to completion (or to a cycle budget), for the tests
  // and for the "run" button's first frame.
  function runProgram(source, options) {
    const opts = options || {};
    const loaded = load(source, opts);
    if (!loaded.assembled.ok) return { ...loaded, ok: false };
    let rng = opts.seed === undefined ? 1 : opts.seed;
    loaded.cpu.onRead = (addr) => {
      if (addr === 0x00fe) { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return (rng >> 16) & 0xff; }
      return undefined;
    };
    loaded.cpu.recordCycles = false;
    loaded.cpu.run(opts.budget === undefined ? 5_000_000 : opts.budget);
    return { ...loaded, ok: true };
  }

  // runSnippet and runAddressing are the same thing: set a machine up,
  // execute exactly one instruction, hand back the trace.
  const api = { load, runQuirk, runAddressing, runSnippet: runAddressing, runProgram, DEFAULT_ORG };
  if (typeof module === "object" && module.exports) module.exports = api;
  global.MOS6502LAB = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
