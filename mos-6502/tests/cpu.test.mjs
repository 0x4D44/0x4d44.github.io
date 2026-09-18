// The core is the page's only real claim to authority: every timing
// diagram, every quirk demonstration and every program on the site is
// produced by it live. So it is checked against the published tables
// rather than against itself.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const source = await readFile(resolve(PROJECT, "cpu.js"), "utf8");
const sandbox = { window: {}, globalThis: undefined, module: undefined };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "cpu.js" });
const MOS6502 = sandbox.MOS6502;
const { OPCODES, MODES, disassemble } = MOS6502;

const ORG = 0x0600;

// Assemble nothing: tests hand-write bytes so a bug in the assembler
// can never mask a bug in the core.
function machine(bytes, setup) {
  const cpu = MOS6502.create();
  bytes.forEach((b, i) => cpu.poke(ORG + i, b));
  cpu.pc = ORG;
  cpu.s = 0xfd;
  if (setup) setup(cpu);
  return cpu;
}
function one(bytes, setup) {
  const cpu = machine(bytes, setup);
  const result = cpu.step();
  return { cpu, result };
}

// ---------------------------------------------------------------
// The canonical cycle counts, transcribed from the published opcode
// matrix (base counts; page-crossing and branch-taken extras are
// checked separately below). This is the independent oracle.
// ---------------------------------------------------------------
const CANONICAL_CYCLES = [
  7,6,2,8,3,3,5,5,3,2,2,2,4,4,6,6,   // 00
  2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,   // 10
  6,6,2,8,3,3,5,5,4,2,2,2,4,4,6,6,   // 20
  2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,   // 30
  6,6,2,8,3,3,5,5,3,2,2,2,3,4,6,6,   // 40
  2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,   // 50
  6,6,2,8,3,3,5,5,4,2,2,2,5,4,6,6,   // 60
  2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,   // 70
  2,6,2,6,3,3,3,3,2,2,2,2,4,4,4,4,   // 80
  2,6,2,6,4,4,4,4,2,5,2,5,5,5,5,5,   // 90
  2,6,2,6,3,3,3,3,2,2,2,2,4,4,4,4,   // a0
  2,5,2,5,4,4,4,4,2,4,2,4,4,4,4,4,   // b0
  2,6,2,8,3,3,5,5,2,2,2,2,4,4,6,6,   // c0
  2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,   // d0
  2,6,2,8,3,3,5,5,2,2,2,2,4,4,6,6,   // e0
  2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,   // f0
];

// The 56 documented instructions.
const DOCUMENTED = [
  "ADC","AND","ASL","BCC","BCS","BEQ","BIT","BMI","BNE","BPL","BRK","BVC","BVS","CLC",
  "CLD","CLI","CLV","CMP","CPX","CPY","DEC","DEX","DEY","EOR","INC","INX","INY","JMP",
  "JSR","LDA","LDX","LDY","LSR","NOP","ORA","PHA","PHP","PLA","PLP","ROL","ROR","RTI",
  "RTS","SBC","SEC","SED","SEI","STA","STX","STY","TAX","TAY","TSX","TXA","TXS","TYA",
];

test("every one of the 256 opcode slots decodes to something", () => {
  for (let code = 0; code < 256; code++) {
    assert.ok(OPCODES[code], `$${code.toString(16)} is defined`);
    assert.equal(OPCODES[code].code, code);
    assert.ok(MODES[OPCODES[code].mode], `$${code.toString(16)} has a known addressing mode`);
  }
});

test("the documented set is exactly 151 opcodes over 56 instructions and 13 modes", () => {
  const legal = OPCODES.filter((op) => !op.illegal);
  assert.equal(legal.length, 151);
  const names = [...new Set(legal.map((op) => op.name))].sort();
  assert.deepEqual(names, DOCUMENTED);
  assert.equal(Object.keys(MODES).length, 13);
  // Every mode is actually reachable from a documented opcode.
  const used = new Set(legal.map((op) => op.mode));
  assert.equal(used.size, 13);
});

test("declared cycle counts match the published opcode matrix", () => {
  for (let code = 0; code < 256; code++) {
    assert.equal(OPCODES[code].cycles, CANONICAL_CYCLES[code],
      `$${code.toString(16).padStart(2, "0")} ${OPCODES[code].name} ${OPCODES[code].mode}`);
  }
});

