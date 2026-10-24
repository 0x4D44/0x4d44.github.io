// Guided tour keyframes. t in seconds; logR = log10 of view radius in ly; dT = years relative to "now".
// Between keys everything eases; solo/hl/star/cap come from the preceding key.
export const TOUR_LEN = 64;
export const TOUR_KEYS = [
  { t: 0,  logR: -4.4, yaw: 0.6, pitch: 0.5, dT: -90, solo: ["GB"], cap: "1936: the BBC starts regular television from Alexandra Palace. Every programme leaves the planet." },
  { t: 7,  logR: -2.6, yaw: 1.4, pitch: 0.4, dT: -89.5, solo: ["GB"], cap: "Each ring is a minute of broadcast, thrown out along the horizon in every direction." },
  { t: 14, logR: -0.4, yaw: 2.4, pitch: 0.3, dT: -80, solo: ["GB"], cap: "Earth spins, so the fan sweeps the sky: a spiral, one turn per light-day." },
  { t: 22, logR: 0.9,  yaw: 3.2, pitch: 0.55, dT: -40, solo: ["GB"], spin: 0.02, cap: "Only the sky within 90° of latitude of the pole ever hears Britain." },
  { t: 30, logR: 1.6,  yaw: 3.9, pitch: 0.5, dT: -10, solo: null, cap: "Now add every country. Colours are nations; dense bands are where fans overlap." },
  { t: 38, logR: 2.05, yaw: 4.6, pitch: 0.35, dT: 0, solo: null, spin: 0.03, cap: "The bubble is ninety light-years across. Nothing outside it has heard of us." },
  { t: 46, logR: 1.0,  yaw: 5.2, pitch: 0.4, dT: 0, solo: null, star: "Tau Ceti", cap: "Pick a star. Tau Ceti hears the Earth of twelve years ago, for a few minutes, twice a day." },
  { t: 54, logR: 0.5,  yaw: 5.6, pitch: 0.3, dT: 0, solo: null, star: "Sirius", hl: "wc-1966", cap: "Light up one broadcast: the 1966 World Cup final, still travelling." },
  { t: 64, logR: 2.1,  yaw: 6.6, pitch: 0.45, dT: 0, solo: null, cap: "Pause on a single broadcast, a ring a few minutes thick, going out at the speed of light." },
];
