"""Mix narration + a quiet synthesised music bed + a few sound effects, and write captions.

usage: python3 audio.py [video-id ...]
reads: build/<id>/narration.wav, cues/<id>.json
writes: build/<id>/mix.wav, build/<id>/captions.vtt
Everything is generated with numpy: no samples, nothing to license.
"""
import json, os, sys, wave
import numpy as np
from scipy.signal import lfilter

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 44100
RNG = np.random.default_rng(1805)

def read_wav(p):
    with wave.open(p) as w:
        sr = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    if sr != SR:  # simple linear resample 22050 -> 44100
        x = np.arange(len(a)); xn = np.linspace(0, len(a) - 1, int(len(a) * SR / sr))
        a = np.interp(xn, x, a).astype(np.float32)
    return a

def env(n, a=0.01, r=0.2):
    e = np.ones(n, np.float32); na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e

def note(f, dur, kind="tri", vol=1.0):
    t = np.arange(int(dur * SR)) / SR
    if kind == "tri": w = 2 * np.abs(2 * ((t * f) % 1) - 1) - 1
    elif kind == "sq": w = np.sign(np.sin(2 * np.pi * f * t)) * 0.5
    else: w = np.sin(2 * np.pi * f * t)
    return (w * env(len(t), 0.01, dur * 0.6) * vol).astype(np.float32)

def lowpass(x, k=0.15):
    return lfilter([k], [1, -(1 - k)], x).astype(np.float32)

def music(seconds):
    """A slow D-minor shanty loop: Dm C Bb A, arpeggiated, with a sine bass."""
    bpm = 84; beat = 60 / bpm
    chords = [(146.83, [293.66, 349.23, 440.00]), (130.81, [261.63, 329.63, 392.00]), (116.54, [233.08, 293.66, 349.23]), (110.00, [220.00, 277.18, 329.63])]
    out = np.zeros(int((seconds + 8 * beat) * SR), np.float32)
    t, i = 0.0, 0
    while t < seconds:
        bass, tri = chords[i % 4]
        for b in range(4):
            s = int((t + b * beat) * SR)
            seg = note(bass, beat * 0.95, "sine", 0.5); out[s:s + len(seg)] += seg[: len(out) - s]
            for k, f in enumerate([tri[0], tri[1], tri[2], tri[1]]):
                s2 = int((t + b * beat + k * beat / 4) * SR)
                seg = note(f, beat / 4 * 0.9, "sq", 0.12); out[s2:s2 + len(seg)] += seg[: len(out) - s2]
        t += 4 * beat; i += 1
    return lowpass(out, 0.2)[: int(seconds * SR)]

def sfx(kind):
    if kind == "click":
        n = int(0.05 * SR); return (RNG.standard_normal(n).astype(np.float32) * env(n, 0.001, 0.045) * 0.35)
    if kind == "boom":
        n = int(1.2 * SR); t = np.arange(n) / SR
        body = np.sin(2 * np.pi * (55 - 25 * t) * t) * np.exp(-t * 4)
        noise = lowpass(RNG.standard_normal(n).astype(np.float32), 0.08) * np.exp(-t * 6) * 3
        return ((body + noise) * 0.6).astype(np.float32)
    if kind == "pipe":  # a bosun's call: rising then trilled whistle
        n = int(1.1 * SR); t = np.arange(n) / SR
        f = np.where(t < 0.4, 1400 + 900 * t / 0.4, 2300 + 60 * np.sin(2 * np.pi * 14 * t))
        return (np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.03, 0.2) * 0.18).astype(np.float32)
    if kind == "drum":
        out = np.zeros(int(2.0 * SR), np.float32)
        for k in range(12):
            n = int(0.12 * SR); t = np.arange(n) / SR
            hit = (lowpass(RNG.standard_normal(n).astype(np.float32), 0.3) * np.exp(-t * 30) + np.sin(2 * np.pi * 180 * t) * np.exp(-t * 25)) * (0.25 + 0.03 * k)
            s = int(k * 0.15 * SR); out[s:s + n] += hit
        return out
    if kind == "bell":
        n = int(2.0 * SR); t = np.arange(n) / SR
        return ((np.sin(2 * np.pi * 880 * t) + 0.5 * np.sin(2 * np.pi * 2210 * t)) * np.exp(-t * 2.5) * 0.18).astype(np.float32)
    if kind == "thud":
        n = int(0.3 * SR); t = np.arange(n) / SR
        return (np.sin(2 * np.pi * 90 * t) * np.exp(-t * 18) * 0.5).astype(np.float32)
    raise ValueError(kind)

