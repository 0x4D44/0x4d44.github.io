// Minimal Standard MIDI File writer (format 1) for the SKYBLITZ composer scripts.
// Times are in BEATS (quarter notes). One MTrk per channel, plus a tempo/meta track that also fixes the exact length.
const PPQ = 480;

function vlq(n) {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const str = (s) => [...Buffer.from(s, 'latin1')];
function chunk(id, bytes) { return [...str(id), ...u32(bytes.length), ...bytes]; }

function trackBytes(events) {
  // events: {tick, order, bytes}
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out = []; let last = 0;
  for (const e of events) { out.push(...vlq(Math.max(0, e.tick - last)), ...e.bytes); last = e.tick; }
  return chunk('MTrk', out);
}

/**
 * song = { bpm, lengthBeats, channels: [{ ch, program, name, vol (0..127), pan (0..127), reverb, notes:[{t,d,n,v}] }], tempoMap?: [{t,bpm}] }
 * Returns a Buffer. Notes are clamped into [0, lengthBeats]; note-off at t+d (min 1 tick).
 */
export function writeSMF(song) {
  const tracks = [];
  const meta = [
    { tick: 0, order: 0, bytes: [0xff, 0x03, 8, ...str('SKYBLITZ')] },
    { tick: 0, order: 1, bytes: [0xff, 0x58, 4, 4, 2, 24, 8] },
  ];
  const tempos = song.tempoMap || [{ t: 0, bpm: song.bpm }];
  for (const tm of tempos) {
    const us = Math.round(60000000 / tm.bpm);
    meta.push({ tick: Math.round(tm.t * PPQ), order: 2, bytes: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] });
  }
  meta.push({ tick: Math.round(song.lengthBeats * PPQ), order: 9, bytes: [0xff, 0x2f, 0] });
  tracks.push(trackBytes(meta));
  const endTick = Math.round(song.lengthBeats * PPQ);
  for (const c of song.channels) {
    const ev = [];
    const nm = str(c.name || `ch${c.ch}`);
    ev.push({ tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(nm.length), ...nm] });
    ev.push({ tick: 0, order: 1, bytes: [0xb0 | c.ch, 7, c.vol ?? 100] });
    ev.push({ tick: 0, order: 1, bytes: [0xb0 | c.ch, 10, c.pan ?? 64] });
    if (c.reverb != null) ev.push({ tick: 0, order: 1, bytes: [0xb0 | c.ch, 91, c.reverb] });
    if (c.ch !== 9) ev.push({ tick: 0, order: 2, bytes: [0xc0 | c.ch, c.program ?? 0] });
    for (const n of c.notes) {
      let on = Math.round(n.t * PPQ);
      if (on < 0 || on >= endTick) continue;
      let off = Math.round((n.t + n.d) * PPQ);
      off = Math.min(Math.max(off, on + 1), endTick);
      const pitch = Math.max(0, Math.min(127, Math.round(n.n))), vel = Math.max(1, Math.min(127, Math.round(n.v ?? 90)));
      ev.push({ tick: on, order: 5, bytes: [0x90 | c.ch, pitch, vel] });
      ev.push({ tick: off, order: 4, bytes: [0x80 | c.ch, pitch, 0] });
    }
    // the synth ends a render at the last note-off: park an inaudible note (drum key 0, velocity 1) on the final tick so the length is exact
    if (c.ch === 9) { ev.push({ tick: Math.max(0, endTick - 2), order: 5, bytes: [0x99, 0, 1] }); ev.push({ tick: endTick, order: 4, bytes: [0x89, 0, 0] }); }
    for (const cc of c.cc || []) ev.push({ tick: Math.round(cc.t * PPQ), order: 3, bytes: [0xb0 | c.ch, cc.n, cc.v] });
    ev.push({ tick: endTick, order: 9, bytes: [0xff, 0x2f, 0] });
    tracks.push(trackBytes(ev));
  }
  const header = chunk('MThd', [...u16(1), ...u16(tracks.length), ...u16(PPQ)]);
  return Buffer.from([...header, ...tracks.flat()]);
}
