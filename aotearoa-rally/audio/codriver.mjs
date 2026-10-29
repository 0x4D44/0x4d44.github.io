// Co-driver. Part 1 is a pure scheduling core (no DOM, unit-tested). Part 2 wraps speechSynthesis.
import { clamp } from "../core/mathx.mjs";

/** Distance ahead of a note at which it should be voiced (metres), for speed v (m/s). */
export const lookahead = (v) => clamp(Math.abs(v || 0) * 2.6, 40, 220);
/** Speech rate multiplier for speed v (m/s). */
export const speechRate = (v) => clamp(0.95 + Math.abs(v || 0) / 70, 0.95, 1.5);

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
  let next = 0;
  let notesRef = null;
  const st = { spoken: 0, dropped: 0, merged: 0 };

  function enqueueDue(notes, s, v) {
    const L = lookahead(v);
    while (next < notes.length) {
      const n = notes[next];
      const voiceAt = typeof n.lead === "function" ? n.lead(v) : n.s - L;
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
        text += (/\binto\b\s*$/i.test(text) ? " " : ", into ") + lowerFirst(stripInto(m.speak));
        end = Math.max(end, m.s + (m.length || 0));
        group.push(m);
        j++;
        while (j < notes.length && notes[j].chained && !notes[j].speak) { end = Math.max(end, notes[j].s + (notes[j].length || 0)); j++; }
      }
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
    update(notes, s, v, busy) {
      if (notes && notes !== notesRef) { notesRef = notes; queue.length = 0; next = 0; while (next < notes.length && notes[next].s < s - 4) next++; }
      if (!notesRef) return null;
      // a car teleported back (respawn / restart): rewind
      if (next > 0 && notesRef[next - 1] && notesRef[next - 1].s - s > 300) { queue.length = 0; next = 0; while (next < notesRef.length && notesRef[next].s < s - 4) next++; }
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
      u.onend = u.onerror = () => { speaking = false; };
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
    cancel() { try { if (synth && synth.cancel) synth.cancel(); } catch { /* ignore */ } speaking = false; },
    pause(b) { paused = !!b; if (paused) this.cancel(); },
    /** Call every frame with the stage (needs .pacenotes), current s and speed (m/s). dt in seconds. */
    update(stage, s, speedMs, dt = 1 / 60) {
      clock += dt;
      if (speaking && clock > busyUntil) speaking = false;
      if (!enabled || paused || !stage || !stage.pacenotes) return;
      const utt = sched.update(stage.pacenotes, s, speedMs, speaking);
      if (utt) say(utt.text, utt.rate);
    },
    reset(sNow = 0) { this.cancel(); sched.reset(sNow); },
  };
}