test("each instruction spends exactly one bus cycle per clock cycle", () => {
  // Indices are zero so no index can cross a page, branch conditions are
  // arranged false, and the base cycle count must come out on the nose.
  for (let code = 0; code < 256; code++) {
    const op = OPCODES[code];
    const { cpu, result } = one([code, 0x10, 0x20], (c) => {
      c.x = 0; c.y = 0;
      c.n = 0; c.v = 0; c.c = 0; c.z = 0;   // every branch falls through
      c.poke(0x0010, 0x00); c.poke(0x0011, 0x20);
    });
    // Four of the eight branches are taken under these flags, and a
    // taken branch is documented as "+1". The observable is the PC, not
    // the cycle count, so this stays an independent check.
    const taken = op.mode === "rel" && cpu.pc !== ORG + 2 ? 1 : 0;
    assert.equal(result.cycles, CANONICAL_CYCLES[code] + taken,
      `$${code.toString(16).padStart(2, "0")} ${op.name} ${op.mode} cycle count`);
    assert.equal(result.trace.length, result.cycles,
      `$${code.toString(16).padStart(2, "0")} one bus access per cycle`);
    assert.equal(cpu.cycles, result.cycles);
  }
});

test("the first cycle of every instruction is the opcode fetch", () => {
  for (let code = 0; code < 256; code++) {
    const { result } = one([code, 0x10, 0x20]);
    assert.equal(result.trace[0].rw, "r");
    assert.equal(result.trace[0].addr, ORG);
    assert.equal(result.trace[0].data, code);
  }
});

// ---------------------------------------------------------------
// Timing subtleties
// ---------------------------------------------------------------
test("an indexed read costs an extra cycle only when it crosses a page", () => {
  const inside = one([0xbd, 0x00, 0x30], (c) => { c.x = 0x10; });     // LDA $3000,X
  assert.equal(inside.result.cycles, 4);
  const crossing = one([0xbd, 0xf0, 0x30], (c) => { c.x = 0x20; });   // $3110
  assert.equal(crossing.result.cycles, 5);
  // The wasted cycle read the un-carried address, $3010.
  const dummy = crossing.result.trace[3];
  assert.equal(dummy.addr, 0x3010);
  assert.match(dummy.note, /wrong page/);
  assert.equal(crossing.result.trace[4].addr, 0x3110);
});

test("an indexed write always pays that cycle, crossing or not", () => {
  const { result } = one([0x9d, 0x00, 0x30], (c) => { c.a = 0x42; c.x = 0x04; });  // STA $3000,X
  assert.equal(result.cycles, 5);
  assert.equal(result.trace[3].rw, "r");           // the dummy read happens anyway
  assert.equal(result.trace[4].rw, "w");
  assert.equal(result.trace[4].addr, 0x3004);
});

test("a taken branch costs one more cycle, and two if it leaves the page", () => {
  const notTaken = one([0xd0, 0x10], (c) => { c.z = 1; });            // BNE, Z set
  assert.equal(notTaken.result.cycles, 2);
  const taken = one([0xd0, 0x10], (c) => { c.z = 0; });
  assert.equal(taken.result.cycles, 3);
  assert.equal(taken.cpu.pc, ORG + 2 + 0x10);
  // Put the branch at the end of a page so the target is in the next one.
  const cpu = MOS6502.create();
  cpu.poke(0x06f0, 0xd0); cpu.poke(0x06f1, 0x7f);
  cpu.pc = 0x06f0; cpu.z = 0;
  const far = cpu.step();
  assert.equal(far.cycles, 4);
  assert.equal(cpu.pc, 0x0771);
});

test("a read-modify-write drives the bus twice: the old value, then the new", () => {
  const writes = [];
  const cpu = MOS6502.create({ onWrite: (addr, value) => writes.push([addr, value]) });
  cpu.poke(ORG, 0xee); cpu.poke(ORG + 1, 0x00); cpu.poke(ORG + 2, 0x30);  // INC $3000
  cpu.poke(0x3000, 0x41);
  cpu.pc = ORG;
  const result = cpu.step();
  assert.equal(result.cycles, 6);
  assert.deepEqual(writes, [[0x3000, 0x41], [0x3000, 0x42]]);
  assert.match(result.trace[4].note, /dummy write/);
});

