# SKYBLITZ soundtrack - credits and licences

All music in this folder (menu, sunrise, redrock, neon, frost, results and the win / lose / finalLap stingers) is an **original
composition written for SKYBLITZ**. The composer scripts and the exported MIDI files are in `../music-src/`
(`tracks/*.mjs`, `midi/*.mid`); the pieces are generated algorithmically from chord progressions, hand-written motifs and
arrangement rules - nothing is transcribed from or derived from any existing song.

The audio was rendered offline with **ferrosintesis** (https://github.com/0x4D44/ferrosintesis, MIT OR Apache-2.0), a pure-Rust
General-MIDI synthesiser that embeds recorded instrument samples, then balanced, folded into seamless loops and encoded to Ogg Opus
(`../music-src/post.py`). The `.ogg` files are therefore derivative audio of the embedded sample sets, whose required attributions
(CC BY 3.0 / CC BY 4.0 / MIT) are reproduced below. The remaining embedded banks (drum kits, VCSL, VSCO 2 CE, FreePats and
owner-recorded sets) are CC0 1.0 and need no attribution. None of the sets forbids redistribution of rendered audio in a public web
game. Changes made: samples were trimmed, pitch-shifted, layered with physical models, mixed, EQ-ed, compressed and encoded to Opus.

Which sets are heard depends on the General-MIDI programs used (piano, celesta, glockenspiel, harp, strings, horns, brass, choir,
guitars, basses, synth leads/pads, drums, timpani, marimba, steel drum, clavinet, electric piano). The full notice list below is
carried with the soundtrack so the attributions travel with the audio whichever sets contributed.

The SFX in the game are procedural WebAudio synthesis (no sample files) and need no attribution.

---

## ferrosintesis-samples-grand

Grand-piano samples: "Salamander Grand Piano V3" by Alexander Holm, licensed
CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).
Source: https://archive.org/details/SalamanderGrandPianoV3 — a Yamaha C5 concert
grand; individual note×velocity recordings trimmed, downmixed to mono, and
resampled into attack/body transients. No modifications endorsed by the author.


---

## ferrosintesis-samples-headroom

ferrosintesis-samples-headroom
==============================

The embedded FLAC samples in this crate are derived from the "Headroom Piano" /
"Intimate Piano" (a Yamaha C3 grand) recorded by **Bengt Nilsson**, SFZ conversion
by kinwie, distributed at https://github.com/sfzinstruments/BengtNilsson.HeadroomPiano.

Licensed under the **Creative Commons Attribution 4.0 International (CC BY 4.0)**
licence: https://creativecommons.org/licenses/by/4.0/

