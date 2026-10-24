"""Mix narration wavs (placed per timeline.json) with a soft synthesised pad and scene chimes. numpy only."""
import json, sys, wave
import numpy as np

SR = 44100
tl = json.load(open(sys.argv[1]))
n = int((tl["total"] + 0.5) * SR)
voice = np.zeros(n, dtype=np.float32)

def read(path):
    with wave.open(path) as w:
        sr, ch = w.getframerate(), w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    if ch > 1: x = x.reshape(-1, ch).mean(1)
    if sr != SR:
        t = np.arange(int(len(x) * SR / sr)) / SR
        x = np.interp(t, np.arange(len(x)) / sr, x).astype(np.float32)
    return x

for sc in tl["scenes"]:
    for ln in sc["lines"]:
        x = read(ln["wav"]); i = int(ln["start"] * SR)
        voice[i:i + len(x)] += x[: max(0, n - i)]
voice *= 0.9 / max(1e-6, np.abs(voice).max())

t = np.arange(n) / SR
# pad: slow-moving Am9-ish chord, each partial with its own tremolo; very quiet
notes = [110.0, 164.81, 220.0, 261.63, 329.63, 493.88]
pad = np.zeros(n, dtype=np.float32)
for k, f in enumerate(notes):
    lfo = 0.55 + 0.45 * np.sin(2 * np.pi * (0.05 + 0.013 * k) * t + k)
    pad += (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.003 * t)) * lfo * (0.9 / (1 + k * 0.3))
pad /= np.abs(pad).max()
# slow chord drift by scene: shift the pad up a tone on the stove scene for a lift (cheap resynth)
fade = np.minimum(1, np.minimum(t / 2.0, (tl["total"] - t) / 3.0)).clip(0, 1)
# duck under speech
env = np.convolve(np.abs(voice), np.ones(int(0.25 * SR)) / int(0.25 * SR), mode="same")
duck = 1 - 0.55 * np.clip(env / 0.12, 0, 1)
music = pad * fade * duck * 0.11

# chime at each scene start
chime = np.zeros(n, dtype=np.float32)
for sc in tl["scenes"]:
    i = int((sc["start"] - 0.9) * SR)
    if i < 0: continue
    for j, f in enumerate((659.25, 880.0)):
        s = i + int(j * 0.18 * SR); m = int(1.6 * SR)
        tt = np.arange(m) / SR
        w = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 3.2) * np.minimum(1, tt * 200)
        chime[s:s + m] += (w * 0.07)[: max(0, n - s)]

mix = voice * 0.95 + music + chime
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
out = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print("audio", len(out) / SR, "s")
