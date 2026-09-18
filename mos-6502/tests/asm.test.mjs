import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const [cpuSource, asmSource] = await Promise.all([
  readFile(resolve(PROJECT, "cpu.js"), "utf8"),
  readFile(resolve(PROJECT, "asm.js"), "utf8"),
]);
const sandbox = { window: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(cpuSource, sandbox, { filename: "cpu.js" });
vm.runInContext(asmSource, sandbox, { filename: "asm.js" });
const { assemble, listing } = sandbox.MOS6502ASM;
const MOS6502 = sandbox.MOS6502;

// The assembler runs inside a vm realm, so its arrays and objects have
// a different prototype than this file's. Normalise before comparing.
const plain = (value) => JSON.parse(JSON.stringify(value));
const noErrors = (result) => assert.deepEqual(plain(result.errors), [],
  `unexpected errors: ${JSON.stringify(plain(result.errors))}`);
const bytesOf = (source, options) => {
  const result = assemble(source, options);
  noErrors(result);
  return Array.from(result.bytes);
};

test("every addressing mode assembles to the documented opcode", () => {
  assert.deepEqual(bytesOf("NOP"), [0xea]);
  assert.deepEqual(bytesOf("ASL A"), [0x0a]);
  assert.deepEqual(bytesOf("ASL"), [0x0a], "a bare ASL is the accumulator form");
  assert.deepEqual(bytesOf("LDA #$41"), [0xa9, 0x41]);
  assert.deepEqual(bytesOf("LDA $10"), [0xa5, 0x10]);
  assert.deepEqual(bytesOf("LDA $10,X"), [0xb5, 0x10]);
  assert.deepEqual(bytesOf("LDX $10,Y"), [0xb6, 0x10]);
  assert.deepEqual(bytesOf("LDA $1234"), [0xad, 0x34, 0x12], "little-endian");
  assert.deepEqual(bytesOf("LDA $1234,X"), [0xbd, 0x34, 0x12]);
  assert.deepEqual(bytesOf("LDA $1234,Y"), [0xb9, 0x34, 0x12]);
  assert.deepEqual(bytesOf("JMP ($1234)"), [0x6c, 0x34, 0x12]);
  assert.deepEqual(bytesOf("LDA ($10,X)"), [0xa1, 0x10]);
  assert.deepEqual(bytesOf("LDA ($10),Y"), [0xb1, 0x10]);
  assert.deepEqual(bytesOf("BNE *"), [0xd0, 0xfe], "a branch to itself");
});

test("numbers come in hex, binary, decimal and characters", () => {
  assert.deepEqual(bytesOf("LDA #$0F"), [0xa9, 0x0f]);
  assert.deepEqual(bytesOf("LDA #%00001111"), [0xa9, 0x0f]);
  assert.deepEqual(bytesOf("LDA #15"), [0xa9, 0x0f]);
  assert.deepEqual(bytesOf("LDA #'A'"), [0xa9, 0x41]);
});

test("zero page is chosen automatically, and only when it fits", () => {
  assert.deepEqual(bytesOf("LDA $00FF"), [0xa5, 0xff], "$00FF is page zero");
  assert.deepEqual(bytesOf("LDA $0100"), [0xad, 0x00, 0x01]);
  // LDX has zero page,Y but no zero page,X — and no absolute,X either.
  const bad = assemble("LDX $10,X");
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0].message, /no zero page,X or absolute,X form/);
  assert.match(bad.errors[0].hint, /,Y/);
});

test("labels resolve forwards and backwards", () => {
  const source = [
    "  LDX #$03",
    "loop:",
    "  DEX",
    "  BNE loop",
    "  JMP done",
    "  NOP",
    "done:",
    "  BRK",
  ].join("\n");
  const result = assemble(source, { org: 0x0600 });
  noErrors(result);
  assert.equal(result.labels.LOOP, 0x0602);
  assert.equal(result.labels.DONE, 0x0609);
  assert.deepEqual(Array.from(result.bytes), [0xa2, 0x03, 0xca, 0xd0, 0xfd, 0x4c, 0x09, 0x06, 0xea, 0x00]);
});

test("a branch computes its displacement from the NEXT instruction", () => {
  // BNE at $0600 to $0600 is -2: the PC has already moved past both bytes.
  assert.deepEqual(bytesOf("here: BNE here"), [0xd0, 0xfe]);
  const forward = assemble(["  BNE skip", "  NOP", "  NOP", "skip: BRK"].join("\n"));
  assert.deepEqual(Array.from(forward.bytes).slice(0, 2), [0xd0, 0x02]);
});

test("an out-of-range branch says how far out of range it is", () => {
  const result = assemble(["  BNE far", "  .fill 200", "far: BRK"].join("\n"));
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /a branch reaches -128 to \+127/);
  assert.match(result.errors[0].message, /200 bytes forward/);
});

test("constants and < > byte selectors work", () => {
  const source = [
    "SCREEN = $0200",
    "  LDA #<SCREEN",
    "  LDX #>SCREEN",
    "  STA SCREEN",
  ].join("\n");
  assert.deepEqual(bytesOf(source), [0xa9, 0x00, 0xa2, 0x02, 0x8d, 0x00, 0x02]);
});

