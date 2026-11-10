// The dated photographs the Hull Trains 802's wrap band is read from, and what was read off them. train-livery.ts's HULL_BAND_STOPS is tied to this table by web/tests/train-livery.test.ts, so a stop
// cannot drift from its photograph, nor a car's band be put the wrong way about, without a test going red. The pixels were read by script (a window's most chromatic third), not typed: the lines
// are the band's centre in the photograph's own pixels, so anyone can re-read them off the file in the reference pack (refs/hull5/).
//
// hull-802-paragon-2025: "Class 802/3 Paragon BMU", Samson Ng, taken 2025-06-02, CC BY-SA 4.0 (commons.wikimedia.org File:Class_802_3_Paragon_BMU_(54953012379).jpg). Unit 802 304, all five cars
// side-on in sun from in front of the lead car, the nose to the right: the train's RIGHT side. The one photograph that shows the band of every car. The wrap is a photographic collage graded to a
// colour a car at a time (it runs through the spectrum, one run carrying on into the next car's start), so a reading is the paint's grade, not a single hue: each is the mean of the 30 per cent
// most chromatic pixels of a 21 x 41 pixel box centred on the line, at 21 equal steps (t = 0, 0.05 ... 1) along it. A reading that lands on a door leaf, a shadow or a car's dim end is listed
// and marked skipped, and the test does not use it. The lines run from the first end of a car to its last, a through car's ends being about 1 m beyond the line's, as the model's band (1.0 m in from each end) is: so t is taken as the model's own t along the
// band, ASSUMED within about 1.5 m (the train recedes, so the scale runs from some 25 px a metre on the lead car to 4 or 5 on the far one). The cars in shade (2, 3 and above all 4, the far one) read duller than the paint is.
// The wrap is one unit's: hull-802-home-2023 shows the rear car of 802 302, "Jean Bishop (The Bee Lady)", cyan along its length to its rear door (a dusk photograph, so dull) where 802 304's rear car
// runs teal, green and violet; so the model's band follows 802 304 and not every 802.
export type Reading = readonly [t: number, colour: number];
export interface CarReadings {
  /** the car's index in the train (0 = the lead car, 4 = the rear cab car) */
  car: number;
  role: string;
  /** the polyline of the band's centre, in the photograph's pixels (the file's own size), first end of the car first */
  line: readonly (readonly [number, number])[];
  readings: readonly Reading[];
  /** the t of the readings the test leaves out */
  skip: readonly number[];
}

