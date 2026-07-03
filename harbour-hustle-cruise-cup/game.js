(() => {
  "use strict";

  const SAVE_KEY = "harbourHustleCruiseCup.v1";
  const SAVE_VERSION = 1;
  const CATEGORIES = ["hull", "engine", "deck", "gadget"];
  const CATEGORY_LABELS = {
    hull: "Hull",
    engine: "Engine",
    deck: "Deck",
    gadget: "Gadget"
  };
  const STAT_LABELS = {
    speed: "Speed",
    accel: "Kick",
    handling: "Handling",
    stability: "Stability",
    boost: "Boost",
    luck: "Luck"
  };
  const STAT_EMOJIS = {
    speed: "⚡",
    accel: "🚀",
    handling: "🎯",
    stability: "🛟",
    boost: "💨",
    luck: "🍀"
  };

  const PARTS = {
    hull: [
      {
        id: "hull_banana_pontoon",
        category: "hull",
        name: "Banana Pontoon",
        emoji: "🍌",
        rarity: "Starter",
        tier: 0,
        color: "#ffe66d",
        desc: "Slippery, cheerful, and somehow seaworthy.",
        stats: { speed: 1, accel: 2, handling: 3, stability: 2, boost: 1, luck: 1 }
      },
      {
        id: "hull_bubblegum_cat",
        category: "hull",
        name: "Bubblegum Catamaran",
        emoji: "🫧",
        rarity: "Common",
        tier: 1,
        color: "#ff7ab6",
        desc: "Twin hulls, candy finish, zero dignity.",
        stats: { speed: 2, accel: 3, handling: 4, stability: 2, boost: 1, luck: 1 }
      },
      {
        id: "hull_pelican_steel",
        category: "hull",
        name: "Steel Pelican Hull",
        emoji: "🪶",
        rarity: "Common",
        tier: 2,
        color: "#9ad4ff",
        desc: "Stable as a snack-hunting seabird.",
        stats: { speed: 3, accel: 1, handling: 2, stability: 5, boost: 1, luck: 0 }
      },
      {
        id: "hull_swan_royal",
        category: "hull",
        name: "Royal Swan Cruiser",
        emoji: "🦢",
        rarity: "Rare",
        tier: 3,
        color: "#f7f3ff",
        desc: "Graceful until the turbo horn goes off.",
        stats: { speed: 4, accel: 2, handling: 4, stability: 4, boost: 2, luck: 2 }
      },
      {
        id: "hull_meteor_trimaran",
        category: "hull",
        name: "Meteor Trimaran",
        emoji: "☄️",
        rarity: "Epic",
        tier: 4,
        color: "#ff9f1c",
        desc: "Three hulls and one worrying flame decal.",
        stats: { speed: 7, accel: 4, handling: 3, stability: 2, boost: 4, luck: 1 }
      },
      {
        id: "hull_rainbow_palace",
        category: "hull",
        name: "Rainbow Palace Liner",
        emoji: "🌈",
        rarity: "Legendary",
        tier: 6,
        color: "#b8f7ff",
        desc: "A floating resort that corners like a skateboard.",
        stats: { speed: 7, accel: 5, handling: 6, stability: 5, boost: 4, luck: 4 }
      }
    ],
    engine: [
      {
        id: "engine_kettle",
        category: "engine",
        name: "Sputtering Kettle",
        emoji: "🫖",
        rarity: "Starter",
        tier: 0,
        color: "#c7f9cc",
        desc: "Makes tea, makes steam, makes questionable noises.",
        stats: { speed: 1, accel: 2, handling: 0, stability: 1, boost: 1, luck: 1 }
      },
      {
        id: "engine_taffy_outboard",
        category: "engine",
        name: "Turbo Taffy Outboard",
        emoji: "🍬",
        rarity: "Common",
        tier: 1,
        color: "#ffcad4",
        desc: "Sticky acceleration with a strawberry aftertaste.",
        stats: { speed: 3, accel: 4, handling: 0, stability: 0, boost: 2, luck: 0 }
      },
      {
        id: "engine_solar_paddle",
        category: "engine",
        name: "Solar Paddle Wheel",
        emoji: "☀️",
        rarity: "Common",
        tier: 2,
        color: "#ffd166",
        desc: "Very eco. Very spinny. Very smug.",
        stats: { speed: 3, accel: 2, handling: 1, stability: 2, boost: 2, luck: 2 }
      },
      {
        id: "engine_thunder_funnel",
        category: "engine",
        name: "Thunder Funnel",
        emoji: "⛈️",
        rarity: "Rare",
        tier: 3,
        color: "#80ed99",
        desc: "Turns every straightaway into a weather warning.",
        stats: { speed: 5, accel: 5, handling: 0, stability: 1, boost: 4, luck: 1 }
      },
      {
        id: "engine_comet_jetwash",
        category: "engine",
        name: "Comet Jetwash",
        emoji: "🛸",
        rarity: "Epic",
        tier: 5,
        color: "#9b5de5",
        desc: "Technically a hairdryer stolen from a satellite.",
        stats: { speed: 8, accel: 6, handling: 0, stability: 0, boost: 5, luck: 1 }
      },
      {
        id: "engine_party_reactor",
        category: "engine",
        name: "Confetti Reactor",
        emoji: "🎉",
        rarity: "Legendary",
        tier: 6,
        color: "#f15bb5",
        desc: "Unsafe? No. Festive? Alarmingly.",
        stats: { speed: 8, accel: 7, handling: 2, stability: 1, boost: 7, luck: 3 }
      }
    ],
    deck: [
      {
        id: "deck_picnic",
        category: "deck",
        name: "Picnic Deck",
        emoji: "🧺",
        rarity: "Starter",
        tier: 0,
        color: "#fef3c7",
        desc: "Sandwich storage doubles as ballast.",
        stats: { speed: 0, accel: 1, handling: 1, stability: 2, boost: 0, luck: 3 }
      },
      {
        id: "deck_disco",
        category: "deck",
        name: "Mini Disco Deck",
        emoji: "🪩",
        rarity: "Common",
        tier: 1,
        color: "#c4b5fd",
        desc: "Every boost is legally a dance move.",
        stats: { speed: 1, accel: 1, handling: 2, stability: 1, boost: 3, luck: 2 }
      },
      {
        id: "deck_carousel",
        category: "deck",
        name: "Captain's Carousel",
        emoji: "🎠",
        rarity: "Rare",
        tier: 2,
        color: "#fdffb6",
        desc: "Improves morale and minor centrifugal weirdness.",
        stats: { speed: 1, accel: 2, handling: 4, stability: 2, boost: 2, luck: 3 }
      },
      {
        id: "deck_observation_bubble",
        category: "deck",
        name: "Observation Bubble",
        emoji: "🔭",
        rarity: "Rare",
        tier: 3,
        color: "#a0e7e5",
        desc: "Spot hazards before they spot you.",
        stats: { speed: 2, accel: 1, handling: 4, stability: 4, boost: 2, luck: 3 }
      },
      {
        id: "deck_waterpark",
        category: "deck",
        name: "Pocket Waterpark",
        emoji: "🛝",
        rarity: "Epic",
        tier: 4,
        color: "#90dbf4",
        desc: "Passengers scream. The boat goes faster. Coincidence?",
        stats: { speed: 4, accel: 3, handling: 3, stability: 3, boost: 4, luck: 3 }
      },
      {
        id: "deck_zeppelin_lounge",
        category: "deck",
        name: "Zeppelin Lounge",
        emoji: "🎈",
        rarity: "Legendary",
        tier: 6,
        color: "#ffc6ff",
        desc: "Lightens the ship and the entire mood.",
        stats: { speed: 5, accel: 4, handling: 5, stability: 3, boost: 5, luck: 5 }
      }
    ],
    gadget: [
      {
        id: "gadget_duck_charm",
        category: "gadget",
        name: "Rubber Duck Charm",
        emoji: "🐤",
        rarity: "Starter",
        tier: 0,
        color: "#ffd166",
        desc: "Squeaks at precisely the right moment.",
        stats: { speed: 0, accel: 0, handling: 1, stability: 1, boost: 1, luck: 4 }
      },
      {
        id: "gadget_wave_rudder",
        category: "gadget",
        name: "Wave-Tickler Rudder",
        emoji: "🪶",
        rarity: "Common",
        tier: 1,
        color: "#bde0fe",
        desc: "Turns choppy water into polite suggestions.",
        stats: { speed: 1, accel: 0, handling: 5, stability: 2, boost: 1, luck: 1 }
      },
      {
        id: "gadget_bubble_shield",
        category: "gadget",
        name: "Bubble Shield",
        emoji: "🫧",
        rarity: "Rare",
        tier: 2,
        color: "#caf0f8",
        desc: "Bounces off bad ideas and most crates.",
        stats: { speed: 0, accel: 1, handling: 2, stability: 6, boost: 2, luck: 2 }
      },
      {
        id: "gadget_banana_horn",
        category: "gadget",
        name: "Banana Boost Horn",
        emoji: "📯",
        rarity: "Rare",
        tier: 3,
        color: "#ffe66d",
        desc: "HONK means GO in several maritime dialects.",
        stats: { speed: 2, accel: 4, handling: 1, stability: 1, boost: 5, luck: 2 }
      },
      {
        id: "gadget_kraken_kite",
        category: "gadget",
        name: "Kraken Kite",
        emoji: "🪁",
        rarity: "Epic",
        tier: 5,
        color: "#c77dff",
        desc: "Harnesses eldritch tailwinds for family fun.",
        stats: { speed: 5, accel: 2, handling: 3, stability: 1, boost: 4, luck: 5 }
      },
      {
        id: "gadget_starboard_oracle",
        category: "gadget",
        name: "Starboard Oracle",
        emoji: "🔮",
        rarity: "Legendary",
        tier: 6,
        color: "#ffafcc",
        desc: "Predicts shortcuts, snacks, and dramatic finishes.",
        stats: { speed: 4, accel: 4, handling: 4, stability: 4, boost: 4, luck: 8 }
      }
    ]
  };

  const RACES = [
    {
      id: "lagoon_dash",
      name: "Lagoon Dash",
      blurb: "A fizzy starter sprint through friendly shallows and suspiciously smug buoys.",
      distance: 1320,
      difficulty: 1,
      requiredCups: 0,
      prizeCoins: 70,
      rep: 8,
      tier: 1,
      orb: "rgba(74,222,128,0.34)",
      theme: "sunny",
      hazards: "Buoys, duck coins, boost bottles"
    },
    {
      id: "pier_pressure",
      name: "Pier Pressure",
      blurb: "A boardwalk bash with crates, camera flashes, and exactly one overexcited gull.",
      distance: 1680,
      difficulty: 2,
      requiredCups: 1,
      prizeCoins: 95,
      rep: 11,
      tier: 2,
      orb: "rgba(255,159,28,0.34)",
      theme: "pier",
      hazards: "Crates, wakes, bonus coins"
    },
    {
      id: "moonlit_marina",
      name: "Moonlit Marina",
      blurb: "Glow-buoy slalom under a giant moon. Stylish captains get extra applause.",
      distance: 1960,
      difficulty: 3,
      requiredCups: 3,
      prizeCoins: 125,
      rep: 14,
      tier: 3,
      orb: "rgba(155,93,229,0.28)",
      theme: "night",
      hazards: "Glow buoys, whirlpools, boost stars"
    },
    {
      id: "stormy_strait",
      name: "Stormy Strait",
      blurb: "Big waves, loud clouds, tiny margin for error. Bring stability or bring snacks.",
      distance: 2260,
      difficulty: 4,
      requiredCups: 5,
      prizeCoins: 165,
      rep: 18,
      tier: 4,
      orb: "rgba(76,201,240,0.32)",
      theme: "storm",
      hazards: "Storm wakes, crates, lightning buoys"
    },
    {
      id: "royal_regatta",
      name: "Royal Regatta",
      blurb: "A fancy race where the champagne is sparkling water and the elbows are sharp.",
      distance: 2600,
      difficulty: 5,
      requiredCups: 8,
      prizeCoins: 210,
      rep: 23,
      tier: 5,
      orb: "rgba(255,95,162,0.28)",
      theme: "royal",
      hazards: "Swan buoys, paparazzi wakes, treasure ducks"
    },
    {
      id: "krakens_teacup",
      name: "Kraken's Teacup",
      blurb: "The championship finale: whirlpools, turbo lanes, and a sea monster judging your paintwork.",
      distance: 3050,
      difficulty: 6,
      requiredCups: 12,
      prizeCoins: 300,
      rep: 32,
      tier: 6,
      orb: "rgba(255,209,102,0.38)",
      theme: "kraken",
      hazards: "Whirlpools, mega crates, legendary loot"
    }
  ];

  const OPPONENT_NAMES = [
    "Commodore Cupcake",
    "Mabel the Barnacle",
    "Sir Splashes-a-Lot",
    "Turbo Tilda",
    "Captain Noodle",
    "The Buoy Wonder",
    "Foam Ranger",
    "Admiral Pickle"
  ];

  const $ = (selector) => document.querySelector(selector);
  const el = {
    captainName: $("#captainName"),
    coinsCount: $("#coinsCount"),
    trophyCount: $("#trophyCount"),
    repCount: $("#repCount"),
    unlockCount: $("#unlockCount"),
    partTabs: $("#partTabs"),
    partsList: $("#partsList"),
    raceCards: $("#raceCards"),
    scoreTable: $("#scoreTable"),
    previewCanvas: $("#previewCanvas"),
    gameCanvas: $("#gameCanvas"),
    shipStats: $("#shipStats"),
    raceDialog: $("#raceDialog"),
    resultDialog: $("#resultDialog"),
    resultCard: $("#resultCard"),
    raceTitle: $("#raceTitle"),
    raceHud: $("#raceHud"),
    startQuickRace: $("#startQuickRace"),
    paintButton: $("#paintButton"),
    resetSave: $("#resetSave"),
    clearScores: $("#clearScores"),
    importSave: $("#importSave"),
    exportSave: $("#exportSave"),
    quitRace: $("#quitRace"),
    emptyScoreTemplate: $("#emptyScoreTemplate")
  };

  const previewCtx = el.previewCanvas.getContext("2d");
  const ctx = el.gameCanvas.getContext("2d");

  const allParts = () => CATEGORIES.flatMap((cat) => PARTS[cat]);
  const findPart = (id) => allParts().find((part) => part.id === id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const nowStamp = () => new Date().toISOString();
  const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}.${String(Math.floor((seconds % 1) * 100)).padStart(2, "0")}`;
  const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);

  function mulberry32(seed) {
    return function random() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hashString(input) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createDefaultSave() {
    return {
      version: SAVE_VERSION,
      captain: "Captain 4D44",
      coins: 0,
      trophies: 0,
      rep: 0,
      paintHue: Math.floor(Math.random() * 360),
      unlocked: ["hull_banana_pontoon", "engine_kettle", "deck_picnic", "gadget_duck_charm"],
      equipped: {
        hull: "hull_banana_pontoon",
        engine: "engine_kettle",
        deck: "deck_picnic",
        gadget: "gadget_duck_charm"
      },
      highScores: [],
      raceHistory: {}
    };
  }

  let save = loadSave();
  let activeCategory = "hull";
  let previewBob = 0;
  let lastPreviewFrame = 0;
  let activeRace = null;
  let raceState = null;
  let animationFrame = 0;
  let lastRaceFrame = 0;

  const input = {
    up: false,
    down: false,
    boost: false,
    pointerActive: false,
    pointerY: null
  };

  function storageAvailable() {
    try {
      const test = "__cruise_test__";
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (error) {
      return false;
    }
  }

  function loadSave() {
    const fallback = createDefaultSave();
    if (!storageAvailable()) return fallback;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return migrateSave(parsed);
    } catch (error) {
      console.warn("Could not load save; starting fresh.", error);
      return fallback;
    }
  }

  function migrateSave(candidate) {
    const fresh = createDefaultSave();
    const merged = {
      ...fresh,
      ...candidate,
      equipped: { ...fresh.equipped, ...(candidate?.equipped || {}) },
      raceHistory: { ...fresh.raceHistory, ...(candidate?.raceHistory || {}) },
      highScores: Array.isArray(candidate?.highScores) ? candidate.highScores : [],
      unlocked: Array.isArray(candidate?.unlocked) ? candidate.unlocked : fresh.unlocked
    };

    CATEGORIES.forEach((category) => {
      const equippedId = merged.equipped[category];
      const starter = PARTS[category][0].id;
      if (!findPart(equippedId)) merged.equipped[category] = starter;
      if (!merged.unlocked.includes(merged.equipped[category])) merged.unlocked.push(merged.equipped[category]);
    });

    merged.unlocked = [...new Set(merged.unlocked.filter((id) => findPart(id)))];
    merged.version = SAVE_VERSION;
    merged.captain = String(merged.captain || fresh.captain).slice(0, 18);
    merged.coins = Math.max(0, Number(merged.coins) || 0);
    merged.trophies = Math.max(0, Number(merged.trophies) || 0);
    merged.rep = Math.max(0, Number(merged.rep) || 0);
    merged.paintHue = Number.isFinite(merged.paintHue) ? merged.paintHue : fresh.paintHue;
    return merged;
  }

  function persist() {
    if (!storageAvailable()) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }

  function getEquippedParts() {
    return CATEGORIES.map((category) => findPart(save.equipped[category])).filter(Boolean);
  }

  function calculateStats() {
    const totals = { speed: 2, accel: 2, handling: 2, stability: 2, boost: 2, luck: 1 };
    getEquippedParts().forEach((part) => {
      Object.entries(part.stats).forEach(([stat, value]) => {
        totals[stat] += value;
      });
    });
    return totals;
  }

  function maxStatValue() {
    const totals = { speed: 2, accel: 2, handling: 2, stability: 2, boost: 2, luck: 1 };
    CATEGORIES.forEach((category) => {
      Object.keys(totals).forEach((stat) => {
        totals[stat] += Math.max(...PARTS[category].map((part) => part.stats[stat] || 0));
      });
    });
    return totals;
  }

  const statCaps = maxStatValue();

  function derivePhysics(stats, race) {
    return {
      maxSpeed: 56 + stats.speed * 5.6 + stats.boost * 1.1,
      accel: 1.8 + stats.accel * 0.42,
      handling: 235 + stats.handling * 33,
      stability: clamp(0.48 + stats.stability * 0.045, 0.48, 0.92),
      boostPower: 18 + stats.boost * 2.3,
      boostCapacity: 72 + stats.boost * 8,
      boostRegen: 4.6 + stats.luck * 0.35,
      coinBonus: Math.floor(stats.luck * 0.55),
      hazardGrace: Math.max(0.22, 0.82 - stats.stability * 0.024 - race.difficulty * 0.015)
    };
  }

  function rarityClass(rarity) {
    return `rarity-${rarity.toLowerCase()}`;
  }

  function init() {
    buildTabs();
    bindEvents();
    renderAll();
    requestAnimationFrame(drawPreviewLoop);
  }

  function buildTabs() {
    el.partTabs.innerHTML = "";
    CATEGORIES.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = CATEGORY_LABELS[category];
      button.setAttribute("role", "tab");
      button.dataset.category = category;
      button.addEventListener("click", () => {
        activeCategory = category;
        renderParts();
      });
      el.partTabs.append(button);
    });
  }

  function bindEvents() {
    el.captainName.addEventListener("input", () => {
      save.captain = el.captainName.value.trim() || "Mystery Captain";
      persist();
      renderScores();
    });

    el.startQuickRace.addEventListener("click", () => {
      const unlockedRaces = RACES.filter((race) => save.trophies >= race.requiredCups);
      const race = unlockedRaces[unlockedRaces.length - 1] || RACES[0];
      startRace(race.id);
    });

    el.paintButton.addEventListener("click", () => {
      save.paintHue = (save.paintHue + 47 + Math.floor(Math.random() * 58)) % 360;
      persist();
      drawPreview(performance.now());
    });

    el.resetSave.addEventListener("click", () => {
      const confirmed = window.confirm("Reset your boat, unlocks, coins, and scores on this browser?");
      if (!confirmed) return;
      save = createDefaultSave();
      persist();
      renderAll();
    });

    el.clearScores.addEventListener("click", () => {
      const confirmed = window.confirm("Clear only the high-score table? Your boat upgrades stay safe.");
      if (!confirmed) return;
      save.highScores = [];
      persist();
      renderScores();
    });

    el.exportSave.addEventListener("click", async () => {
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(save))));
      try {
        await navigator.clipboard.writeText(encoded);
        toast("Save code copied to clipboard!");
      } catch (error) {
        window.prompt("Copy this save code:", encoded);
      }
    });

    el.importSave.addEventListener("click", () => {
      const code = window.prompt("Paste your Harbour Hustle save code:");
      if (!code) return;
      try {
        const parsed = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
        save = migrateSave(parsed);
        persist();
        renderAll();
        toast("Save imported. Welcome back aboard!");
      } catch (error) {
        window.alert("That save code did not load. Check the copied text and try again.");
      }
    });

    el.quitRace.addEventListener("click", () => {
      const confirmed = window.confirm("Quit this race and limp back to dock?");
      if (!confirmed) return;
      stopRaceLoop();
      closeDialog(el.raceDialog);
      activeRace = null;
      raceState = null;
    });

    el.raceDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      el.quitRace.click();
    });

    document.addEventListener("keydown", (event) => {
      if (!raceState) return;
      const key = event.key.toLowerCase();
      if (["arrowup", "w"].includes(key)) input.up = true;
      if (["arrowdown", "s"].includes(key)) input.down = true;
      if ([" ", "spacebar"].includes(event.key.toLowerCase()) || event.code === "Space") {
        input.boost = true;
        event.preventDefault();
      }
    });

    document.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "w"].includes(key)) input.up = false;
      if (["arrowdown", "s"].includes(key)) input.down = false;
      if ([" ", "spacebar"].includes(event.key.toLowerCase()) || event.code === "Space") input.boost = false;
    });

    document.querySelectorAll("[data-control]").forEach((button) => {
      const control = button.dataset.control;
      const press = (event) => {
        event.preventDefault();
        input[control] = true;
      };
      const release = (event) => {
        event.preventDefault();
        input[control] = false;
      };
      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("pointerleave", release);
    });

    el.gameCanvas.addEventListener("pointerdown", (event) => {
      if (!raceState) return;
      input.pointerActive = true;
      input.pointerY = canvasPointerY(event);
      el.gameCanvas.setPointerCapture?.(event.pointerId);
    });
    el.gameCanvas.addEventListener("pointermove", (event) => {
      if (!raceState || !input.pointerActive) return;
      input.pointerY = canvasPointerY(event);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
      el.gameCanvas.addEventListener(type, () => {
        input.pointerActive = false;
        input.pointerY = null;
      });
    });
  }

  function canvasPointerY(event) {
    const rect = el.gameCanvas.getBoundingClientRect();
    const scale = el.gameCanvas.height / rect.height;
    return (event.clientY - rect.top) * scale;
  }

  function renderAll() {
    el.captainName.value = save.captain;
    renderHeaderStats();
    renderParts();
    renderRaceCards();
    renderScores();
    renderStats();
    drawPreview(performance.now());
  }

  function renderHeaderStats() {
    el.coinsCount.textContent = String(save.coins);
    el.trophyCount.textContent = String(save.trophies);
    el.repCount.textContent = String(save.rep);
    el.unlockCount.textContent = `${save.unlocked.length}/${allParts().length} parts`;
  }

  function renderStats() {
    const stats = calculateStats();
    const fragment = document.createDocumentFragment();
    Object.entries(STAT_LABELS).forEach(([stat, label]) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      const fill = clamp((stats[stat] / statCaps[stat]) * 100, 5, 100);
      card.innerHTML = `
        <span><b>${STAT_EMOJIS[stat]} ${label}</b><strong>${stats[stat]}</strong></span>
        <div class="meter" aria-hidden="true"><i style="--fill:${fill}%"></i></div>
      `;
      fragment.append(card);
    });
    el.shipStats.replaceChildren(fragment);
  }

  function renderParts() {
    el.partTabs.querySelectorAll("button").forEach((button) => {
      const active = button.dataset.category === activeCategory;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    const fragment = document.createDocumentFragment();
    PARTS[activeCategory].forEach((part) => {
      const unlocked = save.unlocked.includes(part.id);
      const equipped = save.equipped[activeCategory] === part.id;
      const card = document.createElement("article");
      card.className = `part-card ${unlocked ? "" : "locked"} ${equipped ? "equipped" : ""}`;
      card.style.setProperty("--part-color", part.color);
      const statTags = Object.entries(part.stats)
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([stat, value]) => `<span class="tag">${STAT_EMOJIS[stat]} +${value}</span>`)
        .join("");
      card.innerHTML = `
        <div class="part-icon" aria-hidden="true">${part.emoji}</div>
        <div class="part-meta">
          <h3>${part.name}</h3>
          <p>${unlocked ? part.desc : "Win more races to discover this mystery part."}</p>
          <div class="part-tags">
            <span class="tag ${rarityClass(part.rarity)}">${part.rarity}</span>
            <span class="tag">Tier ${part.tier}</span>
            ${unlocked ? statTags : "<span class=\"tag\">Locked</span>"}
          </div>
        </div>
      `;
      const button = document.createElement("button");
      button.type = "button";
      button.className = equipped ? "primary-button small" : "ghost-button small";
      button.textContent = equipped ? "Equipped" : unlocked ? "Equip" : "Locked";
      button.disabled = !unlocked || equipped;
      button.addEventListener("click", () => {
        save.equipped[activeCategory] = part.id;
        persist();
        renderHeaderStats();
        renderParts();
        renderStats();
        drawPreview(performance.now());
      });
      card.append(button);
      fragment.append(card);
    });
    el.partsList.replaceChildren(fragment);
    renderHeaderStats();
  }

  function renderRaceCards() {
    const fragment = document.createDocumentFragment();
    RACES.forEach((race) => {
      const unlocked = save.trophies >= race.requiredCups;
      const best = save.raceHistory[race.id]?.bestTime;
      const card = document.createElement("article");
      card.className = `race-card ${unlocked ? "" : "locked"}`;
      card.style.setProperty("--race-orb", race.orb);
      card.innerHTML = `
        <h3>${race.name}</h3>
        <p>${race.blurb}</p>
        <div class="race-facts">
          <span class="tag">${Math.round(race.distance)}m</span>
          <span class="tag">Difficulty ${race.difficulty}</span>
          <span class="tag">Prize 🪙${race.prizeCoins}</span>
          <span class="tag">${best ? `Best ${formatTime(best)}` : "No best yet"}</span>
        </div>
        <p><strong>Course:</strong> ${race.hazards}</p>
      `;
      const button = document.createElement("button");
      button.type = "button";
      button.className = unlocked ? "primary-button" : "ghost-button";
      button.textContent = unlocked ? "Enter Race" : `Needs ${race.requiredCups} cups`;
      button.disabled = !unlocked;
      button.addEventListener("click", () => startRace(race.id));
      card.append(button);
      fragment.append(card);
    });
    el.raceCards.replaceChildren(fragment);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function renderScores() {
    const scores = [...save.highScores]
      .sort((a, b) => b.score - a.score || a.time - b.time)
      .slice(0, 12);

    if (!scores.length) {
      el.scoreTable.replaceChildren(el.emptyScoreTemplate.content.cloneNode(true));
      return;
    }

    const fragment = document.createDocumentFragment();
    scores.forEach((score, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${escapeHtml(score.raceName)}</td>
        <td>${escapeHtml(score.captain)}</td>
        <td>${ordinal(score.place)}</td>
        <td>${formatTime(score.time)}</td>
        <td>${score.score.toLocaleString()}</td>
      `;
      fragment.append(row);
    });
    el.scoreTable.replaceChildren(fragment);
  }

  function ordinal(number) {
    const suffixes = ["th", "st", "nd", "rd"];
    const value = number % 100;
    return `${number}${suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]}`;
  }

  function drawPreviewLoop(timestamp) {
    const dt = Math.min(0.05, (timestamp - lastPreviewFrame) / 1000 || 0.016);
    lastPreviewFrame = timestamp;
    previewBob += dt;
    drawPreview(timestamp);
    requestAnimationFrame(drawPreviewLoop);
  }

  function drawPreview(timestamp) {
    const canvas = el.previewCanvas;
    const width = canvas.width;
    const height = canvas.height;
    const t = timestamp / 1000;
    previewCtx.clearRect(0, 0, width, height);

    const sky = previewCtx.createLinearGradient(0, 0, 0, height * 0.62);
    sky.addColorStop(0, "#8be9ff");
    sky.addColorStop(1, "#e9fbff");
    previewCtx.fillStyle = sky;
    previewCtx.fillRect(0, 0, width, height);
    drawSun(previewCtx, width - 92, 74, 42);
    drawCloud(previewCtx, 82 + Math.sin(t * 0.35) * 8, 66, 0.9);
    drawCloud(previewCtx, width - 240 + Math.cos(t * 0.27) * 9, 110, 0.68);

    previewCtx.fillStyle = "#24bde8";
    previewCtx.fillRect(0, height * 0.58, width, height * 0.42);
    drawWater(previewCtx, width, height, t, height * 0.61);

    const parts = getEquippedParts();
    const bob = Math.sin(t * 2.4) * 7;
    drawBoat(previewCtx, width * 0.5, height * 0.58 + bob, 1.24, {
      parts,
      hue: save.paintHue,
      boost: 0,
      tilt: Math.sin(t * 1.8) * 0.025,
      captain: save.captain
    });

    previewCtx.fillStyle = "rgba(255,255,255,0.82)";
    previewCtx.strokeStyle = "rgba(17,49,79,0.16)";
    roundedRect(previewCtx, 28, height - 68, width - 56, 44, 18, true, true);
    previewCtx.fillStyle = "#11314f";
    previewCtx.font = "900 20px ui-rounded, system-ui, sans-serif";
    previewCtx.fillText(shipName(), 48, height - 39);
  }

  function shipName() {
    const hull = findPart(save.equipped.hull)?.name || "Boat";
    return `${save.captain}'s ${hull}`.slice(0, 54);
  }

  function drawSun(drawCtx, x, y, radius) {
    drawCtx.save();
    drawCtx.translate(x, y);
    drawCtx.rotate(0.2);
    drawCtx.fillStyle = "rgba(255, 209, 102, 0.35)";
    for (let i = 0; i < 12; i += 1) {
      drawCtx.rotate(Math.PI / 6);
      roundedRect(drawCtx, -5, -radius - 20, 10, 26, 5, true, false);
    }
    drawCtx.fillStyle = "#ffd166";
    drawCtx.beginPath();
    drawCtx.arc(0, 0, radius, 0, Math.PI * 2);
    drawCtx.fill();
    drawCtx.restore();
  }

  function drawCloud(drawCtx, x, y, scale = 1) {
    drawCtx.save();
    drawCtx.translate(x, y);
    drawCtx.scale(scale, scale);
    drawCtx.fillStyle = "rgba(255,255,255,0.9)";
    drawCtx.beginPath();
    drawCtx.ellipse(0, 24, 58, 28, 0, 0, Math.PI * 2);
    drawCtx.ellipse(42, 18, 48, 30, 0, 0, Math.PI * 2);
    drawCtx.ellipse(-42, 16, 40, 24, 0, 0, Math.PI * 2);
    drawCtx.ellipse(6, 0, 42, 38, 0, 0, Math.PI * 2);
    drawCtx.fill();
    drawCtx.restore();
  }

  function drawWater(drawCtx, width, height, t, yStart = 0) {
    drawCtx.save();
    for (let y = yStart; y < height + 26; y += 34) {
      drawCtx.strokeStyle = `rgba(255,255,255,${0.28 + ((y / 34) % 2) * 0.08})`;
      drawCtx.lineWidth = 4;
      drawCtx.beginPath();
      for (let x = -40; x < width + 50; x += 18) {
        const wave = Math.sin(x * 0.035 + y * 0.04 + t * 2.1) * 7;
        if (x === -40) drawCtx.moveTo(x, y + wave);
        else drawCtx.lineTo(x, y + wave);
      }
      drawCtx.stroke();
    }
    drawCtx.restore();
  }

  function drawBoat(drawCtx, x, y, scale, options) {
    const parts = options.parts || getEquippedParts();
    const hull = parts.find((part) => part.category === "hull") || PARTS.hull[0];
    const engine = parts.find((part) => part.category === "engine") || PARTS.engine[0];
    const deck = parts.find((part) => part.category === "deck") || PARTS.deck[0];
    const gadget = parts.find((part) => part.category === "gadget") || PARTS.gadget[0];
    const boost = options.boost || 0;
    const tilt = options.tilt || 0;
    const paint = `hsl(${options.hue ?? save.paintHue} 95% 62%)`;
    const hullColor = hull.color || paint;
    const deckColor = deck.color || "#fff";

    drawCtx.save();
    drawCtx.translate(x, y);
    drawCtx.rotate(tilt);
    drawCtx.scale(scale, scale);

    drawCtx.fillStyle = `rgba(255,255,255,${0.45 + boost * 0.2})`;
    drawCtx.beginPath();
    drawCtx.ellipse(-74, 38, 76 + boost * 40, 13, 0, 0, Math.PI * 2);
    drawCtx.fill();

    drawCtx.fillStyle = "rgba(17,49,79,0.18)";
    drawCtx.beginPath();
    drawCtx.ellipse(0, 56, 126, 18, 0, 0, Math.PI * 2);
    drawCtx.fill();

    drawCtx.fillStyle = hullColor;
    drawCtx.strokeStyle = "#11314f";
    drawCtx.lineWidth = 7;
    drawCtx.beginPath();
    drawCtx.moveTo(-130, 0);
    drawCtx.quadraticCurveTo(-96, 66, -12, 70);
    drawCtx.lineTo(78, 64);
    drawCtx.quadraticCurveTo(126, 42, 145, -3);
    drawCtx.quadraticCurveTo(62, 20, -130, 0);
    drawCtx.closePath();
    drawCtx.fill();
    drawCtx.stroke();

    drawCtx.fillStyle = "rgba(255,255,255,0.4)";
    drawCtx.beginPath();
    drawCtx.moveTo(-94, 10);
    drawCtx.quadraticCurveTo(-20, 30, 92, 12);
    drawCtx.lineWidth = 5;
    drawCtx.strokeStyle = "rgba(255,255,255,0.62)";
    drawCtx.stroke();

    drawCtx.fillStyle = deckColor;
    drawCtx.strokeStyle = "#11314f";
    drawCtx.lineWidth = 6;
    roundedRect(drawCtx, -58, -48, 116, 54, 18, true, true);
    drawCtx.fillStyle = "rgba(255,255,255,0.68)";
    for (let i = -38; i <= 38; i += 38) {
      roundedRect(drawCtx, i, -34, 24, 22, 8, true, true);
    }

    drawCtx.fillStyle = engine.color;
    drawCtx.strokeStyle = "#11314f";
    drawCtx.lineWidth = 5;
    roundedRect(drawCtx, -88, -65, 34, 44, 10, true, true);
    drawCtx.fillStyle = boost > 0 ? "#ff9f1c" : "rgba(255,255,255,0.75)";
    drawCtx.beginPath();
    drawCtx.arc(-71, -75, 10 + boost * 6, 0, Math.PI * 2);
    drawCtx.fill();

    drawCtx.fillStyle = gadget.color;
    drawCtx.strokeStyle = "#11314f";
    drawCtx.lineWidth = 4;
    drawCtx.beginPath();
    drawCtx.arc(82, -20, 18, 0, Math.PI * 2);
    drawCtx.fill();
    drawCtx.stroke();
    drawCtx.font = "900 21px system-ui";
    drawCtx.textAlign = "center";
    drawCtx.textBaseline = "middle";
    drawCtx.fillText(gadget.emoji, 82, -20);

    drawCtx.fillStyle = "#11314f";
    drawCtx.font = "900 14px ui-rounded, system-ui, sans-serif";
    drawCtx.textAlign = "center";
    drawCtx.fillText(deck.emoji, 0, -52);

    drawCtx.fillStyle = paint;
    drawCtx.globalAlpha = 0.8;
    drawCtx.beginPath();
    drawCtx.moveTo(28, -53);
    drawCtx.lineTo(80, -92);
    drawCtx.lineTo(70, -44);
    drawCtx.closePath();
    drawCtx.fill();
    drawCtx.globalAlpha = 1;

    drawCtx.restore();
  }

  function roundedRect(drawCtx, x, y, width, height, radius, fill, stroke) {
    const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
    drawCtx.beginPath();
    drawCtx.moveTo(x + r, y);
    drawCtx.arcTo(x + width, y, x + width, y + height, r);
    drawCtx.arcTo(x + width, y + height, x, y + height, r);
    drawCtx.arcTo(x, y + height, x, y, r);
    drawCtx.arcTo(x, y, x + width, y, r);
    drawCtx.closePath();
    if (fill) drawCtx.fill();
    if (stroke) drawCtx.stroke();
  }

  function startRace(raceId) {
    const race = RACES.find((item) => item.id === raceId) || RACES[0];
    if (save.trophies < race.requiredCups) return;
    activeRace = race;
    raceState = createRaceState(race);
    input.up = input.down = input.boost = false;
    input.pointerActive = false;
    input.pointerY = null;
    el.raceTitle.textContent = race.name;
    updateHud();
    showDialog(el.raceDialog);
    lastRaceFrame = performance.now();
    animationFrame = requestAnimationFrame(raceLoop);
  }

  function showDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function createRaceState(race) {
    const stats = calculateStats();
    const physics = derivePhysics(stats, race);
    const seed = hashString(`${race.id}:${save.trophies}:${save.rep}:${Date.now()}:${Math.random()}`);
    const rng = mulberry32(seed);
    const opponentCount = 3;
    const opponents = Array.from({ length: opponentCount }, (_, index) => {
      const spread = 0.965 + index * 0.025 + rng() * 0.045 + race.difficulty * 0.008;
      return {
        name: OPPONENT_NAMES[Math.floor(rng() * OPPONENT_NAMES.length)],
        color: `hsl(${Math.floor(rng() * 360)} 88% 62%)`,
        y: 145 + index * 120 + rng() * 28,
        distance: -index * 24,
        speed: physics.maxSpeed * (0.88 + rng() * 0.08),
        pace: physics.maxSpeed * spread,
        wobble: rng() * Math.PI * 2,
        finishedAt: null
      };
    });

    return {
      race,
      stats,
      physics,
      rng,
      time: 0,
      player: {
        x: 208,
        y: el.gameCanvas.height / 2,
        distance: 0,
        speed: 0,
        boost: physics.boostCapacity * 0.62,
        coins: 0,
        hearts: 3,
        penalty: 1,
        invulnerable: 0,
        wobble: 0,
        finishedAt: null
      },
      opponents,
      obstacles: generateCourse(race, rng),
      messages: [{ text: "GO!", life: 1.4, y: 160, color: "#ffd166" }],
      particles: [],
      cameraShake: 0,
      finishHandled: false,
      place: 4,
      score: 0,
      reward: null
    };
  }

  function generateCourse(race, rng) {
    const obstacles = [];
    const hazardRate = 124 - race.difficulty * 7;
    let d = 180;
    while (d < race.distance - 120) {
      d += hazardRate + rng() * (88 - race.difficulty * 5);
      const roll = rng();
      let type = "buoy";
      if (roll < 0.18) type = "boost";
      else if (roll < 0.34) type = "coin";
      else if (roll < 0.50 && race.difficulty >= 2) type = "crate";
      else if (roll < 0.68 && race.difficulty >= 3) type = "whirlpool";
      else if (roll < 0.86) type = "wake";
      const y = 96 + rng() * (el.gameCanvas.height - 210);
      obstacles.push({
        id: `${type}-${Math.round(d)}-${Math.round(y)}`,
        type,
        d,
        y,
        wobble: rng() * Math.PI * 2,
        hit: false
      });

      if (race.difficulty >= 3 && rng() < 0.18) {
        obstacles.push({
          id: `bonus-${Math.round(d + 42)}-${Math.round(y)}`,
          type: rng() > 0.45 ? "boost" : "coin",
          d: d + 42 + rng() * 58,
          y: clamp(y + (rng() - 0.5) * 150, 88, el.gameCanvas.height - 96),
          wobble: rng() * Math.PI * 2,
          hit: false
        });
      }
    }
    obstacles.push({ id: "final-boost", type: "boost", d: race.distance - 260, y: el.gameCanvas.height * 0.5, wobble: 0, hit: false });
    return obstacles;
  }

  function raceLoop(timestamp) {
    if (!raceState) return;
    const dt = Math.min(0.033, Math.max(0.001, (timestamp - lastRaceFrame) / 1000));
    lastRaceFrame = timestamp;
    updateRace(dt);
    drawRace(timestamp / 1000);
    if (raceState && !raceState.finishHandled) {
      animationFrame = requestAnimationFrame(raceLoop);
    }
  }

  function stopRaceLoop() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function updateRace(dt) {
    const state = raceState;
    const { race, player, physics } = state;
    state.time += dt;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.penalty = lerp(player.penalty, 1, dt * 1.6);
    player.wobble = lerp(player.wobble, 0, dt * 3.5);
    state.cameraShake = Math.max(0, state.cameraShake - dt * 22);

    let steer = 0;
    if (input.up) steer -= 1;
    if (input.down) steer += 1;
    if (input.pointerActive && Number.isFinite(input.pointerY)) {
      const delta = input.pointerY - player.y;
      steer += clamp(delta / 82, -1, 1);
    }

    player.y = clamp(player.y + steer * physics.handling * dt, 82, el.gameCanvas.height - 82);

    const boosting = input.boost && player.boost > 0;
    const boostAmount = boosting ? physics.boostPower : 0;
    if (boosting) {
      player.boost = Math.max(0, player.boost - (28 + race.difficulty * 2.5) * dt);
      addWakeParticles(player.x - 70, player.y + 30, 2, true);
    } else {
      player.boost = Math.min(physics.boostCapacity, player.boost + physics.boostRegen * dt);
    }

    const heartPenalty = player.hearts <= 0 ? 0.74 : 1;
    const targetSpeed = (physics.maxSpeed + boostAmount) * player.penalty * heartPenalty;
    player.speed = lerp(player.speed, targetSpeed, clamp(physics.accel * dt, 0.02, 0.22));
    player.distance += player.speed * dt;

    updateOpponents(dt);
    updateObstacles(dt);
    updateMessages(dt);
    updateParticles(dt);
    updateHud();

    if (player.distance >= race.distance && !state.finishHandled) {
      player.finishedAt = state.time;
      finishRace();
    }
  }

  function updateOpponents(dt) {
    const state = raceState;
    const { race, opponents } = state;
    opponents.forEach((opponent, index) => {
      if (opponent.finishedAt) return;
      opponent.wobble += dt * (1.1 + index * 0.2);
      const surge = Math.sin(state.time * 0.72 + opponent.wobble) * (2.4 + race.difficulty * 0.45);
      opponent.speed = lerp(opponent.speed, opponent.pace + surge, dt * 0.85);
      if (state.rng() < 0.0028 * race.difficulty) opponent.speed *= 0.88;
      opponent.distance += opponent.speed * dt;
      if (opponent.distance >= race.distance) opponent.finishedAt = state.time;
    });
  }

  function updateObstacles(dt) {
    const state = raceState;
    const { player, physics, race } = state;
    const scale = screenScale();
    state.obstacles.forEach((obstacle) => {
      if (obstacle.hit) return;
      obstacle.wobble += dt * 2;
      const screenX = player.x + (obstacle.d - player.distance) * scale;
      if (screenX < -90 || screenX > el.gameCanvas.width + 180) return;
      const distanceX = Math.abs(screenX - player.x);
      const distanceY = Math.abs(obstacle.y - player.y);
      const radius = obstacleRadius(obstacle.type);
      if (distanceX < radius.x && distanceY < radius.y) {
        obstacle.hit = true;
        handleObstacle(obstacle);
      }
    });
  }

  function handleObstacle(obstacle) {
    const state = raceState;
    const { player, physics, race } = state;
    const luckBonus = Math.floor(state.stats.luck / 4);
    if (obstacle.type === "coin") {
      const amount = 8 + race.difficulty * 2 + physics.coinBonus + luckBonus;
      player.coins += amount;
      addMessage(`+${amount} coins`, player.y - 55, "#ffd166");
      burst(player.x + 34, player.y, "#ffd166", 12);
      return;
    }
    if (obstacle.type === "boost") {
      const amount = 34 + state.stats.boost * 1.4;
      player.boost = Math.min(physics.boostCapacity, player.boost + amount);
      addMessage("Turbo top-up!", player.y - 55, "#4ade80");
      burst(player.x + 34, player.y, "#4ade80", 16);
      return;
    }

    if (player.invulnerable > 0) return;
    let penalty = 0.72;
    let heartLoss = 0;
    let message = "Bonk!";
    let color = "#ff4d6d";
    if (obstacle.type === "wake") {
      penalty = 0.82;
      heartLoss = race.difficulty >= 5 ? 1 : 0;
      message = "Wobble wake!";
      color = "#ffffff";
    } else if (obstacle.type === "crate") {
      penalty = 0.58;
      heartLoss = 1;
      message = "Crate crunch!";
    } else if (obstacle.type === "whirlpool") {
      penalty = 0.64;
      heartLoss = 1;
      message = "Whirlpool wiggle!";
      color = "#9b5de5";
    } else if (obstacle.type === "buoy") {
      penalty = 0.68;
      heartLoss = race.difficulty >= 4 ? 1 : 0;
      message = "Buoy bop!";
    }

    const resistedPenalty = lerp(penalty, 1, physics.stability);
    player.penalty = Math.min(player.penalty, resistedPenalty);
    player.wobble = (Math.random() - 0.5) * 0.35;
    player.invulnerable = 0.72;
    state.cameraShake = 8 + race.difficulty * 1.5;
    if (heartLoss && Math.random() > physics.stability * 0.65) {
      player.hearts = Math.max(0, player.hearts - heartLoss);
    } else if (heartLoss) {
      message = "Shielded!";
      color = "#4ade80";
    }
    addMessage(message, player.y - 58, color);
    burst(player.x + 8, player.y + 6, color, 14);
  }

  function obstacleRadius(type) {
    if (type === "wake") return { x: 64, y: 34 };
    if (type === "whirlpool") return { x: 50, y: 50 };
    if (type === "crate") return { x: 48, y: 44 };
    if (type === "coin" || type === "boost") return { x: 44, y: 44 };
    return { x: 46, y: 44 };
  }

  function screenScale() {
    return 0.52;
  }

  function updateMessages(dt) {
    const state = raceState;
    state.messages = state.messages
      .map((message) => ({ ...message, life: message.life - dt, y: message.y - dt * 30 }))
      .filter((message) => message.life > 0);
  }

  function addMessage(text, y, color = "#fff") {
    raceState.messages.push({ text, life: 1.25, y, color });
  }

  function updateParticles(dt) {
    const state = raceState;
    state.particles = state.particles
      .map((particle) => ({
        ...particle,
        x: particle.x + particle.vx * dt,
        y: particle.y + particle.vy * dt,
        life: particle.life - dt,
        size: particle.size * (1 + dt * 0.8)
      }))
      .filter((particle) => particle.life > 0);
    if (Math.random() < 0.6) addWakeParticles(state.player.x - 72, state.player.y + 34, 1, false);
  }

  function addWakeParticles(x, y, count, boosted) {
    if (!raceState) return;
    for (let i = 0; i < count; i += 1) {
      raceState.particles.push({
        x: x + Math.random() * 14,
        y: y + (Math.random() - 0.5) * 18,
        vx: -120 - Math.random() * (boosted ? 140 : 60),
        vy: (Math.random() - 0.5) * 45,
        life: boosted ? 0.58 : 0.42,
        size: boosted ? 8 + Math.random() * 8 : 5 + Math.random() * 6,
        color: boosted ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.62)"
      });
    }
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 150;
      raceState.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.48 + Math.random() * 0.28,
        size: 5 + Math.random() * 7,
        color
      });
    }
  }

  function updateHud() {
    if (!raceState) return;
    const { race, player, physics } = raceState;
    const place = currentPlace();
    raceState.place = place;
    const progress = clamp((player.distance / race.distance) * 100, 0, 100);
    const boost = clamp((player.boost / physics.boostCapacity) * 100, 0, 100);
    el.raceHud.innerHTML = `
      <span class="hud-pill">${ordinal(place)}</span>
      <span class="hud-pill">${formatTime(raceState.time)}</span>
      <span class="hud-pill">${Math.round(progress)}%</span>
      <span class="hud-pill">💨 ${Math.round(boost)}%</span>
      <span class="hud-pill">${"❤️".repeat(player.hearts)}${"🖤".repeat(3 - player.hearts)}</span>
    `;
  }

  function currentPlace() {
    const state = raceState;
    if (!state) return 1;
    const playerDistance = state.player.distance;
    return 1 + state.opponents.filter((opponent) => opponent.distance > playerDistance).length;
  }

  function drawRace(t) {
    const state = raceState;
    const { race, player } = state;
    const width = el.gameCanvas.width;
    const height = el.gameCanvas.height;
    const shakeX = (Math.random() - 0.5) * state.cameraShake;
    const shakeY = (Math.random() - 0.5) * state.cameraShake;

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.translate(shakeX, shakeY);
    drawRaceBackground(race, t, width, height);
    drawCourseMarkers(race, player, width, height);
    drawObstacles(t);
    drawOpponents(t);
    drawParticles();

    const boostRatio = input.boost ? 1 : 0;
    const flicker = player.invulnerable > 0 && Math.floor(t * 14) % 2 === 0;
    if (!flicker) {
      drawBoat(ctx, player.x, player.y + Math.sin(t * 6) * 3, 0.58, {
        parts: getEquippedParts(),
        hue: save.paintHue,
        boost: boostRatio,
        tilt: player.wobble + (input.down ? 0.06 : input.up ? -0.06 : 0)
      });
    }
    drawRaceOverlay(t);
    ctx.restore();
  }

  function drawRaceBackground(race, t, width, height) {
    let skyTop = "#8be9ff";
    let skyBottom = "#e8fbff";
    let seaTop = "#2cc6f0";
    let seaBottom = "#087ab6";
    if (race.theme === "night") {
      skyTop = "#23235f";
      skyBottom = "#5a4fcf";
      seaTop = "#304bc1";
      seaBottom = "#121f7a";
    } else if (race.theme === "storm") {
      skyTop = "#53677d";
      skyBottom = "#94a3b8";
      seaTop = "#25a4c8";
      seaBottom = "#0f5d7d";
    } else if (race.theme === "royal") {
      skyTop = "#ffc6ff";
      skyBottom = "#bde0fe";
      seaTop = "#3cc4ef";
      seaBottom = "#2a9fd6";
    } else if (race.theme === "kraken") {
      skyTop = "#4c1d95";
      skyBottom = "#2563eb";
      seaTop = "#15b8a6";
      seaBottom = "#115e59";
    }

    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.36);
    sky.addColorStop(0, skyTop);
    sky.addColorStop(1, skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height * 0.36);

    if (race.theme === "night" || race.theme === "kraken") {
      ctx.fillStyle = "rgba(255,255,255,0.86)";
      ctx.beginPath();
      ctx.arc(width - 120, 82, 36, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 36; i += 1) {
        ctx.globalAlpha = 0.45 + Math.sin(t * 2 + i) * 0.25;
        ctx.fillRect((i * 97) % width, 20 + (i * 31) % 128, 3, 3);
      }
      ctx.globalAlpha = 1;
    } else {
      drawSun(ctx, width - 92, 78, 34);
      drawCloud(ctx, 120 + Math.sin(t * 0.3) * 16, 76, 0.62);
      drawCloud(ctx, 390 + Math.cos(t * 0.2) * 20, 112, 0.48);
    }

    const sea = ctx.createLinearGradient(0, height * 0.28, 0, height);
    sea.addColorStop(0, seaTop);
    sea.addColorStop(1, seaBottom);
    ctx.fillStyle = sea;
    ctx.fillRect(0, height * 0.28, width, height);
    drawWater(ctx, width, height, t + raceState.player.distance * 0.015, height * 0.32);

    if (race.theme === "pier") drawPier(t, width, height);
    if (race.theme === "kraken") drawKraken(t, width, height);
  }

  function drawPier(t, width, height) {
    ctx.fillStyle = "rgba(91, 57, 33, 0.72)";
    ctx.fillRect(0, 144, width, 20);
    for (let x = -40 + ((t * 80) % 100); x < width + 40; x += 100) {
      ctx.fillRect(x, 144, 16, 96);
    }
  }

  function drawKraken(t, width, height) {
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = "#39105c";
    ctx.lineWidth = 18;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      const baseX = width - 180 + i * 42;
      ctx.moveTo(baseX, height + 40);
      ctx.bezierCurveTo(baseX - 70, height - 80, baseX + Math.sin(t + i) * 120, height - 210, baseX - 35, height - 330);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCourseMarkers(race, player, width, height) {
    const scale = screenScale();
    const finishX = player.x + (race.distance - player.distance) * scale;
    ctx.save();
    for (let marker = 250; marker < race.distance; marker += 250) {
      const x = player.x + (marker - player.distance) * scale;
      if (x < -60 || x > width + 60) continue;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.setLineDash([10, 12]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, height * 0.35);
      ctx.lineTo(x, height - 28);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(17,49,79,0.62)";
      ctx.font = "900 15px ui-rounded, system-ui, sans-serif";
      ctx.fillText(`${marker}m`, x + 8, height - 36);
    }

    if (finishX > -70 && finishX < width + 120) {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillRect(finishX, height * 0.28, 18, height * 0.72);
      for (let y = height * 0.28; y < height; y += 28) {
        ctx.fillStyle = (Math.floor(y / 28) % 2) ? "#11314f" : "#fff";
        ctx.fillRect(finishX, y, 18, 14);
      }
      ctx.fillStyle = "#11314f";
      ctx.font = "950 24px ui-rounded, system-ui, sans-serif";
      ctx.fillText("FINISH", finishX - 34, height * 0.26);
    }
    ctx.restore();
  }

  function drawObstacles(t) {
    const state = raceState;
    const { player } = state;
    const scale = screenScale();
    state.obstacles.forEach((obstacle) => {
      if (obstacle.hit) return;
      const x = player.x + (obstacle.d - player.distance) * scale;
      if (x < -90 || x > el.gameCanvas.width + 130) return;
      const y = obstacle.y + Math.sin(t * 2 + obstacle.wobble) * 5;
      ctx.save();
      ctx.translate(x, y);
      if (obstacle.type === "buoy") drawBuoy();
      else if (obstacle.type === "wake") drawWake(t + obstacle.wobble);
      else if (obstacle.type === "crate") drawCrate();
      else if (obstacle.type === "whirlpool") drawWhirlpool(t + obstacle.wobble);
      else if (obstacle.type === "coin") drawCoin(t + obstacle.wobble);
      else if (obstacle.type === "boost") drawBoostBottle(t + obstacle.wobble);
      ctx.restore();
    });
  }

  function drawBuoy() {
    ctx.fillStyle = "#ff4d6d";
    ctx.strokeStyle = "#11314f";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-15, -6, 30, 12);
    ctx.strokeRect(-15, -6, 30, 12);
  }

  function drawWake(t) {
    ctx.strokeStyle = "rgba(255,255,255,0.86)";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      for (let x = -44; x <= 44; x += 8) {
        const y = i * 15 + Math.sin(x * 0.15 + t * 4 + i) * 8;
        if (x === -44) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawCrate() {
    ctx.fillStyle = "#c47f3d";
    ctx.strokeStyle = "#11314f";
    ctx.lineWidth = 5;
    roundedRect(ctx, -24, -24, 48, 48, 8, true, true);
    ctx.strokeStyle = "rgba(17,49,79,0.55)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-18, -18);
    ctx.lineTo(18, 18);
    ctx.moveTo(18, -18);
    ctx.lineTo(-18, 18);
    ctx.stroke();
  }

  function drawWhirlpool(t) {
    ctx.strokeStyle = "rgba(255,255,255,0.84)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.rotate(t * 0.9);
    for (let r = 10; r <= 42; r += 11) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0.2, Math.PI * 1.55);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(17,49,79,0.22)";
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCoin(t) {
    ctx.rotate(Math.sin(t * 4) * 0.35);
    ctx.fillStyle = "#ffd166";
    ctx.strokeStyle = "#11314f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.beginPath();
    ctx.ellipse(-5, -7, 5, 8, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9b5b00";
    ctx.font = "900 18px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("¢", 1, 1);
  }

  function drawBoostBottle(t) {
    ctx.rotate(Math.sin(t * 3) * 0.2);
    ctx.fillStyle = "#4ade80";
    ctx.strokeStyle = "#11314f";
    ctx.lineWidth = 4;
    roundedRect(ctx, -13, -26, 26, 52, 10, true, true);
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, -8, -12, 16, 20, 6, true, false);
    ctx.fillStyle = "#11314f";
    ctx.font = "900 16px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("⚡", 0, 5);
  }

  function drawOpponents(t) {
    const state = raceState;
    const { player } = state;
    const scale = screenScale();
    state.opponents.forEach((opponent, index) => {
      const x = player.x + (opponent.distance - player.distance) * scale;
      if (x < -180 || x > el.gameCanvas.width + 200) return;
      const y = opponent.y + Math.sin(t * 2 + opponent.wobble) * 7;
      const fakeParts = getOpponentParts(opponent, index);
      drawBoat(ctx, x, y, 0.42, {
        parts: fakeParts,
        hue: parseInt(opponent.color.match(/hsl\((\d+)/)?.[1] || "210", 10),
        boost: opponent.speed > opponent.pace + 3 ? 0.8 : 0,
        tilt: Math.sin(t * 3 + index) * 0.04
      });
      ctx.fillStyle = "rgba(255,255,255,0.86)";
      ctx.strokeStyle = "rgba(17,49,79,0.16)";
      roundedRect(ctx, x - 72, y - 76, 144, 26, 13, true, true);
      ctx.fillStyle = "#11314f";
      ctx.font = "900 12px ui-rounded, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(opponent.name, x, y - 58);
    });
  }

  function getOpponentParts(opponent, index) {
    const hull = { ...PARTS.hull[(index + 1) % PARTS.hull.length], color: opponent.color };
    const engine = PARTS.engine[(index + 2) % PARTS.engine.length];
    const deck = PARTS.deck[(index + 1) % PARTS.deck.length];
    const gadget = PARTS.gadget[(index + 2) % PARTS.gadget.length];
    return [hull, engine, deck, gadget];
  }

  function drawParticles() {
    raceState.particles.forEach((particle) => {
      ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  function drawRaceOverlay(t) {
    const state = raceState;
    const { race, player, physics } = state;
    const width = el.gameCanvas.width;
    const height = el.gameCanvas.height;
    const progress = clamp(player.distance / race.distance, 0, 1);
    const boost = clamp(player.boost / physics.boostCapacity, 0, 1);

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.strokeStyle = "rgba(17,49,79,0.16)";
    roundedRect(ctx, 24, 22, width - 48, 34, 17, true, true);
    ctx.fillStyle = "rgba(31,182,255,0.94)";
    roundedRect(ctx, 31, 29, (width - 62) * progress, 20, 10, true, false);
    ctx.fillStyle = "#11314f";
    ctx.font = "900 14px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(player.distance)}m / ${race.distance}m`, width / 2, 44);

    ctx.fillStyle = "rgba(255,255,255,0.84)";
    roundedRect(ctx, 24, height - 64, 210, 38, 19, true, true);
    ctx.fillStyle = "rgba(255,209,102,0.98)";
    roundedRect(ctx, 32, height - 55, 194 * boost, 20, 10, true, false);
    ctx.fillStyle = "#11314f";
    ctx.textAlign = "left";
    ctx.fillText("BOOST", 42, height - 40);

    state.messages.forEach((message) => {
      ctx.globalAlpha = clamp(message.life, 0, 1);
      ctx.fillStyle = message.color;
      ctx.strokeStyle = "rgba(17,49,79,0.45)";
      ctx.lineWidth = 5;
      ctx.font = "950 32px ui-rounded, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.strokeText(message.text, width / 2, message.y);
      ctx.fillText(message.text, width / 2, message.y);
      ctx.globalAlpha = 1;
    });

    if (race.theme === "storm" && Math.sin(t * 2.7) > 0.92) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function finishRace() {
    const state = raceState;
    state.finishHandled = true;
    stopRaceLoop();
    const place = 1 + state.opponents.filter((opponent) => opponent.finishedAt && opponent.finishedAt <= state.time).length;
    state.place = place;
    const result = calculateRewards(state, place);
    state.reward = result;
    applyRewards(state, result);
    addHighScore(state, result);
    renderAll();
    setTimeout(() => {
      closeDialog(el.raceDialog);
      renderResult(state, result);
      showDialog(el.resultDialog);
      activeRace = null;
      raceState = null;
    }, 500);
  }

  function calculateRewards(state, place) {
    const { race, player } = state;
    const podiumMultiplier = place === 1 ? 1 : place === 2 ? 0.62 : place === 3 ? 0.38 : 0.22;
    const coinReward = Math.round(race.prizeCoins * podiumMultiplier + player.coins);
    const repReward = Math.round(race.rep * (place === 1 ? 1 : 0.55));
    const timeBonus = Math.max(0, Math.round((race.distance / Math.max(1, state.time) - 52) * 18));
    const score = Math.max(50, Math.round((race.distance * 12) / Math.max(1, state.time) + (5 - place) * 1250 + player.coins * 14 + timeBonus * 5));
    const part = place === 1 ? chooseRewardPart(race) : maybeConsolationPart(race, place);
    const cup = place === 1 ? 1 : 0;
    return { coinReward, repReward, timeBonus, score, part, cup };
  }

  function chooseRewardPart(race) {
    const locked = allParts().filter((part) => !save.unlocked.includes(part.id));
    if (!locked.length) return null;
    const accessibleTier = Math.min(6, Math.max(race.tier + 1, Math.floor(save.trophies / 2) + 2));
    const pool = locked.filter((part) => part.tier <= accessibleTier);
    const candidates = pool.length ? pool : locked.sort((a, b) => a.tier - b.tier).slice(0, 4);
    const weighted = [];
    candidates.forEach((part) => {
      const weight = Math.max(1, 8 - part.tier);
      for (let i = 0; i < weight; i += 1) weighted.push(part);
    });
    return weighted[Math.floor(Math.random() * weighted.length)];
  }

  function maybeConsolationPart(race, place) {
    if (place > 2) return null;
    const luck = calculateStats().luck;
    const chance = 0.12 + luck * 0.012;
    if (Math.random() > chance) return null;
    return chooseRewardPart({ ...race, tier: Math.max(1, race.tier - 1) });
  }

  function applyRewards(state, reward) {
    save.coins += reward.coinReward;
    save.rep += reward.repReward;
    save.trophies += reward.cup;
    if (reward.part && !save.unlocked.includes(reward.part.id)) {
      save.unlocked.push(reward.part.id);
    }

    const history = save.raceHistory[state.race.id] || {};
    history.runs = (history.runs || 0) + 1;
    history.bestPlace = Math.min(history.bestPlace || 99, state.place);
    if (!history.bestTime || state.time < history.bestTime) history.bestTime = state.time;
    save.raceHistory[state.race.id] = history;
    persist();
  }

  function addHighScore(state, reward) {
    save.highScores.push({
      raceId: state.race.id,
      raceName: state.race.name,
      captain: save.captain,
      place: state.place,
      time: state.time,
      score: reward.score,
      ship: shipName(),
      date: nowStamp()
    });
    save.highScores = save.highScores
      .sort((a, b) => b.score - a.score || a.time - b.time)
      .slice(0, 20);
    persist();
  }

  function renderResult(state, reward) {
    const partLine = reward.part
      ? `<div class="reward-box">🎁 New part unlocked: <strong>${reward.part.emoji} ${reward.part.name}</strong> <span class="tag ${rarityClass(reward.part.rarity)}">${reward.part.rarity}</span><br>${reward.part.desc}</div>`
      : `<div class="reward-box">🎁 No new part this time, but the dockmaster added extra polish to your trophy shelf.</div>`;
    const headline = state.place === 1 ? "You won the cup!" : state.place <= 3 ? "Podium splash!" : "Still afloat!";
    const flavour = state.place === 1
      ? "The marina erupts. Several rubber ducks request autographs."
      : state.place <= 3
        ? "A respectable finish, a damp handshake, and useful prize money."
        : "The boat is dented, the captain is wiser, and the snack bar remains open.";

    el.resultCard.innerHTML = `
      <h2>${headline}</h2>
      <p class="tagline">${flavour}</p>
      <div class="result-grid">
        <div class="result-stat"><span>Place</span><strong>${ordinal(state.place)}</strong></div>
        <div class="result-stat"><span>Time</span><strong>${formatTime(state.time)}</strong></div>
        <div class="result-stat"><span>Score</span><strong>${reward.score.toLocaleString()}</strong></div>
        <div class="result-stat"><span>Loot</span><strong>🪙${reward.coinReward}</strong></div>
      </div>
      ${partLine}
      <p><strong>Rep gained:</strong> +${reward.repReward}${reward.cup ? " · <strong>Cup gained:</strong> +1" : ""}</p>
      <div class="result-actions">
        <button id="raceAgain" class="primary-button">Race again</button>
        <button id="backDock" class="ghost-button">Back to dockyard</button>
      </div>
    `;
    $("#raceAgain").addEventListener("click", () => {
      closeDialog(el.resultDialog);
      startRace(state.race.id);
    });
    $("#backDock").addEventListener("click", () => closeDialog(el.resultDialog));
  }

  function toast(message) {
    const note = document.createElement("div");
    note.textContent = message;
    note.style.position = "fixed";
    note.style.left = "50%";
    note.style.bottom = "24px";
    note.style.transform = "translateX(-50%)";
    note.style.zIndex = "99";
    note.style.padding = "0.85rem 1.1rem";
    note.style.borderRadius = "999px";
    note.style.background = "rgba(17,49,79,0.92)";
    note.style.color = "#fff";
    note.style.fontWeight = "950";
    note.style.boxShadow = "0 12px 24px rgba(0,0,0,0.24)";
    document.body.append(note);
    setTimeout(() => note.remove(), 2200);
  }

  init();
})();
