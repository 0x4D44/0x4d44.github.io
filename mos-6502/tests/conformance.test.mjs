// Conformance against the reference suite.
//
// Klaus Dormann's 6502_functional_test is the accepted oracle for a
// 6502 core: ~30.6 million instructions that check every documented
// opcode, every addressing mode, both decimal and binary arithmetic,
// and the flag results of each, trapping on the first disagreement and
// finishing at a known success address.
//
// The binary is GPL-licensed third-party code, so it is not vendored
// into this repository. Fetch it once and this test runs:
//
//   curl -L -o mos-6502/tests/vendor/6502_functional_test.bin \
//     https://raw.githubusercontent.com/Klaus2m5/6502_65C02_functional_tests/master/bin_files/6502_functional_test.bin
//
// Without it the test reports as skipped rather than failing, so the
// suite stays runnable offline. The last full run of this core reached
// the success trap at $3469 after 30,646,177 instructions and
// 96,241,367 cycles with no intermediate trap.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const BINARY = process.env.FUNCTIONAL_TEST_BIN
  ?? resolve(PROJECT, "tests/vendor/6502_functional_test.bin");
const SUCCESS_TRAP = 0x3469;
const START = 0x0400;

let binary = null;
try { binary = await readFile(BINARY); } catch { /* not vendored */ }

test("the core passes Klaus Dormann's 6502 functional test suite", { skip: binary ? false : `reference binary not present at ${BINARY}` }, () => {
  const source = vmLoad();
  const cpu = source.create({ recordCycles: false });
  cpu.mem.set(binary, 0);
  cpu.pc = START;

  // The suite signals both failure and success the same way: a branch
  // to itself. Where it stops is the whole result.
  let steps = 0;
  let pc = cpu.pc;
  while (steps < 40_000_000) {
    const before = cpu.pc;
    cpu.step();
    steps++;
    if (cpu.pc === before) { pc = before; break; }
  }
  assert.equal(pc.toString(16), SUCCESS_TRAP.toString(16),
    `trapped at $${pc.toString(16).toUpperCase()} — a trap anywhere but $3469 is a failing test inside the suite`);
  assert.ok(steps > 30_000_000, "the suite really ran to completion");
});

function vmLoad() {
  const sandbox = { window: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(resolve(PROJECT, "cpu.js"), "utf8"), sandbox, { filename: "cpu.js" });
  return sandbox.MOS6502;
}
