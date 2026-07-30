// ============================================================
// VECTOR GP — teams & drivers (all fictional)
// 13 teams x 2 drivers = 26 cars, in the spirit of the 1991 grid.
// perf: 0..1 car pace. rel: per-race finish probability.
// colors: [body, accent, dark trim]
// ============================================================

window.VGP_TEAMS = [
  { id: "meridian", name: "Meridian Grand Prix", engine: "Hayashi V12",
    colors: ["#e8e8e8", "#d22020", "#282830"], perf: 1.000, rel: 0.90 },
  { id: "wyvern",   name: "Wyvern Racing",       engine: "Rousseau V10",
    colors: ["#2244bb", "#ffd020", "#e8e8e8"], perf: 0.992, rel: 0.86 },
  { id: "falcone",  name: "Scuderia Falcone",    engine: "Falcone V12",
    colors: ["#d02018", "#e8e8e8", "#301818"], perf: 0.980, rel: 0.82 },
  { id: "chroma",   name: "Chroma Team F1",      engine: "Vance HB V8",
    colors: ["#28a038", "#ffd020", "#204060"], perf: 0.962, rel: 0.85 },
  { id: "lyra",     name: "Team Lyra",           engine: "Kessler V8",
    colors: ["#187048", "#d8b040", "#202020"], perf: 0.938, rel: 0.78 },
  { id: "tarrant",  name: "Tarrant Racing",      engine: "Hayashi V10",
    colors: ["#3858c8", "#e8e8e8", "#182858"], perf: 0.946, rel: 0.83 },
  { id: "kildare",  name: "Kildare Grand Prix",  engine: "Vance V8",
    colors: ["#108848", "#3080e0", "#e8e8e8"], perf: 0.950, rel: 0.80 },
  { id: "bravado",  name: "Bravado Formula",     engine: "Yamagata V12",
    colors: ["#e8e8e8", "#2058c0", "#c02020"], perf: 0.934, rel: 0.76 },
  { id: "northolt", name: "Northolt Arrows",     engine: "Portman V10",
    colors: ["#e0e0e0", "#c03050", "#282828"], perf: 0.926, rel: 0.75 },
  { id: "aurora",   name: "Equipe Aurora",       engine: "Chastain V12",
    colors: ["#3878e8", "#e8e8e8", "#183068"], perf: 0.930, rel: 0.78 },
  { id: "minerva",  name: "Minerva Corse",       engine: "Falcone V12",
    colors: ["#e8c020", "#282838", "#c04010"], perf: 0.918, rel: 0.74 },
  { id: "delta",    name: "Delta Corse",         engine: "Judson V8",
    colors: ["#c02828", "#e8e8e8", "#202848"], perf: 0.912, rel: 0.72 },
  { id: "vulcano",  name: "Vulcano GP",          engine: "Marchetti V8",
    colors: ["#606068", "#e05010", "#202024"], perf: 0.900, rel: 0.68 },
];

// Two drivers per team, in team order. skill: 0..1 driver pace.
window.VGP_DRIVERS = [
  { name: "Aurelio Santoro",   nat: "BRA", team: 0,  skill: 1.000, num: 1  },
  { name: "Anders Kjellberg",  nat: "SWE", team: 0,  skill: 0.962, num: 2  },
  { name: "Neil Marsh",        nat: "GBR", team: 1,  skill: 0.985, num: 5  },
  { name: "Renzo Pichetti",    nat: "ITA", team: 1,  skill: 0.958, num: 6  },
  { name: "Pascal Leduc",      nat: "FRA", team: 2,  skill: 0.980, num: 27 },
  { name: "Jean Morieux",      nat: "FRA", team: 2,  skill: 0.955, num: 28 },
  { name: "Nelson Barreto",    nat: "BRA", team: 3,  skill: 0.952, num: 19 },
  { name: "Stefan Kruger",     nat: "GER", team: 3,  skill: 0.968, num: 20 },
  { name: "Mika Jarvela",      nat: "FIN", team: 4,  skill: 0.960, num: 11 },
  { name: "Julian Hartley",    nat: "GBR", team: 4,  skill: 0.938, num: 12 },
  { name: "Satoru Michizaki",  nat: "JPN", team: 5,  skill: 0.936, num: 3  },
  { name: "Stefano Mordini",   nat: "ITA", team: 5,  skill: 0.940, num: 4  },
  { name: "Bertrand Gicquel",  nat: "BEL", team: 6,  skill: 0.944, num: 32 },
  { name: "Andrea de Castri",  nat: "ITA", team: 6,  skill: 0.930, num: 33 },
  { name: "Marten Blundstone", nat: "GBR", team: 7,  skill: 0.934, num: 7  },
  { name: "Mauro Bandelli",    nat: "ITA", team: 7,  skill: 0.926, num: 8  },
  { name: "Marco Alberini",    nat: "ITA", team: 8,  skill: 0.928, num: 9  },
  { name: "Alexei Zafiro",     nat: "ITA", team: 8,  skill: 0.918, num: 10 },
  { name: "Thierry Boulanger", nat: "FRA", team: 9,  skill: 0.930, num: 25 },
  { name: "Didier Vachon",     nat: "FRA", team: 9,  skill: 0.916, num: 26 },
  { name: "Piero Martinelli",  nat: "ITA", team: 10, skill: 0.924, num: 23 },
  { name: "Gustavo Moraes",    nat: "BRA", team: 10, skill: 0.912, num: 24 },
  { name: "Jan van der Pol",   nat: "NED", team: 11, skill: 0.914, num: 21 },
  { name: "Emanuele Pirello",  nat: "ITA", team: 11, skill: 0.908, num: 22 },
  { name: "Gabriele Torretti", nat: "ITA", team: 12, skill: 0.910, num: 14 },
  { name: "Olivier Grosjean",  nat: "FRA", team: 12, skill: 0.902, num: 15 },
];
