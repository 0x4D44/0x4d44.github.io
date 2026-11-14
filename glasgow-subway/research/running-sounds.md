# Running sounds: where they come from and how they were made

What the sim plays while a train runs: the **rumble** of wheels on rail (it gets louder and higher with speed), the **whine** of the traction motor (loud under power, a murmur when coasting, silent when standing), and the **hiss** of the brakes when they are let off. All three come from real recordings with open licences, looped or triggered by `js/sim/audio.js`; each has a synthesised stand-in that plays until its recording has loaded, if its file is missing, and for good with **`?sfx=synth`**. The wheel squeal is not in this set: it is still synthesised. (Doors: `door-sounds.md`.)

## The motor is now synthesised (November 2026)

The looped whine described below is **no longer played** and `audio/motor.mp3` has been removed. It was 1.8 s of another train's inverter, high-passed at 1.5 kHz and played between 0.7 and 1.25 times its speed: a thin squeal whose pitch moved a little with the train and whose every component moved together, which is not how a drive sounds. The rest of this file still describes the rumble and the hiss, and is kept as written for the record of how the whine was cut; read "whine" below as history.

In its place `tractionMix()` in `js/sim/audio.js` works out, from speed, traction and brake, what a three-phase drive does, and `buildSynthLayers()` plays it:

