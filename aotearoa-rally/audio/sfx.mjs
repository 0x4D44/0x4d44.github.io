// One-shot effects: body impacts, bottoming out, landings, punctures, UI sounds.
import { makeRng } from "../core/rng.mjs";
import { clamp, clamp01 } from "../core/mathx.mjs";
import { impactVoice } from "./params.mjs";
import { burst, tone } from "./mixer.mjs";

export function createSfx(ctx, out, uiOut) {
  const rng = makeRng("sfx-synth");
  const T = () => ctx.currentTime;
  const api = {
    impact(ev) {
      const v = impactVoice(ev), t = T();
      // sharp transient first (stands out of the mix), then a low thump that carries the weight
      burst(ctx, out, { kind: "white", t, dur: 0.012, attack: 0.001, gain: 0.55 * (0.5 + v.thudGain), type: "highpass", freq: 1800, q: 0.7, pan: v.pan });
      tone(ctx, out, { type: "sine", t, f0: v.thudHz * 1.3, f1: 32, dur: v.dur * 1.4 + 0.25, gain: Math.min(1, v.thudGain * 1.3), pan: v.pan });
      tone(ctx, out, { type: "triangle", t, f0: v.thudHz * 2.2, f1: v.thudHz * 0.7, dur: v.dur, gain: v.thudGain * 0.45, pan: v.pan });
      burst(ctx, out, { kind: "brown", t, dur: v.dur, gain: v.thudGain * 1.1, type: "lowpass", freq: 700, freq2: 120, q: 0.7, pan: v.pan });
      const n = 3 + Math.floor(v.crunchGain * 5);
      for (let i = 0; i < n; i++) burst(ctx, out, { kind: "crackle", t: t + i * 0.022 + rng.next() * 0.02, dur: 0.06, gain: v.crunchGain * 0.5, type: "bandpass", freq: 600 + rng.next() * 2500, q: 1.2, pan: v.pan });
      if (v.clang > 0.05) for (const f of [310, 523, 811, 1367]) tone(ctx, out, { type: "sine", t, f0: f * (0.9 + rng.next() * 0.2), dur: 0.5 * v.clang + 0.15, gain: 0.07 * v.clang, pan: v.pan });
      if (v.glass > 0.05) for (let i = 0; i < 6; i++) tone(ctx, out, { type: "sine", t: t + 0.03 + i * 0.035 + rng.next() * 0.03, f0: 3200 + rng.next() * 3500, dur: 0.07, gain: 0.04 * v.glass, pan: v.pan });
    },
    bottomout(s = 0.5) {
      const t = T();
      tone(ctx, out, { type: "sine", t, f0: 90, f1: 40, dur: 0.16, gain: 0.32 * clamp01(s) + 0.08 });
      burst(ctx, out, { kind: "white", t, dur: 0.18 + 0.2 * s, gain: 0.14 * clamp01(s + 0.2), type: "bandpass", freq: 2400, freq2: 700, q: 0.9 });
    },
    landing(s = 0.5) {
      const t = T();
      tone(ctx, out, { type: "sine", t, f0: 75, f1: 35, dur: 0.3, gain: 0.45 * clamp01(s) + 0.1 });
      burst(ctx, out, { kind: "brown", t, dur: 0.35, gain: 0.45 * clamp01(s) + 0.05, type: "lowpass", freq: 500, freq2: 120, q: 0.6 });
      tone(ctx, out, { type: "triangle", t: t + 0.04, f0: 200, f1: 110, dur: 0.25, gain: 0.08 * s }); // spring
    },
    puncture() {
      const t = T();
      burst(ctx, out, { kind: "white", t, dur: 0.7, gain: 0.12, type: "highpass", freq: 3500, freq2: 1200, q: 0.6 });
      tone(ctx, out, { type: "sine", t, f0: 120, f1: 60, dur: 0.12, gain: 0.25 });
    },
    roll() { for (let i = 0; i < 3; i++) api.impact({ strength: 0.55 + 0.1 * i, zone: i & 1 ? "left" : "right", kind: "terrain" }); },
    ui(name) {
      const t = T();
      const u = uiOut || out;
      switch (name) {
        case "click": tone(ctx, u, { type: "triangle", t, f0: 1100, f1: 900, dur: 0.05, gain: 0.12 }); break;
        case "confirm": tone(ctx, u, { type: "triangle", t, f0: 660, dur: 0.08, gain: 0.14 }); tone(ctx, u, { type: "triangle", t: t + 0.07, f0: 990, dur: 0.14, gain: 0.14 }); break;
        case "back": tone(ctx, u, { type: "triangle", t, f0: 700, f1: 420, dur: 0.12, gain: 0.13 }); break;
        case "countdown": tone(ctx, u, { type: "sine", t, f0: 880, dur: 0.22, gain: 0.3 }); tone(ctx, u, { type: "triangle", t, f0: 440, dur: 0.22, gain: 0.12 }); break;
        case "go": tone(ctx, u, { type: "sine", t, f0: 1320, dur: 0.6, gain: 0.32 }); tone(ctx, u, { type: "triangle", t, f0: 660, dur: 0.6, gain: 0.14 }); break;
        case "checkpoint": tone(ctx, u, { type: "sine", t, f0: 1175, dur: 0.1, gain: 0.2 }); tone(ctx, u, { type: "sine", t: t + 0.1, f0: 1568, dur: 0.2, gain: 0.2 }); break;
        case "finish": [523, 659, 784, 1047].forEach((f, i) => { tone(ctx, u, { type: "triangle", t: t + i * 0.12, f0: f, dur: 0.5, gain: 0.2 }); tone(ctx, u, { type: "sine", t: t + i * 0.12, f0: f * 2, dur: 0.4, gain: 0.07 }); }); break;
        case "warning": tone(ctx, u, { type: "square", t, f0: 520, dur: 0.12, gain: 0.07 }); tone(ctx, u, { type: "square", t: t + 0.16, f0: 520, dur: 0.12, gain: 0.07 }); break;
        default: break;
      }
    },
    /** tone-beep fallback for the co-driver: pitch from the call, count from severity digit. */
    beepCall(text) {
      const t = T();
      const left = /left/i.test(text), right = /right/i.test(text);
      const m = /\b(one|two|three|four|five|six|hairpin|flat)\b/i.exec(text);
      const sev = m ? { hairpin: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, flat: 6 }[m[1].toLowerCase()] : 3;
      const f = left ? 560 : right ? 840 : 700;
      const n = clamp(7 - sev, 1, 4);
      for (let i = 0; i < n; i++) tone(ctx, uiOut || out, { type: "sine", t: t + i * 0.11, f0: f, dur: 0.08, gain: 0.16, pan: left ? -0.4 : right ? 0.4 : 0 });
    },
  };
  return api;
}
