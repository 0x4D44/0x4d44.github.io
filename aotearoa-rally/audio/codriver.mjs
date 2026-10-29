// Co-driver. Part 1 is a pure scheduling core (no DOM, unit-tested). Part 2 wraps speechSynthesis.
import { clamp } from "../core/mathx.mjs";

/** Distance ahead of a note at which it should be voiced (metres), for speed v (m/s). */
export const lookahead = (v) => clamp(Math.abs(v || 0) * 2.6, 40, 220);
/** Estimated seconds to speak `text` at speech rate `rate` (about 3 words per second at rate 1, plus a short lead-in). */
export const speechSeconds = (text, rate = 1) => 0.25 + (String(text || "").trim().split(/\s+/).filter(Boolean).length / 2.6) / Math.max(0.5, rate);
/** Extra metres of look-ahead for a call that takes time to say: its spoken duration at speed v, capped at 2 s (and MAX_LEAD_S overall). */
export const leadExtra = (text, v) => Math.min(speechSeconds(text, speechRate(v)), 2.0) * Math.abs(v || 0);
/** Speech rate multiplier for speed v (m/s). */
export const speechRate = (v) => clamp(0.95 + Math.abs(v || 0) / 70, 0.95, 1.5);

/** Longest lead a call may have, in seconds (the look-ahead floor of 40 m would otherwise start slow-car calls 5-7 s early). */
export const MAX_LEAD_S = 4.5;
/** Seconds of speech that still end before the feature when the call starts at its normal lead (look-ahead time plus the capped extra). */
export const speechBudget = (v) => Math.max(1.5, lookahead(v) / Math.max(Math.abs(v || 0), 8) + 2.0 - 0.9);
/** Stage position at which a call with spoken text `text` for a note at `noteS` (normal start `baseAt`) should begin. */
export const callStart = (noteS, baseAt, text, v) => Math.max(baseAt - leadExtra(text, v), noteS - Math.max(MAX_LEAD_S * Math.abs(v || 0), 25));

const stripInto = (t) => t.replace(/^\s*into\s+/i, "");
function lowerFirst(t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : t; }

/**
 * createScheduler: decides WHAT to say and WHEN. update() returns an utterance {text, rate, note, merged}
 * or null. The caller says whether speech is currently in progress; the scheduler never returns a new
 * phrase while `busy` is true, and never repeats a note.
 */
export function createScheduler(opts = {}) {
  const maxMerge = opts.maxMerge ?? 3;
  const maxQueue = opts.maxQueue ?? 3;
  const queue = []; // {text, s, end, notes}
  let next = 0, lastS = -Infinity;
  let notesRef = null;
  const st = { spoken: 0, dropped: 0, merged: 0 };

  function enqueueDue(notes, s, v) {
    const L = lookahead(v);
    while (next < notes.length) {
      const n = notes[next];
      // the call takes time to say: start early enough that it ENDS about lookahead before the feature
      const baseAt = typeof n.lead === "function" ? n.lead(v) : n.s - L;
      const voiceAt = callStart(n.s, baseAt, n.speak || n.text, v);
      if (s < voiceAt) break;
      // too late: the feature is already behind us
      if (n.s - s < -Math.max(4, (n.length || 0) * 0.4) && n.kind !== "finish") { next++; st.dropped++; continue; }
      // gather following notes that begin soon after this one ends -> "A into B"
      if (n.chained && !n.speak) { next++; continue; } // words already spoken by the head of its chain
      let text = n.speak || n.text || "";
      let end = n.s + (n.length || 0);
      const group = [n];
      const gap = clamp(Math.abs(v) * 0.9, 18, 70);
      let j = next + 1;
      // absorb silent chained continuations of this note
      while (j < notes.length && notes[j].chained && !notes[j].speak) { end = Math.max(end, notes[j].s + (notes[j].length || 0)); j++; }
      while (group.length < maxMerge && j < notes.length) {
        const m = notes[j];
        if (m.s - end > gap || m.kind === "start" || m.kind === "finish" || !m.speak) break;
        const cand = text + (/\binto\b\s*$/i.test(text) ? " " : ", into ") + lowerFirst(stripInto(m.speak));
        // never merge beyond what can be said before the first feature arrives (split into two calls instead)
        if (speechSeconds(cand, speechRate(v)) > speechBudget(v)) break;
        text = cand;
        end = Math.max(end, m.s + (m.length || 0));
        group.push(m);
        j++;
        while (j < notes.length && notes[j].chained && !notes[j].speak) { end = Math.max(end, notes[j].s + (notes[j].length || 0)); j++; }
      }
      // the merged call is longer than the head note alone: start only once it will also END before the feature
      if (s < callStart(n.s, baseAt, text, v)) break;
      next = j;
      if (group.length > 1) st.merged += group.length - 1;
      queue.push({ text: text.replace(/\s+/g, " ").trim(), s: n.s, end: n.s, notes: group, sev: Math.min(...group.map((g) => g.severity || 6)) });
      while (queue.length > maxQueue) {
        // drop the least urgent (highest severity number = flatter) of the older items, keep the nearest
        let k = 0;
        for (let q = 1; q < queue.length - 1; q++) if (queue[q].sev > queue[k].sev) k = q;
        queue.splice(k, 1);
        st.dropped++;
      }
    }
  }

  return {
    stats: st,
    get queued() { return queue.length; },
    get nextIndex() { return next; },
    reset(sNow = 0, notes = notesRef) {
      queue.length = 0;
      next = 0;
      if (notes) { notesRef = notes; while (next < notes.length && notes[next].s < sNow - 4) next++; }
    },
    setNotes(notes, sNow = 0) { notesRef = notes; this.reset(sNow, notes); },
    /** Jump the note cursor to stage position s: drops the queue and re-arms every note at or after s - 4 m. */
    seek(s) {
      queue.length = 0; next = 0; lastS = s;
      if (notesRef) while (next < notesRef.length && notesRef[next].s < s - 4) next++;
    },
    update(notes, s, v, busy) {
      if (notes && notes !== notesRef) { notesRef = notes; queue.length = 0; next = 0; while (next < notes.length && notes[next].s < s - 4) next++; }
      if (!notesRef) return null;
      // a car teleported back (respawn / restart): rewind
      // (any backwards jump of more than 15 m, however short: a respawn 100 m back must re-arm the notes it skipped)
      if (next > 0 && (lastS - s > 15 || (notesRef[next - 1] && notesRef[next - 1].s - s > 300))) { queue.length = 0; next = 0; while (next < notesRef.length && notesRef[next].s < s - 4) next++; }
      lastS = s;
      enqueueDue(notesRef, s, v);
      // discard queued items we have already driven past
      while (queue.length && queue[0].s - s < -8) { queue.shift(); st.dropped++; }
      if (busy || !queue.length) return null;
      const it = queue.shift();
      st.spoken++;
      return { text: it.text, rate: speechRate(v), note: it.notes[0], merged: it.notes.length, s: it.s };
    },
  };
}