ATTRIBUTION (required by CC BY 4.0):
  - Original instrument recorded by Bengt Nilsson ("Headroom Piano" / "Intimate
    Piano"). The original instrument name is retained per the author's terms.
  - SFZ mapping by kinwie.

This crate uses the close-mic ("Intimate") set only. No endorsement by the
authors is implied.


---

## ferrosintesis-samples-ccby

ferrosintesis-samples-ccby — attribution notices (CC BY 4.0)
============================================================

This crate embeds sound recordings licensed under Creative Commons Attribution 4.0
International (https://creativecommons.org/licenses/by/4.0/). Attribution as required by
that licence:

- GM 4 electric piano (Rhodes tine) onsets — "C_S Fender Rhodes Mark II" by tim.kahn,
  Freesound pack 3957 (https://freesound.org/people/tim.kahn/packs/3957/), CC BY 4.0.

- GM 15 hammered-dulcimer onsets — "Multi-sampled Hammered Dulcimer" by iternetcone,
  Freesound pack 19445 (https://freesound.org/people/iternetcone/packs/19445/), CC BY 4.0.

The embedded samples are attack transients trimmed from the original recordings (and repitched
per note at play time by ferrosintesis). No endorsement by the authors is implied.


---

## ferrosintesis-samples-sax

Saxophone samples: solo-saxophone single notes (soprano, alto, tenor, baritone)
from the MTG "good-sounds" dataset (Music Technology Group, Universitat Pompeu
Fabra, Barcelona), assembled as the "MTG Solo Saxophones" SFZ instrument by kinwie,
licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). The underlying
good-sounds recordings are CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).

Source: https://github.com/sfzinstruments/MTG.SoloSax — individual FLAC single
notes recorded with a Neumann U87; the underlying recordings are the MTG
good-sounds.org packs published on Freesound (CC BY 3.0).

Modifications: the individual notes were decoded from FLAC, trimmed to keep attack
plus loopable recorded sustain, downmixed to mono, resampled to 44.1 kHz 16-bit,
and used as the recorded default sax voice in ferrosintesis. This is a modified
use of the material; no endorsement by the original authors is implied.


---

## ferrosintesis-samples-ydp-grand

ferrosintesis-samples-ydp-grand
===============================

This crate voices the GM 1 Bright Acoustic Piano alternate (CC0=1) in
ferrosintesis.

The embedded samples in this crate are extracted from the "YDP Grand Piano"
SoundFont (the middle velocity layer of the "Grand Piano" preset) produced by
roberto@zenvoid.org for the FreePats project, from the Zenph Studios / OLPC
Yamaha Disklavier Pro reperformance samples. The original samples were
computer-performed and recorded for OLPC by Dr. Mikhail Krishtal, Director of
Music Research and Production, and his Zenph Studios team.

Licensed under the **Creative Commons Attribution 3.0 (CC BY 3.0)** license:
https://creativecommons.org/licenses/by/3.0/

ATTRIBUTION (required by CC BY 3.0):
  - "YDP Grand Piano" SoundFont by roberto@zenvoid.org for the FreePats project.
  - Underlying samples: computer-performed and recorded for OLPC by
    Dr. Mikhail Krishtal and his Zenph Studios team, CC BY.

Source: https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html


---

## ferrosintesis-samples-gong

Gamelan gong samples: "CdM Gamelan Sample Library" by Digitópia / Casa da Música
(Freesound user "Digitopia_CdM"), licensed CC BY 3.0
(https://creativecommons.org/licenses/by/3.0/).
Works used: Freesound sounds 261890 (soft layer) and 261893 (loud layer), from that
library.
Source: https://freesound.org/people/Digitopia_CdM/ — samples trimmed/resampled.

Canonical credit string (use this spelling everywhere):
    "CdM Gamelan Sample Library" by Digitópia / Casa da Música, CC BY 3.0


---

## ferrosintesis-samples-musescore

The samples in this crate are extracted from the MuseScore "MS Basic" soundfont
(MuseScore_General lineage), distributed under the MIT License. The MIT license and
MuseScore's terms require that the acknowledgements and copyright notices below be
included in any derivative work; they are reproduced here:

    FluidR3 (original version) by Frank Wen Copyright (c) 2000-02
    Mono conversion (FluidR3Mono) by Michael Cowgill Copyright (c) 2014-17
    Adaptation for MuseScore_General.sf2 by S. Christian Collins Copyright (c) 2018-19
    Temple Blocks instrument provided by Ethan Winer Copyright (c) 2002
    Drumline Cymbals provided by Michael Schorsch Copyright (c) 2016
    Copyright (c) 2014-16 Michael Cowgill
    Copyright (c) 2000-2002, 2008 Frank Wen <getfrank@gmail.com>

The MS Basic soundfont carries no per-instrument attribution for these programs, so
per its own license they trace to the FluidR3Mono samples (Frank Wen / Michael
Cowgill / S. Christian Collins), with the upstream Temple Blocks and Drumline Cymbals
acknowledgements retained because the pinned source requires the whole acknowledgement
set to travel. This crate holds the ONSET transients of GM 8 celesta, GM 104 sitar,
GM 61 brass section (including its early body), and the GM 75/76/77 pipes (pan flute /
blown bottle / shakuhachi); the GM 7 clavinet from the same soundfont ships separately
in ferrosintesis-samples-clavinet.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in the
Software without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


---

## ferrosintesis-samples-clavinet

The clavinet samples in this crate are extracted from the MuseScore "MS Basic"
soundfont (MuseScore_General lineage), distributed under the MIT License. The MIT
license and MuseScore's terms require that the acknowledgements and copyright
notices below be included in any derivative work; they are reproduced here:

    FluidR3 (original version) by Frank Wen Copyright (c) 2000-02
    Mono conversion (FluidR3Mono) by Michael Cowgill Copyright (c) 2014-17
    Adaptation for MuseScore_General.sf2 by S. Christian Collins Copyright (c) 2018-19
    Temple Blocks instrument provided by Ethan Winer Copyright (c) 2002
    Drumline Cymbals provided by Michael Schorsch Copyright (c) 2016
    Copyright (c) 2014-16 Michael Cowgill
    Copyright (c) 2000-2002, 2008 Frank Wen <getfrank@gmail.com>

The MS Basic soundfont carries no per-instrument attribution for the clavinet, so
per its own license it traces to the FluidR3Mono samples (Frank Wen / Michael
Cowgill / S. Christian Collins), with the upstream Temple Blocks and Drumline
Cymbals acknowledgements retained because the pinned source requires the whole
acknowledgement set to travel.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in the
Software without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


---

## ferrosintesis-samples-musescore-grand

The grand-piano samples in this crate are extracted from the "Grand Piano"
preset of the MuseScore_General soundfont (MuseScore_General.sf3), distributed
under the MIT License. The MuseScore_General COPYING says this soundfont is
shared under MIT, "as was FluidR3Mono and FluidR3 before it"; the MIT license and
MuseScore's terms require that the acknowledgements and copyright notices below
be included in any derivative work, so they are reproduced here:

    FluidR3 (original version) by Frank Wen Copyright (c) 2000-02
    Mono conversion (FluidR3Mono) by Michael Cowgill Copyright (c) 2014-17
    Adaptation for MuseScore_General.sf2 by S. Christian Collins Copyright (c) 2018-19
    Temple Blocks instrument provided by Ethan Winer Copyright (c) 2002
    Drumline Cymbals provided by Michael Schorsch Copyright (c) 2016
    Copyright (c) 2014-16 Michael Cowgill
    Copyright (c) 2000-2002, 2008 Frank Wen <getfrank@gmail.com>

This crate holds the MF velocity tier of the MuseScore_General "Grand Piano"
preset as a dense single-velocity multisample for GM 1 Bright Acoustic Piano
alternate use (CC0=2) in ferrosintesis.

Source: https://musescore.org/en/node/306828
        https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/
        https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General_License.md

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in the
Software without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.



---

