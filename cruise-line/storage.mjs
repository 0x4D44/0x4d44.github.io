import { GAME_VERSION } from "./content.mjs";
import { serialisableState, validateState } from "./engine.mjs";

export const SAVE_KEY = "0x4d44.wake-and-fortune.v1";
export const PREFS_KEY = "0x4d44.wake-and-fortune.prefs.v1";

function storageAvailable() {
  try {
    const key = "__wake_test__";
    localStorage.setItem(key, key);
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== GAME_VERSION || validateState(parsed).length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGame(state) {
  if (!storageAvailable() || !state) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialisableState(state)));
    return true;
  } catch {
    return false;
  }
}

export function clearGame() {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage is optional; the game remains playable without it.
  }
}

export function loadPrefs() {
  const defaults = { muted: false, reducedMotion: false, compactNumbers: false, guidanceEnabled: true, guidanceTourComplete: false };
  if (!storageAvailable()) return defaults;
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || "null") || {}) };
  } catch {
    return defaults;
  }
}

export function savePrefs(prefs) {
  if (!storageAvailable()) return false;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}
