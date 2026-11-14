// Cab, door and platform audio (WebAudio) + PA via speechSynthesis. Everything guarded; starts after a user gesture.
//  - The running sound is mostly real recordings (SAMPLES, credited in models/credits.json): the rumble and the traction inverter's whine are seamless loops whose pitch and level follow the train
//    (runningMix), and the brake hiss is a pair of one-shots played when the brake is let off (ReleaseDetector). The wheel squeal is still synthesised. update() drives all of it from the sim state.
//  - The doors - opening with its chime, closing with its warning beeps - are real recordings too, each cut to the sim's 2.6 s door travel so sound and leaves stay in step.
//  - The recordings are fetched and decoded after the first gesture. Every recorded layer has a synthesised stand-in (the sound these replaced) which plays until its recording is ready - or for good,
//    if the file is missing or this browser cannot decode it, or the page is opened with ?sfx=synth - so nothing is ever silent. A door's sound goes through one per-event chain (level, stereo
//    position, muffling), so a train down the platform sounds like it is down the platform.

const AUDIO_DIR = typeof import.meta !== 'undefined' && import.meta.url ? new URL('../../audio/', import.meta.url).href : 'audio/';
/** the recorded sounds: name -> { file under glasgow-subway/audio/ (built by tools/make_door_audio.sh and tools/make_running_audio.py), gain (level trim: the files are peak-normalised, this sets them level
 *  with the synthesised stand-ins they replace - matched by A-weighted level, not by ear), credit (its name in models/credits.json), loop ([start, end] in seconds: a looping file holds the cycle between
 *  these, seamless, with a little of the same cycle either side so that the encoder's padding is never in the loop; both are whole numbers of 300ths of a second, which are whole samples at every
 *  rate a sound card is likely to run at - 44.1 and 48 kHz and their doubles - so the loop is exactly one cycle however the browser resamples the file) }. A door recording must run for the door travel, 2.6 s. */
export const SAMPLES = {
  doorOpen: { file: 'door-open.mp3', gain: 0.32, credit: 'London Underground 1995 Stock train doors opening' },
  doorClose: { file: 'door-close.mp3', gain: 0.4, credit: 'London Underground 1995 Stock train doors closing' },
  rumble: { file: 'rumble.mp3', gain: 0.39, loop: [120 / 300, 3133 / 300], credit: 'Tamsui Line, Taipei City - Tamsui Line (Taipei Metro)' },   // a 10.043 s cycle (241040 samples at 24 kHz, 442911 at 44.1 kHz)
  brakeHiss1: { file: 'brake-hiss-1.mp3', gain: 0.43, credit: 'Truck Air Brakes' },   // 0.75 s
  brakeHiss2: { file: 'brake-hiss-2.mp3', gain: 0.39, credit: 'Air Break' },   // 1.5 s
};
/** ?sfx=synth: use the synthesised sounds only (to compare, or when the recordings are unwanted) */
const SYNTH_ONLY = typeof location !== 'undefined' && /[?&]sfx=synth(&|$)/.test(location.search || '');

const REACH_REF = 4;   // metres within which a sound arrives at full level
/** how a sound made `dist` metres from the listener arrives: its level (1 = as recorded) and the cutoff (Hz) of the low-pass that muffles it - 0 = none. Inverse distance with a
 *  little extra absorption (it is a tunnel full of people and tiles), and the highs go first. */
export function reach(dist) {
  const d = Math.max(0, dist || 0);
  if (d <= REACH_REF) return { gain: 1, lp: 0 };
  return { gain: Math.pow(REACH_REF / d, 1.3), lp: Math.max(900, 16000 / (1 + (d - REACH_REF) / 12)) };
}
/** stereo position -1 (left) .. 1 (right) of a source at offset (dx, dz) from a listener whose right-hand vector is (rx, rz); centred when it is on top of you */
export function panOf(dx, dz, rx, rz) {
  const d = Math.hypot(dx, dz); if (d < 0.5) return 0;
  return Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / d) * 0.85 * Math.min(1, d / 3)));
}

