// Casting: who lives in the barrio. PURE (no THREE, no DOM): `planCast` turns the plan's lots + the character library's meta into a list of
// inhabitants (persona, character, name, home, garment variant), the same for the same seed, so tests can check counts and diversity under Node.
//
//   shopkeepers  one per shop lot, a character of the right gender (a lot called "Doña Rosa" gets a woman), living in the shop
//   community    PERSONAS[x].quota of each community persona, homes spread over the residential lots, interleaved so a smaller `count` keeps the mix
//   households   (optional) the interiors' households per lot: a resident IS a member of the household they live in, with that member's name (hh.names.woman / man / kid / kid2 and
//                the surname), so a diary that says "Camila" is about the girl who lives there
import { PERSONAS, SHOP_PERSONAS, COMMUNITY_PERSONAS, ageOf, genderOf, bankOf, bankFits, makeName, nameFromLot, roleLabel, kidGender } from './personas.js';
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
 * Who can be cast from a household: { woman, man, kid, kid2 } -> true while that member has no resident yet. A family has its parents and as many children as `hh.kids` (the interiors name
 * at most two); a student flat has two young people, who are `kid` and `kid2` (the names the diaries' 'young' voice is written under, js/interiors/content.js authorOf).
 */
const freeOf = (hh) => {
  const nm = hh.names, k = hh.kids ?? 0;
  if (hh.kind === 'students') return { woman: false, man: false, kid: !!nm.kid, kid2: !!nm.kid2 };
  return { woman: !!nm.woman, man: !!nm.man, kid: k >= 1 && !!nm.kid, kid2: k >= 2 && !!nm.kid2 };
};
/** The places in the households of `lots` a person can fill: { lot, hh, name: hh.names, adults, free: { woman, man, kid, kid2 } }. */
function placesOf(lots, households) {
  const out = [];
  for (const lot of lots) for (const hh of households?.get(lot.id) ?? []) {
    if (!hh?.names?.sur) continue;
    out.push({ lot, hh, name: hh.names, adults: !lot.shop, free: freeOf(hh) });
  }
  return out;
}
const genderOfRole = (role, first) => (role === 'woman' ? 'f' : role === 'man' ? 'm' : kidGender(first));
/** The members of household `hh` a persona can be, in the order it prefers (an 'any' persona, a street vendor, takes either grown-up). */
function rolesOf(persona, hh, r) {
  if (persona.age === 'kid') return ['kid', 'kid2'];
  if (persona.age === 'teen') return ['kid2', 'kid'];
  const want = persona.gender === 'any' ? null : persona.gender;
  const fit = (hh.kind === 'students' ? ['kid', 'kid2'] : ['woman', 'man']).filter((role) => !want || genderOfRole(role, hh.names[role]) === want);
  return want || r.chance(0.5) ? fit : fit.reverse();
}
/** The characters of `list` that look young (the library tags them 'young'): who a student flat's residents are drawn as. */
const youngOf = (list, charMetas) => list.filter((c) => (charMetas.get(c)?.tags ?? []).includes('young'));

/**
 * @param plan       { lots:[{id,kind,shop?,name,entrance:{outside}}], ... }
 * @param charMetas  Map<charId, meta> (meta.tags, meta.slots)
 * @param rng        a makeRng() stream (never Math.random)
 * @param count      cast this many (default: everybody); the shops always come first
 * @param households Map<lotId, hh[]> (interiors/household.js `householdsOf`, or bp.interior.hh): the residents take the names of the members of the households they live in
 * @returns [{ index, id, persona, bank, charId, gender, age, role, name, shopLot, homeLot, household, variant, appearance }]  household = { id, role, lot, matched } | null
 *          (matched: the name is the household's member's; false for a shopkeeper whose shop sign names them: "Doña Rosa" keeps the sign's name, only the surname is the household's)
 */
export function planCast({ plan, charMetas, rng, count = null, households = null }) {
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

  const used = new Map(), usedBy = new Map(), names = new Set(), fullNames = new Set(), firsts = new Set(), looks = new Set(), homeUse = new Map(), out = [];
  const places = placesOf([...homes, ...shopLots], households);
  /**
   * The character for the next member of `persona`: the one THIS persona has used least first (the members of a persona share their haunts, the mototaxi stand, the building site, the
   * court: three riders are three bodies before any of them is a twin), then the one used least overall; ties keep the persona's own preference order.
   */
  const take = (list, persona) => {
    const mine = usedBy.get(persona) ?? usedBy.set(persona, new Map()).get(persona);
    let best = null, bm = Infinity, bu = Infinity;
    for (const c of list) { const m = mine.get(c) ?? 0, u = used.get(c) ?? 0; if (m < bm || (m === bm && u < bu)) { bm = m; bu = u; best = c; } }
    mine.set(best, (mine.get(best) ?? 0) + 1);
    return best;
  };
  /**
   * A free member of a household for this persona, as [place, role]: the elders are the elderly couples, the children live where there are children (a teenager where the interiors put
   * one), a student flat takes only a persona the library can draw young. An unseen full name first (no two neighbours "Camila Restrepo"), then an unseen FIRST name (the households'
   * pools repeat a name here and there: two residents are not both "Doña Amparo" while another household's member has a name nobody bears), then the least occupied home, random among ties.
   */
  const pickPlace = (persona, r) => {
    let best = [], bs = Infinity;
    const child = persona.age === 'kid' || persona.age === 'teen';
    for (const pl of places) {
      const hh = pl.hh;
      if (!pl.adults && !child) continue;                                                                 // the grown-ups of a shop's household are its shopkeepers
      if (child ? !(hh.kids >= 1) : persona.age === 'elder' ? hh.kind !== 'elder' : hh.kind === 'elder') continue;
      for (const role of rolesOf(persona, hh, r)) {
        if (!pl.free[role]) continue;
        const first = pl.name[role], list = candidates(persona, charMetas, genderOfRole(role, first));
        if (!list.length || (hh.kind === 'students' && !youngOf(list, charMetas).length)) continue;      // the library has nobody of that gender (or nobody young) for this persona
        const score = (fullNames.has(`${first} ${pl.name.sur}`) ? 100 : 0) + (firsts.has(first) ? 60 : 0) + (persona.age === 'teen' && !hh.teen ? 50 : 0) + (homeUse.get(pl.lot.id) ?? 0);
        if (score < bs) { bs = score; best = [[pl, role]]; } else if (score === bs) best.push([pl, role]);
        break;
      }
    }
    return best.length ? r.pick(best) : null;
  };
  wanted.forEach((w, index) => {
    const r = rng.fork('cast:' + index), persona = PERSONAS[w.persona];
    const fixed = w.shopLot ? nameFromLot(w.shopLot.name) : null;
    const slot = w.shopLot ? null : pickPlace(persona, r);                  // [place, role]: who in which household this resident is
    let list = candidates(persona, charMetas, slot ? genderOfRole(slot[1], slot[0].name[slot[1]]) : fixed?.gender ?? null);
    if (slot?.[0].hh.kind === 'students') list = youngOf(list, charMetas);
    if (!list.length) list = candidates(persona, charMetas);              // the lot says "Doña" but no woman fits: keep the character, drop the honorific
    if (!list.length) list = persona.chars.filter((c) => charMetas.has(c));
    if (!list.length) return;                                             // library lacks every character of this persona
    const charId = take(list, w.persona); used.set(charId, (used.get(charId) ?? 0) + 1);
    const meta = charMetas.get(charId), tags = meta.tags ?? [], gender = genderOf(tags), age = ageOf(tags);
    const useFixed = fixed && fixed.gender === gender ? fixed : null;
    let homeLot = w.shopLot ?? null, household = null, from = null;
    if (slot && genderOfRole(slot[1], slot[0].name[slot[1]]) === gender) {   // a member of that household
      const [pl, role] = slot, first = pl.name[role];
      from = { first, sur: pl.name.sur }; homeLot = pl.lot; pl.free[role] = false; fullNames.add(`${first} ${pl.name.sur}`);
      household = { id: pl.hh.id, role, lot: pl.lot.id, matched: true };
    } else if (w.shopLot) {                                               // the keeper lives in the shop: the household of its flat (hh.kind 'shopkeeper'), the surname at least
      const hhs = households?.get(w.shopLot.id) ?? [], hh = hhs.find((h) => h.kind === 'shopkeeper' && h.names) ?? hhs.find((h) => h.names);
      if (hh) {
        const role = gender === 'f' ? 'woman' : 'man', first = hh.names[role];
        from = { first: useFixed?.first ?? first, sur: hh.names.sur };
        household = { id: hh.id, role, lot: w.shopLot.id, matched: !useFixed || useFixed.first === first };
      }
    }
    const name = makeName(r, gender, age, w.persona, useFixed, names, from, tags.includes('young'));
    fullNames.add(name.full); firsts.add(name.first);                     // (a shopkeeper's sign name counts too: nobody later is "Fanny Chará" as well)
    if (!homeLot && homes.length) {                                       // spread over the homes: the least occupied one, random among ties
      let bu = Infinity, pool = [];
      for (const h of homes) { const u = homeUse.get(h.id) ?? 0; if (u < bu) { bu = u; pool = [h]; } else if (u === bu) pool.push(h); }
      homeLot = r.pick(pool);
    }
    if (homeLot && !w.shopLot) homeUse.set(homeLot.id, (homeUse.get(homeLot.id) ?? 0) + 1);
    const variant = makeVariant({ ...meta, id: charId }, r.fork('look'), looks);
    const appearance = appearanceKey(charId, variant); looks.add(appearance);
    out.push({
      index, id: 'n' + String(out.length).padStart(2, '0'), persona: w.persona, bank: bankOf(w.persona), charId, gender, age,
      role: roleLabel(w.persona, gender), name, shopLot: w.shopLot ?? null, homeLot, household, variant, appearance,
    });
  });
  // Two neighbours who are both "Doña Gilma" (the households draw from twelve first names): both take their surname, "Doña Gilma Cano" and "Doña Gilma Pineda".
  const by = new Map();
  for (const c of out) { const k = c.name.display; (by.get(k) ?? by.set(k, []).get(k)).push(c); }
  for (const list of by.values()) if (list.length > 1) for (const c of list) c.name = { ...c.name, display: `${c.name.display} ${c.name.sur}` };
  return out;
}

/** The banks no cast member would ever speak (should be none with the default quotas), for tests. */
export function unusedBanks(cast, personaIds = Object.keys(PERSONAS)) {
  const seen = new Set(cast.map((c) => c.bank));
  return personaIds.map(bankOf).filter((b) => !seen.has(b));
}
export { bankFits };