// ---------------------------------------------------------------
// Addressing
// ---------------------------------------------------------------
test("zero-page indexing wraps inside page zero", () => {
  const { cpu } = one([0xb5, 0xf0], (c) => { c.x = 0x20; c.poke(0x0010, 0x77); c.poke(0x0110, 0x11); });
  assert.equal(cpu.a, 0x77, "$F0 + $20 is $0010, not $0110");
});

test("an (indirect,X) pointer wraps inside page zero too", () => {
  const { cpu } = one([0xa1, 0xff], (c) => {     // LDA ($FF,X) with X = 0
    c.x = 0;
    c.poke(0x00ff, 0x34); c.poke(0x0000, 0x12);  // pointer high byte wraps to $0000
    c.poke(0x1234, 0x99); c.poke(0x0100, 0x00);
  });
  assert.equal(cpu.a, 0x99);
});

test("(indirect),Y follows the pointer and then indexes", () => {
  const { cpu, result } = one([0xb1, 0x20], (c) => {
    c.y = 0x10;
    c.poke(0x0020, 0xf0); c.poke(0x0021, 0x21);   // pointer = $21F0
    c.poke(0x2200, 0x5a);
  });
  assert.equal(cpu.a, 0x5a);
  assert.equal(result.cycles, 6, "$21F0 + $10 crossed a page");
});

test("the indirect JMP never carries into the next page", () => {
  const cpu = MOS6502.create();
  cpu.poke(ORG, 0x6c); cpu.poke(ORG + 1, 0xff); cpu.poke(ORG + 2, 0x30);  // JMP ($30FF)
  cpu.poke(0x30ff, 0x00);
  cpu.poke(0x3100, 0x40);   // what a sane chip would read
  cpu.poke(0x3000, 0x80);   // what this one actually reads
  cpu.pc = ORG;
  const result = cpu.step();
  assert.equal(cpu.pc, 0x8000);
  assert.equal(result.cycles, 5);
  assert.equal(result.trace[3].addr, 0x30ff);
  assert.equal(result.trace[4].addr, 0x3000);
});

// ---------------------------------------------------------------
// Flags
// ---------------------------------------------------------------
test("ADC sets V exactly when the signed answer is wrong", () => {
  // The eight-row truth table every 6502 book prints.
  const rows = [
    [0x50, 0x10, 0x60, 0, 0], [0x50, 0x50, 0xa0, 1, 0], [0x50, 0x90, 0xe0, 0, 0], [0x50, 0xd0, 0x20, 0, 1],
    [0xd0, 0x10, 0xe0, 0, 0], [0xd0, 0x50, 0x20, 0, 1], [0xd0, 0x90, 0x60, 1, 1], [0xd0, 0xd0, 0xa0, 0, 1],
  ];
  for (const [a, m, sum, v, c] of rows) {
    const { cpu } = one([0x69, m], (x) => { x.a = a; x.c = 0; });
    assert.equal(cpu.a, sum, `$${a.toString(16)} + $${m.toString(16)}`);
    assert.equal(cpu.v, v, `V for $${a.toString(16)} + $${m.toString(16)}`);
    assert.equal(cpu.c, c, `C for $${a.toString(16)} + $${m.toString(16)}`);
  }
});

test("SBC is ADC of the complement, and its V flag agrees", () => {
  const rows = [
    [0x50, 0xf0, 0x60, 0, 0], [0x50, 0xb0, 0xa0, 1, 0], [0x50, 0x70, 0xe0, 0, 0], [0x50, 0x30, 0x20, 0, 1],
    [0xd0, 0xf0, 0xe0, 0, 0], [0xd0, 0xb0, 0x20, 0, 1], [0xd0, 0x70, 0x60, 1, 1], [0xd0, 0x30, 0xa0, 0, 1],
  ];
  for (const [a, m, diff, v, c] of rows) {
    const { cpu } = one([0xe9, m], (x) => { x.a = a; x.c = 1; });
    assert.equal(cpu.a, diff, `$${a.toString(16)} - $${m.toString(16)}`);
    assert.equal(cpu.v, v);
    assert.equal(cpu.c, c);
  }
});

test("decimal mode adds in BCD and corrects the carry", () => {
  const { cpu } = one([0x69, 0x46], (c) => { c.d = 1; c.a = 0x58; c.c = 0; });
  assert.equal(cpu.a, 0x04, "58 + 46 = 104");
  assert.equal(cpu.c, 1);
  const noCarry = one([0x69, 0x11], (c) => { c.d = 1; c.a = 0x12; c.c = 0; });
  assert.equal(noCarry.cpu.a, 0x23);
  assert.equal(noCarry.cpu.c, 0);
  const withCarryIn = one([0x69, 0x01], (c) => { c.d = 1; c.a = 0x09; c.c = 1; });
  assert.equal(withCarryIn.cpu.a, 0x11, "09 + 01 + carry = 11");
});

