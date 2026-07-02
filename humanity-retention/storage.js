import { defaultProgress, exportSave, importSave, migrateSave } from "./engine.js";

const KEY = "hrp.save.v1";

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProgress();
    const imported = importSave(raw);
    return imported.ok ? imported.value : defaultProgress();
  } catch (_) {
    return defaultProgress();
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(KEY, exportSave(migrateSave(progress)));
    return true;
  } catch (err) {
    console.warn("Save failed", err);
    return false;
  }
}

export function resetProgress() {
  try { localStorage.removeItem(KEY); } catch (_) {}
  return defaultProgress();
}

export function exportProgress(progress) {
  return exportSave(progress);
}

export function importProgress(json) {
  return importSave(json);
}

export function autosave(progress) {
  if (autosave._timer) clearTimeout(autosave._timer);
  autosave._timer = setTimeout(() => saveProgress(progress), 120);
}
