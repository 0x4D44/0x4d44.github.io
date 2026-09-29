"""Original score + sound design, synthesised from scratch and synced to events.json.

Score: 90 bpm, 4/4, D major. One bar = 32 drawn frames, so every scene cut sits on a
barline. Form follows the story: gentle theme -> crowd tension (B minor, semitone
motif, heartbeat) -> bright pizzicato 'counting' for the axes -> calm felt piano at
the lecture -> the theme returns over a steady ostinato for the state machine ->
warm build for the map -> resolution on D.
"""
import json
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 44100
BPM = 90
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)

EV = json.load(open('events.json'))
TOTAL = EV['total'] + 1.5
N = int(TOTAL * SR)

NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


def midi(n):
    name, octv = n[:-1], int(n[-1])
    return 12 * (octv + 1) + NOTE[name]


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def filt(x, kind, f, order=2):
    if kind == 'bp':
        sos = butter(order, [f[0] / (SR / 2), min(0.99, f[1] / (SR / 2))], 'band', output='sos')
    else:
        sos = butter(order, min(0.99, f / (SR / 2)), kind, output='sos')
    return sosfilt(sos, x)


def tt(d):
    return np.arange(int(d * SR)) / SR


# ------------------------------------------------------------------ instruments
def kalimba(f, d=1.6, v=1.0):
    t = tt(d)
    env = np.exp(-t * 3.2)
    x = np.sin(2 * np.pi * f * t) * env
    x += 0.22 * np.sin(2 * np.pi * f * 5.93 * t) * np.exp(-t * 22)
    x += 0.10 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 6)
    click = filt(rng.normal(0, 1, len(t)), 'hp', 2500) * np.exp(-t * 300) * 0.15
    a = np.minimum(1, t / 0.003)
    return (x * a + click) * v


def pluck(f, d=1.2, v=1.0, bright=0.5):
    """Karplus-Strong, block-wise."""
    n = max(2, int(round(SR / f)))
    L = int(d * SR)
    buf = rng.uniform(-1, 1, n)
    buf = filt(buf, 'lp', 1500 + 6000 * bright)
    out = np.zeros(L + n)
    dec = 0.996 ** (440 / max(f, 60))
    for i in range(0, L, n):
        out[i:i + n] = buf
        buf = dec * 0.5 * (buf + np.roll(buf, 1))
    out = out[:L]
    return out / (np.max(np.abs(out)) + 1e-9) * v * np.minimum(1, np.arange(L) / (0.002 * SR))


def piano(f, d=2.5, v=1.0):
    """Felt piano: soft, slightly inharmonic partials."""
    t = tt(d)
    x = np.zeros_like(t)
    B = 0.0003
    for k in range(1, 9):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > 9000:
            break
        x += (1 / k ** 1.7) * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6)) * np.exp(-t * (1.1 + 0.9 * k))
    a = np.minimum(1, t / 0.012)
    thump = filt(rng.normal(0, 1, len(t)), 'lp', 400) * np.exp(-t * 60) * 0.12
    return (x * a + thump) * v


def pad(freqs, d, v=1.0, cutoff=1500):
    t = tt(d)
    x = np.zeros_like(t)
    for f in freqs:
        for det in (-0.12, 0.0, 0.13):
            fd = f * 2 ** (det / 12)
            ph = rng.uniform(0, 6)
            for k in range(1, 10):
                if fd * k > cutoff * 2.2:
                    break
                x += (1 / k) * np.sin(2 * np.pi * fd * k * t + ph * k) / 3
    env = np.minimum(1, t / 0.7) * np.minimum(1, (d - t) / 0.8)
    x = filt(x * env, 'lp', cutoff)
    vib = 1 + 0.05 * np.sin(2 * np.pi * 0.25 * t)
    return x * vib * v / max(1, len(freqs))


def bass(f, d=0.9, v=1.0):
    t = tt(d)
    x = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    env = np.exp(-t * 2.5) * np.minimum(1, t / 0.008) * np.minimum(1, (d - t) / 0.05)
    return x * env * v


