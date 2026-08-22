# Audio asset provenance

The committed `pacenotes/` files are project-generated speech assets for the
119 authored co-driver calls. Each call is present as MP3 and Ogg so playback
does not need a network request or runtime speech service.

`npm run generate-audio` rebuilds them from the phrases in the content catalog.
The checked-in set was synthesized with the macOS `Daniel` system voice, then
filtered and encoded with FFmpeg. It contains no sampled music, commercial
sound pack, or third-party voice recording. The generated clips are distributed
with the project under its MIT license.

On non-macOS systems the generator uses eSpeak's British English voice. FFmpeg,
Apple system voices, and eSpeak remain governed by their own software licenses;
neither program is bundled with the game.
