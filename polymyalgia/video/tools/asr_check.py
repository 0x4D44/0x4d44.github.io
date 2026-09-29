"""Transcribe a mix with Whisper and compare against the narration script (WER).

A proxy for "is the narration intelligible over the music and effects?"

    python tools/asr_check.py out/preview.mp4
"""
import ast
import re
import sys
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent


def script_texts():
    tree = ast.parse((ROOT / "scenes.py").read_text())
    calls = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and getattr(n.func, "attr", "") == "say"]
    calls.sort(key=lambda n: n.lineno)
    return [ast.literal_eval(c.args[0]) for c in calls]


def norm(s):
    s = s.lower().replace("-", " ").replace("–", " ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return s.split()


def wer(r, h):
    d = np.zeros((len(r) + 1, len(h) + 1), dtype=np.int32)
    d[:, 0] = range(len(r) + 1)
    d[0, :] = range(len(h) + 1)
    for i in range(1, len(r) + 1):
        ri = r[i - 1]
        for j in range(1, len(h) + 1):
            d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (ri != h[j - 1]))
    return d[-1, -1] / max(len(r), 1)


def main():
    model = WhisperModel("base.en", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(sys.argv[1], beam_size=5)
    hyp = " ".join(s.text for s in segs)
    (ROOT / "out" / "asr_transcript.txt").write_text(hyp)
    r, h = norm(" ".join(script_texts())), norm(hyp)
    print(f"ref words {len(r)}  hyp words {len(h)}  WER {wer(r, h):.3f}")


if __name__ == "__main__":
    main()