def glock(f, d=1.8, v=1.0):
    t = tt(d)
    x = (np.sin(2 * np.pi * f * t) * np.exp(-t * 2.2)
         + 0.35 * np.sin(2 * np.pi * f * 2.756 * t) * np.exp(-t * 6)
         + 0.15 * np.sin(2 * np.pi * f * 5.404 * t) * np.exp(-t * 12))
    return x * np.minimum(1, t / 0.001) * v


def bowed(f, d, v=1.0):
    """Bowed/reed lead: band-limited saw with delayed vibrato, bow noise and body formants."""
    t = tt(d)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.25) / 0.3, 0, 1)
    ph = np.cumsum(f * vib) / SR
    x = np.zeros_like(t)
    for k in range(1, 14):
        if f * k > 7000:
            break
        x += np.sin(2 * np.pi * k * ph) / k
    x += 0.04 * filt(rng.normal(0, 1, len(t)), 'bp', (2000, 6000))
    x = filt(x, 'bp', (220, 3200)) + 0.5 * filt(x, 'bp', (f * 0.9, f * 1.6))
    env = np.minimum(1, t / 0.12) * np.minimum(1, (d - t) / 0.18) * (0.85 + 0.15 * np.sin(np.pi * t / d))
    return x * env * v


def noise(d):
    return rng.normal(0, 1, int(d * SR))


def brush(v=1.0, d=0.22):
    t = tt(d)
    x = filt(noise(d), 'bp', (1800, 9000)) * (np.minimum(1, t / 0.03) * np.exp(-t * 14))
    return x * v * 0.5


def shaker(v=1.0):
    d = 0.07
    t = tt(d)
    return filt(noise(d), 'hp', 5000) * np.exp(-t * 60) * np.minimum(1, t / 0.008) * v * 0.4


def kick(v=1.0):
    """Muted felt knock: a short, dark thump like a padded mallet on a wooden box."""
    d = 0.22
    t = tt(d)
    f = 70 + 60 * np.exp(-t * 45)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22)
    wood = filt(noise(d), 'bp', (180, 900)) * np.exp(-t * 70) * 0.5
    return (body + wood) * v


# ------------------------------------------------------------------ mixing helpers
music = np.zeros((N, 2))
sfx = np.zeros((N, 2))


def put(bus, x, t, v=1.0, pan=0.0, _g=[1.0]):
    i = int(t * SR)
    if i >= N or i + len(x) <= 0:
        return
    j = min(N, i + len(x))
    x = x[:j - i] * v
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    bus[i:j, 0] += x * l * 1.414
    bus[i:j, 1] += x * r * 1.414


def notes(s):
    """'F#5:1 A5:1 r:.5 E5:1.5' -> [(beat, dur, midi or None)]"""
    out, b = [], 0.0
    for tok in s.split():
        n, d = tok.split(':')
        d = float(d)
        out.append((b, d, None if n == 'r' else midi(n)))
        b += d
    return out


def chord_notes(name):
    """Chord symbol -> list of midi notes in the pad register."""
    table = {
        'Dmaj7': 'D3 A3 C#4 F#4', 'Gmaj7': 'G2 D3 F#3 B3', 'Em7': 'E3 B3 D4 G4', 'A': 'A2 E3 A3 C#4',
        'Bm': 'B2 F#3 B3 D4', 'G/B': 'B2 G3 B3 D4', 'F#sus': 'F#2 C#3 F#3 B3', 'F#7': 'F#2 C#3 E3 A#3',
        'D': 'D3 A3 D4 F#4', 'A/C#': 'C#3 A3 C#4 E4', 'G': 'G2 D3 G3 B3', 'Asus': 'A2 E3 A3 D4',
        'D/F#': 'F#2 A3 D4 F#4', 'A7': 'A2 E3 G3 C#4', 'F#m': 'F#2 C#3 F#3 A3', 'Dadd9': 'D3 A3 E4 F#4',
    }
    return [midi(n) for n in table[name].split()]