export const PARAGON_2025: readonly CarReadings[] = [
  // car 0, the lead car (DPTS): t = 0 at the front edge of its cab-end passenger door, t = 1 at its rear end
  {
    car: 0,
    role: 'car 0, the lead car (DPTS)',
    line: [[1245, 770], [1100, 763], [1000, 755], [900, 745], [800, 735], [775, 733]],
    readings: [
      [0.0, 0x2eb3eb],
      [0.05, 0x49a1c9], // skipped: the shadow of the cab-end door's front edge
      [0.1, 0x40b7d4],
      [0.15, 0x5be0ef],
      [0.2, 0x41d7e6],
      [0.25, 0x38d5d9],
      [0.3, 0x38eae1],
      [0.35, 0x49cecb],
      [0.4, 0x48c7b0],
      [0.45, 0x3dd993],
      [0.5, 0x56e28a],
      [0.55, 0x78ef80],
      [0.6, 0x71e263],
      [0.65, 0x478d8c],
      [0.7, 0x43749b],
      [0.75, 0x385696],
      [0.8, 0x4c489e],
      [0.85, 0x7c4dbc],
      [0.9, 0x7a54a3],
      [0.95, 0xeb2c57], // skipped: the dark frame of the car's rear door
      [1.0, 0x785bb0],
    ],
    skip: [0.05, 0.95],
  },
  // car 1 (MS): t = 0 at its front end, t = 1 at its rear end
  {
    car: 1,
    role: 'car 1 (MS)',
    line: [[745, 745], [700, 741], [600, 733], [500, 724], [475, 722]],
    readings: [
      [0.0, 0x8665a9],
      [0.05, 0x8b65ad],
      [0.1, 0xdf274e], // skipped: the red leaf of the front door
      [0.15, 0xe02950], // skipped: the red leaf of the front door
      [0.2, 0xb47d56], // skipped: the shadow beside the door
      [0.25, 0xc5964d], // skipped: the shadow beside the door
      [0.3, 0xe1a523],
      [0.35, 0xebba23],
      [0.4, 0xefb223],
      [0.45, 0xea9f2b],
      [0.5, 0xeb952f],
      [0.55, 0xed9133],
      [0.6, 0xe68338],
      [0.65, 0xe5692e],
      [0.7, 0xe45f2d],
      [0.75, 0xdf4026],
      [0.8, 0xe82927],
      [0.85, 0xe6242d],
      [0.9, 0xea2037],
      [0.95, 0xe6233e],
      [1.0, 0xe0305a],
    ],
    skip: [0.1, 0.15, 0.2, 0.25],
  },
  // car 2 (MS): t = 0 at its front end, t = 1 at its rear end (the signal post stands over the last 0.05)
  {
    car: 2,
    role: 'car 2 (MS)',
    line: [[462, 713], [420, 710], [380, 707], [340, 705], [300, 703]],
    readings: [
      [0.0, 0xd94167],
      [0.05, 0xe03e67],
      [0.1, 0xe53b6d],
      [0.15, 0xdc2552],
      [0.2, 0xd52751],
      [0.25, 0xc0244c],
      [0.3, 0xb72b56],
      [0.35, 0xae3b6b],
      [0.4, 0x953a6f],
      [0.45, 0x7b4a81],
      [0.5, 0x585c8e],
      [0.55, 0x3d5b99],
      [0.6, 0x3b5a9c],
      [0.65, 0x445087],
      [0.7, 0x6f5184],
      [0.75, 0x6b538e],
      [0.8, 0x5062a4],
      [0.85, 0x77639d],
      [0.9, 0xa4538a],
      [0.95, 0xb54b7f],
      [1.0, 0xa64975],
    ],
    skip: [],
  },
  // car 3 (MC): t = 0 at its front end (the signal post stands over it), t = 1 at its rear end (in shade)
  {
    car: 3,
    role: 'car 3 (MC)',
    line: [[285, 697], [250, 695], [200, 691], [188, 690]],
    readings: [
      [0.0, 0x974f5d], // skipped: behind the signal post
      [0.05, 0xc53e5c],
      [0.1, 0xe83a57],
      [0.15, 0xe83a58],
      [0.2, 0xeb3e5e],
      [0.25, 0xe84a69],
      [0.3, 0xeb5673],
      [0.35, 0xec516b],
      [0.4, 0xe95167],
      [0.45, 0xca4a58],
      [0.5, 0xac4647], // skipped: the shadow of a bogie
      [0.55, 0xa74c40], // skipped: the shadow of a bogie
      [0.6, 0xc05f42],
      [0.65, 0xe37748],
      [0.7, 0xe77b43],
      [0.75, 0xea8146],
      [0.8, 0xed914b],
      [0.85, 0xe99a4d],
      [0.9, 0xe4a557],
      [0.95, 0xcb9854],
      [1.0, 0x9d794d], // skipped: the car's end, in deep shade
    ],
    skip: [0.0, 0.5, 0.55, 1.0],
  },
  // car 4, the rear cab car (DPTF): t = 0 at the REAR end of the train (its cab end), t = 1 at its front end
  {
    car: 4,
    role: 'car 4, the rear cab car (DPTF)',
    line: [[96, 686], [120, 686], [150, 687], [172, 688]],
    readings: [
      [0.0, 0x53828b],
      [0.05, 0x568f98],
      [0.1, 0x579b9f],
      [0.15, 0x569a98],
      [0.2, 0x558d83],
      [0.25, 0x5e9783],
      [0.3, 0x5e9279],
      [0.35, 0x5c8671],
      [0.4, 0x5d7e6e],
      [0.45, 0x607475],
      [0.5, 0x676b80],
      [0.55, 0x6b5d8a],
      [0.6, 0x665686],
      [0.65, 0x70598d],
      [0.7, 0x715295],
      [0.75, 0x6d529f],
      [0.8, 0x65509d],
      [0.85, 0x64509d],
      [0.9, 0x69529f],
      [0.95, 0x63539a],
      [1.0, 0x645880], // skipped: the car's end, in deep shade
    ],
    skip: [1.0],
  },
];

/**
 * hull-802-doncaster-2024: "Hull Trains class 802", Vanmanyo, taken 2024-03-27, CC BY 4.0 (commons.wikimedia.org File:Hull_Trains_class_802.jpg). Unit 802 302 at Doncaster, close to the front car's cab and
 * side: the band from the sweep by the cab door back, read the same way along the line below (t = 0 at its first point, to t = 0.9, the stretch the close crop shows, which is not the whole car: its
 * t is not the car's, so only the ORDER of the colours is used). Azure by the cab, cyan behind the door, teal, then green behind that, the hue falling from 211 to 134 degrees: the order of 802 304's
 * lead car over its first 60 per cent in the photograph above. hull-802-home-2023 (802 302's rear car, taken 2023-02-25, Stephen Craven, CC BY-SA 2.0) is cyan along its length to its rear door.
 */
export const DONCASTER_2024: { line: readonly (readonly [number, number])[]; readings: readonly Reading[] } = {
  line: [[1031, 756], [954, 705], [904, 664], [853, 647], [817, 636], [767, 629], [726, 620], [675, 603], [645, 600]],
  readings: [
    [0.0, 0x699dd8],
    [0.1, 0x5e9dd6],
    [0.2, 0x49a9ee],
    [0.3, 0x3dacee],
    [0.4, 0x51b7e5],
    [0.5, 0x61b0c0],
    [0.6, 0x3fa6c0],
    [0.7, 0x388482],
    [0.8, 0x457960],
    [0.9, 0x28713a],
  ],
};