test("decimal mode subtracts in BCD", () => {
  const { cpu } = one([0xe9, 0x12], (c) => { c.d = 1; c.a = 0x46; c.c = 1; });
  assert.equal(cpu.a, 0x34);
  assert.equal(cpu.c, 1);
  const borrow = one([0xe9, 0x21], (c) => { c.d = 1; c.a = 0x12; c.c = 1; });
  assert.equal(borrow.cpu.a, 0x91, "12 - 21 = -9, i.e. 91 with a borrow");
  assert.equal(borrow.cpu.c, 0);
});

test("BIT copies bits 7 and 6 of memory into N and V without touching A", () => {
  const { cpu } = one([0x24, 0x40], (c) => { c.a = 0x0f; c.poke(0x0040, 0xc0); });
  assert.equal(cpu.a, 0x0f);
  assert.equal(cpu.n, 1);
  assert.equal(cpu.v, 1);
  assert.equal(cpu.z, 1, "$0F AND $C0 is zero");
});

test("CMP is a subtraction that only sets flags", () => {
  const equal = one([0xc9, 0x40], (c) => { c.a = 0x40; });
  assert.equal(equal.cpu.z, 1); assert.equal(equal.cpu.c, 1); assert.equal(equal.cpu.a, 0x40);
  const higher = one([0xc9, 0x20], (c) => { c.a = 0x40; });
  assert.equal(higher.cpu.c, 1); assert.equal(higher.cpu.z, 0);
  const lower = one([0xc9, 0x80], (c) => { c.a = 0x40; });
  assert.equal(lower.cpu.c, 0, "carry clear means A was below the operand");
});

test("TXS is the only transfer that leaves the flags alone", () => {
  const { cpu } = one([0x9a], (c) => { c.x = 0x00; c.z = 0; c.n = 1; });
  assert.equal(cpu.s, 0x00);
  assert.equal(cpu.z, 0, "a zero stack pointer does not set Z");
  assert.equal(cpu.n, 1);
});

// ---------------------------------------------------------------
// Stack, subroutines, interrupts
// ---------------------------------------------------------------
test("JSR pushes the return address minus one, and RTS puts it back", () => {
  const cpu = machine([0x20, 0x00, 0x08]);      // JSR $0800 at $0600
  cpu.step();
  assert.equal(cpu.pc, 0x0800);
  assert.equal(cpu.s, 0xfb);
  assert.equal(cpu.peek(0x01fd), 0x06, "high byte of $0602");
  assert.equal(cpu.peek(0x01fc), 0x02, "low byte of $0602 — one short of $0603");
  cpu.poke(0x0800, 0x60);                        // RTS
  const back = cpu.step();
  assert.equal(cpu.pc, 0x0603, "RTS adds the one back");
  assert.equal(back.cycles, 6);
  assert.equal(cpu.s, 0xfd);
});

test("the stack wraps inside page one", () => {
  const cpu = machine([0x48, 0x48], (c) => { c.s = 0x00; c.a = 0xaa; });
  cpu.step();
  assert.equal(cpu.peek(0x0100), 0xaa);
  assert.equal(cpu.s, 0xff, "pushing past the bottom wraps to the top");
  cpu.step();
  assert.equal(cpu.peek(0x01ff), 0xaa);
});

test("PHP sets B in the pushed byte; the flag itself does not exist", () => {
  const cpu = machine([0x08], (c) => { c.setP(0x00); });
  cpu.step();
  const pushed = cpu.peek(0x01fd);
  assert.equal(pushed & 0x10, 0x10, "B is set by PHP");
  assert.equal(pushed & 0x20, 0x20, "bit 5 is always set when pushed");
});

