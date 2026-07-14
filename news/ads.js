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
//    emoji     optional leading glyph
//    bob       true -> the emoji bobs up and down
//    blink     true -> the headline blinks
//    fx        any of: "flicker", "slide", "jitter", "rainbow"
//    slots     optional ["leader"] or ["mpu"] to restrict placement
//
//  The almanac cross-promos are real links; everything else is invented.
// ============================================================

window.NEWS_ADS = [
  // ---- preposterous products ----
  {
    headline: "FLANGE YOUR OWN SPROCKETS AT HOME!",
    body: "The FlangeMaster 9000™ — now with a second flange. Certified* by nobody. *not certified. Do NOT operate near escalators.",
    cta: "FLANGE NOW",
    href: "#",
    bg: "linear-gradient(90deg,#ff007a,#ffb800)",
    fg: "#1a0010",
    emoji: "🔧", bob: true,
    fx: ["flicker", "slide", "jitter"]
  },
  {
    headline: "One WEIRD trick to make your Tuesdays 40% less Tuesday",
    body: "Meteorologists HATE this. Local man reduces midweek dread using only a spoon and firm resolve. Results not typical. Nothing is typical.",
    cta: "Reveal the trick",
    href: "#",
    bg: "linear-gradient(90deg,#00c2ff,#7a00ff)",
    fg: "#fff",
    emoji: "🥄",
    fx: ["slide", "rainbow"]
  },
  {
    headline: "Is YOUR elbow legally optional?",
    body: "Millions of Britons are carrying an elbow they no longer need. Take our 3-second quiz to find out if you qualify for a refund on it.",
    cta: "Take the quiz",
    href: "#",
    bg: "linear-gradient(135deg,#e70000,#ff8a00)",
    fg: "#fff",
    emoji: "💪", bob: true,
    fx: ["flicker"]
  },
  {
    headline: "BOTTLED WAITING-ROOM DREAD",
    body: "Artisanal. Small-batch. Faintly herbal. The gift for the person who has everything and would like to feel slightly worse about it. 30ml.",
    cta: "Add to basket",
    href: "#",
    bg: "linear-gradient(90deg,#4b4b4b,#7a7a7a)",
    fg: "#fff",
    emoji: "🫙",
    fx: ["slide"]
  },
  {
    headline: "RENT A SUBMARINE from your cruise ship*",
    body: "*Not affiliated with any cruise line. Please do not acknowledge the submarines at breakfast. Deployment is formalwear-optional.",
    cta: "Dive in",
    href: "#",
    bg: "linear-gradient(90deg,#003b6f,#0090c9)",
    fg: "#fff",
    emoji: "🛥️",
    fx: ["slide", "jitter"]
  },
  {
    headline: "★★★★★ ARTISANAL WIND ★★★★★",
    body: "Harvested from genuine wingtip vortices. Notes of jet fuel and mild regret. Aged eight weeks in a bag. Decant tableside to unsettle napkins.",
    cta: "Sniff the range",
    href: "#",
    bg: "linear-gradient(90deg,#00b09b,#96c93d)",
    fg: "#04231e",
    emoji: "🌬️", bob: true,
    fx: ["rainbow", "slide"]
  },
  {
    headline: "CLICK HERE (the button is very tired)",
    body: "This banner has been sliding since 2019. The finish line keeps politely stepping back. Please, someone, click it so it can rest.",
    cta: "End its suffering",
    href: "#",
    bg: "linear-gradient(90deg,#ff512f,#dd2476)",
    fg: "#fff",
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
    emoji: "📈",
    fx: ["slide"]
  },
  {
    headline: "APOLOGISE TO YOUR ROUTER — the deluxe course",
    body: "Learn the six-word apology that gets you back online. Module 3: 'The thing with the towel, 2023'. Certificate on completion.",
    cta: "Say sorry now",
    href: "#",
    bg: "linear-gradient(90deg,#f7971e,#ffd200)",
    fg: "#2a1a00",
    emoji: "📡",
    fx: ["flicker", "slide"]
  },
  {
    headline: "COMPLIMENT-POWERED LAPTOPS in stock!",
    body: "Charges only on sincere praise. Batteries for the emotionally withholding sold separately (they don't work either). Admire the hinge.",
    cta: "Flatter to order",
    href: "#",
    bg: "linear-gradient(90deg,#8e2de2,#4a00e0)",
    fg: "#fff",
    emoji: "💻", bob: true,
    fx: ["rainbow"]
  },
  {
    headline: "SPROCKET INSURANCE — don't get caught un-flanged",
    body: "Covers humming bridges, sideways escalators, and vessels sailing backwards through time. Excess applies. So does spacetime.",
    cta: "Get a quote",
    href: "#",
    bg: "linear-gradient(90deg,#c31432,#240b36)",
    fg: "#fff",
    emoji: "⚙️",
    fx: ["slide", "jitter"]
  },
  {
    headline: "HOT SINGLE FOGS in your area want to loiter",
    body: "This fog has a passport and is clearly going somewhere. Do not offer it a lift — it is capable of getting into a vehicle and won't get out.",
    cta: "Meet the fog",
    href: "#",
    bg: "linear-gradient(90deg,#616161,#9bc5c3)",
    fg: "#0a0a0a",
    emoji: "🌫️",
    fx: ["flicker", "slide"]
  },
  {
    headline: "Your PLACE IN THE QUEUE could be worth £90",
    body: "Ahead™ — liquidity for the impatient. Sell your spot at the post office. Short a queue you think will collapse. Terms behind you in the line.",
    cta: "Trade your spot",
    href: "#",
    bg: "linear-gradient(135deg,#f12711,#f5af19)",
    fg: "#1a0a00",
    emoji: "🧍",
    fx: ["slide"]
  },
  {
    headline: "LEARN TO STAND VERY STILL — Olympic coaching",
    body: "New medal event. Elite motionlessness from a retired lighthouse keeper. Week 1: not blinking. Week 8: being basically furniture.",
    cta: "Enrol (slowly)",
    href: "#",
    bg: "linear-gradient(90deg,#1d976c,#93f9b9)",
    fg: "#04231a",
    emoji: "🧘",
    fx: ["rainbow", "slide"]
  },

  // ---- cross-promos for other Almanac documents (real links) ----
  {
    headline: "Actually drive a train — the EMU Cab Simulator",
    body: "Enough nonsense. Take the controls of a real UK electric multiple unit, from the Almanac. Notches, brakes, the lot. No sprockets require flanging.",
    cta: "Open the cab",
    href: "../emu-cab/",
    bg: "linear-gradient(135deg,#1e3c72,#2a5298)",
    fg: "#fff",
    emoji: "🚆",
    fx: ["slide"]
  },
  {
    headline: "The Night Cab — a wet-night driving sim",
    body: "Rain, sodium light and a heavy train. The GTO successor to the EMU cab, over in the 0x4D44 Almanac. Considerably realer than this newspaper.",
    cta: "Drive it",
    href: "../night-cab/",
    bg: "linear-gradient(135deg,#0f2027,#203a43)",
    fg: "#fff",
    emoji: "🌧️",
    fx: ["slide"]
  },
  {
    headline: "COIL — a 2.5D snake puzzle",
    body: "A discrete little brain-teaser from the Almanac. No submarines. No flanging. Just you, a grid, and a snake with commitment issues.",
    cta: "Play Coil",
    href: "../coil/",
    bg: "linear-gradient(135deg,#42275a,#734b6d)",
    fg: "#fff",
    emoji: "🐍", bob: true,
    fx: ["rainbow"]
  },
  {
    headline: "Vector GP — flat-shaded Grand Prix",
    body: "A 16-round championship of invented drivers in the spirit of the early-90s racers. From the Almanac. The cars turn for free.",
    cta: "Start your engine",
    href: "../vector-gp/",
    bg: "linear-gradient(135deg,#cb2d3e,#ef473a)",
    fg: "#fff",
    emoji: "🏎️",
    fx: ["slide", "jitter"]
  },
  {
    headline: "Watch a WORLD you can spin — Worldviewer",
    body: "A MapLibre 'Earth twin' with live aircraft, from the 0x4D44 Almanac. The globe stays put, unlike our North Pole.",
    cta: "Explore Earth",
    href: "../worldviewer/",
    bg: "linear-gradient(135deg,#2980b9,#6dd5fa)",
    fg: "#04283a",
    emoji: "🌍", bob: true,
    fx: ["slide"]
  },
  {
    headline: "PicoEM — a tiny emulator in your browser",
    body: "Retro computing, straight from the Almanac. Zero build steps, zero flanging. Bytes, not barnacles.",
    cta: "Boot it up",
    href: "../picoem/",
    bg: "linear-gradient(135deg,#16222a,#3a6073)",
    fg: "#fff",
    emoji: "🖥️",
    fx: ["slide"]
  },
  {
    headline: "Watch paint dry (yes, really) — the Almanac",
    body: "A genuine document about the physics of drying paint. More eventful than our Weather section. From the 0x4D44 Almanac.",
    cta: "Watch it dry",
    href: "../paint-drying/",
    bg: "linear-gradient(135deg,#8e9eab,#eef2f3)",
    fg: "#1a1a1a",
    emoji: "🖌️",
    fx: ["slide"]
  }
];
