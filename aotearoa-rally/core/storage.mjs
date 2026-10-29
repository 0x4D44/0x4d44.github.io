// Storage adapter: wraps localStorage (or any getItem/setItem/removeItem backend) so a missing,
// full or blocked store never throws. Node tests use createMemoryStorage().
// Pure: no DOM access at import time.

export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
  };
}

/** @param backend object with getItem/setItem/removeItem (e.g. window.localStorage), or null/undefined for memory */
export function createStorage(backend) {
  let be = backend;
  if (!be) be = createMemoryStorage();
  let failed = 0;
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      failed++;
      return fallback;
    }
  };
  return {
    get failures() {
      return failed;
    },
    get: (key) => safe(() => be.getItem(key), null),
    set: (key, value) => safe(() => (be.setItem(key, String(value)), true), false),
    remove: (key) => safe(() => (be.removeItem(key), true), false),
    getJSON(key, fallback = null) {
      const raw = safe(() => be.getItem(key), null);
      if (raw == null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        failed++;
        return fallback;
      }
    },
    setJSON(key, value) {
      try {
        return safe(() => (be.setItem(key, JSON.stringify(value)), true), false);
      } catch {
        failed++;
        return false;
      }
    },
  };
}

/** Best-effort real localStorage in the browser; memory elsewhere or when blocked. */
export function browserStorage() {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      ls.setItem("aotearoa-rally.probe", "1");
      ls.removeItem("aotearoa-rally.probe");
      return createStorage(ls);
    }
  } catch {
    /* fall through to memory */
  }
  return createStorage(null);
}
