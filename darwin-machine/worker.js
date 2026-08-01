import initWasm, {
  DarwinWorld,
  build_id as wasmBuildId,
  sandboxTraceJson,
  version_info_json as versionInfoJson,
} from "./pkg/darwin_wasm.js";
import { APP_BUILD_ID, GRID_STRIDE } from "./build-info.js";

const SPEEDS = [1, 4, 20, 100, 400];
const DB_NAME = "darwin-machine-v1";
const DB_STORE = "worlds";
const RECOVERY_KEY = "__recovery__";

let world = null;
let running = false;
let speedIndex = 2;
let selectedCell = null;
let snapshotInFlight = false;
let lastSnapshotAt = 0;
let lastRecoveryAt = 0;
let booted = false;
let pumpScheduled = false;
let dbPromise = null;
let fatal = false;

self.addEventListener("message", (event) => {
  handle(event.data).catch(reportFatal);
});

async function handle(message) {
  if (!message || typeof message.type !== "string") return;
  switch (message.type) {
    case "init":
      await boot(message);
      break;
    case "play":
      requireWorld();
      running = true;
      schedulePump();
      postState();
      break;
    case "pause":
      running = false;
      postState();
      break;
    case "step":
      requireWorld();
      running = false;
      world.runUpdates(Math.max(1, Math.min(10_000, message.updates || 1)));
      sendSnapshot(true);
      postState();
      break;
    case "speed":
      speedIndex = clampInt(message.index, 0, SPEEDS.length - 1);
      postState();
      break;
    case "select":
      selectedCell = Number.isInteger(message.cell) ? message.cell : null;
      sendInspector();
      break;
    case "snapshot-ack":
      snapshotInFlight = false;
      break;
    case "intervene":
      requireWorld();
      world.applyIntervention(String(message.kind), Number(message.value) >>> 0);
      sendSnapshot(true);
      break;
    case "reset":
      requireBoot();
      world = new DarwinWorld(String(message.preset || "faster-smaller"), normaliseSeed(message.seed));
      selectedCell = null;
      running = Boolean(message.autoplay);
      sendSnapshot(true);
      postState();
      schedulePump();
      break;
    case "save-local":
      requireWorld();
      await saveLocal(String(message.name || "Experiment"));
      break;
    case "list-saves":
      await listSaves();
      break;
    case "load-local":
      await loadLocal(String(message.key));
      break;
    case "delete-local":
      await deleteLocal(String(message.key));
      break;
    case "export":
      requireWorld();
      exportCheckpoint();
      break;
    case "import":
      await importCheckpoint(message.buffer);
      break;
    case "recover":
      await loadLocal(RECOVERY_KEY, true);
      break;
    case "sandbox":
      await runSandbox(message);
      break;
    default:
      throw new Error(`Unknown worker command: ${message.type}`);
  }
}

async function boot(message) {
  if (booted) return;
  if (message.buildId !== APP_BUILD_ID) {
    throw new Error(`Page/worker build mismatch: page=${message.buildId}, worker=${APP_BUILD_ID}`);
  }
  await initWasm();
  const wasmId = wasmBuildId();
  if (wasmId !== APP_BUILD_ID) {
    self.postMessage({
      type: "build-mismatch",
      page: message.buildId,
      worker: APP_BUILD_ID,
      wasm: wasmId,
    });
    return;
  }
  booted = true;
  world = new DarwinWorld(String(message.preset || "faster-smaller"), normaliseSeed(message.seed));
  speedIndex = clampInt(message.speedIndex ?? 2, 0, SPEEDS.length - 1);
  running = Boolean(message.autoplay);
  self.postMessage({
    type: "ready",
    buildId: APP_BUILD_ID,
    versions: JSON.parse(versionInfoJson()),
    speedIndex,
  });
  sendSnapshot(true);
  postState();
  schedulePump();
  void listSaves();
}

function schedulePump() {
  if (!running || pumpScheduled || fatal) return;
  pumpScheduled = true;
  setTimeout(pump, 0);
}

function pump() {
  pumpScheduled = false;
  if (!running || !world || fatal) return;
  const started = performance.now();
  const budgetMs = speedIndex >= 4 ? 12 : 7;
  const batch = SPEEDS[speedIndex];
  do {
    world.runUpdates(batch);
  } while (performance.now() - started < budgetMs && speedIndex >= 3);

  const now = performance.now();
  const cadence = speedIndex >= 3 ? 120 : 70;
  if (now - lastSnapshotAt >= cadence) sendSnapshot(false);
  if (now - lastRecoveryAt >= 30_000) {
    lastRecoveryAt = now;
    void saveRecovery();
  }
  schedulePump();
}

function sendSnapshot(force) {
  if (!world || (snapshotInFlight && !force)) return;
  const grid = world.gridSnapshot();
  const summary = JSON.parse(world.summaryJson());
  if (grid.byteLength !== summary.width * summary.height * GRID_STRIDE) {
    throw new Error("Wasm grid snapshot has an invalid length");
  }
  snapshotInFlight = true;
  lastSnapshotAt = performance.now();
  self.postMessage({ type: "snapshot", summary, grid: grid.buffer }, [grid.buffer]);
  sendInspector();
}

