import { APP_BUILD_ID, APP_VERSION, GRID_STRIDE } from "./build-info.js";

const PRESETS = {
  "first-replicator": {
    name: "First Replicator",
    eyebrow: "Watch the mechanism",
    description: "One exact 16-byte ancestor. Mutation is off, so every moving part of the copy loop can be inspected before evolution begins.",
    mutation: 0,
  },
  "faster-smaller": {
    name: "Faster, Smaller",
    eyebrow: "Selection from a supplied ancestor",
    description: "A deliberately wasteful 64-byte replicator competes under low mutation. Deletions can remove duplicated work and the long neutral tail.",
    mutation: 1_500,
  },
  "mutation-meltdown": {
    name: "Mutation Meltdown",
    eyebrow: "An error-threshold experiment",
    description: "Mutation begins high enough that novelty and damage arrive together. Watch viable replication fray and, in many seeds, collapse.",
    mutation: 28_000,
  },
  bottleneck: {
    name: "Bottleneck",
    eyebrow: "Drift and lost diversity",
    description: "Let the population diversify, then leave only a handful of survivors. Which lineages return is partly selection and partly history.",
    mutation: 2_000,
  },
  "blue-nutrient": {
    name: "The Blue Nutrient",
    eyebrow: "Richer ecology laboratory",
    description: "Movement, signals, seasons and a disclosed XOR energy reaction are enabled. The task is artificial physics, not secret fitness scoring.",
    mutation: 1_500,
  },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const dom = {
  canvas: $("#dish"),
  canvasWrap: $("#dish-wrap"),
  worldSummary: $("#world-summary"),
  status: $("#engine-status"),
  play: $("#play"),
  step: $("#step"),
  speed: $("#speed"),
  speedLabel: $("#speed-label"),
  preset: $("#preset"),
  seed: $("#seed"),
  reset: $("#reset"),
  share: $("#share"),
  update: $("#stat-update"),
  population: $("#stat-population"),
  genotypes: $("#stat-genotypes"),
  dominant: $("#stat-dominant"),
  genome: $("#stat-genome"),
  checksum: $("#checksum"),
  inspectorEmpty: $("#inspector-empty"),
  inspector: $("#inspector"),
  inspectorTitle: $("#inspector-title"),
  inspectorMeta: $("#inspector-meta"),
  genomeBytes: $("#genome-bytes"),
  parentDiff: $("#parent-diff"),
  disassembly: $("#disassembly"),
  registers: $("#registers"),
  childProgress: $("#child-progress"),
  localResource: $("#local-resource"),
  sandbox: $("#sandbox"),
  sandboxOutput: $("#sandbox-output"),
  populationChart: $("#population-chart"),
  genomeChart: $("#genome-chart"),
  topGenotypes: $("#top-genotypes"),
  fossils: $("#fossils"),
  mutation: $("#mutation"),
  mutationValue: $("#mutation-value"),
  expectedMutation: $("#expected-mutation"),
  bottleneck: $("#bottleneck"),
  catastrophe: $("#catastrophe"),
  pulse: $("#resource-pulse"),
  save: $("#save"),
  export: $("#export"),
  import: $("#import"),
  file: $("#file"),
  saves: $("#saves"),
  saveName: $("#save-name"),
  saveConfirm: $("#save-confirm"),
  saveDialog: $("#save-dialog"),
  labDialog: $("#lab-dialog"),
  lab: $("#lab"),
  aboutDialog: $("#about-dialog"),
  about: $("#about"),
  intro: $("#intro"),
  begin: $("#begin"),
  introSkip: $("#intro-skip"),
  notice: $("#notice"),
  fatal: $("#fatal"),
  fatalText: $("#fatal-text"),
  recover: $("#recover"),
  reload: $("#reload"),
  accessiblePopulation: $("#accessible-population"),
  version: $("#version"),
};

const ctx = dom.canvas.getContext("2d", { alpha: false });
const pixelCanvas = document.createElement("canvas");
const pixelCtx = pixelCanvas.getContext("2d", { alpha: false });

let worker = null;
let running = false;
let speedIndex = 2;
let summary = null;
let grid = null;
let detail = null;
let selectedCell = null;
let renderQueued = false;
let heartbeatAt = Date.now();
let fatal = false;
let sandboxRequest = 0;
let guideStage = 0;

const query = new URLSearchParams(location.search);
const initialPreset = PRESETS[query.get("preset")] ? query.get("preset") : "faster-smaller";
const initialSeed = normaliseSeed(query.get("seed") || randomSeed());

dom.version.textContent = `v${APP_VERSION} · ${APP_BUILD_ID}`;
dom.preset.value = initialPreset;
dom.seed.value = initialSeed;
setPresetCopy(initialPreset);
startWorker(initialPreset, initialSeed, false);

function startWorker(preset, seed, autoplay) {
  worker?.terminate();
  worker = new Worker("./worker.js", { type: "module", name: "darwin-machine" });
  heartbeatAt = Date.now();
  fatal = false;
  worker.onmessage = ({ data }) => handleWorkerMessage(data);
  worker.onerror = (event) => showFatal(event.message || "The simulation Worker crashed.");
  worker.postMessage({
    type: "init",
    buildId: APP_BUILD_ID,
    preset,
    seed,
    speedIndex,
    autoplay,
  });
  // Deliberately narrow test hook: the browser acceptance suite uses this to
  // advance the Wasm engine by an exact number of updates and compare its
  // checksum with a vector generated by the native Rust executable.
  window.__darwinTestRun = (updates) => worker?.postMessage({ type: "step", updates });
  dom.status.textContent = "loading Wasm…";
  dom.status.dataset.state = "loading";
}

function handleWorkerMessage(message) {
  switch (message.type) {
    case "ready":
      dom.status.textContent = "deterministic engine ready";
      dom.status.dataset.state = "ready";
      speedIndex = message.speedIndex;
      updateSpeedUi();
      window.__darwinReady = true;
      break;
    case "snapshot":
      summary = message.summary;
      grid = new Uint8Array(message.grid);
      window.__darwinSummary = summary;
      window.__darwinGridLength = grid.byteLength;
      worker.postMessage({ type: "snapshot-ack" });
      scheduleRender();
      updateSummary();
      updateObservatory();
      updateAccessibleSummary();
      advanceGuide();
      break;
    case "inspector":
      if (message.cell === selectedCell) {
        detail = message.detail;
        renderInspector();
      }
      break;
    case "run-state":
      running = message.running;
      speedIndex = message.speedIndex;
      dom.play.textContent = running ? "Pause" : "Run";
      dom.play.setAttribute("aria-pressed", String(running));
      updateSpeedUi();
      break;
    case "heartbeat":
      heartbeatAt = Date.now();
      break;
    case "notice":
      showNotice(message.text, message.level);
      break;
    case "saves":
      renderSaves(message.saves, message.recovery);
      break;
    case "checkpoint-export":
      downloadCheckpoint(message);
      break;
    case "sandbox-result":
      if (message.requestId === sandboxRequest) renderSandbox(message.result);
      break;
    case "build-mismatch":
      showFatal(`A stale cache mixed different builds: page ${message.page}, Worker ${message.worker}, Wasm ${message.wasm}.`);
      break;
    case "fatal":
      showFatal(message.message, message.stack);
      break;
    default:
      break;
  }
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    drawDish();
  });
}