# bar-by-bar plan: (chords [(beat, name)], melody, section)
PLAN = [
    # title — gentle theme on kalimba
    ([(0, 'Dmaj7')], 'F#5:1 A5:1 E5:1.5 D5:.5', 'title'),
    ([(0, 'Gmaj7')], 'B4:1 D5:1 F#5:2', 'title'),
    ([(0, 'Em7'), (2, 'A')], 'E5:1 D5:1 C#5:1 A4:1', 'title'),
    # crowd — B minor, semitone motif, pulse thickens
    ([(0, 'Bm')], 'F#5:.5 G5:.5 F#5:1 r:1 D5:.5 C#5:.5', 'crowd'),
    ([(0, 'G/B')], 'G5:.5 F#5:.5 E5:1 r:.5 G5:.5 F#5:1', 'crowd'),
    ([(0, 'F#sus'), (2, 'F#7')], 'A#4:1 C#5:1 E5:1 F#5:1', 'crowd'),
    # axes — bright, pizzicato counting
    ([(0, 'D')], 'A4:.5 D5:.5 F#5:1 A5:1 F#5:1', 'axes'),
    ([(0, 'A/C#')], 'E5:1 C#5:1 A4:2', 'axes'),
    ([(0, 'Bm')], 'D5:.5 F#5:.5 B5:1 A5:1 F#5:1', 'axes'),
    ([(0, 'G')], 'G5:1 F#5:1 E5:1 D5:1', 'axes'),
    ([(0, 'Asus'), (2, 'A')], 'D5:2 C#5:2', 'axes'),
    # origin — calm, sparse felt piano
    ([(0, 'G')], 'B4:2 D5:2', 'origin'),
    ([(0, 'D/F#')], 'A4:2 F#4:2', 'origin'),
    ([(0, 'Em7')], 'G4:1 B4:1 D5:2', 'origin'),
    ([(0, 'A7')], 'C#5:2 E5:1 G5:1', 'origin'),
    # loop — theme returns over a steady four-step ostinato
    ([(0, 'D')], 'F#5:1 A5:1 E5:1.5 D5:.5', 'loop'),
    ([(0, 'Bm')], 'D5:1 F#5:1 B5:2', 'loop'),
    ([(0, 'G')], 'B5:1 A5:1 G5:1 F#5:1', 'loop'),
    ([(0, 'A')], 'E5:2 A5:2', 'loop'),
    ([(0, 'G')], 'B5:1.5 A5:.5 G5:1 F#5:1', 'loop'),
    ([(0, 'D')], 'F#5:3 r:1', 'loop'),
    # map — warm build
    ([(0, 'G')], 'D5:1 G5:1 B5:2', 'map'),
    ([(0, 'A')], 'C#6:1 B5:1 A5:2', 'map'),
    ([(0, 'F#m')], 'A5:1 F#5:1 C#5:2', 'map'),
    ([(0, 'Bm')], 'D5:1 F#5:1 B5:1 A5:1', 'map'),
    ([(0, 'Asus'), (2, 'A')], 'D6:2 C#6:2', 'map'),
    # ending — resolution
    ([(0, 'G')], 'B5:2 A5:1 G5:1', 'end'),
    ([(0, 'Asus'), (2, 'A')], 'A5:1 D6:2 C#6:1', 'end'),
    ([(0, 'Dadd9')], 'F#5:2 A5:1 D6:1', 'end'),
]


