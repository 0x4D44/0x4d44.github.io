// ============================================================
// mos-6502 — a cycle-honest MOS 6502 core
// ------------------------------------------------------------
// The 6502 has no idle cycles: on every clock cycle it either reads
// one byte or writes one byte, never neither and never both. That
// invariant is the spine of this emulator. Every cycle of every
// instruction goes through read()/write(), which count and (optionally)
// record it, so a trace of an instruction IS its timing diagram — and
// the instruction's cycle count is simply the length of that trace.
//
// The awkward cycles are therefore modelled rather than skipped: the
// dummy read an indexed address does at the wrong page, the dummy write
// a read-modify-write does with the OLD value, the two throwaway reads
// an interrupt does before it pushes. They are the reason several famous
// 6502 behaviours exist, so they are visible here on purpose.
//
// Loaded as a plain <script> (sets window.MOS6502) and as an ES module
// shim from the tests (module.exports when `module` exists).
// ============================================================
(function (global) {
  "use strict";

  // ---------------------------------------------------------------
  // Addressing modes. 13 of them; every one of the 151 documented
  // opcodes is one of the 56 instructions crossed with one of these.
  // ---------------------------------------------------------------
  const MODES = {
    imp: { id: "imp", label: "implied",       operandBytes: 0, syntax: "",         blurb: "The operand is the instruction. No address is computed." },
    acc: { id: "acc", label: "accumulator",   operandBytes: 0, syntax: "A",        blurb: "The accumulator is both source and destination; memory is never touched." },
    imm: { id: "imm", label: "immediate",     operandBytes: 1, syntax: "#$nn",     blurb: "The byte after the opcode IS the value. No address is computed." },
    zp:  { id: "zp",  label: "zero page",     operandBytes: 1, syntax: "$nn",      blurb: "A one-byte address: the whole of page zero, $0000-$00FF, reachable in two bytes and three cycles." },
    zpx: { id: "zpx", label: "zero page,X",   operandBytes: 1, syntax: "$nn,X",    blurb: "Base + X, wrapped inside page zero. $F0 + $20 is $10, not $0110." },
    zpy: { id: "zpy", label: "zero page,Y",   operandBytes: 1, syntax: "$nn,Y",    blurb: "Base + Y, wrapped inside page zero. Only LDX and STX use it." },
    abs: { id: "abs", label: "absolute",      operandBytes: 2, syntax: "$nnnn",    blurb: "A full 16-bit address, little-endian: low byte first." },
    abx: { id: "abx", label: "absolute,X",    operandBytes: 2, syntax: "$nnnn,X",  blurb: "Base + X across all 64K. Costs one extra cycle if the sum crosses a page." },
    aby: { id: "aby", label: "absolute,Y",    operandBytes: 2, syntax: "$nnnn,Y",  blurb: "Base + Y across all 64K. Costs one extra cycle if the sum crosses a page." },
    ind: { id: "ind", label: "indirect",      operandBytes: 2, syntax: "($nnnn)",  blurb: "JMP only: read a two-byte pointer from the given address — and famously fail to carry across a page." },
    izx: { id: "izx", label: "(indirect,X)",  operandBytes: 1, syntax: "($nn,X)",  blurb: "Index a table OF pointers in page zero, then follow the pointer." },
    izy: { id: "izy", label: "(indirect),Y",  operandBytes: 1, syntax: "($nn),Y",  blurb: "Follow a page-zero pointer, THEN add Y. The 6502's array walker." },
    rel: { id: "rel", label: "relative",      operandBytes: 1, syntax: "$nnnn",    blurb: "A signed 8-bit displacement from the next instruction: -128..+127." },
  };

  // ---------------------------------------------------------------
  // Status register bits.
  // ---------------------------------------------------------------
  const FLAG = { C: 0x01, Z: 0x02, I: 0x04, D: 0x08, B: 0x10, U: 0x20, V: 0x40, N: 0x80 };

  const VEC_NMI = 0xfffa, VEC_RESET = 0xfffc, VEC_IRQ = 0xfffe;

  const u8 = (n) => n & 0xff;
  const u16 = (n) => n & 0xffff;
  const hex2 = (n) => u8(n).toString(16).toUpperCase().padStart(2, "0");
  const hex4 = (n) => u16(n).toString(16).toUpperCase().padStart(4, "0");
  const signed = (n) => (n & 0x80 ? n - 256 : n);

  // The table is filled in by the definitions further down.
  const OPCODES = new Array(256);

  function CPU(options) {
    const opts = options || {};
    this.mem = opts.memory instanceof Uint8Array && opts.memory.length === 0x10000
      ? opts.memory
      : new Uint8Array(0x10000);
    // Optional device hooks. onRead(addr) may return a byte to substitute
    // (e.g. a hardware register); onWrite(addr, value) sees every store.
    this.onRead = opts.onRead || null;
    this.onWrite = opts.onWrite || null;
    this.recordCycles = opts.recordCycles !== false;
    this.a = 0; this.x = 0; this.y = 0; this.s = 0xfd; this.pc = 0;
    this.c = 0; this.z = 0; this.i = 1; this.d = 0; this.v = 0; this.n = 0;
    this.cycles = 0;          // total cycles since power-on
    this.trace = [];          // bus cycles of the instruction just executed
    this.halted = false;      // set by a JAM/KIL opcode
    this.nmiPending = false;
    this.irqLine = false;     // held low by a device for as long as it wants service
    this.instructions = 0;
  }

  // ----- status register as a byte -------------------------------
  CPU.prototype.getP = function (withB) {
    return (this.c ? FLAG.C : 0) | (this.z ? FLAG.Z : 0) | (this.i ? FLAG.I : 0) |
           (this.d ? FLAG.D : 0) | (this.v ? FLAG.V : 0) | (this.n ? FLAG.N : 0) |
           FLAG.U | (withB ? FLAG.B : 0);
  };
  CPU.prototype.setP = function (p) {
    this.c = p & FLAG.C ? 1 : 0; this.z = p & FLAG.Z ? 1 : 0;
    this.i = p & FLAG.I ? 1 : 0; this.d = p & FLAG.D ? 1 : 0;
    this.v = p & FLAG.V ? 1 : 0; this.n = p & FLAG.N ? 1 : 0;
  };

  // ----- the bus: one access per cycle, always --------------------
  CPU.prototype.read = function (addr, note) {
    addr = u16(addr);
    let value = this.mem[addr];
    if (this.onRead) {
      const substituted = this.onRead(addr, value);
      if (typeof substituted === "number") value = u8(substituted);
    }
    this.cycles++;
    if (this.recordCycles) this.trace.push({ addr, data: value, rw: "r", note: note || "read" });
    return value;
  };
  CPU.prototype.write = function (addr, value, note) {
    addr = u16(addr); value = u8(value);
    this.mem[addr] = value;
    if (this.onWrite) this.onWrite(addr, value);
    this.cycles++;
    if (this.recordCycles) this.trace.push({ addr, data: value, rw: "w", note: note || "write" });
  };
  // Peek/poke do NOT consume a cycle: for debuggers, disassembly and tests.
  CPU.prototype.peek = function (addr) { return this.mem[u16(addr)]; };
  CPU.prototype.poke = function (addr, value) { this.mem[u16(addr)] = u8(value); };

  CPU.prototype.fetch = function (note) {
    const value = this.read(this.pc, note || "fetch operand");
    this.pc = u16(this.pc + 1);
    return value;
  };

  CPU.prototype.push = function (value, note) {
    this.write(0x100 | this.s, value, note || "push");
    this.s = u8(this.s - 1);
  };
  CPU.prototype.pull = function (note) {
    this.s = u8(this.s + 1);
    return this.read(0x100 | this.s, note || "pull");
  };

  CPU.prototype.setZN = function (value) {
    this.z = u8(value) === 0 ? 1 : 0;
    this.n = value & 0x80 ? 1 : 0;
    return u8(value);
  };

  // ----- reset ----------------------------------------------------
  // Seven cycles on the real part: five of them throwaway (the chip is
  // running a fake BRK with writes suppressed), then the vector fetch.
  CPU.prototype.reset = function () {
    this.trace = [];
    this.halted = false;
    this.nmiPending = false;
    this.irqLine = false;
    this.read(this.pc, "reset: dummy read");
    this.read(u16(this.pc + 1), "reset: dummy read");
    this.read(0x100 | this.s, "reset: suppressed push");
    this.read(0x100 | u8(this.s - 1), "reset: suppressed push");
    this.read(0x100 | u8(this.s - 2), "reset: suppressed push");
    this.s = u8(this.s - 3);
    const lo = this.read(VEC_RESET, "reset vector low");
    const hi = this.read(VEC_RESET + 1, "reset vector high");
    this.pc = lo | (hi << 8);
    this.i = 1;
    this.d = 0;
    return this.pc;
  };

  // ----- interrupts -----------------------------------------------
  CPU.prototype.interrupt = function (vector, isBrk) {
    this.read(this.pc, "dummy read");
    this.read(this.pc, "dummy read");
    this.push(this.pc >> 8, "push PC high");
    this.push(this.pc & 0xff, "push PC low");
    this.push(this.getP(!!isBrk), isBrk ? "push P (B set)" : "push P (B clear)");
    this.i = 1;
    const lo = this.read(vector, "vector low");
    const hi = this.read(vector + 1, "vector high");
    this.pc = lo | (hi << 8);
  };
  CPU.prototype.nmi = function () { this.nmiPending = true; };
  CPU.prototype.irq = function (held) { this.irqLine = held !== false; };

  // ---------------------------------------------------------------
  // Address resolution. `dummy` is true for writes and read-modify-
  // writes, which always spend the extra cycle whether or not the
  // index crossed a page — they cannot afford to be wrong.
  // ---------------------------------------------------------------
  const RESOLVE = {
    zp(cpu) { return cpu.fetch("fetch zero-page address"); },
    zpx(cpu) {
      const base = cpu.fetch("fetch zero-page base");
      cpu.read(base, "dummy read (index not yet added)");
      return u8(base + cpu.x);
    },
    zpy(cpu) {
      const base = cpu.fetch("fetch zero-page base");
      cpu.read(base, "dummy read (index not yet added)");
      return u8(base + cpu.y);
    },
    abs(cpu) {
      const lo = cpu.fetch("fetch address low");
      const hi = cpu.fetch("fetch address high");
      return lo | (hi << 8);
    },
    abx(cpu, dummy) { return indexed(cpu, RESOLVE.abs(cpu), cpu.x, dummy); },
    aby(cpu, dummy) { return indexed(cpu, RESOLVE.abs(cpu), cpu.y, dummy); },
    izx(cpu) {
      const base = cpu.fetch("fetch pointer base");
      cpu.read(base, "dummy read (X not yet added)");
      const ptr = u8(base + cpu.x);
      const lo = cpu.read(ptr, "read pointer low");
      const hi = cpu.read(u8(ptr + 1), "read pointer high (wraps in page zero)");
      return lo | (hi << 8);
    },
    izy(cpu, dummy) {
      const ptr = cpu.fetch("fetch pointer address");
      const lo = cpu.read(ptr, "read pointer low");
      const hi = cpu.read(u8(ptr + 1), "read pointer high (wraps in page zero)");
      return indexed(cpu, lo | (hi << 8), cpu.y, dummy);
    },
  };

  // The heart of the page-crossing penalty: the 6502 adds the index to
  // the LOW byte first and reads there immediately, before it knows
  // whether the high byte needed a carry. If it did, that read was from
  // the wrong address and the whole thing is done again a cycle later.
  function indexed(cpu, base, index, dummy) {
    const effective = u16(base + index);
    const guessed = (base & 0xff00) | (effective & 0xff);
    if (guessed !== effective) cpu.read(guessed, "dummy read at wrong page (carry not yet applied)");
    else if (dummy) cpu.read(guessed, "dummy read (always, on a write)");
    return effective;
  }

  // ---------------------------------------------------------------
  // Instruction definition helpers.
  // ---------------------------------------------------------------
  function define(code, name, mode, cycles, kind, exec, flags) {
    OPCODES[code] = {
      code, name, mode, cycles, kind, exec,
      bytes: 1 + MODES[mode].operandBytes,
      pageCross: !!(flags && flags.pageCross),
      illegal: !!(flags && flags.illegal),
      unstable: !!(flags && flags.unstable),
      group: (flags && flags.group) || "misc",
      doc: (flags && flags.doc) || "",
    };
  }

  // A "read" instruction: resolve, read one byte, hand it to fn.
  function defRead(code, name, mode, cycles, fn, flags) {
    define(code, name, mode, cycles, "read", function (cpu) {
      const value = mode === "imm"
        ? cpu.fetch("fetch immediate value")
        : cpu.read(RESOLVE[mode](cpu, false), "read operand");
      fn(cpu, value);
    }, flags);
  }
  // A "write" instruction: resolve (always paying the index cycle), store.
  function defWrite(code, name, mode, cycles, fn, flags) {
    define(code, name, mode, cycles, "write", function (cpu) {
      cpu.write(RESOLVE[mode](cpu, true), fn(cpu), "store");
    }, flags);
  }
  // A read-modify-write: read, write the OLD value back (the famous
  // dummy write — real hardware really does drive the bus twice), then
  // write the new one.
  function defRmw(code, name, mode, cycles, fn, flags) {
    define(code, name, mode, cycles, "rmw", function (cpu) {
      const addr = RESOLVE[mode](cpu, true);
      const value = cpu.read(addr, "read operand");
      cpu.write(addr, value, "dummy write (old value, while the ALU works)");
      cpu.write(addr, fn(cpu, value), "write result");
    }, flags);
  }
  // Implied/accumulator: two cycles, the second a throwaway read of the
  // byte after the opcode. The 6502 always fetches it; it just ignores it.
  function defImplied(code, name, cycles, fn, flags) {
    define(code, name, "imp", cycles, "other", function (cpu) {
      cpu.read(cpu.pc, "dummy read (no operand to fetch)");
      fn(cpu);
    }, flags);
  }
  function defAcc(code, name, fn, flags) {
    define(code, name, "acc", 2, "other", function (cpu) {
      cpu.read(cpu.pc, "dummy read (no operand to fetch)");
      cpu.a = fn(cpu, cpu.a);
    }, flags);
  }
  function defBranch(code, name, test, flags) {
    define(code, name, "rel", 2, "branch", function (cpu) {
      const offset = signed(cpu.fetch("fetch branch displacement"));
      if (!test(cpu)) return;
      cpu.read(cpu.pc, "dummy read (branch taken, PC not yet moved)");
      const target = u16(cpu.pc + offset);
      if ((target & 0xff00) !== (cpu.pc & 0xff00)) {
        cpu.read((cpu.pc & 0xff00) | (target & 0xff), "dummy read at wrong page (branch crossed)");
      }
      cpu.pc = target;
    }, flags);
  }

  // ---------------------------------------------------------------
  // Arithmetic. ADC is where the 6502's two most misunderstood flags
  // live: V (signed overflow) and D (decimal mode).
  // ---------------------------------------------------------------
  function adc(cpu, m) {
    const a = cpu.a;
    if (cpu.d) {
      // NMOS decimal mode, per Bruce Clark's analysis: the low nibble is
      // corrected first, and N/V come from the uncorrected high nibble,
      // which is why only C is trustworthy after a decimal ADC.
      let lo = (a & 0x0f) + (m & 0x0f) + cpu.c;
      if (lo > 0x09) lo += 0x06;
      let hi = (a >> 4) + (m >> 4) + (lo > 0x0f ? 1 : 0);
      cpu.z = u8(a + m + cpu.c) === 0 ? 1 : 0;   // Z is the BINARY result
      cpu.n = hi & 0x08 ? 1 : 0;
      cpu.v = (~(a ^ m) & (a ^ (hi << 4)) & 0x80) ? 1 : 0;
      if (hi > 0x09) hi += 0x06;
      cpu.c = hi > 0x0f ? 1 : 0;
      cpu.a = u8((hi << 4) | (lo & 0x0f));
      return;
    }
    const sum = a + m + cpu.c;
    // Overflow means "the signs of the inputs agreed and the answer
    // disagrees with them" — the only way a signed result can be wrong.
    cpu.v = (~(a ^ m) & (a ^ sum) & 0x80) ? 1 : 0;
    cpu.c = sum > 0xff ? 1 : 0;
    cpu.a = cpu.setZN(sum);
  }

  function sbc(cpu, m) {
    const a = cpu.a;
    const borrow = 1 - cpu.c;
    const diff = a - m - borrow;
    // Every flag comes from the binary subtraction, decimal mode or not.
    cpu.v = ((a ^ m) & (a ^ diff) & 0x80) ? 1 : 0;
    cpu.c = diff >= 0 ? 1 : 0;
    const binary = cpu.setZN(diff);
    if (!cpu.d) { cpu.a = binary; return; }
    let lo = (a & 0x0f) - (m & 0x0f) - borrow;
    let hi = (a >> 4) - (m >> 4);
    if (lo & 0x10) { lo -= 6; hi -= 1; }
    if (hi & 0x10) { hi -= 6; }
    cpu.a = u8(((hi & 0x0f) << 4) | (lo & 0x0f));
  }

  function compare(cpu, reg, m) {
    const diff = reg - m;
    cpu.c = diff >= 0 ? 1 : 0;
    cpu.setZN(diff);
  }

  const asl = (cpu, v) => { cpu.c = v & 0x80 ? 1 : 0; return cpu.setZN(v << 1); };
  const lsr = (cpu, v) => { cpu.c = v & 0x01; return cpu.setZN(v >> 1); };
  const rol = (cpu, v) => { const c = cpu.c; cpu.c = v & 0x80 ? 1 : 0; return cpu.setZN((v << 1) | c); };
  const ror = (cpu, v) => { const c = cpu.c; cpu.c = v & 0x01; return cpu.setZN((v >> 1) | (c << 7)); };

  // ---------------------------------------------------------------
  // The 151 documented opcodes.
  // ---------------------------------------------------------------
  const LOAD = "load", STORE = "store", XFER = "transfer", STACK = "stack",
        LOGIC = "logic", ARITH = "arithmetic", SHIFT = "shift", INCDEC = "inc/dec",
        BRANCH = "branch", JUMP = "jump", FLAGS = "flags", SYS = "system";

  // LDA
  [[0xa9, "imm", 2], [0xa5, "zp", 3], [0xb5, "zpx", 4], [0xad, "abs", 4],
   [0xbd, "abx", 4, 1], [0xb9, "aby", 4, 1], [0xa1, "izx", 6], [0xb1, "izy", 5, 1]]
    .forEach(([c, m, k, p]) => defRead(c, "LDA", m, k, (cpu, v) => { cpu.a = cpu.setZN(v); }, { pageCross: !!p, group: LOAD }));
  // LDX
  [[0xa2, "imm", 2], [0xa6, "zp", 3], [0xb6, "zpy", 4], [0xae, "abs", 4], [0xbe, "aby", 4, 1]]
    .forEach(([c, m, k, p]) => defRead(c, "LDX", m, k, (cpu, v) => { cpu.x = cpu.setZN(v); }, { pageCross: !!p, group: LOAD }));
  // LDY
  [[0xa0, "imm", 2], [0xa4, "zp", 3], [0xb4, "zpx", 4], [0xac, "abs", 4], [0xbc, "abx", 4, 1]]
    .forEach(([c, m, k, p]) => defRead(c, "LDY", m, k, (cpu, v) => { cpu.y = cpu.setZN(v); }, { pageCross: !!p, group: LOAD }));
  // STA / STX / STY
  [[0x85, "zp", 3], [0x95, "zpx", 4], [0x8d, "abs", 4], [0x9d, "abx", 5], [0x99, "aby", 5], [0x81, "izx", 6], [0x91, "izy", 6]]
    .forEach(([c, m, k]) => defWrite(c, "STA", m, k, (cpu) => cpu.a, { group: STORE }));
  [[0x86, "zp", 3], [0x96, "zpy", 4], [0x8e, "abs", 4]]
    .forEach(([c, m, k]) => defWrite(c, "STX", m, k, (cpu) => cpu.x, { group: STORE }));
  [[0x84, "zp", 3], [0x94, "zpx", 4], [0x8c, "abs", 4]]
    .forEach(([c, m, k]) => defWrite(c, "STY", m, k, (cpu) => cpu.y, { group: STORE }));

  // Transfers
  defImplied(0xaa, "TAX", 2, (cpu) => { cpu.x = cpu.setZN(cpu.a); }, { group: XFER });
  defImplied(0xa8, "TAY", 2, (cpu) => { cpu.y = cpu.setZN(cpu.a); }, { group: XFER });
  defImplied(0x8a, "TXA", 2, (cpu) => { cpu.a = cpu.setZN(cpu.x); }, { group: XFER });
  defImplied(0x98, "TYA", 2, (cpu) => { cpu.a = cpu.setZN(cpu.y); }, { group: XFER });
  defImplied(0xba, "TSX", 2, (cpu) => { cpu.x = cpu.setZN(cpu.s); }, { group: XFER });
  // TXS is the one transfer that sets no flags: the stack pointer is not data.
  defImplied(0x9a, "TXS", 2, (cpu) => { cpu.s = cpu.x; }, { group: XFER });

  // Stack
  define(0x48, "PHA", "imp", 3, "other", (cpu) => {
    cpu.read(cpu.pc, "dummy read (no operand to fetch)");
    cpu.push(cpu.a, "push A");
  }, { group: STACK });
  define(0x08, "PHP", "imp", 3, "other", (cpu) => {
    cpu.read(cpu.pc, "dummy read (no operand to fetch)");
    cpu.push(cpu.getP(true), "push P (B set — PHP always sets it)");
  }, { group: STACK });
  define(0x68, "PLA", "imp", 4, "other", (cpu) => {
    cpu.read(cpu.pc, "dummy read (no operand to fetch)");
    cpu.read(0x100 | cpu.s, "dummy read (stack pointer not yet incremented)");
    cpu.a = cpu.setZN(cpu.pull("pull A"));
  }, { group: STACK });
  define(0x28, "PLP", "imp", 4, "other", (cpu) => {
    cpu.read(cpu.pc, "dummy read (no operand to fetch)");
    cpu.read(0x100 | cpu.s, "dummy read (stack pointer not yet incremented)");
    cpu.setP(cpu.pull("pull P"));
  }, { group: STACK });

  // Logic
  [[0x29, "imm", 2], [0x25, "zp", 3], [0x35, "zpx", 4], [0x2d, "abs", 4],
   [0x3d, "abx", 4, 1], [0x39, "aby", 4, 1], [0x21, "izx", 6], [0x31, "izy", 5, 1]]
    .forEach(([c, m, k, p]) => defRead(c, "AND", m, k, (cpu, v) => { cpu.a = cpu.setZN(cpu.a & v); }, { pageCross: !!p, group: LOGIC }));
  [[0x09, "imm", 2], [0x05, "zp", 3], [0x15, "zpx", 4], [0x0d, "abs", 4],
   [0x1d, "abx", 4, 1], [0x19, "aby", 4, 1], [0x01, "izx", 6], [0x11, "izy", 5, 1]]
    .forEach(([c, m, k, p]) => defRead(c, "ORA", m, k, (cpu, v) => { cpu.a = cpu.setZN(cpu.a | v); }, { pageCross: !!p, group: LOGIC }));
  [[0x49, "imm", 2], [0x45, "zp", 3], [0x55, "zpx", 4], [0x4d, "abs", 4],
   [0x5d, "abx", 4, 1], [0x59, "aby", 4, 1], [0x41, "izx", 6], [0x51, "izy", 5, 1]]
    .forEach(([c, m, k, p]) => defRead(c, "EOR", m, k, (cpu, v) => { cpu.a = cpu.setZN(cpu.a ^ v); }, { pageCross: !!p, group: LOGIC }));
  // BIT: tests A against memory but keeps neither result — N and V come
  // straight off bits 7 and 6 of the memory byte, which is why status
  // registers in 6502 machines put their busiest flags there.
  [[0x24, "zp", 3], [0x2c, "abs", 4]].forEach(([c, m, k]) => defRead(c, "BIT", m, k, (cpu, v) => {
    cpu.z = (cpu.a & v) === 0 ? 1 : 0;
    cpu.n = v & 0x80 ? 1 : 0;
    cpu.v = v & 0x40 ? 1 : 0;
  }, { group: LOGIC }));

  // Arithmetic
  [[0x69, "imm", 2], [0x65, "zp", 3], [0x75, "zpx", 4], [0x6d, "abs", 4],
   [0x7d, "abx", 4, 1], [0x79, "aby", 4, 1], [0x61, "izx", 6], [0x71, "izy", 5, 1]]
    .forEach(([c, m, k, p]) => defRead(c, "ADC", m, k, adc, { pageCross: !!p, group: ARITH }));
  [[0xe9, "imm", 2], [0xe5, "zp", 3], [0xf5, "zpx", 4], [0xed, "abs", 4],
   [0xfd, "abx", 4, 1], [0xf9, "aby", 4, 1], [0xe1, "izx", 6], [0xf1, "izy", 5, 1]]
    .forEach(([c, m, k, p]) => defRead(c, "SBC", m, k, sbc, { pageCross: !!p, group: ARITH }));
  [[0xc9, "imm", 2], [0xc5, "zp", 3], [0xd5, "zpx", 4], [0xcd, "abs", 4],
   [0xdd, "abx", 4, 1], [0xd9, "aby", 4, 1], [0xc1, "izx", 6], [0xd1, "izy", 5, 1]]
    .forEach(([c, m, k, p]) => defRead(c, "CMP", m, k, (cpu, v) => compare(cpu, cpu.a, v), { pageCross: !!p, group: ARITH }));
  [[0xe0, "imm", 2], [0xe4, "zp", 3], [0xec, "abs", 4]]
    .forEach(([c, m, k]) => defRead(c, "CPX", m, k, (cpu, v) => compare(cpu, cpu.x, v), { group: ARITH }));
  [[0xc0, "imm", 2], [0xc4, "zp", 3], [0xcc, "abs", 4]]
    .forEach(([c, m, k]) => defRead(c, "CPY", m, k, (cpu, v) => compare(cpu, cpu.y, v), { group: ARITH }));

  // Shifts and rotates
  defAcc(0x0a, "ASL", asl, { group: SHIFT });
  defAcc(0x4a, "LSR", lsr, { group: SHIFT });
  defAcc(0x2a, "ROL", rol, { group: SHIFT });
  defAcc(0x6a, "ROR", ror, { group: SHIFT });
  [["ASL", asl, [[0x06, "zp", 5], [0x16, "zpx", 6], [0x0e, "abs", 6], [0x1e, "abx", 7]]],
   ["LSR", lsr, [[0x46, "zp", 5], [0x56, "zpx", 6], [0x4e, "abs", 6], [0x5e, "abx", 7]]],
   ["ROL", rol, [[0x26, "zp", 5], [0x36, "zpx", 6], [0x2e, "abs", 6], [0x3e, "abx", 7]]],
   ["ROR", ror, [[0x66, "zp", 5], [0x76, "zpx", 6], [0x6e, "abs", 6], [0x7e, "abx", 7]]]]
    .forEach(([name, fn, rows]) => rows.forEach(([c, m, k]) => defRmw(c, name, m, k, fn, { group: SHIFT })));

  // Increment / decrement
  [[0xe6, "zp", 5], [0xf6, "zpx", 6], [0xee, "abs", 6], [0xfe, "abx", 7]]
    .forEach(([c, m, k]) => defRmw(c, "INC", m, k, (cpu, v) => cpu.setZN(v + 1), { group: INCDEC }));
  [[0xc6, "zp", 5], [0xd6, "zpx", 6], [0xce, "abs", 6], [0xde, "abx", 7]]
    .forEach(([c, m, k]) => defRmw(c, "DEC", m, k, (cpu, v) => cpu.setZN(v - 1), { group: INCDEC }));
  defImplied(0xe8, "INX", 2, (cpu) => { cpu.x = cpu.setZN(cpu.x + 1); }, { group: INCDEC });
  defImplied(0xc8, "INY", 2, (cpu) => { cpu.y = cpu.setZN(cpu.y + 1); }, { group: INCDEC });
  defImplied(0xca, "DEX", 2, (cpu) => { cpu.x = cpu.setZN(cpu.x - 1); }, { group: INCDEC });
  defImplied(0x88, "DEY", 2, (cpu) => { cpu.y = cpu.setZN(cpu.y - 1); }, { group: INCDEC });

  // Branches
  defBranch(0x10, "BPL", (cpu) => !cpu.n, { group: BRANCH });
  defBranch(0x30, "BMI", (cpu) => !!cpu.n, { group: BRANCH });
  defBranch(0x50, "BVC", (cpu) => !cpu.v, { group: BRANCH });
  defBranch(0x70, "BVS", (cpu) => !!cpu.v, { group: BRANCH });
  defBranch(0x90, "BCC", (cpu) => !cpu.c, { group: BRANCH });
  defBranch(0xb0, "BCS", (cpu) => !!cpu.c, { group: BRANCH });
  defBranch(0xd0, "BNE", (cpu) => !cpu.z, { group: BRANCH });
  defBranch(0xf0, "BEQ", (cpu) => !!cpu.z, { group: BRANCH });

  // Jumps and subroutines
  define(0x4c, "JMP", "abs", 3, "jump", (cpu) => {
    const lo = cpu.fetch("fetch address low");
    const hi = cpu.fetch("fetch address high");
    cpu.pc = lo | (hi << 8);
  }, { group: JUMP });
  // The indirect JMP bug: the pointer's high byte is fetched from the
  // SAME page as its low byte. $30FF reads $30FF and $3000, not $3100.
  define(0x6c, "JMP", "ind", 5, "jump", (cpu) => {
    const lo = cpu.fetch("fetch pointer low");
    const hi = cpu.fetch("fetch pointer high");
    const ptr = lo | (hi << 8);
    const target_lo = cpu.read(ptr, "read target low");
    const target_hi = cpu.read((ptr & 0xff00) | u8(ptr + 1), "read target high (never leaves the page — the bug)");
    cpu.pc = target_lo | (target_hi << 8);
  }, { group: JUMP });
  define(0x20, "JSR", "abs", 6, "jump", (cpu) => {
    const lo = cpu.fetch("fetch address low");
    cpu.read(0x100 | cpu.s, "dummy read of the stack");
    // PC now points at the HIGH byte of this JSR, i.e. return address - 1.
    cpu.push(cpu.pc >> 8, "push PC high (return - 1)");
    cpu.push(cpu.pc & 0xff, "push PC low (return - 1)");
    const hi = cpu.read(cpu.pc, "fetch address high");
    cpu.pc = lo | (hi << 8);
  }, { group: JUMP });
  define(0x60, "RTS", "imp", 6, "other", (cpu) => {
    cpu.read(cpu.pc, "dummy read (no operand to fetch)");
    cpu.read(0x100 | cpu.s, "dummy read (stack pointer not yet incremented)");
    const lo = cpu.pull("pull PC low");
    const hi = cpu.pull("pull PC high");
    cpu.pc = lo | (hi << 8);
    cpu.read(cpu.pc, "dummy read, then PC + 1 (JSR pushed return - 1)");
    cpu.pc = u16(cpu.pc + 1);
  }, { group: JUMP });
  define(0x40, "RTI", "imp", 6, "other", (cpu) => {
    cpu.read(cpu.pc, "dummy read (no operand to fetch)");
    cpu.read(0x100 | cpu.s, "dummy read (stack pointer not yet incremented)");
    cpu.setP(cpu.pull("pull P"));
    const lo = cpu.pull("pull PC low");
    const hi = cpu.pull("pull PC high");
    cpu.pc = lo | (hi << 8);   // no +1: the interrupt pushed the real address
  }, { group: SYS });
  // BRK is two bytes wide even though the second is never used: the
  // 6502 increments PC past it, so an RTI returns to BRK + 2.
  define(0x00, "BRK", "imp", 7, "other", (cpu) => {
    cpu.read(cpu.pc, "read the ignored second byte of BRK");
    cpu.pc = u16(cpu.pc + 1);
    cpu.push(cpu.pc >> 8, "push PC high");
    cpu.push(cpu.pc & 0xff, "push PC low");
    cpu.push(cpu.getP(true), "push P with B set (this is how RTI tells BRK from IRQ)");
    cpu.i = 1;
    const lo = cpu.read(VEC_IRQ, "IRQ vector low");
    const hi = cpu.read(VEC_IRQ + 1, "IRQ vector high");
    cpu.pc = lo | (hi << 8);
  }, { group: SYS });

  // Flags and NOP
  defImplied(0x18, "CLC", 2, (cpu) => { cpu.c = 0; }, { group: FLAGS });
  defImplied(0x38, "SEC", 2, (cpu) => { cpu.c = 1; }, { group: FLAGS });
  defImplied(0x58, "CLI", 2, (cpu) => { cpu.i = 0; }, { group: FLAGS });
  defImplied(0x78, "SEI", 2, (cpu) => { cpu.i = 1; }, { group: FLAGS });
  defImplied(0xb8, "CLV", 2, (cpu) => { cpu.v = 0; }, { group: FLAGS });
  defImplied(0xd8, "CLD", 2, (cpu) => { cpu.d = 0; }, { group: FLAGS });
  defImplied(0xf8, "SED", 2, (cpu) => { cpu.d = 1; }, { group: FLAGS });
  defImplied(0xea, "NOP", 2, () => {}, { group: SYS });

  // ---------------------------------------------------------------
  // The other 105 opcodes. Nothing in the chip checks whether an
  // opcode is "real": the decode ROM is a sparse matrix, and an
  // undefined pattern simply activates whichever lines happen to
  // match. Most of the results are stable and were used in shipped
  // software; a handful depend on analogue behaviour and are not.
  // ---------------------------------------------------------------
  const ILL = { illegal: true, group: "undocumented" };
  const ILLP = { illegal: true, pageCross: true, group: "undocumented" };

  // NOPs of every length and timing.
  [0x1a, 0x3a, 0x5a, 0x7a, 0xda, 0xfa].forEach((c) => defImplied(c, "NOP", 2, () => {}, ILL));
  [[0x80, "imm", 2], [0x82, "imm", 2], [0x89, "imm", 2], [0xc2, "imm", 2], [0xe2, "imm", 2],
   [0x04, "zp", 3], [0x44, "zp", 3], [0x64, "zp", 3],
   [0x14, "zpx", 4], [0x34, "zpx", 4], [0x54, "zpx", 4], [0x74, "zpx", 4], [0xd4, "zpx", 4], [0xf4, "zpx", 4],
   [0x0c, "abs", 4]]
    .forEach(([c, m, k]) => defRead(c, "NOP", m, k, () => {}, ILL));
  [0x1c, 0x3c, 0x5c, 0x7c, 0xdc, 0xfc]
    .forEach((c) => defRead(c, "NOP", "abx", 4, () => {}, ILLP));

  // LAX = LDA + LDX from the same byte.
  [[0xa7, "zp", 3], [0xb7, "zpy", 4], [0xaf, "abs", 4], [0xbf, "aby", 4, 1], [0xa3, "izx", 6], [0xb3, "izy", 5, 1]]
    .forEach(([c, m, k, p]) => defRead(c, "LAX", m, k, (cpu, v) => { cpu.a = cpu.x = cpu.setZN(v); }, p ? ILLP : ILL));
  // SAX stores A AND X — and sets no flags, because nothing computed it.
  [[0x87, "zp", 3], [0x97, "zpy", 4], [0x8f, "abs", 4], [0x83, "izx", 6]]
    .forEach(([c, m, k]) => defWrite(c, "SAX", m, k, (cpu) => cpu.a & cpu.x, ILL));

  // The six read-modify-write combinations: one memory operation, two
  // effects, in the cycles a single RMW already costs.
  const RMW_COMBOS = [
    ["SLO", (cpu, v) => { const r = asl(cpu, v); cpu.a = cpu.setZN(cpu.a | r); return r; }, [[0x07, "zp", 5], [0x17, "zpx", 6], [0x0f, "abs", 6], [0x1f, "abx", 7], [0x1b, "aby", 7], [0x03, "izx", 8], [0x13, "izy", 8]]],
    ["RLA", (cpu, v) => { const r = rol(cpu, v); cpu.a = cpu.setZN(cpu.a & r); return r; }, [[0x27, "zp", 5], [0x37, "zpx", 6], [0x2f, "abs", 6], [0x3f, "abx", 7], [0x3b, "aby", 7], [0x23, "izx", 8], [0x33, "izy", 8]]],
    ["SRE", (cpu, v) => { const r = lsr(cpu, v); cpu.a = cpu.setZN(cpu.a ^ r); return r; }, [[0x47, "zp", 5], [0x57, "zpx", 6], [0x4f, "abs", 6], [0x5f, "abx", 7], [0x5b, "aby", 7], [0x43, "izx", 8], [0x53, "izy", 8]]],
    ["RRA", (cpu, v) => { const r = ror(cpu, v); adc(cpu, r); return r; }, [[0x67, "zp", 5], [0x77, "zpx", 6], [0x6f, "abs", 6], [0x7f, "abx", 7], [0x7b, "aby", 7], [0x63, "izx", 8], [0x73, "izy", 8]]],
    ["DCP", (cpu, v) => { const r = u8(v - 1); compare(cpu, cpu.a, r); return r; }, [[0xc7, "zp", 5], [0xd7, "zpx", 6], [0xcf, "abs", 6], [0xdf, "abx", 7], [0xdb, "aby", 7], [0xc3, "izx", 8], [0xd3, "izy", 8]]],
    ["ISC", (cpu, v) => { const r = u8(v + 1); sbc(cpu, r); return r; }, [[0xe7, "zp", 5], [0xf7, "zpx", 6], [0xef, "abs", 6], [0xff, "abx", 7], [0xfb, "aby", 7], [0xe3, "izx", 8], [0xf3, "izy", 8]]],
  ];
  RMW_COMBOS.forEach(([name, fn, rows]) => rows.forEach(([c, m, k]) => defRmw(c, name, m, k, fn, ILL)));

  // Immediate oddities.
  [0x0b, 0x2b].forEach((c) => defRead(c, "ANC", "imm", 2, (cpu, v) => {
    cpu.a = cpu.setZN(cpu.a & v);
    cpu.c = cpu.n;             // bit 7 falls into carry
  }, ILL));
  defRead(0x4b, "ALR", "imm", 2, (cpu, v) => { cpu.a = lsr(cpu, cpu.a & v); }, ILL);
  defRead(0x6b, "ARR", "imm", 2, (cpu, v) => {
    // AND then rotate right, but V and C come out of the ADC circuit,
    // which is still wired in — hence the strange flag rules.
    const t = cpu.a & v;
    cpu.a = cpu.setZN((t >> 1) | (cpu.c << 7));
    cpu.c = (cpu.a & 0x40) ? 1 : 0;
    cpu.v = (((cpu.a >> 6) ^ (cpu.a >> 5)) & 1) ? 1 : 0;
  }, ILL);
  defRead(0xcb, "SBX", "imm", 2, (cpu, v) => {
    const t = (cpu.a & cpu.x) - v;
    cpu.c = t >= 0 ? 1 : 0;
    cpu.x = cpu.setZN(t);
  }, ILL);
  defRead(0xeb, "SBC", "imm", 2, sbc, ILL);   // a second, identical SBC

  // The unstable group. These depend on the high byte of the address
  // reaching the output latch during a cycle when the bus is also
  // driving other data, and on supply voltage and temperature; the
  // common model is implemented, and marked as not to be relied on.
  const UNSTABLE = { illegal: true, unstable: true, group: "undocumented" };
  const highPlusOne = (cpu, addr, value) => value & u8((addr >> 8) + 1);
  define(0x9c, "SHY", "abx", 5, "write", (cpu) => {
    const addr = RESOLVE.abx(cpu, true);
    cpu.write(addr, highPlusOne(cpu, addr, cpu.y), "store (unstable)");
  }, UNSTABLE);
  define(0x9e, "SHX", "aby", 5, "write", (cpu) => {
    const addr = RESOLVE.aby(cpu, true);
    cpu.write(addr, highPlusOne(cpu, addr, cpu.x), "store (unstable)");
  }, UNSTABLE);
  define(0x93, "SHA", "izy", 6, "write", (cpu) => {
    const addr = RESOLVE.izy(cpu, true);
    cpu.write(addr, highPlusOne(cpu, addr, cpu.a & cpu.x), "store (unstable)");
  }, UNSTABLE);
  define(0x9f, "SHA", "aby", 5, "write", (cpu) => {
    const addr = RESOLVE.aby(cpu, true);
    cpu.write(addr, highPlusOne(cpu, addr, cpu.a & cpu.x), "store (unstable)");
  }, UNSTABLE);
  define(0x9b, "TAS", "aby", 5, "write", (cpu) => {
    const addr = RESOLVE.aby(cpu, true);
    cpu.s = cpu.a & cpu.x;
    cpu.write(addr, highPlusOne(cpu, addr, cpu.s), "store (unstable)");
  }, UNSTABLE);
  defRead(0xbb, "LAS", "aby", 4, (cpu, v) => {
    cpu.a = cpu.x = cpu.s = cpu.setZN(v & cpu.s);
  }, { illegal: true, unstable: true, pageCross: true, group: "undocumented" });
  // XAA/ANE passes A through a "magic constant" that is really the
  // decayed state of the internal bus. $EE and $FF are the usual values.
  defRead(0x8b, "ANE", "imm", 2, (cpu, v) => {
    cpu.a = cpu.setZN((cpu.a | 0xee) & cpu.x & v);
  }, UNSTABLE);
  defRead(0xab, "LXA", "imm", 2, (cpu, v) => {
    cpu.a = cpu.x = cpu.setZN((cpu.a | 0xee) & v);
  }, UNSTABLE);

  // JAM/KIL: the chip stops. Both halves of the internal clock latch
  // low and nothing but RESET will move it again.
  [0x02, 0x12, 0x22, 0x32, 0x42, 0x52, 0x62, 0x72, 0x92, 0xb2, 0xd2, 0xf2].forEach((c) => {
    define(c, "JAM", "imp", 2, "other", (cpu) => {
      cpu.read(cpu.pc, "dummy read");
      cpu.pc = u16(cpu.pc - 1);
      cpu.halted = true;
    }, { illegal: true, group: "undocumented", doc: "Halts the processor until RESET." });
  });

  // ---------------------------------------------------------------
  // Stepping.
  // ---------------------------------------------------------------
  CPU.prototype.step = function () {
    this.trace = [];
    const startCycles = this.cycles;
    const startPC = this.pc;

    // Interrupts are sampled BEFORE the opcode fetch. NMI is edge-
    // triggered and cannot be masked; IRQ is level-triggered and the
    // I flag holds it off.
    if (this.nmiPending) {
      this.nmiPending = false;
      this.interrupt(VEC_NMI, false);
      return this.finishStep(startPC, null, startCycles, "NMI");
    }
    if (this.irqLine && !this.i) {
      this.interrupt(VEC_IRQ, false);
      return this.finishStep(startPC, null, startCycles, "IRQ");
    }
    if (this.halted) {
      return this.finishStep(startPC, OPCODES[this.peek(startPC)], startCycles, "halted");
    }

    const code = this.read(this.pc, "fetch opcode");
    this.pc = u16(this.pc + 1);
    const op = OPCODES[code];
    op.exec(this);
    this.instructions++;
    return this.finishStep(startPC, op, startCycles, null);
  };

  CPU.prototype.finishStep = function (startPC, op, startCycles, kind) {
    return {
      pc: startPC,
      op,
      name: kind || (op ? op.name : "???"),
      cycles: this.cycles - startCycles,
      trace: this.trace,
      interrupt: kind === "NMI" || kind === "IRQ" ? kind : null,
    };
  };

  // Run until `budget` cycles have passed or a stop condition fires.
  CPU.prototype.run = function (budget, shouldStop) {
    const target = this.cycles + budget;
    let steps = 0;
    while (this.cycles < target && !this.halted) {
      this.step();
      steps++;
      if (shouldStop && shouldStop(this)) break;
    }
    return steps;
  };

  // ---------------------------------------------------------------
  // Disassembly. `readByte` is a non-consuming peek so a debugger can
  // disassemble ahead of the program counter without side effects.
  // ---------------------------------------------------------------
  function disassemble(readByte, addr) {
    const code = u8(readByte(addr));
    const op = OPCODES[code];
    const bytes = [code];
    for (let i = 1; i < op.bytes; i++) bytes.push(u8(readByte(addr + i)));
    const lo = bytes[1], hi = bytes[2];
    let text;
    switch (op.mode) {
      case "imp": text = op.name; break;
      case "acc": text = `${op.name} A`; break;
      case "imm": text = `${op.name} #$${hex2(lo)}`; break;
      case "zp":  text = `${op.name} $${hex2(lo)}`; break;
      case "zpx": text = `${op.name} $${hex2(lo)},X`; break;
      case "zpy": text = `${op.name} $${hex2(lo)},Y`; break;
      case "abs": text = `${op.name} $${hex4(lo | (hi << 8))}`; break;
      case "abx": text = `${op.name} $${hex4(lo | (hi << 8))},X`; break;
      case "aby": text = `${op.name} $${hex4(lo | (hi << 8))},Y`; break;
      case "ind": text = `${op.name} ($${hex4(lo | (hi << 8))})`; break;
      case "izx": text = `${op.name} ($${hex2(lo)},X)`; break;
      case "izy": text = `${op.name} ($${hex2(lo)}),Y`; break;
      case "rel": text = `${op.name} $${hex4(u16(addr + 2 + signed(lo)))}`; break;
      default: text = op.name;
    }
    return { addr: u16(addr), text, bytes, length: op.bytes, op };
  }

  const api = {
    CPU, OPCODES, MODES, FLAG, disassemble,
    VECTORS: { nmi: VEC_NMI, reset: VEC_RESET, irq: VEC_IRQ },
    hex2, hex4, signed, u8, u16,
    create(options) { return new CPU(options); },
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  global.MOS6502 = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