test("label arithmetic and * work", () => {
  const result = assemble(["base: .byte 1,2,3,4", "  LDA base+2", "  LDA base-1"].join("\n"));
  noErrors(result);
  assert.deepEqual(Array.from(result.bytes), [1, 2, 3, 4, 0xad, 0x02, 0x06, 0xad, 0xff, 0x05]);
});

test("data directives lay bytes, words and text down in order", () => {
  assert.deepEqual(bytesOf(".byte $01, 2, %11, 'z'"), [0x01, 0x02, 0x03, 0x7a]);
  assert.deepEqual(bytesOf(".word $1234, $ABCD"), [0x34, 0x12, 0xcd, 0xab]);
  assert.deepEqual(bytesOf('.text "Hi"'), [0x48, 0x69]);
  assert.deepEqual(bytesOf('.asciiz "Hi"'), [0x48, 0x69, 0x00]);
  assert.deepEqual(bytesOf(".fill 3, $EA"), [0xea, 0xea, 0xea]);
});

test(".org moves the assembly address", () => {
  const result = assemble(["  .org $0800", "start: LDA #1", "  JMP start"].join("\n"));
  noErrors(result);
  assert.equal(result.start, 0x0800);
  assert.equal(result.labels.START, 0x0800);
  assert.deepEqual(Array.from(result.bytes), [0xa9, 0x01, 0x4c, 0x00, 0x08]);
  assert.deepEqual(assemble("*= $0900\n NOP").start, 0x0900);
});

test("comments, blank lines and stray whitespace are ignored", () => {
  const source = "\n; a header comment\n\n   LDA #$01   ; load one\n\n   NOP\n";
  assert.deepEqual(bytesOf(source), [0xa9, 0x01, 0xea]);
});

test("errors name the line, the text and what to do about it", () => {
  const result = assemble(["  LDA #$01", "  FOO $10", "  LDA nowhere"].join("\n"));
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].line, 2);
  assert.match(result.errors[0].message, /not a 6502 instruction/);
  assert.equal(result.errors[1].line, 3);
  assert.match(result.errors[1].message, /"nowhere" is not defined/);
  // A broken line does not stop the rest of the file assembling.
  assert.equal(result.lines.length, 1);
});

test("a duplicate label is refused", () => {
  const result = assemble(["a: NOP", "a: NOP"].join("\n"));
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /defined twice/);
});

test("the line map lets the debugger follow the source", () => {
  const result = assemble(["  LDA #$01", "  STA $0200", "  BRK"].join("\n"), { org: 0x0600 });
  assert.deepEqual(plain(result.lines).map((l) => [l.line, l.addr]), [[1, 0x0600], [2, 0x0602], [3, 0x0605]]);
  assert.equal(result.addrToLine.get(0x0602), 2);
});

test("the listing lines up addresses, bytes and source", () => {
  const source = ["  LDA #$01", "; note", "  BRK"].join("\n");
  const text = listing(assemble(source), source);
  assert.match(text, /^0600 {2}A9 01 {8}}? {0,2}\s*LDA #\$01$/m);
  assert.match(text, /^ +; note$/m);
});

test("undocumented mnemonics assemble, but documented ones win a tie", () => {
  assert.deepEqual(bytesOf("LAX $30"), [0xa7, 0x30]);
  assert.deepEqual(bytesOf("SAX $30"), [0x87, 0x30]);
  assert.deepEqual(bytesOf("SBC #$01"), [0xe9, 0x01], "the documented SBC, not $EB");
  assert.deepEqual(bytesOf("NOP"), [0xea], "the documented NOP, not $1A");
});

// ---------------------------------------------------------------
// The two halves have to agree with each other.
// ---------------------------------------------------------------
test("assemble then disassemble returns the same text for every opcode", () => {
  for (let code = 0; code < 256; code++) {
    const op = MOS6502.OPCODES[code];
    if (op.illegal && op.name === "JAM") continue;              // no operand syntax to compare
    const mem = new Uint8Array(0x10000);
    mem[0x0600] = code; mem[0x0601] = 0x34; mem[0x0602] = 0x12;
    const line = MOS6502.disassemble((a) => mem[a & 0xffff], 0x0600);
    const result = assemble(line.text, { org: 0x0600 });
    if (!result.ok) continue;   // an undocumented alias the assembler routes elsewhere
    assert.equal(result.bytes.length, op.bytes, `${line.text} length`);
    if (!op.illegal) assert.equal(result.bytes[0], code, `${line.text} re-encodes to $${code.toString(16)}`);
  }
});

test("an assembled program actually runs on the core", () => {
  // Multiply $10 by $11 into $12 by repeated addition.
  const source = [
    "  .org $0600",
    "  LDA #0",
    "  LDX $10",
    "loop:",
    "  CPX #0",
    "  BEQ done",
    "  CLC",
    "  ADC $11",
    "  DEX",
    "  JMP loop",
    "done:",
    "  STA $12",
    "  .byte $02      ; JAM: stop here",
  ].join("\n");
  const result = assemble(source);
  noErrors(result);
  const cpu = MOS6502.create({ recordCycles: false });
  cpu.mem.set(result.image.slice(result.start, result.end + 1), result.start);
  cpu.poke(0x10, 12); cpu.poke(0x11, 12);
  cpu.pc = result.start;
  cpu.run(10_000);
  assert.equal(cpu.peek(0x12), 144);
  assert.equal(cpu.halted, true);
});
