// ============================================================
// mos-6502 — the page
// ------------------------------------------------------------
// Wiring only. Every number this file displays came out of the
// emulator in cpu.js or the text in content.js; nothing is written
// down here twice. Where an instrument shows a timing diagram, it is
// showing an array of bus cycles that were produced by executing the
// instruction a few milliseconds earlier.
//
// The DOM is built with createElement and textContent throughout —
// no HTML strings, so there is nothing to escape and nothing to get
// wrong.
// ============================================================
(function () {
  "use strict";

  const { OPCODES, MODES, disassemble, hex2, hex4, signed } = window.MOS6502;
  const TEXT = window.SIX502;
  const LAB = window.MOS6502LAB;
  const ASM = window.MOS6502ASM;

  const REDUCED_MOTION = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------
  // Small DOM helpers
  // ---------------------------------------------------------------
  const byId = (id) => document.getElementById(id);
  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function svg(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, String(value));
    return node;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function append(parent, ...children) { for (const child of children) if (child) parent.appendChild(child); }
  function dl(pairs) {
    const list = el("dl");
    for (const [term, value] of pairs) {
      const row = el("div");
      append(row, el("dt", null, term), el("dd", null, value));
      list.appendChild(row);
    }
    return list;
  }
  const bin8 = (n) => (n & 0xff).toString(2).padStart(8, "0");
  const isDummy = (note) => /dummy|ignored|suppressed|never leaves/i.test(note);

  // ---------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------
  const tabs = Array.from(document.querySelectorAll("[data-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));
  const onShow = Object.create(null);

  function showTab(name, options) {
    const opts = options || {};
    for (const tab of tabs) {
      const active = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of panels) {
      const active = panel.dataset.panel === name;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    }
    if (onShow[name]) onShow[name]();
    if (opts.scroll !== false) {
      const nav = document.querySelector(".instrument-nav");
      const top = nav ? nav.getBoundingClientRect().top + window.scrollY : 0;
      window.scrollTo({ top, behavior: REDUCED_MOTION ? "auto" : "smooth" });
    }
    if (opts.focus !== false) {
      const tab = tabs.find((t) => t.dataset.tab === name);
      if (tab) tab.focus({ preventScroll: true });
    }
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
    tab.addEventListener("keydown", (event) => {
      const order = tabs.map((t) => t.dataset.tab);
      const here = order.indexOf(tab.dataset.tab);
      let next = -1;
      if (event.key === "ArrowRight") next = (here + 1) % order.length;
      if (event.key === "ArrowLeft") next = (here - 1 + order.length) % order.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = order.length - 1;
      if (next >= 0) { event.preventDefault(); showTab(order[next]); }
    });
  }
  for (const button of document.querySelectorAll("[data-open-tab]")) {
    button.addEventListener("click", () => showTab(button.dataset.openTab));
  }

  // ---------------------------------------------------------------
  // Hero: a live plot of what the bus is doing, by region of memory
  // ---------------------------------------------------------------
  const LANES = [
    { name: "vectors", test: (a) => a >= 0xfffa },
    { name: "code", test: (a) => a >= 0x0600 && a < 0x0800 },
    { name: "screen", test: (a) => a >= 0x0200 && a < 0x0600 },
    { name: "stack", test: (a) => a >= 0x0100 && a < 0x0200 },
    { name: "page zero", test: (a) => a < 0x0100 },
  ];
  const laneOf = (addr) => {
    for (let i = 0; i < LANES.length; i++) if (LANES[i].test(addr)) return i;
    return 1;
  };

  function startHeroScope() {
    const canvas = byId("hero-canvas");
    const readout = byId("hero-readout");
    const stats = byId("hero-stats");
    if (!canvas || !canvas.getContext) return;
    const context = canvas.getContext("2d");
    const program = TEXT.PROGRAMS.find((p) => p.id === "rainbow") || TEXT.PROGRAMS[0];
    const history = [];
    const WIDTH = canvas.width, HEIGHT = canvas.height;
    const TOP = 26, BOTTOM = HEIGHT - 22;
    const laneY = (lane) => TOP + ((lane + 0.5) * (BOTTOM - TOP)) / LANES.length;

    let machine = null;
    let lastName = "";

    function boot() {
      machine = LAB.load(program.source, {});
      if (!machine.assembled.ok) machine = null;
      history.length = 0;
    }
    boot();
    if (!machine) return;

    function advance(instructions) {
      for (let i = 0; i < instructions; i++) {
        if (machine.cpu.halted || machine.cpu.pc < 0x0600 || machine.cpu.pc > 0x07ff) { boot(); return; }
        const step = machine.cpu.step();
        lastName = step.name;
        for (const cycle of step.trace) {
          history.push({ lane: laneOf(cycle.addr), rw: cycle.rw, addr: cycle.addr, data: cycle.data, first: cycle === step.trace[0] });
        }
      }
      while (history.length > 320) history.shift();
    }

    function draw() {
      context.clearRect(0, 0, WIDTH, HEIGHT);
      context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.textBaseline = "middle";
      for (let lane = 0; lane < LANES.length; lane++) {
        const y = laneY(lane);
        context.strokeStyle = "rgba(126, 152, 190, 0.16)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(74, y + 0.5);
        context.lineTo(WIDTH - 8, y + 0.5);
        context.stroke();
        context.fillStyle = "rgba(150, 173, 206, 0.62)";
        context.fillText(LANES[lane].name, 6, y);
      }
      const step = (WIDTH - 86) / 320;
      for (let i = 0; i < history.length; i++) {
        const entry = history[i];
        const x = 78 + i * step;
        const y = laneY(entry.lane);
        const height = entry.rw === "w" ? 11 : 7;
        context.fillStyle = entry.first ? "rgba(255, 196, 92, 0.95)"
          : entry.rw === "w" ? "rgba(255, 122, 122, 0.85)"
          : "rgba(96, 216, 232, 0.7)";
        context.fillRect(x, y - height / 2, Math.max(1.6, step * 0.7), height);
      }
      const last = history[history.length - 1];
      if (last) {
        readout.textContent = `$${hex4(last.addr)}  ${last.rw === "w" ? "W" : "R"}  $${hex2(last.data)}`;
        stats.textContent = `${lastName} · ${machine.cpu.cycles.toLocaleString()} cycles · ${(machine.cpu.cycles / 1e6).toFixed(2)} seconds at 1 MHz`;
      }
    }

    if (REDUCED_MOTION) {
      advance(400);
      draw();
      return;
    }
    let raf = 0;
    const tick = () => {
      advance(9);
      draw();
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { window.cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) raf = window.requestAnimationFrame(tick);
    });
  }

  // ---------------------------------------------------------------
  // 01 Origins
  // ---------------------------------------------------------------
  function buildOrigins() {
    const track = byId("timeline-track");
    const stops = TEXT.HISTORY;
    let index = 0;

    stops.forEach((stop, i) => {
      const button = el("button", "timeline-stop");
      button.type = "button";
      button.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      append(button, el("span", "stop-year", stop.year), el("span", "stop-dot"));
      button.addEventListener("click", () => select(i));
      track.appendChild(button);
    });

    function select(i) {
      index = Math.max(0, Math.min(stops.length - 1, i));
      const stop = stops[index];
      Array.from(track.children).forEach((child, n) => {
        child.classList.toggle("is-active", n === index);
        child.setAttribute("aria-pressed", n === index ? "true" : "false");
      });
      byId("timeline-selection").textContent = stop.year;
      byId("timeline-headline").textContent = stop.title;
      byId("era-where").textContent = stop.where;
      byId("era-title").textContent = stop.title;
      byId("era-year").textContent = stop.year;
      byId("era-summary").textContent = stop.summary;
      const detail = byId("era-detail");
      clear(detail);
      for (const line of stop.detail) detail.appendChild(el("li", null, line));
      const numbers = byId("era-numbers");
      clear(numbers);
      numbers.appendChild(dl(stop.numbers));
      numbers.firstChild.className = "era-number-grid";
    }

    byId("timeline-prev").addEventListener("click", () => select(index - 1));
    byId("timeline-next").addEventListener("click", () => select(index + 1));
    select(0);

    const list = byId("machine-list");
    let sort = "year";
    function renderMachines() {
      clear(list);
      const rows = TEXT.MACHINES.slice().sort((a, b) => (sort === "mhz" ? b.mhz - a.mhz : 0));
      const fastest = Math.max(...rows.map((m) => m.mhz));
      for (const machine of rows) {
        const item = el("li", "machine");
        const head = el("div", "machine-head");
        append(head,
          el("strong", null, machine.name),
          el("span", "machine-year", machine.year),
        );
        const bar = el("div", "machine-bar");
        const fill = el("span", "machine-bar-fill");
        fill.style.width = `${Math.max(3, (machine.mhz / fastest) * 100)}%`;
        bar.appendChild(fill);
        const meta = el("p", "machine-meta");
        meta.appendChild(el("code", null, machine.chip));
        meta.appendChild(el("span", null, ` ${machine.mhz} MHz`));
        append(item, head, bar, meta, el("p", "machine-note-text", machine.note));
        list.appendChild(item);
      }
    }
    for (const button of document.querySelectorAll("[data-sort]")) {
      button.addEventListener("click", () => {
        sort = button.dataset.sort;
        for (const other of document.querySelectorAll("[data-sort]")) {
          other.classList.toggle("is-active", other === button);
        }
        renderMachines();
      });
    }
    renderMachines();
  }

  // ---------------------------------------------------------------
  // 02 The model
  // ---------------------------------------------------------------
  function buildModel() {
    const rack = byId("register-rack");
    const detail = byId("register-detail");
    TEXT.REGISTERS.forEach((register, i) => {
      const button = el("button", "register-chip");
      button.type = "button";
      button.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      append(button,
        el("strong", null, register.name),
        el("span", "register-bits", `${register.bits} bits`),
        el("span", "register-full", register.full),
      );
      button.addEventListener("click", () => selectRegister(i));
      rack.appendChild(button);
    });
    function selectRegister(i) {
      const register = TEXT.REGISTERS[i];
      Array.from(rack.children).forEach((child, n) => {
        child.classList.toggle("is-active", n === i);
        child.setAttribute("aria-pressed", n === i ? "true" : "false");
      });
      clear(detail);
      const head = el("p", "detail-head");
      append(head, el("strong", null, register.full), el("span", null, ` · ${register.bits} bits`));
      append(detail, head, el("p", null, register.blurb));
      // Which addressing modes can reach this register at all?
      if (register.id === "x" || register.id === "y") {
        const modes = register.id === "x" ? "zero page,X · absolute,X · (indirect,X)" : "zero page,Y · absolute,Y · (indirect),Y";
        append(detail, el("p", "detail-foot", `Indexes with: ${modes}`));
      }
    }
    selectRegister(0);

    const flagRack = byId("flag-rack");
    const flagDetail = byId("flag-detail");
    TEXT.FLAGS.forEach((flag, i) => {
      const button = el("button", "flag-chip");
      button.type = "button";
      if (flag.letter === "-") button.classList.add("is-nothing");
      if (flag.letter === "B") button.classList.add("is-phantom");
      append(button,
        el("span", "flag-bit", flag.bit),
        el("strong", null, flag.letter),
      );
      button.title = flag.name;
      button.addEventListener("click", () => selectFlag(i));
      flagRack.appendChild(button);
    });
    function selectFlag(i) {
      const flag = TEXT.FLAGS[i];
      Array.from(flagRack.children).forEach((child, n) => child.classList.toggle("is-active", n === i));
      clear(flagDetail);
      const head = el("p", "detail-head");
      append(head, el("strong", null, `bit ${flag.bit} · ${flag.name}`));
      append(flagDetail, head, el("p", null, flag.blurb));
    }
    selectFlag(7);

    const map = byId("memory-map");
    const mapDetail = byId("map-detail");
    TEXT.MEMORY_MAP.forEach((region, i) => {
      const size = region.to - region.from + 1;
      const button = el("button", "map-region");
      button.type = "button";
      // A log scale, or page zero would be a hairline next to 62K of "yours".
      button.style.flexGrow = String(Math.log2(size));
      append(button,
        el("span", "map-name", region.name),
        el("span", "map-range", `$${hex4(region.from)}–$${hex4(region.to)}`),
        el("span", "map-size", size >= 1024 ? `${Math.round(size / 1024)}K` : `${size} B`),
      );
      button.addEventListener("click", () => selectRegion(i));
      map.appendChild(button);
    });
    function selectRegion(i) {
      const region = TEXT.MEMORY_MAP[i];
      Array.from(map.children).forEach((child, n) => child.classList.toggle("is-active", n === i));
      clear(mapDetail);
      const head = el("p", "detail-head");
      append(head, el("strong", null, region.name), el("code", null, `$${hex4(region.from)}–$${hex4(region.to)}`));
      append(mapDetail, head, el("p", null, region.blurb));
    }
    selectRegion(0);
  }

  // ---------------------------------------------------------------
  // 03 Cycles — the timing diagram
  // ---------------------------------------------------------------
  const cycles = { entry: null, step: null, index: 0, playing: false, timer: 0, highlight: true };

  function buildCycles() {
    const picker = byId("cycle-picker");
    TEXT.CYCLE_TRACES.forEach((entry, i) => {
      const button = el("button", "chip");
      button.type = "button";
      button.textContent = entry.label;
      button.addEventListener("click", () => selectTrace(i));
      picker.appendChild(button);
    });

    function selectTrace(i) {
      const entry = TEXT.CYCLE_TRACES[i];
      Array.from(picker.children).forEach((child, n) => child.classList.toggle("is-active", n === i));
      loadTrace(entry);
    }

    byId("cycle-prev").addEventListener("click", () => { stopPlaying(); setCycle(cycles.index - 1); });
    byId("cycle-next").addEventListener("click", () => { stopPlaying(); setCycle(cycles.index + 1); });
    byId("cycle-play").addEventListener("click", togglePlay);
    byId("cycle-dummies").addEventListener("change", (event) => {
      cycles.highlight = event.target.checked;
      byId("timing-diagram").classList.toggle("hide-dummies", !cycles.highlight);
    });

    selectTrace(3);   // the page-crossing read: the most instructive one

    // The clock-speed thought experiment in the same section.
    const slider = byId("budget-mhz");
    const readout = byId("budget-readout");
    const note = byId("budget-note");
    function renderBudget() {
      const mhz = Number(slider.value) / 10;   // 0.1 MHz steps
      const instructions = Math.round((mhz * 1e6) / 3);
      readout.textContent = `${mhz.toFixed(1)} MHz`;
      note.textContent = `About ${instructions.toLocaleString()} instructions a second, and ${Math.round((mhz * 1e6) / 1024 / 60).toLocaleString()} full sweeps of a 1K screen per minute — if the program did nothing but store bytes.`;
    }
    slider.addEventListener("input", renderBudget);
    renderBudget();
  }

  function loadTrace(entry) {
    const result = LAB.runSnippet(entry);
    if (!result.ok) return;
    cycles.entry = entry;
    cycles.step = result.step;
    byId("cycle-instruction").textContent = entry.display || entry.sample;
    const bytes = result.step.op ? result.step.op.bytes : 1;
    const encoding = [];
    for (let i = 0; i < bytes; i++) encoding.push(`$${hex2(result.cpu.peek(result.step.pc + i))}`);
    byId("cycle-encoding").textContent = `${encoding.join(" ")} · ${MODES[result.step.op.mode].label}`;
    byId("cycle-total").textContent = String(result.step.cycles);
    renderTimingDiagram();
    setCycle(0);
  }

  function renderTimingDiagram() {
    const host = byId("timing-diagram");
    clear(host);
    host.classList.toggle("hide-dummies", !cycles.highlight);
    cycles.step.trace.forEach((cycle, i) => {
      const cell = el("button", "cycle-cell");
      cell.type = "button";
      cell.classList.add(cycle.rw === "w" ? "is-write" : "is-read");
      if (i === 0) cell.classList.add("is-fetch");
      if (isDummy(cycle.note)) cell.classList.add("is-dummy");
      append(cell,
        el("span", "cycle-index", `T${i + 1}`),
        el("span", "cycle-rw", cycle.rw === "w" ? "W" : "R"),
        el("span", "cycle-addr", hex4(cycle.addr)),
        el("span", "cycle-data", hex2(cycle.data)),
      );
      cell.addEventListener("click", () => { stopPlaying(); setCycle(i); });
      host.appendChild(cell);
    });
  }

  function setCycle(index) {
    const trace = cycles.step.trace;
    cycles.index = ((index % trace.length) + trace.length) % trace.length;
    const cycle = trace[cycles.index];
    const host = byId("timing-diagram");
    Array.from(host.children).forEach((child, n) => child.classList.toggle("is-current", n === cycles.index));
    const current = host.children[cycles.index];
    if (current && current.scrollIntoView) current.scrollIntoView({ block: "nearest", inline: "nearest" });
    byId("bus-address").textContent = `$${hex4(cycle.addr)}`;
    byId("bus-data").textContent = `$${hex2(cycle.data)}`;
    byId("bus-rw").textContent = cycle.rw === "w" ? "low — writing" : "high — reading";
    byId("bus-rw").className = `bus-value ${cycle.rw === "w" ? "is-write" : "is-read"}`;
    const note = byId("cycle-note");
    clear(note);
    append(note,
      el("strong", null, `Cycle ${cycles.index + 1} of ${trace.length}: `),
      document.createTextNode(cycle.note),
    );
    if (cycles.index === trace.length - 1 && cycles.entry && cycles.entry.note) {
      note.appendChild(el("span", "cycle-moral", cycles.entry.note));
    }
  }

  function togglePlay() {
    if (cycles.playing) { stopPlaying(); return; }
    cycles.playing = true;
    byId("cycle-play").textContent = "Pause";
    const tick = () => {
      if (!cycles.playing) return;
      const last = cycles.index === cycles.step.trace.length - 1;
      setCycle(cycles.index + 1);
      cycles.timer = window.setTimeout(tick, last ? 1400 : 720);
    };
    cycles.timer = window.setTimeout(tick, 720);
  }
  function stopPlaying() {
    cycles.playing = false;
    window.clearTimeout(cycles.timer);
    const button = byId("cycle-play");
    if (button) button.textContent = "Play";
  }

  // ---------------------------------------------------------------
  // 04 Addressing — the pointer chase
  // ---------------------------------------------------------------
  function buildAddressing() {
    const picker = byId("mode-picker");
    TEXT.ADDRESSING.forEach((entry, i) => {
      const button = el("button", "chip");
      button.type = "button";
      button.textContent = MODES[entry.mode].label;
      button.addEventListener("click", () => selectMode(i));
      picker.appendChild(button);
    });

    function selectMode(i) {
      const entry = TEXT.ADDRESSING[i];
      Array.from(picker.children).forEach((child, n) => child.classList.toggle("is-active", n === i));
      const result = LAB.runSnippet(entry);
      if (!result.ok) return;
      byId("mode-name").textContent = MODES[entry.mode].label;
      byId("mode-sample").textContent = entry.sample;
      byId("mode-cost").textContent = entry.cost;
      byId("mode-why").textContent = entry.why;
      renderChase(entry, result);
      renderTraceTable(byId("mode-trace"), result.step.trace);
      byId("mode-trace-caption").textContent =
        `The bus, cycle by cycle — ${result.step.cycles} cycles for this run`;
    }
    selectMode(TEXT.ADDRESSING.findIndex((entry) => entry.mode === "abx"));
  }

  function renderTraceTable(tbody, trace) {
    clear(tbody);
    trace.forEach((cycle, i) => {
      const row = el("tr");
      if (isDummy(cycle.note)) row.className = "is-dummy";
      const index = el("th", null, `T${i + 1}`);
      index.scope = "row";
      append(row, index,
        el("td", "mono", `$${hex4(cycle.addr)}`),
        el("td", "mono", cycle.rw === "w" ? "W" : "R"),
        el("td", "mono", `$${hex2(cycle.data)}`),
        el("td", null, cycle.note),
      );
      tbody.appendChild(row);
    });
  }

  // Build the address computation as a chain of steps, reading the real
  // values out of the trace rather than recomputing them here.
  function chaseSteps(entry, result) {
    const { step, cpu } = result;
    const trace = step.trace;
    const operand = (i) => cpu.peek(step.pc + 1 + i);
    const dataCycle = trace[trace.length - 1];
    const mode = entry.mode;
    const chain = [];
    const add = (kind, label, value, note) => chain.push({ kind, label, value, note });

    add("opcode", "opcode", `$${hex2(trace[0].data)}`, step.op.name);

    switch (mode) {
      case "imp":
        add("reg", "no operand", "—", "the second cycle fetches the next byte and discards it");
        add("result", "result", `X = $${hex2(cpu.x)}`, "computed inside the chip");
        break;
      case "acc":
        add("reg", "operand", "A", "the accumulator itself");
        add("result", "result", `A = $${hex2(cpu.a)}`, "no memory touched at all");
        break;
      case "imm":
        add("byte", "operand byte", `$${hex2(operand(0))}`, "this IS the value");
        add("result", "into A", `$${hex2(cpu.a)}`, null);
        break;
      case "zp":
        add("byte", "operand byte", `$${hex2(operand(0))}`, "one byte, so page zero");
        add("addr", "address", `$${hex4(operand(0))}`, "high byte is implied zero");
        add("data", "data", `$${hex2(dataCycle.data)}`, null);
        break;
      case "zpx":
      case "zpy": {
        const index = mode === "zpx" ? cpu.x : cpu.y;
        add("byte", "base", `$${hex2(operand(0))}`, null);
        add("index", mode === "zpx" ? "+ X" : "+ Y", `$${hex2(index)}`, null);
        add("addr", "address", `$${hex4((operand(0) + index) & 0xff)}`, "wrapped inside page zero — the high byte is never computed");
        add("data", "data", `$${hex2(dataCycle.data)}`, null);
        break;
      }
      case "abs":
        add("byte", "low byte", `$${hex2(operand(0))}`, "little-endian: low first");
        add("byte", "high byte", `$${hex2(operand(1))}`, null);
        add("addr", "address", `$${hex4(operand(0) | (operand(1) << 8))}`, null);
        add("data", "data", `$${hex2(dataCycle.data)}`, null);
        break;
      case "abx":
      case "aby": {
        const base = operand(0) | (operand(1) << 8);
        const index = mode === "abx" ? cpu.x : cpu.y;
        const effective = (base + index) & 0xffff;
        add("addr", "base", `$${hex4(base)}`, null);
        add("index", mode === "abx" ? "+ X" : "+ Y", `$${hex2(index)}`, null);
        if ((base & 0xff00) !== (effective & 0xff00)) {
          add("wrong", "first guess", `$${hex4((base & 0xff00) | (effective & 0xff))}`, "read, and discarded: the carry was not known yet");
        }
        add("addr", "address", `$${hex4(effective)}`, null);
        add("data", "data", `$${hex2(dataCycle.data)}`, null);
        break;
      }
      case "ind": {
        const pointer = operand(0) | (operand(1) << 8);
        add("addr", "pointer", `$${hex4(pointer)}`, null);
        add("addr", "low from", `$${hex4(pointer)}`, `= $${hex2(trace[3].data)}`);
        add("wrong", "high from", `$${hex4((pointer & 0xff00) | ((pointer + 1) & 0xff))}`, `= $${hex2(trace[4].data)} — the page never carries`);
        add("result", "jumps to", `$${hex4(cpu.pc)}`, null);
        break;
      }
      case "izx": {
        const base = operand(0);
        const pointer = (base + cpu.x) & 0xff;
        add("byte", "base", `$${hex2(base)}`, null);
        add("index", "+ X", `$${hex2(cpu.x)}`, "selects WHICH pointer");
        add("addr", "pointer at", `$${hex4(pointer)}`, "in page zero, wrapped");
        add("addr", "address", `$${hex4(cpu.peek(pointer) | (cpu.peek((pointer + 1) & 0xff) << 8))}`, null);
        add("data", "data", `$${hex2(dataCycle.data)}`, null);
        break;
      }
      case "izy": {
        const base = operand(0);
        const pointer = cpu.peek(base) | (cpu.peek((base + 1) & 0xff) << 8);
        const effective = (pointer + cpu.y) & 0xffff;
        add("byte", "pointer at", `$${hex2(base)}`, "always page zero");
        add("addr", "pointer", `$${hex4(pointer)}`, "fetched from memory");
        add("index", "+ Y", `$${hex2(cpu.y)}`, "indexes AFTER the pointer");
        if ((pointer & 0xff00) !== (effective & 0xff00)) {
          add("wrong", "first guess", `$${hex4((pointer & 0xff00) | (effective & 0xff))}`, "read, and discarded");
        }
        add("addr", "address", `$${hex4(effective)}`, null);
        add("data", "data", `$${hex2(dataCycle.data)}`, null);
        break;
      }
      case "rel": {
        const offset = signed(operand(0));
        add("byte", "displacement", `${offset >= 0 ? "+" : ""}${offset}`, `stored as $${hex2(operand(0))}`);
        add("addr", "from", `$${hex4(step.pc + 2)}`, "the address of the NEXT instruction");
        add("result", "to", `$${hex4(cpu.pc)}`, step.cycles > 2 ? "taken" : "not taken — the flag said no");
        break;
      }
      default: break;
    }
    return chain;
  }

  function renderChase(entry, result) {
    const host = byId("mode-chase");
    clear(host);
    const chain = chaseSteps(entry, result);
    chain.forEach((node, i) => {
      if (i > 0) host.appendChild(el("span", "chase-arrow", "→"));
      const box = el("div", `chase-node chase-${node.kind}`);
      append(box,
        el("span", "chase-label", node.label),
        el("strong", "chase-value", node.value),
      );
      if (node.note) box.appendChild(el("span", "chase-note", node.note));
      host.appendChild(box);
    });
  }

  // ---------------------------------------------------------------
  // 05 The ALU — the byte as a circle
  // ---------------------------------------------------------------
  function buildAlu() {
    const inputs = ["alu-a", "alu-m", "alu-carry-in", "alu-decimal", "alu-subtract"].map(byId);
    for (const input of inputs) input.addEventListener("input", render);
    for (const input of inputs) input.addEventListener("change", render);

    function render() {
      const a = Number(byId("alu-a").value) & 0xff;
      const m = Number(byId("alu-m").value) & 0xff;
      const carryIn = byId("alu-carry-in").checked ? 1 : 0;
      const decimal = byId("alu-decimal").checked;
      const subtract = byId("alu-subtract").checked;

      byId("alu-a-out").textContent = `$${hex2(a)}`;
      byId("alu-m-out").textContent = `$${hex2(m)}`;

      // Run it on the real ALU rather than reimplementing it here.
      const source = [
        decimal ? "SED" : "CLD",
        subtract ? (carryIn ? "SEC" : "CLC") : (carryIn ? "SEC" : "CLC"),
        `LDA #$${hex2(a)}`,
        `${subtract ? "SBC" : "ADC"} #$${hex2(m)}`,
      ].join("\n");
      const machine = LAB.load(source, {});
      machine.cpu.run(40);
      const cpu = machine.cpu;
      const result = cpu.a;

      renderSum(a, m, carryIn, subtract, decimal, cpu);
      renderFlags(cpu);
      renderCircle(a, m, carryIn, subtract, result, cpu);
      renderVerdict(a, m, subtract, decimal, result, cpu);
    }

    function renderSum(a, m, carryIn, subtract, decimal, cpu) {
      const host = byId("alu-sum");
      clear(host);
      const table = el("table", "sum-table");
      const body = el("tbody");
      const row = (label, value, extra) => {
        const tr = el("tr");
        const th = el("th", null, label);
        th.scope = "row";
        append(tr, th,
          el("td", "mono", value === null ? "" : `$${hex2(value)}`),
          el("td", "mono bits", value === null ? "" : bin8(value)),
          el("td", "mono", value === null ? "" : String(value)),
          el("td", "mono signed", value === null ? "" : String(signed(value))),
        );
        if (extra) tr.className = extra;
        return tr;
      };
      append(body,
        row("A", a),
        row(subtract ? "− operand" : "+ operand", m),
      );
      const carryRow = el("tr");
      const carryHead = el("th", null, subtract ? "− borrow" : "+ carry");
      carryHead.scope = "row";
      append(carryRow, carryHead,
        el("td", "mono", subtract ? String(1 - carryIn) : String(carryIn)),
        el("td", null, ""), el("td", null, ""), el("td", null, ""));
      body.appendChild(carryRow);
      body.appendChild(row("= result", cpu.a, "is-result"));
      const head = el("thead");
      const headRow = el("tr");
      append(headRow, el("th", null, ""), el("th", null, "hex"), el("th", null, "binary"), el("th", null, "unsigned"), el("th", null, "signed"));
      head.appendChild(headRow);
      append(table, head, body);
      host.appendChild(table);
      if (decimal) {
        host.appendChild(el("p", "sum-decimal",
          `Decimal mode: read each byte as two digits. ${hex2(a)} ${subtract ? "−" : "+"} ${hex2(m)} = ${cpu.c && !subtract ? "1" : ""}${hex2(cpu.a)}.`));
      }
    }

    function renderFlags(cpu) {
      const host = byId("alu-flags");
      clear(host);
      for (const [letter, value, name] of [["N", cpu.n, "negative"], ["V", cpu.v, "overflow"], ["Z", cpu.z, "zero"], ["C", cpu.c, "carry"]]) {
        const chip = el("div", `alu-flag ${value ? "is-set" : ""}`);
        append(chip, el("strong", null, letter), el("span", null, value ? "1" : "0"), el("span", "alu-flag-name", name));
        host.appendChild(chip);
      }
    }

    // The circle. 256 positions, and TWO walks around it.
    //
    // Reading the operand as unsigned, $90 is +144 steps clockwise.
    // Reading it as signed, the same byte is 112 steps anticlockwise.
    // Both land on the same square — that is what "the same byte" means
    // — but they take different routes, and each route has its own seam:
    // $FF/$00 for the unsigned walk (carry), $7F/$80 for the signed one
    // (overflow). Draw both and the two flags stop being arbitrary.
    function renderCircle(a, m, carryIn, subtract, result, cpu) {
      const host = byId("alu-circle");
      clear(host);
      // A generous viewBox: the dot labels sit outside the ring, so the
      // margin has to hold them wherever on the circle they land.
      const S = 340, R = 104, CX = S / 2, CY = S / 2;
      const root = svg("svg", { viewBox: `0 0 ${S} ${S}`, class: "alu-svg", role: "presentation" });
      const angle = (v) => ((v / 256) * 2 * Math.PI) - Math.PI / 2;
      const point = (v, radius) => [CX + Math.cos(angle(v)) * radius, CY + Math.sin(angle(v)) * radius];

      root.appendChild(svg("circle", { cx: CX, cy: CY, r: R, class: "alu-ring" }));

      for (let v = 0; v < 256; v += 16) {
        const [x1, y1] = point(v, R - 6);
        const [x2, y2] = point(v, R + 6);
        root.appendChild(svg("line", { x1, y1, x2, y2, class: "alu-tick" }));
        // Only $40 and $C0 get a value label: $00 and $80 are where the
        // seams are, and their names say more than their values do.
        if (v === 64 || v === 192) {
          const [lx, ly] = point(v, R + 22);
          const label = svg("text", { x: lx, y: ly, class: "alu-tick-label", "text-anchor": "middle", "dominant-baseline": "middle" });
          label.textContent = `$${hex2(v)}`;
          root.appendChild(label);
        }
      }

      const seam = (v, className, text) => {
        const [x1, y1] = point(v, R - 46);
        const [x2, y2] = point(v, R + 12);
        root.appendChild(svg("line", { x1, y1, x2, y2, class: `alu-seam ${className}` }));
        const [tx, ty] = point(v, R + 26);
        const label = svg("text", { x: tx, y: ty, class: `alu-seam-label ${className}`, "text-anchor": "middle", "dominant-baseline": "middle" });
        label.textContent = text;
        root.appendChild(label);
      };
      seam(0, "is-carry", "$FF / $00");
      seam(128, "is-overflow", "$7F / $80");

      const borrow = 1 - carryIn;
      const unsignedWalk = subtract ? -(m + borrow) : (m + carryIn);
      const signedWalk = subtract ? -(signed(m) + borrow) : (signed(m) + carryIn);
      const together = unsignedWalk === signedWalk;

      const walk = (distance, radius, className) => {
        const steps = Math.abs(distance);
        if (steps === 0) return;
        const path = svg("path", { class: `alu-walk ${className}`, fill: "none" });
        const [sx, sy] = point(a, radius);
        const parts = [`M ${sx} ${sy}`];
        for (let i = 1; i <= steps; i++) {
          const [px, py] = point(a + (distance > 0 ? i : -i), radius);
          parts.push(`L ${px} ${py}`);
        }
        path.setAttribute("d", parts.join(" "));
        root.appendChild(path);
      };

      if (together) {
        walk(unsignedWalk, R - 30, `is-both ${cpu.c || cpu.v ? "is-crossed" : ""}`);
      } else {
        walk(unsignedWalk, R - 18, `is-unsigned ${cpu.c ? "is-crossed" : ""}`);
        walk(signedWalk, R - 44, `is-signed ${cpu.v ? "is-crossed" : ""}`);
      }

      const dot = (v, className, text) => {
        const [x, y] = point(v, R - 30);
        root.appendChild(svg("circle", { cx: x, cy: y, r: 6, class: `alu-dot ${className}` }));
        const [lx, ly] = point(v, R + 38);
        const label = svg("text", { x: lx, y: ly, class: `alu-dot-label ${className}`, "text-anchor": "middle", "dominant-baseline": "middle" });
        label.textContent = text;
        root.appendChild(label);
      };
      dot(a, "is-start", `A $${hex2(a)}`);
      dot(result, "is-end", `$${hex2(result)}`);

      const centre = svg("text", { x: CX, y: CY - 6, class: "alu-centre", "text-anchor": "middle" });
      centre.textContent = `$${hex2(a)} ${subtract ? "\u2212" : "+"} $${hex2(m)}`;
      const centre2 = svg("text", { x: CX, y: CY + 16, class: "alu-centre-sub", "text-anchor": "middle" });
      centre2.textContent = `= $${hex2(result)}`;
      append(root, centre, centre2);
      host.appendChild(root);

      const key = byId("alu-circle-key");
      clear(key);
      if (together) {
        const item = el("span", "walk-key is-both");
        item.textContent = `both walks: ${unsignedWalk >= 0 ? "+" : ""}${unsignedWalk} — the operand's top bit is clear, so signed and unsigned agree on how far to go`;
        key.appendChild(item);
      } else {
        const one = el("span", "walk-key is-unsigned");
        one.textContent = `unsigned: ${unsignedWalk >= 0 ? "+" : ""}${unsignedWalk}`;
        const two = el("span", "walk-key is-signed");
        two.textContent = `signed: ${signedWalk >= 0 ? "+" : ""}${signedWalk}`;
        append(key, one, two);
      }

      byId("alu-circle-caption").textContent = together
        ? `One walk, because $${hex2(m)} means the same number either way. It lands on $${hex2(result)}; the flags say which seams it went past.`
        : `Two walks, because $${hex2(m)} is ${m} unsigned and ${signed(m)} signed. They set off in opposite directions and land on the same square — $${hex2(result)}.`;
    }

    function renderVerdict(a, m, subtract, decimal, result, cpu) {
      const host = byId("alu-verdict");
      const sentences = [];
      if (subtract) {
        sentences.push(cpu.c
          ? "The unsigned walk did not reach the $FF/$00 seam, so the carry stays set — which on this chip means no borrow was needed."
          : "The unsigned walk crossed the $FF/$00 seam, so a borrow was needed and the carry is clear: A was below the operand.");
      } else {
        sentences.push(cpu.c
          ? "The unsigned walk crossed the $FF/$00 seam, so the carry is set: as unsigned numbers the answer is 256 too small, and the carry is the missing bit 8."
          : "The unsigned walk never reached the $FF/$00 seam, so the carry is clear and the unsigned answer is exact.");
      }
      sentences.push(cpu.v
        ? `The signed walk crossed the $7F/$80 seam, so V is set: read as signed, ${signed(a)} ${subtract ? "\u2212" : "+"} ${signed(m)} should be ${subtract ? signed(a) - signed(m) : signed(a) + signed(m)}, and a byte can only say ${signed(result)}.`
        : "The signed walk stayed clear of the $7F/$80 seam, so V is clear and the signed answer is right too.");
      if (decimal) sentences.push("In decimal mode, ignore N, V and Z entirely: on the NMOS part they were set from the binary arithmetic underneath, before the decimal correction ran.");
      host.textContent = sentences.join(" ");
    }

    render();
  }

  // ---------------------------------------------------------------
  // 06 The matrix
  // ---------------------------------------------------------------
  const GROUP_ORDER = ["load", "store", "transfer", "stack", "logic", "arithmetic", "shift", "inc/dec", "branch", "jump", "flags", "system", "undocumented"];
  const FIELD_NAMES = {
    0: "cc = 00 · control, branches, flags",
    1: "cc = 01 · the accumulator group",
    2: "cc = 10 · shifts, increments, X",
    3: "cc = 11 · nobody's group — both of the others answer at once",
  };
  const VIEW_TEXT = {
    group: "Instructions of a kind sit together because the decode logic groups them, not because a table was tidied. The whole right-hand half of most rows is one addressing mode.",
    fields: "Read an opcode as aaabbbcc. The bottom two bits pick a family, the middle three pick an addressing mode, and the top three pick the operation within the family. The eight instructions of the cc=01 family — ORA, AND, EOR, ADC, STA, LDA, CMP, SBC — are just aaa counting from 0 to 7, and column $x1 is one addressing mode all the way down. The cc=11 column is the giveaway: nothing was ever assigned there, so both of the other families' control lines match at once, and two instructions run in the cycles of one. That is the entire explanation of the undocumented opcodes.",
    cycles: "Two cycles is the floor — an opcode fetch and the byte after it. Seven is the documented ceiling, reached by an indexed read-modify-write that pays a dummy read and a dummy write in the same instruction. The undocumented combinations reach eight.",
    legal: "151 documented, 105 not. The undefined ones are not evenly scattered: they fill the columns the decode matrix never claimed, which is why they cluster.",
  };

  function buildMatrix() {
    const grid = byId("opcode-matrix");
    const detail = byId("matrix-detail");
    let view = "group";

    // Header row.
    grid.appendChild(el("span", "matrix-corner", ""));
    for (let low = 0; low < 16; low++) grid.appendChild(el("span", "matrix-head", `x${low.toString(16).toUpperCase()}`));

    const cells = [];
    for (let high = 0; high < 16; high++) {
      grid.appendChild(el("span", "matrix-head", `${high.toString(16).toUpperCase()}x`));
      for (let low = 0; low < 16; low++) {
        const code = (high << 4) | low;
        const op = OPCODES[code];
        const cell = el("button", "matrix-cell");
        cell.type = "button";
        cell.dataset.code = String(code);
        append(cell, el("span", "cell-name", op.name), el("span", "cell-mode", MODES[op.mode].syntax || "—"));
        cell.addEventListener("mouseenter", () => describe(code));
        cell.addEventListener("focus", () => describe(code));
        cell.addEventListener("click", () => {
          describe(code);
          traceOpcode(code);
        });
        grid.appendChild(cell);
        cells.push(cell);
      }
    }

    function paint() {
      for (const cell of cells) {
        const code = Number(cell.dataset.code);
        const op = OPCODES[code];
        cell.className = "matrix-cell";
        if (view === "group") cell.classList.add(`g-${op.group.replace(/[^a-z]/g, "")}`);
        else if (view === "fields") cell.classList.add(`f-${code & 3}`);
        else if (view === "cycles") cell.classList.add(`c-${Math.min(8, op.cycles)}`);
        else cell.classList.add(op.illegal ? "l-no" : "l-yes");
        if (op.unstable) cell.classList.add("is-unstable");
      }
      renderLegend();
      byId("matrix-explainer").textContent = VIEW_TEXT[view];
    }

    function renderLegend() {
      const host = byId("matrix-legend");
      clear(host);
      const entries = view === "group" ? GROUP_ORDER.map((g) => [`g-${g.replace(/[^a-z]/g, "")}`, g])
        : view === "fields" ? [0, 1, 2, 3].map((n) => [`f-${n}`, FIELD_NAMES[n]])
        : view === "cycles" ? [2, 3, 4, 5, 6, 7, 8].map((n) => [`c-${n}`, `${n} cycles`])
        : [["l-yes", "documented (151)"], ["l-no", "undefined (105)"]];
      for (const [className, label] of entries) {
        const item = el("span", "legend-item");
        append(item, el("i", `swatch ${className}`), document.createTextNode(label));
        host.appendChild(item);
      }
    }

    function describe(code) {
      const op = OPCODES[code];
      clear(detail);
      const head = el("div", "detail-row");
      append(head,
        el("code", "detail-code", `$${hex2(code)}`),
        el("strong", "detail-name", op.name),
        el("span", "detail-mode", MODES[op.mode].label),
      );
      if (op.illegal) head.appendChild(el("span", "tag tag-illegal", op.unstable ? "undocumented · unstable" : "undocumented"));
      const stats = el("p", "detail-stats");
      stats.textContent = `${op.bytes} byte${op.bytes === 1 ? "" : "s"} · ${op.cycles} cycles${op.pageCross ? " (+1 across a page)" : ""}${op.mode === "rel" ? " (+1 if taken, +2 if it leaves the page)" : ""} · binary ${bin8(code)}`;
      const words = el("p", "detail-words", TEXT.INSTRUCTIONS[op.name] || "");
      const fields = el("p", "detail-fields");
      fields.textContent = `aaa = ${(code >> 5) & 7}, bbb = ${(code >> 2) & 7}, cc = ${code & 3} — ${FIELD_NAMES[code & 3]}`;
      const trace = el("button", "text-button");
      trace.type = "button";
      trace.textContent = "Trace this one, cycle by cycle →";
      trace.addEventListener("click", () => { traceOpcode(code); showTab("cycles"); });
      append(detail, head, stats, words, fields, trace);
    }

    for (const button of document.querySelectorAll("[data-view]")) {
      button.addEventListener("click", () => {
        view = button.dataset.view;
        for (const other of document.querySelectorAll("[data-view]")) other.classList.toggle("is-active", other === button);
        paint();
      });
    }
    paint();
    describe(0xbd);
  }

  // Trace an arbitrary opcode in the cycle instrument. The bytes are laid
  // down directly, so undocumented opcodes with no assembler syntax work
  // exactly like documented ones.
  function traceOpcode(code) {
    const op = OPCODES[code];
    const operands = [0x40, 0x03].slice(0, op.bytes - 1);
    const bytes = [code, ...operands];
    const entry = {
      display: `${disassemble((a) => bytes[a - 0x0600] === undefined ? 0 : bytes[a - 0x0600], 0x0600).text}`,
      sample: `  .byte ${bytes.map((b) => `$${hex2(b)}`).join(", ")}`,
      vectors: { irq: 0x9000, nmi: 0x9100 },
      setup: {
        a: 0x5a, x: 0x04, y: 0x04, s: 0xfd, c: 1,
        mem: {
          0x0040: 0x50, 0x0041: 0x03, 0x0044: 0x50, 0x0045: 0x03,
          0x0340: 0x81, 0x0350: 0x81, 0x0354: 0x81, 0x0344: 0x81,
          0x01fe: 0x02, 0x01ff: 0x06,
        },
      },
    };
    Array.from(byId("cycle-picker").children).forEach((child) => child.classList.remove("is-active"));
    loadTrace(entry);
  }

  // ---------------------------------------------------------------
  // 07 The machine
  // ---------------------------------------------------------------
  const SPEEDS = [0, 400, 2_000, 12_000, 60_000, 250_000, 900_000, 3_000_000];
  const SPEED_NAMES = ["", "crawl", "slow", "steady", "1 MHz-ish", "fast", "faster", "flat out"];
  const machine = { cpu: null, assembled: null, running: false, raf: 0, rng: 0x2c9e, key: 0, base: 0x0000, dirty: true };

  function buildMachine() {
    const editor = byId("editor");
    const picker = byId("program-picker");

    TEXT.PROGRAMS.forEach((program, i) => {
      const button = el("button", "chip");
      button.type = "button";
      button.textContent = program.name;
      button.addEventListener("click", () => loadProgram(i));
      picker.appendChild(button);
    });

    function loadProgram(i) {
      const program = TEXT.PROGRAMS[i];
      Array.from(picker.children).forEach((child, n) => child.classList.toggle("is-active", n === i));
      editor.value = program.source;
      byId("program-blurb").textContent = program.blurb;
      assembleNow();
    }

    byId("btn-assemble").addEventListener("click", assembleNow);
    byId("btn-run").addEventListener("click", toggleRun);
    byId("btn-step").addEventListener("click", () => { stopRun(); stepOnce(); renderMachine(); });
    byId("btn-reset").addEventListener("click", () => { stopRun(); assembleNow(); });
    editor.addEventListener("input", () => { byId("editor-status").classList.add("is-stale"); });

    const speed = byId("run-speed");
    speed.addEventListener("input", () => { byId("run-speed-out").textContent = SPEED_NAMES[Number(speed.value)]; });
    byId("run-speed-out").textContent = SPEED_NAMES[Number(speed.value)];

    // Memory browser.
    const jumps = [["page zero", 0x0000], ["stack", 0x0100], ["screen", 0x0200], ["program", 0x0600], ["vectors", 0xffc0]];
    for (const [name, addr] of jumps) {
      const button = el("button", "chip");
      button.type = "button";
      button.textContent = name;
      button.addEventListener("click", () => { machine.base = addr; byId("memory-address").value = hex4(addr); renderMemory(); });
      byId("memory-jumps").appendChild(button);
    }
    byId("memory-address").addEventListener("input", (event) => {
      const value = parseInt(event.target.value.replace(/[^0-9a-f]/gi, ""), 16);
      if (!Number.isNaN(value)) { machine.base = value & 0xfff0; renderMemory(); }
    });

    // The keyboard byte. Focus the screen and type.
    const screen = byId("screen");
    screen.tabIndex = 0;
    screen.addEventListener("keydown", (event) => {
      if (event.key.length === 1) {
        machine.key = event.key.charCodeAt(0) & 0xff;
        event.preventDefault();
      } else if (event.key === "ArrowUp") machine.key = 0x77;
      else if (event.key === "ArrowDown") machine.key = 0x73;
      else if (event.key === "ArrowLeft") machine.key = 0x61;
      else if (event.key === "ArrowRight") machine.key = 0x64;
      else return;
      if (machine.cpu) machine.cpu.poke(0x00ff, machine.key);
    });

    loadProgram(0);
  }

  function assembleNow() {
    const source = byId("editor").value;
    const assembled = ASM.assemble(source, { org: LAB.DEFAULT_ORG });
    machine.assembled = assembled;
    const status = byId("editor-status");
    status.classList.remove("is-stale");
    clear(status);
    if (!assembled.ok) {
      status.className = "editor-status is-error";
      for (const error of assembled.errors.slice(0, 4)) {
        const line = el("p", "error-line");
        append(line, el("strong", null, `line ${error.line}: `), document.createTextNode(error.message));
        if (error.hint) line.appendChild(el("span", "error-hint", error.hint));
        status.appendChild(line);
      }
      return;
    }
    status.className = "editor-status is-ok";
    const bytes = assembled.length;
    status.appendChild(el("p", null,
      `${bytes} byte${bytes === 1 ? "" : "s"} assembled to $${hex4(assembled.start)}–$${hex4(assembled.end)} · ${Object.keys(assembled.labels).length} label${Object.keys(assembled.labels).length === 1 ? "" : "s"}`));

    const loaded = LAB.load(source, {});
    machine.cpu = loaded.cpu;
    machine.cpu.recordCycles = false;
    machine.rng = 0x2c9e;
    machine.cpu.onRead = (addr) => {
      if (addr === 0x00fe) {
        // xorshift: cheap, and it does not repeat visibly on a 1K screen
        let x = machine.rng;
        x ^= (x << 7) & 0xffff; x ^= x >> 9; x ^= (x << 8) & 0xffff;
        machine.rng = x & 0xffff;
        return machine.rng & 0xff;
      }
      return undefined;
    };
    renderMachine();
  }

  function atBreak() {
    return machine.cpu && machine.cpu.peek(machine.cpu.pc) === 0x00;
  }

  function stepOnce() {
    if (!machine.cpu || machine.cpu.halted) return false;
    machine.cpu.step();
    return true;
  }

  function toggleRun() {
    if (machine.running) { stopRun(); return; }
    if (!machine.cpu) return;
    if (atBreak() || machine.cpu.halted) assembleNow();
    machine.running = true;
    byId("btn-run").textContent = "Stop";
    const frame = () => {
      if (!machine.running) return;
      const budget = SPEEDS[Number(byId("run-speed").value)];
      const target = machine.cpu.cycles + budget;
      while (machine.cpu.cycles < target) {
        if (machine.cpu.halted) { stopRun("the processor is jammed — only RESET brings it back"); break; }
        if (atBreak()) { stopRun("stopped at BRK"); break; }
        machine.cpu.step();
      }
      renderMachine();
      if (machine.running) machine.raf = window.requestAnimationFrame(frame);
    };
    machine.raf = window.requestAnimationFrame(frame);
  }

  function stopRun(reason) {
    machine.running = false;
    window.cancelAnimationFrame(machine.raf);
    const button = byId("btn-run");
    if (button) button.textContent = "Run";
    if (reason) {
      const status = byId("editor-status");
      // One note at a time: a second Run should replace the first reason,
      // not stack up underneath it.
      for (const old of status.querySelectorAll(".run-note")) old.remove();
      status.appendChild(el("p", "run-note", reason));
    }
  }

  function renderMachine() {
    if (!machine.cpu) return;
    renderScreen();
    renderRegisters();
    renderDisassembly();
    renderMemory();
  }

  function renderScreen() {
    const canvas = byId("screen");
    const context = canvas.getContext("2d");
    const scale = canvas.width / 32;
    const memory = machine.cpu.mem;
    for (let i = 0; i < 1024; i++) {
      context.fillStyle = TEXT.PALETTE[memory[0x0200 + i] & 0x0f];
      context.fillRect((i % 32) * scale, Math.floor(i / 32) * scale, scale, scale);
    }
  }

  function renderRegisters() {
    const cpu = machine.cpu;
    const host = byId("reg-readout");
    clear(host);
    const values = [
      ["PC", hex4(cpu.pc), 4], ["A", hex2(cpu.a), 2], ["X", hex2(cpu.x), 2],
      ["Y", hex2(cpu.y), 2], ["S", hex2(cpu.s), 2],
    ];
    for (const [name, value] of values) {
      const cell = el("div", "reg");
      append(cell, el("span", "reg-name", name), el("strong", "reg-value", `$${value}`));
      host.appendChild(cell);
    }
    const flags = byId("flag-readout");
    clear(flags);
    const bits = [["N", cpu.n], ["V", cpu.v], ["-", 1], ["B", 0], ["D", cpu.d], ["I", cpu.i], ["Z", cpu.z], ["C", cpu.c]];
    for (const [letter, value] of bits) {
      const chip = el("span", `flag-lamp ${value ? "is-set" : ""}${letter === "-" || letter === "B" ? " is-inert" : ""}`, letter);
      chip.title = letter === "B" ? "B exists only in a pushed status byte" : letter;
      flags.appendChild(chip);
    }
    byId("stat-cycles").textContent = cpu.cycles.toLocaleString();
    byId("stat-instructions").textContent = cpu.instructions.toLocaleString();
    const seconds = cpu.cycles / 1e6;
    byId("stat-seconds").textContent = seconds < 1 ? `${(seconds * 1000).toFixed(1)} ms` : `${seconds.toFixed(2)} s`;
  }

  function renderDisassembly() {
    const host = byId("disasm");
    clear(host);
    const cpu = machine.cpu;
    const read = (addr) => cpu.peek(addr);
    let addr = cpu.pc;
    const lineOf = machine.assembled && machine.assembled.addrToLine;
    for (let i = 0; i < 14; i++) {
      const line = disassemble(read, addr);
      const item = el("li", "disasm-line");
      if (i === 0) item.classList.add("is-current");
      const bytes = line.bytes.map(hex2).join(" ");
      append(item,
        el("span", "disasm-addr", `$${hex4(line.addr)}`),
        el("span", "disasm-bytes", bytes),
        el("span", "disasm-text", line.text),
      );
      if (line.op.illegal) item.appendChild(el("span", "tag tag-illegal", "undoc"));
      if (lineOf && lineOf.get(line.addr)) item.appendChild(el("span", "disasm-src", `line ${lineOf.get(line.addr)}`));
      host.appendChild(item);
      addr = (addr + line.length) & 0xffff;
    }
  }

  function renderMemory() {
    if (!machine.cpu) return;
    const lines = [];
    const base = machine.base & 0xfff0;
    for (let row = 0; row < 12; row++) {
      const start = (base + row * 16) & 0xffff;
      const bytes = [];
      let text = "";
      for (let i = 0; i < 16; i++) {
        const value = machine.cpu.peek(start + i);
        bytes.push(hex2(value));
        text += value >= 0x20 && value < 0x7f ? String.fromCharCode(value) : ".";
      }
      lines.push(`${hex4(start)}  ${bytes.slice(0, 8).join(" ")}  ${bytes.slice(8).join(" ")}  ${text}`);
    }
    byId("hexdump").textContent = lines.join("\n");
  }

  // ---------------------------------------------------------------
  // 08 Interrupts
  // ---------------------------------------------------------------
  const INTERRUPT_NOTES = {
    irq: "A device holds the IRQ line low and keeps holding it until it is serviced. The I flag can refuse it. B is pushed clear.",
    nmi: "One edge on the NMI pin, and nothing can refuse it — not the I flag, not a critical section. B is pushed clear.",
    brk: "Software, through the same vector as IRQ. PC is pushed as BRK+2, and B is pushed SET, which is the only way a shared handler can tell the two apart.",
    reset: "Seven cycles, of which five are a fake BRK with its writes suppressed — which is why the stack pointer moves down by three at power-on without anything being written.",
  };

  function buildInterrupts() {
    const row = byId("vector-row");
    const vectors = [
      ["NMI", 0xfffa, "cannot be masked", "A pin that is edge-triggered. Used for whatever absolutely must not be missed — on the NES, the start of vertical blank."],
      ["RESET", 0xfffc, "where the machine begins", "The only address the chip knows at power-on. On the Apple II this points into the monitor ROM; on a cartridge machine, into the cartridge."],
      ["IRQ / BRK", 0xfffe, "maskable, and shared", "Both hardware interrupts and the BRK instruction arrive here, which is why the handler's first job is usually to pull the pushed status byte back off the stack and look at bit 4."],
    ];
    for (const [name, addr, tag, blurb] of vectors) {
      const card = el("div", "vector");
      append(card,
        el("p", "vector-name", name),
        el("code", "vector-addr", `$${hex4(addr)}–$${hex4(addr + 1)}`),
        el("p", "vector-tag", tag),
        el("p", "vector-blurb", blurb),
      );
      row.appendChild(card);
    }

    let kind = "irq";
    for (const button of document.querySelectorAll("[data-interrupt]")) {
      button.addEventListener("click", () => {
        kind = button.dataset.interrupt;
        for (const other of document.querySelectorAll("[data-interrupt]")) other.classList.toggle("is-active", other === button);
        fire();
      });
    }
    byId("interrupt-i-flag").addEventListener("change", fire);

    function fire() {
      const source = [
        "  .org $0600",
        "  NOP",
        "  NOP",
        "  NOP",
      ].join("\n");
      const loaded = LAB.load(source, { vectors: { irq: 0x0700, nmi: 0x0780 } });
      const cpu = loaded.cpu;
      cpu.poke(0xfffc, 0x00); cpu.poke(0xfffd, 0x06);
      const masked = byId("interrupt-i-flag").checked;
      cpu.i = masked ? 1 : 0;

      let step;
      if (kind === "reset") {
        cpu.trace = [];
        const before = cpu.cycles;
        cpu.reset();
        step = { cycles: cpu.cycles - before, trace: cpu.trace, interrupt: "RESET" };
      } else {
        if (kind === "irq") cpu.irq(true);
        if (kind === "nmi") cpu.nmi();
        if (kind === "brk") cpu.poke(0x0600, 0x00);
        step = cpu.step();
      }

      renderTraceTable(byId("interrupt-trace"), step.trace);

      const summary = byId("interrupt-summary");
      clear(summary);
      const refused = kind === "irq" && masked;
      append(summary,
        el("strong", null, refused ? "Refused. " : `${step.cycles} cycles. `),
        document.createTextNode(refused
          ? "The I flag was set, so the IRQ line was ignored entirely and the NOP at $0600 ran instead. The device is still holding the line low; the moment CLI runs, this happens."
          : INTERRUPT_NOTES[kind]),
      );

      // What the stack looks like afterwards.
      const frame = byId("stack-frame");
      clear(frame);
      const slots = [];
      for (let addr = 0x01fd; addr >= 0x01fa; addr--) {
        const value = cpu.peek(addr);
        const pushed = addr > 0x0100 + cpu.s;
        slots.push({ addr, value, pushed });
      }
      const labels = { 0x01fd: "PC high", 0x01fc: "PC low", 0x01fb: "status (P)" };
      for (const slot of slots) {
        const cell = el("div", `stack-slot ${slot.pushed ? "is-pushed" : "is-empty"}`);
        append(cell,
          el("code", "slot-addr", `$${hex4(slot.addr)}`),
          el("strong", "slot-value", `$${hex2(slot.value)}`),
          el("span", "slot-label", slot.pushed ? (labels[slot.addr] || "") : "untouched"),
        );
        frame.appendChild(cell);
      }
      const p = cpu.peek(0x01fb);
      byId("stack-note").textContent = refused
        ? "Nothing was pushed: the interrupt never happened."
        : kind === "reset"
          ? `Nothing was written — the writes are suppressed — but S moved from $FD to $${hex2(cpu.s)} as though three bytes had been pushed. The bytes shown above are whatever was already in memory.`
          : `The pushed status byte is $${hex2(p)} — ${bin8(p)}. Bit 4 is ${p & 0x10 ? "SET, so this was BRK" : "CLEAR, so this was hardware"}. Bit 5 is always set on the way out. S is now $${hex2(cpu.s)}.`;
    }
    fire();
  }

  // ---------------------------------------------------------------
  // 09 Quirks
  // ---------------------------------------------------------------
  function buildQuirks() {
    const host = byId("quirk-list");
    TEXT.QUIRKS.forEach((quirk, i) => {
      const card = el("article", "panel-card quirk");
      const head = el("header", "quirk-head");
      append(head,
        el("span", "quirk-number", String(i + 1).padStart(2, "0")),
        el("h3", null, quirk.title),
      );
      const code = el("pre", "code-block");
      code.appendChild(el("code", null, quirk.source));
      const output = el("div", "quirk-output");
      output.appendChild(el("p", "quirk-idle", "Not run yet."));
      const button = el("button", "primary-button");
      button.type = "button";
      button.textContent = "Run it";
      button.addEventListener("click", () => {
        const result = LAB.runQuirk(quirk);
        clear(output);
        const verdict = el("p", `quirk-result ${result.ok ? "is-ok" : "is-bad"}`);
        append(verdict,
          el("span", "quirk-tick", result.ok ? "✓" : "!"),
          document.createTextNode(result.report),
        );
        output.appendChild(verdict);
        if (result.traces && result.traces.length) {
          const last = result.traces[result.traces.length - 1];
          const details = el("details", "quirk-trace");
          details.appendChild(el("summary", null, `the last instruction's ${last.cycles} bus cycles`));
          const table = el("table", "trace-table");
          const thead = el("thead");
          const headRow = el("tr");
          for (const label of ["#", "address", "R/W̅", "data", "what the chip is doing"]) headRow.appendChild(el("th", null, label));
          thead.appendChild(headRow);
          const tbody = el("tbody");
          renderTraceTable(tbody, last.trace);
          append(table, thead, tbody);
          details.appendChild(table);
          output.appendChild(details);
        }
      });

      append(card, head,
        el("p", "quirk-lede", quirk.lede),
        code, button, output,
        el("p", "quirk-moral", quirk.moral),
      );
      host.appendChild(card);
    });
  }

  // ---------------------------------------------------------------
  // 10 Sources
  // ---------------------------------------------------------------
  function buildSources() {
    const limits = byId("limits-list");
    for (const limit of TEXT.LIMITS) limits.appendChild(el("li", null, limit));

    const list = byId("source-list");
    for (const source of TEXT.SOURCES) {
      const item = el("li", "source");
      const link = el("a", "source-title", source.title);
      link.href = source.href;
      link.rel = "noopener noreferrer";
      append(item, link, el("p", "source-pub", source.pub), el("p", "source-use", source.use));
      list.appendChild(item);
    }
  }

  // ---------------------------------------------------------------
  // Go
  // ---------------------------------------------------------------
  function start() {
    buildOrigins();
    buildModel();
    buildCycles();
    buildAddressing();
    buildAlu();
    buildMatrix();
    buildMachine();
    buildInterrupts();
    buildQuirks();
    buildSources();
    startHeroScope();

    onShow.machine = () => { if (machine.cpu) renderMachine(); };
    onShow.cycles = () => { if (cycles.step) setCycle(cycles.index); };

    const hash = window.location.hash.replace("#", "");
    if (hash && tabs.some((tab) => tab.dataset.tab === hash)) showTab(hash, { scroll: false, focus: false });

    if (/[?&]selftest=1/.test(window.location.search)) selfTest();
    document.documentElement.dataset.appReady = "true";
  }

  // ---------------------------------------------------------------
  // The page checks itself, in the browser, with ?selftest=1.
  // The emulator's own invariant is the strongest thing to assert:
  // every instruction's bus trace must be exactly as long as its
  // documented cycle count. If that holds for all 256 opcodes, the
  // timing shown anywhere on the page is the timing the tables give.
  // ---------------------------------------------------------------
  function selfTest() {
    const problems = [];
    try {
      const cpu = window.MOS6502.create();
      for (let code = 0; code < 256; code++) {
        cpu.pc = 0x0600;
        cpu.poke(0x0600, code); cpu.poke(0x0601, 0x10); cpu.poke(0x0602, 0x20);
        cpu.poke(0x0010, 0x00); cpu.poke(0x0011, 0x20);
        cpu.x = 0; cpu.y = 0; cpu.n = 0; cpu.v = 0; cpu.c = 0; cpu.z = 0;
        cpu.halted = false; cpu.irqLine = false; cpu.nmiPending = false;
        const step = cpu.step();
        const taken = step.op.mode === "rel" && cpu.pc !== 0x0602 ? 1 : 0;
        if (step.trace.length !== step.cycles) problems.push(`$${hex2(code)} trace length`);
        if (step.cycles !== step.op.cycles + taken) problems.push(`$${hex2(code)} cycle count`);
      }
      for (const quirk of TEXT.QUIRKS) {
        if (!LAB.runQuirk(quirk).ok) problems.push(`quirk ${quirk.id}`);
      }
      for (const entry of TEXT.ADDRESSING) {
        const result = LAB.runSnippet(entry);
        if (!result.ok || result.step.op.mode !== entry.mode) problems.push(`mode ${entry.mode}`);
      }
      for (const program of TEXT.PROGRAMS) {
        if (!ASM.assemble(program.source).ok) problems.push(`program ${program.id}`);
      }
    } catch (error) {
      problems.push(`threw: ${error.message}`);
    }
    document.documentElement.dataset.selftest = problems.length ? `fail: ${problems.slice(0, 6).join(", ")}` : "pass";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
