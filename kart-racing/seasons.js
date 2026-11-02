// Apex Karts - seasonal events: which one (if any) is on today. Pure date logic, no THREE, no DOM.
//
//   Halloween  24 Oct - 7 Nov     (a week either side of the 31st)
//   Christmas  1 Dec - 31 Dec     (all of December)
//   Easter     Easter Sunday +/- 7 days (computed for the year; moves between 22 Mar and 25 Apr)
//
// resolveSeason() also honours two URL overrides so the events can be previewed any day of the year:
//   ?season=halloween|christmas|easter   force one          ?season=none   force none
//   ?date=YYYY-MM-DD                     pretend today is that date
// and the "Seasonal fun" setting: "auto" (calendar), "off", or one of the season ids (preview).

export const SEASONS = {
  halloween: { id: "halloween", name: "Halloween", emoji: "\u{1F383}", snowy: false },
  christmas: { id: "christmas", name: "Christmas", emoji: "\u{1F384}", snowy: true },
  easter: { id: "easter", name: "Easter", emoji: "\u{1F430}", snowy: false },
};

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher). Returns the month (3 = March, 4 = April) and day.
export function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

// whole days since the epoch for a calendar date (UTC maths, so daylight saving can never shift a window)
const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);

// id of the season whose window contains the date's local calendar day, or null
export function seasonOn(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth() + 1, n = dayNum(y, m, date.getDate());
  const e = easterSunday(y);
  if (Math.abs(n - dayNum(y, e.month, e.day)) <= 7) return "easter";
  if (n >= dayNum(y, 10, 24) && n <= dayNum(y, 11, 7)) return "halloween";
  if (m === 12) return "christmas";
  return null;
}

export function resolveSeason({ search = "", mode = "auto", now = new Date() } = {}) {
  let q = null;
  try { q = new URLSearchParams(search); } catch (e) { q = new URLSearchParams(""); }
  const forced = (q.get("season") || "").toLowerCase();
  if (forced === "none" || forced === "off") return null;
  if (SEASONS[forced]) return { ...SEASONS[forced], source: "url" };
  if (mode === "off") return null;
  if (SEASONS[mode]) return { ...SEASONS[mode], source: "setting" };
  const dq = q.get("date");
  const m = dq && /^(\d{4})-(\d{2})-(\d{2})$/.exec(dq);
  const when = m ? new Date(+m[1], +m[2] - 1, +m[3]) : now;
  const id = seasonOn(when);
  return id ? { ...SEASONS[id], source: m ? "date" : "calendar" } : null;
}
