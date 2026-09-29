"""An original score, composed and synthesised in numpy.

A calm piano-and-pad bed in D major, one short section per chapter (its own
progression, register and density), crossfaded at the chapter boundaries.
Nothing is sampled: piano = inharmonic additive partials with per-partial
decay; pad = slowly-swelling detuned sines; bass = soft sine roots.

    compose(sections, sr) -> float32 stereo array
    sections = [(duration_seconds, mood_name), ...]
"""
import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

A4 = 440.0
NOTE = {"C": -9, "C#": -8, "Db": -8, "D": -7, "D#": -6, "Eb": -6, "E": -5, "F": -4, "F#": -3,
        "Gb": -3, "G": -2, "G#": -1, "Ab": -1, "A": 0, "A#": 1, "Bb": 1, "B": 2}


def hz(name, octave):
    return A4 * 2 ** ((NOTE[name] + 12 * (octave - 4)) / 12)


# chord = (root, quality) ; qualities give semitone stacks above the root
QUAL = {"maj": (0, 4, 7), "min": (0, 3, 7), "maj7": (0, 4, 7, 11), "min7": (0, 3, 7, 10),
        "sus2": (0, 2, 7), "sus4": (0, 5, 7), "add9": (0, 4, 7, 14), "7": (0, 4, 7, 10)}

# mood -> (progression, bars per chord, arpeggio pattern, density, octave, pad level)
MOODS = {
    "hook":     ([("D", "add9"), ("B", "min7"), ("G", "maj7"), ("A", "sus4")], 1, "up", 0.8, 4, 0.7),
    "tissue":   ([("D", "maj7"), ("G", "maj7"), ("E", "min7"), ("A", "sus2")], 1, "wave", 1.0, 4, 0.6),
    "cause":    ([("B", "min7"), ("G", "maj7"), ("D", "add9"), ("A", "sus4")], 1, "up", 0.7, 4, 0.75),
    "signal":   ([("E", "min7"), ("A", "7"), ("D", "maj7"), ("B", "min7")], 1, "pulse", 1.2, 4, 0.55),
    "rhythm":   ([("G", "maj7"), ("D", "add9"), ("E", "min7"), ("D", "maj")], 1, "wave", 0.7, 4, 0.7),
    "diagnose": ([("D", "add9"), ("A", "sus4"), ("B", "min7"), ("G", "maj7")], 1, "up", 0.9, 4, 0.6),
    "danger":   ([("B", "min"), ("G", "maj"), ("E", "min"), ("F#", "7")], 1, "sparse", 0.5, 3, 0.9),
    "taper":    ([("G", "maj7"), ("A", "sus4"), ("D", "add9"), ("B", "min7")], 1, "down", 0.9, 4, 0.6),
    "trials":   ([("D", "maj7"), ("A", "sus2"), ("B", "min7"), ("G", "maj7")], 1, "pulse", 1.1, 4, 0.55),
    "recovery": ([("G", "maj7"), ("D", "add9"), ("A", "sus4"), ("B", "min7")], 1, "wave", 0.8, 4, 0.7),
    "close":    ([("G", "maj7"), ("A", "sus4"), ("B", "min7"), ("D", "add9")], 1, "up", 0.8, 4, 0.8),
}

BPM = 76
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(11)


def piano_note(f, dur, sr, vel=1.0):
    n = int((dur + 2.5) * sr)
    t = np.arange(n) / sr
    x = np.zeros(n)
    B = 0.0004  # inharmonicity
    for k in range(1, 9):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > sr / 2.2:
            break
        amp = (1 / k ** 1.25) * (1.0 if k == 1 else 0.9)
        decay = 2.8 / (1 + 0.55 * (k - 1)) * (220 / max(f, 110)) ** 0.35
        x += amp * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * np.exp(-t / decay)
    # hammer: tiny attack, key-release damping after `dur`
    x *= np.clip(t / 0.004, 0, 1)
    rel = np.where(t > dur, np.exp(-(t - dur) / 0.35), 1.0)
    return x * rel * vel


def pad_chord(freqs, dur, sr):
    n = int(dur * sr)
    t = np.arange(n) / sr
    x = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            ff = f * 2 ** (det / 12)
            x += np.sin(2 * np.pi * ff * t + rng.uniform(0, 6.28)) + 0.3 * np.sin(2 * np.pi * 2 * ff * t)
    att = min(1.2, dur / 3)
    env = np.clip(t / att, 0, 1) * np.clip((dur - t) / att, 0, 1)
    return x * env / (len(freqs) * 3)


def bass_note(f, dur, sr):
    n = int(dur * sr)
    t = np.arange(n) / sr
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return x * np.clip(t / 0.02, 0, 1) * np.exp(-t / 2.2) * np.clip((dur - t) / 0.1, 0, 1)


def add(buf, x, start):
    i = int(start)
    if i < 0:
        x, i = x[-i:], 0
    if i >= len(buf):
        return
    m = min(len(x), len(buf) - i)
    buf[i:i + m] += x[:m]