/** Voice preference: en-NZ, en-AU, en-GB, then any English. Pure. */
export function pickVoice(voices, preferredName) {
  if (!voices || !voices.length) return null;
  if (preferredName) { const f = voices.find((v) => v.name === preferredName); if (f) return f; }
  for (const lang of ["en-nz", "en-au", "en-gb", "en-ie", "en-za", "en-us", "en"]) {
    const hits = voices.filter((v) => (v.lang || "").toLowerCase().replace("_", "-").startsWith(lang));
    if (hits.length) return hits.find((v) => v.localService) || hits[0];
  }
  return null;
}

/**
 * Browser wrapper. `deps` allows injection for tests: { synth, Utterance, beep(sev, dir), volume() }.
 */
export function createCodriver(deps = {}) {
  const synth = deps.synth !== undefined ? deps.synth : (typeof speechSynthesis !== "undefined" ? speechSynthesis : null);
  const Utter = deps.Utterance || (typeof SpeechSynthesisUtterance !== "undefined" ? SpeechSynthesisUtterance : null);
  const sched = createScheduler();
  let token = 0, current = null, interrupted = null;
  let enabled = true, voiceName = null, voice = null, speaking = false, busyUntil = 0, voices = [], clock = 0, paused = false;
  let useBeeps = !synth || !Utter;
  const volume = deps.volume || (() => 1);

  function refreshVoices() {
    if (!synth || !synth.getVoices) return;
    voices = synth.getVoices() || [];
    voice = pickVoice(voices, voiceName);
  }
  if (synth) {
    refreshVoices();
    try { if (synth.addEventListener) synth.addEventListener("voiceschanged", refreshVoices); else synth.onvoiceschanged = refreshVoices; } catch { /* ignore */ }
  }

  function say(text, rate = 1) {
    if (!enabled || !text) return false;
    if (useBeeps || (synth && !voice && !voices.length && clock > 6)) {
      if (deps.beep) deps.beep(text);
      speaking = true; busyUntil = clock + 0.7;
      return true;
    }
    try {
      const u = new Utter(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-GB";
      u.rate = rate; u.pitch = 1; u.volume = clamp(volume(), 0, 1);
      // a stale end/error event from a cancelled utterance must not clear the state of the one now speaking
      const my = ++token;
      current = { text, rate };
      u.onend = u.onerror = () => { if (my === token) { speaking = false; current = null; } };
      speaking = true;
      busyUntil = clock + 1.2 + text.length * 0.11 / rate + 1.5; // safety net if onend never fires
      synth.speak(u);
      return true;
    } catch { useBeeps = true; speaking = false; return false; }
  }

  return {
    scheduler: sched,
    get enabled() { return enabled; },
    get speaking() { return speaking; },
    get usingBeeps() { return useBeeps; },
    enable(b) { enabled = !!b; if (!enabled) this.cancel(); },
    setVoice(name) { voiceName = name || null; refreshVoices(); },
    listVoices() { refreshVoices(); return voices.map((v) => ({ name: v.name, lang: v.lang })); },
    say(text) { return say(text, 1); },
    cancel() { token++; current = null; interrupted = null; try { if (synth && synth.cancel) synth.cancel(); } catch { /* ignore */ } speaking = false; },
    pause(b) {
      b = !!b;
      if (b === paused) return;
      paused = b;
      if (paused) {
        // keep a call that was cut off mid-sentence so it is said again on resume
        const keep = speaking && current ? current : null;
        this.cancel();
        interrupted = keep;
      }
    },
    /** Jump the note cursor (respawn / teleport / restart). */
    seek(s) { this.cancel(); sched.seek(s); },
    /** Call every frame with the stage (needs .pacenotes), current s and speed (m/s). dt in seconds. */
    update(stage, s, speedMs, dt = 1 / 60) {
      clock += dt;
      if (speaking && clock > busyUntil) speaking = false;
      if (!enabled || paused || !stage || !stage.pacenotes) return;
      if (interrupted) { const it = interrupted; interrupted = null; say(it.text, it.rate); return; }
      const utt = sched.update(stage.pacenotes, s, speedMs, speaking);
      if (utt) say(utt.text, utt.rate);
    },
    reset(sNow = 0) { this.cancel(); sched.reset(sNow); },
  };
}
