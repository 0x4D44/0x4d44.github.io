"""Render every scene, stitch them, lay the original score under the narration.

    python build.py            # 1080p30 render + mix  -> out/polymyalgia-explained.mp4
    python build.py --quick    # 480p15 preview        -> out/preview.mp4
    python build.py --mix-only # reuse existing scene renders

Prerequisites: a Python venv at /opt/mv with `manim` and `manim-voiceover`
(+ piper-tts, scipy), ffmpeg, a TeX Live with latex-extra + dvisvgm, the CMU Serif
and Lato fonts, and the Piper voice en_GB-cori-high in /opt/voices (paths set in
common.py). Optional intelligibility check: `tools/asr_check.py` (openai-whisper).
"""
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d, uniform_filter1d

sys.path.insert(0, str(Path(__file__).parent / "audio"))
from music import compose  # noqa: E402

ROOT = Path(__file__).resolve().parent
PY = "/opt/mv/bin/python"
SR = 48000
SCENES = [
    ("S01Hook", "hook"), ("S02Tissues", "tissue"), ("S03Causes", "cause"), ("S04Signal", "signal"),
    ("S05Rhythm", "rhythm"), ("S06Diagnosis", "diagnose"), ("S07GCA", "danger"), ("S08Taper", "taper"),
    ("S09Trials", "trials"), ("S10Recovery", "recovery"), ("S11Close", "close"),
]
QUICK = "--quick" in sys.argv
QDIR = "480p15" if QUICK else "1080p30"
OUT = ROOT / "out"


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def render(name):
    q = ["-ql"] if QUICK else ["-r", "1920,1080", "--fps", "30"]
    log = ROOT / "logs" / f"{name}.log"
    with open(log, "w") as fh:
        run([PY, "-m", "manim", *q, "scenes.py", name], cwd=ROOT, stdout=fh, stderr=subprocess.STDOUT)
    return name


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                          str(path)], capture_output=True, text=True, check=True).stdout
    return float(out)


def srt_time(s):
    h, m = int(s // 3600), int(s % 3600 // 60)
    return f"{h:02d}:{m:02d}:{s % 60:06.3f}".replace(".", ",")


def parse_srt(path):
    cues = []
    for block in path.read_text().strip().split("\n\n"):
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        a, b = [x.strip() for x in lines[1].split("-->")]

        def sec(x):
            hh, mm, rest = x.split(":")
            return int(hh) * 3600 + int(mm) * 60 + float(rest.replace(",", "."))
        cues.append((sec(a), sec(b), " ".join(lines[2:])))
    return cues


def main():
    OUT.mkdir(exist_ok=True)
    (ROOT / "logs").mkdir(exist_ok=True)
    if "--mix-only" not in sys.argv:
        with ThreadPoolExecutor(max_workers=2) as ex:
            for name in ex.map(render, [s for s, _ in SCENES]):
                print("rendered", name, flush=True)

    vids = [ROOT / "media" / "videos" / "scenes" / QDIR / f"{s}.mp4" for s, _ in SCENES]
    durs = [duration(v) for v in vids]
    print("scene durations", [round(d, 1) for d in durs], "total", round(sum(durs), 1))

    lst = OUT / "concat.txt"
    lst.write_text("".join(f"file '{v}'\n" for v in vids))
    joined = OUT / "joined.mp4"
    run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy",
         str(joined)])

    # narration + sfx track as rendered by manim-voiceover
    vo_wav = OUT / "vo.wav"
    run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(joined), "-vn", "-ac", "2", "-ar", str(SR), str(vo_wav)])
    _, vo = wavfile.read(vo_wav)
    vo = vo.astype(np.float32) / 32768
    total = len(vo) / SR

    # sections line up with scene boundaries (use actual concat total)
    scale = total / sum(durs)
    music = compose([(d * scale, mood) for d, (_, mood) in zip(durs, SCENES)], SR)
    music = music[: len(vo)]
    if len(music) < len(vo):
        music = np.pad(music, ((0, len(vo) - len(music)), (0, 0)))

    # side-chain ducking from the narration envelope
    mono = np.abs(vo).mean(axis=1)
    win = int(0.05 * SR)
    env = np.sqrt(uniform_filter1d(mono ** 2, win))
    speaking = (env > 0.02).astype(np.float32)
    speaking = maximum_filter1d(speaking, int(0.35 * SR))           # hold through short gaps
    duck = uniform_filter1d(speaking, int(0.4 * SR))                 # smooth attack/release
    bed, under = 10 ** (-12 / 20), 10 ** (-21 / 20)
    gain = under + (bed - under) * (1 - duck)
    mix = vo + music * gain[:, None]
    peak = np.max(np.abs(mix))
    mix = mix / max(peak, 1.0) * 0.97
    mix_wav = OUT / "mix.wav"
    wavfile.write(mix_wav, SR, (mix * 32767).astype(np.int16))
    wavfile.write(OUT / "music_only.wav", SR, (music * gain[:, None] * 32767).astype(np.int16))

    final = OUT / ("preview.mp4" if QUICK else "polymyalgia-explained.mp4")
    vopts = ["-c:v", "copy"] if QUICK else ["-c:v", "libx264", "-preset", "slow", "-crf", "24",
                                            "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(joined), "-i", str(mix_wav), "-map", "0:v", "-map", "1:a",
         *vopts, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "160k", "-ar", str(SR),
         str(final)])

    # captions: stitch the per-scene subcaption files manim-voiceover wrote
    cues, off = [], 0.0
    for v, d in zip(vids, durs):
        srt = v.with_suffix(".srt")
        if srt.exists():
            cues += [(a + off, b + off, t) for a, b, t in parse_srt(srt)]
        off += d * scale
    vtt = ["WEBVTT", ""]
    for i, (a, b, t) in enumerate(cues, 1):
        vtt += [f"{srt_time(a).replace(',', '.')} --> {srt_time(b).replace(',', '.')}", t, ""]
    (OUT / "captions.vtt").write_text("\n".join(vtt))
    (OUT / "chapters.json").write_text(json.dumps(
        [{"scene": s, "start": round(sum(durs[:i]) * scale, 2)} for i, (s, _) in enumerate(SCENES)], indent=1))
    print("wrote", final, round(duration(final), 1), "s")


if __name__ == "__main__":
    main()