def compose():
    for bi, (chords, mel, sec) in enumerate(PLAN):
        t0 = bi * BAR
        # chord spans
        spans = []
        for k, (b, name) in enumerate(chords):
            e = chords[k + 1][0] if k + 1 < len(chords) else 4
            spans.append((b, e, chord_notes(name)))
        for b, e, cn in spans:
            ts, dur = t0 + b * BEAT, (e - b) * BEAT
            root = cn[0]
            # pad
            pv = {'title': 0.16, 'crowd': 0.2, 'axes': 0.11, 'origin': 0.2, 'loop': 0.13, 'map': 0.2, 'end': 0.2}[sec]
            cut = {'crowd': 900, 'origin': 1300}.get(sec, 1700)
            put(music, pad([hz(m) for m in cn], dur + 0.8, cutoff=cut), ts, pv)
            # bass
            if sec == 'crowd':
                # heartbeat pulse: 8ths on the root, busier each bar
                step = 0.5 if bi < 5 else 0.25
                k = 0
                while k * step < e - b:
                    acc = 1.0 if (k * step) % 1 == 0 else 0.6
                    put(music, pluck(hz(root - 12 if root > 40 else root), 0.4, bright=0.2), ts + k * step * BEAT,
                        0.32 * acc, -0.2)
                    k += 1
                for bb in range(int(b), int(e)):
                    put(music, kick(0.55), t0 + bb * BEAT, 1.0)
                    put(music, kick(0.3), t0 + (bb + 0.4) * BEAT, 1.0)
            elif sec == 'origin':
                put(music, bass(hz(root - 12 if root > 45 else root), dur, 0.4), ts, 1.0)
            else:
                for bb in np.arange(b, e, 2 if sec in ('title', 'end') else 1):
                    put(music, bass(hz(root - 12 if root > 45 else root), BEAT * 1.6, 0.35), t0 + bb * BEAT, 1.0)
            # arpeggio accompaniment
            arp = [cn[1] + 12, cn[2] + 12, cn[3] + 12, cn[2] + 12]
            if sec in ('title', 'end'):
                for k in range(int((e - b) * 2)):
                    put(music, kalimba(hz(arp[k % 4]), 1.4), ts + k * BEAT / 2, 0.16, 0.35 * (-1) ** k)
            elif sec in ('axes', 'map'):
                for k in range(int((e - b) * 2)):
                    put(music, pluck(hz(arp[k % 4]), 0.9, bright=0.6), ts + k * BEAT / 2, 0.14, 0.3 * (-1) ** k)
            elif sec == 'loop':
                # the four-step ostinato: one note per beat, like Observe->Classify->Respond->Return
                for k in range(int(e - b)):
                    put(music, pluck(hz(arp[k % 4]), 1.0, bright=0.4), ts + k * BEAT, 0.2, -0.3)
                    put(music, pluck(hz(arp[(k + 2) % 4] + 12), 0.6, bright=0.3), ts + (k + 0.5) * BEAT, 0.08, 0.4)
            elif sec == 'origin':
                for k, m in enumerate(cn[1:]):
                    put(music, piano(hz(m + 12), 2.8), ts + k * 0.9 * BEAT, 0.13, -0.2 + 0.2 * k)
            elif sec == 'crowd':
                # dissonant cluster stabs
                put(music, piano(hz(cn[2] + 12), 1.2) + piano(hz(cn[2] + 13), 1.2) * 0.6, ts + 1.5 * BEAT, 0.12, 0.3)
        # melody
        for b, d, m in notes(mel):
            if m is None:
                continue
            ts = t0 + b * BEAT
            if sec in ('title', 'end'):
                put(music, kalimba(hz(m), max(1.4, d * BEAT + 0.8)), ts, 0.34, 0.1)
                put(music, glock(hz(m + 12), 1.4), ts, 0.035, -0.2)
            elif sec == 'crowd':
                put(music, piano(hz(m), d * BEAT + 1.0), ts, 0.22, 0.15)
            elif sec in ('axes',):
                put(music, pluck(hz(m), d * BEAT + 0.6, bright=0.7), ts, 0.28, 0.1)
                put(music, glock(hz(m + 12), 1.2), ts, 0.05, 0.1)
            elif sec == 'origin':
                put(music, piano(hz(m), d * BEAT + 1.6), ts, 0.3, 0.05)
            else:
                put(music, piano(hz(m), d * BEAT + 1.4), ts, 0.24, 0.05)
                put(music, kalimba(hz(m), 1.4), ts, 0.08, -0.1)
            if sec in ('loop', 'end') or (sec == 'map' and bi % 2 == 0):
                put(music, bowed(hz(m - 12), d * BEAT + 0.15), ts, 0.10, -0.15)
        # countermelody in the map swell: a low bowed line moving against the tune
        if sec == 'map':
            cm = {0: 'B3:2 D4:2', 1: 'E4:2 C#4:2', 2: 'F#4:2 A4:2', 3: 'F#4:3 G4:1', 4: 'E4:4'}
            k = bi - [i for i, p in enumerate(PLAN) if p[2] == 'map'][0]
            for b, d, m in notes(cm[k]):
                put(music, bowed(hz(m), d * BEAT + 0.1), t0 + b * BEAT, 0.09, 0.3)
        # light percussion
        if sec in ('axes', 'loop', 'map', 'end'):
            for bb in (1, 3):
                put(music, brush(0.5), t0 + bb * BEAT, 1.0, 0.25)
        if sec in ('loop', 'map'):
            for k in range(8):
                put(music, shaker(0.5 if k % 2 else 0.8), t0 + k * BEAT / 2, 1.0, -0.35)
            put(music, kick(0.35), t0, 1.0)
    # final ring after the last bar
    tend = len(PLAN) * BAR
    for k, m in enumerate(['D4', 'A4', 'D5', 'F#5', 'A5']):
        put(music, kalimba(hz(midi(m)), 3.0), tend + k * 0.09, 0.2, -0.3 + 0.15 * k)
    put(music, glock(hz(midi('D6')), 3.0), tend + 0.5, 0.08)
    put(music, pad([hz(m) for m in chord_notes('D')], 3.0), tend, 0.18)