// ---- synthesised sound parts (BaseAudioContext, destination node, start time) - also render offline for the tests (renderSynth)
const NOISE = new WeakMap();
function noiseBuf(c) {
  let b = NOISE.get(c);
  if (!b) { b = c.createBuffer(1, Math.floor(c.sampleRate * 2), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; NOISE.set(c, b); }
  return b;
}
/** a puff of filtered noise: o = { dur, type, f, f2 (glide to), q, gain, a (attack s) } */
function burst(c, out, t, o) {
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), a = Math.min(o.a == null ? 0.01 : o.a, o.dur * 0.5);
  s.buffer = noiseBuf(c); s.loop = true; f.type = o.type || 'bandpass'; f.Q.value = o.q == null ? 0.7 : o.q;
  f.frequency.setValueAtTime(o.f, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 1.2); s.stop(t + o.dur + 0.03);
}
/** a dull thump: a sine that falls in pitch and dies quickly, with a bit of body: o = { f, f2, dur, gain } */
function knock(c, out, t, o) {
  const os = c.createOscillator(), g = c.createGain(); os.type = 'sine';
  os.frequency.setValueAtTime(o.f, t); os.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  os.connect(g); g.connect(out); os.start(t); os.stop(t + o.dur + 0.02);
  burst(c, out, t, { dur: Math.min(0.06, o.dur), type: 'lowpass', f: 900, q: 0.7, gain: o.gain * 0.5, a: 0.002 });
}
/** a wheel crossing a rail joint: a thump through the floor and the ring of the rail. gain 0..1.4 */
function clack(c, out, t, gain) {
  const j = 0.9 + Math.random() * 0.2;
  knock(c, out, t, { f: 105 * j, f2: 52, dur: 0.085, gain: 0.28 * gain });
  burst(c, out, t, { dur: 0.045, type: 'bandpass', f: 720 * j, q: 0.9, gain: 0.24 * gain, a: 0.001 });
  burst(c, out, t, { dur: 0.016, type: 'bandpass', f: 2500 * j, q: 1.4, gain: 0.08 * gain, a: 0.0006 });
}
/** one beep of the warning sounder: a near-square tone (odd harmonics), hard-edged: o = { f, dur, gain } */
function beep(c, out, t, o) {
  const g = c.createGain(), d = o.dur; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + 0.004); g.gain.setValueAtTime(o.gain, t + d - 0.012); g.gain.linearRampToValueAtTime(0.0001, t + d);
  for (const [k, a] of [[1, 1], [3, 0.3], [5, 0.15]]) { const os = c.createOscillator(), og = c.createGain(); os.type = 'sine'; os.frequency.value = o.f * k; og.gain.value = a / 1.45; os.connect(og); og.connect(g); os.start(t); os.stop(t + d + 0.02); }
  g.connect(out);
}
/** a door motor: a sawtooth that rises as the leaves pick up speed and falls as they stop: o = { dur, f0, f1, gain } */
function whirr(c, out, t, o) {
  const os = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(); os.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = 900;
  os.frequency.setValueAtTime(o.f0, t); os.frequency.linearRampToValueAtTime(o.f1, t + o.dur * 0.4); os.frequency.linearRampToValueAtTime(o.f0 * 0.8, t + o.dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + 0.2); g.gain.setValueAtTime(o.gain, t + Math.max(0.2, o.dur - 0.25)); g.gain.linearRampToValueAtTime(0.0001, t + o.dur);
  os.connect(lp); lp.connect(g); g.connect(out); os.start(t); os.stop(t + o.dur + 0.02);
}
export const BEEP_HZ = 2100, BEEP_EVERY = 0.25, BEEP_LEN = 0.12;   // the closing warning: pitch, spacing and length of a beep
export const DOOR_SECS = 2.6;   // how long the leaves take (the sim's DOOR_TIME): the door sounds are cut to this
/** the leaves running on their rollers: low, rumbly noise chattering at the track joints, swelling as they pick up speed and dying as they stop: o = { dur, gain, f, rate } */
function rolling(c, out, t, o) {
  const s = c.createBufferSource(), lp = c.createBiquadFilter(), am = c.createGain(), g = c.createGain(), lfo = c.createOscillator(), d = c.createGain();
  s.buffer = noiseBuf(c); s.loop = true; lp.type = 'lowpass'; lp.frequency.value = o.f || 380; lp.Q.value = 0.7;
  am.gain.value = 0.65; lfo.type = 'triangle'; lfo.frequency.value = o.rate || 11; d.gain.value = 0.35; lfo.connect(d); d.connect(am.gain);   // 0.65 +- 0.35, never negative
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + 0.3); g.gain.setValueAtTime(o.gain, t + Math.max(0.3, o.dur - 0.35)); g.gain.linearRampToValueAtTime(0.0001, t + o.dur);
  s.connect(lp); lp.connect(am); am.connect(g); g.connect(out); s.start(t, Math.random() * 1.2); s.stop(t + o.dur + 0.03); lfo.start(t); lfo.stop(t + o.dur + 0.03);
}
/** doors opening: the lock lets go, air rushes into the cylinders and the leaves run back on their rollers with the motor spooling up and down, then the cylinders
 *  exhaust and the leaves meet their rubber end-stops */
export function synthDoorOpen(c, out, t, dur = DOOR_SECS) {
  burst(c, out, t, { dur: 0.03, type: 'highpass', f: 2500, gain: 0.18, a: 0.002 });                                   // lock clack
  knock(c, out, t + 0.015, { f: 150, f2: 70, dur: 0.1, gain: 0.25 });
  burst(c, out, t + 0.07, { dur: 0.5, type: 'bandpass', f: 3400, f2: 2200, q: 0.6, gain: 0.2, a: 0.04 });          // air in
  rolling(c, out, t + 0.1, { dur: dur - 0.35, gain: 0.2, f: 360, rate: 11 });
  burst(c, out, t + 0.5, { dur: dur - 1.0, type: 'bandpass', f: 2600, f2: 1800, q: 0.5, gain: 0.05, a: 0.4 });       // seals and leaves brushing
  whirr(c, out, t + 0.12, { dur: dur - 0.5, f0: 150, f1: 320, gain: 0.035 });
  burst(c, out, t + dur - 0.4, { dur: 0.3, type: 'bandpass', f: 2500, q: 0.6, gain: 0.13, a: 0.05 });              // exhaust
  knock(c, out, t + dur - 0.12, { f: 115, f2: 50, dur: 0.2, gain: 0.5 });                                          // end stops
  burst(c, out, t + dur - 0.12, { dur: 0.06, type: 'bandpass', f: 1400, q: 1, gain: 0.12, a: 0.002 });
}
/** doors closing: the warning sounder beeps all the way while the leaves slide shut, then they meet, the seals bite and the lock drops in */
export function synthDoorClose(c, out, t, dur = DOOR_SECS) {
  const n = Math.max(1, Math.floor((dur - 0.2) / BEEP_EVERY));
  for (let i = 0; i < n; i++) beep(c, out, t + i * BEEP_EVERY, { f: BEEP_HZ, dur: BEEP_LEN, gain: 0.2 });
  burst(c, out, t + 0.05, { dur: 0.4, type: 'bandpass', f: 3000, f2: 2000, q: 0.6, gain: 0.12, a: 0.04 });         // air in
  rolling(c, out, t + 0.1, { dur: dur - 0.4, gain: 0.2, f: 340, rate: 10 });
  burst(c, out, t + 0.4, { dur: dur - 1.0, type: 'bandpass', f: 2400, f2: 1600, q: 0.5, gain: 0.05, a: 0.4 });
  whirr(c, out, t + 0.1, { dur: dur - 0.5, f0: 140, f1: 290, gain: 0.03 });
  knock(c, out, t + dur - 0.14, { f: 105, f2: 45, dur: 0.24, gain: 0.55 });                                        // the leaves meet, the seals compress
  burst(c, out, t + dur - 0.14, { dur: 0.2, type: 'bandpass', f: 2200, q: 0.6, gain: 0.1, a: 0.01 });              // exhaust
  burst(c, out, t + dur + 0.0, { dur: 0.03, type: 'highpass', f: 2500, gain: 0.15, a: 0.002 });                    // lock drops in
  knock(c, out, t + dur + 0.0, { f: 190, f2: 110, dur: 0.08, gain: 0.2 });
}
/** the station PA's two-tone bell that comes before an announcement */
export function synthBong(c, out, t) {
  [[659.3, 0], [523.3, 0.42]].forEach(([f, dt]) => {
    for (const [k, a, d] of [[1, 1, 1.1], [2.01, 0.28, 0.6], [3.02, 0.1, 0.35]]) {
      const os = c.createOscillator(), g = c.createGain(), t0 = t + dt; os.type = 'sine'; os.frequency.value = f * k;
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.13 * a, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      os.connect(g); g.connect(out); os.start(t0); os.stop(t0 + d + 0.02);
    }
  });
}
/** test/analysis helper: one of the synthesised sounds rendered offline - mono Float32Array at `sr`, the sound starting 0.05 s in */
export async function renderSynth(kind, secs = 3.4, sr = 22050) {
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, c = new OC(1, Math.ceil(secs * sr), sr), m = c.createGain(); m.connect(c.destination);
  ({ doorOpen: synthDoorOpen, doorClose: synthDoorClose, bong: synthBong })[kind](c, m, 0.05);
  return (await c.startRendering()).getChannelData(0);
}