function drawDish() {
  if (!summary || !grid) return;
  const { width, height } = summary;
  if (grid.length !== width * height * GRID_STRIDE) return;
  pixelCanvas.width = width;
  pixelCanvas.height = height;
  const image = pixelCtx.createImageData(width, height);
  const data = image.data;
  for (let cell = 0; cell < width * height; cell += 1) {
    const source = cell * GRID_STRIDE;
    const target = cell * 4;
    const occupied = grid[source] === 1;
    const energy = grid[source + 3] / 255;
    const resource = grid[source + 4] / 255;
    const state = grid[source + 5];
    if (!occupied) {
      const glow = Math.round(resource * 30);
      data[target] = 8 + Math.round(glow * 0.25);
      data[target + 1] = 13 + Math.round(glow * 0.75);
      data[target + 2] = 17 + glow;
    } else {
      const lo = grid[source + 1];
      const hi = grid[source + 2];
      const base = lineageRgb(lo, hi);
      const brightness = 0.45 + energy * 0.65;
      const starving = state & 4 ? 0.58 : 1;
      data[target] = clampByte(base[0] * brightness * starving);
      data[target + 1] = clampByte(base[1] * brightness * starving);
      data[target + 2] = clampByte(base[2] * brightness * starving);
      if (state & 1) {
        data[target] = clampByte(data[target] + 35);
        data[target + 1] = clampByte(data[target + 1] + 35);
      }
      if (state & 2) data[target + 2] = 255;
    }
    data[target + 3] = 255;
  }
  pixelCtx.putImageData(image, 0, 0);

  resizeCanvas();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#080d11";
  ctx.fillRect(0, 0, dom.canvas.width, dom.canvas.height);
  ctx.drawImage(pixelCanvas, 0, 0, dom.canvas.width, dom.canvas.height);

  if (selectedCell != null) {
    const x = selectedCell % width;
    const y = Math.floor(selectedCell / width);
    const sx = dom.canvas.width / width;
    const sy = dom.canvas.height / height;
    ctx.strokeStyle = "#fff6d2";
    ctx.lineWidth = Math.max(2, devicePixelRatio * 1.5);
    ctx.strokeRect(x * sx + 1, y * sy + 1, Math.max(2, sx - 2), Math.max(2, sy - 2));
  }
}

