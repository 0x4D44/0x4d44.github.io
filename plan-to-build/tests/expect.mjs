// EVERYTHING the tests expect of the CURRENT film lives in this file. No test file hard-codes a chapter count, a time in the film, a piece of furniture
// or a spot on the plan. When the film changes on purpose (a new chapter, a longer film, ceilings, lights, a tour), this is the one file to edit.
//
// How it is organised
//   * Times are offsets (seconds) from S, the moment the 2D drafting hands over to the 3D model (window.__tl.T3.swap, read from the page). film3D() in
//     index.html authors the whole 3D half the same way, as S + offset, so a change to the 2D half moves nothing here.
//     If a new phase is inserted INTO the 3D half, the offsets after it move: edit the table AT below (the comments say what each time must show).
//   * Whatever the page can tell us is read from the page (S, the film length, the chapters, the rooms, each room's painting window, the section cut).
//     What is written here is what must stay true of it: the numbers the film is expected to have today.
//   * The film length and the chapter count are checked against FILM below. A deliberate change fails those two checks until FILM is updated.

// ---- the film as a whole
export const FILM = {
  chapters: 19,            // player chips. 18 -> 19 when PLASTER & PAINT was added; the next chapter makes it 20
  seconds: 200.93,         // T_END = S + 83 s. 12,056 frames at 60 fps
  secondsTol: 0.01,
};

// ---- times in the 3D half: seconds after S
export const AT = {
  wallsUp: 30,             // columns, walls, insulation and the lintels are up; the section plane has not come down yet
  duringPaint: 50,         // the section cut is down (S+43.1 .. 44.6) and the rooms are being plastered and painted (S+45 .. 54)
  cutLifted: 78,           // the cut has lifted (S+75.2 .. 76.8): everything is built and furnished
  paintFrom: 43.5,         // paint progress is sampled from here ...
  paintTo: 55.01,          // ... to here, every PAINT.step seconds: before the first room's window, through all of them, and after the last
  allPainted: 54.2,        // every room's window is over (the last room's ends at S+54)
  jambs: 45.068,           // jamb shimmer: the cut is down and the paint has not started. The old scratch script used t = 163 s, which is S + 45.068 with S = 117.932
  determinism: 14,         // an instant inside the 3D half for the "same t, same picture" check (also the lost-context and first-draw checks)
};

// ---- the plan (order.test.mjs)
export const PLAN = {
  rugs: 3,
  chairs: 10,
  chairOverlaps: 5,        // a chair is tucked 25 mm under its table or desk in five places: 4 kitchen chairs and 1 study chair
  chairOverlapsText: "five places (4 kitchen chairs, 1 study chair)",      // the same, as the check's name prints it
  living: { room: "LIVING", rug: "rug", sofa: "sofa", coffee: "coffee" },
  // A box on the plan (centre x, centre y, half width, half height; mm) in which the outline of a piece of furniture must show over the rug under it.
  outlines: [
    { key: "sofa", name: "the sofa's outline shows over the rug", box: [5300, 1500, 900, 300], min: 40 },
    { key: "coffee", name: "the coffee table's outline shows over the rug", box: [5300, 2450, 650, 330], min: 40 },
    { key: "cons", name: "the console table's top edge shows over the corridor rug", box: [4800, 4340, 400, 50], min: 15 },
    { key: "shoe", name: "the shoe cabinet's front edge shows over the corridor rug", box: [8200, 4750, 500, 40], min: 15 },
  ],
};

// ---- coplanar faces (zfight.test.mjs)
export const ZFIGHT = {
  solids: ["block", "insul", "concrete"],     // construction solids (material names in MAT3): no two may have a same-side face in one plane
  frames: ["pvc", "doorE"],                   // window and door frame parts: no side face may lie in the plane of a wall's reveal
  minSolids: 40,                              // a scan that finds fewer boxes than this did not look at the building
  minFrames: 30,
  scans: [
    { label: "walls and columns up", at: "wallsUp" },
    { label: "section cut, during the paint", at: "duringPaint" },
    { label: "cut lifted, furnished", at: "cutLifted" },
  ],
};

