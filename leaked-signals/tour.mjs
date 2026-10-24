// Guided tour keyframes. t in seconds; T = absolute observer year (omit for "now"); logR = log10 of view radius, ly.
// Radius is kept near log10(age in ly * 1.3) so the shell stays on screen. Between keys everything eases;
// solo/hl/star/cap come from the preceding key.
export const TOUR_LEN = 64;
export const TOUR_KEYS = [
  { t: 0,  logR: -3.45, yaw: 0.6, pitch: 0.5, T: 1936.8302, solo: ["GB"], cap: "November 1936: the BBC starts regular television from Alexandra Palace. Each dot is a piece of a broadcast, already leaving." },
  { t: 7,  logR: -1.9,  yaw: 1.4, pitch: 0.4, T: 1936.84, solo: ["GB"], cap: "Each ring is a slice of broadcast time, thrown out along the horizon in every direction." },
  { t: 14, logR: 0.35,  yaw: 2.4, pitch: 0.3, T: 1938.5, solo: ["GB"], cap: "Earth spins, so the fan sweeps the sky. Layer after layer it winds into a spiral: one turn per light-day." },
  { t: 22, logR: 1.5,   yaw: 3.2, pitch: 0.55, T: 1960, solo: ["GB"], spin: 0.02, cap: "From Britain the beams only reach declinations within 38° of the celestial equator. Stars near either pole never get a direct hit." },
  { t: 30, logR: 1.85,  yaw: 3.9, pitch: 0.5, T: 1990, solo: null, cap: "Now add every country. Colour is the nation, and each latitude sweeps its own band of sky." },
  { t: 38, logR: 2.05,  yaw: 4.6, pitch: 0.35, solo: null, spin: 0.03, cap: "The bubble is ninety light-years in radius. Nothing outside it has heard of us." },
  { t: 46, logR: 1.0,   yaw: 5.2, pitch: 0.4, solo: null, star: "Tau Ceti", cap: "Pick a star. Tau Ceti, 12 light-years away, hears Earth as it was twelve years ago, for about an hour, twice a day." },
  { t: 54, logR: 0.5,   yaw: 5.6, pitch: 0.3, solo: null, star: "Sirius", hl: "wc-1966", cap: "Light up one broadcast: the 1966 World Cup final, a shell two and a half hours thick, still travelling." },
  { t: 64, logR: 2.1,   yaw: 6.6, pitch: 0.45, solo: null, cap: "The programmes keep going. This year the earliest ones are about ninety light-years out." },
];