// ---- the running sound
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const OUTSIDE = 0.25;   // heard from the platform, a train is this much as loud as heard from inside it
/** m/s. The speed at which the rumble plays at the pitch it was recorded at, and at which the loops sit at the level SAMPLES calibrates them to. The recording's real speed is not known (a metro
 *  somewhere between stations), so this is a choice, not a measurement: see research/running-sounds.md. */
export const RUN_V = 12;

/** What the running sound is doing for a train state st = { v (m/s), traction 0..1, brake 0..1, curv (1/m), inTrain, doorsOpen }, as plain numbers: the one place the synthesised layers and the recorded
 *  ones both read it from. rel = how much the brake was let off since the last frame. For a recording, level 1 is the level SAMPLES calibrates it to and rate is its playback speed (1 = as recorded). */
export function runningMix(st, rel = 0, prevMode) {
  const v = Math.abs(st.v || 0), tr = st.traction || 0, br = st.brake || 0, inside = st.inTrain ? 1 : OUTSIDE, doors = st.doorsOpen ? 0.5 : 1, run = Math.min(1, v / RUN_V);
  const sq = Math.min(1, Math.abs(st.curv || 0) * 130) * Math.min(1, v / 8) * 0.12 + (br > 0.2 && v < 6 && v > 0.4 ? 0.07 * br : 0);
  const hold = (br > 0.1 ? br * 0.02 : 0) * inside;   // the faint hiss that goes on while the brake is applied
  return {
    inside, drive: tractionMix(st, prevMode), rail: railMix(st),
    // the synthesised layers: pitch or cutoff (Hz), and gain
    rumbleLP: 120 + v * 22, rumbleGain: Math.min(0.5, v * 0.028) * inside,
    squealHz: 2300 + v * 60, squealGain: sq * inside,
    hissGain: Math.min(0.18, rel * 6 + (br > 0.1 ? br * 0.02 : 0)) * inside, hissHold: hold,
    // the recorded layers. Rumble: its pitch follows the speed (rolling noise does: the same wheel and rail roughness passes faster) but less than in proportion, because the speed it was recorded
    // at is not known; its level follows the speed.
    rumbleRate: clamp(0.35 + 0.65 * v / RUN_V, 0.5, 1.25), rumbleLevel: Math.min(1.5, v / RUN_V) * inside,
  };
}

/** The track, as the things that make its sound. Chosen, not measured (see research/running-sounds.md):
 *  joint = metres between places where a rail may be jointed (most are welded: jointAt), axles = [metres behind the train's reference point, how loud heard from the car] for the wheelsets a
 *  rider hears (the two bogies of their own car, and more faintly the nearest bogie of the car at each end), corr = wavelength of rail corrugation (m), patch = length of the stretches it comes in (m). */
