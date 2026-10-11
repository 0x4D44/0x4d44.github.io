"""Speak every video's narration with Piper and write the timing cues.

usage: python3 tts.py [video-id ...]      (default: all)
needs: pip install piper-tts numpy ; voices in $VOICES (default ./voices):
  en_GB-alba-medium.onnx(.json), en_GB-alan-medium.onnx(.json)  from rhasspy/piper-voices
writes: build/<id>/narration.wav, cues/<id>.json
"""
import json, os, re, sys, wave, io
import numpy as np
from piper import PiperVoice, SynthesisConfig
from script import VIDEOS

HERE = os.path.dirname(os.path.abspath(__file__))
VOICES = os.environ.get("VOICES", os.path.join(HERE, "voices"))
SR = 22050
LEAD, LINE_GAP, SCENE_GAP, TAIL = 1.2, 0.45, 0.9, 2.0
CAST = {
    "A": ("en_GB-alba-medium.onnx", SynthesisConfig(length_scale=1.06, noise_scale=0.55, noise_w_scale=0.7)),
    "H": ("en_GB-alan-medium.onnx", SynthesisConfig(length_scale=1.04, noise_scale=0.55, noise_w_scale=0.7)),
}
_loaded = {}

def say(voice, text):
    if voice not in _loaded:
        _loaded[voice] = PiperVoice.load(os.path.join(VOICES, CAST[voice][0]))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        # Piper stresses "mantissa" oddly; respell it for the voice only (captions keep the real word).
        spoken = re.sub(r"\b[Mm]antissa", "man tissa", text)
        _loaded[voice].synthesize_wav(spoken, w, syn_config=CAST[voice][1])
    buf.seek(0)
    with wave.open(buf) as r:
        assert r.getframerate() == SR, r.getframerate()
        a = np.frombuffer(r.readframes(r.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    # trim leading/trailing near-silence so our own gaps control the pacing
    nz = np.where(np.abs(a) > 0.01)[0]
    if len(nz):
        a = a[max(0, nz[0] - 200): nz[-1] + 400]
    return a

def build(vid):
    spec = VIDEOS[vid]
    out, t = [np.zeros(int(LEAD * SR), np.float32)], LEAD
    cues = {"id": vid, "title": spec["title"], "scenes": [], "lines": []}
    for si, (scene, lines) in enumerate(spec["scenes"]):
        s0 = t
        for li, (voice, text, cap) in enumerate(lines):
            a = say(voice, text)
            cues["lines"].append({"scene": scene, "si": si, "li": li, "voice": voice, "start": round(t, 3), "end": round(t + len(a) / SR, 3), "cap": cap})
            out.append(a); t += len(a) / SR
            gap = LINE_GAP if li < len(lines) - 1 else 0
            out.append(np.zeros(int(gap * SR), np.float32)); t += gap
        out.append(np.zeros(int(SCENE_GAP * SR), np.float32)); t += SCENE_GAP
        cues["scenes"].append({"id": scene, "start": round(s0, 3), "end": round(t, 3)})
    out.append(np.zeros(int(TAIL * SR), np.float32)); t += TAIL
    cues["duration"] = round(t, 3)
    audio = np.concatenate(out)
    os.makedirs(os.path.join(HERE, "build", vid), exist_ok=True)
    with wave.open(os.path.join(HERE, "build", vid, "narration.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())
    os.makedirs(os.path.join(HERE, "cues"), exist_ok=True)
    with open(os.path.join(HERE, "cues", vid + ".json"), "w") as f:
        json.dump(cues, f, indent=1, ensure_ascii=False)
    print(f"{vid}: {t:.1f}s, {len(cues['lines'])} lines")

if __name__ == "__main__":
    for v in (sys.argv[1:] or VIDEOS):
        build(v)