| part | what it is | pitch | level |
|---|---|---|---|
| inverter | four tones: pairs at `fc -+ 2 fe` and `2 fc -+ fe` (fc = switching frequency, fe = the motor's electrical frequency) | below 6.5 m/s fc is fixed at 1000 Hz, so the pairs spread apart as the train accelerates; from 6.5 m/s the inverter switches 15 times per cycle and from 10.5 m/s 9 times, so the pitch climbs with speed and steps down at each change | follows motor current: full under power, 0.6 in regenerative braking (fading out below 4 m/s), nothing coasting |
| gear | the reduction gear's mesh tone with three harmonics, a slight 11 Hz tremor | motor speed x 21 teeth: 63 Hz per m/s (21 so that neither it nor its harmonics ever lands on an inverter tone) | a murmur whenever the train moves, about 3.5 times that under load |
| growl | torque ripple, a low-passed sawtooth | 6 fe | under load only |

Everything wanders by a few cents (two slow oscillators) and passes through a 3.2 kHz low-pass for the car body. A change of switching pattern has 0.4 m/s of hysteresis so a train holding a threshold speed does not flutter.

**What is assumed, not measured.** Wheel 0.69 m, gear ratio 6.5, two pole pairs, 21 pinion teeth, 1 kHz asynchronous switching and the two change-over speeds are typical figures for a small metro drive, chosen so the tones fall in a believable range. No recording or published data for the Subway's Stadler sets was found under an open licence, so this is the sound of *a* modern drive, not of theirs.

**What is checked.** Unit tests: silence at a stand, power > braking > coasting, mechanical tones exactly proportional to speed, the pairs centred on fc and 2 fc, a downward step at each change of pattern, no flutter on a threshold, all tones between 20 Hz and 4 kHz. End to end, rendered in the browser: the strongest tones in the spectrum are the ones the model asks for at 3, 9 and 12 m/s; coasting leaves the gear tone alone, at least 12 dB down; under full power at 12 m/s the drive is within 4 dB (A-weighted) of the recorded rumble.

**What is not checked.** Whether it sounds good. It was built and balanced from spectra and levels, without being listened to.

## Not from YouTube
Same reason as for the doors (see `door-sounds.md`): a video's soundtrack is not the uploader's to licence, and the credits page promises "everything used is CC0 or CC-BY". Every source below states its licence on its own page.

## What was looked at
| Place | Result |
|---|---|
| archive.org, Radio Aporee field recordings | The rumble and whine come from here (below). Two other recordings from the collection were looked at for the brake hiss and not used: in a Taipei Orange Line one, the bursts that looked like air being released turned out to be clicks; a New York F-train one was set aside, and I did not keep the reason. |
| SoundBible (Mike Koenig, CC BY 3.0) | The two brake releases (below). |
| OpenGameArt, Zenodo | Reachable; nothing from either is used. |
| Wikimedia Commons | Rate-limited when tried for these sounds (HTTP 429, "retry after" 600 s, on the build environment's shared address), so nothing was fetched from it this time. The door sounds come from here, from an earlier session. |
| Freesound, Europeana | Blocked (403) from the build environment; not used and not routed around. |

## What ships (`audio/`)
All CC BY 3.0, credited in `models/credits.json` and on `credits.html`. Rebuild with `python3 tools/make_running_audio.py <folder with the three downloads> [out dir]` (needs numpy and ffmpeg with `libmp3lame`; the header of the script gives the download commands). The rebuild is byte-for-byte what is in the repository.

| File | Source | Cut | Filtering | Loop | Encoded |
|---|---|---|---|---|---|
| `rumble.mp3` | Wu, Tsan-Cheng (Radio Aporee), "Tamsui Line, Taipei City - Tamsui Line (Taipei Metro)", 2014-01-20, binaural, [archive.org/details/aporee_21458_24940](https://archive.org/details/aporee_21458_24940), `SoundMap2014012052.ogg`, 3,997,980 bytes, sha256 `fcc520d3170105279caeb7ebdb1afa1fac4374cb31db5a4784d6d499b111ebd7` | 58.0-70.0 s | mono; high-pass 25 Hz; notches at 58.79 Hz and its 2nd and 3rd harmonics and at 1601.5 Hz; low-pass 9 kHz | 10.043 s (241,040 samples at 24 kHz); 1.5 s cross-fade | 24 kHz mono, 64 kbps, 87,405 bytes |
| `motor.mp3` | the same file | 96.2-98.6 s | mono; high-pass 1.5 kHz (4 poles) so none of the rumble is in it; notch at 1601.5 Hz; low-pass 11 kHz | 1.817 s (87,200 samples at 48 kHz); 0.45 s cross-fade | 48 kHz mono, 128 kbps, 39,597 bytes |
| `brake-hiss-1.mp3` | Mike Koenig, "Truck Air Brakes", [soundbible.com/1056](https://soundbible.com/1056-Truck-Air-Brakes.html), 78,730 bytes, sha256 `d546165f513b814e894b32dcedad6969b1df7c77ecf9e3a71768560be935c0b7` | 1.30-2.05 s | mono; high-pass 800 Hz (4 poles: the truck's idling engine sits below); 5 ms fade-in, 0.30 s fade-out | one-shot, 0.75 s | 44.1 kHz mono, 64 kbps, 6,522 bytes |
| `brake-hiss-2.mp3` | Mike Koenig, "Air Break", [soundbible.com/525](https://soundbible.com/525-Air-Break.html), 115,943 bytes, sha256 `bdae4d2bbb893531726d8b25397727f2c2fbc98cc2444ebbc9a30fefd4025bb2` | 2.70-4.20 s | as above; 0.60 s fade-out | one-shot, 1.5 s | 44.1 kHz mono, 64 kbps, 12,582 bytes |

146 kB in all, fetched when sound starts (not at page load).

**Choosing the windows.** The source runs 350.6 s (2 channels, 48 kHz Vorbis). Two scripts (kept outside the repository) slid a 12 s window along it in 1 s steps (339 positions): `steady` scored the spread of 0.5 s levels, with penalties for modulation in the 2-8 Hz speech band and for a high crest factor; `pick` scored the worst spread (90th minus 10th percentile of 0.25 s levels) of any 1/3-octave band. I did not write down why 58-70 s was taken, so this is what can be said now, checked again for this note, rather than the reason:
- By `steady` the window starting at 58 s ranks 29th of 339 (score 1.26; best 0.39 at 87 s); by `pick` it ranks 20th (worst band 8.1 dB; best 6.4 dB at 101 s). It is among the steadier tenth by both, and the best by neither. A window starting at 65 s scores better on both (19th and 3rd), so 58-70 s was not simply the best-scoring stretch.
- Rolling noise wants a window with no strong tone, and several of the best by `steady` (starting 81-87 s) have one: `pick` finds a 2439 Hz tone 18.6 dB above its surroundings in the window starting at 83 s and a 5352 Hz one, 30.6 dB, in the one starting at 87 s (which reaches into the whine run below). In 58-70 s the strongest narrow peak between 1.5 and 8 kHz is the 1602 Hz whistle, 10.6 dB, which was notched out. That is the case for the window; it is not a record of how it was picked.
- Looked at directly (`win`, 50 ms frames over the 12 s): the level stays within a few dB of its median in each band (5th to 95th percentile: low band 20-300 Hz -1.6 to +1.6 dB, mid band 300-3000 Hz -1.9 to +2.4, high band 3-8 kHz -1.1 to +2.6), the largest excursions being +3.2, +4.0 and +9.0 dB (the last a single frame), so there is no loud transient. That is all the measures say; they cannot say whether a quiet door, announcement or brake is in it, and I have not listened.

The motor's 96.2-98.6 s lies inside one of the three multi-second runs that `whine_scan` finds - frames where a narrow tone between 1.5 and 9 kHz stands 22 dB or more above its surroundings: 5.5-10.5 s, 96.0-99.5 s and 212.5-216.0 s. The middle one is the strongest (median prominence 50 dB, against 37 and 41; 9.6 tones per 0.5 s frame; strongest tone at 5309-5352 Hz). The cut is 2.4 s of that 3.5 s run, and I did not look for a longer steady stretch elsewhere.

**A hum and a whistle came out.** The 12 s stretch carries a steady hum at 58.79 Hz (with harmonics at 117.57 and 176.36 Hz) and a constant whistle at 1601.5 Hz. Neither would change pitch with the train's speed, but the sim plays the loops at a rate that follows the speed, which would bend them; they were notched out of both cuts. (58.79 Hz is not the 60 Hz mains in Taiwan, so the hum's source is not known; calling it "mains hum", as an earlier draft did, was wrong.)

## Loops
A looped recording has to run round with no step, pump or tick at the join. The loops are built so that the join cannot step by construction, and then checked.

- **Periodic extension.** The loop's first `X` samples are replaced by a cross-fade from the `X` samples that follow the loop's end in the recording into the first `X`. The sample after the loop's end is then the one that followed it in the recording: a true continuation. The fade's weights keep the power constant for parts that are only partly alike (`a² + b² + 2ρab = 1`, ρ the correlation of the two parts).
- **The file holds the cycle three times** (a little of it before, the loop, a little after: 0.4 s each side for the rumble, 0.3 s for the motor), and `SAMPLES` gives where the middle copy starts and ends. MP3 puts silence-ish padding at both ends and players differ in whether they trim it; with the loop points well inside the file it is never played either way.
- **Whole samples at every sound-card rate.** A browser resamples an MP3 to its sound card's rate (44.1 or 48 kHz). A loop that is a fraction of a sample long there is replayed that much long or short on every pass: a phase step at the join, which a bright tone like the whine shows. (The first build measured exactly this in the end-to-end test: the motor's loop periodicity came out at 13 dB in Chromium at 44.1 kHz against 28 dB decoded offline.) The loop length and start are therefore whole multiples of 1/300 s, which are whole samples at 24, 48, 44.1, 88.2 and 96 kHz, and the sample-rate converter between those rates repeats exactly with it. The motor is encoded at 48 kHz (not 32 kHz, which does not divide into 1/300 s). `sim.test.mjs` pins the loop points to whole samples at those rates (exact equality, so a browser that rounds down cannot land a sample early).
- **Choosing among the candidates.** Every loop length on that grid (271 for the rumble, 226 for the motor) was ranked by how well the two parts match, and the best was taken unless its join failed the check below, in which case the next. The rumble's best and the motor's best both failed (worst percentile 99 and 94); the second best passed in each (87 and 65). Correlation turned out to say little about which joins pass (across the best 60: r = +0.27 rumble, +0.29 motor, the wrong way if anything), so "rank 2" is not a refined choice, just the first that passed.

**The seam check** (`seam_report` in the build script). The 10 ms before the join against the 10 ms after it, on three measures (largest sample step, jump in RMS level, change of spectrum over the bins within 35 dB of the peak), each as a percentile of the same measure at every other point of the loop (every 2.5 ms): ~50 is a join like any other place, high would be a flaw. Gate: no measure above 90, either as built or after the MP3 round trip.

| Loop | step / level / spectrum, as built | after MP3 (codec error 25 dB below signal) |
|---|---|---|
| rumble | 1 / 87 / 69 | 1 / 87 / 65 |
| motor | 65 / 35 / 22 | 59 / 36 / 13 |

**How well the check can tell** (controls, same recording, same method):

| Control | rumble | motor |
|---|---|---|
| naive cut, no cross-fade (3 lengths) | step 99-100, level 87-93, spectrum 59-94 | step 92-93, level 55-98, spectrum 96-99 |
| best-correlation loop, second half 2x louder | level 83, spectrum 90 | level 100, spectrum 97 |
| the same, 3x louder | level 97, spectrum 99 | level 100, spectrum 99 |
| a DC step of a quarter of the peak at the join | 100 / 100 / 100 | 94 / 100 / 99 |

It catches gross joins. It is weaker than I would like in two places: for the rumble a **doubled level scores only 83**, below the accepted join's 87, because the rumble's lowest components are longer than a 10 ms window so a 10 ms level wanders by several dB anywhere in the loop; and the motor's **step measure saturates** near 92-94 even for a bad cut. I did not retune it after seeing this. A passing join is evidence of no gross defect, not proof that none can be heard.

**The blend zone.** Because the join itself is a true continuation, what a blend of two partly alike parts can add is a swell or dip inside the cross-faded start of the loop. Measured in 100 ms windows, against the rest of the loop: rumble zone +0.24 dB on average, spread 1.67 dB (1.65 dB elsewhere), lowest window -3.3, highest +2.5; motor -0.19 dB, spread 0.26 dB (0.57 elsewhere), -0.5 to +0.1. The two blended parts of the rumble are at -39.2 and -40.4 dB RMS (blend -39.7, rest of the loop -39.9); the motor's -54.7 and -55.3 (blend -54.8, rest -54.6).

**In the browser** (end-to-end test, headless Chromium, sound card at 44.1 kHz, and the same files decoded for a 48 kHz card): the loop is the same cycle either side of its loop points to 30.5 dB (rumble) and 25.7-28.5 dB (motor) - the codec's own noise floor - where the same comparison made 3 samples out gives 19 dB and -3.5 dB, so the comparison can tell; and the browser's playback, rendered offline from part-way round through the loop point and on into the next pass, matches the samples it should read to better than 220 dB (float rounding) at zero lag in both halves, at both rates.

## How the engine plays them
`runningMix` (`js/sim/audio.js`) turns the train's state into plain numbers, the single source for the synthesised and the recorded layers alike. Recorded layers:

| Layer | Playback rate (pitch) | Level (1 = calibrated) |
|---|---|---|
| rumble | `clamp(0.35 + 0.65 v/12, 0.5, 1.25)` | `min(1.5, v/12)` |
| whine | `0.7 + 0.55 min(1, v/12)` | `clamp(0.75 traction + 0.45 brake min(1, v/6) + 0.25 min(1, v/12), 0, 1)`, halved with the doors open |

Both are multiplied by 1 inside the train and 0.25 outside (a train heard from the platform), and followed with a 0.2-0.25 s time constant. Rolling noise does get higher in pitch and louder with speed (the same wheel and rail roughness passes faster); the whine rises with speed and is loudest under power, present while braking (the motors generate) and a murmur coasting. A loop starts part-way round its cycle at random, so two sessions do not begin alike. Once a recorded loop is running the synthesised layer is faded out.

**The hiss** is not a loop but a one-shot, played when a brake is **let off**. `ReleaseDetector` watches the brake level each frame: a fall of at least 0.12 from the highest level since the last fall counts, if the brake had been at 0.3 or more and 2 s have passed since the last one; a fall of more than 0.7 in a single frame is the train being put somewhere, not a brake being released. Frame rate does not matter (tested at 60, 30 and 10 fps) and one release fires it once; putting the brake on is silent; a brake that wobbles by a few per cent, or never gets beyond a light touch, is silent; easing a hard brake off part-way is heard as a smaller release (once to three times in the test, depending on the steps); a brake pumped on and off cannot be heard more often than every 2 s. Of the two takes, the longer is used 70% of the time for a hard release and 30% for a soft one; the pitch varies 0.94-1.06 and the level is `0.4 + 0.6 x strength`. The synthesised hiss keeps only its faint steady part (while the brake is applied).

**`RUN_V = 12 m/s` is a choice, not a measurement.** It is the speed at which the rumble plays as recorded, and the level the loops are calibrated at. The recording does not say how fast its train was going, and the Subway's trains top out near 14.8 m/s (the end-to-end test sees that), so 12 m/s sits at about four fifths of top speed. If the Taipei train was faster than that, the rumble plays too high. The pitch law is compressed (rate moves 0.65 per unit of speed rather than 1) for that reason: a wrong guess costs less at low speeds. Tune `RUN_V` and the two formulas to taste; nothing else depends on them.

## Levels
Each recording was matched to the synthesised layer it replaces by **A-weighted level**, measured in headless Chromium (the end-to-end test repeats the measurement every run and fails outside +-3 dB): rumble at 12 m/s 0.0 dB, whine at 6 m/s under full traction -1.4 dB, brake take 1 +0.1 dB and take 2 0.0 dB (the loudest 0.45 s of each, against the loudest 0.45 s of a full release of the synthesised hiss). `SAMPLES[...].gain` is that trim: 0.39, 0.16, 0.43, 0.39. The loops are peak-normalised in the files (-1.5 dBFS); the trims that would put them back at the recording's own level are 0.0532 (rumble) and 0.0092 (motor), so the whine is 0.17x the rumble in the recording, and about 0.4x the rumble in the game (0.16 x its level at 6 m/s under power, against 0.39 at 12 m/s). Matching the old synthesised mix kept the balance the game already had; it is not a claim about how the real train sounds.

## Fallback and A/B
- A layer plays its synthesised stand-in until its recording has loaded, and keeps it if the file is missing or cannot be decoded; the other layers are unaffected (tested for a missing rumble, hiss 1 and hiss 2 with the whine still a recording).
- `?sfx=synth` fetches no recording at all (doors, rumble, whine, hiss), starts no loop, and the synthesised running sound is driven by exactly the formulas it was before the recordings (unit-tested against the old formulas on 2,160 states, 7 quantities each, to 1e-12).
- Unit tests (`node --test js/sim/*.test.mjs`): loop points inside the file and whole samples at the common rates; the synthesised path unchanged; the mix numbers (monotonic, bounded, finite for odd input, whine ordering power > brake > coast > stand, doors halve it, outside is a quarter); the release detector (one fire per release at 60/30/10 fps, none for a wobble or a light brake, teleports ignored and recovered from). The detector's rules were checked by breaking them one at a time in a scratch copy (eight breakages: no teleport rule; a teleport that does not reset the high mark; a rise that does not raise it; any fall counting; no minimum strength; no rest period; the high mark not reset after a release; the time of a release not recorded) and each made the detector test fail.

## Limits
- **Nobody has listened to this.** Levels, spectra, loops, timing and behaviour were measured; tone, balance, whether the pitch law sounds right and whether the 10 s rumble cycle is noticeable were not judged by ear. If something sounds wrong, `SAMPLES[...].gain`, `RUN_V` and the formulas in `runningMix` are the knobs, and `?sfx=synth` is the comparison.
- **Generic sounds.** A Taipei Metro train (binaural, mixed to mono here; I have no evidence on whether the mono sum colours it) and a lorry's air brakes, not the Glasgow Subway's rolling stock or its brakes. The Stadler trains' own sound has not been found under an open licence.
- **Repetition.** The rumble repeats every 10 s at the recorded rate (longer when played slower) and the whine every 1.8 s. The windows were chosen to have no distinct transients, but a long enough listen may find the cycle.
- **The seam check's limits** are above. The cross-fade zone and the periodicity are measured directly; the join is by construction a continuation.
- **The squeal, the platform bell and the rats' squeaks are still synthesised**, and so are the announcements (the browser's speech synthesis).