export const RAIL = { joint: 18.3, axles: [[0, 1], [1.9, 1], [8.2, 1], [10.1, 1], [-4.4, 0.45], [-2.5, 0.45], [12.6, 0.45], [14.5, 0.45]], corr: 0.048, patch: 55, sleeper: 0.65 };
const hash01 = (k) => { let x = Math.imul((k | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
/** how hard joint number k knocks, 0..1: the same every time a train passes it. Rather more than half are welded smooth (0) */
export function jointAt(k) { const h = hash01(k * 7 + 3); return h < 0.55 ? 0 : 0.2 + 0.8 * ((h - 0.55) / 0.45) ** 1.5; }
/** how corrugated the rail is at s metres round the line, 0..1: it comes in stretches, with clean rail between */
export function corrugation(s) { const u = s / RAIL.patch, k = Math.floor(u), f = u - k, w = f * f * (3 - 2 * f), n = hash01(k * 13 + 1) * (1 - w) + hash01((k + 1) * 13 + 1) * w; return clamp((n - 0.5) / 0.35, 0, 1); }
/** the wheels that cross a joint while the train's reference point moves from s0 to s1 (m, either way): [{ at: 0..1 of the move, gain }], in order */
export function jointHits(s0, s1) {
  const out = [], d = s1 - s0; if (!Number.isFinite(d) || d === 0 || Math.abs(d) > 8) return out;
  for (const [off, w] of RAIL.axles) {
    const a = s0 - off, b = s1 - off, lo = Math.min(a, b), hi = Math.max(a, b);
    for (let k = Math.floor(lo / RAIL.joint); k * RAIL.joint <= hi; k++) { if (k * RAIL.joint <= lo) continue; const g = jointAt(k); if (g > 0) out.push({ at: (k * RAIL.joint - a) / (b - a), gain: g * w }); }
  }
  return out.sort((p, q) => p.at - q.at);
}
/** What wheel on rail sounds like for a train state (as runningMix, with s = metres round the line where known), as plain numbers - Hz and gains:
 *    roar  the rolling noise proper: the roughness of wheel and rail, a broad band whose centre climbs with speed. Its level goes up about 9 dB for each doubling of speed
 *          ("30 log V", the textbook law for rolling noise), so amplitude as speed to the power 1.5.
 *    sing  the top of it, the hiss of the contact patch: rises faster.
 *    beat  no wheel is quite round: everything is a little louder once a turn (beatHz = turns of the wheel per second).
 *    corr  on corrugated stretches the rail "roars": a narrow band at speed / wavelength.
 *    joint how hard a joint knocks: in proportion to speed. */
export function railMix(st) {
  const v = Math.abs(st.v || 0), inside = st.inTrain ? 1 : OUTSIDE, run = v / RUN_V, law = Math.min(1.6, run ** 1.5), s = Number.isFinite(st.s) ? st.s : null;
  return {
    roarHz: 230 + 26 * v, roarGain: 0.12 * law * inside,
    singHz: 1250 + 90 * v, singGain: 0.012 * Math.min(1.8, run * run) * inside,
    beatHz: v / (Math.PI * DRIVE.wheel), beat: 0.16 * Math.min(1, v / 3),
    corrHz: Math.max(20, v / RAIL.corr), corrGain: s == null ? 0 : 0.06 * corrugation(s) * law * inside,
    jointGain: Math.min(1.4, run) * inside,
  };
}

/** The traction drive, as the things that make its sound. Taken as typical of a small three-phase metro drive, not measured on the Subway's Stadler sets (no open recording or data found):
 *  wheel = wheel diameter (m), gear = reduction ratio, pairs = motor pole pairs, teeth = pinion teeth, carrier = the inverter's switching frequency while it runs asynchronously (Hz),
 *  sync = [from m/s, pulses per cycle] - above each speed the inverter locks its switching to the motor, N pulses per electrical cycle. */
export const DRIVE = { wheel: 0.69, gear: 6.5, pairs: 2, teeth: 21, carrier: 1000, sync: [[6.5, 15], [10.5, 9]], band: 0.4 };
/** Which switching pattern the inverter is in at v m/s: 0 = asynchronous, 1.. = DRIVE.sync[n - 1]. prev = the pattern it was in: it changes only DRIVE.band m/s past a threshold, so a train
 *  holding a speed on a threshold does not flutter between two. */
export function driveMode(v, prev) {
  let m = 0; for (const [from] of DRIVE.sync) if (v >= from) m++;
  if (prev != null && prev !== m) { const edge = DRIVE.sync[Math.min(prev, m)][0]; if (Math.abs(v - edge) < DRIVE.band) return prev; }
  return m;
}
/** What the traction drive sounds like for a train state (as runningMix), as plain numbers - frequencies in Hz, gains 0..1:
 *    inv   the inverter: four tones, the pairs fc -+ 2 fe and 2 fc -+ fe either side of the switching frequency fc and its double, which is where a three-phase PWM drive puts its noise
 *          (fe = the motor's electrical frequency). They spread apart as the train gathers speed, and step when the switching pattern changes. Level follows the motor current: loud under
 *          power, less in regenerative braking (which fades out as the train stops), nothing coasting.
 *    gear  the reduction gear's mesh tone, in step with the wheels: there whenever the train moves (it is what is left when coasting), louder under load.
 *    growl the motor's own torque ripple, six times fe: low, under load only.
 *  mode = driveMode() for it (prev as there). The gains are set against the rolling noise (the recorded rumble and railMix together, A-weighted; the end-to-end test measures it): under full power the drive leads
 *  while the train pulls away, when there is little rolling noise, and sits a few dB under it at RUN_V. */
export function tractionMix(st, prev) {
  const v = Math.abs(st.v || 0), tr = clamp(st.traction || 0, 0, 1), br = clamp(st.brake || 0, 0, 1), inside = st.inTrain ? 1 : OUTSIDE, doors = st.doorsOpen ? 0.5 : 1;
  const wheelHz = v / (Math.PI * DRIVE.wheel), motorHz = wheelHz * DRIVE.gear, fe = motorHz * DRIVE.pairs, mode = driveMode(v, prev);
  const fc = mode ? DRIVE.sync[mode - 1][1] * fe : DRIVE.carrier;
  const load = Math.min(1, tr + 0.6 * br * Math.min(1, v / 4)) * Math.min(1, v / 0.3 + tr), k = inside * doors, moving = Math.min(1, v / 1.5);
  return {
    mode, fe, fc, load,
    inv: [Math.max(20, fc - 2 * fe), fc + 2 * fe, Math.max(20, 2 * fc - fe), 2 * fc + fe], side: [Math.max(20, fc - 4 * fe), fc + 4 * fe, Math.max(20, 2 * fc - 5 * fe), 2 * fc + 5 * fe], invGain: 0.010 * load * (mode ? 0.8 : 1) * k,
    gearHz: Math.max(20, motorHz * DRIVE.teeth), gearGain: (0.003 + 0.006 * load) * moving * Math.min(1, 0.35 + v / RUN_V) * k,
    growlHz: Math.max(20, 6 * fe), growlGain: 0.011 * load * moving * k,
  };
}

/** Spots a brake being let off. Feed it the brake level (0..1) every frame, with the time (s); it answers null, or - once, as a release begins - how much brake there was to let off (0..1).
 *  A release is a fall of `drop` from the highest the level has been since it last fell. After one it keeps quiet for `rest` s, a release of less than `min` is too gentle to hear, and a fall of
 *  more than `jump` in one frame is the train being put somewhere, not a brake being let off. */
export class ReleaseDetector {
  constructor(o = {}) { this.drop = o.drop ?? 0.12; this.min = o.min ?? 0.3; this.rest = o.rest ?? 2; this.jump = o.jump ?? 0.7; this.hi = 0; this.prev = 0; this.t = -1e9; }
  update(brake, now) {
    const b = brake > 0 ? brake : 0, prev = this.prev; this.prev = b;
    if (prev - b > this.jump) { this.hi = b; return null; }
    if (b >= this.hi) { this.hi = b; return null; }
    if (this.hi - b < this.drop) return null;
    const s = this.hi; this.hi = b;   // (what is let off next is measured from here)
    if (s < this.min || now - this.t < this.rest) return null;
    this.t = now; return Math.min(1, s);
  }
}

/** the synthesised running layers - traction drive, rumble, squeal, brake hiss - on any context, feeding `out`, all at silence: { inv[], invG, gear, gearG, growl, growlG, mLP, mG, rN, rLP, rG, sN, sBP, sG, hN, hHP, hG } */
function buildSynthLayers(c, out) {
  const L = {}, noise = noiseBuf(c), mkNoise = () => { const s = c.createBufferSource(); s.buffer = noise; s.loop = true; s.start(); return s; };
  // traction drive (tractionMix): inverter tones, gear mesh, motor growl, through the car body (a gentle low-pass). mG is its master gain
  L.mG = c.createGain(); L.mG.gain.value = 1; L.mLP = c.createBiquadFilter(); L.mLP.type = 'lowpass'; L.mLP.frequency.value = 3200; L.mLP.Q.value = 0.5; L.mLP.connect(L.mG); L.mG.connect(out);
  L.invG = c.createGain(); L.invG.gain.value = 0; L.invG.connect(L.mLP);
  L.inv = [1, 1, 0.45, 0.45].map((w) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = DRIVE.carrier; g.gain.value = w; o.connect(g); g.connect(L.invG); o.start(); return o; });
  // the weaker sidebands a real inverter has further out (fc -+ 4 fe, 2 fc -+ 5 fe): with them the whine is a cluster, not four clean notes
  L.side = [0.34, 0.34, 0.2, 0.2].map((w) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = DRIVE.carrier; g.gain.value = w; o.connect(g); g.connect(L.invG); o.start(); return o; });
  L.gear = c.createOscillator(); L.gear.setPeriodicWave(c.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.42, 0.2, 0.08])));
  L.gear.frequency.value = 20; L.gearG = c.createGain(); L.gearG.gain.value = 0; L.gearAM = c.createGain(); L.gearAM.gain.value = 1; L.gear.connect(L.gearG); L.gearG.connect(L.gearAM); L.gearAM.connect(L.mLP); L.gear.start();
  L.growl = c.createOscillator(); L.growl.type = 'sawtooth'; L.growl.frequency.value = 20; L.growlLP = c.createBiquadFilter(); L.growlLP.type = 'lowpass'; L.growlLP.frequency.value = 420;
  L.growlG = c.createGain(); L.growlG.gain.value = 0; L.growl.connect(L.growlLP); L.growlLP.connect(L.growlG); L.growlG.connect(L.mLP); L.growl.start();
  // a real drive is never dead steady: two slow wanderings of a few cents on everything, and a slight tremor on the gear tone (one tooth is never quite like the next)
  { const drift = c.createGain(); drift.gain.value = 1; for (const [hz, cents] of [[0.31, 5], [1.3, 2.5]]) { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = hz; g.gain.value = cents; o.connect(g); g.connect(drift); o.start(); }
    for (const o of [...L.inv, ...L.side, L.gear, L.growl]) drift.connect(o.detune);
    const tr = c.createOscillator(), tg = c.createGain(); tr.frequency.value = 11; tg.gain.value = 0.12; tr.connect(tg); tg.connect(L.gearAM.gain); tr.start(); }
  // rumble
  L.rN = mkNoise(); L.rLP = c.createBiquadFilter(); L.rLP.type = 'lowpass'; L.rLP.frequency.value = 180; L.rG = c.createGain(); L.rG.gain.value = 0;
  L.rN.connect(L.rLP); L.rLP.connect(L.rG); L.rG.connect(out);
  // wheel on rail (railMix): roar and sing are bands of noise, the corrugation a narrow one; all three swell once a turn of the wheel, and wander a little as the rail's roughness does
  L.railAM = c.createGain(); L.railAM.gain.value = 1; L.railAM.connect(out);
  const band = (q, f, at) => { const n = c.createBufferSource(), b = c.createBiquadFilter(), g = c.createGain(); n.buffer = noise; n.loop = true; n.start(0, at); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; g.gain.value = 0; n.connect(b); b.connect(g); g.connect(L.railAM); return [b, g]; };
  [L.roarBP, L.roarG] = band(0.55, 400, 0.37); [L.singBP, L.singG] = band(0.9, 1800, 0.91); [L.corrBP, L.corrG] = band(9, 250, 1.43);
  L.beat = c.createOscillator(); L.beat.frequency.value = 0; L.beatG = c.createGain(); L.beatG.gain.value = 0; L.beat.connect(L.beatG); L.beatG.connect(L.railAM.gain); L.beat.start();
  for (const [hz, depth] of [[0.23, 0.11], [0.61, 0.08], [1.7, 0.05]]) { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = hz; g.gain.value = depth; o.connect(g); g.connect(L.railAM.gain); o.start(); }
  // squeal
  L.sN = mkNoise(); L.sBP = c.createBiquadFilter(); L.sBP.type = 'bandpass'; L.sBP.frequency.value = 2600; L.sBP.Q.value = 14; L.sG = c.createGain(); L.sG.gain.value = 0;
  L.sN.connect(L.sBP); L.sBP.connect(L.sG); L.sG.connect(out);
  // brake hiss
  L.hN = mkNoise(); L.hHP = c.createBiquadFilter(); L.hHP.type = 'highpass'; L.hHP.frequency.value = 3500; L.hG = c.createGain(); L.hG.gain.value = 0;
  L.hN.connect(L.hHP); L.hHP.connect(L.hG); L.hG.connect(out);
  return L;
}
/** steer the synthesised layers L to a mix p (runningMix) from time t. A layer named in rec has a recording playing in its place: it is faded out (the hiss keeps only its faint steady part). */
function applySynth(L, t, p, rec = {}) {
  // the drive. Its frequencies follow the train at once (a change of switching pattern is a step, not a glide); its levels follow over a tenth of a second or so
  { const d = p.drive, step = L.driveMode != null && L.driveMode !== d.mode; L.driveMode = d.mode;
    d.inv.forEach((hz, i) => { if (step) L.inv[i].frequency.setValueAtTime(hz, t); else L.inv[i].frequency.setTargetAtTime(hz, t, 0.03); });
    d.side.forEach((hz, i) => { if (step) L.side[i].frequency.setValueAtTime(hz, t); else L.side[i].frequency.setTargetAtTime(hz, t, 0.03); });
    L.gear.frequency.setTargetAtTime(d.gearHz, t, 0.05); L.growl.frequency.setTargetAtTime(d.growlHz, t, 0.05);
    L.invG.gain.setTargetAtTime(d.invGain, t, 0.09); L.gearG.gain.setTargetAtTime(d.gearGain, t, 0.15); L.growlG.gain.setTargetAtTime(d.growlGain, t, 0.12); }
  { const r = p.rail;
    L.roarBP.frequency.setTargetAtTime(r.roarHz, t, 0.2); L.roarG.gain.setTargetAtTime(r.roarGain, t, 0.2); L.singBP.frequency.setTargetAtTime(r.singHz, t, 0.2); L.singG.gain.setTargetAtTime(r.singGain, t, 0.2);
    L.corrBP.frequency.setTargetAtTime(r.corrHz, t, 0.15); L.corrG.gain.setTargetAtTime(r.corrGain, t, 0.35); L.beat.frequency.setTargetAtTime(r.beatHz, t, 0.2); L.beatG.gain.setTargetAtTime(r.beat, t, 0.3); }
  L.rLP.frequency.setTargetAtTime(p.rumbleLP, t, 0.2); L.rG.gain.setTargetAtTime(rec.rumble ? 0 : p.rumbleGain, t, 0.2);
  L.sBP.frequency.setTargetAtTime(p.squealHz, t, 0.2); L.sG.gain.setTargetAtTime(p.squealGain, t, 0.15);
  L.hG.gain.setTargetAtTime(rec.hiss ? p.hissHold : p.hissGain, t, 0.05);
}
/** a looping recording running into `out`, silent until driveLoop() gives it a level; it starts part-way round its cycle (phase 0..1, by default anywhere) so that no two sessions begin alike */
function startLoop(c, out, buf, loop, phase = Math.random()) {
  const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; src.loop = true; src.loopStart = loop[0]; src.loopEnd = loop[1]; g.gain.value = 0;
  src.connect(g); g.connect(out); src.start(0, loop[0] + phase * (loop[1] - loop[0]) * 0.999); return { src, g };
}
function driveLoop(l, t, gain, rate) { l.g.gain.setTargetAtTime(gain, t, 0.2); l.src.playbackRate.setTargetAtTime(rate, t, 0.25); }
/** test/analysis helper: the running sound for train state st rendered offline - mono Float32Array, `secs` long at `sr`. The layers are the synthesised ones, except those with a decoded recording in
 *  rec ({ rumble }), which plays as the engine plays it (the drive is always synthesised); only = 'rumble' | 'motor' | 'rail' | 'joints' | 'squeal' | 'hiss' hears that layer alone, or an array of them (rail = the steady wheel-on-rail noise, joints = the knocks, for a train running from st.s at st.v); rel = brake let off this frame (it drives the synthesised hiss).
 *  Levels settle over about a second, so judge the end of it. */
