// Persistent save data (best times, last picks, hints seen, Grand Prix progress). Owner: UI agent.
import { SAVE_KEY } from '../config.js';
import { ordinal } from './dom.js';

const DEFAULT = { v: 1, best: {}, hintsSeen: false, last: { craft: 'falcon', livery: 0, course: 'sunrise', difficulty: 'normal', laps: 3 }, gp: null, gpDone: 0 };

export function loadSave() {
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (d && typeof d === 'object') return { ...DEFAULT, ...d, last: { ...DEFAULT.last, ...(d.last || {}) }, best: d.best || {} }; } catch { /* private mode / corrupt */ }
  return { ...DEFAULT, last: { ...DEFAULT.last }, best: {} };
}
export function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* quota / private mode */ } }

/** Record a finished race. Returns { newLap, newRace, prevLap, prevRace }. */
export function recordResult(save, courseId, craftId, { lap, race }) {
  const key = `${courseId}|${craftId}`, b = (save.best[key] ||= { lap: null, race: null });
  const out = { prevLap: b.lap, prevRace: b.race, newLap: false, newRace: false };
  if (lap != null && isFinite(lap) && (b.lap == null || lap < b.lap)) { b.lap = lap; out.newLap = b.lap !== out.prevLap; }
  if (race != null && isFinite(race) && (b.race == null || race < b.race)) { b.race = race; out.newRace = true; }
  writeSave(save);
  return out;
}
/** Main-menu sub-label of a saved Grand Prix, e.g. "Race 2 of 4 - 2nd, 25 pts". `totals` is an object keyed by pilot name (not an array). */
export function gpLabel(gp) {
  if (!gp || typeof gp !== 'object') return '';
  const head = `Race ${Math.min(3, Math.max(0, Math.floor(Number(gp.race) || 0))) + 1} of 4`;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);   // a tampered save must not print "NaN pts" or throw
  const rows = Object.values(gp.totals && typeof gp.totals === 'object' ? gp.totals : {}).filter((t) => t && typeof t === 'object').map((t) => ({ pts: num(t.points), wins: num(t.wins), you: !!t.isPlayer }));
  rows.sort((a, b) => b.pts - a.pts || b.wins - a.wins);   // same order as UI.gpStandings()
  const i = rows.findIndex((t) => t.you);
  return i < 0 ? head : `${head} - ${ordinal(i + 1)}, ${rows[i].pts} pts`;
}
/** Best across all craft for a course. */
export function bestFor(save, courseId) {
  let lap = null, race = null;
  for (const k in save.best) if (k.startsWith(courseId + '|')) { const b = save.best[k]; if (b.lap != null && (lap == null || b.lap < lap)) lap = b.lap; if (b.race != null && (race == null || b.race < race)) race = b.race; }
  return { lap, race };
}
