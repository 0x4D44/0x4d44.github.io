# Video explainers — source

The six short explainers in `../videos/` are rendered from this folder. Nothing
here is loaded by the site; it is kept so the videos can be re-made after an edit.

| File | Job |
| --- | --- |
| `script.py` | Narration, line by line, per video and scene. `A` = Flt Lt Alba Murray, `H` = Capt. Hamish Blackwood. |
| `tts.py` | Speaks each line with [Piper](https://github.com/rhasspy/piper) (`en_GB-alba-medium`, `en_GB-alan-medium`) and writes `build/<id>/narration.wav` plus timing cues `cues/<id>.json`. |
| `video.html`, `lib.js`, `scenes.js` | Deterministic 1280×720 canvas scenes, driven by the cues. Open `video.html?id=<id>` in a browser to scrub one. |
| `render.mjs` | Steps the scenes frame by frame in headless Chromium (Playwright) and pipes PNGs to ffmpeg. |
| `audio.py` | Synthesises the music bed and sound effects, mixes them under the narration, and writes WebVTT captions and the poster frame. |
| `sheet.mjs` | Contact sheet of a rendered video, for checking layouts. |
| `make.sh` | Render + mix every video (or the ids given) into `../videos/<id>.mp4`, `.vtt`, `.jpg`. |

## Re-making a video

```
pip install piper-tts numpy scipy        # plus ffmpeg and Node with Playwright
python3 tts.py floating-point            # voices in ./voices or $VOICES
sh make.sh floating-point
```

Run `tts.py` again whenever a line in `script.py` changes; the scene timings follow
the cues, so nothing else needs adjusting. `build/` is scratch and is not committed.