# ------------------------------------------------------------------ sound effects
def paper_slide(d, soft=False):
    d = max(0.18, min(d, 0.9))
    t = tt(d)
    lo = rng.uniform(300, 700)
    hi = rng.uniform(3500, 7000)
    body = filt(noise(d), 'bp', (lo, hi)) * (1 + 0.8 * np.abs(filt(noise(d), 'lp', 25)) * 6)
    grit = np.zeros(len(t))
    idx = np.where(rng.random(len(t)) < 0.0025)[0]
    grit[idx] = rng.normal(0, 1, len(idx)) * 3
    grit = filt(grit, 'bp', (1500, 9000))
    rumble = filt(noise(d), 'lp', 250) * 0.8
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.3
    return (body + grit + rumble) * env * (0.14 if soft else 0.24)


def tap(v=1.0):
    d = 0.16
    t = tt(d)
    f0 = rng.uniform(120, 190)
    thud = np.sin(2 * np.pi * (f0 + 80 * np.exp(-t * 60)) * t) * np.exp(-t * rng.uniform(32, 50))
    flap = filt(noise(d), 'bp', (rng.uniform(300, 600), rng.uniform(2200, 4000))) * np.exp(-t * 55)
    return (0.5 * thud + 0.35 * flap) * v


def pop(p=1.0):
    d = 0.12
    t = tt(d)
    f = 520 * p * (1 + 0.6 * np.exp(-t * 80))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45)
    click = filt(noise(d), 'hp', 3000) * np.exp(-t * 400) * 0.3
    return (x * 0.5 + click)


def step():
    d = 0.1
    t = tt(d)
    x = filt(noise(d), 'lp', 900) * np.exp(-t * 60) * 0.6 + np.sin(2 * np.pi * 110 * t) * np.exp(-t * 50) * 0.4
    return x * 0.5


def tick(p=0):
    d = 0.06
    t = tt(d)
    f = 1800 + 150 * p
    return (np.sin(2 * np.pi * f * t) * 0.4 + filt(noise(d), 'bp', (2000, 7000)) * 0.5) * np.exp(-t * 110)


def murmur(d):
    """Unintelligible crowd babble: many glottal buzzes through wandering formants."""
    L = int(d * SR)
    t = np.arange(L) / SR
    out = np.zeros(L)
    for v in range(14):
        f0 = rng.uniform(95, 230)
        vib = f0 * (1 + 0.06 * filt(rng.normal(0, 1, L), 'lp', 3) * 8)
        ph = np.cumsum(vib) / SR
        buzz = 2 * (ph % 1) - 1
        syl = np.clip(filt(rng.normal(0, 1, L), 'lp', 5) * 25, 0, 1)   # syllable envelope
        vowels = [(730, 1090), (530, 1840), (270, 2290), (570, 840), (440, 1020), (660, 1720)]
        seg = int(SR * rng.uniform(0.14, 0.22))
        voice = np.zeros(L)
        for s0 in range(0, L, seg):
            f1, f2 = vowels[rng.integers(len(vowels))]
            f1 *= f0 / 150 * 0.3 + 0.7
            part = buzz[s0:s0 + seg + 400]
            y = filt(part, 'bp', (f1 * 0.8, f1 * 1.2)) + 0.6 * filt(part, 'bp', (f2 * 0.88, f2 * 1.12))
            n = min(len(y), L - s0)
            fade = np.minimum(1, np.minimum(np.arange(n), n - np.arange(n)) / 300)
            voice[s0:s0 + n] += y[:n] * fade
        pan_on = min(1, v / 13)
        onset = np.clip((t / d - pan_on * 0.6) * 6, 0, 1)            # voices join progressively
        out += voice * syl * onset
    out = filt(out, 'lp', 3000)
    env = np.minimum(1, t / 1.0) * np.minimum(1, (d - t) / 0.6)
    return out / (np.max(np.abs(out)) + 1e-9) * env * 0.3


