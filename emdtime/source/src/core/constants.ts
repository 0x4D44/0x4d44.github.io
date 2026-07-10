/**
 * Physical constants (SI). Values are CODATA / IAU nominal where applicable.
 *
 * The whole timekeeping system is anchored to the SI second, which is FIXED:
 * the Cesium-133 hyperfine transition (9,192,631,770 periods). Optical-lattice
 * clocks (Sr/Yb) are ~100x more accurate and are the basis for the planned SI
 * redefinition; they keep the SAME second length, only pin it down more precisely.
 */

/** Speed of light in vacuum (exact, SI). m/s */
export const C_LIGHT = 299_792_458;

/** 1% of the speed of light — the hard upper bound on both rotation and orbital speed. m/s */
export const ONE_PERCENT_C = 0.01 * C_LIGHT; // 2,997,924.58 m/s

/** WGS-84 equatorial radius of Earth. m */
export const EARTH_EQ_RADIUS = 6_378_137;

/** Equatorial circumference = 2·π·R. m */
export const EARTH_EQ_CIRCUMFERENCE = 2 * Math.PI * EARTH_EQ_RADIUS; // 40,075,016.7 m

/** Standard equatorial surface gravity (before spin correction). m/s^2 */
export const EARTH_EQ_GRAVITY = 9.780;

/** Astronomical unit (IAU 2012 definition, exact). m */
export const AU = 1.495_978_707e11;

/** Heliocentric gravitational parameter GM_sun (IAU nominal). m^3/s^2 */
export const GM_SUN = 1.327_124_400_18e20;

/** Present conventional day. s */
export const CONVENTIONAL_DAY = 86_400;

/** Present sidereal year (Kepler-consistent orbital period at 1 AU). s */
export const SIDEREAL_YEAR = 365.256_363 * CONVENTIONAL_DAY; // 3.15581e7 s

/**
 * Habitable-zone bounds around the present Sun, in AU (Kopparapu et al.).
 *  - conservative: runaway greenhouse .. maximum greenhouse
 *  - optimistic:   recent Venus .. early Mars
 */
export const HZ = {
  conservative: { inner: 0.95, outer: 1.37 },
  optimistic: { inner: 0.75, outer: 1.77 },
} as const;

/** Rotation-speed bounds from the brief. m/s */
export const ROTATION_SPEED_MIN = 1_000; // 1 km/s
export const ROTATION_SPEED_MAX = ONE_PERCENT_C;
