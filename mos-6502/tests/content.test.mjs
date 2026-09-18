// The page makes claims. This runs every one of them.
//
// Each quirk demonstration and each sample program is assembled and
// executed exactly as the page does it, and the result is checked
// against what the page says will happen. A wrong claim fails here
// rather than being quietly published.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const files = ["cpu.js", "asm.js", "content.js", "lab.js"];
const sources = await Promise.all(files.map((f) => readFile(resolve(PROJECT, f), "utf8")));
const sandbox = { window: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
files.forEach((file, i) => vm.runInContext(sources[i], sandbox, { filename: file }));
const { SIX502, MOS6502LAB, MOS6502ASM, MOS6502 } = sandbox;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("every quirk demonstration assembles, runs, and does what it says", () => {
  assert.ok(SIX502.QUIRKS.length >= 9);
  for (const quirk of SIX502.QUIRKS) {
    const result = MOS6502LAB.runQuirk(quirk);
    assert.ok(result.ok, `${quirk.id}: ${result.report}${result.error ? ` (${result.error.message})` : ""}`);
    assert.ok(result.report.length > 20, `${quirk.id} reports something substantial`);
    assert.ok(quirk.lede.length > 120, `${quirk.id} explains itself`);
    assert.ok(quirk.moral.length > 60, `${quirk.id} says why it matters`);
  }
});

test("the indirect JMP demonstration really lands on the wrong page", () => {
  const quirk = SIX502.QUIRKS.find((q) => q.id === "jmp-indirect");
  const { cpu, report } = MOS6502LAB.runQuirk(quirk);
  assert.equal(cpu.pc, 0x8000);
  assert.match(report, /\$8000/);
});

test("the read-modify-write demonstration shows three writes to one address", () => {
  const quirk = SIX502.QUIRKS.find((q) => q.id === "rmw-double-write");
  const { writes } = MOS6502LAB.runQuirk(quirk);
  const hits = plain(writes).filter((w) => w.addr === 0x3000).map((w) => w.value);
  assert.deepEqual(hits, [0x41, 0x41, 0x42], "store, dummy write of the old value, then the new one");
});

test("the indexed-read demonstration really touches the un-carried address", () => {
  const quirk = SIX502.QUIRKS.find((q) => q.id === "indexed-dummy-read");
  const { traces } = MOS6502LAB.runQuirk(quirk);
  const addresses = plain(traces[traces.length - 1].trace).map((c) => c.addr);
  assert.ok(addresses.includes(0x2010), "the wrong address was read");
  assert.ok(addresses.includes(0x2110), "and then the right one");
});

test("every addressing-mode walkthrough runs its instruction and has prose", () => {
  assert.equal(SIX502.ADDRESSING.length, 13, "one per addressing mode");
  const modes = SIX502.ADDRESSING.map((entry) => entry.mode);
  assert.deepEqual([...modes].sort(), [...Object.keys(MOS6502.MODES)].sort());
  for (const entry of SIX502.ADDRESSING) {
    const result = MOS6502LAB.runAddressing(entry);
    assert.ok(result.ok, `${entry.mode} assembles: ${result.error && result.error.message}`);
    assert.equal(result.step.op.mode, entry.mode, `${entry.sample} really uses ${entry.mode}`);
    assert.ok(result.step.trace.length >= 2);
    assert.ok(entry.why.length > 80, `${entry.mode} is explained`);
    assert.ok(/cycle/.test(entry.cost), `${entry.mode} states its cost`);
  }
});

test("the (indirect),Y walkthrough crosses a page, as its text claims", () => {
  const entry = SIX502.ADDRESSING.find((e) => e.mode === "izy");
  const { cpu, step } = MOS6502LAB.runAddressing(entry);
  assert.equal(cpu.a, 0x5a);
  assert.equal(step.cycles, 6, "5 + 1 for the page crossing");
});

test("the absolute,X walkthrough shows the wasted read the text describes", () => {
  const entry = SIX502.ADDRESSING.find((e) => e.mode === "abx");
  const { step, cpu } = MOS6502LAB.runAddressing(entry);
  assert.equal(cpu.a, 0x3d);
  assert.equal(step.cycles, 5);
  assert.ok(plain(step.trace).some((c) => c.addr === 0x2010), "$2010 was read and discarded");
});

test("every sample program assembles without error", () => {
  assert.ok(SIX502.PROGRAMS.length >= 8);
  for (const program of SIX502.PROGRAMS) {
    const result = MOS6502ASM.assemble(program.source);
    assert.deepEqual(plain(result.errors), [], `${program.id}: ${JSON.stringify(plain(result.errors))}`);
    assert.ok(result.bytes.length > 4, `${program.id} produces code`);
    assert.ok(program.blurb.length > 40, `${program.id} is described`);
  }
});

test("the multiply program computes 13 x 19", () => {
  const program = SIX502.PROGRAMS.find((p) => p.id === "multiply");
  const { cpu } = MOS6502LAB.runProgram(program.source, { budget: 100_000 });
  assert.equal(cpu.peek(0x20) | (cpu.peek(0x21) << 8), 247);
});

test("the screen programs actually paint the screen", () => {
  for (const id of ["pixels", "fill", "rainbow"]) {
    const program = SIX502.PROGRAMS.find((p) => p.id === id);
    const { cpu } = MOS6502LAB.runProgram(program.source, { budget: 2_000_000 });
    const lit = [...cpu.mem.slice(0x0200, 0x0600)].filter((b) => b !== 0).length;
    assert.ok(lit > 3, `${id} lit ${lit} pixels`);
  }
  // Fill and rainbow should touch all 1,024 pixels. Count the addresses
  // written, not the pixels left non-black: black is a colour in the ramp.
  for (const id of ["fill", "rainbow"]) {
    const program = SIX502.PROGRAMS.find((p) => p.id === id);
    const { writes } = MOS6502LAB.runProgram(program.source, { budget: 2_000_000 });
    const touched = new Set(plain(writes).map((w) => w.addr).filter((a) => a >= 0x0200 && a < 0x0600));
    assert.equal(touched.size, 1024, `${id} covers every pixel`);
  }
});

test("the sieve program finds the primes", () => {
  const program = SIX502.PROGRAMS.find((p) => p.id === "sieve");
  const { cpu } = MOS6502LAB.runProgram(program.source, { budget: 5_000_000 });
  const flags = cpu.mem.slice(0x0300, 0x0400);
  const found = [];
  for (let n = 2; n < 256; n++) if (flags[n]) found.push(n);
  assert.deepEqual(found.slice(0, 10), [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
  assert.equal(found.length, 54, "there are 54 primes below 256");
  assert.ok(!found.includes(91), "91 is 7 x 13");
});

test("the sort program leaves sixteen bytes in order", () => {
  const program = SIX502.PROGRAMS.find((p) => p.id === "sort");
  for (const seed of [1, 7, 12345]) {
    const { cpu } = MOS6502LAB.runProgram(program.source, { budget: 2_000_000, seed });
    const data = [...cpu.mem.slice(0x0300, 0x0310)];
    const sorted = [...data].sort((a, b) => a - b);
    assert.deepEqual(data, sorted, `seed ${seed}: ${data.join(",")}`);
  }
});

test("the endless programs keep running rather than falling off the end", () => {
  for (const id of ["random", "walk"]) {
    const program = SIX502.PROGRAMS.find((p) => p.id === id);
    const { cpu } = MOS6502LAB.runProgram(program.source, { budget: 300_000 });
    assert.equal(cpu.halted, false, `${id} is still going`);
    assert.ok(cpu.pc >= 0x0600 && cpu.pc < 0x0700, `${id} is still inside its own code, at $${cpu.pc.toString(16)}`);
  }
});

// ---------------------------------------------------------------
// The prose
// ---------------------------------------------------------------
test("every documented instruction has a one-line description", () => {
  const names = new Set(MOS6502.OPCODES.map((op) => op.name));
  for (const name of names) {
    assert.ok(SIX502.INSTRUCTIONS[name], `${name} is described`);
    assert.ok(SIX502.INSTRUCTIONS[name].length > 20, `${name}'s description says something`);
  }
});

test("the history is a chronology with substance at every stop", () => {
  assert.ok(SIX502.HISTORY.length >= 7);
  for (const stop of SIX502.HISTORY) {
    assert.ok(stop.summary.length > 180, `${stop.year} has explanatory prose`);
    assert.ok(stop.detail.length >= 2);
    assert.equal(stop.numbers.length, 3);
  }
  const years = SIX502.HISTORY.map((s) => s.year).join(" ");
  for (const marker of ["1974", "1975", "Now"]) assert.match(years, new RegExp(marker));
});

test("the machines list covers the chip's actual career", () => {
  assert.ok(SIX502.MACHINES.length >= 10);
  const names = SIX502.MACHINES.map((m) => m.name).join(" ");
  for (const machine of ["Apple II", "Commodore 64", "NES", "BBC Micro", "Atari"]) {
    assert.match(names, new RegExp(machine));
  }
  for (const machine of SIX502.MACHINES) {
    assert.ok(machine.note.length > 30, `${machine.name} has a note`);
    assert.ok(machine.mhz > 0);
  }
});

test("registers, flags and the memory map are all covered", () => {
  assert.equal(SIX502.REGISTERS.length, 6);
  assert.equal(SIX502.FLAGS.length, 8, "eight bits, even the two that are not flags");
  assert.deepEqual(plain(SIX502.FLAGS).map((f) => f.bit), [7, 6, 5, 4, 3, 2, 1, 0]);
  assert.equal(SIX502.MEMORY_MAP[0].from, 0x0000);
  assert.equal(SIX502.MEMORY_MAP.at(-1).to, 0xffff, "the map reaches the vectors");
  assert.equal(SIX502.PALETTE.length, 16);
  for (const colour of SIX502.PALETTE) assert.match(colour, /^#[0-9a-f]{6}$/);
});

test("the page says what it does not model", () => {
  assert.ok(SIX502.LIMITS.length >= 4);
  const text = SIX502.LIMITS.join(" ");
  assert.match(text, /unstable/i);
  assert.match(text, /65C02/);
  assert.match(text, /sampled between instructions/i);
});

test("the source ledger is substantial, HTTPS-only and says what each source is for", () => {
  assert.ok(SIX502.SOURCES.length >= 12);
  for (const source of SIX502.SOURCES) {
    assert.match(source.href, /^https:\/\//, `${source.title} is https`);
    assert.ok(source.title.length > 8);
    assert.ok(source.pub.length > 4, `${source.title} names its publisher`);
    assert.ok(source.use.length > 50, `${source.title} says what it was used for`);
  }
  const all = SIX502.SOURCES.map((s) => `${s.title} ${s.pub}`).join(" ");
  for (const expected of ["MOS Technology", "Klaus Dormann", "Bruce Clark", "Visual6502", "Computer History Museum"]) {
    assert.match(all, new RegExp(expected));
  }
});
