// ============================================================
// mos-6502 — a two-pass assembler
// ------------------------------------------------------------
// Small on purpose: labels, the thirteen addressing modes, a handful
// of directives, and errors written for someone learning the chip
// rather than for a build log. It emits a line-to-address map so the
// editor can show you which source line the program counter is on.
//
// Pass one walks the source counting bytes and recording where each
// label lands. Pass two evaluates the operands, now that every label
// is known, and encodes. The only thing pass one has to guess is
// whether an operand will fit in a zero-page byte; a label defined
// later is assumed to be a full 16-bit address, which is the same
// assumption every 6502 assembler has ever made.
// ============================================================
(function (global) {
  "use strict";

  const MOS = global.MOS6502 || (typeof require === "function" ? require("./cpu.js") : null);
  const { OPCODES } = MOS;

  // name -> { mode: opcode }, preferring documented encodings where an
  // undocumented opcode shares a mnemonic (SBC #$nn, NOP).
  const BY_NAME = Object.create(null);
  for (const op of OPCODES) {
    const entry = BY_NAME[op.name] || (BY_NAME[op.name] = Object.create(null));
    const existing = entry[op.mode];
    if (existing === undefined || (OPCODES[existing].illegal && !op.illegal)) entry[op.mode] = op.code;
  }

  const u8 = (n) => n & 0xff;
  const u16 = (n) => n & 0xffff;
  const hex4 = (n) => u16(n).toString(16).toUpperCase().padStart(4, "0");

  const ZP_OF = { zp: "abs", zpx: "abx", zpy: "aby" };
  const ABS_OF = { abs: "zp", abx: "zpx", aby: "zpy" };

  class AsmError extends Error {
    constructor(message, hint) { super(message); this.hint = hint || ""; }
  }

  // ---------------------------------------------------------------
  // Numbers and expressions.
  // $ hex, % binary, plain decimal, 'c' a character, * the current
  // address. Labels may be added to and subtracted from; < and >
  // take the low and high byte of whatever follows.
  // ---------------------------------------------------------------
  function evaluate(expr, labels, pc, pass) {
    let text = expr.trim();
    let take = null;
    if (text.startsWith("<")) { take = "lo"; text = text.slice(1).trim(); }
    else if (text.startsWith(">")) { take = "hi"; text = text.slice(1).trim(); }
    if (!text) throw new AsmError("this operand is empty");

    // Split on + and - that sit between terms.
    const parts = text.split(/([+-])/).map((p) => p.trim()).filter((p) => p !== "");
    let total = 0, sign = 1, sawTerm = false;
    for (const part of parts) {
      if (part === "+") { sign = 1; continue; }
      if (part === "-") { sign = -1; continue; }
      total += sign * term(part, labels, pc, pass);
      sawTerm = true;
      sign = 1;
    }
    if (!sawTerm) throw new AsmError(`cannot read "${expr.trim()}" as a number or label`);
    if (take === "lo") return total & 0xff;
    if (take === "hi") return (total >> 8) & 0xff;
    return total;
  }

  function term(text, labels, pc, pass) {
    if (text === "*") return pc;
    if (text[0] === "$") {
      if (!/^\$[0-9a-f]+$/i.test(text)) throw new AsmError(`"${text}" is not a hexadecimal number`);
      return parseInt(text.slice(1), 16);
    }
    if (text[0] === "%") {
      if (!/^%[01]+$/.test(text)) throw new AsmError(`"${text}" is not a binary number`);
      return parseInt(text.slice(1), 2);
    }
    if (/^'.'$/.test(text)) return text.charCodeAt(1);
    if (/^[0-9]+$/.test(text)) return parseInt(text, 10);
    if (/^[A-Z_][A-Z0-9_]*$/i.test(text)) {
      const key = text.toUpperCase();
      if (key in labels) return labels[key];
      if (pass === 1) return 0xffff;   // assume 16 bits until proven otherwise
      throw new AsmError(`"${text}" is not defined`, "Labels are written `name:` at the start of a line, constants as `name = value`.");
    }
    throw new AsmError(`cannot read "${text}" as a number or label`);
  }

  // ---------------------------------------------------------------
  // One source line, split into its parts.
  // ---------------------------------------------------------------
  function splitLine(raw) {
    // Strip a comment, but not a semicolon inside a string or a char.
    let text = "", inString = false, quote = "";
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (inString) { text += ch; if (ch === quote) inString = false; continue; }
      if (ch === '"' || ch === "'") { inString = true; quote = ch; text += ch; continue; }
      if (ch === ";") break;
      text += ch;
    }
    text = text.trim();
    if (!text) return null;

    let label = null;
    const labelled = /^([A-Z_][A-Z0-9_]*)\s*:\s*(.*)$/i.exec(text);
    if (labelled) { label = labelled[1]; text = labelled[2].trim(); }

    // `NAME = expr` is a constant, not an instruction.
    const assigned = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/i.exec(text);
    if (assigned && !label) return { label: null, assign: assigned[1], expr: assigned[2], mnemonic: null, operand: "" };
    if (!text) return { label, mnemonic: null, operand: "" };

    const parts = /^(\S+)\s*(.*)$/.exec(text);
    return { label, assign: null, mnemonic: parts[1], operand: parts[2].trim() };
  }

  // ---------------------------------------------------------------
  // What addressing mode does this operand text describe?
  // Returns candidates in preference order; the encoder picks the
  // first the instruction actually has.
  // ---------------------------------------------------------------
  function classify(operand) {
    const text = operand.trim();
    if (text === "") return { modes: ["imp", "acc"], expr: null };
    if (/^A$/i.test(text)) return { modes: ["acc"], expr: null };
    if (text[0] === "#") return { modes: ["imm"], expr: text.slice(1) };

    let m = /^\(\s*(.+?)\s*,\s*X\s*\)$/i.exec(text);
    if (m) return { modes: ["izx"], expr: m[1] };
    m = /^\(\s*(.+?)\s*\)\s*,\s*Y$/i.exec(text);
    if (m) return { modes: ["izy"], expr: m[1] };
    m = /^\(\s*(.+?)\s*\)$/.exec(text);
    if (m) return { modes: ["ind"], expr: m[1] };
    m = /^(.+?)\s*,\s*X$/i.exec(text);
    if (m) return { modes: ["zpx", "abx"], expr: m[1] };
    m = /^(.+?)\s*,\s*Y$/i.exec(text);
    if (m) return { modes: ["zpy", "aby"], expr: m[1] };
    if (/,/.test(text) && !/^["']/.test(text)) {
      throw new AsmError(`"${text}" ends in a comma but not ",X" or ",Y"`);
    }
    return { modes: ["rel", "zp", "abs"], expr: text };
  }

  function parseList(operand) {
    const items = [];
    let depth = 0, current = "", inString = false, quote = "";
    for (const ch of operand) {
      if (inString) { current += ch; if (ch === quote) inString = false; continue; }
      if (ch === '"' || ch === "'") { inString = true; quote = ch; current += ch; continue; }
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { items.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    if (current.trim()) items.push(current.trim());
    return items;
  }

  const DIRECTIVES = new Set([".ORG", "*", ".BYTE", ".DB", "DCB", ".WORD", ".DW", ".TEXT", ".ASCII", ".ASCIIZ", ".FILL", ".RES"]);

  function isDirective(mnemonic) {
    return DIRECTIVES.has(mnemonic.toUpperCase()) || mnemonic === "*=" || mnemonic.startsWith("*=");
  }

  // ---------------------------------------------------------------
  // assemble
  // ---------------------------------------------------------------
  function assemble(source, options) {
    const opts = options || {};
    const defaultOrg = opts.org === undefined ? 0x0600 : opts.org;
    const rawLines = String(source).replace(/\r\n?/g, "\n").split("\n");
    const labels = Object.create(null);
    const errors = [];

    // ---- pass one: sizes and label addresses ----
    let pc = defaultOrg;
    let org = defaultOrg;
    let sawOrg = false;
    const parsed = rawLines.map((raw, index) => {
      const lineNumber = index + 1;
      let piece;
      try { piece = splitLine(raw); } catch (error) { errors.push({ line: lineNumber, message: error.message }); return null; }
      if (!piece) return null;
      const record = { ...piece, line: lineNumber, raw, addr: pc, size: 0 };
      try {
        if (piece.label) {
          const key = piece.label.toUpperCase();
          if (key in labels) throw new AsmError(`"${piece.label}" is defined twice`);
          labels[key] = pc;
        }
        if (piece.assign) {
          labels[piece.assign.toUpperCase()] = u16(evaluate(piece.expr, labels, pc, 1));
          return record;
        }
        if (!piece.mnemonic) return record;
        record.size = sizeOf(record, labels, pc, () => { sawOrg = true; });
        if (record.newOrg !== undefined) { pc = record.newOrg; record.addr = pc; if (!sawOrg || pc < org) org = record.newOrg; sawOrg = true; }
      } catch (error) {
        // Report it once, here, and do not try to encode the line again
        // in pass two — one mistake should produce one message.
        errors.push({ line: lineNumber, message: error.message, hint: error.hint, text: raw.trim() });
        record.failed = true;
        return record;
      }
      pc = u16(pc + record.size);
      return record;
    });

    // ---- pass two: encode ----
    const output = [];        // { addr, bytes[] }
    for (const record of parsed) {
      if (!record || record.assign || !record.mnemonic || record.failed) continue;
      try {
        const bytes = encode(record, labels);
        record.bytes = bytes;
        if (bytes.length) output.push({ addr: record.addr, bytes, line: record.line });
      } catch (error) {
        errors.push({ line: record.line, message: error.message, hint: error.hint, text: record.raw.trim() });
      }
    }

    // ---- flatten ----
    const image = new Uint8Array(0x10000);
    const written = new Uint8Array(0x10000);
    let min = 0x10000, max = -1;
    for (const block of output) {
      block.bytes.forEach((b, i) => {
        const addr = u16(block.addr + i);
        image[addr] = b; written[addr] = 1;
        if (addr < min) min = addr;
        if (addr > max) max = addr;
      });
    }

    const lineMap = parsed.filter((r) => r && r.bytes && r.bytes.length)
      .map((r) => ({ line: r.line, addr: r.addr, bytes: r.bytes, text: r.raw.trim() }));
    const addrToLine = new Map();
    for (const entry of lineMap) addrToLine.set(entry.addr, entry.line);

    return {
      ok: errors.length === 0,
      errors,
      labels,
      org: sawOrg ? org : defaultOrg,
      start: min <= max ? min : (sawOrg ? org : defaultOrg),
      end: max,
      length: max >= min ? max - min + 1 : 0,
      image, written, lines: lineMap, addrToLine,
      bytes: max >= min ? Array.from(image.slice(min, max + 1)) : [],
    };
  }

  function sizeOf(record, labels, pc, markOrg) {
    const name = record.mnemonic.toUpperCase();
    // `*= $0600` may arrive as one token or two.
    if (name === "*=" || name === "*" || name === ".ORG") {
      const expr = name === "*" ? record.operand.replace(/^=\s*/, "") : record.operand;
      record.newOrg = u16(evaluate(expr, labels, pc, 1));
      markOrg();
      record.directive = "org";
      return 0;
    }
    if (name === ".BYTE" || name === ".DB" || name === "DCB") {
      record.directive = "byte";
      return parseList(record.operand).reduce((n, item) => n + (/^"/.test(item) ? item.length - 2 : 1), 0);
    }
    if (name === ".WORD" || name === ".DW") { record.directive = "word"; return parseList(record.operand).length * 2; }
    if (name === ".TEXT" || name === ".ASCII" || name === ".ASCIIZ") {
      record.directive = name === ".ASCIIZ" ? "asciiz" : "text";
      const text = stringOf(record.operand);
      return text.length + (record.directive === "asciiz" ? 1 : 0);
    }
    if (name === ".FILL" || name === ".RES") {
      record.directive = "fill";
      const items = parseList(record.operand);
      record.fillCount = evaluate(items[0], labels, pc, 1);
      return record.fillCount;
    }

    const table = BY_NAME[name];
    if (!table) {
      throw new AsmError(`"${record.mnemonic}" is not a 6502 instruction`,
        "The 6502 has 56 of them; check the opcode matrix in section 6.");
    }
    const { modes, expr } = classify(record.operand);
    record.candidates = modes;
    record.expr = expr;
    const mode = chooseMode(name, table, modes, expr, labels, pc, 1, record.operand);
    record.mode = mode;
    return OPCODES[table[mode]].bytes;
  }

  function chooseMode(name, table, modes, expr, labels, pc, pass, operandText) {
    // Relative first: a branch has exactly one mode and takes an address.
    if (modes.includes("rel") && table.rel !== undefined) return "rel";
    for (const mode of modes) {
      if (table[mode] === undefined) continue;
      if (mode === "zp" || mode === "zpx" || mode === "zpy") {
        // Only pick the short form if the value really is in page zero.
        let value;
        try { value = evaluate(expr, labels, pc, pass); } catch { return ZP_OF[mode] in table ? ZP_OF[mode] : mode; }
        if (value >= 0 && value <= 0xff) return mode;
        if (table[ZP_OF[mode]] !== undefined) return ZP_OF[mode];
        throw new AsmError(`${name} ${operandText}: $${hex4(value)} is outside page zero, and ${name} has no ${ZP_OF[mode]} form`);
      }
      return mode;
    }
    // Nothing matched: say precisely what IS available.
    const available = Object.keys(table).map((m) => MOS.MODES[m].label).join(", ");
    const asked = modes.map((m) => MOS.MODES[m].label).join(" or ");
    const suggestion = suggest(name, modes, table);
    throw new AsmError(`${name} has no ${asked} form`, `${name} accepts: ${available}.${suggestion}`);
  }

  function suggest(name, modes, table) {
    if (modes.includes("zpx") && table.zpy !== undefined) return ` Did you mean ${name} …,Y?`;
    if (modes.includes("zpy") && table.zpx !== undefined) return ` Did you mean ${name} …,X?`;
    if (modes.includes("imm") && table.zp !== undefined) return " Drop the # to address memory instead of a constant.";
    if (modes.includes("zp") && table.imm !== undefined) return " Add a # to use a constant instead of an address.";
    return "";
  }

  function stringOf(operand) {
    const text = operand.trim();
    const m = /^"(.*)"$/.exec(text) || /^'(.*)'$/.exec(text);
    if (!m) throw new AsmError(`expected a quoted string, got "${text}"`);
    return m[1];
  }

  function encode(record, labels) {
    const name = record.mnemonic.toUpperCase();
    const pc = record.addr;
    switch (record.directive) {
      case "org": return [];
      case "byte": {
        const bytes = [];
        for (const item of parseList(record.operand)) {
          if (/^"/.test(item)) { for (const ch of stringOf(item)) bytes.push(ch.charCodeAt(0) & 0xff); continue; }
          const value = evaluate(item, labels, pc, 2);
          if (value < -128 || value > 255) throw new AsmError(`${value} does not fit in a byte`);
          bytes.push(u8(value));
        }
        return bytes;
      }
      case "word": {
        const bytes = [];
        for (const item of parseList(record.operand)) {
          const value = u16(evaluate(item, labels, pc, 2));
          bytes.push(value & 0xff, value >> 8);   // little-endian, like the chip
        }
        return bytes;
      }
      case "text": case "asciiz": {
        const bytes = [...stringOf(record.operand)].map((ch) => ch.charCodeAt(0) & 0xff);
        if (record.directive === "asciiz") bytes.push(0);
        return bytes;
      }
      case "fill": {
        const items = parseList(record.operand);
        const value = items.length > 1 ? u8(evaluate(items[1], labels, pc, 2)) : 0;
        return new Array(record.fillCount).fill(value);
      }
      default: break;
    }

    const table = BY_NAME[name];
    const { modes, expr } = classify(record.operand);
    const mode = chooseMode(name, table, modes, expr, labels, pc, 2, record.operand);
    const code = table[mode];
    const op = OPCODES[code];
    if (op.bytes === 1) return [code];

    let value = evaluate(expr, labels, pc, 2);
    if (mode === "rel") {
      const target = u16(value);
      const offset = target - u16(pc + 2);
      if (offset < -128 || offset > 127) {
        throw new AsmError(
          `${name} to $${hex4(target)} is ${offset > 0 ? offset : -offset} bytes ${offset > 0 ? "forward" : "back"}; a branch reaches -128 to +127`,
          "Branch to a nearby JMP instead — that is what a 6502 assembler's long-branch does for you on bigger machines.");
      }
      return [code, u8(offset)];
    }
    if (op.bytes === 2) {
      if (mode === "imm" && (value < -128 || value > 255)) {
        throw new AsmError(`#${record.operand.slice(1)} is $${hex4(value)}, which does not fit in one byte`,
          "Use #<label for the low byte and #>label for the high byte.");
      }
      return [code, u8(value)];
    }
    return [code, u16(value) & 0xff, u16(value) >> 8];
  }

  // A listing: address, bytes, source — the thing you paste into a forum.
  function listing(result, source) {
    const byLine = new Map(result.lines.map((l) => [l.line, l]));
    return String(source).replace(/\r\n?/g, "\n").split("\n").map((text, index) => {
      const entry = byLine.get(index + 1);
      if (!entry) return `${" ".repeat(17)}${text}`;
      const bytes = entry.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
      return `${hex4(entry.addr)}  ${bytes.padEnd(11)}  ${text}`;
    }).join("\n");
  }

  const api = { assemble, listing, BY_NAME, AsmError };
  if (typeof module === "object" && module.exports) module.exports = api;
  global.MOS6502ASM = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