export async function renderRunning(st, { secs = 4, sr = 22050, rel = 0, rec = {}, only } = {}) {
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, c = new OC(1, Math.ceil(secs * sr), sr), m = c.createGain(); m.connect(c.destination);
  const L = buildSynthLayers(c, m), p = Object.assign({}, runningMix(st, rel)), keep = (k) => !only || only === k || (Array.isArray(only) && only.includes(k));
  if (!keep('motor')) p.drive = Object.assign({}, p.drive, { invGain: 0, gearGain: 0, growlGain: 0 });
  if (!keep('rumble')) { p.rumbleGain = 0; p.rumbleLevel = 0; }
  if (!keep('squeal')) p.squealGain = 0;
  if (!keep('rail')) p.rail = Object.assign({}, p.rail, { roarGain: 0, singGain: 0, corrGain: 0 });
  if (!keep('hiss')) { p.hissGain = 0; p.hissHold = 0; }
  applySynth(L, 0, p, { rumble: !!rec.rumble });
  for (const k of ['rumble']) if (rec[k]) driveLoop(startLoop(c, m, rec[k], SAMPLES[k].loop, 0), 0, SAMPLES[k].gain * p[k + 'Level'], p[k + 'Rate']);
  if (keep('joints') && Number.isFinite(st.s) && st.v) { const h = 1 / 60; for (let t = 0; t < secs; t += h) for (const k of jointHits(st.s + st.v * t, st.s + st.v * (t + h))) clack(c, m, t + k.at * h, k.gain * p.rail.jointGain); }
  return (await c.startRendering()).getChannelData(0);
}

