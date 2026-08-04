// ============================================================
//  The Daily Flange — advertising inventory
//
//  Deliberately preposterous banner ads. Each is a plain object;
//  news.js renders them into leaderboard/MPU slots and applies the
//  animation classes named in `fx`. To add an ad, append an object.
//
//  Fields:
//    headline  the shouty top line
//    body      the small print
//    cta       button text
//    href      "#" for a nonsense product, or "../<slug>/" to cross-
//              promote another document in the 0x4D44 Almanac
//    bg        any CSS background (gradient encouraged)
//    fg        text colour
//    emoji     optional leading glyph (fallback if no `icon`)
//    icon      key into window.AD_ICONS — a small inline-SVG badge
//              rendered instead of the emoji (proper vector art, not
//              a glyph); see ad-icons below
//    bob       true -> the icon/emoji bobs up and down
//    blink     true -> the headline blinks
//    fx        any of: "flicker", "slide", "jitter", "rainbow"
//    slots     optional ["leader"] or ["mpu"] to restrict placement
//
//  The almanac cross-promos are real links; everything else is invented.
// ============================================================

// ---- vector-art badges for the ads (flat, single-colour, currentColor) ----
// Each entry is inner SVG markup for a 0 0 64 64 viewBox. Kept simple and
// geometric to match the style of news.js's article ICONS set.
window.AD_ICONS = {
  flange: '<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<circle cx="32" cy="32" r="9" fill="currentColor"/>' +
    '<g fill="currentColor"><circle cx="32" cy="10" r="4"/><circle cx="32" cy="54" r="4"/>' +
    '<circle cx="10" cy="32" r="4"/><circle cx="54" cy="32" r="4"/>' +
    '<circle cx="17" cy="17" r="4"/><circle cx="47" cy="47" r="4"/>' +
    '<circle cx="17" cy="47" r="4"/><circle cx="47" cy="17" r="4"/></g>',
  spoon: '<ellipse cx="32" cy="18" rx="12" ry="15" fill="currentColor"/>' +
    '<rect x="28" y="30" width="8" height="28" rx="4" fill="currentColor"/>',
  elbow: '<path d="M14 50 L14 30 Q14 14 32 14 L32 24 Q22 24 22 34 L22 50 Z" fill="currentColor"/>' +
    '<rect x="30" y="10" width="14" height="16" rx="6" fill="currentColor"/>',
  jar: '<path d="M22 24 h20 v6 a2 2 0 0 1 -2 2 v22 a6 6 0 0 1 -6 6 h-4 a6 6 0 0 1 -6 -6 V32 a2 2 0 0 1 -2 -2 Z" fill="currentColor"/>' +
    '<rect x="24" y="14" width="16" height="10" rx="2" fill="currentColor"/>',
  submarine: '<ellipse cx="32" cy="36" rx="24" ry="10" fill="currentColor"/>' +
    '<rect x="28" y="16" width="8" height="14" rx="3" fill="currentColor"/>' +
    '<circle cx="20" cy="36" r="4" fill="#0000" stroke="currentColor" stroke-width="2"/>' +
    '<circle cx="32" cy="36" r="4" fill="#0000" stroke="currentColor" stroke-width="2"/>' +
    '<circle cx="44" cy="36" r="4" fill="#0000" stroke="currentColor" stroke-width="2"/>',
  wind: '<path d="M6 22 h30 a7 7 0 1 0 -7 -7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M6 34 h40 a7 7 0 1 1 -7 7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M6 46 h24 a6 6 0 1 0 -6 -6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
  cursor: '<rect x="10" y="10" width="44" height="30" rx="4" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<path d="M40 34 L54 48 L48 50 L52 58 L46 60 L42 52 L36 56 Z" fill="currentColor"/>',
  calendar: '<rect x="10" y="14" width="44" height="38" rx="4" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<path d="M10 24 h44" stroke="currentColor" stroke-width="4"/>' +
    '<path d="M18 34 L46 34 M38 26 L46 34 L38 42" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  router: '<rect x="10" y="34" width="44" height="16" rx="4" fill="currentColor"/>' +
    '<path d="M22 34 C22 22 26 14 32 14 C38 14 42 22 42 34" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<circle cx="20" cy="42" r="3" fill="#fff" fill-opacity=".6"/>',
  laptop: '<rect x="12" y="14" width="40" height="26" rx="3" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<path d="M6 46 h52 l-6 8 H12 Z" fill="currentColor"/>' +
    '<path d="M32 20 l4 8 l-4 8 l-4 -8 Z" fill="currentColor"/>',
  shield: '<path d="M32 8 L52 16 V32 C52 46 44 54 32 58 C20 54 12 46 12 32 V16 Z" fill="currentColor"/>' +
    '<g fill="none" stroke="currentColor" stroke-width="4"><rect x="22" y="30" width="20" height="8" transform="rotate(45 32 34)"/><rect x="22" y="30" width="20" height="8" transform="rotate(-45 32 34)"/></g>',
  fog: '<circle cx="24" cy="26" r="4" fill="currentColor" opacity=".7"/>' +
    '<path d="M12 36 a12 12 0 0 1 12 -22 a16 16 0 0 1 30 4 a10 10 0 0 1 -2 20 Z" fill="currentColor"/>' +
    '<g stroke="currentColor" stroke-width="4" stroke-linecap="round"><line x1="14" y1="50" x2="50" y2="50"/><line x1="18" y1="56" x2="46" y2="56"/></g>',
  ticket: '<path d="M8 22 h48 v8 a4 4 0 0 0 0 8 v8 H8 v-8 a4 4 0 0 0 0 -8 Z" fill="currentColor"/>' +
    '<line x1="34" y1="18" x2="34" y2="48" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-dasharray="4 4"/>',
  statue: '<circle cx="32" cy="14" r="8" fill="currentColor"/>' +
    '<path d="M22 56 V34 a10 10 0 0 1 20 0 V56 Z" fill="currentColor"/>' +
    '<rect x="10" y="56" width="44" height="4" fill="currentColor"/>',
  umbrella: '<path d="M6 30 A26 20 0 0 1 58 30 Z" fill="currentColor"/>' +
    '<line x1="32" y1="30" x2="32" y2="52" stroke="currentColor" stroke-width="4"/>' +
    '<path d="M32 52 a6 6 0 0 0 10 4" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  shadow: '<ellipse cx="32" cy="52" rx="20" ry="6" fill="currentColor" opacity=".5"/>' +
    '<path d="M32 8 a10 10 0 0 1 0 20 a10 10 0 0 1 0 -20 Z M18 50 c0 -14 6 -22 14 -22 s14 8 14 22 Z" fill="currentColor"/>',
  toaster: '<rect x="10" y="24" width="44" height="26" rx="6" fill="currentColor"/>' +
    '<rect x="20" y="10" width="8" height="16" rx="3" fill="currentColor"/>' +
    '<rect x="36" y="10" width="8" height="16" rx="3" fill="currentColor"/>' +
    '<circle cx="24" cy="37" r="5" fill="#fff" fill-opacity=".7"/><circle cx="24" cy="37" r="2" fill="currentColor"/>',
  clock: '<circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<line x1="32" y1="32" x2="32" y2="18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
    '<line x1="32" y1="32" x2="42" y2="38" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  cone: '<path d="M32 10 L48 52 H16 Z" fill="currentColor"/>' +
    '<rect x="18" y="34" width="28" height="6" fill="#fff" fill-opacity=".6"/>' +
    '<rect x="10" y="50" width="44" height="6" rx="2" fill="currentColor"/>',
  sock: '<path d="M24 8 h14 v24 l10 14 a8 8 0 0 1 -6 13 H24 a8 8 0 0 1 -8 -8 V8 Z" fill="currentColor"/>' +
    '<path d="M8 26 l-4 -6 M14 20 l-4 -8 M20 18 l-2 -8" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>',
  punctuation: '<circle cx="20" cy="46" r="6" fill="currentColor"/>' +
    '<rect x="15" y="12" width="10" height="26" rx="5" fill="currentColor"/>' +
    '<circle cx="46" cy="46" r="6" fill="currentColor"/>' +
    '<path d="M42 40 q-4 14 -10 16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  crystalball: '<circle cx="32" cy="26" r="18" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<path d="M12 50 h40" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M18 50 q14 -10 28 0" fill="none" stroke="currentColor" stroke-width="4"/>',
  bagpipe: '<ellipse cx="30" cy="30" rx="16" ry="20" fill="currentColor"/>' +
    '<rect x="44" y="14" width="16" height="6" rx="3" fill="currentColor" transform="rotate(20 44 14)"/>' +
    '<rect x="6" y="34" width="18" height="6" rx="3" fill="currentColor" transform="rotate(-14 6 34)"/>' +
    '<rect x="24" y="4" width="6" height="14" rx="3" fill="currentColor"/>',
  pigeon: '<circle cx="26" cy="24" r="10" fill="currentColor"/>' +
    '<path d="M14 34 C6 34 4 44 12 46 C20 48 30 44 34 34 Z" fill="currentColor"/>' +
    '<path d="M36 22 L48 16 L44 26 Z" fill="currentColor"/>' +
    '<rect x="20" y="46" width="4" height="10" fill="currentColor"/><rect x="30" y="46" width="4" height="10" fill="currentColor"/>',
  candle: '<rect x="27" y="26" width="10" height="30" rx="3" fill="currentColor"/>' +
    '<path d="M32 6 C24 18 30 26 32 26 C34 26 40 18 32 6 Z" fill="currentColor"/>' +
    '<rect x="18" y="54" width="28" height="6" rx="3" fill="currentColor"/>',
  raincloud: '<path d="M14 34 a12 12 0 0 1 4 -23 a16 16 0 0 1 30 6 a10 10 0 0 1 -3 19 Z" fill="currentColor"/>' +
    '<g stroke="currentColor" stroke-width="4" stroke-linecap="round"><line x1="20" y1="42" x2="16" y2="54"/><line x1="32" y1="42" x2="28" y2="54"/><line x1="44" y1="42" x2="40" y2="54"/></g>',

  train: '<rect x="12" y="16" width="40" height="28" rx="8" fill="currentColor"/>' +
    '<rect x="18" y="22" width="10" height="10" fill="#fff" fill-opacity=".6"/>' +
    '<rect x="36" y="22" width="10" height="10" fill="#fff" fill-opacity=".6"/>' +
    '<circle cx="20" cy="50" r="4" fill="currentColor"/><circle cx="44" cy="50" r="4" fill="currentColor"/>',
  trainrain: '<rect x="12" y="14" width="40" height="26" rx="8" fill="currentColor"/>' +
    '<rect x="18" y="20" width="28" height="8" fill="#fff" fill-opacity=".5"/>' +
    '<circle cx="20" cy="46" r="4" fill="currentColor"/><circle cx="44" cy="46" r="4" fill="currentColor"/>' +
    '<g stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="10" y1="52" x2="6" y2="60"/><line x1="30" y1="54" x2="26" y2="62"/><line x1="50" y1="52" x2="46" y2="60"/></g>',
  spiral: '<path d="M32 32 m0 -20 a20 20 0 1 1 -14 34" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M18 46 a12 12 0 1 0 8 -20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
  flag: '<rect x="14" y="8" width="6" height="48" fill="currentColor"/>' +
    '<g><rect x="20" y="10" width="8" height="8" fill="currentColor"/><rect x="36" y="10" width="8" height="8" fill="currentColor"/>' +
    '<rect x="28" y="18" width="8" height="8" fill="currentColor"/><rect x="44" y="18" width="8" height="8" fill="currentColor"/>' +
    '<rect x="20" y="26" width="8" height="8" fill="currentColor"/><rect x="36" y="26" width="8" height="8" fill="currentColor"/></g>',
  globe: '<circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<ellipse cx="32" cy="32" rx="9" ry="22" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<line x1="10" y1="32" x2="54" y2="32" stroke="currentColor" stroke-width="4"/>',
  chip: '<rect x="18" y="18" width="28" height="28" rx="4" fill="currentColor"/>' +
    '<g stroke="currentColor" stroke-width="4"><line x1="18" y1="26" x2="8" y2="26"/><line x1="18" y1="38" x2="8" y2="38"/>' +
    '<line x1="46" y1="26" x2="56" y2="26"/><line x1="46" y1="38" x2="56" y2="38"/>' +
    '<line x1="26" y1="18" x2="26" y2="8"/><line x1="38" y1="18" x2="38" y2="8"/>' +
    '<line x1="26" y1="46" x2="26" y2="56"/><line x1="38" y1="46" x2="38" y2="56"/></g>',
  paintroller: '<rect x="14" y="12" width="30" height="14" rx="3" fill="currentColor"/>' +
    '<rect x="26" y="26" width="6" height="18" fill="currentColor"/>' +
    '<path d="M22 44 h14 a2 2 0 0 1 2 2 v8 a2 2 0 0 1 -2 2 H22 a2 2 0 0 1 -2 -2 v-8 a2 2 0 0 1 2 -2 Z" fill="currentColor"/>',

  // ---- badges for the July/August Almanac intake ----
  volcano: '<path d="M26 26 h12 l18 32 H8 Z" fill="currentColor"/>' +
    '<path d="M32 4 c5 7 -3 9 0 15 M20 10 c4 6 -2 8 0 12 M44 10 c-4 6 2 8 0 12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  floppy: '<path d="M8 8 h38 l10 10 v38 H8 Z" fill="currentColor"/>' +
    '<rect x="20" y="8" width="22" height="17" fill="#000" fill-opacity=".42"/>' +
    '<rect x="34" y="10" width="6" height="13" fill="currentColor"/>' +
    '<rect x="17" y="36" width="30" height="20" fill="#000" fill-opacity=".28"/>',
  beetle: '<ellipse cx="30" cy="38" rx="15" ry="19" fill="currentColor"/>' +
    '<circle cx="30" cy="15" r="7" fill="currentColor"/>' +
    '<line x1="30" y1="20" x2="30" y2="56" stroke="#000" stroke-opacity=".4" stroke-width="3"/>' +
    '<g stroke="currentColor" stroke-width="4" stroke-linecap="round">' +
    '<line x1="16" y1="26" x2="6" y2="20"/><line x1="15" y1="38" x2="4" y2="38"/><line x1="16" y1="50" x2="6" y2="56"/></g>' +
    '<path d="M45 48 q9 3 15 10 M47 40 q9 1 14 5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  monitor: '<rect x="4" y="8" width="56" height="38" rx="4" fill="currentColor"/>' +
    '<rect x="10" y="14" width="44" height="26" fill="#000" fill-opacity=".45"/>' +
    '<rect x="16" y="30" width="32" height="6" rx="3" fill="#000" fill-opacity=".3"/>' +
    '<rect x="16" y="30" width="14" height="6" rx="3" fill="currentColor"/>' +
    '<rect x="25" y="46" width="14" height="8" fill="currentColor"/>' +
    '<rect x="14" y="54" width="36" height="6" rx="3" fill="currentColor"/>',
  atom: '<circle cx="32" cy="32" r="6" fill="currentColor"/>' +
    '<g fill="none" stroke="currentColor" stroke-width="3.5">' +
    '<ellipse cx="32" cy="32" rx="27" ry="11"/>' +
    '<ellipse cx="32" cy="32" rx="27" ry="11" transform="rotate(60 32 32)"/>' +
    '<ellipse cx="32" cy="32" rx="27" ry="11" transform="rotate(120 32 32)"/></g>',
  thermometer: '<rect x="24" y="4" width="14" height="40" rx="7" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<circle cx="31" cy="50" r="11" fill="currentColor"/>' +
    '<rect x="28" y="20" width="6" height="26" rx="3" fill="currentColor"/>' +
    '<g stroke="currentColor" stroke-width="3" stroke-linecap="round">' +
    '<line x1="44" y1="14" x2="54" y2="14"/><line x1="44" y1="22" x2="50" y2="22"/><line x1="44" y1="30" x2="54" y2="30"/></g>',
  blackhole: '<circle cx="32" cy="30" r="12" fill="currentColor"/>' +
    '<ellipse cx="32" cy="34" rx="28" ry="9" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<path d="M10 22 a22 22 0 0 1 44 0" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  brain: '<path d="M32 6 a14 14 0 0 0 -14 14 a12 12 0 0 0 -4 20 a13 13 0 0 0 18 14 Z" fill="currentColor"/>' +
    '<path d="M32 6 a14 14 0 0 1 14 14 a12 12 0 0 1 4 20 a13 13 0 0 1 -18 14 Z" fill="currentColor"/>' +
    '<g stroke="#000" stroke-opacity=".42" stroke-width="3" fill="none" stroke-linecap="round">' +
    '<path d="M32 10 v44"/>' +
    '<path d="M25 16 q-8 3 -6 10 q2 6 -4 9"/>' +
    '<path d="M39 16 q8 3 6 10 q-2 6 4 9"/>' +
    '<path d="M22 40 q7 1 8 8"/><path d="M42 40 q-7 1 -8 8"/></g>',
  pothole: '<rect x="4" y="18" width="56" height="32" rx="3" fill="currentColor"/>' +
    '<path d="M22 26 l10 -3 l11 5 l4 9 l-7 8 l-13 2 l-8 -7 l3 -9 Z" fill="#000" fill-opacity=".45"/>' +
    '<g stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round">' +
    '<line x1="4" y1="14" x2="60" y2="14"/><line x1="4" y1="54" x2="60" y2="54"/></g>',
  tooth: '<path d="M32 8 c11 -4 22 0 22 13 c0 10 -5 15 -7 25 c-1 6 -2 12 -6 12 c-5 0 -4 -13 -9 -13 s-4 13 -9 13 c-4 0 -5 -6 -6 -12 c-2 -10 -7 -15 -7 -25 c0 -13 11 -17 22 -13 Z" fill="currentColor"/>',
  compass: '<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="4"/>' +
    '<path d="M32 10 L38 30 L54 32 L38 34 L32 54 L26 34 L10 32 L26 30 Z" fill="currentColor"/>' +
    '<circle cx="32" cy="32" r="4" fill="#fff" fill-opacity=".7"/>',
  coaster: '<path d="M4 44 C14 44 14 12 26 12 C38 12 38 44 50 44 C56 44 58 40 60 36" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>' +
    '<g stroke="currentColor" stroke-width="3">' +
    '<line x1="14" y1="30" x2="14" y2="56"/><line x1="26" y1="14" x2="26" y2="56"/>' +
    '<line x1="38" y1="30" x2="38" y2="56"/><line x1="50" y1="44" x2="50" y2="56"/></g>' +
    '<rect x="4" y="56" width="56" height="4" fill="currentColor"/>' +
    '<rect x="19" y="4" width="15" height="9" rx="3" fill="currentColor"/>',
  dinotrack: '<path d="M32 58 c-9 0 -13 -6 -13 -13 c0 -6 4 -9 4 -15 h18 c0 6 4 9 4 15 c0 7 -4 13 -13 13 Z" fill="currentColor"/>' +
    '<path d="M17 30 q-7 -14 -1 -22 q7 -5 9 6 l2 16 Z" fill="currentColor"/>' +
    '<path d="M32 28 q-5 -18 0 -25 q5 -6 9 2 q2 9 -3 23 Z" fill="currentColor"/>' +
    '<path d="M47 30 q7 -14 1 -22 q-7 -5 -9 6 l-2 16 Z" fill="currentColor"/>',
  bat: '<path d="M32 20 l6 -9 l4 11 c8 -8 16 -11 22 -9 c-6 4 -8 10 -8 17 c0 8 -6 14 -14 14 l-10 -9 l-10 9 c-8 0 -14 -6 -14 -14 c0 -7 -2 -13 -8 -17 c6 -2 14 1 22 9 l4 -11 Z" fill="currentColor"/>',
  piano: '<rect x="4" y="16" width="56" height="32" rx="3" fill="currentColor"/>' +
    '<g fill="#000" fill-opacity=".55">' +
    '<rect x="15" y="22" width="6" height="14"/><rect x="25" y="22" width="6" height="14"/>' +
    '<rect x="38" y="22" width="6" height="14"/><rect x="47" y="22" width="6" height="14"/></g>' +
    '<g stroke="#000" stroke-opacity=".55" stroke-width="2.5">' +
    '<line x1="13" y1="36" x2="13" y2="48"/><line x1="23" y1="36" x2="23" y2="48"/>' +
    '<line x1="33" y1="22" x2="33" y2="48"/><line x1="43" y1="36" x2="43" y2="48"/>' +
    '<line x1="52" y1="36" x2="52" y2="48"/></g>' +
    '<rect x="4" y="12" width="56" height="6" rx="3" fill="currentColor"/>',
  strata: '<path d="M6 46 h52 v12 H6 Z" fill="currentColor"/>' +
    '<path d="M7 34 q14 -6 26 -2 q14 4 24 -2 v14 H7 Z" fill="currentColor"/>' +
    '<path d="M9 22 q13 -8 25 -3 q12 5 21 -3 v13 q-9 6 -21 1 q-12 -5 -25 2 Z" fill="currentColor"/>' +
    '<path d="M11 12 q13 -8 23 -3 q10 5 19 -3 v10 q-9 6 -19 1 q-10 -5 -23 3 Z" fill="currentColor"/>' +
    '<g fill="none" stroke="#000" stroke-opacity=".45" stroke-width="3">' +
    '<path d="M7 34 q14 -6 26 -2 q14 4 24 -2"/>' +
    '<path d="M9 22 q13 -8 25 -3 q12 5 21 -3"/>' +
    '<path d="M11 12 q13 -8 23 -3 q10 5 19 -3"/></g>',
  dominoes: '<g fill="currentColor">' +
    '<rect x="7" y="18" width="11" height="36" rx="2"/>' +
    '<rect x="23" y="18" width="11" height="36" rx="2" transform="rotate(13 28 54)"/>' +
    '<rect x="40" y="18" width="11" height="36" rx="2" transform="rotate(28 45 54)"/></g>' +
    '<rect x="3" y="54" width="58" height="5" rx="2" fill="currentColor"/>'
};

