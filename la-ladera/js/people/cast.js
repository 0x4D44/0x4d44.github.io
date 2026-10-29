// Casting: who lives in the barrio. PURE (no THREE, no DOM): `planCast` turns the plan's lots + the character library's meta into a list of
// inhabitants (persona, character, name, home, garment variant), the same for the same seed, so tests can check counts and diversity under Node.
//
//   shopkeepers  one per shop lot, a character of the right gender (a lot called "Doña Rosa" gets a woman), living in the shop
//   community    PERSONAS[x].quota of each community persona, homes spread over the residential lots, interleaved so a smaller `count` keeps the mix
import { PERSONAS, SHOP_PERSONAS, COMMUNITY_PERSONAS, ageOf, genderOf, bankOf, bankFits, makeName, nameFromLot, roleLabel } from './personas.js';
import { makeVariant, appearanceKey } from './look.js';

export const HOME_KINDS = new Set(['house', 'rowhouse', 'apartments', 'tenement', 'courtyard']);
export const isHomeLot = (lot) => !lot.shop && HOME_KINDS.has(lot.kind);

/** Character ids a persona may use, in preference order, restricted to the library and to the gender it needs. */
export function candidates(persona, charMetas, gender = null) {
  const want = gender ?? (persona.gender === 'any' ? null : persona.gender);
  return persona.chars.filter((id) => {
    const m = charMetas.get(id); if (!m) return false;
    return !want || genderOf(m.tags ?? []) === want;
  });
}

/**
 * @param plan       { lots:[{id,kind,shop?,name,entrance:{outside}}], ... }
 * @param charMetas  Map<charId, meta> (meta.tags, meta.slots)
 * @param rng        a makeRng() stream (never Math.random)
 * @param count      cast this many (default: everybody); the shops always come first
 * @returns [{ index, id, persona, bank, charId, gender, age, role, name, shopLot, homeLot, variant, appearance }]
 */
export function planCast({ plan, charMetas, rng, count = null }) {
  const lots = plan?.lots ?? [], shopLots = lots.filter((l) => l.shop), homes = lots.filter(isHomeLot);
  const wanted = [];
  for (const lot of shopLots) if (PERSONAS[lot.shop]?.kind === 'shop') wanted.push({ persona: lot.shop, shopLot: lot });
  const left = Object.fromEntries(COMMUNITY_PERSONAS.map((id) => [id, PERSONAS[id].quota]));
  for (let any = true; any;) {                                           // round-robin: vecina, vecino, abuela, ... then again until the quotas are used up
    any = false;
    for (const id of COMMUNITY_PERSONAS) if (left[id] > 0) { left[id]--; wanted.push({ persona: id }); any = true; }
  }
  const total = count == null ? wanted.length : Math.max(0, count | 0);
  for (let k = 0; wanted.length < total; k++) wanted.push({ persona: COMMUNITY_PERSONAS[k % COMMUNITY_PERSONAS.length] });
  wanted.length = Math.min(wanted.length, total);

  const used = new Map(), names = new Set(), looks = new Set(), homeUse = new Map(), out = [];
  const take = (list) => {                                               // least used character first; ties keep the persona's own preference order
    let best = null, bu = Infinity;
    for (const c of list) { const u = used.get(c) ?? 0; if (u < bu) { bu = u; best = c; } }
    return best;
  };
  wanted.forEach((w, index) => {
    const r = rng.fork('cast:' + index), persona = PERSONAS[w.persona];
    const fixed = w.shopLot ? nameFromLot(w.shopLot.name) : null;
    let list = candidates(persona, charMetas, fixed?.gender ?? null);
    if (!list.length) list = candidates(persona, charMetas);              // the lot says "Doña" but no woman fits: keep the character, drop the honorific
    if (!list.length) list = persona.chars.filter((c) => charMetas.has(c));
    if (!list.length) return;                                             // library lacks every character of this persona
    const charId = take(list); used.set(charId, (used.get(charId) ?? 0) + 1);
    const meta = charMetas.get(charId), tags = meta.tags ?? [], gender = genderOf(tags), age = ageOf(tags);
    const useFixed = fixed && fixed.gender === gender ? fixed : null;
    const name = makeName(r, gender, age, w.persona, useFixed, names);
    let homeLot = w.shopLot ?? null;
    if (!homeLot && homes.length) {                                       // spread over the homes: the least occupied one, random among ties
      let bu = Infinity, pool = [];
      for (const h of homes) { const u = homeUse.get(h.id) ?? 0; if (u < bu) { bu = u; pool = [h]; } else if (u === bu) pool.push(h); }
      homeLot = r.pick(pool); homeUse.set(homeLot.id, (homeUse.get(homeLot.id) ?? 0) + 1);
    }
    const variant = makeVariant({ ...meta, id: charId }, r.fork('look'), looks);
    const appearance = appearanceKey(charId, variant); looks.add(appearance);
    out.push({
      index, id: 'n' + String(out.length).padStart(2, '0'), persona: w.persona, bank: bankOf(w.persona), charId, gender, age,
      role: roleLabel(w.persona, gender), name, shopLot: w.shopLot ?? null, homeLot, variant, appearance,
    });
  });
  return out;
}

/** The banks no cast member would ever speak (should be none with the default quotas), for tests. */
export function unusedBanks(cast, personaIds = Object.keys(PERSONAS)) {
  const seen = new Set(cast.map((c) => c.bank));
  return personaIds.map(bankOf).filter((b) => !seen.has(b));
}
export { bankFits };
