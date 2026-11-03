(function (root) {
  "use strict";

  function num(x) {
    if (typeof x === "string" && x.trim() !== "") x = Number(x);
    return typeof x === "number" && isFinite(x) ? x : null;
  }

  function extractObject(text) {
    var s = text.indexOf("{");
    var e = text.lastIndexOf("}");
    if (s < 0 || e <= s) return null;
    try { return JSON.parse(text.slice(s, e + 1)); } catch (_) { return null; }
  }

  function parseReply(text) {
    try {
      if (typeof text !== "string" || !text.trim()) return { ok: false, reason: "empty reply" };
      var obj = extractObject(text);
      if (!obj || typeof obj !== "object") return { ok: false, reason: "no parseable JSON object" };
      var warnings = [];
      var tempo = num(obj.tempo_bpm);
      if (tempo === null || tempo < 20 || tempo > 300) {
        warnings.push("tempo_bpm " + (obj.tempo_bpm === undefined ? "missing" : "out of range or invalid") + "; defaulted to 60");
        tempo = 60;
      }
      if (!Array.isArray(obj.notes)) return { ok: false, reason: "notes is not an array" };
      var notes = [], dropped = 0, velFixed = 0;
      obj.notes.forEach(function (n) {
        if (!Array.isArray(n)) { dropped++; return; }
        var p = num(n[0]), s = num(n[1]), d = num(n[2]);
        if (p === null || s === null || d === null) { dropped++; return; }
        p = Math.round(p);
        if (p < 0 || p > 127 || s < 0 || d <= 0) { dropped++; return; }
        var v = num(n[3]);
        if (v === null) {
          v = 64;
          if (n.length > 3 && n[3] != null) velFixed++;
        } else {
          var c = Math.min(127, Math.max(1, Math.round(v)));
          if (c !== v) velFixed++;
          v = c;
        }
        notes.push({ pitch: p, start: s, dur: d, vel: v });
      });
      if (dropped) warnings.push("dropped " + dropped + " invalid note" + (dropped === 1 ? "" : "s"));
      if (velFixed) warnings.push("adjusted velocity on " + velFixed + " note" + (velFixed === 1 ? "" : "s"));
      if (!notes.length) return { ok: false, reason: "no valid notes" };
      return { ok: true, tempo: tempo, notes: notes, warnings: warnings };
    } catch (err) {
      return { ok: false, reason: "parse error: " + (err && err.message) };
    }
  }

  var PPQ = 480;

  function vlq(n, out) {
    var stack = [n & 0x7f];
    n = Math.floor(n / 128);
    while (n > 0) { stack.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
    for (var i = stack.length - 1; i >= 0; i--) out.push(stack[i]);
  }

  function toMidi(song) {
    var tempo = num(song.tempo) || 60;
    var events = [];
    var sorted = song.notes.map(function (n, i) {
      var st = Math.round(n.start * PPQ);
      var en = Math.max(st + 1, Math.round((n.start + n.dur) * PPQ));
      return {
        p: Math.min(127, Math.max(0, Math.round(n.pitch))), st: st, en: en,
        v: Math.min(127, Math.max(1, Math.round(n.vel == null ? 64 : n.vel))), i: i
      };
    }).sort(function (a, b) { return a.st - b.st || a.i - b.i; });
    // Same-pitch overlap: cut the earlier note at the later note's onset.
    var lastByPitch = {};
    sorted.forEach(function (n) {
      var prev = lastByPitch[n.p];
      if (prev && prev.en > n.st) prev.en = Math.max(prev.st + 1, n.st);
      lastByPitch[n.p] = n;
    });
    sorted.forEach(function (n) {
      events.push({ tick: n.st, order: 1, bytes: [0x90, n.p, n.v] });
      events.push({ tick: n.en, order: 0, bytes: [0x80, n.p, 0] });
    });
    events.sort(function (a, b) { return a.tick - b.tick || a.order - b.order; });

    var t = [];
    var us = Math.round(60000000 / tempo);
    t.push(0, 0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff);
    t.push(0, 0xc0, 0);
    var cur = 0;
    events.forEach(function (e) {
      vlq(e.tick - cur, t);
      cur = e.tick;
      for (var k = 0; k < e.bytes.length; k++) t.push(e.bytes[k]);
    });
    t.push(0, 0xff, 0x2f, 0);

    var len = t.length;
    var head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff,
      0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff];
    var arr = new Uint8Array(head.length + len);
    arr.set(head, 0);
    arr.set(t, head.length);
    return arr;
  }

  function play(song, ctx) {
    var spb = 60 / (num(song.tempo) || 60);
    var t0 = ctx.currentTime + 0.1;
    var master = ctx.createGain();
    master.gain.value = Math.min(0.5, 2.5 / Math.sqrt(Math.max(1, song.notes.length) / 4 + 4));
    master.connect(ctx.destination);
    var nodes = [];
    var stopped = false;
    song.notes.forEach(function (n) {
      var f = 440 * Math.pow(2, (n.pitch - 69) / 12);
      var start = t0 + n.start * spb;
      var dur = Math.max(0.15, n.dur * spb);
      var end = start + dur + 0.6;
      var peak = 0.35 * Math.pow((n.vel == null ? 64 : n.vel) / 127, 1.5) + 0.02;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.008);
      g.gain.exponentialRampToValueAtTime(peak * 0.25, start + Math.min(dur, 1.2));
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      g.connect(master);
      [["triangle", 1, 1], ["sine", 2, 0.25]].forEach(function (o) {
        var osc = ctx.createOscillator();
        osc.type = o[0];
        osc.frequency.value = f * o[1];
        var og = ctx.createGain();
        og.gain.value = o[2];
        osc.connect(og);
        og.connect(g);
        osc.start(start);
        osc.stop(end + 0.05);
        nodes.push(osc);
      });
    });
    return {
      stop: function () {
        if (stopped) return;
        stopped = true;
        nodes.forEach(function (o) { try { o.stop(); } catch (_) {} });
        try { master.disconnect(); } catch (_) {}
      }
    };
  }

  var api = { parseReply: parseReply, toMidi: toMidi, play: play };
  root.Moonlight = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