def crinkle(d):
    L = int(d * SR)
    x = np.zeros(L)
    dens = np.sin(np.pi * np.arange(L) / L)
    idx = np.where(rng.random(L) < 0.004 * dens)[0]
    for i in idx:
        n = rng.integers(40, 300)
        seg = rng.normal(0, 1, n) * np.exp(-np.arange(n) / (n / 4)) * rng.uniform(0.3, 1)
        x[i:i + n] += seg[:L - i]
    return filt(x, 'bp', (900, 8000)) * 0.35


def scribble(d):
    t = tt(d)
    x = filt(noise(d), 'bp', (2500, 7500))
    zig = np.abs(np.sin(2 * np.pi * 6.5 * t)) ** 0.5
    return x * zig * np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.05) * 0.35


def sheet():
    d = 0.55
    t = tt(d)
    x = filt(noise(d), 'bp', (250, 3500))
    env = (t / d) ** 1.4 * np.exp(-((t - d * 0.8) / 0.12) ** 2 * 0.5)
    flap = np.zeros(len(t))
    k = int(0.45 * SR)
    fl = tap(1.0)
    flap[k:k + len(fl)] += fl[:len(t) - k]
    return x * env * 0.35 + flap * 0.8


HOP_NOTES = [midi('D6'), midi('F#6'), midi('A6'), midi('F#6')]
GLOCK_NOTES = [midi('D6'), midi('F#6'), midi('A6'), midi('D7'), midi('A6')]


def tear(d=0.55):
    """Signature paper sound: a torn/scraped sheet - accelerating crackle over a fibrous hiss."""
    t = tt(d)
    L = len(t)
    x = np.zeros(L)
    dens = 0.002 + 0.02 * (t / d) ** 0.7 * np.exp(-((t - d * 0.75) / (d * 0.3)) ** 2)
    idx = np.where(rng.random(L) < dens)[0]
    for i in idx:
        n = rng.integers(20, 160)
        seg = rng.normal(0, 1, n) * np.exp(-np.arange(n) / (n / 3))
        x[i:i + n] += seg[:L - i] * rng.uniform(0.3, 1)
    crackle = filt(x, 'bp', (700, 9000))
    hiss = filt(noise(d), 'bp', (1200, 6000)) * np.sin(np.pi * t / d) ** 2 * 0.25
    body = filt(noise(d), 'lp', 300) * np.exp(-t * 6) * 0.3
    return (crackle * 0.5 + hiss + body) * 0.7


def deal():
    d = 0.16
    t = tt(d)
    return filt(noise(d), 'bp', (1500, 8000)) * np.exp(-t * 35) * np.minimum(1, t / 0.01) * 0.25


SFX_GAIN = {'crowd': 0.85, 'map': 0.78, 'loop': 0.9}


def sput(bus, x, t, v=1.0, pan=0.0):
    put(bus, x, t, v * CUR_G[0], pan)


CUR_G = [1.0]