// ---- plaster and paint (paint.test.mjs)
export const PAINT = {
  phase: "paint",          // T3.ph key of the stage ...
  next: "fx",              // ... and of the one that must start where it ends (the fixtures)
  minWindow: 1.5,          // each room's painting window lasts at least this long (s)
  step: 0.25,              // progress is sampled this often between AT.paintFrom and AT.paintTo
  // the camera that frames the whole plan from above, for the "un-paint one room" pixel test
  camera: { tx: 6.0, ty: 0.4, tz: -4.5, az: 30, el: 58, H: 15.5 },
  // Window W01 (south wall, west jamb, x = 0.9 m). The wall runs from z = -0.10 (inside) to +0.20 (outside); the frame fills z = 0.035 .. 0.145.
  // Painting every room on and off must change the inner reveal and must not change the outer one.
  reveal: {
    x: 0.9, y: [1.1, 2.0],
    outer: { cam: { tx: 0.9, ty: 1.5, tz: 0.17, az: 35, el: 5, H: 0.7 }, z: [0.152, 0.193] },
    inner: { cam: { tx: 0.9, ty: 1.5, tz: -0.05, az: 150, el: 8, H: 0.8 }, z: [-0.09, 0.025] },
  },
};

// ---- jamb shimmer (jamb.test.mjs): three crops of a cut window frame, each with the sun's shadow on and off
export const JAMB = {
  limitPct: 1,             // a case passes when at most this share of the crop shimmers
  cases: [
    { name: "west jamb a", cam: { tx: 0.93, ty: 1.3, tz: 0.09, az: 20, el: 55, H: 0.3 }, crop: [440, 200, 220, 320] },
    { name: "west jamb b", cam: { tx: 0.93, ty: 1.3, tz: 0.09, az: 22, el: 56, H: 0.3 }, crop: [440, 200, 220, 320] },
    { name: "east jamb", cam: { tx: 3.07, ty: 1.3, tz: 0.09, az: -20, el: 55, H: 0.3 }, crop: [440, 200, 220, 320] },
  ],
};

// ---- the player (player.test.mjs)
export const PLAYER = {
  // times for "the same t renders the same picture, even after seeking away"; film is { S, T, chapters }
  determinismTimes: (film) => [40, film.S + AT.determinism, 150.5, 185, film.T - 0.3],
  stepTime: (film) => film.S + AT.determinism + 0.05,       // 50 ms after the second of those: far above the determinism tolerance
  // the chips the click test presses: the first, the first 3D chapter, FLOORS, PLASTER & PAINT, and the last. Found by name, so inserting a chapter keeps them right.
  chips: (film) => {
    const c = film.chapters, byName = (n) => c.findIndex((x) => x.name === n);
    return [0, c.findIndex((x) => x.t >= film.S), byName("FLOORS"), byName("PLASTER & PAINT"), c.length - 1];
  },
};

// ---- the independent review's checks (review.test.mjs)
export const REVIEW = {
  ariaAt: 50,              // a time with a chapter running (the intro has none): exactly one chip must be aria-current
};

// ---- the MP4 export (export.test.mjs). CAD clip = absolute seconds; the 3D clips are S + these offsets
export const EXPORT = {
  cad: [10, 12],
  threeD: [12, 14],        // a short 3D clip, encoded twice (determinism)
  long: [10, 22],          // a 12 s 3D clip through the picker: more than 32 MiB, so the muxer writes chunks while it runs
  // Two exports of the same range must decode to identical frames or agree to this PSNR (dB, whole clip). The 2D clip comes out frame-identical every time.
  // A 3D clip does not, and the cause was measured (2026-10-31): the frames the page hands to the encoder were hashed in two runs of the same range, and
  // 0 to 4 of 120 differ, by ONE level in a couple of pixels (GPU float noise; player.test.mjs allows 64 pixels of delta 1 for the same reason). The encoder
  // turns that into a different bitstream from that frame on, so the whole-clip PSNR between the two files lands anywhere from 57 dB to identical (94.9 dB on a
  // quiet run, 66.7 and 56.9 dB on busy ones, the difference growing towards the end of the clip). 60 dB flaked. A render that is really not repeatable
  // (wall-clock state, a random seed) differs by whole pixels and lands far below 50.
  determinismDb: 50,
};

// ---- the catalogue entry (catalog.test.mjs)
export const CATALOG = { slug: "plan-to-build" };
