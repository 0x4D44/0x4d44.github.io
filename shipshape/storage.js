import { STORAGE_VERSION, createInitialState, ensureStateShape, serialiseState, validateImportData } from "./engine.js";

const DB_NAME = "shipshape-logbook";
const STORE_NAME = "kv";
const STATE_KEY = "state";
const LOCAL_KEY = "shipshape.state.v1";

function now() {
  return new Date();
}

function hasIndexedDb() {
  return typeof indexedDB !== "undefined" && indexedDB && typeof indexedDB.open === "function";
}

function hasLocalStorage() {
  try {
    return typeof localStorage !== "undefined" && localStorage;
  } catch {
    return false;
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, STORAGE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB could not open"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked by another tab"));
  });
}

function txStore(db, mode = "readonly") {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const request = txStore(db).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
  });
}

function idbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const request = txStore(db, "readwrite").put(value, key);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error("IndexedDB write failed"));
  });
}

function idbDelete(db, key) {
  return new Promise((resolve, reject) => {
    const request = txStore(db, "readwrite").delete(key);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error("IndexedDB delete failed"));
  });
}

function localLoad() {
  const raw = hasLocalStorage() ? localStorage.getItem(LOCAL_KEY) : null;
  if (!raw) return createInitialState(now());
  const valid = validateImportData(raw);
  return valid.ok ? valid.value : createInitialState(now());
}

function localSave(state) {
  if (!hasLocalStorage()) throw new Error("Browser storage is unavailable in this window.");
  localStorage.setItem(LOCAL_KEY, serialiseState(state));
}

function createLocalStorageAdapter(reason = "IndexedDB unavailable; using localStorage fallback") {
  return {
    kind: "localStorage",
    reason,
    async load() {
      return localLoad();
    },
    async save(state) {
      const shaped = ensureStateShape(state, now());
      shaped.updatedAt = new Date().toISOString();
      localSave(shaped);
      return shaped;
    },
    async exportJson() {
      return serialiseState(localLoad());
    },
    async importJson(json) {
      const result = validateImportData(json);
      if (!result.ok) return result;
      localSave(result.value);
      return { ok: true, value: result.value };
    },
    async reset() {
      if (hasLocalStorage()) localStorage.removeItem(LOCAL_KEY);
      return createInitialState(now());
    }
  };
}

export function createMemoryStorage(initialState = createInitialState(now())) {
  let stored = ensureStateShape(initialState, now());
  return {
    kind: "memory",
    reason: "In-memory storage for tests or private browsing fallback",
    async load() {
      return ensureStateShape(stored, now());
    },
    async save(state) {
      stored = ensureStateShape(state, now());
      stored.updatedAt = new Date().toISOString();
      return ensureStateShape(stored, now());
    },
    async exportJson() {
      return serialiseState(stored);
    },
    async importJson(json) {
      const result = validateImportData(json);
      if (!result.ok) return result;
      stored = ensureStateShape(result.value, now());
      return { ok: true, value: await this.load() };
    },
    async reset() {
      stored = createInitialState(now());
      return this.load();
    }
  };
}

export async function createBrowserStorage() {
  if (!hasIndexedDb()) {
    if (hasLocalStorage()) return createLocalStorageAdapter();
    return createMemoryStorage();
  }

  try {
    const db = await openDatabase();
    return {
      kind: "indexedDB",
      reason: "Structured local browser storage",
      async load() {
        const raw = await idbGet(db, STATE_KEY);
        if (!raw) return createInitialState(now());
        return ensureStateShape(raw, now());
      },
      async save(state) {
        const shaped = ensureStateShape(state, now());
        shaped.updatedAt = new Date().toISOString();
        await idbPut(db, STATE_KEY, shaped);
        return shaped;
      },
      async exportJson() {
        return serialiseState(await this.load());
      },
      async importJson(json) {
        const result = validateImportData(json);
        if (!result.ok) return result;
        await idbPut(db, STATE_KEY, result.value);
        return { ok: true, value: result.value };
      },
      async reset() {
        await idbDelete(db, STATE_KEY);
        return createInitialState(now());
      }
    };
  } catch (error) {
    if (hasLocalStorage()) return createLocalStorageAdapter(error?.message || "IndexedDB unavailable; using localStorage fallback");
    return createMemoryStorage();
  }
}
