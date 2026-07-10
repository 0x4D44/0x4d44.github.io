// Span of Control — UI layer. All rules live in engine.js; all words in
// content.js; this file only presents, animates, and forwards choices.

import * as engine from "./engine.js";
import * as content from "./content.js";
import * as storage from "./storage.js";

const $ = (id) => document.getElementById(id);

const screens = {
  menu: $("screen-menu"),
  game: $("screen-game"),
  ending: $("screen-ending"),
  wisdom: $("screen-wisdom"),
};

let store = storage.load();
let state = null;
let inputLocked = false;
let wisdomReturn = "menu";
let pendingEnding = null;

/* ------------------------------ audio ------------------------------ */
let audioCtx = null;
function ctx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
function tone(freq, dur, type, gainPeak, when = 0) {
  const ac = ctx();
  if (!ac || store.muted) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ac.currentTime + when;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(gainPeak, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}
const sfx = {
  flick: () => tone(660, 0.09, "triangle", 0.12),
  deal: () => tone(320, 0.07, "sine", 0.08),
  chime: () => { tone(880, 0.5, "sine", 0.14); tone(1320, 0.7, "sine", 0.08, 0.09); },
  end: () => { tone(220, 0.6, "sine", 0.14); tone(165, 0.9, "sine", 0.1, 0.12); },
};

/* ------------------------------ helpers ------------------------------ */
function show(name) {
  for (const key of Object.keys(screens)) screens[key].classList.toggle("hidden", key !== name);
  window.scrollTo(0, 0);
}

function homilyById(id) {
  return content.HOMILIES.find((h) => h.id === id) || null;
}
function endingById(id) {
  return content.ENDINGS.find((e) => e.id === id) || null;
}

function statTiles(el, pairs) {
  el.innerHTML = "";
  for (const [value, label] of pairs) {
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    const v = document.createElement("span");
    v.className = "stat-value";
    v.textContent = String(value);
    const l = document.createElement("span");
    l.className = "stat-label";
    l.textContent = label;
    tile.append(v, l);
    el.append(tile);
  }
}

/* ------------------------------ menu ------------------------------ */
function renderMenu() {
  statTiles($("menu-stats"), [
    [store.runs, "careers"],
    [`${store.homilies.length}/${content.HOMILIES.length}`, "wisdom"],
    [`${store.endings.length}/${content.ENDINGS.length}`, "exits found"],
    [store.bestWeeks, "best weeks"],
  ]);
  $("wisdom-count").textContent = String(store.homilies.length);
}

/* ------------------------------ HUD ------------------------------ */
function renderMeters(deltas) {
  for (const key of engine.METER_KEYS) {
    const meter = $(`meter-${key}`);
    const value = state.meters[key];
    meter.querySelector(".meter-fill").style.width = `${value}%`;
    meter.classList.toggle("danger", value <= 15 || value >= 85);
    if (deltas && deltas[key]) {
      meter.classList.remove("meter-bump");
      void meter.offsetWidth;
      meter.classList.add("meter-bump");
    }
  }
  const hc = $("meter-headcount");
  $("headcount-value").textContent = String(state.headcount);
  hc.classList.toggle("danger", state.headcount <= 1 || state.headcount >= engine.HEADCOUNT_APEX - 8);
  if (deltas && deltas.headcount) {
    hc.classList.remove("meter-bump");
    void hc.offsetWidth;
    hc.classList.add("meter-bump");
  }
  $("job-title").textContent = engine.titleFor(state.headcount, engine.quarterOf(state));
  $("week-indicator").textContent = `Q${engine.quarterOf(state)} · W${engine.weekOfQuarter(state)}`;
}

/* ------------------------------ card ------------------------------ */
const KIND_TAG = {
  email: "E-mail",
  invite: "Invite",
  chat: "Chat",
  memo: "Memo",
  postit: "Post-it",
  slide: "Slide",
  report: "Report",
  ritual: "Ritual",
};

function cardHeader(card) {
  const person = content.CAST[card.cast] || content.CAST.company;
  const head = $("card-head");
  head.innerHTML = "";
  const from = document.createElement("span");
  from.className = "from";
  from.textContent = `${person.name} — ${person.role}`;
  head.append(from);
  if (card.kind === "chat") {
    const ch = document.createElement("span");
    ch.className = "channel";
    ch.textContent = card.title && card.title.startsWith("#") ? card.title : "direct message";
    head.append(ch);
  }
}

function renderCard(card) {
  const el = $("card");
  el.dataset.kind = card.kind || "email";
  let tag = el.querySelector(".card-kind-tag");
  if (!tag) {
    tag = document.createElement("span");
    tag.className = "card-kind-tag";
    el.append(tag);
  }
  tag.textContent = KIND_TAG[card.kind] || "Item";
  cardHeader(card);
  $("card-title").textContent = card.title && !card.title.startsWith("#") ? card.title : (card.title || "");
  $("card-text").textContent = card.text;

  // affected-meter dots (union of both choices; which way is the mystery)
  const affects = $("card-affects");
  affects.innerHTML = "";
  const touched = new Set();
  for (const side of [card.left, card.right]) {
    if (!side || !side.effects) continue;
    for (const key of Object.keys(side.effects)) touched.add(key);
    if (side.headcount) touched.add("headcount");
  }
  if (touched.size) {
    const label = document.createElement("span");
    label.textContent = "moves:";
    affects.append(label);
    for (const key of ["leadership", "team", "you", "headcount"]) {
      if (!touched.has(key)) continue;
      const dot = document.createElement("span");
      dot.className = `affect-dot dot-${key}`;
      dot.title = key;
      affects.append(dot);
    }
  }

  $("btn-left").textContent = card.left.label;
  $("btn-right").textContent = card.right.label;
  $("drag-hint-left").textContent = card.left.label;
  $("drag-hint-right").textContent = card.right.label;

  el.style.transform = "";
  el.classList.remove("flyout-left", "flyout-right");
  el.classList.remove("dealing");
  void el.offsetWidth;
  el.classList.add("dealing");
  sfx.deal();
}

function dealNext() {
  const card = engine.draw(state, content);
  if (!card) {
    // Content ran dry (should be prevented by tests): end gracefully.
    finishRun("long-service");
    return;
  }
  renderCard(card);
  inputLocked = false;
}

/* ------------------------------ choosing ------------------------------ */
function choose(side) {
  if (inputLocked || !state || state.ended) return;
  inputLocked = true;
  sfx.flick();

  const el = $("card");
  el.classList.add(side === "left" ? "flyout-left" : "flyout-right");

  const outcome = engine.choose(state, content, side);
  if (!outcome) return;

  window.setTimeout(() => {
    renderMeters(outcome.deltas);
    const quip = $("quip");
    quip.textContent = outcome.quip || "";
    quip.classList.toggle("show", !!outcome.quip);

    const proceed = () => {
      if (outcome.ending) {
        pendingEnding = outcome.ending;
        window.setTimeout(() => finishRun(pendingEnding), 900);
      } else {
        window.setTimeout(dealNext, 420);
      }
    };

    if (outcome.homilyId) showHomily(outcome.homilyId, proceed);
    else proceed();
  }, 300);
}

/* ------------------------------ homily overlay ------------------------------ */
// The overlay declares role="dialog" aria-modal="true", so it must behave like a
// modal: the page behind it goes `inert` (out of the tab order and the a11y
// tree), focus moves into the dialog, and lands back where it started on close.
let homilyContinue = null;
let homilyReturnFocus = null;
const behindOverlay = () => [document.querySelector("header.chrome"), $("main")];

function showHomily(id, done) {
  const homily = homilyById(id);
  if (!homily) { done(); return; }
  if (store.homilies.includes(id)) { done(); return; } // only NEW wisdom interrupts
  store.homilies.push(id);
  storage.save(store);
  $("wisdom-count").textContent = String(store.homilies.length);
  $("homily-text").textContent = `“${homily.text}”`;
  $("homily-attr").textContent = `— ${homily.attribution}`;
  // capture focus before inerting: inerting its ancestor would blur it first
  homilyReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  $("homily-pop").classList.remove("hidden");
  for (const el of behindOverlay()) el?.setAttribute("inert", "");
  $("btn-homily-ok").focus();
  sfx.chime();
  homilyContinue = done;
}
$("btn-homily-ok").addEventListener("click", () => {
  $("homily-pop").classList.add("hidden");
  for (const el of behindOverlay()) el?.removeAttribute("inert"); // before refocusing
  const back = homilyReturnFocus;
  homilyReturnFocus = null;
  if (back?.isConnected) back.focus();
  const go = homilyContinue;
  homilyContinue = null;
  if (go) go();
});

/* ------------------------------ ending ------------------------------ */
function finishRun(endingId) {
  state.ended = endingId;
  store = storage.recordRun(store, state);
  sfx.end();

  const ending = endingById(endingId) || content.ENDINGS[0];
  const doc = $("ending-doc");
  doc.dataset.doc = ending.doc || "memo";
  $("ending-kind").textContent = (ending.doc || "internal document").replace(/-/g, " ");
  $("ending-title").textContent = ending.title;
  const body = $("ending-body");
  body.innerHTML = "";
  for (const para of ending.body.split("\n\n")) {
    const p = document.createElement("p");
    p.textContent = para;
    body.append(p);
  }
  $("ending-epitaph").textContent = ending.epitaph;

  statTiles($("ending-stats"), [
    [state.weekCount, "weeks survived"],
    [state.headcount, "final headcount"],
    [state.unlocked.length, "wisdom gained"],
    [`${store.endings.length}/${content.ENDINGS.length}`, "exits found"],
  ]);
  renderMenu();
  show("ending");
}

/* ------------------------------ wisdom board ------------------------------ */
function renderWisdom() {
  const board = $("corkboard");
  board.innerHTML = "";
  let unlockedCount = 0;
  for (const homily of content.HOMILIES) {
    const owned = store.homilies.includes(homily.id);
    if (owned) unlockedCount += 1;
    const card = document.createElement("div");
    card.className = "wisdom-card" + (owned ? "" : " locked");
    const quote = document.createElement("blockquote");
    quote.textContent = owned ? `“${homily.text}”` : "· · · · · · · ·";
    const cite = document.createElement("cite");
    cite.textContent = owned ? `— ${homily.attribution}` : "wisdom not yet earned";
    card.append(quote, cite);
    board.append(card);
  }
  $("wisdom-progress").textContent =
    `${unlockedCount} of ${content.HOMILIES.length} laminated · earned through questionable decisions`;
}

/* ------------------------------ drag ------------------------------ */
(function wireDrag() {
  const el = $("card");
  const THRESHOLD = 90;
  let startX = null;
  let dx = 0;

  el.addEventListener("pointerdown", (ev) => {
    if (inputLocked) return;
    startX = ev.clientX;
    dx = 0;
    el.classList.add("dragging");
    el.setPointerCapture(ev.pointerId);
  });
  el.addEventListener("pointermove", (ev) => {
    if (startX === null) return;
    dx = ev.clientX - startX;
    el.style.transform = `translateX(${dx}px) rotate(${dx * 0.05}deg)`;
    const t = Math.min(1, Math.abs(dx) / THRESHOLD);
    $("drag-hint-left").style.opacity = dx < 0 ? String(t) : "0";
    $("drag-hint-right").style.opacity = dx > 0 ? String(t) : "0";
  });
  const release = () => {
    if (startX === null) return;
    startX = null;
    el.classList.remove("dragging");
    $("drag-hint-left").style.opacity = "0";
    $("drag-hint-right").style.opacity = "0";
    if (Math.abs(dx) >= THRESHOLD) {
      choose(dx < 0 ? "left" : "right");
    } else {
      el.style.transition = "transform .25s cubic-bezier(.2,1.2,.4,1)";
      el.style.transform = "";
      window.setTimeout(() => { el.style.transition = ""; }, 260);
    }
    dx = 0;
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
})();

/* ------------------------------ wiring ------------------------------ */
$("btn-left").addEventListener("click", () => choose("left"));
$("btn-right").addEventListener("click", () => choose("right"));

document.addEventListener("keydown", (ev) => {
  if (screens.game.classList.contains("hidden")) return;
  if (!$("homily-pop").classList.contains("hidden")) {
    if (ev.key === "Enter" || ev.key === " ") $("btn-homily-ok").click();
    return;
  }
  if (ev.key === "ArrowLeft") choose("left");
  if (ev.key === "ArrowRight") choose("right");
});

function startRun() {
  state = engine.newGame((Math.random() * 0x7fffffff) | 0);
  $("quip").textContent = "";
  $("quip").classList.remove("show");
  renderMeters(null);
  show("game");
  dealNext();
}
$("btn-start").addEventListener("click", startRun);
$("btn-again").addEventListener("click", startRun);

$("btn-wisdom").addEventListener("click", () => {
  wisdomReturn = !screens.game.classList.contains("hidden") ? "game"
    : !screens.ending.classList.contains("hidden") ? "ending" : "menu";
  renderWisdom();
  show("wisdom");
});
$("btn-ending-wisdom").addEventListener("click", () => {
  wisdomReturn = "ending";
  renderWisdom();
  show("wisdom");
});
$("btn-wisdom-back").addEventListener("click", () => show(wisdomReturn));

$("btn-mute").addEventListener("click", () => {
  store = storage.setMuted(store, !store.muted);
  $("btn-mute").textContent = store.muted ? "Sound: off" : "Sound: on";
});

/* ------------------------------ boot ------------------------------ */
$("btn-mute").textContent = store.muted ? "Sound: off" : "Sound: on";
renderMenu();
if (window.location.hash === "#play") startRun();
else show("menu");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* offline is a bonus */ });
  });
}