test("BRK pushes B set and skips a byte; an IRQ pushes B clear", () => {
  const cpu = machine([0x00, 0xff, 0xea]);       // BRK, a padding byte, NOP
  cpu.poke(0xfffe, 0x00); cpu.poke(0xffff, 0x90);
  const brk = cpu.step();
  assert.equal(brk.cycles, 7);
  assert.equal(cpu.pc, 0x9000);
  assert.equal(cpu.peek(0x01fb) & 0x10, 0x10, "B set");
  assert.equal(cpu.peek(0x01fc), 0x02, "return address is BRK + 2");
  assert.equal(cpu.i, 1, "interrupts are masked on entry");

  const irq = machine([0xea], (c) => { c.i = 0; c.irq(true); });
  irq.poke(0xfffe, 0x00); irq.poke(0xffff, 0x90);
  const taken = irq.step();
  assert.equal(taken.interrupt, "IRQ");
  assert.equal(taken.cycles, 7);
  assert.equal(irq.peek(0x01fb) & 0x10, 0x00, "B clear: this was hardware, not BRK");
  assert.equal(irq.peek(0x01fc), 0x00, "the interrupted instruction is re-run on return");
});

test("the I flag holds off IRQ but cannot touch NMI", () => {
  const masked = machine([0xea], (c) => { c.i = 1; c.irq(true); });
  assert.equal(masked.step().interrupt, null, "IRQ ignored while I is set");
  const nmi = machine([0xea], (c) => { c.i = 1; c.nmi(); });
  nmi.poke(0xfffa, 0x34); nmi.poke(0xfffb, 0x12);
  assert.equal(nmi.step().interrupt, "NMI");
  assert.equal(nmi.pc, 0x1234);
});

test("RTI restores the flags and returns to the exact address pushed", () => {
  const cpu = machine([0x40], (c) => {
    c.s = 0xfa;
    c.poke(0x01fb, 0xc3);   // P
    c.poke(0x01fc, 0x34);   // PCL
    c.poke(0x01fd, 0x12);   // PCH
  });
  const result = cpu.step();
  assert.equal(result.cycles, 6);
  assert.equal(cpu.pc, 0x1234, "no +1, unlike RTS");
  assert.equal(cpu.n, 1); assert.equal(cpu.v, 1); assert.equal(cpu.c, 1); assert.equal(cpu.z, 1);
});

test("reset takes seven cycles and lands on the vector", () => {
  const cpu = MOS6502.create();
  cpu.poke(0xfffc, 0x00); cpu.poke(0xfffd, 0x80);
  const before = cpu.cycles;
  cpu.reset();
  assert.equal(cpu.cycles - before, 7);
  assert.equal(cpu.pc, 0x8000);
  assert.equal(cpu.i, 1);
  assert.equal(cpu.trace.filter((c) => c.rw === "w").length, 0, "reset writes nothing");
});

// ---------------------------------------------------------------
// Undocumented opcodes
// ---------------------------------------------------------------
test("the stable undocumented opcodes do what the literature says", () => {
  const lax = one([0xa7, 0x30], (c) => { c.poke(0x0030, 0x8f); });      // LAX $30
  assert.equal(lax.cpu.a, 0x8f); assert.equal(lax.cpu.x, 0x8f); assert.equal(lax.cpu.n, 1);

  const sax = one([0x87, 0x30], (c) => { c.a = 0xf0; c.x = 0x3c; c.z = 0; });  // SAX $30
  assert.equal(sax.cpu.peek(0x0030), 0x30);
  assert.equal(sax.cpu.z, 0, "SAX sets no flags");

  const slo = one([0x07, 0x30], (c) => { c.a = 0x01; c.poke(0x0030, 0x81); }); // SLO $30
  assert.equal(slo.cpu.peek(0x0030), 0x02, "shifted left");
  assert.equal(slo.cpu.c, 1, "bit 7 fell into carry");
  assert.equal(slo.cpu.a, 0x03, "then ORA'd into A");

  const anc = one([0x0b, 0xf0], (c) => { c.a = 0xff; c.c = 0; });             // ANC #$F0
  assert.equal(anc.cpu.a, 0xf0);
  assert.equal(anc.cpu.c, 1, "ANC copies bit 7 into carry");

  const sbx = one([0xcb, 0x10], (c) => { c.a = 0xff; c.x = 0x3f; });          // SBX #$10
  assert.equal(sbx.cpu.x, 0x2f, "(A AND X) - immediate");
});

test("a JAM opcode stops the processor", () => {
  const cpu = machine([0x02, 0xea, 0xea]);
  cpu.step();
  assert.equal(cpu.halted, true);
  const steps = cpu.run(1000);
  assert.ok(steps <= 1, "a halted chip runs nothing");
});