window.NEWS_ADS = [
  // ---- preposterous products ----
  {
    headline: "FLANGE YOUR OWN SPROCKETS AT HOME!",
    body: "The FlangeMaster 9000™ — now with a second flange. Certified* by nobody. *not certified. Do NOT operate near escalators.",
    cta: "FLANGE NOW",
    href: "#",
    bg: "linear-gradient(90deg,#ff007a,#ffb800)",
    fg: "#1a0010",
    emoji: "🔧", icon: "flange", bob: true,
    fx: ["flicker", "slide", "jitter"]
  },
  {
    headline: "One WEIRD trick to make your Tuesdays 40% less Tuesday",
    body: "Meteorologists HATE this. Local man reduces midweek dread using only a spoon and firm resolve. Results not typical. Nothing is typical.",
    cta: "Reveal the trick",
    href: "#",
    bg: "linear-gradient(90deg,#00c2ff,#7a00ff)",
    fg: "#fff",
    emoji: "🥄", icon: "spoon",
    fx: ["slide", "rainbow"]
  },
  {
    headline: "Is YOUR elbow legally optional?",
    body: "Millions of Britons are carrying an elbow they no longer need. Take our 3-second quiz to find out if you qualify for a refund on it.",
    cta: "Take the quiz",
    href: "#",
    bg: "linear-gradient(135deg,#e70000,#ff8a00)",
    fg: "#fff",
    emoji: "💪", icon: "elbow", bob: true,
    fx: ["flicker"]
  },
  {
    headline: "BOTTLED WAITING-ROOM DREAD",
    body: "Artisanal. Small-batch. Faintly herbal. The gift for the person who has everything and would like to feel slightly worse about it. 30ml.",
    cta: "Add to basket",
    href: "#",
    bg: "linear-gradient(90deg,#4b4b4b,#7a7a7a)",
    fg: "#fff",
    emoji: "🫙", icon: "jar",
    fx: ["slide"]
  },
  {
    headline: "RENT A SUBMARINE from your cruise ship*",
    body: "*Not affiliated with any cruise line. Please do not acknowledge the submarines at breakfast. Deployment is formalwear-optional.",
    cta: "Dive in",
    href: "#",
    bg: "linear-gradient(90deg,#003b6f,#0090c9)",
    fg: "#fff",
    emoji: "🛥️", icon: "submarine",
    fx: ["slide", "jitter"]
  },
  {
    headline: "★★★★★ ARTISANAL WIND ★★★★★",
    body: "Harvested from genuine wingtip vortices. Notes of jet fuel and mild regret. Aged eight weeks in a bag. Decant tableside to unsettle napkins.",
    cta: "Sniff the range",
    href: "#",
    bg: "linear-gradient(90deg,#00b09b,#96c93d)",
    fg: "#04231e",
    emoji: "🌬️", icon: "wind", bob: true,
    fx: ["rainbow", "slide"]
  },
  {
    headline: "CLICK HERE (the button is very tired)",
    body: "This banner has been sliding since 2019. The finish line keeps politely stepping back. Please, someone, click it so it can rest.",
    cta: "End its suffering",
    href: "#",
    bg: "linear-gradient(90deg,#ff512f,#dd2476)",
    fg: "#fff",
    icon: "cursor",
    blink: true,
    fx: ["jitter", "flicker"]
  },
  {
    headline: "Buy a Tuesday. Sell a Wednesday. Get RICH.",
    body: "Marchmont Weekday Capital*: temporally concentrated, philosophically diversified. Capital at risk. So is your grip on the calendar.",
    cta: "Invest in a weekday",
    href: "#",
    bg: "linear-gradient(135deg,#134e5e,#71b280)",
    fg: "#fff",
    emoji: "📈", icon: "calendar",
    fx: ["slide"]
  },
  {
    headline: "APOLOGISE TO YOUR ROUTER — the deluxe course",
    body: "Learn the six-word apology that gets you back online. Module 3: 'The thing with the towel, 2023'. Certificate on completion.",
    cta: "Say sorry now",
    href: "#",
    bg: "linear-gradient(90deg,#f7971e,#ffd200)",
    fg: "#2a1a00",
    emoji: "📡", icon: "router",
    fx: ["flicker", "slide"]
  },
  {
    headline: "COMPLIMENT-POWERED LAPTOPS in stock!",
    body: "Charges only on sincere praise. Batteries for the emotionally withholding sold separately (they don't work either). Admire the hinge.",
    cta: "Flatter to order",
    href: "#",
    bg: "linear-gradient(90deg,#8e2de2,#4a00e0)",
    fg: "#fff",
    emoji: "💻", icon: "laptop", bob: true,
    fx: ["rainbow"]
  },
  {
    headline: "SPROCKET INSURANCE — don't get caught un-flanged",
    body: "Covers humming bridges, sideways escalators, and vessels sailing backwards through time. Excess applies. So does spacetime.",
    cta: "Get a quote",
    href: "#",
    bg: "linear-gradient(90deg,#c31432,#240b36)",
    fg: "#fff",
    emoji: "⚙️", icon: "shield",
    fx: ["slide", "jitter"]
  },
  {
    headline: "HOT SINGLE FOGS in your area want to loiter",
    body: "This fog has a passport and is clearly going somewhere. Do not offer it a lift — it is capable of getting into a vehicle and won't get out.",
    cta: "Meet the fog",
    href: "#",
    bg: "linear-gradient(90deg,#616161,#9bc5c3)",
    fg: "#0a0a0a",
    emoji: "🌫️", icon: "fog",
    fx: ["flicker", "slide"]
  },
  {
    headline: "Your PLACE IN THE QUEUE could be worth £90",
    body: "Ahead™ — liquidity for the impatient. Sell your spot at the post office. Short a queue you think will collapse. Terms behind you in the line.",
    cta: "Trade your spot",
    href: "#",
    bg: "linear-gradient(135deg,#f12711,#f5af19)",
    fg: "#1a0a00",
    emoji: "🧍", icon: "ticket",
    fx: ["slide"]
  },
  {
    headline: "LEARN TO STAND VERY STILL — Olympic coaching",
    body: "New medal event. Elite motionlessness from a retired lighthouse keeper. Week 1: not blinking. Week 8: being basically furniture.",
    cta: "Enrol (slowly)",
    href: "#",
    bg: "linear-gradient(90deg,#1d976c,#93f9b9)",
    fg: "#04231a",
    emoji: "🧘", icon: "statue",
    fx: ["rainbow", "slide"]
  },
  {
    headline: "UMBRELLA INSURANCE — for your umbrella",
    body: "Underwritten against inversion, envy, and being left on a train. Your umbrella has never felt so protected while protecting so little.",
    cta: "Insure the brolly",
    href: "#",
    bg: "linear-gradient(135deg,#2c3e50,#4ca1af)",
    fg: "#fff",
    icon: "umbrella",
    fx: ["slide"]
  },
  {
    headline: "RENT-A-SHADOW — silhouette outsourcing",
    body: "Too busy to cast your own? Our shadows are ISO-certified, mood-neutral, and arrive pre-lengthened for golden hour. Cancel any daylight.",
    cta: "Book a shadow",
    href: "#",
    bg: "linear-gradient(135deg,#232526,#414345)",
    fg: "#fff",
    icon: "shadow", bob: true,
    fx: ["flicker"]
  },
  {
    headline: "HAUNTED TOASTERS — fully certified, mildly ominous",
    body: "Each unit possessed by a previous owner's Sunday morning regrets. Toasts bread and grudges evenly. Warranty void if exorcised.",
    cta: "Bring one home",
    href: "#",
    bg: "linear-gradient(90deg,#3a1c71,#d76d77)",
    fg: "#fff",
    icon: "toaster",
    fx: ["jitter", "flicker"]
  },
  {
    headline: "TIMESHARE A TUESDAY AFTERNOON",
    body: "Own three hours of a mid-week afternoon, in perpetuity, shared with 51 strangers. Maintenance fees payable in mild disappointment.",
    cta: "Claim your hours",
    href: "#",
    bg: "linear-gradient(135deg,#485563,#29323c)",
    fg: "#fff",
    icon: "clock",
    fx: ["slide"]
  },
  {
    headline: "EMOTIONAL SUPPORT TRAFFIC CONE — available now",
    body: "Certified to redirect traffic and feelings alike. Comes pre-weathered for authenticity. Does not require walking. Rarely judges.",
    cta: "Adopt a cone",
    href: "#",
    bg: "linear-gradient(90deg,#ff8008,#ffc837)",
    fg: "#2a1400",
    icon: "cone", bob: true,
    fx: ["rainbow"]
  },
  {
    headline: "ANTI-GRAVITY SOCKS (mild lift only)",
    body: "Not flight. Not levitation. A confident, deniable hover of roughly four millimetres. Ideal for looking slightly taller at parties.",
    cta: "Float a little",
    href: "#",
    bg: "linear-gradient(135deg,#00c3ff,#ffff1c)",
    fg: "#001a2a",
    icon: "sock",
    fx: ["slide", "jitter"]
  },
  {
    headline: "Certified FREE-RANGE PUNCTUATION",
    body: "Ethically sourced commas and full stops, never caged in a style guide. Some sentences may wander. That's the point, we think.",
    cta: "Punctuate freely",
    href: "#",
    bg: "linear-gradient(90deg,#11998e,#38ef7d)",
    fg: "#03251f",
    icon: "punctuation",
    fx: ["flicker"]
  },
  {
    headline: "SUSPICIOUSLY SPECIFIC PSYCHIC HOTLINE",
    body: "We already know you're reading this ad. We also know what you had for lunch, and that you're not proud of it. Call for more.",
    cta: "Call now (we know)",
    href: "#",
    bg: "linear-gradient(135deg,#5f0a87,#a4508b)",
    fg: "#fff",
    icon: "crystalball", blink: true,
    fx: ["rainbow", "flicker"]
  },
  {
    headline: "BAGPIPE SILENCER — subscription tier",
    body: "Muffles up to 40% of a full pipe band. Neighbours notice nothing except a faint, dignified drone. Cancel any time, we won't hear you.",
    cta: "Subscribe to silence",
    href: "#",
    bg: "linear-gradient(90deg,#2b5876,#4e4376)",
    fg: "#fff",
    icon: "bagpipe",
    fx: ["slide"]
  },
  {
    headline: "EXECUTIVE PIGEON NEGOTIATION SERVICES",
    body: "Trained mediators for disputes involving chips, ledges, and personal space. Fluent in cooing. No pigeon has ever lost a negotiation.",
    cta: "Hire a negotiator",
    href: "#",
    bg: "linear-gradient(135deg,#8e9eab,#eef2f3)",
    fg: "#1a1a1a",
    icon: "pigeon", bob: true,
    fx: ["jitter"]
  },
  {
    headline: "AMBIENT DISAPPOINTMENT CANDLES — now in Wednesday scent",
    body: "Notes of a cancelled train and a 'we need to talk'. Burns for exactly as long as your enthusiasm did. Do not leave unattended, or attended.",
    cta: "Light one up",
    href: "#",
    bg: "linear-gradient(90deg,#654ea3,#eaafc8)",
    fg: "#22102e",
    icon: "candle",
    fx: ["flicker", "slide"]
  },
  {
    headline: "RENT-A-CLOUD for your parade",
    body: "A single, dedicated raincloud, contractually obliged to hover only over you. Ideal for weddings you're ambivalent about attending.",
    cta: "Book the cloud",
    href: "#",
    bg: "linear-gradient(135deg,#757f9a,#d7dde8)",
    fg: "#1a2030",
    icon: "raincloud",
    fx: ["slide", "jitter"]
  },

  // ---- cross-promos for other Almanac documents (real links) ----
  {
    headline: "Actually drive a train — the EMU Cab Simulator",
    body: "Enough nonsense. Take the controls of a real UK electric multiple unit, from the Almanac. Notches, brakes, the lot. No sprockets require flanging.",
    cta: "Open the cab",
    href: "../emu-cab/",
    bg: "linear-gradient(135deg,#1e3c72,#2a5298)",
    fg: "#fff",
    emoji: "🚆", icon: "train",
    fx: ["slide"]
  },
  {
    headline: "The Night Cab — a wet-night driving sim",
    body: "Rain, sodium light and a heavy train. The GTO successor to the EMU cab, over in the 0x4D44 Almanac. Considerably realer than this newspaper.",
    cta: "Drive it",
    href: "../night-cab/",
    bg: "linear-gradient(135deg,#0f2027,#203a43)",
    fg: "#fff",
    emoji: "🌧️", icon: "trainrain",
    fx: ["slide"]
  },
  {
    headline: "COIL — a 2.5D snake puzzle",
    body: "A discrete little brain-teaser from the Almanac. No submarines. No flanging. Just you, a grid, and a snake with commitment issues.",
    cta: "Play Coil",
    href: "../coil/",
    bg: "linear-gradient(135deg,#42275a,#734b6d)",
    fg: "#fff",
    emoji: "🐍", icon: "spiral", bob: true,
    fx: ["rainbow"]
  },
  {
    headline: "Vector GP — flat-shaded Grand Prix",
    body: "A 16-round championship of invented drivers in the spirit of the early-90s racers. From the Almanac. The cars turn for free.",
    cta: "Start your engine",
    href: "../vector-gp/",
    bg: "linear-gradient(135deg,#cb2d3e,#ef473a)",
    fg: "#fff",
    emoji: "🏎️", icon: "flag",
    fx: ["slide", "jitter"]
  },
  {
    headline: "Watch a WORLD you can spin — Worldviewer",
    body: "A MapLibre 'Earth twin' with live aircraft, from the 0x4D44 Almanac. The globe stays put, unlike our North Pole.",
    cta: "Explore Earth",
    href: "../worldviewer/",
    bg: "linear-gradient(135deg,#2980b9,#6dd5fa)",
    fg: "#04283a",
    emoji: "🌍", icon: "globe", bob: true,
    fx: ["slide"]
  },
  {
    headline: "PicoEM — a tiny emulator in your browser",
    body: "Retro computing, straight from the Almanac. Zero build steps, zero flanging. Bytes, not barnacles.",
    cta: "Boot it up",
    href: "../picoem/",
    bg: "linear-gradient(135deg,#16222a,#3a6073)",
    fg: "#fff",
    emoji: "🖥️", icon: "chip",
    fx: ["slide"]
  },
  {
    headline: "Watch paint dry (yes, really) — the Almanac",
    body: "A genuine document about the physics of drying paint. More eventful than our Weather section. From the 0x4D44 Almanac.",
    cta: "Watch it dry",
    href: "../paint-drying/",
    bg: "linear-gradient(135deg,#8e9eab,#eef2f3)",
    fg: "#1a1a1a",
    emoji: "🖌️", icon: "paintroller",
    fx: ["slide"]
  },
  {
    headline: "RECIPES FOR PEOPLE WHO MEASURE FLOUR",
    body: "A calm, practical recipe book rescued from emails, handwriting and one suspicious bread-machine manual. The loaf is optional; the weighing is not.",
    cta: "Open the cookbook",
    href: "../recipes/",
    image: "images/ad-recipes.webp",
    bg: "linear-gradient(135deg,#8f3f2f,#d68b45)", fg: "#fff", fx: ["slide"]
  },
  {
    headline: "FOLLOW THE OCEAN — VERY CAREFULLY",
    body: "An interactive atlas of currents, temperatures and the planet's enormous moving blue machinery. Bring a jumper and a sense of scale.",
    cta: "Explore the currents",
    href: "../ocean-currents/",
    image: "images/ad-ocean-currents.webp",
    bg: "linear-gradient(135deg,#063b5c,#087f8c)", fg: "#fff", fx: ["slide"]
  },
  {
    headline: "QUANTUM PHYSICS, WITH FEWER EQUATIONS",
    body: "A readable tour through particles, uncertainty and the bit where the cat is both fine and not fine. Probably.",
    cta: "Open the explainer",
    href: "../quantum/",
    image: "images/ad-quantum.webp",
    bg: "linear-gradient(135deg,#30205f,#6e4bb5)", fg: "#fff", fx: ["rainbow"]
  },
  {
    headline: "TIDECALL — BID WITH CONFIDENCE",
    body: "A trick-taking card game of calls, tides and the quiet realisation that your partner had a plan all along.",
    cta: "Play Tidecall",
    href: "../tidecall/",
    image: "images/ad-tidecall.webp",
    bg: "linear-gradient(135deg,#075985,#0e7490)", fg: "#fff", fx: ["slide", "jitter"]
  },
  {
    headline: "SPAN OF CONTROL — NOW WITH MORE BOXES",
    body: "A management simulation about teams, promotions and the strange mathematics of reporting lines. Every box contains a meeting.",
    cta: "Draw the org chart",
    href: "../span-of-control/",
    image: "images/ad-span-of-control.webp",
    bg: "linear-gradient(135deg,#164e63,#0f766e)", fg: "#fff", fx: ["slide"]
  },
  {
    headline: "HOW FAST IS YOUR INTERNET, REALLY?",
    body: "Measure the connection, inspect the numbers and discover which cable is quietly doing all the work. No motivational speech required.",
    cta: "Run the test",
    href: "../broadband-speed-checker/",
    image: "images/ad-broadband-speed-checker.webp",
    bg: "linear-gradient(135deg,#0f3d56,#1d7ca4)", fg: "#fff", fx: ["slide"]
  },
  {
    headline: "THE SHIP THAT MADE EVERYONE VERY BUSY",
    body: "A careful account of the Costa Concordia disaster, the engineering, the decisions and the long aftermath. Serious history, no cruise upgrade required.",
    cta: "Read the case study",
    href: "../costa-concordia/",
    image: "images/ad-costa-concordia.webp",
    bg: "linear-gradient(135deg,#17324d,#527b9d)", fg: "#fff", fx: ["slide"]
  },
  {
    headline: "SILICON ON STERLING",
    body: "A small package of semiconductor history, British industry and the beautifully stubborn hardware that made modern life possible.",
    cta: "Inspect the package",
    href: "../transistor-packages/",
    image: "images/ad-transistor-packages.webp",
    bg: "linear-gradient(135deg,#3e2723,#8d6e63)", fg: "#fff", fx: ["slide"]
  },
  {
    headline: "THE DAY THE DINOSAURS LOST THE ARGUMENT",
    body: "Follow the evidence from impact crater to fossil layer in a concise account of Chicxulub and the world's most consequential bad afternoon.",
    cta: "Visit the crater",
    href: "../chicxulub/",
    image: "images/ad-chicxulub.webp",
    bg: "linear-gradient(135deg,#6b3f1d,#b86b32)", fg: "#fff", fx: ["jitter"]
  },
  {
    headline: "THE STAR-FORGED RING",
    body: "A compact piece of fiction about metal, destiny and the sort of ring that comes with considerably more paperwork than jewellery.",
    cta: "Enter the forge",
    href: "../starforged/",
    image: "images/ad-starforged.webp",
    bg: "linear-gradient(135deg,#211536,#7b3f91)", fg: "#fff", fx: ["rainbow"]
  },
  {
    headline: "BRILLIANCY — FIND THE MOVE",
    body: "A chess puzzle with a clean board, sharp tactics and the faint suspicion that the obvious move is exactly what it wants you to play.",
    cta: "Solve the position",
    href: "../brilliancy/",
    image: "images/ad-brilliancy.webp",
    bg: "linear-gradient(135deg,#172554,#3730a3)", fg: "#fff", fx: ["slide"]
  },
  {
    headline: "ONU — A CARD GAME WITH RULES",
    body: "A rigorous card game for people who enjoy colour matching, strategic reversals and discovering that the rulebook was right all along.",
    cta: "Play Onu",
    href: "../onu/",
    image: "images/ad-onu.webp",
    bg: "linear-gradient(135deg,#7f1d1d,#be123c)", fg: "#fff", fx: ["slide", "jitter"]
  },
  {
    headline: "SINTAXIS — BUILD SOMETHING IN SPANISH",
    body: "A practical Spanish toolchain for turning ideas into working software, with fewer mysterious compiler errors and only moderate accent marks.",
    cta: "Open Sintaxis",
    href: "../sintaxis/",
    image: "images/ad-sintaxis.webp",
    bg: "linear-gradient(135deg,#7f1d1d,#f59e0b)", fg: "#fff", fx: ["slide"]
  },
  {
    headline: "NORTHERN LINE 1987 — MIND THE MEMORY",
    body: "A photographic journey through an older Underground, where the trains were louder and the station announcements had less to apologise for.",
    cta: "Ride the line",
    href: "../northern-line-1987/",
    image: "images/ad-northern-line-1987.webp",
    bg: "linear-gradient(135deg,#111827,#4b5563)", fg: "#fff", fx: ["slide"]
  },
  {
    headline: "GENE INHERITANCE — TWO COPIES, MANY QUESTIONS",
    body: "An accessible look at how traits pass through families, with enough biology to be useful and not enough to ruin dinner.",
    cta: "Trace the pattern",
    href: "../gene-inheritance/",
    image: "images/ad-gene-inheritance.webp",
    bg: "linear-gradient(135deg,#164e63,#0d9488)", fg: "#fff", fx: ["rainbow"]
  },
  {
    headline: "THE ROAD TO CHAOS",
    body: "Follow a simple rule until it becomes gloriously complicated. Mathematics has been warned, but remains unable to intervene.",
    cta: "Enter the map",
    href: "../logistic-map/",
    image: "images/ad-logistic-map.webp",
    bg: "linear-gradient(135deg,#312e81,#c026d3)", fg: "#fff", fx: ["jitter"]
  },
  {
    headline: "COWORK — WHILE YOU WERE OUT",
    body: "A quiet workplace essay about desks, meetings and the suspiciously empty chair that has been holding your calendar together.",
    cta: "Take a seat",
    href: "../cowork/",
    image: "images/ad-cowork.webp",
    bg: "linear-gradient(135deg,#334155,#0f766e)", fg: "#fff", fx: ["slide"]
  },
  {
    headline: "MODEL WELFARE — SOMEONE IS HOME",
    body: "A thoughtful look at what we owe the systems we build, and whether a machine can be offered a comfortable chair without making it awkward.",
    cta: "Read the case",
    href: "../model-welfare/",
    image: "images/ad-model-welfare.webp",
    bg: "linear-gradient(135deg,#3f3f46,#78716c)", fg: "#fff", fx: ["slide"]
  },
  {
    headline: "HAS YOUR BOTTOM GONE?",
    body: "Copper Bottom Bereavement Assessments while you wait. We inspect the pan, validate the silence and explain why polish is not a metal-deposition process.",
    cta: "Turn it over gently",
    href: "#",
    bg: "linear-gradient(135deg,#7c2d12,#d97706)",
    fg: "#fff",
    emoji: "🍲", icon: "spoon", bob: true,
    fx: ["flicker", "slide"]
  },
  {
    headline: "BOTTOMBACK™ SAUCEPAN COVER",
    body: "Insurance for flaking, fading and the sudden appearance of steel. Excludes overheating, abrasion, Tuesdays and every pan you currently own.",
    cta: "Discover the exclusions",
    href: "#",
    bg: "linear-gradient(90deg,#92400e,#f59e0b)",
    fg: "#1c1005",
    emoji: "🛡️", icon: "shield",
    fx: ["slide", "jitter"]
  },
  {
    headline: "RE-COPPER IT YOURSELF! (DO NOT)",
    body: "Our home plating kit has been replaced by a very good leaflet saying 'contact the maker or a qualified restorer'. Now with two staples.",
    cta: "Send me the leaflet",
    href: "#",
    bg: "linear-gradient(135deg,#b91c1c,#fb923c)",
    fg: "#fff",
    emoji: "📄", icon: "flange",
    fx: ["flicker", "rainbow"]
  },
  {
    headline: "THE MEMORIAL TRIVET",
    body: "For the pan that no longer goes on heat but still deserves somewhere to stand. Engraving reads: IT SIMMERED. WE STIRRED. Terms apply to basil.",
    cta: "Reserve a quiet corner",
    href: "#",
    bg: "linear-gradient(90deg,#4a2c1a,#b87333)",
    fg: "#fff8ed",
    emoji: "🕯️", icon: "candle",
    fx: ["slide"]
  },

  // ---- Almanac cross-promos: the July/August intake ----
  {
    headline: "THE GREAT DYING — 96% OFF, ONE TIME ONLY",
    body: "The worst extinction in Earth's history, run as a calibrated carbon–climate simulator. Scrub the crisis across deep time and watch an ocean stop breathing.",
    cta: "Suffocate an ocean",
    href: "../great-dying/",
    bg: "linear-gradient(135deg,#7c2d12,#dc2626)", fg: "#fff",
    icon: "volcano", bob: true, fx: ["flicker", "slide"]
  },
  {
    headline: "A WHOLE PLANET. 640 KILOBYTES. NO EXCUSES.",
    body: "How Civilization ran a world in less memory than this advert's stylesheet: linker-level paging, streamed art and a 608.8 Hz heartbeat, measured off the shipped binaries.",
    cta: "Count the bytes",
    href: "../world-in-640k/",
    bg: "linear-gradient(135deg,#1e293b,#0891b2)", fg: "#fff",
    icon: "floppy", fx: ["slide", "jitter"]
  },
  {
    headline: "THE BEETLE THAT FIRES BOILING CHEMICALS AT YOU",
    body: "An interactive bestiary of nature's least reasonable defences — squirting blood, home-grown claws, industrial slime. 38 creatures. Nine you can set off yourself.",
    cta: "Poke it and see",
    href: "../animal-defenses/",
    bg: "linear-gradient(135deg,#14532d,#65a30d)", fg: "#fff",
    icon: "beetle", bob: true, fx: ["jitter", "slide"]
  },
  {
    headline: "FIFTY-THREE DAYS TO REACH A DESKTOP",
    body: "A from-scratch PC emulator learns to boot Windows 2000, via latched interrupt edges, a 128 MiB RAM dump and a deadlock caused by a dialog box nobody could see.",
    cta: "Watch it boot",
    href: "../win2k/",
    bg: "linear-gradient(135deg,#0f172a,#2563eb)", fg: "#fff",
    icon: "monitor", fx: ["slide"]
  },
  {
    headline: "QUANTA — THE UNIVERSE, ITEMISED",
    body: "Eight chapters and fourteen live instruments on quantum theory. Run a Bell test, tunnel a barrier, and dial a nanocrystal's colour purely by making it smaller.",
    cta: "Collapse something",
    href: "../quantum-theory/",
    bg: "linear-gradient(135deg,#312e81,#7c3aed)", fg: "#fff",
    icon: "atom", bob: true, fx: ["rainbow", "slide"]
  },
  {
    headline: "IS YOUR BRAIN SIMPLY TOO WARM?",
    body: "Does thinking really fall 2% per degree above 25°C? The honest answer, made interactive — the curve, the 37°C defence, the cold mirror and ten million exam scores.",
    cta: "Take your temperature",
    href: "../thermal-mind/",
    bg: "linear-gradient(135deg,#9a3412,#f59e0b)", fg: "#fff",
    icon: "thermometer", fx: ["flicker", "slide"]
  },
  {
    headline: "EVENT HORIZON — POINT OF NO REFUNDS",
    body: "A deep field guide to black holes: collapse, lensing, the photon ring, spaghettification, Hawking radiation, and how a shadow got photographed. A dozen live instruments.",
    cta: "Fall in",
    href: "../black-holes/",
    bg: "linear-gradient(135deg,#020617,#4338ca)", fg: "#fff",
    icon: "blackhole", bob: true, fx: ["slide", "rainbow"]
  },
  {
    headline: "THE TEENAGE BRAIN: A REWIRING IN PROGRESS",
    body: "Pruning, myelination, two badly synchronised clocks and a dopamine peak. Seven chapters and ten live instruments, built on the primary neuroscience, not the tabloids.",
    cta: "Meet the rewiring",
    href: "../teenage-brain/",
    bg: "linear-gradient(135deg,#701a75,#db2777)", fg: "#fff",
    icon: "brain", fx: ["slide"]
  },
  {
    headline: "ONE LORRY = TENS OF THOUSANDS OF CARS",
    body: "The fourth-power law, the layer sandwich under every wheel, and the exact business by which frost prises a hairline crack into the pothole outside your house.",
    cta: "Blame the axle",
    href: "../road-wear/",
    bg: "linear-gradient(135deg,#292524,#78716c)", fg: "#fff",
    icon: "pothole", fx: ["jitter", "slide"]
  },
  {
    headline: "YOUR ENAMEL IS NEVER COMING BACK",
    body: "A field guide to the one organ your body cannot repair: the acid clock, why toothache is its own category of pain, and what each repair actually buys you. 27 live figures.",
    cta: "Open wide",
    href: "../root-and-crown/",
    bg: "linear-gradient(135deg,#155e75,#0ea5e9)", fg: "#fff",
    icon: "tooth", bob: true, fx: ["slide"]
  },
  {
    headline: "CROSS AFRICA. TURN THIRTY DISKS. FIND THE STAR.",
    body: "Kari Mannerla's 1951 route-and-reveal classic, hand-drawn and playable: road, ship and aeroplane, rival expeditions, and one lucky horseshoe that will also do.",
    cta: "Book passage",
    href: "../african-star/",
    bg: "linear-gradient(135deg,#78350f,#f59e0b)", fg: "#fff",
    icon: "compass", fx: ["slide", "rainbow"]
  },
  {
    headline: "A ROLLERCOASTER THAT DESIGNS ITSELF",
    body: "One button draws a fresh circuit and hands it to gravity. Magnetic launches, a splayed loop that provably never runs through itself, and a tunnel through a hillside.",
    cta: "Ride the front seat",
    href: "../iron-vertex/",
    bg: "linear-gradient(135deg,#0c4a6e,#f97316)", fg: "#fff",
    icon: "coaster", bob: true, fx: ["jitter", "slide"]
  },
  {
    headline: "SIX TYRANNOSAURS AND THIRTY LAVA COUNTERS",
    body: "Waddingtons' erupting 1985 adventure, restored in the browser: caves, rivers, a temple worth robbing, a swamp monster, and a valley on a countdown.",
    cta: "Escape the valley",
    href: "../lost-valley-dinosaurs/",
    bg: "linear-gradient(135deg,#166534,#ca8a04)", fg: "#fff",
    icon: "dinotrack", fx: ["flicker", "slide"]
  },
  {
    headline: "SPIN DRACULA. RACE THE YELLOW STONES.",
    body: "Waddingtons' 1977 castle chase, vividly restored: two vampires to hide from, a blood-red trail to survive, and a Green Vampire mask that keeps changing hands.",
    cta: "Enter the castle",
    href: "../game-of-dracula/",
    bg: "linear-gradient(135deg,#450a0a,#b91c1c)", fg: "#fff",
    icon: "bat", bob: true, fx: ["flicker", "jitter"]
  },
  {
    headline: "TWENTY TONS OF FRAME, AND YOU CAN PLAY IT",
    body: "How the piano actually works: the vibrating string, the escapement that throws a free-flying hammer, the soundboard, and a two-thousand-year tuning compromise.",
    cta: "Strike a note",
    href: "../instruments/",
    bg: "linear-gradient(135deg,#1c1917,#a16207)", fg: "#fff",
    icon: "piano", fx: ["slide"]
  },
  {
    headline: "ARRAN: WHERE TIME GOT ITS FIRST HONEST MEASUREMENT",
    body: "Ocean-floor mud, colliding continents, red deserts, a buried volcano and the shoreline outcrop that showed James Hutton the age of the Earth. Six field routes.",
    cta: "Read the rocks",
    href: "../arran-deep-time/",
    bg: "linear-gradient(135deg,#134e4a,#0d9488)", fg: "#fff",
    icon: "strata", fx: ["slide"]
  },
  {
    headline: "FORTY PIECES. NOBODY CAN SEE YOURS.",
    body: "Full-size Stratego in the browser: deploy in secret, scout the lakes, defuse the bombs, and spring the Spy on the Marshal. Hot-seat, or an opponent that cannot peek.",
    cta: "Deploy in secret",
    href: "../stratego/",
    bg: "linear-gradient(135deg,#1e3a8a,#991b1b)", fg: "#fff",
    icon: "flag", bob: true, fx: ["slide", "jitter"]
  },
  {
    headline: "SEVEN LEVERS. YOU ARE ALREADY LEANING ON ONE.",
    body: "Cialdini's persuasion levers with 33 field experiments, a lab where you predict each result first, and a replication ledger that audits its own best anecdotes.",
    cta: "Click, whirr",
    href: "../influence/",
    bg: "linear-gradient(135deg,#581c87,#c026d3)", fg: "#fff",
    icon: "dominoes", fx: ["rainbow", "slide"]
  },
  {
    headline: "FIFTY PARTS. ONE WASHER. NO MEDICAL ADVICE.",
    body: "The complete Flanging for Absolute Beginners course, serialised properly in this newspaper. Part 01 begins with the Call of the Washer. Part 50 involves a goose.",
    cta: "Begin at Part 01",
    href: "../master-flanger/",
    bg: "linear-gradient(135deg,#7a3b2e,#f59e0b)", fg: "#fff",
    icon: "flange", bob: true, blink: true, fx: ["flicker", "slide", "jitter"]
  }
];

