/* sintaxis srs — SM-2 spaced repetition + persistent state.
   Exposes window.STATE. Storage key: sintaxis.v1 */
(function () {
"use strict";

var KEY = "sintaxis.v1";
var DAY = 86400000;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
var S = load();
S.done = S.done || {};   // lessonId → {score, ts, tries}
S.srs = S.srs || {};     // itemKey → {ef, ivl, due, reps, lapses, ex?}
S.log = S.log || {};     // "YYYY-MM-DD" → {l: lessons, r: reviews, e: errors}
S.meta = S.meta || { created: Date.now(), checks: 0 };

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* full/blocked */ }
}
function today() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function bumpLog(field, by) {
  var t = today();
  var row = S.log[t] || (S.log[t] = { l: 0, r: 0, e: 0 });
  row[field] += (by || 1);
  save();
}

/* SM-2. quality: 5 first-try pass, 4 pass-with-warning, 3 pass after retry, 1 fail */
function review(key, quality, ex) {
  var it = S.srs[key] || (S.srs[key] = { ef: 2.5, ivl: 0, due: 0, reps: 0, lapses: 0 });
  if (ex) it.ex = ex;                       // snapshot so reviews can re-render authored items
  if (quality >= 3) {
    if (it.reps === 0) it.ivl = 1;
    else if (it.reps === 1) it.ivl = 3;
    else it.ivl = Math.round(it.ivl * it.ef);
    it.reps += 1;
  } else {
    it.reps = 0;
    it.ivl = 1;
    it.lapses += 1;
  }
  it.ef = Math.max(1.3, it.ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  it.due = Date.now() + it.ivl * DAY;
  save();
}
function schedule(key, ex) {              // enter an item into the queue (due tomorrow)
  if (!S.srs[key]) {
    S.srs[key] = { ef: 2.5, ivl: 1, due: Date.now() + DAY, reps: 1, lapses: 0, ex: ex || null };
    save();
  }
}
function dueItems() {
  var now = Date.now(), out = [];
  for (var k in S.srs) if (S.srs[k].due <= now) out.push(k);
  out.sort(function (a, b) { return S.srs[a].due - S.srs[b].due; });
  return out;
}
function dueCount() { return dueItems().length; }

function markLesson(id, score) {
  var prev = S.done[id];
  S.done[id] = { score: Math.max(score, prev ? prev.score : 0), ts: Date.now(), tries: (prev ? prev.tries : 0) + 1 };
  bumpLog("l");
  save();
}
function streak() {
  var s = 0, d = new Date();
  // today counts if active; otherwise start from yesterday
  function k(dt) { return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0"); }
  if (!S.log[k(d)]) d.setDate(d.getDate() - 1);
  while (S.log[k(d)]) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

window.STATE = {
  raw: S, save: save, today: today, bumpLog: bumpLog,
  review: review, schedule: schedule, dueItems: dueItems, dueCount: dueCount,
  markLesson: markLesson, streak: streak,
  reset: function () { localStorage.removeItem(KEY); location.reload(); }
};
})();
