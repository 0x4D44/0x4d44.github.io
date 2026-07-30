// Span of Control — browser persistence: the Laminated Wisdom collection,
// lifetime stats, and settings. Everything survives in one localStorage key;
// every access is guarded so private-mode/blocked storage degrades to a
// per-session game instead of a crash.

const KEY = "0x4d44.spanofcontrol.v1";

const DEFAULTS = {
  homilies: [], // homily ids ever collected
  endings: [], // ending ids ever reached
  runs: 0,
  bestWeeks: 0,
  bestHeadcount: 0,
  muted: false,
};

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw);
    return { ...DEFAULTS, ...data };
  } catch (err) {
    return { ...DEFAULTS };
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    /* storage unavailable: play on, collect nothing */
  }
}

// Fold a finished (or abandoned) run into the persistent record.
export function recordRun(store, state) {
  store.runs += 1;
  store.bestWeeks = Math.max(store.bestWeeks, state.weekCount);
  store.bestHeadcount = Math.max(store.bestHeadcount, state.headcount);
  for (const id of state.unlocked) if (!store.homilies.includes(id)) store.homilies.push(id);
  if (state.ended && !store.endings.includes(state.ended)) store.endings.push(state.ended);
  save(store);
  return store;
}

export function setMuted(store, muted) {
  store.muted = !!muted;
  save(store);
  return store;
}