function resizeCanvas() {
  const rect = dom.canvasWrap.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (dom.canvas.width !== width || dom.canvas.height !== height) {
    dom.canvas.width = width;
    dom.canvas.height = height;
  }
}

function lineageRgb(lo, hi) {
  const hue = ((hi << 8) | lo) % 360;
  return hslToRgb(hue / 360, 0.72, 0.58);
}

function hslToRgb(h, s, l) {
  const hue = (p, q, t0) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

function updateSummary() {
  if (!summary) return;
  const latest = summary.stats.at(-1);
  dom.update.textContent = formatNumber(summary.update);
  dom.population.textContent = formatNumber(summary.population);
  dom.genotypes.textContent = formatNumber(summary.genotype_count);
  dom.dominant.textContent = summary.population
    ? `${(summary.dominant_share_ppm / 10_000).toFixed(1)}%`
    : "—";
  dom.genome.textContent = latest?.median_genome_length ? `${latest.median_genome_length} bytes` : "—";
  dom.checksum.textContent = summary.checksum;
  dom.checksum.title = "Authoritative 128-bit state checksum";
  dom.mutation.value = String(summary.mutation.substitution_ppm);
  dom.mutationValue.textContent = `${(summary.mutation.substitution_ppm / 10_000).toFixed(3)}% / copied byte`;
  dom.expectedMutation.textContent = `At 16 bytes: ${(summary.expected_substitutions_milli_minimal / 1_000).toFixed(3)} substitutions per birth on average.`;
  setUrl(summary.preset_id, summary.seed);
}

function updateObservatory() {
  if (!summary) return;
  drawLineChart(dom.populationChart, summary.stats, [
    { key: "population", label: "population" },
    { key: "genotype_count", label: "genotypes" },
  ]);
  drawLineChart(dom.genomeChart, summary.stats, [
    { key: "median_genome_length", label: "median bytes" },
    { key: "mean_replication_instructions", label: "replication instructions", secondary: true },
  ]);
  dom.topGenotypes.innerHTML = summary.top_genotypes.length
    ? summary.top_genotypes.map((g) => `
      <tr>
        <td><button class="link-button genotype-jump" data-genotype="${g.id}">G${g.id}</button></td>
        <td><code>${escapeHtml(g.hash_hex.slice(0, 8))}</code></td>
        <td>${formatNumber(g.active_count)}</td>
        <td>${g.genome_length}</td>
        <td>${formatNumber(g.total_births)}</td>
      </tr>`).join("")
    : `<tr><td colspan="5">No active genotypes.</td></tr>`;
  dom.fossils.innerHTML = summary.fossils.slice(-12).reverse().map((f) => `
    <li><span>u${formatNumber(f.update)}</span><strong>G${f.genotype_id}</strong><small>${escapeHtml(f.reason)}</small></li>
  `).join("") || "<li>No fossils yet.</li>";
}

function drawLineChart(canvas, samples, series) {
  const c = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = "#0d151a";
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.strokeStyle = "rgba(255,255,255,.09)";
  c.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (canvas.height * i) / 4;
    c.beginPath(); c.moveTo(0, y); c.lineTo(canvas.width, y); c.stroke();
  }
  if (samples.length < 2) return;
  const visible = samples.slice(-360);
  for (let si = 0; si < series.length; si += 1) {
    const spec = series[si];
    const values = visible.map((sample) => Number(sample[spec.key] || 0));
    const max = Math.max(1, ...values);
    c.strokeStyle = si === 0 ? "#d5ec72" : "#73cbe8";
    c.lineWidth = Math.max(1.5, ratio);
    c.beginPath();
    values.forEach((value, index) => {
      const x = (index / (values.length - 1)) * canvas.width;
      const y = canvas.height - (value / max) * (canvas.height - 10) - 5;
      if (index === 0) c.moveTo(x, y); else c.lineTo(x, y);
    });
    c.stroke();
  }
}

