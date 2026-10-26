// Transmitting sites. Each stands for a country's (or city's) main broadcast mast(s):
// lat/lon in degrees, h = antenna height above ground+hill (m, for the horizon dip),
// start/ramp in decimal years, erp0 -> erpMax in kW (vision, peak, order-of-magnitude),
// analogOff = year the analogue picture signal was replaced by (lower-power, noise-like) digital.
// Dates are the start of regular public VHF/UHF television service as best recalled; powers are
// order-of-magnitude. Treat the whole table as an informed model, not a registry.
const T = (id, name, cc, lat, lon, start, erp0, erpMax, ramp, o = {}) =>
  ({ id, name, cc, lat, lon, start, erp0, erpMax, ramp, h: 300, kind: "tv", ...o });

export const SITES = [
  // --- United Kingdom & Ireland
  T("gb-london", "London - Alexandra/Crystal Palace", "GB", 51.594, -0.1305, 1936.837, 17, 1000, 28, { gaps: [[1939.67, 1946.44]], analogOff: 2012.3 }),
  T("gb-sutton", "Sutton Coldfield", "GB", 52.590, -1.822, 1949.96, 34, 1000, 25, { analogOff: 2011.9 }),
  T("gb-holme", "Holme Moss", "GB", 53.533, -1.858, 1951.78, 45, 1000, 25, { analogOff: 2012.0 }),
  T("gb-kirk", "Kirk o'Shotts", "GB", 55.867, -3.800, 1952.2, 45, 600, 25, { analogOff: 2010.0 }),
  T("gb-wenvoe", "Wenvoe", "GB", 51.462, -3.265, 1952.62, 45, 500, 25, { analogOff: 2009.7 }),
  T("ie-dublin", "Dublin - Kippure", "IE", 53.116, -6.340, 1961.99, 50, 400, 20, { analogOff: 2012.9 }),
  // --- Germany, France, Benelux, Alps
  T("de-berlin", "Berlin - Witzleben/Fernsehturm", "DE", 52.503, 13.277, 1935.2, 8, 800, 40, { gaps: [[1944.8, 1952.9]], analogOff: 2003.6 }),
  T("de-hamburg", "Hamburg", "DE", 53.559, 9.984, 1952.95, 40, 500, 30, { analogOff: 2005.0 }),
  T("de-munich", "Munich", "DE", 48.137, 11.575, 1953.85, 40, 500, 30, { analogOff: 2008.5 }),
  T("fr-paris", "Paris - Eiffel Tower", "FR", 48.858, 2.295, 1935.5, 30, 800, 35, { gaps: [[1940.4, 1943.2]], h: 330, analogOff: 2011.9 }),
  T("nl-hilversum", "Hilversum", "NL", 52.229, 5.167, 1951.8, 25, 500, 25, { analogOff: 2006.9 }),
  T("be-brussels", "Brussels", "BE", 50.850, 4.352, 1953.3, 40, 400, 25, { analogOff: 2010.0 }),
  T("it-rome", "Rome - Monte Mario", "IT", 41.930, 12.450, 1954.0, 40, 1000, 30, { analogOff: 2012.0 }),
  T("es-madrid", "Madrid - Torrespaña", "ES", 40.417, -3.704, 1956.82, 40, 1000, 30, { analogOff: 2010.25 }),
  T("ch-zurich", "Zurich - Uetliberg", "CH", 47.352, 8.492, 1953.0, 30, 300, 25, { analogOff: 2007.9 }),
  // --- Nordic, Central & Eastern Europe, USSR
  T("se-stockholm", "Stockholm", "SE", 59.329, 18.069, 1956.7, 30, 500, 25, { analogOff: 2007.9 }),
  T("no-oslo", "Oslo", "NO", 59.914, 10.752, 1960.64, 40, 400, 20, { analogOff: 2009.9 }),
  T("fi-helsinki", "Helsinki", "FI", 60.170, 24.938, 1957.0, 30, 400, 20, { analogOff: 2007.7 }),
  T("dk-copenhagen", "Copenhagen", "DK", 55.676, 12.568, 1951.7, 20, 500, 25, { analogOff: 2009.9 }),
  T("pl-warsaw", "Warsaw", "PL", 52.230, 21.012, 1952.8, 30, 500, 30, { analogOff: 2013.5 }),
  T("cz-prague", "Prague", "CZ", 50.076, 14.438, 1953.4, 40, 500, 30, { analogOff: 2011.6 }),
  T("hu-budapest", "Budapest", "HU", 47.498, 19.040, 1957.9, 40, 400, 25, { analogOff: 2013.0 }),
  T("ru-moscow", "Moscow - Shabolovka/Ostankino", "RU", 55.820, 37.612, 1939.2, 20, 1500, 40, { gaps: [[1941.5, 1945.5]], h: 500, analogOff: 2019.4 }),
  T("tr-istanbul", "Istanbul", "TR", 41.008, 28.978, 1968.0, 50, 500, 25, { analogOff: 2015.4 }),
  T("il-jerusalem", "Jerusalem", "IL", 31.768, 35.214, 1966.3, 40, 300, 20, { analogOff: 2011.9 }),
  // --- Asia
  T("jp-tokyo", "Tokyo - Tokyo Tower", "JP", 35.659, 139.745, 1953.1, 30, 1000, 25, { h: 333, analogOff: 2011.55 }),
  T("kr-seoul", "Seoul", "KR", 37.567, 126.978, 1956.4, 20, 600, 25, { analogOff: 2012.9 }),
  T("cn-beijing", "Beijing", "CN", 39.904, 116.407, 1958.35, 30, 1000, 30, { analogOff: 2020.0 }),
  T("in-delhi", "Delhi", "IN", 28.614, 77.209, 1959.7, 20, 1000, 40, { analogOff: 2019.0 }),
  T("ph-manila", "Manila", "PH", 14.600, 120.984, 1953.9, 20, 300, 25, { analogOff: 2023.0 }),
  T("th-bangkok", "Bangkok", "TH", 13.756, 100.502, 1955.4, 20, 500, 25, { analogOff: 2018.0 }),
  T("id-jakarta", "Jakarta", "ID", -6.209, 106.846, 1962.65, 30, 500, 25, { analogOff: 2022.9 }),
  T("sg-singapore", "Singapore", "SG", 1.352, 103.820, 1963.1, 30, 300, 20, { analogOff: 2019.9 }),
  T("ir-tehran", "Tehran", "IR", 35.689, 51.389, 1958.7, 30, 600, 25, { analogOff: 2020.0 }),
  // --- Americas
  T("us-nyc", "New York - Empire State Building", "US", 40.748, -73.986, 1939.33, 10, 5000, 45, { h: 380, analogOff: 2009.45 }),
  T("us-chicago", "Chicago", "US", 41.879, -87.636, 1941.5, 10, 5000, 40, { h: 340, analogOff: 2009.45 }),
  T("us-la", "Los Angeles - Mount Wilson", "US", 34.226, -118.064, 1947.05, 10, 5000, 40, { h: 1700, analogOff: 2009.45 }),
  T("us-dallas", "Dallas", "US", 32.777, -96.797, 1949.7, 20, 5000, 40, { analogOff: 2009.45 }),
  T("ca-toronto", "Toronto - CN Tower", "CA", 43.643, -79.387, 1952.7, 20, 1500, 35, { h: 450, analogOff: 2011.65 }),
  T("mx-city", "Mexico City", "MX", 19.433, -99.133, 1950.65, 20, 1000, 35, { analogOff: 2015.99 }),
  T("cu-havana", "Havana", "CU", 23.114, -82.367, 1950.8, 20, 300, 25, { analogOff: 2022.0 }),
  T("co-bogota", "Bogota", "CO", 4.711, -74.072, 1954.5, 20, 400, 25, { analogOff: 2024.0 }),
  T("pe-lima", "Lima", "PE", -12.046, -77.043, 1958.1, 20, 300, 25, { analogOff: 2020.0 }),
  T("br-saopaulo", "Sao Paulo", "BR", -23.551, -46.633, 1950.72, 20, 1000, 35, { h: 400, analogOff: 2016.0 }),
  T("ar-buenos", "Buenos Aires", "AR", -34.604, -58.382, 1951.8, 20, 500, 30, { analogOff: 2024.5 }),
  T("cl-santiago", "Santiago", "CL", -33.449, -70.669, 1957.4, 20, 300, 25, { analogOff: 2024.5 }),
  // --- Africa
  T("eg-cairo", "Cairo", "EG", 30.044, 31.236, 1960.55, 30, 500, 25, { analogOff: 2022.0 }),
  T("ng-ibadan", "Ibadan / Lagos", "NG", 7.378, 3.947, 1959.8, 10, 300, 25, { analogOff: 2020.0 }),
  T("ke-nairobi", "Nairobi", "KE", -1.292, 36.822, 1962.5, 10, 300, 25, { analogOff: 2015.5 }),
  T("za-joburg", "Johannesburg - Brixton", "ZA", -26.204, 28.047, 1976.02, 50, 1000, 20, { h: 250, analogOff: 2022.0 }),
  // --- Oceania
  T("au-sydney", "Sydney - Willoughby", "AU", -33.869, 151.209, 1956.70, 20, 500, 30, { analogOff: 2013.0 }),
  T("au-melbourne", "Melbourne - Mount Dandenong", "AU", -37.814, 144.963, 1956.85, 20, 500, 30, { analogOff: 2013.5 }),
  T("nz-auckland", "Auckland", "NZ", -36.849, 174.763, 1960.5, 10, 300, 25, { analogOff: 2013.9 }),
];
// Radar: narrow beams, enormous EIRP (W) but only for a few percent of the time, pointed at planets near the ecliptic.
export const RADARS = [
  { id: "radar-arecibo", name: "Arecibo planetary radar", cc: "PR", kind: "radar", lat: 18.344, lon: -66.753, h: 0,
    start: 1963.9, end: 2020.92, erp0: 2e10, erpMax: 2e13, ramp: 25, maxZenith: 20, duty: 0.012, runH: [1.5, 3.5] },
  { id: "radar-goldstone", name: "Goldstone Solar System Radar", cc: "US", kind: "radar", lat: 35.426, lon: -116.890, h: 0,
    start: 1961.0, end: null, erp0: 1e9, erpMax: 1e13, ramp: 30, maxZenith: 70, duty: 0.012, runH: [1.5, 3.5] },
];
export const ALL_SOURCES = [...SITES, ...RADARS];
export const siteById = Object.fromEntries(ALL_SOURCES.map(s => [s.id, s]));

