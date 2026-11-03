/* Chapter: Moonlight. Each model wrote the sonata's opening from memory as JSON notes;
   we draw a piano roll, play it with a small synth, and offer it as a MIDI file. */
Zoo.chapter("moonlight", ["moonlight"], function (el, data) {
  var h = Zoo.h, D = data.moonlight, M = D.models || {};

  Zoo.head(el, "Chapter 6", "Moonlight",
    "Beethoven’s <em>Moonlight</em> Sonata opens with a slow, rocking triplet figure over deep octaves in the bass. " +
    "We asked each model to write the first bars from memory as a list of notes. No model can listen to music, so this is recall of a score " +
    "it has only read about. Each strip is a piano roll: time runs left to right, higher notes sit higher. Press play to hear it on a plain synthesised piano, or take the MIDI file.",
    D.prompt);

  // The reference: bars 1–4 as written (alla breve, here counted in quarter-note beats).
  // Right hand: triplet quavers, 12 per bar, a third of a beat each. Left hand: octaves.
  function reference() {
    var notes = [], T = 1 / 3;
    var rh = [
      [[56, 61, 64], [56, 61, 64], [56, 61, 64], [56, 61, 64]],   // bar 1: C♯ minor, G♯ C♯ E
      [[56, 61, 64], [56, 61, 64], [57, 61, 64], [57, 61, 64]],   // bar 2: then A C♯ E
      [[57, 61, 64], [57, 61, 64], [57, 62, 66], [57, 62, 66]],   // bar 3: A major, then D major over F♯
      [[56, 60, 66], [56, 61, 64], [56, 61, 63], [54, 60, 63]],   // bar 4: G♯7, C♯ minor, to the dominant
    ];
    rh.forEach(function (bar, b) {
      bar.forEach(function (trip, q) {
        trip.forEach(function (p, i) {
          notes.push({ pitch: p, start: b * 4 + q + i * T, dur: T, vel: 48 });
        });
      });
    });
    var lh = [[37, 49, 0, 4], [35, 47, 4, 4], [33, 45, 8, 2], [30, 42, 10, 2], [32, 44, 12, 4]];
    lh.forEach(function (o) {
      notes.push({ pitch: o[0], start: o[2], dur: o[3], vel: 60 });
      notes.push({ pitch: o[1], start: o[2], dur: o[3], vel: 60 });
    });
    return { ok: true, tempo: 54, notes: notes, warnings: [] };
  }

  var ids = Zoo.order(Object.keys(M));
  if (!ids.length) {
    el.appendChild(h("p", { class: "note", text: "The answers to this question are still being collected. Meanwhile, here is what the models were aiming at." }));
  }
  var grid = h("div", { class: "grid wide" });
  el.appendChild(grid);
  var refHead = h("h3", null, [h("span", { class: "who", text: "Reference: the first bars as Beethoven wrote them" })]);
  grid.appendChild(card(refHead, reference(), null, "reference", "Beethoven, Op. 27 No. 2, bars 1–4"));
  ids.forEach(function (id) {
    var r = M[id], song = Moonlight.parseReply(r.text || "");
    grid.appendChild(card(Zoo.cardHead(id), song, r, id, Zoo.model(id).label));
  });

  // One AudioContext for the whole page, made on the first press; one tune at a time.
  var ctx = null, playing = null;
  function stopPlaying() {
    if (!playing) return;
    playing.handle.stop();
    clearTimeout(playing.timer);
    playing.btn.textContent = "Play";
    playing.btn.setAttribute("aria-pressed", "false");
    playing = null;
  }

  function card(head, song, r, key, label) {
    var kids = [head];
    if (!song.ok) {
      kids.push(h("div", { class: "roll empty" }, [h("p", { text: "Nothing to play: " + song.reason + "." })]));
      if (r && r.text) kids.push(h("details", { class: "source" }, [h("summary", { text: "The reply" }), h("pre", null, [h("code", { text: r.text })])]));
    } else {
      var beats = 0, lo = 127, hi = 0;
      song.notes.forEach(function (n) { beats = Math.max(beats, n.start + n.dur); lo = Math.min(lo, n.pitch); hi = Math.max(hi, n.pitch); });
      var cv = h("canvas", { role: "img", "aria-label": "Piano roll: " + song.notes.length + " notes from " + noteName(lo) + " to " + noteName(hi) });
      var wrap = h("div", { class: "roll" }, [cv]);
      kids.push(wrap);
      roll(wrap, cv, song, beats, lo, hi, key === "reference");
      var secs = beats * 60 / song.tempo;
      kids.push(h("div", { class: "facts", text: song.notes.length + " notes · " + Math.round(song.tempo) + " bpm · " +
        (Math.round(beats * 10) / 10) + " beats (" + Math.round(secs) + " s) · " + noteName(lo) + "–" + noteName(hi) }));
      if (song.warnings.length) kids.push(h("div", { class: "warn", text: "Fixed on the way in: " + song.warnings.join("; ") }));
      var btn = h("button", { type: "button", class: "play", "aria-pressed": "false", text: "Play" });
      btn.addEventListener("click", function () {
        var mine = playing && playing.btn === btn;
        stopPlaying();
        if (mine) return;
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { btn.textContent = "No audio here"; return; }
        if (!ctx) ctx = new AC();
        if (ctx.state === "suspended") ctx.resume();
        var handle = Moonlight.play(song, ctx);
        btn.textContent = "Stop";
        btn.setAttribute("aria-pressed", "true");
        var me = { btn: btn, handle: handle };
        me.timer = setTimeout(function () { if (playing === me) stopPlaying(); }, (secs + 1.5) * 1000);
        playing = me;
      });
      var url = URL.createObjectURL(new Blob([Moonlight.toMidi(song)], { type: "audio/midi" }));
      var file = "moonlight-" + key.replace(/[^a-z0-9.-]+/gi, "_") + ".mid";
      kids.push(h("div", { class: "actions" }, [btn, h("a", { href: url, download: file, text: "Download .mid" })]));
    }
    if (r) kids.push(Zoo.metaLine(r));
    else kids.push(h("div", { class: "meta", text: label }));
    return h("div", { class: "card" + (key === "reference" ? " ref" : "") }, kids);
  }

  function noteName(p) {
    return ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][p % 12] + (Math.floor(p / 12) - 1);
  }

  function roll(wrap, cv, song, beats, lo, hi, isRef) {
    function paint() {
      var w = wrap.clientWidth, ht = wrap.clientHeight;
      if (!w || !ht) return;
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(w * dpr); cv.height = Math.round(ht * dpr);
      cv.style.width = w + "px"; cv.style.height = ht + "px";
      var g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, ht);
      var cs = getComputedStyle(wrap);
      var span = Math.max(12, hi - lo + 3), pad = 6;
      var x = function (b) { return pad + (w - 2 * pad) * b / beats; };
      var rowH = (ht - 2 * pad) / span;
      var off = (span - (hi - lo)) / 2;
      var y = function (p) { return pad + (hi - p + off) * rowH; };
      g.strokeStyle = cs.getPropertyValue("--roll-grid").trim() || "#ccc";
      g.lineWidth = 1;
      for (var b = 0; b <= beats + 1e-9; b += 4) {  // bar lines every four beats
        var bx = Math.round(x(b)) + 0.5;
        g.beginPath(); g.moveTo(bx, pad); g.lineTo(bx, ht - pad); g.stroke();
      }
      g.fillStyle = cs.getPropertyValue(isRef ? "--roll-ref" : "--roll-note").trim() || "#2a78d6";
      var bh = Math.max(2, Math.min(6, rowH - 1));
      song.notes.forEach(function (n) {
        var x0 = x(n.start), x1 = x(n.start + n.dur), yy = y(n.pitch) - bh / 2;
        var bw = Math.max(2, x1 - x0 - 1);
        g.beginPath();
        if (g.roundRect) g.roundRect(x0, yy, bw, bh, Math.min(bh / 2, bw / 2)); else g.rect(x0, yy, bw, bh);
        g.fill();
      });
    }
    if (window.ResizeObserver) new ResizeObserver(paint).observe(wrap);
    requestAnimationFrame(paint);
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", paint);
    }
  }
});
