# T-shirt chest print briefs

Source briefs for the 24 prints in `models/tee_prints.png` (cell order = number - 1, row-major from top-left, 6 x 4).
Generated 2026-11-07 with Codex's built-in image tool (`codex exec`, gpt-6.1-sol), one 1024x1024 PNG each on a magenta ground, then keyed and
packed with `python3 tools/build_tee_prints.py <dir>`. `js/sim/tees.js` draws them on the people's T-shirts at runtime. Prints 1-12 nod to the
almanac's other documents (weighted to the recent ones); 13-24 are standalone jokes. Every brief starts with the shared preamble below,
with `{out}` replaced by `teeNN.png`.

## Preamble

> Use your built-in image generation tool to create ONE image and save it as {out} in the current directory (PNG, 1024x1024). It is a T-SHIRT CHEST PRINT design, the artwork only: centred, flat graphic screen-print style, bold shapes, at most four flat ink colours, thick outlines, no gradients, no photographic detail, no shirt, no mock-up, no person wearing it. The artwork must sit on a PERFECTLY FLAT, uniform pure magenta background (#FF00FF) filling everything outside the design (it is keyed out later), and the design itself must not use magenta or pink. Any text must be large, short, correctly spelled and legible. Deadpan humour; every name, brand and logo is fictional (no real brands). Design: {brief} When the file is saved, reply with just its name.

## Prints

1. a huge friendly number 42 inside a speech bubble, small text above 'PICK A NUMBER', small text below 'IT'S ALWAYS 37, 42, 47 OR 73' and 'THE MODEL ZOO'.
2. a cartoon ghost (a Scottish bogle) wearing a tam-o'-shanter, floating over a crooked castle tower and kirkyard gravestones; text 'BOGLE CASTLE' and smaller 'KIRKYARD TOUR 2026'.
3. a retro arcade fighter jet banking through speed lines and a chequered flag; chunky 1980s arcade lettering 'SKYBLITZ' and smaller 'GRAND PRIX'.
4. a steep stack of colourful hillside houses linked by long zig-zag stairways under a sun; text 'LA LADERA' and smaller '1,000 STEPS CLUB'.
5. a rally car flying over a crest while a startled sheep looks on, gravel spraying; text 'AOTEAROA RALLY' and smaller 'MIND THE SHEEP'.
6. a heavy padlock with a terminal prompt inside it showing 'Permission denied'; text 'I SURVIVED THE LOCKED ROOM'.
7. a coiled network cable whose plug glows, drawn like a heraldic serpent; text 'DOWN THE WIRE' and smaller 'I SPEAK FLUENT ETHERNET'.
8. the Earth with old television and radio waves rippling outward in rings into space; text 'EARTH' and 'STILL BROADCASTING SINCE 1936'.
9. a determined pigeon in flight carrying a tiny envelope; text 'MY OTHER NETWORK IS A PIGEON' and small 'RFC 1149'.
10. an old newspaper masthead badge with a large railway flange wheel; text 'THE DAILY FLANGE' and smaller 'ALL THE NEWS THAT FITS'.
11. a small orange underground train going round a circular track loop like a clock face; text 'UNDER GLASGOW' and smaller 'I GO ROUND IN CIRCLES'.
12. a cartoon go-kart drifting sideways with tyre smoke; text 'APEX KARTS' and smaller 'DRIFT RESPONSIBLY'.
13. a single grey rain cloud with rain lines; big text 'DREICH' and smaller 'FORECAST: ALSO DREICH'.
14. a heraldic shield with a square slice of sausage in the middle and two forks crossed behind; text 'TEAM SQUARE SAUSAGE'.
15. a seagull with a smug expression flying off with a single chip; text 'SEAGULL MANAGEMENT' and smaller 'WE SWOOP. WE TAKE. WE LEAVE.'
16. an orange-and-white traffic cone wearing a small gold crown; text 'TRAFFIC CONE APPRECIATION SOCIETY'.
17. a cartoon sun crossed out with a red line; text 'ERROR 404' and smaller 'SUMMER NOT FOUND'.
18. a shaggy Highland cow wearing sunglasses; text 'HAIRY COO' and smaller 'TOO COOL'.
19. a stack of square fudge pieces with a rosette badge; text 'CERTIFIED TABLET DEALER'.
20. a tiny cartoon midge with huge wings fleeing a can of repellent; text 'MIDGE ESCAPE CLUB'.
21. a set of bagpipes drawn as a cute octopus; text 'PIPE DOWN'.
22. a triangular potato scone with a smiling face and little arms flexing; text 'TEAM TATTIE SCONE'.
23. the long neck and head of a shy loch monster peeking out of the water holding a selfie stick; text 'CAMERA SHY SINCE 565'.
24. an umbrella turned inside out by the wind with a stick-figure clinging on; text 'GLASGOW SUMMER COLLECTION'.
