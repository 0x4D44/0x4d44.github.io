#!/usr/bin/env python3
"""Pack ferrosintesis stem renders into seamless-looping Opus stems for the game.

Pipeline (see README.md in this folder):
  node gen_music.mjs midi/                       # songs.mjs -> <theme>.<stem>.mid + <theme>.json
  ferrosintesis midi/<theme>.<stem>.mid -o wav/<theme>.<stem>.wav --tail 6   (log -> logs/*.log)
  python3 build_audio.py <work-dir> <out-dir> [theme ...]

Each render is loudness-normalised by the CLI, so the true stem level is recovered from the raw peak it reports
("peak 0.xxxxxx" in the log) vs the peak of the written WAV; the stems are then summed at their natural balance,
scaled so the full mix sits at TARGET_LUFS (peak <= -1 dBFS), folded into a seamless loop and encoded.
Needs: python3 + numpy, ffmpeg (libopus). Not part of the shipped site.
"""
import sys, os, re, json, subprocess, wave
import numpy as np

SR = 44100
TARGET_LUFS = -16.5
PEAK_CEIL = 0.891
KBPS = {"base": 64, "lead": 36, "extra": 24, "boost": 32}
MONO = {"lead", "extra", "boost"}        # solo/percussion stems ship mono (halves decoded memory; base carries the stereo image)
# mastering EQ (tuned from band-energy measurements: tames the low-mid mud / sub boom of the raw renders, adds presence + air)
EQ = ("highpass=f=45:poles=2,lowshelf=f=120:g=-6.5,equalizer=f=230:t=q:w=0.9:g=-3,equalizer=f=500:t=q:w=1:g=-1.5,"
      "equalizer=f=3000:t=q:w=0.8:g=3.5,highshelf=f=6500:g=5")
NARROW = ",pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1"   # fold to mono (the synth chorus/echo can leave solo lines anti-phase)
STEM_FX = {
    "base": EQ + ",acompressor=threshold=0.09:ratio=3:attack=6:release=140:makeup=1.5,alimiter=limit=0.2:attack=2:release=60:level=0",
    "lead": "highpass=f=140," + EQ + NARROW,
    "extra": "highpass=f=140," + EQ + NARROW,
    "boost": "highpass=f=140," + EQ + NARROW,
}
# stem balance in the shipped files (the renders come out with the melody ~9 dB under the band)
MIX_DB = {"base": 0.0, "lead": 6.0, "extra": 2.0, "boost": 4.0}
THEME_MIX = {"skyway": {"boost": 0.0, "lead": 4.5}}   # per-theme overrides of MIX_DB
THEME_TRIM = {"skyway": 0.8, "canyon": 0.5, "mall": 0.5}   # per-theme dB added to TARGET_LUFS (keeps the shipped mixes within ~1 LU of the old themes)


# per-theme extra voicing (piano/strings themes need more presence and less sub)
THEME_EQ = {
    "menu": ",equalizer=f=60:t=q:w=1:g=-2.5,equalizer=f=4500:t=q:w=0.9:g=3,highshelf=f=9000:g=2",
    "results": ",equalizer=f=60:t=q:w=1:g=-3.5,equalizer=f=4500:t=q:w=0.9:g=3,highshelf=f=9000:g=2",
    # round 2: the synth drum kit's hats/claps are noise-heavy -> tame everything above ~5 kHz so the band profile matches the sampled themes
    # acoustic country band: sampled banjo/steel/fiddle need more presence and air than the default mastering EQ gives
    "canyon": ",equalizer=f=3500:t=q:w=0.9:g=3.5,highshelf=f=8500:g=3",
    "highland": ",equalizer=f=3200:t=q:w=0.9:g=2.5,highshelf=f=8500:g=2",
    "skyway": ",equalizer=f=85:t=q:w=1:g=-2.5,equalizer=f=3800:t=q:w=0.8:g=3.5,highshelf=f=7500:g=-9,lowpass=f=15000",
}