function sendInspector() {
  if (!world) return;
  const detail = selectedCell == null ? null : JSON.parse(world.inspectJson(selectedCell));
  self.postMessage({ type: "inspector", cell: selectedCell, detail });
}

function postState() {
  self.postMessage({
    type: "run-state",
    running,
    speedIndex,
    updatesPerBatch: SPEEDS[speedIndex],
  });
}

async function runSandbox(message) {
  const genome = new Uint8Array(message.genome || []);
  const result = JSON.parse(sandboxTraceJson(genome, clampInt(message.steps ?? 200, 1, 20_000)));
  self.postMessage({ type: "sandbox-result", requestId: message.requestId, result });
}

function exportCheckpoint() {
  const bytes = world.exportCheckpoint();
  const summary = JSON.parse(world.summaryJson());
  self.postMessage({
    type: "checkpoint-export",
    filename: `darwin-${summary.preset_id}-u${summary.update}-s${summary.seed}.darwin`,
    checksum: summary.checksum,
    buffer: bytes.buffer,
  }, [bytes.buffer]);
}

async function importCheckpoint(buffer) {
  if (!(buffer instanceof ArrayBuffer)) throw new Error("Import payload is not an ArrayBuffer");
  if (buffer.byteLength > 16 * 1024 * 1024) throw new Error("Save is larger than the 16 MiB safety cap");
  world = DarwinWorld.fromCheckpoint(new Uint8Array(buffer));
  running = false;
  selectedCell = null;
  sendSnapshot(true);
  postState();
}

async function saveLocal(name) {
  const bytes = world.exportCheckpoint();
  const summary = JSON.parse(world.summaryJson());
  const key = `world:${Date.now()}:${summary.seed}`;
  await dbPut({
    key,
    name: name.slice(0, 80),
    savedAt: Date.now(),
    preset: summary.preset_id,
    update: summary.update,
    population: summary.population,
    checksum: summary.checksum,
    bytes,
  });
  await listSaves();
  self.postMessage({ type: "notice", level: "ok", text: `Saved “${name.slice(0, 80)}” in this browser.` });
}

async function saveRecovery() {
  if (!world) return;
  try {
    const bytes = world.exportCheckpoint();
    const summary = JSON.parse(world.summaryJson());
    await dbPut({
      key: RECOVERY_KEY,
      name: "Automatic recovery",
      savedAt: Date.now(),
      preset: summary.preset_id,
      update: summary.update,
      population: summary.population,
      checksum: summary.checksum,
      bytes,
    });
  } catch (error) {
    self.postMessage({ type: "notice", level: "warn", text: `Recovery checkpoint failed: ${error.message}` });
  }
}

async function loadLocal(key, quiet = false) {
  const record = await dbGet(key);
  if (!record?.bytes) throw new Error("That saved experiment no longer exists");
  const bytes = record.bytes instanceof Uint8Array ? record.bytes : new Uint8Array(record.bytes);
  world = DarwinWorld.fromCheckpoint(bytes);
  running = false;
  selectedCell = null;
  sendSnapshot(true);
  postState();
  if (!quiet) self.postMessage({ type: "notice", level: "ok", text: `Loaded “${record.name}”.` });
}

async function deleteLocal(key) {
  const db = await openDb();
  await requestPromise(db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).delete(key));
  await listSaves();
}

async function listSaves() {
  const db = await openDb();
  const records = await requestPromise(db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).getAll());
  const saves = records
    .filter((record) => record.key !== RECOVERY_KEY)
    .map(({ bytes, ...metadata }) => metadata)
    .sort((a, b) => b.savedAt - a.savedAt);
  const recovery = records.find((record) => record.key === RECOVERY_KEY);
  self.postMessage({
    type: "saves",
    saves,
    recovery: recovery ? { savedAt: recovery.savedAt, update: recovery.update, checksum: recovery.checksum } : null,
  });
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) {
        request.result.createObjectStore(DB_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

async function dbPut(value) {
  const db = await openDb();
  await requestPromise(db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(value));
}

async function dbGet(key) {
  const db = await openDb();
  return requestPromise(db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key));
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB operation failed"));
  });
}

function requireWorld() {
  requireBoot();
  if (!world) throw new Error("The simulation is not initialised");
}

function requireBoot() {
  if (!booted) throw new Error("The Wasm engine has not finished loading");
}

function normaliseSeed(value) {
  const text = String(value ?? "1").trim();
  if (!/^(?:0x[0-9a-f]+|\d+)$/i.test(text)) return "1";
  return text;
}

function clampInt(value, min, max) {
  const n = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : min;
  return Math.max(min, Math.min(max, n));
}

function reportFatal(error) {
  fatal = true;
  running = false;
  self.postMessage({
    type: "fatal",
    message: error?.message || String(error),
    stack: error?.stack || "",
  });
}

setInterval(() => {
  self.postMessage({ type: "heartbeat", at: Date.now(), running, buildId: APP_BUILD_ID });
}, 2_000);
