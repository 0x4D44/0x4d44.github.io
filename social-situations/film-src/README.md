# Short film generator

Source for `../film.mp4`, the 81-second film embedded at the top of the Social
Situations page. The look is painted cut-out stop motion in gouache style, with an
original score and sound effects. Everything is generated procedurally in Python:
nothing is drawn by hand, sampled or recorded.

This directory is repo-meta rather than part of the page. GitHub Pages serves it
verbatim, but nothing links to it.

## Files

| File | Role |
|---|---|
| `gouache.py` | Paint engine. It draws brush strokes, pigment pooling, chalk speckle, cold-press paper tooth, dry-brush edges, cut paper margins, painted lettering and contact shadows. It also composites each frame, adding placement jitter, exposure flicker and a per-frame "boil" warp. |
| `figures.py` | Peg-doll figures: several moods, blinks, and jointed arms (`Rig`). |
| `board.py` | Painted boards (cards) plus the `Actor` animation system. Covers hand-placed entrances, stepped slides, walks with squash, gestures and props. The SFX cue list is emitted from here too, so sound stays in sync with the picture. |
| `scenes.py`, `scenes2.py` | The seven scenes. One bar (90 bpm, 4/4) is 32 drawn frames, so every cut lands on a barline. |
| `render.py` | Renders `frames/*.jpg` at 12 fps (animated on twos) on four processes and writes `events.json`. |
| `audio.py` | The score (`PLAN`: chords, melody and section per bar) and the synthesized instruments, the sound design driven by `events.json`, and the mix. Writes `mix.wav` plus the `music.wav` and `sfx.wav` stems. |
| `analyze.py` | Spectrograms and a loudness plot with scene markers (`audio_analysis.png`), used for review. |
| `mux.sh` | Converts frames to 24 fps, adds the audio, loudness-normalises and encodes H.264/AAC to `social-situations.mp4`. |
| `RUBRIC.md` | The scoring rubric used to critique each version. |

## Rebuild

Requirements: Python 3 with `numpy scipy pillow opencv-python-headless fonttools brotli`
(add `matplotlib` for `analyze.py`), and an `ffmpeg` that has libx264 on your PATH
(`pip install imageio-ffmpeg` bundles one).

```
./fetch_fonts.sh              # Caveat Brush, Kalam, Fraunces (OFL), from Fontsource via jsDelivr
python3 render.py             # ~1 min on 4 cores; add --force to re-render existing frames
python3 audio.py
./mux.sh                      # -> social-situations.mp4 (master, ~60 MB)
# web copy + poster for the page:
ffmpeg -i social-situations.mp4 -c:v libx264 -preset slow -crf 25 -tune animation \
  -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart ../film.mp4
ffmpeg -i frames/00090.jpg -vf scale=1280:-1 -q:v 4 ../film-poster.jpg
```

`python3 render.py stills 90,640,930` renders individual frames to `stills/` for quick
previews. Output is deterministic: every random choice is seeded.

## How it was scored

A critic subagent reviewed each version against `RUBRIC.md` (eight weighted criteria,
target >= 8.0 with nothing below 6). It worked from sampled frames and consecutive-frame
runs, and judged the audio from the stems, spectrograms, loudness measurements and the
score code. We iterated on its prioritised fix lists:

| Version | Score | Main changes |
|---|---|---|
| v1 | 6.7 | First cut |
| v2 | 7.4 | Real brush-stroke paint and paper tooth, jointed arms, the situation-map scene, cheat sheet, score dynamics |
| v3 | 7.7 | Hero acts on the map, tighter ending, squash and re-posing, second pigment pass, bowed lead and countermelody |
| v4 | 7.85 | Painted lettering, torso lean, suspended cadence, final chord no longer cut off, loop pacing |
| v5 | **8.0** | Hand-placed entrances in place of scale pops, stepped slides, crowd bridge, legible tags, signature paper-tear sound, shared room reverb |