// Keep the cross-promotion inventory complete as the Almanac grows. Hand-written
// campaigns above win by slug; new documents receive a restrained, catalog-backed
// advert immediately instead of silently disappearing from the ad rotation.
(function () {
  var explicit = {};
  window.NEWS_ADS.forEach(function (ad) {
    if (ad.href && /^\.\.\//.test(ad.href)) explicit[ad.href.slice(3, -1)] = true;
  });
  var palettes = [
    ["#17324d", "#527b9d"], ["#3f3f46", "#78716c"], ["#164e63", "#0f766e"],
    ["#312e81", "#7e22ce"], ["#7f1d1d", "#be123c"], ["#14532d", "#15803d"]
  ];
  function iconFor(entry) {
    var text = (entry.slug + " " + entry.title + " " + (entry.tagline || "")).toLowerCase();
    if (/train|rail|locomotive|metro|engine|motor|traction|diesel/.test(text)) return "train";
    if (/ship|cruise|ocean|maritime|sea|harbour|hydro/.test(text)) return "submarine";
    if (/code|rust|software|compiler|ai|model|token|computer|disk|mcp|network/.test(text)) return "chip";
    if (/game|card|puzzle|chess|wordle|quixo|pylos|quarto|whist/.test(text)) return "ticket";
    if (/science|physics|quantum|gene|biology|math|calculus|star|space|population/.test(text)) return "crystalball";
    if (/music|midi|audio|spectrum/.test(text)) return "bagpipe";
    if (/map|travel|world|history|barcelona|edinburgh|perth|lothian/.test(text)) return "globe";
    return "calendar";
  }
  function paletteFor(slug) {
    var n = 0;
    for (var i = 0; i < slug.length; i++) n = (n + slug.charCodeAt(i) * (i + 3)) % palettes.length;
    return palettes[n];
  }
  (window.ESSAYS || []).forEach(function (entry) {
    if (!entry || entry.slug === "news" || explicit[entry.slug]) return;
    var palette = paletteFor(entry.slug);
    var summary = String(entry.tagline || "A small, carefully made corner of the Almanac.")
      .replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (summary.length > 180) summary = summary.slice(0, 177).replace(/\s+\S*$/, "") + "…";
    window.NEWS_ADS.push({
      headline: entry.title,
      body: summary,
      cta: "Open the Almanac",
      href: "../" + entry.slug + "/",
      bg: "linear-gradient(135deg," + palette[0] + "," + palette[1] + ")",
      fg: "#fff",
      icon: iconFor(entry),
      fx: ["slide"]
    });
  });
})();