export class SimAudio {
  constructor() { this.ctx = null; this.muted = false; this.ok = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext); this.speechOn = typeof window !== 'undefined' && 'speechSynthesis' in window; this.vol = 0.8; this.started = false; this.hidden = false; this.blocked = 0;
    this.buf = {}; this.loadErr = {}; this.plays = {}; this.last = null; this.cut = 0; this._voice = new WeakMap(); this._speakT = 0;
    this.loops = {}; this.release = new ReleaseDetector(); this.run = null; this.lastHiss = null; this._attachVisibility(); }
  /** All sound goes silent immediately while the tab is hidden / page backgrounded (and stays silent until it returns); the manual mute flag is kept. */
  _attachVisibility() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    this._vis = () => this.setHidden(!!document.hidden || document.visibilityState === 'hidden');
    this._pagehide = () => this.setHidden(true);
    this._blur = () => setTimeout(() => { if (document.hidden) this.setHidden(true); }, 0);
    document.addEventListener('visibilitychange', this._vis); window.addEventListener('pagehide', this._pagehide); window.addEventListener('pageshow', this._vis); window.addEventListener('blur', this._blur); document.addEventListener('freeze', this._pagehide);
    this.hidden = !!document.hidden;
  }
  setHidden(h) {
    h = !!h; if (this.hidden === h && !(h && this.ctx && this.ctx.state === 'running')) return; this.hidden = h;
    if (h) {
      if (this._speakT) { clearTimeout(this._speakT); this._speakT = 0; }
      if (this.speechOn) try { speechSynthesis.cancel(); } catch (e) {}
      if (this.master && this.ctx) try { this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.value = 0; } catch (e) {}
      if (this.ctx && this.ctx.state === 'running') try { this.ctx.suspend(); } catch (e) {}
      if (typeof document !== 'undefined') for (const a of document.querySelectorAll('audio,video')) try { if (!a.paused) { a.dataset.simPaused = '1'; a.pause(); } } catch (e) {}
    } else {
      if (this.master && this.ctx) try { this.master.gain.value = this.muted ? 0 : this.vol; } catch (e) {}
      if (this.ctx && this.ctx.state === 'suspended' && this.started) try { this.ctx.resume(); } catch (e) {}
      if (typeof document !== 'undefined') for (const a of document.querySelectorAll('audio[data-sim-paused]')) try { delete a.dataset.simPaused; a.play(); } catch (e) {}
    }
  }
  state() {
    return { hidden: this.hidden, muted: this.muted, ctx: this.ctx ? this.ctx.state : 'none', gain: this.master ? this.master.gain.value : null, speaking: this.speechOn ? !!(speechSynthesis.speaking || speechSynthesis.pending) : false, blocked: this.blocked,
      samples: Object.fromEntries(Object.keys(SAMPLES).map((k) => [k, !!this.buf[k]])), loadErr: Object.assign({}, this.loadErr), plays: Object.assign({}, this.plays), cut: this.cut, last: this.last,
      loops: Object.keys(this.loops), run: this.run, lastHiss: this.lastHiss };
  }
  /** fetch + decode the recorded sounds (once, after the first gesture); a file that fails leaves its synthesised stand-in in place */
  async _loadSamples() {
    const c = this.ctx; if (!c || this._loading || SYNTH_ONLY) return; this._loading = true;
    await Promise.all(Object.entries(SAMPLES).map(async ([name, s]) => {
      try {
        const r = await fetch(AUDIO_DIR + s.file); if (!r.ok) throw new Error('HTTP ' + r.status);
        const ab = await r.arrayBuffer();
        const buf = await new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(() => {}); });
        if (this.ctx === c) { this.buf[name] = buf; this._ready(name); }
      } catch (e) { this.loadErr[name] = String(e && e.message || e); }
    }));
  }
  /** a recording has just been decoded: a looping one starts running (silent until update() gives it a level, which also fades its synthesised stand-in out) */
  _ready(name) {
    const s = SAMPLES[name]; if (!s.loop || this.loops[name] || !this.ctx || !this.master) return;
    try { this.loops[name] = startLoop(this.ctx, this.master, this.buf[name], s.loop); } catch (e) { this.loadErr[name] = String(e && e.message || e); }
  }
  async start() {
    if (this.hidden) return;
    if (!this.ok || this.started) { if (this.ctx && this.ctx.state === 'suspended') try { await this.ctx.resume(); } catch (e) {} return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol; this.master.connect(c.destination);
      Object.assign(this, buildSynthLayers(c, this.master));   // the synthesised running layers: inv gear growl mLP mG (traction drive), rN rLP rG (rumble), sN sBP sG (squeal), hN hHP hG (brake hiss)
      this.started = true; this._lastBrake = 0;
      this._loadSamples();
    } catch (e) { this.ok = false; }
  }
  setMuted(m) { this.muted = m; if (this.master && !this.hidden) this.master.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, 0.05); if (m && this.speechOn) try { speechSynthesis.cancel(); } catch (e) {} }
  /** st: { v (m/s), traction 0..1, brake 0..1, curv (1/m), inCab (bool), inTrain, doorsOpen } */
  update(st) {
    if (!this.started || !this.ctx || this.hidden) return; const t = this.ctx.currentTime, b = st.brake || 0;
    const p = runningMix(st, Math.max(0, this._lastBrake - b), this._driveMode); this._lastBrake = b; this._driveMode = p.drive.mode;
    const L = this.loops, hiss = !!(this.buf.brakeHiss1 || this.buf.brakeHiss2);
    applySynth(this, t, p, { rumble: !!L.rumble, hiss });   // a layer whose recording is running is faded out of the synthesised mix
    const rumble = SAMPLES.rumble.gain * p.rumbleLevel, d = p.drive;
    if (L.rumble) driveLoop(L.rumble, t, rumble, p.rumbleRate);
    // rail joints: each wheelset that crossed one since the last frame knocks, at the moment it crossed
    if (Number.isFinite(st.s)) { const dt = Math.min(0.25, t - (this._tPrev ?? t));
      if (this._s != null && dt > 0 && !this.muted) for (const k of jointHits(this._s, st.s)) { clack(this.ctx, this.master, t + 0.03 + k.at * dt, k.gain * p.rail.jointGain); this.plays.joint = (this.plays.joint || 0) + 1; }
      this._s = st.s; this._tPrev = t; }
    const s = this.release.update(b, t);   // the brake being let off: the air goes (a recording; the synthesised hiss follows `rel` on its own)
    if (s != null && hiss && !this.muted) this._hiss(s, p.inside);
    this.run = { rumble: { rec: !!L.rumble, gain: rumble, rate: p.rumbleRate }, drive: { mode: d.mode, fc: d.fc, inv: d.invGain, gear: d.gearGain, gearHz: d.gearHz, growl: d.growlGain }, hiss: { rec: hiss, fired: this.plays.brakeHiss || 0 }, rail: { roar: p.rail.roarGain, sing: p.rail.singGain, corr: p.rail.corrGain, beatHz: p.rail.beatHz, joints: this.plays.joint || 0 }, inside: p.inside };
  }
  /** one release of the brake: a recorded burst of air, the longer take for a bigger release, at a slightly different pitch each time. strength 0..1 (how much brake there was to let off) */
  _hiss(strength, inside) {
    const c = this.ctx, have = ['brakeHiss1', 'brakeHiss2'].filter((n) => this.buf[n]); if (!c || !this.master || !have.length) return false;
    const name = have.length === 1 ? have[0] : (Math.random() < (strength > 0.7 ? 0.7 : 0.3) ? 'brakeHiss2' : 'brakeHiss1'), rate = 0.94 + Math.random() * 0.12, gain = SAMPLES[name].gain * (0.4 + 0.6 * clamp(strength, 0, 1)) * inside;
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = this.buf[name]; s.playbackRate.value = rate; g.gain.value = gain; s.connect(g); g.connect(this.master); s.start(c.currentTime + 0.02);
    this.plays.brakeHiss = (this.plays.brakeHiss || 0) + 1; this.lastHiss = { name, strength: +strength.toFixed(2), rate: +rate.toFixed(3), gain: +gain.toFixed(3) }; return true;
  }
  /** a per-event output chain: level -> (muffling low-pass) -> (stereo position) -> master. o = { gain, lp (Hz, 0 = none), pan }. Returns the node to feed. */
  _chain(o = {}) {
    const c = this.ctx, g = c.createGain(); g.gain.value = o.gain == null ? 1 : o.gain; let tail = g;
    if (o.lp > 0) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; tail.connect(f); tail = f; }
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); tail.connect(p); tail = p; }
    tail.connect(this.master); return g;
  }
  /** the doors opening (open = true) or closing with its warning beeps, 2.6 s either way, as heard with o = { gain, pan, lp, key } (see reach() / panOf(); key = the train's object,
   *  so that a reversal cuts the sound that is still running). Returns whether it played. */
  doors(open, o = {}) {
    if (this.hidden) { this.blocked++; return false; }
    if (!this.started || !this.ctx || !this.master || this.muted) return false;
    const gain = o.gain == null ? 1 : o.gain; if (gain < 0.015) return false;   // too far away to hear
    const name = open ? 'doorOpen' : 'doorClose', c = this.ctx, t = c.currentTime + 0.03, out = this._chain({ gain, pan: o.pan, lp: o.lp }), buf = this.buf[name];
    if (o.key && typeof o.key === 'object') {   // one voice per train: a door sound that is still running when the same train's doors reverse is cut short, not left to talk over the new one
      const prev = this._voice.get(o.key); if (prev && prev.end > c.currentTime) { try { prev.g.gain.setTargetAtTime(0, c.currentTime, 0.02); } catch (e) {} this.cut++; }
      this._voice.set(o.key, { g: out, end: t + DOOR_SECS + 0.1 });
    }
    if (buf) { const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; g.gain.value = SAMPLES[name].gain; s.connect(g); g.connect(out); s.start(t); }
    else (open ? synthDoorOpen : synthDoorClose)(c, out, t);
    this.plays[name] = (this.plays[name] || 0) + 1; this.last = { name, via: buf ? 'sample' : 'synth', gain: +gain.toFixed(3), pan: +(o.pan || 0).toFixed(2), lp: Math.round(o.lp || 0) };
    return true;
  }
  chime(kind = 'door') {
    if (kind === 'door' || kind === 'close') return this.doors(kind === 'door');   // (the old two-tone chimes: callers that still ask for them get the door sounds)
    if (this.hidden) { this.blocked++; return; }
    if (!this.started || !this.ctx) return; const c = this.ctx, t = c.currentTime;
    const seq = { vigil: [1200, 1200, 1200], trip: [300, 220, 300, 220], ok: [660, 990] }[kind] || [880];
    seq.forEach((fr, i) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = kind === 'trip' || kind === 'vigil' ? 'square' : 'sine'; o.frequency.value = fr;
      g.gain.setValueAtTime(0, t + i * 0.22); g.gain.linearRampToValueAtTime(0.18, t + i * 0.22 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.22 + 0.2);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.25);
    });
  }
  /** a rat's squeak: two quick, high chirps (vol 0..1, by distance) */
  squeak(vol = 0.5) {
    if (this.hidden) { this.blocked++; return; }
    if (!this.started || !this.ctx || !this.master) return; const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = c.createOscillator(), g = c.createGain(), f = 3300 + Math.random() * 900, t0 = t + i * 0.11;
      o.type = 'sine'; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 1.35, t0 + 0.05); o.frequency.exponentialRampToValueAtTime(f * 0.8, t0 + 0.09);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.05 * Math.max(0.1, Math.min(1, vol)), t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.09);
      o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.1);
    }
  }
  /** the station PA's two-tone bell */
  bong() {
    if (this.hidden) { this.blocked++; return false; }
    if (!this.started || !this.ctx || !this.master || this.muted) return false;
    const c = this.ctx; synthBong(c, this._chain({ gain: 0.9 }), c.currentTime + 0.03); this.plays.bong = (this.plays.bong || 0) + 1; return true;
  }
  /** an announcement: the PA bell, then the voice a moment later (dropped if the tab is hidden or muted in between) */
  speak(text) {
    if (this.hidden) { this.blocked++; return; }
    if (this.muted || !this.speechOn || !this.started) return;
    try { speechSynthesis.cancel(); } catch (e) {}
    if (this._speakT) clearTimeout(this._speakT);
    this.bong();
    this._speakT = setTimeout(() => {
      this._speakT = 0; if (this.hidden || this.muted) return;
      try { const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = 0.95; u.volume = 0.8; speechSynthesis.speak(u); } catch (e) {}
    }, 950);
  }
  dispose() { try { if (this._vis) { document.removeEventListener('visibilitychange', this._vis); window.removeEventListener('pagehide', this._pagehide); window.removeEventListener('pageshow', this._vis); window.removeEventListener('blur', this._blur); document.removeEventListener('freeze', this._pagehide); this._vis = null; } } catch (e) {}
    if (this._speakT) { clearTimeout(this._speakT); this._speakT = 0; }
    try { if (this.ctx) this.ctx.close(); if (this.speechOn) speechSynthesis.cancel(); } catch (e) {} this.started = false; this.loops = {}; this.run = null; }
}