def chord_freqs(root, qual, octave):
    base = hz(root, octave)
    return [base * 2 ** (s / 12) for s in QUAL[qual]]


def pattern_steps(kind, nchord):
    # (beat position, chord-tone index, velocity) over one bar
    if kind == "up":
        return [(0, 0, 1), (1, 1, .7), (2, 2, .75), (3, 3 % nchord, .65), (3.5, 1, .45)]
    if kind == "down":
        return [(0, 3 % nchord, .9), (1, 2, .7), (2, 1, .7), (3, 0, .65)]
    if kind == "wave":
        return [(0, 0, 1), (0.75, 2, .55), (1.5, 1, .6), (2, 3 % nchord, .6), (2.75, 2, .5), (3.5, 1, .45)]
    if kind == "pulse":
        return [(b / 2, [0, 2, 1, 2][b % 4] % nchord, .55 + .25 * (b % 2 == 0)) for b in range(8)]
    if kind == "sparse":
        return [(0, 0, .9), (2.5, 2, .5)]
    raise ValueError(kind)


def section(dur, mood, sr):
    prog, bars_per, pat, dens, octv, padlvl = MOODS[mood]
    n = int((dur + 3) * sr)
    pno = np.zeros(n); pad = np.zeros(n); bas = np.zeros(n)
    t0, ci = 0.0, 0
    while t0 < dur:
        root, qual = prog[ci % len(prog)]
        cf = chord_freqs(root, qual, octv)
        length = BAR * bars_per
        add(pad, pad_chord(chord_freqs(root, qual, 3), length + 0.8, sr), t0 * sr)
        add(bas, bass_note(hz(root, 2), length, sr), t0 * sr)
        for bar in range(bars_per):
            for pos, idx, vel in pattern_steps(pat, len(cf)):
                if rng.random() > dens:  # thin out by density
                    continue
                tt = t0 + bar * BAR + pos * BEAT + rng.normal(0, 0.006)
                f = cf[idx % len(cf)] * (2 if idx >= len(cf) else 1)
                add(pno, piano_note(f, BEAT * 0.9, sr, vel * rng.uniform(0.85, 1.0)), tt * sr)
            # an occasional high melody tone on the downbeat of the second chord pass
            if ci % 4 == 1 and mood not in ("danger",):
                add(pno, piano_note(cf[-1] * 2, BEAT * 1.8, sr, 0.35), (t0 + 2 * BEAT) * sr)
        t0 += length
        ci += 1
    if mood == "danger":
        # low tension drone a fifth apart, slowly beating
        t = np.arange(n) / sr
        drone = (np.sin(2 * np.pi * hz("B", 1) * t) + 0.6 * np.sin(2 * np.pi * hz("F#", 2) * 1.002 * t))
        pad += 0.35 * drone * (0.6 + 0.4 * np.sin(2 * np.pi * 0.25 * t))
    mix = 0.55 * pno + padlvl * 0.5 * pad + 0.35 * bas
    return mix[: int(dur * sr)]


def reverb(x, sr, tail=2.6, wet=0.28):
    n = int(tail * sr)
    t = np.arange(n) / sr
    irs = []
    for _ in range(2):
        ir = rng.standard_normal(n) * np.exp(-t / (tail / 6.5))
        ir = sosfilt(butter(1, 4500, fs=sr, output="sos"), ir)
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    out = []
    for ir in irs:
        w = fftconvolve(x, ir)[: len(x)]
        out.append((1 - wet) * x + wet * w)
    return np.stack(out, axis=1)


def compose(sections, sr=48000, xfade=1.6):
    total = sum(d for d, _ in sections)
    buf = np.zeros(int((total + 4) * sr))
    start = 0.0
    for i, (d, mood) in enumerate(sections):
        pre = xfade if i else 0.0
        seg = section(d + pre + xfade, mood, sr)
        env = np.ones(len(seg))
        fi = int(xfade * sr)
        if i:
            env[:fi] = np.linspace(0, 1, fi) ** 0.8
        env[-fi:] *= np.linspace(1, 0, fi) ** 0.8
        add(buf, seg * env, (start - pre) * sr)
        start += d
    buf = buf[: int(total * sr)]
    # gentle global fade in/out
    fi, fo = int(1.5 * sr), int(4.0 * sr)
    buf[:fi] *= np.linspace(0, 1, fi)
    buf[-fo:] *= np.linspace(1, 0, fo)
    st = reverb(buf, sr)
    st = sosfilt(butter(2, 40, btype="high", fs=sr, output="sos"), st, axis=0)
    st /= np.max(np.abs(st)) + 1e-9
    return st.astype(np.float32)


if __name__ == "__main__":
    from scipy.io import wavfile
    demo = compose([(20, "hook"), (20, "danger"), (20, "close")])
    wavfile.write("music_demo.wav", 48000, (demo * 0.8 * 32767).astype(np.int16))
    print("wrote music_demo.wav")