function renderInspector() {
  const has = Boolean(detail);
  dom.inspectorEmpty.hidden = has;
  dom.inspector.hidden = !has;
  if (!has) return;
  dom.inspectorTitle.textContent = `Organism #${detail.birth_id}`;
  dom.inspectorMeta.innerHTML = [
    ["cell", `${detail.x}, ${detail.y}`],
    ["lineage", `L${detail.lineage_id}`],
    ["genotype", `G${detail.genotype_id} · ${detail.genotype_hash_hex.slice(0, 10)}`],
    ["generation", formatNumber(detail.generation)],
    ["age", `${formatNumber(detail.age_instructions)} instructions`],
    ["energy", `${detail.energy} / ${detail.max_energy}`],
    ["children", formatNumber(detail.successful_children)],
    ["last copy", detail.last_replication_instructions ? `${formatNumber(detail.last_replication_instructions)} instructions` : "not yet"],
    ["birth mutation", `${detail.birth_mutation.substitutions} sub · ${detail.birth_mutation.insertions} ins · ${detail.birth_mutation.deletions} del`],
    ["status", humanStatus(detail.last_status)],
  ].map(([name, value]) => `<div><dt>${name}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join("");
  dom.genomeBytes.innerHTML = detail.genome.map((byte, index) => `
    <span class="byte ${index === detail.ip ? "ip" : ""} ${index === detail.read_head ? "read" : ""}" title="byte ${index}">${byte.toString(16).padStart(2, "0")}</span>
  `).join("");
  dom.parentDiff.innerHTML = renderByteDiff(detail.parent_genome, detail.genome);
  dom.disassembly.innerHTML = detail.disassembly.map((row) => `
    <tr class="${row.current ? "current" : ""} ${row.template ? "template" : ""}">
      <td>${row.current ? "▶" : ""}${row.read_head ? "R" : ""}</td>
      <td>${String(row.address).padStart(3, "0")}</td>
      <td><code>${row.byte.toString(16).padStart(2, "0")}</code></td>
      <td>${escapeHtml(row.mnemonic)}</td>
      <td>${escapeHtml(row.operand)}</td>
    </tr>`).join("");
  dom.registers.innerHTML = detail.registers.map((value, index) => `<li><span>r${index}</span><code>${value.toString(16).padStart(8, "0")}</code><small>${formatNumber(value)}</small></li>`).join("");
  const progress = detail.child_length ? detail.child_written / detail.child_length : 0;
  dom.childProgress.value = progress;
  dom.childProgress.nextElementSibling.textContent = detail.child_length
    ? `${detail.child_written} / ${detail.child_length} child bytes written`
    : "No child buffer allocated";
  dom.localResource.value = detail.local_resource / 512;
  dom.localResource.nextElementSibling.textContent = `${detail.local_resource} local nutrient units`;
}

function renderByteDiff(parent, child) {
  if (!parent) return `<p class="muted">Founder: no parent genome.</p>`;
  const diff = lcsDiff(parent, child);
  return diff.map((part) => `<span class="diff-${part.kind}">${part.value.toString(16).padStart(2, "0")}</span>`).join(" ");
}

function lcsDiff(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint16Array(cols));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0; let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: "same", value: a[i] }); i += 1; j += 1;
    } else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j])) {
      out.push({ kind: "insert", value: b[j] }); j += 1;
    } else {
      out.push({ kind: "delete", value: a[i] }); i += 1;
    }
  }
  return out;
}

function updateAccessibleSummary() {
  if (!summary) return;
  const latest = summary.stats.at(-1);
  dom.worldSummary.textContent = `Update ${summary.update}. ${summary.population} active organisms, ${summary.genotype_count} exact genotypes and ${summary.lineage_count} lineages. Dominant genotype holds ${(summary.dominant_share_ppm / 10_000).toFixed(1)} percent of the population. Median genome length ${latest?.median_genome_length || "not yet sampled"} bytes.`;
  dom.accessiblePopulation.innerHTML = summary.top_genotypes.map((g) => `
    <li><strong>Genotype G${g.id}</strong>: ${g.active_count} active organisms, ${g.genome_length} bytes, first seen at update ${g.first_seen_update}.</li>
  `).join("") || "<li>No active organisms.</li>";
}

function selectFromPointer(event) {
  if (!summary) return;
  const rect = dom.canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(summary.width - 1, Math.floor(((event.clientX - rect.left) / rect.width) * summary.width)));
  const y = Math.max(0, Math.min(summary.height - 1, Math.floor(((event.clientY - rect.top) / rect.height) * summary.height)));
  selectCell(y * summary.width + x);
}

function selectCell(cell) {
  if (!summary) return;
  selectedCell = Math.max(0, Math.min(summary.width * summary.height - 1, cell));
  worker.postMessage({ type: "select", cell: selectedCell });
  scheduleRender();
}

function moveSelection(dx, dy) {
  if (!summary) return;
  const current = selectedCell ?? Math.floor(summary.height / 2) * summary.width + Math.floor(summary.width / 2);
  const x = (current % summary.width + dx + summary.width) % summary.width;
  const y = (Math.floor(current / summary.width) + dy + summary.height) % summary.height;
  selectCell(y * summary.width + x);
}

function updateSpeedUi() {
  dom.speed.value = String(speedIndex);
  dom.speedLabel.textContent = ["1× watch", "4×", "20×", "100×", "maximum"][speedIndex];
}

function setPresetCopy(id) {
  const preset = PRESETS[id];
  $("#preset-eyebrow").textContent = preset.eyebrow;
  $("#preset-description").textContent = preset.description;
}

function resetWorld(autoplay = false) {
  const preset = dom.preset.value;
  const seed = normaliseSeed(dom.seed.value || randomSeed());
  dom.seed.value = seed;
  selectedCell = null;
  detail = null;
  setPresetCopy(preset);
  worker.postMessage({ type: "reset", preset, seed, autoplay });
}

function setUrl(preset, seed) {
  const url = new URL(location.href);
  url.searchParams.set("preset", preset);
  url.searchParams.set("seed", seed);
  history.replaceState(null, "", url);
}

function renderSaves(saves, recovery) {
  dom.saves.innerHTML = saves.length ? saves.map((save) => `
    <li>
      <div><strong>${escapeHtml(save.name)}</strong><small>${new Date(save.savedAt).toLocaleString()} · u${formatNumber(save.update)} · ${formatNumber(save.population)} organisms</small></div>
      <span>
        <button data-load="${escapeHtml(save.key)}">Load</button>
        <button data-delete="${escapeHtml(save.key)}" class="quiet">Delete</button>
      </span>
    </li>`).join("") : "<li class=muted>No browser saves yet.</li>";
  dom.recover.hidden = !recovery;
  if (recovery) dom.recover.textContent = `Recover automatic checkpoint (u${formatNumber(recovery.update)})`;
}

function downloadCheckpoint(message) {
  const blob = new Blob([message.buffer], { type: "application/x-darwin-machine" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = message.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  showNotice(`Exported checkpoint ${message.checksum.slice(0, 12)}…`, "ok");
}

function runSandbox() {
  if (!detail) return;
  sandboxRequest += 1;
  dom.sandboxOutput.textContent = "Stepping a frozen clone…";
  worker.postMessage({
    type: "sandbox",
    requestId: sandboxRequest,
    genome: Uint8Array.from(detail.genome),
    steps: 220,
  });
}

function renderSandbox(result) {
  const tail = result.steps.slice(-12);
  dom.sandboxOutput.innerHTML = `
    <p><strong>${result.divided ? "The clone divided." : "No division in this trace."}</strong> ${result.child ? `Child length ${result.child.length} bytes.` : ""}</p>
    <ol>${tail.map((step) => `<li><code>${String(step.ip).padStart(3, "0")} ${step.byte.toString(16).padStart(2, "0")}</code> ${escapeHtml(step.mnemonic)} · E${step.energy}</li>`).join("")}</ol>`;
}

function advanceGuide() {
  if (dom.intro.hidden || !summary) return;
  if (guideStage === 1 && summary.population > 24) {
    guideStage = 2;
    $("#intro-title").textContent = "Now inspect a mutation";
    $("#intro-copy").textContent = "Click a coloured cell. The right-hand debugger shows the executing bytecode and its difference from the parent.";
    dom.begin.textContent = "Let it run";
  }
}

function showNotice(text, level = "ok") {
  dom.notice.textContent = text;
  dom.notice.dataset.level = level;
  dom.notice.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => { dom.notice.hidden = true; }, 4_500);
}

function showFatal(message, stack = "") {
  fatal = true;
  running = false;
  dom.fatal.hidden = false;
  dom.fatalText.textContent = `${message}${stack ? `\n\n${stack}` : ""}`;
  dom.status.textContent = "engine stopped";
  dom.status.dataset.state = "fatal";
}

function humanStatus(value) {
  if (typeof value === "string") return value.replaceAll(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return String(value);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-GB");
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normaliseSeed(value) {
  const text = String(value).trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return BigInt(text).toString();
  if (/^\d+$/.test(text)) return BigInt(text).toString();
  return "1";
}

function randomSeed() {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return ((BigInt(values[0]) << 32n) | BigInt(values[1])).toString();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

// Controls

dom.play.addEventListener("click", () => worker.postMessage({ type: running ? "pause" : "play" }));
dom.step.addEventListener("click", () => worker.postMessage({ type: "step", updates: 1 }));
dom.speed.addEventListener("input", () => worker.postMessage({ type: "speed", index: Number(dom.speed.value) }));
dom.preset.addEventListener("change", () => setPresetCopy(dom.preset.value));
dom.reset.addEventListener("click", () => resetWorld(false));
dom.share.addEventListener("click", async () => {
  await navigator.clipboard.writeText(location.href);
  showNotice("Copied this preset and seed to the clipboard.", "ok");
});
dom.canvas.addEventListener("pointerdown", selectFromPointer);
dom.canvas.addEventListener("keydown", (event) => {
  const movements = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (movements[event.key]) {
    event.preventDefault();
    moveSelection(...movements[event.key]);
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    worker.postMessage({ type: "select", cell: selectedCell });
  }
});
window.addEventListener("resize", scheduleRender);

dom.mutation.addEventListener("input", () => {
  const value = Number(dom.mutation.value);
  dom.mutationValue.textContent = `${(value / 10_000).toFixed(3)}% / copied byte`;
});
dom.mutation.addEventListener("change", () => worker.postMessage({ type: "intervene", kind: "mutation", value: Number(dom.mutation.value) }));
dom.bottleneck.addEventListener("click", () => worker.postMessage({ type: "intervene", kind: "bottleneck", value: 8 }));
dom.catastrophe.addEventListener("click", () => worker.postMessage({ type: "intervene", kind: "catastrophe", value: 70 }));
dom.pulse.addEventListener("click", () => worker.postMessage({ type: "intervene", kind: "resource-pulse", value: 240 }));
dom.lab.addEventListener("click", () => dom.labDialog.showModal());
dom.about.addEventListener("click", () => dom.aboutDialog.showModal());
$$('[data-close]').forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

dom.save.addEventListener("click", () => {
  dom.saveName.value = `${PRESETS[summary?.preset_id || dom.preset.value].name} · update ${formatNumber(summary?.update || 0)}`;
  dom.saveDialog.showModal();
  dom.saveName.select();
});
dom.saveConfirm.addEventListener("click", () => {
  worker.postMessage({ type: "save-local", name: dom.saveName.value || "Experiment" });
  dom.saveDialog.close();
});
dom.export.addEventListener("click", () => worker.postMessage({ type: "export" }));
dom.import.addEventListener("click", () => dom.file.click());
dom.file.addEventListener("change", async () => {
  const [file] = dom.file.files;
  if (!file) return;
  if (file.size > 16 * 1024 * 1024) {
    showNotice("That file exceeds the 16 MiB import safety cap.", "warn");
    return;
  }
  const buffer = await file.arrayBuffer();
  worker.postMessage({ type: "import", buffer }, [buffer]);
  dom.file.value = "";
});
dom.saves.addEventListener("click", (event) => {
  const load = event.target.closest("[data-load]");
  const del = event.target.closest("[data-delete]");
  if (load) worker.postMessage({ type: "load-local", key: load.dataset.load });
  if (del) worker.postMessage({ type: "delete-local", key: del.dataset.delete });
});
dom.recover.addEventListener("click", () => worker.postMessage({ type: "recover" }));
dom.reload.addEventListener("click", () => location.reload());
dom.sandbox.addEventListener("click", runSandbox);

dom.begin.addEventListener("click", () => {
  if (guideStage === 0) {
    guideStage = 1;
    dom.preset.value = "first-replicator";
    dom.seed.value = "311991";
    resetWorld(true);
    $("#intro-title").textContent = "The copy loop is running";
    $("#intro-copy").textContent = "Each organism reads one byte from itself, writes it to a private child buffer, and divides only after every child byte has been written.";
    dom.begin.textContent = "Continue";
  } else if (guideStage === 1) {
    worker.postMessage({ type: "intervene", kind: "mutation", value: 1_500 });
    guideStage = 2;
    $("#intro-title").textContent = "Mutation is now on";
    $("#intro-copy").textContent = "A copying error changes executable code. Most will be neutral or damaging; a few may change replication cost or behaviour.";
    dom.begin.textContent = "Open the laboratory";
  } else {
    dom.intro.hidden = true;
    localStorage.setItem("darwin.intro.seen", "1");
  }
});
dom.introSkip.addEventListener("click", () => {
  dom.intro.hidden = true;
  localStorage.setItem("darwin.intro.seen", "1");
});
if (localStorage.getItem("darwin.intro.seen") === "1") dom.intro.hidden = true;

setInterval(() => {
  if (!fatal && Date.now() - heartbeatAt > 8_000) {
    showFatal("The simulation Worker stopped responding. Your most recent automatic recovery checkpoint may still be available.");
  }
}, 2_000);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service worker registration failed", error));
  });
}
