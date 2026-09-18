// Real-browser checks for "The 6502, cycle by cycle".
//
// Serves the unmodified production files, drives Chrome over CDP, and
// exercises every instrument at desktop and phone width. The page runs
// its own self-test under ?selftest=1 — all 256 opcodes traced, every
// quirk demonstration executed — so this file checks that the UI in
// front of that emulator behaves, and that nothing overflows sideways.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "../..");
const CHROME = process.env.CHROME_PATH ?? [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((candidate) => existsSync(candidate));

if (!CHROME) {
  console.log("6502 browser test: no Chrome found; skipping. Set CHROME_PATH to run it.");
  process.exit(0);
}

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json",
  ".png": "image/png", ".ico": "image/x-icon",
};
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const missing = [];

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
  const path = resolve(ROOT, (pathname.endsWith("/") ? `${pathname}index.html` : pathname).replace(/^[/\\]+/, ""));
  if (!path.startsWith(ROOT)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    // Browsers may request a favicon; the application itself must not miss.
    if (pathname !== "/favicon.ico") missing.push(pathname);
    response.writeHead(404).end("not found");
  }
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const base = `http://127.0.0.1:${server.address().port}/mos-6502/`;

const profile = await mkdtemp(join(tmpdir(), "mos6502-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=0", "--no-sandbox",
  "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run",
  "--disable-background-networking", "--force-prefers-reduced-motion",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let wsUrl = "";
await new Promise((resolveStart, rejectStart) => {
  const timeout = setTimeout(() => rejectStart(new Error("Chrome did not start")), 30_000);
  chrome.stderr.on("data", (chunk) => {
    const match = /ws:\/\/[^\s]+/.exec(chunk.toString());
    if (match && !wsUrl) { wsUrl = match[0]; clearTimeout(timeout); resolveStart(); }
  });
  chrome.once("exit", (code) => {
    if (!wsUrl) { clearTimeout(timeout); rejectStart(new Error(`Chrome exited before CDP was ready (${code})`)); }
  });
});

const socket = new WebSocket(wsUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});

let messageId = 0;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolveMessage, rejectMessage } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? rejectMessage(new Error(JSON.stringify(message.error))) : resolveMessage(message.result);
    return;
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
  }
  if (message.method === "Runtime.exceptionThrown") {
    pageErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  }
});

