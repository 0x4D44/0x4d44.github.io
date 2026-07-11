// ============================================================
// VECTOR GP — the 16-round world championship calendar.
// All venues fictional. Segment notation:
//   ["s", metres]              straight
//   ["r", radius_m, degrees]   right-hand arc
//   ["l", radius_m, degrees]   left-hand arc
// Signed degree total per circuit should be ~±360; the track
// builder normalises residual heading/position error.
// theme: street | park | desert | forest | plain | coast
// ============================================================

window.VGP_TRACKS = [
  {
    id: "cactus", round: 1,
    gp: "United States Grand Prix", name: "Cactus Park Street Circuit",
    location: "Arizona, USA", laps: 81, width: 10, theme: "desert", street: true,
    segs: [
      ["s", 420], ["r", 30, 90], ["s", 260], ["l", 25, 90], ["s", 160],
      ["r", 28, 90], ["s", 520], ["r", 25, 90], ["s", 210], ["r", 20, 180],
      ["s", 310], ["l", 25, 90], ["s", 160], ["l", 25, 90], ["s", 260],
      ["r", 30, 90], ["s", 420], ["r", 30, 90], ["s", 130], ["r", 60, 45],
      ["s", 190], ["l", 60, 45],
    ],
  },
  {
    id: "serra", round: 2,
    gp: "Brazilian Grand Prix", name: "Autodromo Serra Verde",
    location: "Brazil", laps: 71, width: 12, theme: "park",
    segs: [
      ["s", 700], ["l", 80, 60], ["l", 45, 90], ["s", 260], ["l", 100, 45],
      ["s", 820], ["l", 35, 90], ["s", 160], ["r", 40, 90], ["s", 130],
      ["r", 50, 60], ["l", 30, 90], ["s", 210], ["l", 60, 45], ["s", 260],
      ["l", 70, 80], ["s", 320], ["l", 200, 10],
    ],
  },
  {
    id: "torrente", round: 3,
    gp: "San Marino Grand Prix", name: "Autodromo del Torrente",
    location: "Italy", laps: 61, width: 12, theme: "park",
    segs: [
      ["s", 880], ["l", 130, 40], ["s", 380], ["l", 90, 50], ["s", 460],
      ["l", 45, 90], ["s", 340], ["r", 60, 70], ["l", 55, 70], ["s", 280],
      ["r", 70, 45], ["s", 240], ["l", 40, 80], ["l", 40, 80], ["s", 340],
      ["r", 55, 60], ["l", 60, 55], ["s", 300], ["l", 45, 90], ["s", 220],
      ["r", 90, 30], ["l", 120, 30],
    ],
  },
  {
    id: "beaumont", round: 4,
    gp: "Monaco Grand Prix", name: "Circuit de Beaumont",
    location: "Riviera", laps: 78, width: 8, theme: "street", street: true,
    segs: [
      ["s", 240], ["r", 25, 80], ["s", 150], ["l", 50, 40], ["s", 260],
      ["r", 30, 130], ["s", 90], ["l", 22, 75], ["s", 120], ["r", 14, 180],
      ["s", 80], ["r", 25, 90], ["s", 60], ["r", 20, 60], ["s", 200],
      ["l", 35, 45], ["s", 220], ["r", 40, 35], ["l", 18, 60], ["r", 18, 60],
      ["s", 150], ["r", 26, 90], ["s", 90], ["r", 30, 45], ["s", 210],
      ["l", 30, 50], ["r", 45, 30],
    ],
  },
  {
    id: "cygnes", round: 5,
    gp: "Canadian Grand Prix", name: "Circuit Ile-aux-Cygnes",
    location: "Canada", laps: 69, width: 11, theme: "park",
    segs: [
      ["s", 300], ["l", 45, 55], ["r", 40, 60], ["s", 380], ["l", 30, 70],
      ["r", 30, 70], ["s", 520], ["r", 45, 45], ["l", 45, 45], ["s", 460],
      ["r", 18, 170], ["s", 620], ["l", 35, 65], ["r", 35, 65], ["s", 320],
      ["r", 40, 55], ["l", 40, 50], ["s", 260], ["r", 24, 105], ["l", 30, 55],
    ],
  },
  {
    id: "volcanes", round: 6,
    gp: "Mexican Grand Prix", name: "Autodromo Los Volcanes",
    location: "Mexico", laps: 67, width: 12, theme: "plain",
    segs: [
      ["s", 900], ["r", 60, 90], ["l", 55, 45], ["s", 320], ["r", 50, 70],
      ["l", 50, 70], ["s", 280], ["r", 65, 50], ["s", 340], ["l", 70, 60],
      ["r", 80, 40], ["s", 420], ["l", 90, 35], ["s", 380], ["r", 110, 170],
    ],
  },
  {
    id: "valdore", round: 7,
    gp: "French Grand Prix", name: "Circuit du Val Dore",
    location: "France", laps: 72, width: 12, theme: "plain",
    segs: [
      ["s", 480], ["r", 70, 60], ["l", 65, 60], ["s", 620], ["r", 30, 160],
      ["s", 340], ["l", 40, 95], ["s", 520], ["r", 25, 170], ["s", 260],
      ["l", 60, 60], ["r", 45, 90], ["s", 220], ["r", 55, 60], ["l", 45, 75],
      ["s", 300], ["r", 35, 90], ["l", 80, 30],
    ],
  },
  {
    id: "northamber", round: 8,
    gp: "British Grand Prix", name: "Northamber Circuit",
    location: "England", laps: 59, width: 13, theme: "plain",
    segs: [
      ["s", 640], ["r", 90, 70], ["s", 380], ["r", 120, 45], ["l", 100, 50],
      ["s", 540], ["r", 55, 90], ["l", 60, 45], ["s", 300], ["r", 70, 60],
      ["r", 45, 80], ["l", 50, 55], ["s", 620], ["r", 60, 85], ["s", 240],
      ["l", 55, 55], ["r", 80, 60], ["s", 340], ["r", 65, 75], ["l", 120, 30],
      ["s", 260], ["r", 90, 40],
    ],
  },
  {
    id: "waldring", round: 9,
    gp: "German Grand Prix", name: "Waldring",
    location: "Germany", laps: 45, width: 13, theme: "forest",
    segs: [
      ["s", 760], ["r", 90, 65], ["s", 1050], ["r", 28, 105], ["l", 30, 60],
      ["s", 980], ["r", 30, 110], ["l", 32, 55], ["s", 900], ["r", 50, 75],
      ["s", 420], ["l", 45, 55], ["r", 40, 85], ["s", 220], ["r", 45, 65],
      ["l", 50, 45], ["s", 180], ["r", 40, 70],
    ],
  },
  {
    id: "puszta", round: 10,
    gp: "Hungarian Grand Prix", name: "Pusztaring",
    location: "Hungary", laps: 77, width: 10, theme: "plain",
    segs: [
      ["s", 520], ["r", 35, 110], ["s", 260], ["l", 30, 100], ["s", 180],
      ["l", 60, 45], ["r", 50, 55], ["s", 220], ["l", 40, 70], ["s", 160],
      ["r", 35, 80], ["l", 35, 80], ["s", 200], ["r", 45, 60], ["l", 45, 60],
      ["s", 240], ["r", 30, 100], ["s", 140], ["l", 50, 50], ["s", 200],
      ["r", 32, 110], ["s", 320], ["r", 55, 80],
    ],
  },
  {
    id: "collines", round: 11,
    gp: "Belgian Grand Prix", name: "Circuit des Sept Collines",
    location: "Ardennes", laps: 44, width: 12, theme: "forest",
    segs: [
      ["s", 420], ["r", 20, 150], ["s", 560], ["l", 90, 45], ["r", 100, 50],
      ["s", 980], ["r", 55, 65], ["l", 60, 60], ["s", 640], ["r", 70, 55],
      ["s", 320], ["l", 65, 70], ["s", 280], ["r", 60, 80], ["l", 75, 45],
      ["s", 460], ["l", 45, 85], ["r", 50, 60], ["s", 380], ["r", 40, 90],
      ["l", 90, 40], ["s", 540], ["r", 30, 120],
    ],
  },
  {
    id: "parco", round: 12,
    gp: "Italian Grand Prix", name: "Autodromo del Parco",
    location: "Italy", laps: 53, width: 12, theme: "park",
    segs: [
      ["s", 1050], ["r", 25, 55], ["l", 25, 55], ["s", 640], ["r", 90, 90],
      ["s", 340], ["r", 30, 50], ["l", 30, 50], ["s", 520], ["r", 75, 90],
      ["r", 80, 45], ["s", 900], ["l", 25, 50], ["r", 25, 50], ["s", 480],
      ["r", 130, 85], ["r", 160, 40],
    ],
  },
  {
    id: "atlantico", round: 13,
    gp: "Portuguese Grand Prix", name: "Circuito do Atlantico",
    location: "Portugal", laps: 71, width: 12, theme: "coast",
    segs: [
      ["s", 780], ["r", 60, 85], ["s", 280], ["r", 45, 65], ["s", 340],
      ["l", 50, 60], ["s", 260], ["r", 35, 90], ["l", 55, 45], ["s", 380],
      ["r", 40, 75], ["s", 300], ["l", 40, 100], ["s", 220], ["r", 50, 60],
      ["l", 65, 45], ["s", 360], ["r", 30, 105], ["s", 240], ["r", 70, 80],
    ],
  },
  {
    id: "montjora", round: 14,
    gp: "Spanish Grand Prix", name: "Circuit de Montjora",
    location: "Spain", laps: 65, width: 12, theme: "plain",
    segs: [
      ["s", 880], ["r", 45, 90], ["l", 60, 55], ["s", 420], ["r", 55, 70],
      ["s", 260], ["l", 40, 85], ["s", 300], ["r", 60, 60], ["l", 50, 65],
      ["s", 460], ["r", 35, 95], ["s", 220], ["l", 45, 70], ["s", 180],
      ["r", 40, 80], ["l", 70, 40], ["s", 340], ["r", 55, 110],
    ],
  },
  {
    id: "wakahama", round: 15,
    gp: "Japanese Grand Prix", name: "Wakahama Ring",
    location: "Japan", laps: 53, width: 12, theme: "park",
    segs: [
      ["s", 620], ["r", 80, 45], ["l", 60, 50], ["r", 60, 50], ["l", 60, 50],
      ["r", 55, 55], ["s", 300], ["l", 45, 75], ["s", 240], ["r", 50, 95],
      ["s", 200], ["l", 60, 60], ["s", 420], ["l", 20, 170], ["s", 640],
      ["r", 30, 60], ["l", 30, 60], ["s", 460], ["r", 45, 90], ["s", 280],
      ["r", 60, 90],
    ],
  },
  {
    id: "kingsford", round: 16,
    gp: "Australian Grand Prix", name: "Kingsford Street Circuit",
    location: "Australia", laps: 81, width: 11, theme: "street", street: true,
    segs: [
      ["s", 520], ["r", 40, 90], ["s", 240], ["l", 35, 90], ["s", 640],
      ["r", 30, 90], ["s", 200], ["r", 45, 45], ["s", 300], ["r", 20, 135],
      ["s", 420], ["l", 40, 90], ["s", 260], ["l", 60, 45], ["s", 180],
      ["r", 35, 90], ["s", 700], ["r", 25, 135], ["s", 240], ["l", 80, 30],
      ["r", 60, 75],
    ],
  },
];
