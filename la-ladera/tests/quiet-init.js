// Injected before any page script by tests/chrome.mjs (Page.addScriptToEvaluateOnNewDocument). A plain script, not a module.
//
// The automated browser shares a desk with a person. Two web APIs reach past the page into their machine, so the page gets silent twins:
//  * Pointer lock: headless=new Chrome still asks Windows to ClipCursor() the REAL mouse into its (invisible) window box.
//  * Speech synthesis: the OS voice talks out loud through the speakers; --mute-audio does not cover it.
// The twins keep the contract the page can see (promises, events, state), so game code and tests walk the same paths as in a real browser.
// What was "spoken" is readable as data in window.__quiet.spoken.
(() => {
  try {
    if (window.__quiet) return;
    const quiet = window.__quiet = { version: 1, locks: 0, spoken: [] };
    const later = (fn, ms = 0) => setTimeout(fn, ms);
    const mark = (fn) => { fn.__quiet = true; return fn; };
    const define = (proto, name, desc) => Object.defineProperty(proto, name, { configurable: true, ...desc });

    // ---- pointer lock: lives in the page, never reaches the OS -------------------------------------------------------------------
    let locked = null;
    const tell = (type) => document.dispatchEvent(new Event(type));
    define(Element.prototype, 'requestPointerLock', { writable: true, value: mark(function requestPointerLock() {
      if (!this.isConnected) { later(() => tell('pointerlockerror')); return Promise.reject(new DOMException('The element is not in the document.', 'InvalidStateError')); }
      if (locked !== this) { locked = this; quiet.locks++; later(() => tell('pointerlockchange')); }
      return Promise.resolve();
    }) });
    define(Document.prototype, 'exitPointerLock', { writable: true, value: mark(function exitPointerLock() {
      if (locked) { locked = null; later(() => tell('pointerlockchange')); }
    }) });
    define(Document.prototype, 'pointerLockElement', { get: mark(function pointerLockElement() { return locked && locked.isConnected ? locked : null; }) });

    // ---- speech: recorded and timed, never voiced (getVoices() stays real so voice selection runs as it does for a person) ----------
    const SS = window.SpeechSynthesis && window.SpeechSynthesis.prototype;
    if (SS && window.SpeechSynthesisUtterance) {
      const queue = []; let current = null, timer = 0;
      const emit = (u, type, init = {}) => {
        try {
          const E = type === 'error' ? window.SpeechSynthesisErrorEvent : window.SpeechSynthesisEvent;
          u.dispatchEvent(E ? new E(type, { utterance: u, ...init }) : new Event(type));
        } catch { /* a handler threw: the page's problem, as with a real engine */ }
      };
      const pump = () => {
        if (current || !queue.length) return;
        const u = current = queue.shift(), t0 = performance.now(), n = String(u.text ?? '').length;
        emit(u, 'start', { charIndex: 0, elapsedTime: 0 });
        timer = later(() => { if (current !== u) return; current = null; emit(u, 'end', { charIndex: n, elapsedTime: performance.now() - t0 }); pump(); },
          Math.max(250, n * 50 / (u.rate > 0 ? u.rate : 1)));      // about the pace of a real voice, so dialogue timing is realistic
      };
      define(SS, 'speak', { writable: true, value: mark(function speak(u) {
        if (!(u instanceof window.SpeechSynthesisUtterance)) throw new TypeError("Failed to execute 'speak' on 'SpeechSynthesis': parameter 1 is not of type 'SpeechSynthesisUtterance'.");
        quiet.spoken.push({ text: u.text, lang: u.lang || u.voice?.lang || '', voice: u.voice?.name ?? null, rate: u.rate, pitch: u.pitch, volume: u.volume, t: Math.round(performance.now()) });
        queue.push(u); later(pump);
      }) });
      define(SS, 'cancel', { writable: true, value: mark(function cancel() {
        const gone = [...(current ? [current] : []), ...queue.splice(0)]; current = null; clearTimeout(timer);
        for (const u of gone) emit(u, 'error', { error: 'canceled' });
      }) });
      define(SS, 'speaking', { get: mark(function speaking() { return !!current; }) });
      define(SS, 'pending', { get: mark(function pending() { return queue.length > 0; }) });
    }
  } catch (e) { try { console.warn('quiet-init failed: ' + e); } catch { /* nothing to report to */ } }
})();