function send(method, params = {}, sessionId) {
  const id = ++messageId;
  return new Promise((resolveMessage, rejectMessage) => {
    pending.set(id, { resolveMessage, rejectMessage });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const command = (method, params) => send(method, params, sessionId);
await command("Runtime.enable");
await command("Page.enable");

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function navigate(url) {
  await command("Page.navigate", { url });
  for (let index = 0; index < 150; index += 1) {
    const ready = await evaluate("document.readyState === 'complete' && document.documentElement.dataset.appReady === 'true'").catch(() => false);
    if (ready) break;
    await delay(40);
  }
  await delay(180);
}

const failures = [];
function check(name, callback) {
  try { callback(); console.log(`  ok  ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.log(`FAIL  ${name}: ${error.message}`); }
}

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000, mobile: false },
    { name: "tablet", width: 768, height: 1024, mobile: false },
    { name: "mobile", width: 390, height: 844, mobile: true },
  ]) {
    await command("Emulation.setDeviceMetricsOverride", {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
    });
    await navigate(`${base}?selftest=1`);

    const boot = await evaluate(`(() => {
      const host = [...document.documentElement.querySelectorAll("*")].find((node) => node.shadowRoot?.querySelector("a"));
      const buried = [];
      if (host) {
        const back = host.getBoundingClientRect();
        for (const control of document.querySelectorAll("a, button, input, select, textarea, [role=button]")) {
          const rect = control.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const overlapWidth = Math.min(rect.right, back.right) - Math.max(rect.left, back.left);
          const overlapHeight = Math.min(rect.bottom, back.bottom) - Math.max(rect.top, back.top);
          if (overlapWidth >= 6 && overlapHeight >= 6) buried.push((control.textContent || control.id || control.tagName).trim().slice(0, 40));
        }
      }
      return {
        selftest: document.documentElement.dataset.selftest,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        host: !!host,
        buried,
        sources: document.querySelectorAll("#source-list li").length,
        limits: document.querySelectorAll("#limits-list li").length,
      };
    })()`);
    check(`${viewport.name}: the page's own self-test passes`, () => assert.equal(boot.selftest, "pass"));
    check(`${viewport.name}: no page-level horizontal overflow`, () => assert.ok(boot.overflow <= 1, `${boot.overflow}px`));
    check(`${viewport.name}: shared Almanac control mounts`, () => assert.equal(boot.host, true));
    check(`${viewport.name}: no control is buried under the Almanac pill`, () => assert.deepEqual(boot.buried, []));
    check(`${viewport.name}: the source ledger and the limits render`, () => {
      assert.ok(boot.sources >= 12, `${boot.sources} sources`);
      assert.ok(boot.limits >= 4, `${boot.limits} limits`);
    });

    // Every panel must open, render substantial content, and not push the
    // page sideways once its instruments have laid out.
    const panels = await evaluate(`(() => {
      const out = [];
      for (const button of document.querySelectorAll("[data-tab]")) {
        button.click();
        const panel = document.getElementById("panel-" + button.dataset.tab);
        out.push({
          name: button.dataset.tab,
          hidden: panel.hidden,
          text: panel.textContent.trim().length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        });
      }
      return out;
    })()`);
    for (const panel of panels) {
      check(`${viewport.name}: ${panel.name} panel renders and fits`, () => {
        assert.equal(panel.hidden, false);
        assert.ok(panel.text > 400, `${panel.text} characters`);
        assert.ok(panel.overflow <= 1, `${panel.overflow}px of overflow`);
      });
    }
  }

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate(base);

  // ---- 03 cycles -------------------------------------------------
  const timing = await evaluate(`(() => {
    document.querySelector('[data-tab="cycles"]').click();
    const picker = document.getElementById("cycle-picker");
    const labels = [...picker.children].map((c) => c.textContent);
    const find = (text) => [...picker.children].find((c) => c.textContent === text);
    find("INC $2000").click();
    const rmw = {
      total: document.getElementById("cycle-total").textContent,
      cells: [...document.querySelectorAll(".cycle-cell")].map((c) => c.className.includes("is-write")),
      notes: [...document.querySelectorAll(".cycle-cell")].length,
    };
    find("LDA $20F0,X").click();
    const crossed = {
      total: document.getElementById("cycle-total").textContent,
      addresses: [...document.querySelectorAll(".cycle-addr")].map((c) => c.textContent),
    };
    find("LDA $2000,X").click();
    const inside = document.getElementById("cycle-total").textContent;
    // Step the diagram and watch the bus readout follow.
    find("JSR $0700").click();
    document.getElementById("cycle-next").click();
    document.getElementById("cycle-next").click();
    const stepped = {
      addr: document.getElementById("bus-address").textContent,
      note: document.getElementById("cycle-note").textContent,
      current: [...document.querySelectorAll(".cycle-cell")].findIndex((c) => c.classList.contains("is-current")),
    };
    return { labels, rmw, crossed, inside, stepped };
  })()`);
  check("the cycle instrument offers a range of instructions", () => assert.ok(timing.labels.length >= 14, `${timing.labels.length}`));
  check("INC $2000 shows six cycles, two of them writes", () => {
    assert.equal(timing.rmw.total, "6");
    assert.equal(timing.rmw.cells.filter(Boolean).length, 2);
  });
  check("an indexed read that crosses a page costs five cycles and touches the wrong address", () => {
    assert.equal(timing.crossed.total, "5");
    assert.ok(timing.crossed.addresses.includes("2010"), timing.crossed.addresses.join(","));
    assert.ok(timing.crossed.addresses.includes("2110"), timing.crossed.addresses.join(","));
  });
  check("the same instruction inside a page costs four", () => assert.equal(timing.inside, "4"));
  check("stepping the diagram moves the bus readout", () => {
    assert.equal(timing.stepped.current, 2);
    assert.match(timing.stepped.note, /Cycle 3 of 6/);
    assert.match(timing.stepped.addr, /^\$[0-9A-F]{4}$/);
  });

  // ---- 04 addressing ---------------------------------------------
  const modes = await evaluate(`(() => {
    document.querySelector('[data-tab="addressing"]').click();
    const picker = document.getElementById("mode-picker");
    const out = [];
    for (const chip of picker.children) {
      chip.click();
      out.push({
        label: chip.textContent,
        rows: document.querySelectorAll("#mode-trace tr").length,
        chase: document.querySelectorAll("#mode-chase .chase-node").length,
        why: document.getElementById("mode-why").textContent.length,
      });
    }
    // Leave it on the indirect JMP and read the chase out.
    [...picker.children].find((c) => c.textContent === "indirect").click();
    const chase = [...document.querySelectorAll("#mode-chase .chase-value")].map((n) => n.textContent);
    return { out, chase };
  })()`);
  check("all thirteen addressing modes render a trace and a chase", () => {
    assert.equal(modes.out.length, 13);
    for (const mode of modes.out) {
      assert.ok(mode.rows >= 2, `${mode.label}: ${mode.rows} trace rows`);
      assert.ok(mode.chase >= 2, `${mode.label}: ${mode.chase} chase nodes`);
      assert.ok(mode.why > 80, `${mode.label}: thin explanation`);
    }
  });
  check("the indirect JMP chase ends at the wrong page", () => {
    assert.ok(modes.chase.includes("$3000"), modes.chase.join(" "));
    assert.ok(modes.chase.includes("$8000"), modes.chase.join(" "));
  });

  // ---- 05 the ALU ------------------------------------------------
  const alu = await evaluate(`(() => {
    document.querySelector('[data-tab="alu"]').click();
    const set = (id, value) => { const n = document.getElementById(id); n.value = value; n.dispatchEvent(new Event("input", { bubbles: true })); };
    const tick = (id, on) => { const n = document.getElementById(id); n.checked = on; n.dispatchEvent(new Event("change", { bubbles: true })); };
    const flags = () => [...document.querySelectorAll(".alu-flag")].map((f) => f.textContent.replace(/\\s+/g, " ").trim());
    tick("alu-decimal", false); tick("alu-subtract", false); tick("alu-carry-in", false);
    set("alu-a", 80); set("alu-m", 80);                 // $50 + $50
    const signedOnly = { flags: flags(), verdict: document.getElementById("alu-verdict").textContent };
    set("alu-a", 208); set("alu-m", 144);               // $D0 + $90
    const both = flags();
    const bothWalks = document.querySelectorAll("#alu-circle-key .walk-key").length;
    set("alu-a", 80); set("alu-m", 144);               // $50 + $90: two walks, no flags
    const neither = { flags: flags(), keys: document.querySelectorAll("#alu-circle-key .walk-key").length };
    set("alu-a", 80); set("alu-m", 80);
    const oneWalk = document.querySelectorAll("#alu-circle-key .walk-key.is-both").length;
    set("alu-a", 153); set("alu-m", 1); tick("alu-decimal", true);   // $99 + $01 in BCD
    const bcd = { flags: flags(), sum: document.querySelector(".sum-table tr.is-result").textContent };
    const circle = document.querySelectorAll("#alu-circle .alu-seam").length;
    return { signedOnly, both, bcd, circle, bothWalks, neither, oneWalk };
  })()`);
  check("$50 + $50 sets V and not C", () => {
    assert.ok(alu.signedOnly.flags.some((f) => /^V1/.test(f)), alu.signedOnly.flags.join(" | "));
    assert.ok(alu.signedOnly.flags.some((f) => /^C0/.test(f)), alu.signedOnly.flags.join(" | "));
    assert.match(alu.signedOnly.verdict, /signed walk crossed/);
  });
  check("$D0 + $90 sets both", () => {
    assert.ok(alu.both.some((f) => /^V1/.test(f)), alu.both.join(" | "));
    assert.ok(alu.both.some((f) => /^C1/.test(f)), alu.both.join(" | "));
  });
  check("decimal $99 + $01 gives $00 with carry, and Z lies", () => {
    assert.match(alu.bcd.sum, /\$00/);
    assert.ok(alu.bcd.flags.some((f) => /^C1/.test(f)), alu.bcd.flags.join(" | "));
    assert.ok(alu.bcd.flags.some((f) => /^Z0/.test(f)), "Z should report the binary result, not the decimal one");
  });
  check("the circle draws both seams", () => assert.equal(alu.circle, 2));
  check("a positive operand walks once, a negative one walks twice", () => {
    assert.equal(alu.oneWalk, 1, "$50 + $50 should be a single walk");
    assert.equal(alu.bothWalks, 2, "$D0 + $90 should be two");
    assert.equal(alu.neither.keys, 2, "$50 + $90 should be two");
  });
  check("$50 + $90 sets neither flag, though both walks pass a seam", () => {
    assert.ok(alu.neither.flags.some((f) => /^V0/.test(f)), alu.neither.flags.join(" | "));
    assert.ok(alu.neither.flags.some((f) => /^C0/.test(f)), alu.neither.flags.join(" | "));
  });

  // ---- 06 the matrix ---------------------------------------------
  const matrix = await evaluate(`(() => {
    document.querySelector('[data-tab="matrix"]').click();
    const cells = document.querySelectorAll(".matrix-cell");
    const undocumented = [...cells].filter((c) => c.className.includes("g-undocumented")).length;
    document.querySelector('[data-view="fields"]').click();
    const fieldClasses = new Set([...cells].map((c) => [...c.classList].find((k) => k.startsWith("f-"))));
    const explainer = document.getElementById("matrix-explainer").textContent;
    document.querySelector('[data-view="group"]').click();
    // $A1 is LDA (indirect,X): click it and check the detail, then trace it.
    const target = [...cells].find((c) => c.dataset.code === "161");
    target.click();
    const detail = document.getElementById("matrix-detail").textContent;
    const traced = {
      instruction: document.getElementById("cycle-instruction").textContent,
      total: document.getElementById("cycle-total").textContent,
    };
    return { count: cells.length, undocumented, fields: [...fieldClasses].sort(), explainer, detail, traced };
  })()`);
  check("all 256 opcodes are on the matrix", () => assert.equal(matrix.count, 256));
  check("105 of them are undocumented", () => assert.equal(matrix.undocumented, 105));
  check("the bit-field view splits into the four cc groups", () => assert.deepEqual(matrix.fields, ["f-0", "f-1", "f-2", "f-3"]));
  check("the bit-field view explains the undocumented opcodes", () => assert.match(matrix.explainer, /aaabbbcc/));
  check("clicking an opcode describes and traces it", () => {
    assert.match(matrix.detail, /\$A1/);
    assert.match(matrix.detail, /LDA/);
    assert.match(matrix.detail, /\(indirect,X\)/);
    assert.equal(matrix.traced.instruction, "LDA ($40,X)");
    assert.equal(matrix.traced.total, "6");
  });

  // ---- 07 the machine --------------------------------------------
  const assembled = await evaluate(`(() => {
    document.querySelector('[data-tab="machine"]').click();
    const picker = document.getElementById("program-picker");
    const results = [];
    for (const chip of picker.children) {
      chip.click();
      results.push({ name: chip.textContent, status: document.getElementById("editor-status").className });
    }
    return results;
  })()`);
  check("every sample program assembles in the browser", () => {
    assert.ok(assembled.length >= 8, `${assembled.length} programs`);
    for (const program of assembled) assert.match(program.status, /is-ok/, `${program.name}: ${program.status}`);
  });

  const running = await evaluate(`(() => {
    const picker = document.getElementById("program-picker");
    [...picker.children].find((c) => c.textContent === "Multiply").click();
    const editor = document.getElementById("editor");
    // Single-step it to completion and read the 16-bit product back.
    for (let i = 0; i < 400; i++) document.getElementById("btn-step").click();
    const dump = document.getElementById("hexdump");
    document.getElementById("memory-address").value = "0020";
    document.getElementById("memory-address").dispatchEvent(new Event("input", { bubbles: true }));
    const line = dump.textContent.split(String.fromCharCode(10))[0];
    return { line, registers: document.getElementById("reg-readout").textContent, disasm: document.querySelectorAll(".disasm-line").length };
  })()`);
  check("stepping the multiply program leaves 13 x 19 in memory", () => {
    // $20 = F7, $21 = 00 -> 247
    assert.match(running.line, /^0020 {2}F7 00/, running.line);
  });
  check("the debugger shows registers and a disassembly", () => {
    assert.match(running.registers, /PC/);
    assert.equal(running.disasm, 14);
  });

  await evaluate(`(() => {
    const picker = document.getElementById("program-picker");
    [...picker.children].find((c) => c.textContent === "Rainbow").click();
    const speed = document.getElementById("run-speed");
    speed.value = "6"; speed.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("btn-run").click();
  })()`);
  await delay(2200);
  const painted = await evaluate(`(() => {
    const canvas = document.getElementById("screen");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let nonBlack = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 60) nonBlack++;
    return {
      nonBlack,
      total: data.length / 4,
      instructions: document.getElementById("stat-instructions").textContent,
      stopped: document.getElementById("btn-run").textContent,
      note: document.getElementById("editor-status").textContent,
    };
  })()`);
  check("pressing Run paints the canvas and stops at BRK", () => {
    assert.ok(painted.nonBlack > painted.total / 4, `${painted.nonBlack} of ${painted.total} subpixels lit`);
    assert.notEqual(painted.instructions, "0");
    assert.equal(painted.stopped, "Run", "the run loop should have stopped itself");
    assert.match(painted.note, /stopped at BRK/);
  });

  const badSource = await evaluate(`(() => {
    const LF = String.fromCharCode(10);
    const editor = document.getElementById("editor");
    editor.value = "  LDX $10,X" + LF + "  FOO $20" + LF + "  BNE nowhere";
    document.getElementById("btn-assemble").click();
    const status = document.getElementById("editor-status");
    return { className: status.className, text: status.textContent };
  })()`);
  check("a broken program produces teaching errors, not a stack trace", () => {
    assert.match(badSource.className, /is-error/);
    assert.match(badSource.text, /line 1/);
    assert.match(badSource.text, /no zero page,X or absolute,X form/);
    assert.match(badSource.text, /line 2/);
    assert.match(badSource.text, /not a 6502 instruction/);
    assert.match(badSource.text, /line 3/);
  });

  // ---- 08 interrupts ---------------------------------------------
  const interrupts = await evaluate(`(() => {
    document.querySelector('[data-tab="interrupts"]').click();
    const fire = (kind) => document.querySelector('[data-interrupt="' + kind + '"]').click();
    const read = () => ({
      rows: document.querySelectorAll("#interrupt-trace tr").length,
      summary: document.getElementById("interrupt-summary").textContent,
      stack: document.getElementById("stack-note").textContent,
    });
    fire("irq");
    const irq = read();
    fire("brk");
    const brk = read();
    fire("nmi");
    const nmi = read();
    fire("reset");
    const reset = read();
    // Now mask it.
    const mask = document.getElementById("interrupt-i-flag");
    fire("irq");
    mask.checked = true; mask.dispatchEvent(new Event("change", { bubbles: true }));
    const masked = read();
    mask.checked = false; mask.dispatchEvent(new Event("change", { bubbles: true }));
    fire("nmi");
    mask.checked = true; mask.dispatchEvent(new Event("change", { bubbles: true }));
    const maskedNmi = read();
    return { irq, brk, nmi, reset, masked, maskedNmi, vectors: document.querySelectorAll("#vector-row .vector").length };
  })()`);
  check("the three vectors are described", () => assert.equal(interrupts.vectors, 3));
  check("IRQ and BRK both take seven cycles", () => {
    assert.equal(interrupts.irq.rows, 7);
    assert.equal(interrupts.brk.rows, 7);
    assert.equal(interrupts.nmi.rows, 7);
  });
  check("the B bit distinguishes BRK from a hardware interrupt", () => {
    assert.match(interrupts.brk.stack, /SET, so this was BRK/);
    assert.match(interrupts.irq.stack, /CLEAR, so this was hardware/);
  });
  check("RESET takes seven cycles and writes nothing", () => {
    assert.equal(interrupts.reset.rows, 7);
    assert.match(interrupts.reset.stack, /writes are suppressed/);
  });
  check("the I flag refuses an IRQ but not an NMI", () => {
    assert.match(interrupts.masked.summary, /Refused/);
    assert.ok(!/Refused/.test(interrupts.maskedNmi.summary), interrupts.maskedNmi.summary);
    assert.equal(interrupts.maskedNmi.rows, 7);
  });

  // ---- 09 quirks --------------------------------------------------
  const quirks = await evaluate(`(() => {
    document.querySelector('[data-tab="quirks"]').click();
    const cards = [...document.querySelectorAll(".quirk")];
    for (const card of cards) card.querySelector("button.primary-button").click();
    return cards.map((card) => ({
      title: card.querySelector("h3").textContent,
      ok: !!card.querySelector(".quirk-result.is-ok"),
      report: card.querySelector(".quirk-result").textContent,
      trace: card.querySelectorAll(".quirk-trace tbody tr").length,
    }));
  })()`);
  check("every quirk demonstration runs and confirms itself", () => {
    assert.ok(quirks.length >= 9, `${quirks.length} quirks`);
    for (const quirk of quirks) {
      assert.equal(quirk.ok, true, `${quirk.title}: ${quirk.report}`);
      assert.ok(quirk.trace >= 2, `${quirk.title}: no bus trace`);
    }
  });
  check("the indirect-JMP quirk reports landing on $8000", () => {
    const jmp = quirks.find((q) => /indirect jump/i.test(q.title));
    assert.match(jmp.report, /\$8000/);
  });

  // ---- shell ------------------------------------------------------
  const keyboard = await evaluate(`(() => {
    const first = document.querySelector('[data-tab="origins"]');
    first.click();
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const selected = document.querySelector('[data-tab][aria-selected="true"]');
    return { selected: selected?.dataset.tab, panelVisible: !document.getElementById("panel-model").hidden };
  })()`);
  check("arrow keys move between tabs", () => {
    assert.equal(keyboard.selected, "model");
    assert.equal(keyboard.panelVisible, true);
  });

  const timelineWalk = await evaluate(`(() => {
    document.querySelector('[data-tab="origins"]').click();
    const first = document.getElementById("era-title").textContent;
    document.getElementById("timeline-next").click();
    document.getElementById("timeline-next").click();
    const later = document.getElementById("era-title").textContent;
    document.querySelector('[data-sort="mhz"]').click();
    const fastest = document.querySelector("#machine-list .machine strong").textContent;
    return { first, later, fastest };
  })()`);
  check("the timeline advances and the machine list re-sorts", () => {
    assert.notEqual(timelineWalk.first, timelineWalk.later);
    assert.match(timelineWalk.fastest, /W65C02S/);
  });

  const backHit = await evaluate(`(() => {
    window.scrollTo(0, 0);
    const host = document.getElementById("almanac-back-host");
    const rect = host.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === host;
  })()`);
  check("the fixed Almanac pill wins real hit-testing", () => assert.equal(backHit, true));

  check("no application resource is missing", () => assert.deepEqual(missing, []));
  check("no console errors", () => assert.deepEqual(consoleErrors, []));
  check("no page exceptions", () => assert.deepEqual(pageErrors, []));
} finally {
  try { socket.close(); } catch { /* already closed */ }
  try { chrome.kill("SIGKILL"); } catch { /* already closed */ }
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

if (failures.length) {
  console.error(`\n6502 browser test: ${failures.length} failure(s)`);
  failures.forEach((failure) => console.error(`  ${failure}`));
  process.exit(1);
}
console.log("6502 browser test: all instruments and layouts passed.");
