(() => {
  "use strict";

  const DATA = window.X86_DATA;
  if (!DATA) {
    document.documentElement.dataset.appError = "missing-data";
    throw new Error("X86_DATA was not loaded");
  }

  const selfTestErrors = [];
  window.addEventListener("error", (event) => {
    selfTestErrors.push(event.message || "Unknown browser error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    selfTestErrors.push(String(event.reason || "Unhandled promise rejection"));
  });

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const log2 = (value) => Math.round(Math.log2(value));
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  function clear(node) {
    while (node?.firstChild) node.removeChild(node.firstChild);
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatInteger(value) {
    return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value);
  }

  function formatTransistors(value) {
    if (value >= 1_000_000) {
      const number = value / 1_000_000;
      return `${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(1)}M`;
    }
    return `${Math.round(value / 1000)}K`;
  }

  function setText(selector, value) {
    const node = typeof selector === "string" ? $(selector) : selector;
    if (node) node.textContent = String(value);
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  /* ------------------------------------------------------------------
     Tabs
  ------------------------------------------------------------------ */

  const panelNames = $$("[data-tab]").map((button) => button.dataset.tab);
  let activeTab = "lineage";

  function activateTab(name, options = {}) {
    if (!panelNames.includes(name)) name = "lineage";
    activeTab = name;

    $$('[data-tab]').forEach((button) => {
      const selected = button.dataset.tab === name;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });

    $$('[data-panel]').forEach((panel) => {
      const selected = panel.dataset.panel === name;
      panel.hidden = !selected;
      panel.classList.toggle("is-active", selected);
    });

    if (options.updateHash !== false) {
      history.replaceState(null, "", `#${name}`);
    }

    if (options.focus) {
      $(`[data-tab="${name}"]`)?.focus({ preventScroll: true });
    }

    if (options.scroll) {
      $(`#panel-${name}`)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }
  }

  $$('[data-tab]').forEach((button, index) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
    button.addEventListener("keydown", (event) => {
      let target = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") target = (index + 1) % panelNames.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") target = (index - 1 + panelNames.length) % panelNames.length;
      if (event.key === "Home") target = 0;
      if (event.key === "End") target = panelNames.length - 1;
      if (target !== null) {
        event.preventDefault();
        activateTab(panelNames[target], { focus: true });
      }
    });
  });

  $$('[data-open-tab]').forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.openTab, { scroll: true }));
  });

  window.addEventListener("hashchange", () => {
    const name = location.hash.slice(1);
    if (panelNames.includes(name)) activateTab(name, { updateHash: false });
  });

  /* ------------------------------------------------------------------
     Lineage
  ------------------------------------------------------------------ */

  const palette = {
    blue: "#72a7ff",
    teal: "#54e0c0",
    violet: "#b49aff",
    orange: "#ffac5d",
    gold: "#ffd36f",
    green: "#9de06f",
    cyan: "#65d8ef",
    red: "#ff7486"
  };

  let lineageIndex = 0;

  function buildLineage() {
    const track = $("#timeline-track");
    clear(track);
    DATA.generations.forEach((generation, index) => {
      const button = make("button", "timeline-dot");
      button.type = "button";
      button.dataset.index = String(index);
      button.setAttribute("aria-label", `${generation.name}, ${generation.year}`);
      const dot = make("i");
      dot.setAttribute("aria-hidden", "true");
      button.append(dot, make("span", "", generation.name), make("small", "", String(generation.year)));
      button.addEventListener("click", () => setLineage(index));
      track.appendChild(button);
    });

    $("#timeline-range").addEventListener("input", (event) => setLineage(Number(event.target.value)));
    renderTransistorChart();
    setLineage(0);
  }

  function setLineage(index) {
    lineageIndex = clamp(Number(index) || 0, 0, DATA.generations.length - 1);
    const generation = DATA.generations[lineageIndex];
    $("#timeline-range").value = String(lineageIndex);
    setText("#timeline-selection", `${generation.name} · ${generation.year}`);
    setText("#timeline-headline", generation.headline);
    setText("#chip-family", generation.family);
    setText("#chip-name", generation.name);
    setText("#chip-year", generation.year);
    setText("#chip-summary", generation.summary);
    setText("#pressure-copy", generation.pressure);

    $$(".timeline-dot", $("#timeline-track")).forEach((button, buttonIndex) => {
      const active = buttonIndex === lineageIndex;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "true" : "false");
    });

    const die = $("#die-visual");
    die.style.setProperty("--die-accent", palette[generation.palette] || palette.blue);
    setText(".die-label", formatTransistors(generation.transistors));

    const specs = [
      ["Clock family", generation.clock],
      ["Process", generation.process],
      ["Visible integer width", `${generation.registerBits}-bit`],
      ["Addressing", generation.addressSpace],
      ["Nearest cache", generation.cache],
      ["Issue model", generation.issue]
    ];
    const specList = $("#chip-specs");
    clear(specList);
    specs.forEach(([label, value]) => {
      const row = make("div");
      row.append(make("dt", "", label), make("dd", "", value));
      specList.appendChild(row);
    });

    const architectureList = $("#architecture-list");
    clear(architectureList);
    generation.architecture.forEach((item) => architectureList.appendChild(make("li", "", item)));

    const isa = $("#isa-chips");
    clear(isa);
    generation.isa.forEach((item) => isa.appendChild(make("span", "", item)));

    $$(".transistor-column", $("#transistor-chart")).forEach((column, columnIndex) => {
      column.classList.toggle("is-selected", columnIndex === lineageIndex);
      column.setAttribute("aria-current", columnIndex === lineageIndex ? "true" : "false");
    });
  }

  function renderTransistorChart() {
    const chart = $("#transistor-chart");
    clear(chart);
    const logs = DATA.generations.map((generation) => Math.log10(generation.transistors));
    const min = Math.min(...logs);
    const max = Math.max(...logs);

    DATA.generations.forEach((generation, index) => {
      const column = make("div", "transistor-column");
      column.setAttribute("role", "button");
      column.tabIndex = 0;
      column.setAttribute("aria-label", `${generation.name}: ${formatInteger(generation.transistors)} transistors`);
      const height = 18 + ((Math.log10(generation.transistors) - min) / (max - min)) * 176;
      const bar = make("div", "transistor-bar");
      bar.style.height = `${height}px`;
      column.append(make("strong", "", formatTransistors(generation.transistors)), bar, make("span", "", generation.name));
      column.addEventListener("click", () => setLineage(index));
      column.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setLineage(index);
        }
      });
      chart.appendChild(column);
    });
  }

  /* ------------------------------------------------------------------
     Decoder
  ------------------------------------------------------------------ */

  const PREFIX_NAMES = new Map([
    [0xF0, "LOCK"], [0xF2, "REPNE / mandatory"], [0xF3, "REP / mandatory"],
    [0x2E, "CS override"], [0x36, "SS override"], [0x3E, "DS override"],
    [0x26, "ES override"], [0x64, "FS override"], [0x65, "GS override"],
    [0x66, "operand-size / mandatory"], [0x67, "address-size override"]
  ]);
  const REGS16 = ["AX", "CX", "DX", "BX", "SP", "BP", "SI", "DI"];
  const REGS32 = ["EAX", "ECX", "EDX", "EBX", "ESP", "EBP", "ESI", "EDI"];
  const RM16 = ["BX + SI", "BX + DI", "BP + SI", "BP + DI", "SI", "DI", "BP", "BX"];
  const JCC = ["JO", "JNO", "JB", "JAE", "JE", "JNE", "JBE", "JA", "JS", "JNS", "JP", "JNP", "JL", "JGE", "JLE", "JG"];

  function buildDecoder() {
    const select = $("#decode-preset");
    DATA.decodePresets.forEach((preset) => {
      const option = make("option", "", preset.label);
      option.value = preset.id;
      select.appendChild(option);
    });
    select.addEventListener("change", () => {
      const preset = DATA.decodePresets.find((item) => item.id === select.value);
      if (!preset) return;
      $("#byte-input").value = preset.bytes;
      const mode = $(`input[name="decode-mode"][value="${preset.mode}"]`);
      if (mode) mode.checked = true;
      renderDecode();
    });
    $("#decode-button").addEventListener("click", renderDecode);
    $("#byte-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") renderDecode();
    });
    $$('input[name="decode-mode"]').forEach((radio) => radio.addEventListener("change", renderDecode));
    renderDecode();
  }

  function parseHexBytes(raw) {
    const cleaned = String(raw).replace(/0x/gi, "").replace(/[\s,;:_-]+/g, "");
    if (!cleaned || cleaned.length % 2 !== 0 || /[^0-9a-f]/i.test(cleaned)) {
      throw new Error("Enter complete hexadecimal bytes, for example 8B 46 04.");
    }
    const bytes = [];
    for (let index = 0; index < cleaned.length; index += 2) bytes.push(parseInt(cleaned.slice(index, index + 2), 16));
    if (bytes.length > 15) throw new Error("An x86 instruction may be at most 15 bytes long.");
    return bytes;
  }

  function hexByte(value) {
    return value.toString(16).padStart(2, "0").toUpperCase();
  }

  function littleEndian(bytes, signed = false) {
    let value = 0;
    bytes.forEach((byte, index) => { value += byte * (2 ** (index * 8)); });
    if (signed && bytes.length) {
      const bits = bytes.length * 8;
      const sign = 2 ** (bits - 1);
      const full = 2 ** bits;
      if (value >= sign) value -= full;
    }
    return value;
  }

  function formatDisp(value, compact = false) {
    if (value === 0) return "";
    const magnitude = Math.abs(value);
    const text = compact && magnitude < 10 ? String(magnitude) : `0x${magnitude.toString(16).toUpperCase()}`;
    return value < 0 ? ` - ${text}` : ` + ${text}`;
  }

  function parseModRM(bytes, cursor, operandSize, addressSize, registerKind = "gpr") {
    if (cursor >= bytes.length) throw new Error("The opcode requires a ModR/M byte.");
    const byte = bytes[cursor++];
    const mod = (byte >>> 6) & 3;
    const reg = (byte >>> 3) & 7;
    const rm = byte & 7;
    let sib = null;
    let displacementBytes = [];
    let memory = "";

    if (mod !== 3) {
      if (addressSize === 16) {
        let base = RM16[rm];
        let displacementLength = mod === 1 ? 1 : mod === 2 ? 2 : 0;
        if (mod === 0 && rm === 6) {
          base = "";
          displacementLength = 2;
        }
        displacementBytes = bytes.slice(cursor, cursor + displacementLength);
        if (displacementBytes.length !== displacementLength) throw new Error("The addressing form is missing displacement bytes.");
        cursor += displacementLength;
        const displacement = littleEndian(displacementBytes, mod !== 0);
        memory = base ? `[${base}${formatDisp(displacement, true)}]` : `[0x${littleEndian(displacementBytes).toString(16).toUpperCase()}]`;
      } else {
        let base = "";
        let index = "";
        let scale = 1;
        let displacementLength = mod === 1 ? 1 : mod === 2 ? 4 : 0;

        if (rm === 4) {
          if (cursor >= bytes.length) throw new Error("The ModR/M byte requests a SIB byte.");
          const sibByte = bytes[cursor++];
          const scaleBits = (sibByte >>> 6) & 3;
          const indexBits = (sibByte >>> 3) & 7;
          const baseBits = sibByte & 7;
          scale = 2 ** scaleBits;
          if (indexBits !== 4) index = REGS32[indexBits];
          if (mod === 0 && baseBits === 5) {
            displacementLength = 4;
          } else {
            base = REGS32[baseBits];
          }
          sib = { byte: sibByte, scaleBits, indexBits, baseBits, scale, base, index };
        } else if (mod === 0 && rm === 5) {
          displacementLength = 4;
        } else {
          base = REGS32[rm];
        }

        displacementBytes = bytes.slice(cursor, cursor + displacementLength);
        if (displacementBytes.length !== displacementLength) throw new Error("The addressing form is missing displacement bytes.");
        cursor += displacementLength;
        const displacement = littleEndian(displacementBytes, mod !== 0);
        const pieces = [];
        if (base) pieces.push(base);
        if (index) pieces.push(scale === 1 ? index : `${index}*${scale}`);
        let address = pieces.join(" + ");
        if (displacementLength) {
          if (!address) address = `0x${littleEndian(displacementBytes).toString(16).toUpperCase()}`;
          else address += formatDisp(displacement);
        }
        memory = `[${address || "0"}]`;
      }
    }

    const gpr = operandSize === 16 ? REGS16 : REGS32;
    const registerSet = registerKind === "mmx"
      ? Array.from({ length: 8 }, (_, index) => `MM${index}`)
      : registerKind === "xmm"
        ? Array.from({ length: 8 }, (_, index) => `XMM${index}`)
        : gpr;
    const rmOperand = mod === 3 ? registerSet[rm] : memory;
    return {
      byte, mod, reg, rm, sib, displacementBytes, cursor,
      regOperand: registerSet[reg], rmOperand,
      bitText: byte.toString(2).padStart(8, "0")
    };
  }

  function decodeInstruction(bytes, defaultMode) {
    let cursor = 0;
    const fields = [];
    const prefixes = [];
    while (cursor < bytes.length && PREFIX_NAMES.has(bytes[cursor])) {
      const value = bytes[cursor++];
      prefixes.push(value);
      fields.push({ value, kind: "prefix", label: PREFIX_NAMES.get(value) });
    }

    const operandSize = prefixes.includes(0x66) ? (defaultMode === 16 ? 32 : 16) : defaultMode;
    const addressSize = prefixes.includes(0x67) ? (defaultMode === 16 ? 32 : 16) : defaultMode;
    const startOpcode = cursor;
    if (cursor >= bytes.length) throw new Error("Prefixes are present, but the instruction has no opcode.");

    const first = bytes[cursor++];
    let second = null;
    if (first === 0x0F) {
      if (cursor >= bytes.length) throw new Error("0F escapes to a second opcode byte, which is missing.");
      second = bytes[cursor++];
      fields.push({ value: first, kind: "opcode", label: "0F escape" });
      fields.push({ value: second, kind: "opcode", label: "second opcode" });
    } else {
      fields.push({ value: first, kind: "opcode", label: "opcode" });
    }

    let assembly = "";
    let explanation = "";
    let minimum = "Audited structural decode";
    let modrm = null;
    let immediate = [];
    let displacement = [];
    let addressNote = "This instruction does not use a ModR/M addressing byte.";
    const gpr = operandSize === 16 ? REGS16 : REGS32;

    const addModRMFields = (parsed) => {
      modrm = parsed;
      fields.push({ value: parsed.byte, kind: "modrm", label: "ModR/M" });
      if (parsed.sib) fields.push({ value: parsed.sib.byte, kind: "sib", label: "SIB" });
      parsed.displacementBytes.forEach((value) => fields.push({ value, kind: "displacement", label: "displacement" }));
      displacement = parsed.displacementBytes;
      cursor = parsed.cursor;
      if (parsed.mod === 3) {
        addressNote = `mod = 11 selects registers directly: reg ${parsed.regOperand}, r/m ${parsed.rmOperand}.`;
      } else if (addressSize === 16) {
        addressNote = `In 16-bit addressing, mod = ${parsed.mod.toString(2).padStart(2, "0")} and r/m = ${parsed.rm.toString(2).padStart(3, "0")} select ${parsed.rmOperand.replace(/[\[\]]/g, "")}.`;
      } else if (parsed.sib) {
        addressNote = `SIB selects scale ×${parsed.sib.scale}, ${parsed.sib.index || "no index"} and ${parsed.sib.base || "no base"}; ModR/M supplies the displacement size.`;
      } else {
        addressNote = `The 32-bit ModR/M address resolves to ${parsed.rmOperand}.`;
      }
    };

    const readImmediate = (count, signed = false) => {
      immediate = bytes.slice(cursor, cursor + count);
      if (immediate.length !== count) throw new Error(`The instruction is missing ${count - immediate.length} immediate byte(s).`);
      immediate.forEach((value) => fields.push({ value, kind: "immediate", label: "immediate" }));
      cursor += count;
      return littleEndian(immediate, signed);
    };

    if (first >= 0xB8 && first <= 0xBF) {
      const reg = gpr[first - 0xB8];
      const value = readImmediate(operandSize / 8);
      assembly = `MOV ${reg}, 0x${value.toString(16).toUpperCase()}`;
      explanation = "The low three opcode bits choose the destination register; the literal follows in little-endian order.";
      minimum = "8086 form; 32-bit width from Intel386";
    } else if ([0x8B, 0x89, 0x01, 0x03].includes(first)) {
      const parsed = parseModRM(bytes, cursor, operandSize, addressSize, "gpr");
      addModRMFields(parsed);
      const sizeName = operandSize === 16 ? "word ptr " : "dword ptr ";
      const rm = parsed.mod === 3 ? parsed.rmOperand : `${sizeName}${parsed.rmOperand}`;
      if (first === 0x8B) assembly = `MOV ${parsed.regOperand}, ${rm}`;
      if (first === 0x89) assembly = `MOV ${rm}, ${parsed.regOperand}`;
      if (first === 0x01) assembly = `ADD ${rm}, ${parsed.regOperand}`;
      if (first === 0x03) assembly = `ADD ${parsed.regOperand}, ${rm}`;
      explanation = "The opcode fixes the operation and operand direction. ModR/M chooses a register and either another register or a memory addressing form.";
      minimum = "8086 encoding; 32-bit operands from Intel386";
    } else if (first >= 0x70 && first <= 0x7F) {
      const value = readImmediate(1, true);
      assembly = `${JCC[first & 0x0F]} rel8 ${value < 0 ? "-" : "+"}0x${Math.abs(value).toString(16).toUpperCase()}`;
      explanation = "A short conditional branch carries an 8-bit signed displacement from the next instruction.";
      minimum = "8086";
    } else if (first === 0x0F && second === 0xAF) {
      const parsed = parseModRM(bytes, cursor, operandSize, addressSize, "gpr");
      addModRMFields(parsed);
      assembly = `IMUL ${parsed.regOperand}, ${parsed.rmOperand}`;
      explanation = "0F selects the extended opcode map; AF names the two-operand signed multiply and ModR/M supplies both operands.";
      minimum = "Intel386";
    } else if (first === 0x0F && second >= 0x80 && second <= 0x8F) {
      const value = readImmediate(operandSize / 8, true);
      assembly = `${JCC[second & 0x0F]} rel${operandSize} ${value < 0 ? "-" : "+"}0x${Math.abs(value).toString(16).toUpperCase()}`;
      explanation = "The 0F 8x map supplies a near conditional branch with a signed displacement whose width follows operand size.";
      minimum = "Intel386";
    } else if (first === 0x0F && second === 0x6F && !prefixes.includes(0x66) && !prefixes.includes(0xF2) && !prefixes.includes(0xF3)) {
      const parsed = parseModRM(bytes, cursor, 32, addressSize, "mmx");
      addModRMFields(parsed);
      assembly = `MOVQ ${parsed.regOperand}, ${parsed.rmOperand}`;
      explanation = "The 0F opcode map is reused for a 64-bit packed move between MMX registers or memory.";
      minimum = "Pentium MMX";
    } else if (first === 0x0F && second === 0x10 && prefixes.includes(0xF3)) {
      const parsed = parseModRM(bytes, cursor, 32, addressSize, "xmm");
      addModRMFields(parsed);
      assembly = `MOVSS ${parsed.regOperand}, ${parsed.rmOperand}`;
      explanation = "F3 is a mandatory opcode selector here, not a request to repeat. It selects the scalar single-precision form in SSE space.";
      minimum = "Pentium III (SSE)";
    } else if (first === 0x0F && second === 0x58 && prefixes.includes(0x66)) {
      const parsed = parseModRM(bytes, cursor, 32, addressSize, "xmm");
      addModRMFields(parsed);
      assembly = `ADDPD ${parsed.regOperand}, ${parsed.rmOperand}`;
      explanation = "66 acts as a mandatory SSE2 selector. 0F 58 names add; ModR/M selects packed-double XMM operands.";
      minimum = "Pentium 4 (SSE2)";
    } else {
      assembly = `${first === 0x0F ? `0F ${hexByte(second)}` : hexByte(first)} · unsupported opcode`;
      explanation = "The byte boundary and prefixes are shown, but this teaching decoder intentionally supports only the examples in its audited subset.";
      minimum = "Structural view only";
    }

    if (cursor < bytes.length) {
      bytes.slice(cursor).forEach((value) => fields.push({ value, kind: "unknown", label: "unconsumed" }));
      explanation += ` ${bytes.length - cursor} trailing byte(s) remain outside the recognised form.`;
    }

    const exactPreset = DATA.decodePresets.find((preset) => {
      try {
        const presetBytes = parseHexBytes(preset.bytes);
        return preset.mode === defaultMode && presetBytes.length === bytes.length && presetBytes.every((value, index) => value === bytes[index]);
      } catch {
        return false;
      }
    });
    if (exactPreset) {
      assembly = exactPreset.expected;
      explanation = exactPreset.explanation;
      minimum = exactPreset.minimum;
    }

    return {
      bytes, defaultMode, operandSize, addressSize, prefixes, opcodeBytes: bytes.slice(startOpcode, first === 0x0F ? startOpcode + 2 : startOpcode + 1),
      fields, assembly, explanation, minimum, modrm, displacement, immediate, addressNote
    };
  }

  function renderDecode() {
    try {
      const bytes = parseHexBytes($("#byte-input").value);
      const defaultMode = Number($('input[name="decode-mode"]:checked')?.value || 16);
      const result = decodeInstruction(bytes, defaultMode);
      setText("#decoded-assembly", result.assembly);
      setText("#decoded-explanation", result.explanation);
      $("#byte-input").setAttribute("aria-invalid", "false");
      setText("#decode-help", "Spaces and commas are optional. The lab recognises common integer, MMX, SSE and SSE2 examples; unknown opcodes are still split into structural fields.");

      const ribbon = $("#byte-ribbon");
      clear(ribbon);
      result.fields.forEach((field) => {
        const token = make("div", `byte-token ${field.kind}`);
        token.append(make("strong", "", hexByte(field.value)), make("small", "", field.label));
        ribbon.appendChild(token);
      });

      const ledger = $("#field-ledger");
      clear(ledger);
      const entries = [
        ["Length", `${result.bytes.length} byte${result.bytes.length === 1 ? "" : "s"}`],
        ["Default mode", `${result.defaultMode}-bit`],
        ["Operand size", `${result.operandSize}-bit`],
        ["Address size", `${result.addressSize}-bit`],
        ["Opcode map", result.opcodeBytes[0] === 0x0F ? "0F extended map" : "primary map"],
        ["First generation", result.minimum]
      ];
      entries.forEach(([label, value]) => {
        const row = make("div");
        row.append(make("span", "", label), make("strong", "", value));
        ledger.appendChild(row);
      });

      updateAddressDiagram(result);
      return result;
    } catch (error) {
      setText("#decoded-assembly", "Cannot decode");
      setText("#decoded-explanation", error.message);
      setText("#decode-help", error.message);
      $("#byte-input").setAttribute("aria-invalid", "true");
      clear($("#byte-ribbon"));
      clear($("#field-ledger"));
      updateAddressDiagram({ modrm: null, addressNote: "Correct the byte string to inspect its addressing fields." });
      return null;
    }
  }

  function updateAddressDiagram(result) {
    const modrmBox = $("#modrm-diagram");
    const sibBox = $("#sib-diagram");
    const modBits = $(".bits-mod", modrmBox);
    const regBits = $(".bits-reg", modrmBox);
    const rmBits = $(".bits-rm", modrmBox);
    const scaleBits = $(".bits-scale", sibBox);
    const indexBits = $(".bits-index", sibBox);
    const baseBits = $(".bits-base", sibBox);

    if (!result.modrm) {
      modrmBox.classList.add("is-muted");
      sibBox.classList.add("is-muted");
      setText("#modrm-hex", "—");
      setText(modBits, "--");
      setText(regBits, "---");
      setText(rmBits, "---");
      setText("#sib-hex", "—");
      setText(scaleBits, "--");
      setText(indexBits, "---");
      setText(baseBits, "---");
    } else {
      const parsed = result.modrm;
      modrmBox.classList.remove("is-muted");
      setText("#modrm-hex", hexByte(parsed.byte));
      setText(modBits, parsed.mod.toString(2).padStart(2, "0"));
      setText(regBits, parsed.reg.toString(2).padStart(3, "0"));
      setText(rmBits, parsed.rm.toString(2).padStart(3, "0"));
      if (parsed.sib) {
        sibBox.classList.remove("is-muted");
        setText("#sib-hex", hexByte(parsed.sib.byte));
        setText(scaleBits, parsed.sib.scaleBits.toString(2).padStart(2, "0"));
        setText(indexBits, parsed.sib.indexBits.toString(2).padStart(3, "0"));
        setText(baseBits, parsed.sib.baseBits.toString(2).padStart(3, "0"));
      } else {
        sibBox.classList.add("is-muted");
        setText("#sib-hex", "—");
        setText(scaleBits, "--");
        setText(indexBits, "---");
        setText(baseBits, "---");
      }
    }
    setText("#address-note", result.addressNote);
  }

  /* ------------------------------------------------------------------
     Pipeline
  ------------------------------------------------------------------ */

  const pipelineState = { schedule: null, cycle: 0, timer: null };

  const PIPELINE_MODELS = {
    "8086": { widths: [2, 1, 1, 2], issueWidth: 1, issueGap: 2, penalty: 12, idea: "The bus fetches ahead into a six-byte queue." },
    "286": { widths: [2, 1, 2, 2], issueWidth: 1, issueGap: 2, penalty: 5, idea: "Address checking joins the in-order path." },
    "386": { widths: [2, 1, 2, 2], issueWidth: 1, issueGap: 2, penalty: 5, idea: "Decoding and translation now span 16- and 32-bit forms." },
    "486": { widths: [1, 1, 1, 1, 1], issueWidth: 1, issueGap: 1, penalty: 3, idea: "Five stages overlap to start a simple instruction each clock." },
    "pentium": { widths: [1, 2, 1, 1, 1, 1], issueWidth: 2, issueGap: 1, penalty: 4, idea: "Compatible neighbours can enter U and V together." },
    "p6": { widths: [2, 2, 1, 2, 2, 1], issueWidth: 3, issueGap: 1, penalty: 11, idea: "Decode, rename and scheduling separate program order from execution order." },
    "piii": { widths: [2, 2, 1, 2, 2, 1], issueWidth: 3, issueGap: 1, penalty: 11, idea: "The P6 engine schedules scalar and 128-bit SIMD work." },
    "p4": { widths: [3, 3, 3, 2, 2, 5, 2], issueWidth: 3, issueGap: 1, penalty: 20, idea: "A deep front end serves predicted traces of decoded µops." }
  };

  function buildPipeline() {
    const cpu = $("#pipeline-cpu");
    DATA.generations.forEach((generation) => {
      const option = make("option", "", `${generation.name} · ${generation.family}`);
      option.value = generation.id;
      cpu.appendChild(option);
    });
    cpu.value = "486";
    const program = $("#pipeline-program");
    Object.entries(DATA.pipelinePrograms).forEach(([id, item]) => {
      const option = make("option", "", item.label);
      option.value = id;
      program.appendChild(option);
    });
    program.value = "straight";

    cpu.addEventListener("change", rebuildPipeline);
    program.addEventListener("change", rebuildPipeline);
    $("#pipeline-mispredict").addEventListener("change", rebuildPipeline);
    $("#pipeline-speed").addEventListener("input", () => {
      setText("#pipeline-speed-output", `${$("#pipeline-speed").value} ms`);
      if (pipelineState.timer) startPipelinePlayback();
    });
    $("#pipeline-play").addEventListener("click", () => {
      if (pipelineState.timer) stopPipelinePlayback();
      else startPipelinePlayback();
    });
    $("#pipeline-step").addEventListener("click", () => stepPipeline());
    $("#pipeline-reset").addEventListener("click", resetPipeline);
    rebuildPipeline();
  }

  function stageDurations(generation) {
    const model = PIPELINE_MODELS[generation.id] || PIPELINE_MODELS["486"];
    return generation.stages.map((stage, index) => ({ ...stage, duration: model.widths[index] || 1 }));
  }

  function makePipelineSchedule(generation, program, mispredict) {
    const model = PIPELINE_MODELS[generation.id] || PIPELINE_MODELS["486"];
    const stages = stageDurations(generation);
    const rows = [];
    let branchResolution = null;

    program.instructions.forEach((instruction, index) => {
      const start = model.issueWidth > 1 ? Math.floor(index / model.issueWidth) * model.issueGap : index * model.issueGap;
      const cells = [];
      let cycle = start;
      stages.forEach((stage) => {
        for (let part = 0; part < stage.duration; part += 1) {
          cells.push({ cycle, label: part === 0 ? stage.label : "·", key: stage.key, part });
          cycle += 1;
        }
        if (instruction.branch && ["execute", "schedule"].includes(stage.key)) branchResolution = cycle;
      });
      rows.push({ text: instruction.text, instruction, start, end: cycle, cells, flushed: false });
    });

    if (mispredict && branchResolution !== null) {
      const branchIndex = program.instructions.findIndex((instruction) => instruction.branch);
      rows.forEach((row, index) => {
        if (index > branchIndex) row.flushed = true;
      });
      const recoveryStart = branchResolution + model.penalty;
      const recoveryCells = stages.map((stage, index) => ({
        cycle: recoveryStart + index,
        label: index === 0 ? "refetch" : stage.label,
        key: stage.key,
        part: 0
      }));
      rows.push({ text: "↳ correct target", instruction: { kind: "recovery" }, start: recoveryStart, end: recoveryStart + recoveryCells.length, cells: recoveryCells, flushed: false, recovery: true });
    }

    const maxCycle = Math.max(...rows.flatMap((row) => row.cells.map((cell) => cell.cycle)), 0) + 1;
    return { generation, program, model, stages, rows, maxCycle, mispredict };
  }

  function rebuildPipeline() {
    stopPipelinePlayback();
    const generation = DATA.generations.find((item) => item.id === $("#pipeline-cpu").value) || DATA.generations[3];
    const program = DATA.pipelinePrograms[$("#pipeline-program").value] || DATA.pipelinePrograms.straight;
    const mispredict = $("#pipeline-mispredict").checked && program.instructions.some((instruction) => instruction.branch);
    pipelineState.schedule = makePipelineSchedule(generation, program, mispredict);
    pipelineState.cycle = 0;
    setText("#pipeline-idea", pipelineState.schedule.model.idea);
    setText("#pipeline-caveat", `${generation.name}: conceptual stage groups${generation.id === "p4" ? " spread across Intel's roughly twenty-stage launch pipeline" : ""}. ${mispredict ? `The recovery gap is an illustrative ${pipelineState.schedule.model.penalty}-clock penalty.` : "No wrong-path recovery is shown."}`);
    renderPipelineGrid();
    updatePipelineCycle();
  }

  function renderPipelineGrid() {
    const schedule = pipelineState.schedule;
    const grid = $("#pipeline-grid");
    clear(grid);
    const columns = schedule.maxCycle;
    grid.style.setProperty("--cols", String(columns));
    grid.style.minWidth = `${Math.max(860, 145 + columns * 54)}px`;

    grid.appendChild(make("div", "pipeline-cell header", "instruction"));
    for (let cycle = 0; cycle < columns; cycle += 1) grid.appendChild(make("div", "pipeline-cell header", String(cycle + 1)));

    schedule.rows.forEach((row) => {
      const label = make("div", "pipeline-cell label", row.text);
      grid.appendChild(label);
      const cellsByCycle = new Map(row.cells.map((cell) => [cell.cycle, cell]));
      for (let cycle = 0; cycle < columns; cycle += 1) {
        const cell = make("div", "pipeline-cell");
        cell.dataset.cycle = String(cycle);
        const stage = cellsByCycle.get(cycle);
        if (stage) {
          cell.classList.add("stage");
          if (["execute", "address", "schedule"].includes(stage.key)) cell.classList.add("execute");
          if (["retire", "write"].includes(stage.key)) cell.classList.add("retire");
          if (row.flushed) cell.classList.add("flushed");
          cell.textContent = row.flushed && stage.part === 0 ? `× ${stage.label}` : stage.label;
          cell.title = `${row.text}: ${stage.label}, clock ${cycle + 1}`;
        }
        grid.appendChild(cell);
      }
    });
  }

  function updatePipelineCycle() {
    const schedule = pipelineState.schedule;
    pipelineState.cycle = clamp(pipelineState.cycle, 0, schedule.maxCycle);
    setText("#pipeline-cycle", pipelineState.cycle);
    $$(".pipeline-cell[data-cycle]", $("#pipeline-grid")).forEach((cell) => {
      const cycle = Number(cell.dataset.cycle);
      cell.classList.toggle("is-future", cycle >= pipelineState.cycle);
      cell.classList.toggle("is-current", cycle === pipelineState.cycle - 1);
    });

    const active = schedule.rows.flatMap((row) => row.cells.map((cell) => ({ ...cell, row }))).filter((cell) => cell.cycle === pipelineState.cycle - 1);
    if (active.length) {
      const names = [...new Set(active.map((cell) => cell.label === "·" ? cell.row.text : cell.label))];
      setText("#pipeline-idea", `${schedule.generation.name}, clock ${pipelineState.cycle}: ${names.slice(0, 3).join(" · ")}${names.length > 3 ? " …" : ""}`);
    } else if (pipelineState.cycle === 0) {
      setText("#pipeline-idea", schedule.model.idea);
    } else if (pipelineState.cycle >= schedule.maxCycle) {
      setText("#pipeline-idea", "The visible schedule has drained.");
    }
  }

  function stepPipeline() {
    if (pipelineState.cycle >= pipelineState.schedule.maxCycle) {
      stopPipelinePlayback();
      return;
    }
    pipelineState.cycle += 1;
    updatePipelineCycle();
    if (pipelineState.cycle >= pipelineState.schedule.maxCycle) stopPipelinePlayback();
  }

  function resetPipeline() {
    stopPipelinePlayback();
    pipelineState.cycle = 0;
    updatePipelineCycle();
  }

  function startPipelinePlayback() {
    stopPipelinePlayback();
    if (pipelineState.cycle >= pipelineState.schedule.maxCycle) pipelineState.cycle = 0;
    setText("#pipeline-play", "Pause");
    pipelineState.timer = window.setInterval(stepPipeline, Number($("#pipeline-speed").value));
  }

  function stopPipelinePlayback() {
    if (pipelineState.timer) window.clearInterval(pipelineState.timer);
    pipelineState.timer = null;
    setText("#pipeline-play", "Play");
  }

  /* ------------------------------------------------------------------
     Superscalar scheduler
  ------------------------------------------------------------------ */

  let schedulerModel = "p5";
  let schedulerResult = null;

  const schedulerCopy = {
    scalar: {
      title: "Scalar: one oldest instruction",
      copy: "One instruction may issue per clock. A dependency at the head of the stream stalls every younger instruction.",
      description: "In-order issue, one slot, with the operation latency shown as occupied clocks."
    },
    p5: {
      title: "Pentium: pair in order",
      copy: "The U pipe accepts the oldest instruction; the V pipe may accept only a suitable independent companion. A blocked old instruction blocks younger ones.",
      description: "A simplified U/V pairing model: no two memory operations pair, and complex multiply remains U-only."
    },
    p6: {
      title: "P6: rename, wait, choose",
      copy: "Ready micro-operations may issue around a blocked predecessor. Register renaming removes false WAR and WAW hazards; true data dependencies remain.",
      description: "A simplified three-wide scheduler with two ALU slots, one load slot and one multiply slot. Retirement is still in order."
    }
  };

  function buildScheduler() {
    const select = $("#scheduler-program");
    Object.entries(DATA.schedulerPrograms).forEach(([id, program]) => {
      const option = make("option", "", program.label);
      option.value = id;
      select.appendChild(option);
    });
    select.value = "mixed";
    select.addEventListener("change", renderScheduler);
    $$('[data-scheduler-model]').forEach((button) => {
      button.addEventListener("click", () => {
        schedulerModel = button.dataset.schedulerModel;
        $$('[data-scheduler-model]').forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
        renderScheduler();
      });
    });
    $("#scheduler-rerun").addEventListener("click", renderScheduler);
    $("#scheduler-miss").addEventListener("change", renderScheduler);
    renderScheduler();
  }

  function withDependencies(instructions, missFirstLoad) {
    const latestWriter = new Map();
    let missApplied = false;
    return instructions.map((instruction, index) => {
      const deps = new Set();
      (instruction.reads || []).forEach((register) => {
        if (latestWriter.has(register)) deps.add(latestWriter.get(register));
      });
      (instruction.writes || []).forEach((register) => latestWriter.set(register, index));
      let latency = instruction.latency || 1;
      let missed = false;
      if (missFirstLoad && instruction.op === "load" && !missApplied) {
        latency += 5;
        missApplied = true;
        missed = true;
      }
      return { ...instruction, index, deps: [...deps], latency, missed };
    });
  }

  function scheduleScalar(instructions) {
    const items = instructions.map((instruction) => ({ ...instruction, issue: null, complete: null, slot: "one", blocked: [] }));
    let cycle = 0;
    items.forEach((item) => {
      const ready = Math.max(0, ...item.deps.map((dep) => items[dep].complete));
      item.issue = Math.max(cycle, ready);
      item.complete = item.issue + item.latency;
      item.blocked = Array.from({ length: item.issue }, (_, value) => value < ready ? "wait" : "stall");
      cycle = item.issue + 1;
    });
    return { items, cycles: Math.max(...items.map((item) => item.complete), 0), model: "scalar" };
  }

  function canPair(first, second, items, cycle) {
    if (!second || !first.pair || !second.pair || first.op === "mul" || second.op === "mul") return false;
    if (first.op === "load" && second.op === "load") return false;
    if (second.deps.includes(first.index)) return false;
    const ready = Math.max(0, ...second.deps.map((dep) => items[dep]?.complete ?? Infinity));
    return ready <= cycle;
  }

  function scheduleP5(instructions) {
    const items = instructions.map((instruction) => ({ ...instruction, issue: null, complete: null, slot: null, blocked: [] }));
    let pointer = 0;
    let cycle = 0;
    let guard = 0;
    while (pointer < items.length && guard++ < 1000) {
      const first = items[pointer];
      const firstReady = Math.max(0, ...first.deps.map((dep) => items[dep].complete));
      if (firstReady > cycle) {
        cycle += 1;
        continue;
      }
      first.issue = cycle;
      first.complete = cycle + first.latency;
      first.slot = "u";
      pointer += 1;
      const second = items[pointer];
      if (canPair(first, second, items, cycle)) {
        second.issue = cycle;
        second.complete = cycle + second.latency;
        second.slot = "v";
        pointer += 1;
      }
      cycle += 1;
    }
    items.forEach((item) => {
      const ready = Math.max(0, ...item.deps.map((dep) => items[dep].complete));
      item.blocked = Array.from({ length: item.issue }, (_, value) => value < ready ? "wait" : "stall");
    });
    return { items, cycles: Math.max(...items.map((item) => item.complete), 0), model: "p5" };
  }

  function scheduleP6(instructions) {
    const items = instructions.map((instruction) => ({ ...instruction, issue: null, complete: null, slot: "ooo", blocked: [] }));
    let cycle = 0;
    let remaining = items.length;
    let guard = 0;
    while (remaining > 0 && guard++ < 1000) {
      const capacities = { alu: 2, load: 1, mul: 1, store: 1 };
      let width = 3;
      const ready = items.filter((item) => item.issue === null && item.deps.every((dep) => items[dep].complete !== null && items[dep].complete <= cycle));
      for (const item of ready) {
        const resource = item.op in capacities ? item.op : "alu";
        if (width <= 0 || capacities[resource] <= 0) continue;
        item.issue = cycle;
        item.complete = cycle + item.latency;
        capacities[resource] -= 1;
        width -= 1;
        remaining -= 1;
      }
      cycle += 1;
    }
    items.forEach((item) => {
      const ready = Math.max(0, ...item.deps.map((dep) => items[dep].complete));
      item.blocked = Array.from({ length: item.issue }, (_, value) => value < ready ? "wait" : "stall");
    });
    return { items, cycles: Math.max(...items.map((item) => item.complete), 0), model: "p6" };
  }

  function renderScheduler() {
    const program = DATA.schedulerPrograms[$("#scheduler-program").value] || DATA.schedulerPrograms.mixed;
    const instructions = withDependencies(program.instructions, $("#scheduler-miss").checked);
    schedulerResult = schedulerModel === "scalar" ? scheduleScalar(instructions) : schedulerModel === "p5" ? scheduleP5(instructions) : scheduleP6(instructions);
    const copy = schedulerCopy[schedulerModel];
    setText("#scheduler-model-title", copy.title);
    setText("#scheduler-model-copy", copy.copy);
    setText("#scheduler-description", `${program.description} ${copy.description}`);
    setText("#scheduler-cycles", schedulerResult.cycles);
    setText("#scheduler-instructions", schedulerResult.items.length);
    setText("#scheduler-ipc", (schedulerResult.items.length / Math.max(1, schedulerResult.cycles)).toFixed(2));

    const grid = $("#scheduler-grid");
    clear(grid);
    const columns = Math.max(1, schedulerResult.cycles);
    grid.style.setProperty("--cycles", String(columns));
    grid.style.minWidth = `${Math.max(820, 210 + columns * 68)}px`;
    grid.appendChild(make("div", "schedule-cell header", "program order"));
    for (let cycle = 0; cycle < columns; cycle += 1) grid.appendChild(make("div", "schedule-cell header", String(cycle + 1)));

    schedulerResult.items.forEach((item, index) => {
      const label = make("div", "schedule-cell instruction", `${index + 1}. ${item.text}${item.missed ? " · L1 miss" : ""}`);
      label.title = item.deps.length ? `True dependency on instruction${item.deps.length > 1 ? "s" : ""} ${item.deps.map((dep) => dep + 1).join(", ")}` : "No true dependency on an earlier result";
      grid.appendChild(label);
      for (let cycle = 0; cycle < columns; cycle += 1) {
        const cell = make("div", "schedule-cell");
        if (cycle === item.issue) {
          const className = schedulerModel === "p6" ? "ooo" : item.slot === "v" ? "v" : item.slot === "u" ? "u" : "";
          cell.className = `schedule-cell slot ${className}`.trim();
          cell.textContent = schedulerModel === "p6" ? `µ${index + 1}` : item.slot === "v" ? "V" : item.slot === "u" ? "U" : "issue";
        } else if (cycle > item.issue && cycle < item.complete) {
          cell.classList.add("slot", schedulerModel === "p6" ? "ooo" : item.slot || "");
          cell.textContent = "run";
        } else if (cycle < item.issue) {
          const readyAt = Math.max(0, ...item.deps.map((dep) => schedulerResult.items[dep].complete));
          if (cycle < readyAt) {
            cell.classList.add("wait");
            cell.textContent = "data";
          } else if (schedulerModel !== "p6") {
            cell.classList.add("stall");
            cell.textContent = "order";
          }
        }
        grid.appendChild(cell);
      }
    });
    return schedulerResult;
  }

  /* ------------------------------------------------------------------
     Branch prediction
  ------------------------------------------------------------------ */

  const branchState = {
    index: 0,
    correct: 0,
    counter: 2,
    last: 0,
    history: 0,
    historyCounters: [2, 2, 2, 2],
    results: []
  };

  function buildBranches() {
    const pattern = $("#branch-pattern");
    Object.entries(DATA.branchPatterns).forEach(([id, item]) => {
      const option = make("option", "", item.label);
      option.value = id;
      pattern.appendChild(option);
    });
    pattern.value = "loop";
    const cpu = $("#branch-cpu");
    DATA.branchCpuPresets.forEach((item) => {
      const option = make("option", "", `${item.label} · ${item.penalty} clocks`);
      option.value = item.id;
      cpu.appendChild(option);
    });
    cpu.value = "p6";
    [pattern, $("#branch-predictor"), cpu].forEach((control) => control.addEventListener("change", resetBranches));
    $("#branch-step").addEventListener("click", stepBranch);
    $("#branch-run").addEventListener("click", () => { for (let count = 0; count < 32; count += 1) stepBranch(false); renderBranches(); });
    $("#branch-reset").addEventListener("click", resetBranches);
    resetBranches();
  }

  function branchPrediction() {
    const predictor = $("#branch-predictor").value;
    if (predictor === "static") return 0;
    if (predictor === "one") return branchState.last;
    if (predictor === "history") return branchState.historyCounters[branchState.history] >= 2 ? 1 : 0;
    return branchState.counter >= 2 ? 1 : 0;
  }

  function updatePredictor(outcome) {
    const predictor = $("#branch-predictor").value;
    if (predictor === "one") branchState.last = outcome;
    if (predictor === "two") branchState.counter = clamp(branchState.counter + (outcome ? 1 : -1), 0, 3);
    if (predictor === "history") {
      const tableIndex = branchState.history;
      branchState.historyCounters[tableIndex] = clamp(branchState.historyCounters[tableIndex] + (outcome ? 1 : -1), 0, 3);
      branchState.history = ((branchState.history << 1) | outcome) & 3;
    }
  }

  function stepBranch(render = true) {
    const pattern = DATA.branchPatterns[$("#branch-pattern").value] || DATA.branchPatterns.loop;
    const outcome = pattern.sequence[branchState.index % pattern.sequence.length];
    const prediction = branchPrediction();
    const correct = prediction === outcome;
    branchState.results.push({ prediction, outcome, correct });
    branchState.index += 1;
    if (correct) branchState.correct += 1;
    updatePredictor(outcome);
    if (render) renderBranches();
    return { prediction, outcome, correct };
  }

  function resetBranches() {
    branchState.index = 0;
    branchState.correct = 0;
    branchState.counter = 2;
    branchState.last = 0;
    branchState.history = 0;
    branchState.historyCounters = [2, 2, 2, 2];
    branchState.results = [];
    renderBranches();
  }

  function renderBranches() {
    const stream = $("#branch-stream");
    clear(stream);
    branchState.results.forEach((result, index) => {
      const bead = make("div", `branch-bead ${result.correct ? "correct" : "wrong"}`);
      bead.title = `Branch ${index + 1}: predicted ${result.prediction ? "taken" : "not taken"}, actually ${result.outcome ? "taken" : "not taken"}`;
      bead.append(make("strong", "", result.outcome ? "T" : "N"), make("small", "", `P:${result.prediction ? "T" : "N"} ${result.correct ? "✓" : "×"}`));
      stream.appendChild(bead);
    });
    if (!branchState.results.length) {
      const empty = make("div", "branch-bead");
      empty.append(make("strong", "", "?"), make("small", "", "next"));
      stream.appendChild(empty);
    }

    const cpu = DATA.branchCpuPresets.find((item) => item.id === $("#branch-cpu").value) || DATA.branchCpuPresets[0];
    setText("#branch-count", branchState.results.length);
    setText("#branch-correct", branchState.correct);
    setText("#branch-accuracy", branchState.results.length ? `${Math.round(branchState.correct / branchState.results.length * 100)}%` : "—");
    setText("#branch-lost", (branchState.results.length - branchState.correct) * cpu.penalty);
    setText("#branch-penalty-note", `${cpu.note} The lost-clock total is mispredictions × ${cpu.penalty}.`);

    const next = branchPrediction();
    setText("#branch-prediction", `Next prediction: ${next ? "T" : "N"}`);
    const last = branchState.results.at(-1);
    setText("#branch-outcome", last ? `${last.correct ? "Correct" : "Mispredict"} · actual ${last.outcome ? "T" : "N"}` : "Waiting");

    const predictor = $("#branch-predictor").value;
    let state = 0;
    let detail = "Always predict not taken; there is no learned state.";
    if (predictor === "one") {
      state = branchState.last ? 3 : 0;
      detail = `One remembered bit: the last outcome was ${branchState.last ? "taken" : "not taken"}.`;
    } else if (predictor === "two") {
      state = branchState.counter;
      detail = ["Strongly not taken", "Weakly not taken", "Weakly taken", "Strongly taken"][state] + "; one contrary result moves only one step.";
    } else if (predictor === "history") {
      state = branchState.historyCounters[branchState.history];
      detail = `Local history ${branchState.history.toString(2).padStart(2, "0")} selects counter ${state.toString(2).padStart(2, "0")}; four counters distinguish recent contexts.`;
    }
    $$("[data-state]", $("#counter-machine")).forEach((node) => node.classList.toggle("is-current", Number(node.dataset.state) === state));
    setText("#predictor-detail", detail);
  }

  /* ------------------------------------------------------------------
     Cache
  ------------------------------------------------------------------ */

  let lastCacheSimulation = null;

  function buildCache() {
    [$("#cache-size"), $("#cache-line"), $("#cache-ways")].forEach((control) => control.addEventListener("change", () => { updateCacheAddress(); runCache(); }));
    $("#cache-address").addEventListener("input", updateCacheAddress);
    $("#cache-pattern").addEventListener("change", runCache);
    $("#cache-stride").addEventListener("input", () => {
      setText("#cache-stride-output", `${$("#cache-stride").value} B`);
      runCache();
    });
    $("#cache-run").addEventListener("click", runCache);
    updateCacheAddress();
    runCache();
  }

  function cacheGeometry() {
    const size = Number($("#cache-size").value);
    const line = Number($("#cache-line").value);
    const ways = Number($("#cache-ways").value);
    const sets = size / (line * ways);
    return { size, line, ways, sets, offsetBits: log2(line), setBits: log2(sets), tagBits: 32 - log2(line) - log2(sets) };
  }

  function parseAddress(raw) {
    const cleaned = String(raw).replace(/^0x/i, "").replace(/[^0-9a-f]/gi, "").slice(-8);
    return cleaned ? parseInt(cleaned, 16) >>> 0 : 0;
  }

  function updateCacheAddress() {
    const geometry = cacheGeometry();
    const address = parseAddress($("#cache-address").value);
    const offsetMask = geometry.line - 1;
    const setMask = geometry.sets - 1;
    const offset = address & offsetMask;
    const set = Math.floor(address / geometry.line) & setMask;
    const tag = Math.floor(address / geometry.line / geometry.sets);
    const binary = address.toString(2).padStart(32, "0");
    const tagText = binary.slice(0, geometry.tagBits);
    const setBitsText = binary.slice(geometry.tagBits, geometry.tagBits + geometry.setBits);
    const offsetText = binary.slice(geometry.tagBits + geometry.setBits);
    const binaryNode = $("#address-binary");
    clear(binaryNode);
    binaryNode.append(
      make("span", "tag-bits-live", tagText),
      document.createTextNode("  "),
      make("span", "set-bits-live", setBitsText),
      document.createTextNode("  "),
      make("span", "offset-bits-live", offsetText)
    );
    setText("#cache-tag", `0x${tag.toString(16).toUpperCase()}`);
    setText("#cache-set", `0x${set.toString(16).toUpperCase()}`);
    setText("#cache-offset", `0x${offset.toString(16).toUpperCase()}`);
    setText("#tag-bits", `${geometry.tagBits} bits`);
    setText("#set-bits", `${geometry.setBits} bits`);
    setText("#offset-bits", `${geometry.offsetBits} bits`);
    setText("#cache-equation", `${geometry.size / 1024} KiB ÷ (${geometry.line} B × ${geometry.ways} ways) = ${geometry.sets} sets`);
    return { ...geometry, address, tag, set, offset };
  }

  function accessPattern(base, geometry) {
    const pattern = $("#cache-pattern").value;
    const stride = Number($("#cache-stride").value);
    const addresses = [];
    for (let index = 0; index < 64; index += 1) {
      let address = base;
      if (pattern === "sequential") address = base + index * 4;
      if (pattern === "stride") address = base + index * stride;
      if (pattern === "conflict") address = base + index * geometry.sets * geometry.line;
      if (pattern === "working") address = base + (index % 16) * 4;
      addresses.push(address >>> 0);
    }
    return addresses;
  }

  function runCache() {
    const geometry = updateCacheAddress();
    const sets = Array.from({ length: geometry.sets }, () => []);
    const addresses = accessPattern(geometry.address, geometry);
    let hits = 0;
    let misses = 0;
    let hotSet = 0;
    const touched = new Set();

    addresses.forEach((address) => {
      const lineAddress = Math.floor(address / geometry.line);
      const setIndex = lineAddress % geometry.sets;
      const tag = Math.floor(lineAddress / geometry.sets);
      hotSet = setIndex;
      touched.add(setIndex);
      const entries = sets[setIndex];
      const hitIndex = entries.indexOf(tag);
      if (hitIndex >= 0) {
        hits += 1;
        entries.splice(hitIndex, 1);
        entries.push(tag);
      } else {
        misses += 1;
        if (entries.length >= geometry.ways) entries.shift();
        entries.push(tag);
      }
    });

    const columnBudget = window.innerWidth <= 430 ? 12 : window.innerWidth <= 860 ? 16 : 32;
    const visible = Math.min(columnBudget, geometry.sets);
    const map = $("#cache-map");
    clear(map);
    map.style.setProperty("--sets-visible", String(visible));
    for (let columnIndex = 0; columnIndex < visible; columnIndex += 1) {
      const start = Math.floor(columnIndex * geometry.sets / visible);
      const end = Math.max(start + 1, Math.floor((columnIndex + 1) * geometry.sets / visible));
      const occupancy = Math.max(...sets.slice(start, end).map((entries) => entries.length), 0);
      const column = make("div", "cache-set-column");
      column.title = visible === geometry.sets ? `Set ${start}: ${occupancy}/${geometry.ways} ways occupied` : `Sets ${start}–${end - 1}: maximum ${occupancy}/${geometry.ways} ways occupied`;
      for (let way = 0; way < geometry.ways; way += 1) {
        const cell = make("div", "cache-way");
        if (way < occupancy) cell.classList.add("filled");
        if (hotSet >= start && hotSet < end && way === occupancy - 1) cell.classList.add("hot");
        column.appendChild(cell);
      }
      map.appendChild(column);
    }

    const amat = (hits * 1 + misses * 20) / Math.max(1, hits + misses);
    setText("#cache-hits", hits);
    setText("#cache-misses", misses);
    setText("#cache-hit-rate", `${Math.round(hits / 64 * 100)}%`);
    setText("#cache-amat", `${amat.toFixed(1)} clocks`);
    lastCacheSimulation = { geometry, sets, hits, misses, amat, touched: touched.size, addresses };
    return lastCacheSimulation;
  }

  /* ------------------------------------------------------------------
     Cycle ledger and workload model
  ------------------------------------------------------------------ */

  let cycleEra = 0;

  function buildCycles() {
    const selector = $("#cycle-selector");
    DATA.cycleFacts.forEach((era, index) => {
      const button = make("button", "", era.cpu);
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(index === 0));
      button.addEventListener("click", () => renderCycleEra(index));
      selector.appendChild(button);
    });
    [$("#workload-cpu"), $("#workload-ilp"), $("#workload-branches"), $("#workload-mispredicts"), $("#workload-misses")].forEach((control) => control.addEventListener("input", renderWorkload));
    renderCycleEra(0);
    renderWorkload();
  }

  function renderCycleEra(index) {
    cycleEra = clamp(index, 0, DATA.cycleFacts.length - 1);
    const era = DATA.cycleFacts[cycleEra];
    $$("button", $("#cycle-selector")).forEach((button, buttonIndex) => button.setAttribute("aria-selected", String(buttonIndex === cycleEra)));
    const content = $("#cycle-content");
    clear(content);
    content.appendChild(make("p", "cycle-source", era.source));
    const grid = make("div", "cycle-fact-grid");
    era.facts.forEach((fact) => {
      const card = make("article", "cycle-fact");
      card.append(make("code", "", fact.instruction), make("strong", "", fact.timing), make("p", "", fact.note));
      grid.appendChild(card);
    });
    content.appendChild(grid);
  }

  const workloadModels = {
    "8086": { name: "8086", serialIpc: 0.18, maxIpc: 0.30, branchPenalty: 12, missPenalty: 16, overlap: 1.0 },
    "486": { name: "486", serialIpc: 0.62, maxIpc: 1.00, branchPenalty: 3, missPenalty: 12, overlap: 0.95 },
    pentium: { name: "Pentium", serialIpc: 0.68, maxIpc: 2.00, branchPenalty: 4, missPenalty: 12, overlap: 0.82 },
    p6: { name: "P6", serialIpc: 0.82, maxIpc: 3.00, branchPenalty: 11, missPenalty: 10, overlap: 0.50 },
    p4: { name: "Pentium 4", serialIpc: 0.72, maxIpc: 3.00, branchPenalty: 20, missPenalty: 10, overlap: 0.56 }
  };

  function renderWorkload() {
    const model = workloadModels[$("#workload-cpu").value] || workloadModels.p6;
    const ilp = Number($("#workload-ilp").value) / 100;
    const branchRate = Number($("#workload-branches").value) / 100;
    const mispredictRate = Number($("#workload-mispredicts").value) / 100;
    const missRate = Number($("#workload-misses").value) / 100;
    setText("#workload-ilp-output", `${Math.round(ilp * 100)}%`);
    setText("#workload-branches-output", `${Math.round(branchRate * 100)}%`);
    setText("#workload-mispredicts-output", `${Math.round(mispredictRate * 100)}%`);
    setText("#workload-misses-output", `${Math.round(missRate * 100)}%`);

    const effectiveIpc = model.serialIpc + (model.maxIpc - model.serialIpc) * Math.pow(ilp, 0.82);
    const useful = 1000 / effectiveIpc;
    const branch = 1000 * branchRate * mispredictRate * model.branchPenalty;
    const overlapFactor = clamp(model.overlap - ilp * (model.name === "P6" || model.name === "Pentium 4" ? 0.28 : 0.08), 0.18, 1);
    const memory = 1000 * missRate * model.missPenalty * overlapFactor;
    const total = Math.round(useful + branch + memory);
    const components = [
      ["Useful issue", useful],
      ["Wrong branches", branch],
      ["Visible misses", memory]
    ];

    setText("#workload-cycles", formatInteger(total));
    $("#workload-gauge-fill").style.height = `${clamp(total / 5000 * 100, 4, 100)}%`;
    const breakdown = $("#workload-breakdown");
    clear(breakdown);
    components.forEach(([label, value]) => {
      const row = make("div", "breakdown-row");
      const bar = make("div", "breakdown-bar");
      const fill = make("i");
      fill.style.width = `${total ? value / total * 100 : 0}%`;
      bar.appendChild(fill);
      row.append(make("span", "", label), bar, make("strong", "", `${formatInteger(Math.round(value))} clk`));
      breakdown.appendChild(row);
    });
    const formula = make("div", "breakdown-row");
    const formulaBar = make("div", "breakdown-bar");
    const formulaFill = make("i");
    formulaFill.style.width = `${clamp(effectiveIpc / model.maxIpc * 100, 0, 100)}%`;
    formulaBar.appendChild(formulaFill);
    formula.append(make("span", "", "Effective IPC"), formulaBar, make("strong", "", effectiveIpc.toFixed(2)));
    breakdown.appendChild(formula);
    return { model, ilp, effectiveIpc, useful, branch, memory, total };
  }

  /* ------------------------------------------------------------------
     Sources
  ------------------------------------------------------------------ */

  function buildSources() {
    const list = $("#source-list");
    clear(list);
    DATA.sources.forEach((source) => {
      const item = make("li");
      const era = make("span", "source-era", source.era);
      const copy = make("div", "source-copy");
      const link = make("a", "", source.title);
      link.href = source.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      copy.append(link, make("p", "", source.use));
      item.append(era, copy);
      list.appendChild(item);
    });
  }

  /* ------------------------------------------------------------------
     Self-test and boot
  ------------------------------------------------------------------ */

  function initialise() {
    buildLineage();
    buildDecoder();
    buildPipeline();
    buildScheduler();
    buildBranches();
    buildCache();
    buildCycles();
    buildSources();

    const hashTab = location.hash.slice(1);
    activateTab(panelNames.includes(hashTab) ? hashTab : "lineage", { updateHash: false });
    document.documentElement.classList.add("is-ready");
    document.documentElement.dataset.appReady = "true";

    window.__X86_APP__ = {
      activateTab,
      setLineage,
      decodeInstruction,
      parseHexBytes,
      renderDecode,
      makePipelineSchedule,
      rebuildPipeline,
      renderScheduler,
      resetBranches,
      stepBranch,
      runCache,
      renderWorkload,
      getState: () => ({ activeTab, lineageIndex, pipelineState, schedulerModel, schedulerResult, branchState, lastCacheSimulation })
    };

    if (new URLSearchParams(location.search).has("selftest")) {
      window.setTimeout(runSelfTest, 120);
    }
  }

  async function runSelfTest() {
    const checks = [];
    const check = (name, condition, detail = "") => checks.push({ name, pass: Boolean(condition), detail });
    try {
      for (const name of panelNames) {
        activateTab(name, { updateHash: false });
        check(`tab:${name}`, !$("#panel-" + name).hidden, "panel became visible");
      }
      setLineage(DATA.generations.length - 1);
      check("lineage:last", $("#chip-name").textContent === "Pentium 4", $("#chip-name").textContent);

      $("#decode-preset").value = "mov32sib";
      $("#decode-preset").dispatchEvent(new Event("change"));
      const decoded = renderDecode();
      check("decode:sib", decoded?.assembly.includes("ECX*4") && decoded?.modrm?.sib, decoded?.assembly || "no result");

      $("#pipeline-cpu").value = "p4";
      $("#pipeline-program").value = "branch";
      $("#pipeline-mispredict").checked = true;
      rebuildPipeline();
      check("pipeline:p4", pipelineState.schedule.maxCycle >= 20 && pipelineState.schedule.rows.some((row) => row.recovery), String(pipelineState.schedule.maxCycle));

      schedulerModel = "p6";
      $$('[data-scheduler-model]').forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.schedulerModel === "p6")));
      $("#scheduler-program").value = "mixed";
      const scheduled = renderScheduler();
      const trueRawHeld = scheduled.items[1].issue >= scheduled.items[0].complete && scheduled.items[2].issue >= scheduled.items[1].complete;
      const independentPassed = scheduled.items[5].issue < scheduled.items[1].issue;
      check("scheduler:true-raw", trueRawHeld, JSON.stringify(scheduled.items.map((item) => ({ issue: item.issue, complete: item.complete, deps: item.deps }))));
      check("scheduler:ooo-pass", independentPassed, JSON.stringify(scheduled.items.map((item) => item.issue)));

      resetBranches();
      for (let index = 0; index < 12; index += 1) stepBranch(false);
      renderBranches();
      check("branches:count", branchState.results.length === 12, String(branchState.results.length));

      $("#cache-pattern").value = "working";
      const cache = runCache();
      check("cache:hits", cache.hits > cache.misses, `${cache.hits}/${cache.misses}`);

      const workload = renderWorkload();
      check("cycles:model", Number.isFinite(workload.total) && workload.total > 0, String(workload.total));

      activateTab("lineage", { updateHash: false });
      await nextFrame();
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      check("layout:no-horizontal-overflow", overflow <= 1, `${overflow}px`);
      check("sources:count", $("#source-list").children.length === DATA.sources.length, String($("#source-list").children.length));
      check("errors:none", selfTestErrors.length === 0, selfTestErrors.join(" | "));
    } catch (error) {
      checks.push({ name: "selftest:exception", pass: false, detail: error.stack || error.message });
    }

    const passed = checks.every((item) => item.pass);
    const result = make("pre");
    result.id = "selftest-result";
    result.dataset.pass = String(passed);
    result.textContent = JSON.stringify({ passed, checks, errors: selfTestErrors }, null, 2);
    result.hidden = true;
    document.body.appendChild(result);
    document.documentElement.dataset.selftest = passed ? "pass" : "fail";
  }

  initialise();
})();