def sound_design():
    for e in EV['events']:
        t, k = e['t'], e['kind']
        g = SFX_GAIN.get(e.get('scene'), 1.0)
        CUR_G[0] = g
        if k == 'tear':
            sput(sfx, tear(), t, 0.9, 0.1)
            continue
        if k == 'deal':
            sput(sfx, deal() + tap(0.25), t, 1.0, rng.uniform(-0.3, 0.3))
            continue
        pan = rng.uniform(-0.3, 0.3)
        if k == 'slide':
            sput(sfx, paper_slide(e.get('dur', 0.4), e.get('soft', False)), t, 1.0, pan)
        elif k == 'tap':
            sput(sfx, tap(), t, 0.8, pan)
        elif k == 'pop':
            sput(sfx, pop(e.get('pitch', 1.0)), t, 0.45, rng.uniform(-0.6, 0.6))
        elif k == 'glock':
            sput(sfx, glock(hz(GLOCK_NOTES[e.get('pitch', 0) % 5]), 1.6), t, 0.22, -0.2 + 0.2 * e.get('pitch', 0))
            sput(sfx, tap(0.4), t, 0.5, pan)
        elif k == 'step':
            sput(sfx, step(), t, 0.7, pan)
        elif k == 'tick':
            sput(sfx, tick(e.get('pitch', 0)), t, 0.5, 0.2)
        elif k == 'hop':
            sput(sfx, kalimba(hz(HOP_NOTES[e['i']]), 1.0), t, 0.2, -0.4 + 0.25 * e['i'])
            sput(sfx, step(), t, 0.6, 0)
        elif k == 'murmur':
            m = murmur(e['dur'])
            sput(sfx, m, t, 1.0, -0.3)
            sput(sfx, murmur(e['dur']), t, 1.0, 0.3)
        elif k == 'crinkle':
            sput(sfx, crinkle(e['dur']), t, 1.0, pan)
        elif k == 'scribble':
            sput(sfx, scribble(e['dur']), t, 1.0, 0.4)
        elif k == 'sheet':
            sput(sfx, sheet(), t - 0.4, 1.0, 0.2)


def reverb(x, length=2.2, wet=0.25, damp=3000):
    L = int(length * SR)
    t = np.arange(L) / SR
    out = np.zeros_like(x)
    for c in range(2):
        ir = rng.normal(0, 1, L) * np.exp(-t * 3.2)
        ir = filt(ir, 'lp', damp)
        ir[:int(0.012 * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        out[:, c] = fftconvolve(x[:, c], ir)[:len(x)]
    return x * (1 - wet) + out * wet * 1.2


SEC_GAIN = {'title': 0.85, 'crowd': 0.9, 'axes': 0.85, 'origin': 0.5, 'loop': 0.85, 'map': 1.05, 'end': 1.15}


def dynamics(x):
    """Smooth per-bar gain curve so the calm lecture is quiet and the ending swells."""
    pts_t = [0.0]
    pts_g = [SEC_GAIN[PLAN[0][2]]]
    for bi, (_, _, sec) in enumerate(PLAN):
        pts_t += [bi * BAR + 0.3, (bi + 1) * BAR - 0.3]
        pts_g += [SEC_GAIN[sec]] * 2
    pts_t.append(TOTAL)
    pts_g.append(SEC_GAIN['end'])
    g = np.interp(np.arange(len(x)) / SR, pts_t, pts_g)
    return x * g[:, None]


if __name__ == '__main__':
    compose()
    music[:] = dynamics(music)
    sound_design()
    m = reverb(music, 2.4, 0.28)
    s = reverb(sfx, 0.8, 0.12, damp=5000)
    mix = m * 0.9 + s * 1.0
    mix = reverb(mix, 0.7, 0.10, damp=4500)   # one shared room glues the instruments and effects
    mix = filt(mix.T, 'hp', 30).T if False else mix
    peak = np.max(np.abs(mix))
    mix = mix / peak * 0.89
    # soft-knee safety limiter
    mix = np.tanh(mix * 1.05) / np.tanh(1.05)
    wavfile.write('mix.wav', SR, (mix * 32767).astype(np.int16))
    wavfile.write('music.wav', SR, (m / np.max(np.abs(m)) * 0.8 * 32767).astype(np.int16))
    wavfile.write('sfx.wav', SR, (s / np.max(np.abs(s)) * 0.8 * 32767).astype(np.int16))
    print('ok', TOTAL, peak)
