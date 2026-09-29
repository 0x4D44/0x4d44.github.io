"""Synthesise the sound effects used by the scenes (no samples, pure numpy).

    python audio/sfx.py            # writes assets/sfx/*.wav
"""
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
OUT = Path(__file__).resolve().parent.parent / "assets" / "sfx"
rng = np.random.default_rng(7)


def t_(dur):
    return np.arange(int(dur * SR)) / SR


def env_ad(n, attack, decay_tau):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay_tau)


def bandpass(x, lo, hi, order=2):
    sos = butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return sosfilt(sos, x)


def lowpass(x, f, order=2):
    return sosfilt(butter(order, f, fs=SR, output="sos"), x)


def verb(x, tail=0.6, mix=0.25):
    """Tiny algorithmic reverb: convolve with decaying filtered noise."""
    n = int(tail * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (tail * SR / 5))
    ir = lowpass(ir, 5000)
    ir /= np.sqrt(np.sum(ir**2))
    wet = np.convolve(x, ir)[: len(x) + n]
    wet = np.pad(wet, (0, len(x) + n - len(wet)))
    dry = np.concatenate([x, np.zeros(n)])
    return (1 - mix) * dry + mix * wet


def norm(x, peak_db=-6.0):
    x = x - np.mean(x)
    return x / (np.max(np.abs(x)) + 1e-9) * 10 ** (peak_db / 20)


def fade_out(x, dur=0.02):
    n = int(dur * SR)
    x[-n:] *= np.linspace(1, 0, n)
    return x


def whoosh(dur=0.7):
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    # sweep a band-pass up then down by processing in short blocks
    out = np.zeros(n)
    blk = 512
    for i in range(0, n, blk):
        p = i / n
        c = 300 + 2600 * np.sin(np.pi * p) ** 1.5
        out[i : i + blk] = bandpass(noise[i : i + blk], c * 0.6, c * 1.4, 1)
    e = np.sin(np.pi * np.linspace(0, 1, n)) ** 2
    return norm(verb(lowpass(out * e, 6000), 0.4, 0.2), -9)


def pop():
    t = t_(0.12)
    f = 700 * np.exp(-t * 18) + 380
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(len(t), 0.002, 0.035)
    return norm(verb(x, 0.3, 0.15), -8)


def blip(freq=1318.5):
    t = t_(0.18)
    x = (np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t)) * env_ad(len(t), 0.003, 0.05)
    return norm(verb(x, 0.4, 0.25), -12)


def chime(f0=880.0):
    t = t_(2.2)
    parts = [(1, 1.0, 1.2), (2.0, 0.35, 0.8), (2.76, 0.3, 0.6), (5.4, 0.12, 0.3), (8.93, 0.05, 0.2)]
    x = sum(a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-t / d) for r, a, d in parts)
    x *= np.clip(t / 0.004, 0, 1)
    return norm(verb(x, 1.2, 0.3), -10)


def tick():
    n = int(0.03 * SR)
    x = bandpass(rng.standard_normal(n), 2500, 7000) * env_ad(n, 0.0005, 0.004)
    return norm(x, -12)


def thud():
    t = t_(0.35)
    f = 140 * np.exp(-t * 12) + 60
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(len(t), 0.001, 0.07)
    click = bandpass(rng.standard_normal(len(t)), 1200, 4000) * env_ad(len(t), 0.0005, 0.006)
    return norm(verb(body + 0.35 * click, 0.3, 0.15), -7)


def alert():
    # soft, serious two-note motif (not a harsh alarm): A4 then E5, marimba-ish
    out = np.zeros(int(1.4 * SR))
    for k, (f, st) in enumerate([(440.0, 0.0), (659.25, 0.28), (440.0, 0.56)]):
        t = t_(0.8)
        x = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.05))
        x *= env_ad(len(t), 0.002, 0.25)
        i = int(st * SR)
        out[i : i + len(x)] += x[: len(out) - i]
    return norm(verb(out, 0.8, 0.3), -9)


def snip():
    out = np.zeros(int(0.35 * SR))
    for st in (0.0, 0.09):
        n = int(0.05 * SR)
        x = bandpass(rng.standard_normal(n), 3000, 9000) * env_ad(n, 0.0005, 0.01)
        i = int(st * SR)
        out[i : i + n] += x
    return norm(verb(out, 0.3, 0.1), -9)


def rise(dur=1.2):
    t = t_(dur)
    f = 220 * 2 ** (t / dur * 1.0)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)
    x *= (t / dur) ** 2 * np.exp(-np.maximum(t - dur * 0.92, 0) / 0.03)
    return norm(verb(lowpass(x, 3000), 0.8, 0.3), -14)


def fall(dur=0.9):
    t = t_(dur)
    f = 520 * 2 ** (-t / dur * 1.3)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / dur) ** 1.5
    return norm(verb(x, 0.6, 0.3), -14)


def dim():
    # a descending filtered swell for "turning the network down"
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    chord = sum(np.sin(2 * np.pi * f * t) for f in (220, 277.18, 329.63))
    chord *= np.exp(-t / 0.6) * np.clip(t / 0.05, 0, 1)
    return norm(verb(lowpass(chord, 1400), 1.0, 0.35), -14)


def heartbeat():
    out = np.zeros(int(1.0 * SR))
    for st, a in ((0.0, 1.0), (0.22, 0.7)):
        t = t_(0.25)
        x = a * np.sin(2 * np.pi * 55 * t) * env_ad(len(t), 0.004, 0.05)
        i = int(st * SR)
        out[i : i + len(x)] += x
    return norm(lowpass(out, 400), -8)


def sparkle():
    out = np.zeros(int(1.6 * SR))
    notes = [1174.66, 1479.98, 1760.0, 2349.32]
    for k, f in enumerate(notes):
        t = t_(0.9)
        x = np.sin(2 * np.pi * f * t) * env_ad(len(t), 0.002, 0.18)
        i = int(k * 0.07 * SR)
        out[i : i + len(x)] += x
    return norm(verb(out, 1.0, 0.4), -15)


SOUNDS = {
    "whoosh": whoosh, "pop": pop, "blip": blip, "chime": chime, "tick": tick,
    "thud": thud, "alert": alert, "snip": snip, "rise": rise, "fall": fall,
    "dim": dim, "heartbeat": heartbeat, "sparkle": sparkle,
    "blip_low": lambda: blip(880.0),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in SOUNDS.items():
        x = fade_out(np.asarray(fn(), dtype=np.float64))
        stereo = np.stack([x, x], axis=1)
        wavfile.write(OUT / f"{name}.wav", SR, (stereo * 32767).astype(np.int16))
        print("wrote", name, f"{len(x)/SR:.2f}s")


if __name__ == "__main__":
    main()