# (scene, line index, seconds after that line starts, effect)
SFX = {
    "twos-complement": [("positive", 1, 0.5 + k * 0.7, "click") for k in range(4)] + [("readneg", 0, 0.4 + i * 0.55 - (0 if i == 0 else 0), "click") for i in (0, 1, 3, 6, 7)],
    "floating-point": [],
    "fetch-execute": [("title", 0, 0.0, "drum"), ("step2", 0, 1.0, "pipe"), ("step4", 1, 0.0, "boom")],
    "encryption": [("signature", 1, 3.0, "thud")],
    "sql-group-by": [("title", 0, 0.0, "bell")],
    "css-float": [],
}

def split_cap(cap, start, end, limit=84):
    """Long captions become two cues, split at the sentence or clause break nearest
    the middle, each timed in proportion to its length."""
    if len(cap) <= limit:
        return [(start, end + 0.25, cap)]
    mid = len(cap) / 2
    cands = [i + 1 for i, ch in enumerate(cap[:-1]) if ch in ".?!:;," and cap[i + 1] == " "]
    if not cands:
        return [(start, end + 0.25, cap)]
    k = min(cands, key=lambda i: abs(i - mid))
    a, b = cap[:k].strip(), cap[k:].strip()
    t = start + (end - start) * len(a) / (len(a) + len(b))
    return [(start, t, a), (t, end + 0.25, b)]

def vtt_time(x):
    h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"

def build(vid):
    cues = json.load(open(os.path.join(HERE, "cues", vid + ".json")))
    voice = read_wav(os.path.join(HERE, "build", vid, "narration.wav"))
    n = int(cues["duration"] * SR)
    voice = np.pad(voice, (0, max(0, n - len(voice))))[:n]
    # duck the music under speech: envelope from the cue times, smoothed
    speaking = np.zeros(n, np.float32)
    for l in cues["lines"]:
        speaking[int(l["start"] * SR): int(l["end"] * SR)] = 1
    k = int(0.25 * SR); speaking = np.convolve(speaking, np.ones(k) / k, mode="same")
    bed = music(cues["duration"]) * (0.16 - 0.10 * speaking)
    bed *= env(n, 1.5, 2.5)
    fx = np.zeros(n, np.float32)
    starts = {(l["scene"], l["li"]): l["start"] for l in cues["lines"]}
    for scene, li, off, kind in SFX.get(vid, []):
        s = int((starts[(scene, li)] + off) * SR); e = sfx(kind)
        fx[s:s + len(e)] += e[: max(0, n - s)]
    mix = voice * 0.95 + bed + fx
    mix /= max(1.0, np.abs(mix).max() / 0.97)
    with wave.open(os.path.join(HERE, "build", vid, "mix.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())
    names = {"A": "Alba", "H": "Captain"}
    with open(os.path.join(HERE, "build", vid, "captions.vtt"), "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        i = 0
        for l in cues["lines"]:
            for a, b, text in split_cap(l["cap"], l["start"], l["end"]):
                i += 1
                f.write(f"{i}\n{vtt_time(a)} --> {vtt_time(b)}\n<v {names[l['voice']]}>{text}\n\n")
    print(vid, "mixed")

if __name__ == "__main__":
    for v in (sys.argv[1:] or [f[:-5] for f in sorted(os.listdir(os.path.join(HERE, "cues")))]):
        build(v)