def ff(arr, filt):
    """Run a float32 stereo array through an ffmpeg filter graph (no quantisation)."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", filt, "-f", "f32le", "-"],
                       input=arr.astype("<f4").tobytes(), capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype="<f4").reshape(-1, 2).astype(np.float64)


def read_wav(path):
    w = wave.open(path)
    a = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").reshape(-1, w.getnchannels()).astype(np.float64) / 32768.0
    return a


def lufs(arr):
    tmp = "/tmp/_lufs_probe.wav"
    write_wav(tmp, arr)
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", tmp, "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", out)
    return float(m[-1]) if m else float("nan")


def write_wav(path, arr):
    w = wave.open(path, "wb")
    w.setnchannels(arr.shape[1]); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(arr, -1, 1) * 32767).astype("<i2").tobytes())
    w.close()


def main():
    work, out = sys.argv[1], sys.argv[2]
    themes = sys.argv[3:] or ["menu", "sunset", "snow", "neon", "results", "skyway", "canyon", "highland", "mall"]
    for th in themes:
        lay = json.load(open(f"{work}/midi/{th}.json"))
        beat = round(60e6 / lay["bpm"]) / 1e6            # the synth uses integer microseconds per beat
        bar = 4 * beat
        intro_n = round(lay["introBars"] * bar * SR)
        body_n = round(lay["bodyBars"] * bar * SR)
        tail_n = round(lay["tailBars"] * bar * SR)
        stems = {}
        for st in lay["stems"]:
            a = read_wav(f"{work}/wav/{th}.{st}.wav")
            raw = float(re.search(r"peak ([\d.]+),", open(f"{work}/logs/{th}.{st}.log").read()).group(1))
            g = np.abs(a).max() / raw            # CLI scalar gain applied to this stem
            stems[st] = ff(a / g * 0.25, STEM_FX[st] + THEME_EQ.get(th, "")) * 4.0 * 10 ** ({**MIX_DB, **THEME_MIX.get(th, {})}[st] / 20)
        # fold: body[0:tail] <- render of the repeated first bars (carries the body-end reverb tail)
        folded = {}
        for st, a in stems.items():
            need = intro_n + body_n + tail_n
            if len(a) < need: a = np.pad(a, ((0, need - len(a)), (0, 0)))
            f = a[: intro_n + body_n].copy()
            f[intro_n: intro_n + tail_n] = a[intro_n + body_n: intro_n + body_n + tail_n]
            folded[st] = f
        mix = sum(folded.values())
        L = lufs(mix[intro_n:] if intro_n else mix)
        pk = np.abs(mix).max()
        k = min(10 ** ((TARGET_LUFS + THEME_TRIM.get(th, 0) - L) / 20), PEAK_CEIL / pk)
        print(f"{th}: raw full-mix {L:.1f} LUFS peak {pk:.3f} -> gain {20*np.log10(k):+.1f} dB", flush=True)
        os.makedirs(f"{out}/{th}", exist_ok=True)
        meta = {"bpm": lay["bpm"], "introSec": intro_n / SR, "loopSec": body_n / SR, "stems": {}}
        for st, f in folded.items():
            f = f * k
            wavp = f"{work}/pack_{th}.{st}.wav"
            write_wav(wavp, f)
            dst = f"{out}/{th}/{st}.ogg"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wavp, "-ar", "48000", "-ac", "1" if st in MONO else "2", "-c:a", "libopus", "-b:a", f"{KBPS[st]}k",
                            "-vbr", "on", "-application", "audio", "-map_metadata", "-1", dst], check=True)
            meta["stems"][st] = {"bytes": os.path.getsize(dst)}
        json.dump(meta, open(f"{out}/{th}/meta.json", "w"), indent=1)
        write_wav(f"{work}/pack_{th}.full.wav", mix * k)
        print("  bytes", sum(s["bytes"] for s in meta["stems"].values()), flush=True)


if __name__ == "__main__":
    main()