// ---------------------------------------------------------------
// Whole programs
// ---------------------------------------------------------------
test("a real program runs: sum 1..10 with a loop", () => {
  // LDA #0 / LDX #10 / loop: CLC / STX $10 / ADC $10 / DEX / BNE loop / STA $20
  const program = [
    0xa9, 0x00,        // LDA #$00
    0xa2, 0x0a,        // LDX #$0A
    0x18,              // CLC          <- loop
    0x86, 0x10,        // STX $10
    0x65, 0x10,        // ADC $10
    0xca,              // DEX
    0xd0, 0xf8,        // BNE loop
    0x85, 0x20,        // STA $20
    0x02,              // JAM
  ];
  const cpu = machine(program);
  cpu.run(2000);
  assert.equal(cpu.peek(0x0020), 55);
});

test("a real program runs: 16-bit addition through the carry", () => {
  // $0300/$0301 = $1234 + $5678 = $68AC, little-endian.
  const program = [
    0x18,                    // CLC
    0xa9, 0x34,              // LDA #$34
    0x69, 0x78,              // ADC #$78
    0x8d, 0x00, 0x03,        // STA $0300
    0xa9, 0x12,              // LDA #$12
    0x69, 0x56,              // ADC #$56
    0x8d, 0x01, 0x03,        // STA $0301
    0x02,
  ];
  const cpu = machine(program);
  cpu.run(200);
  assert.equal(cpu.peek(0x0300), 0xac);
  assert.equal(cpu.peek(0x0301), 0x68);
});

test("a real program runs: nested subroutines return in the right order", () => {
  const cpu = machine([
    0x20, 0x10, 0x06,   // $0600 JSR $0610
    0xa9, 0x99,         // $0603 LDA #$99
    0x02,               // $0605 JAM
  ]);
  cpu.poke(0x0610, 0x20); cpu.poke(0x0611, 0x20); cpu.poke(0x0612, 0x06); // JSR $0620
  cpu.poke(0x0613, 0x60);                                                  // RTS
  cpu.poke(0x0620, 0xe8);                                                  // INX
  cpu.poke(0x0621, 0x60);                                                  // RTS
  cpu.run(200);
  assert.equal(cpu.x, 1);
  assert.equal(cpu.a, 0x99);
  assert.equal(cpu.s, 0xfd, "the stack came back balanced");
});

// ---------------------------------------------------------------
// Disassembly
// ---------------------------------------------------------------
test("the disassembler round-trips every addressing mode", () => {
  const mem = new Uint8Array(0x10000);
  const at = (addr, bytes) => bytes.forEach((b, i) => { mem[addr + i] = b; });
  const read = (addr) => mem[addr & 0xffff];
  const cases = [
    [[0xea], "NOP", 1], [[0x0a], "ASL A", 1], [[0xa9, 0x41], "LDA #$41", 2],
    [[0xa5, 0x10], "LDA $10", 2], [[0xb5, 0x10], "LDA $10,X", 2], [[0xb6, 0x10], "LDX $10,Y", 2],
    [[0xad, 0x34, 0x12], "LDA $1234", 3], [[0xbd, 0x34, 0x12], "LDA $1234,X", 3],
    [[0xb9, 0x34, 0x12], "LDA $1234,Y", 3], [[0x6c, 0x34, 0x12], "JMP ($1234)", 3],
    [[0xa1, 0x10], "LDA ($10,X)", 2], [[0xb1, 0x10], "LDA ($10),Y", 2],
    [[0xd0, 0xfe], "BNE $0600", 2], [[0xd0, 0x10], "BNE $0612", 2],
  ];
  for (const [bytes, text, length] of cases) {
    at(ORG, bytes);
    const line = disassemble(read, ORG);
    assert.equal(line.text, text);
    assert.equal(line.length, length);
  }
});

test("disassembling every opcode produces a printable line of the right length", () => {
  const mem = new Uint8Array(0x10000);
  const read = (addr) => mem[addr & 0xffff];
  for (let code = 0; code < 256; code++) {
    mem[ORG] = code; mem[ORG + 1] = 0x34; mem[ORG + 2] = 0x12;
    const line = disassemble(read, ORG);
    assert.match(line.text, /^[A-Z]{3}( .+)?$/);
    assert.equal(line.bytes.length, line.length);
    assert.equal(line.length, OPCODES[code].bytes);
  }
});
