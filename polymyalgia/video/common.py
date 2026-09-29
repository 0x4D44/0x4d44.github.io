"""Shared look, voice and sound helpers for the PMR explainer scenes."""
import re
import subprocess
from pathlib import Path

from manim import *  # noqa: F401,F403
from manim_voiceover import VoiceoverScene
from manim_voiceover.helper import remove_bookmarks
from manim_voiceover.services.base import SpeechService

ROOT = Path(__file__).resolve().parent
SFX_DIR = ROOT / "assets" / "sfx"
VOICE_MODEL = Path("/opt/voices/en_GB-cori-high.onnx")
PIPER = "/opt/mv/bin/piper"

# ---------------------------------------------------------------- palette
BG = "#0F1117"
INK = "#ECE8E1"          # primary text
MUTED = "#8B8F9C"        # secondary text
ORANGE = "#FF8A3D"       # inflammation / schematic
BLUE = "#58C4DD"         # structure
VIOLET = "#A78BDA"       # hormones / cortisol
MINT = "#6FD6A6"         # measured evidence
RED = "#FF5A5F"          # danger (GCA)
AMBER = "#FFC857"
BONE = "#E6DCC8"
GREY = "#3A3F4B"
FONT = "CMU Serif"
SANS = "Lato"

config.background_color = BG


def T(text, size=36, color=INK, font=FONT, **kw):
    return Text(text, font=font, font_size=size, color=color, **kw)


def S(text, size=26, color=MUTED, **kw):
    """Small sans caption."""
    return Text(text, font=SANS, font_size=size, color=color, **kw)


def tag(text, color=ORANGE, size=18):
    """Rounded 'SCHEMATIC' / 'MEASURED' label, as on the web page."""
    label = Text(text.upper(), font=SANS, font_size=size, color=color, weight=BOLD)
    box = RoundedRectangle(
        corner_radius=0.12, width=label.width + 0.35, height=label.height + 0.22,
        stroke_color=color, stroke_width=1.5, fill_color=color, fill_opacity=0.08,
    )
    return VGroup(box, label.move_to(box))


def chip(text, color=INK, size=24, fill=GREY, pad=0.28):
    label = Text(text, font=SANS, font_size=size, color=color)
    box = RoundedRectangle(
        corner_radius=0.15, width=label.width + 2 * pad, height=label.height + 0.3,
        stroke_width=0, fill_color=fill, fill_opacity=0.85,
    )
    return VGroup(box, label.move_to(box))


def glow(mob, color, layers=5, max_width=26, opacity=0.08):
    """Soft halo: stacked wide translucent strokes behind a path."""
    g = VGroup()
    for i in range(layers, 0, -1):
        c = mob.copy().set_fill(opacity=0).set_stroke(color, width=max_width * i / layers, opacity=opacity)
        g.add(c)
    return g


def bullet_rows(items, size=28, color=INK, buff=0.32, marker_color=ORANGE):
    rows = VGroup()
    for it in items:
        dot = Dot(radius=0.06, color=marker_color)
        txt = T(it, size, color)
        rows.add(VGroup(dot, txt).arrange(RIGHT, buff=0.25))
    rows.arrange(DOWN, aligned_edge=LEFT, buff=buff)
    return rows


# ---------------------------------------------------------------- speech
SAY = [
    (r"PMR-SPARE", "P M R Spare"),
    (r"\bSAPHYR\b", "Sapphire"),
    (r"\bREPLENISH\b", "Replenish"),
    (r"\bPMR\b", "P M R"),
    (r"\bGCA\b", "G C A"),
    (r"\bIL-6\b", "I L six"),
    (r"\bIL-17A\b", "I L seventeen A"),
    (r"\bCRP\b", "C R P"),
    (r"\bESR\b", "E S R"),
    (r"\bHLA\b", "H L A"),
    (r"JAK[–-]STAT", "jack-stat"),
    (r"\bgp130\b", "G P one-thirty"),
    (r"\bA&E\b", "A and E"),
    (r"\bNHS\b", "N H S"),
    (r"\bUK\b", "U K"),
    (r"(\d)\s?%", r"\1 percent"),
    (r"\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(one|two|three|four|five|six|seven|eight|nine)\b",
     r"\1 \2"),
]


def spoken(text):
    for pat, rep in SAY:
        text = re.sub(pat, rep, text)
    return text


class PiperService(SpeechService):
    """Offline neural TTS (Piper) for manim-voiceover."""

    def __init__(self, model=VOICE_MODEL, length_scale=0.9, sentence_silence=0.15, **kwargs):
        self.model = str(model)
        self.length_scale = length_scale
        self.sentence_silence = sentence_silence
        SpeechService.__init__(self, **kwargs)

    def generate_from_text(self, text, cache_dir=None, path=None, **kwargs):
        cache_dir = cache_dir or self.cache_dir
        say = spoken(remove_bookmarks(text))
        input_data = {
            "input_text": say, "service": "piper", "model": Path(self.model).name,
            "length_scale": self.length_scale, "sentence_silence": self.sentence_silence, "volume": 0.8,
        }
        cached = self.get_cached_result(input_data, cache_dir)
        if cached is not None:
            return cached
        audio_path = path or (self.get_audio_basename(input_data) + ".wav")
        subprocess.run(
            [PIPER, "-m", self.model, "-f", str(Path(cache_dir) / audio_path),
             "--length-scale", str(self.length_scale),
             "--sentence-silence", str(self.sentence_silence), "--volume", "0.8"],
            input=say.encode(), check=True, capture_output=True,
        )
        return {"input_text": text, "input_data": input_data, "original_audio": audio_path}


# ---------------------------------------------------------------- base scene
class PMRScene(VoiceoverScene):
    def setup(self):
        super().setup()
        self.set_speech_service(PiperService(cache_dir=str(ROOT / "media" / "voiceovers")))

    def sfx(self, name, gain=0.0, offset=0.0):
        self.add_sound(str(SFX_DIR / f"{name}.wav"), time_offset=offset, gain=gain)

    def say(self, text):
        return self.voiceover(text=text)

    def chapter(self, number, title, kicker):
        """3B1B-style chapter card; returns nothing, clears itself."""
        num = T(f"{number:02d}", 30, ORANGE, font=SANS)
        line = Line(LEFT, RIGHT, color=ORANGE, stroke_width=2).set_width(0.6)
        head = T(title, 58)
        sub = T(kicker, 30, MUTED, slant=ITALIC)
        grp = VGroup(VGroup(num, line).arrange(RIGHT, buff=0.25), head, sub).arrange(DOWN, buff=0.35)
        self.sfx("whoosh", -4)
        self.play(FadeIn(grp[0], shift=RIGHT * 0.3), Write(head, run_time=1.1), run_time=1.1)
        self.play(FadeIn(sub, shift=UP * 0.15), run_time=0.6)
        self.wait(0.25)
        self.play(FadeOut(grp, shift=UP * 0.3), run_time=0.45)

    def clear_all(self, run_time=0.45):
        if self.mobjects:
            self.play(*[FadeOut(m) for m in self.mobjects], run_time=run_time)