// Deliberate messages: very bright, very narrow, very short. (ra,dec) J2000 of the target.
// Times are the day recorded; the hour is placed at the target's transit at the dish (an assumption).
export const BEACONS = [
  { id: "arecibo-1974", name: "Arecibo Message", date: [1974, 11, 16], site: "radar-arecibo", ra: 250.423, dec: 36.460, targetName: "Globular cluster M13", targetLy: 22200, mins: 3, eirp: 2e13,
    blurb: "169 seconds of binary, 1,679 bits, aimed at M13. It will arrive in about 22,000 years." },
  { id: "doritos-2008", name: "Doritos advert", date: [2008, 6, 12], site: { lat: 78.153, lon: 16.029, name: "EISCAT Svalbard" }, ra: 164.866, dec: 40.43, targetName: "47 Ursae Majoris", targetLy: 45.9, mins: 8, eirp: 2e10,
    blurb: "A 30-second crisp advert, beamed at a Sun-like star with a planet. It arrives in the early 2050s." },
  { id: "mfe-2008", name: "A Message From Earth", date: [2008, 10, 9], site: { lat: 45.189, lon: 33.186, name: "Yevpatoria RT-70" }, ra: 229.858, dec: -7.722, targetName: "Gliese 581", targetLy: 20.4, mins: 20, eirp: 1e12,
    blurb: "501 messages chosen on social media, aimed at a red dwarf with candidate planets. It arrives in 2029." },
];
