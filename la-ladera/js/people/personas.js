// Personas: who lives in La Ladera. A persona = a dialogue bank + a casting rule (which characters, how many) + a routine template.
// PURE data/functions (no THREE/DOM) so tests can import it.  Every persona resolves to a bank that exists (tests/people-bank.test.mjs), every bank is
// reachable by casting, and a gendered bank (lines written as a woman / as a man) is only ever cast with that gender.
import { BANK_GENDER } from './lines/genders.js';
import { genderOf as householdNameGender } from '../interiors/content.js';
import { WOMEN, MEN, ELDER_WOMEN, ELDER_MEN, GIRLS, BOYS, SURNAMES, genderOf as poolNameGender } from './names.js';

/**
 * Names for a resident who is NOT a member of one of the interiors' households (cast.js gives the others that household member's name, whatever the households' pools are): by who the
 * name is for (people/names.js: 60+ of each, an elder from the elders' list, a child from the children's). `makeName` never takes a first name another resident already bears.
 */
export const NAMES = { f: [...ELDER_WOMEN, ...WOMEN], m: [...ELDER_MEN, ...MEN], kf: GIRLS, km: BOYS, sur: SURNAMES };
const poolFor = (gender, age) => (age === 'kid' || age === 'teen' ? (gender === 'f' ? GIRLS : BOYS) : age === 'elder' ? (gender === 'f' ? ELDER_WOMEN : ELDER_MEN) : gender === 'f' ? WOMEN : MEN);

export const AGE = {            // (pitch: a wide spread, since on a browser with one voice the pitch is all that tells a child from a grandfather)
  kid:   { pitch: 1.45, rate: 1.06, speed: 1.15 },
  teen:  { pitch: 1.15, rate: 1.06, speed: 1.35 },
  adult: { pitch: 1.0, rate: 1.0, speed: 1.3 },
  elder: { pitch: 0.86, rate: 0.86, speed: 0.95 },
};

export { BANK_GENDER };

/**
 * persona id -> casting.
 *   bank     key in lines/ (defaults to the id)
 *   kind     'shop' (one per shop lot of that `shop` type) | 'community' (`quota` of them, spread over the residential lots)
 *   gender   'f' | 'm' | 'any': the gender a character must have (a gendered bank is only cast with its own gender)
 *   age      'adult' | 'elder' | 'kid' | 'teen' (decides the honorific and the voice)
 *   role     [masculine, feminine] job label
 *   chars    candidate character ids in preference order (the library may lack some: they are skipped)
 *   title    honorific Don/Doña for adults; routine = template in brain.js
 */
export const PERSONAS = {
  // ---- the fifteen shop lots of the plan (the persona id = lot.shop; both genders can run any shop)
  tienda:     { kind: 'shop', shop: 'tienda', role: ['Tendero', 'Tendera'], routine: 'shopkeeper', chars: ['m_tendero', 'w_tendera'], title: true },
  panaderia:  { kind: 'shop', shop: 'panaderia', role: ['Panadero', 'Panadera'], routine: 'shopkeeper', chars: ['m_panadero', 'w_ama'], title: true },
  fruver:     { kind: 'shop', shop: 'fruver', role: ['Frutero', 'Frutera'], routine: 'shopkeeper', chars: ['m_vendedor', 'w_afro'], title: true },
  carniceria: { kind: 'shop', shop: 'carniceria', role: ['Carnicero', 'Carnicera'], routine: 'shopkeeper', chars: ['m_carnicero', 'm_afro', 'w_cocinera'], title: true },
  peluqueria: { kind: 'shop', shop: 'peluqueria', role: ['Barbero', 'Peluquera'], routine: 'shopkeeper', chars: ['m_afro', 'w_peluquera'], title: false },
  papeleria:  { kind: 'shop', shop: 'papeleria', role: ['Dependiente de papelería', 'Dependiente de papelería'], routine: 'shopkeeper', chars: ['w_maestra', 'm_tendero'], title: true },   // ("papelera" is also a wastepaper basket)
  drogueria:  { kind: 'shop', shop: 'drogueria', role: ['Droguista', 'Droguista'], routine: 'shopkeeper', chars: ['w_farmaceutica', 'm_tendero'], title: true },
  taller:     { kind: 'shop', shop: 'taller', role: ['Mecánico', 'Mecánica'], routine: 'shopkeeper', chars: ['m_mecanico', 'w_afro'], title: false },
  cafe:       { kind: 'shop', shop: 'cafe', role: ['Dueño del café', 'Dueña del café'], routine: 'shopkeeper', chars: ['w_ama', 'w_cocinera', 'm_tendero'], title: true },   // ("cafetero" grows coffee, "cafetera" is the coffee maker)
  restaurante: { kind: 'shop', shop: 'restaurante', role: ['Cocinero', 'Cocinera'], routine: 'shopkeeper', chars: ['w_cocinera', 'm_panadero'], title: true },
  minutos:    { kind: 'shop', shop: 'minutos', role: ['Encargado', 'Encargada'], routine: 'shopkeeper', chars: ['w_afro', 'm_afro'], title: false },
  zapateria:  { kind: 'shop', shop: 'zapateria', role: ['Zapatero', 'Zapatera'], routine: 'shopkeeper', chars: ['m_elder', 'w_elder'], title: true },
  modista:    { kind: 'shop', shop: 'modista', role: ['Modisto', 'Modista'], routine: 'shopkeeper', chars: ['w_peluquera', 'w_ama', 'm_elder'], title: true },
  ferreteria: { kind: 'shop', shop: 'ferreteria', role: ['Ferretero', 'Ferretera'], routine: 'shopkeeper', chars: ['m_abuelo', 'm_mecanico', 'w_tendera'], title: true },

  // ---- the neighbours
  vecina:     { kind: 'community', gender: 'f', age: 'adult', role: ['Vecino', 'Vecina'], routine: 'homemaker', quota: 9, chars: ['w_ama', 'w_afro', 'w_tendera', 'w_peluquera', 'w_cocinera', 'w_vecina', 'w_joven'], title: true },
  vecino:     { kind: 'community', gender: 'm', age: 'adult', role: ['Vecino', 'Vecina'], routine: 'neighbour', quota: 7, chars: ['m_afro', 'm_tendero', 'm_vendedor', 'm_joven', 'm_don'], title: true },
  abuela:     { kind: 'community', gender: 'f', age: 'elder', role: ['Abuelo', 'Abuela'], routine: 'elder', quota: 5, chars: ['w_elder'], title: true },
  abuelo:     { kind: 'community', gender: 'm', age: 'elder', role: ['Abuelo', 'Abuela'], routine: 'elder', quota: 4, chars: ['m_abuelo', 'm_elder'], title: true },
  nino:       { kind: 'community', gender: 'any', age: 'kid', role: ['Niño', 'Niña'], routine: 'kid', quota: 10, chars: ['b_boy', 'g_girl', 'b_escolar', 'g_escolar'], title: false },
  adolescente: { kind: 'community', gender: 'any', age: 'teen', role: ['Joven', 'Joven'], routine: 'teen', quota: 7, chars: ['t_boy', 't_girl', 'm_rapado'], title: false },
  // ---- the people who work in the barrio
  obrero:     { kind: 'community', gender: 'm', age: 'adult', role: ['Obrero', 'Obrera'], routine: 'worker', quota: 4, chars: ['m_obrero', 'm_afro', 'm_don'], title: true },
  maestra:    { kind: 'community', gender: 'f', age: 'adult', role: ['Maestro', 'Maestra'], routine: 'teacher', quota: 2, chars: ['w_maestra'], title: true },
  enfermera:  { kind: 'community', gender: 'f', age: 'adult', role: ['Enfermero', 'Enfermera'], routine: 'nurse', quota: 2, chars: ['w_farmaceutica'], title: true },
  mototaxista: { kind: 'community', gender: 'm', age: 'adult', role: ['Mototaxista', 'Mototaxista'], routine: 'moto', quota: 3, chars: ['m_mototaxi', 'm_joven', 'm_afro'], title: false },
  ambulante:  { kind: 'community', gender: 'any', age: 'adult', role: ['Vendedor ambulante', 'Vendedora ambulante'], routine: 'vendor', quota: 3, chars: ['m_vendedor', 'w_cocinera'], title: false },
  beata:      { kind: 'community', gender: 'f', age: 'elder', role: ['Beato', 'Beata'], routine: 'beata', quota: 2, chars: ['w_beata'], title: true },
};

/** Persona ids in casting order: the shops first (one per shop lot), then the community round-robin. */
export const SHOP_PERSONAS = Object.keys(PERSONAS).filter((k) => PERSONAS[k].kind === 'shop');
export const COMMUNITY_PERSONAS = Object.keys(PERSONAS).filter((k) => PERSONAS[k].kind === 'community');

export const bankOf = (personaId) => PERSONAS[personaId]?.bank ?? personaId;
/** 'f' | 'm' | 'any': the gender the bank's own lines are written in. */
export const bankGender = (bankKey) => BANK_GENDER[bankKey] ?? 'any';
/** Can a person of `gender` ('f'|'m') speak this bank? A masculine bank never goes to a woman and the other way round. */
export const bankFits = (bankKey, gender) => { const g = bankGender(bankKey); return g === 'any' || g === gender; };

const hash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };

export function ageOf(tags) { return tags.includes('kid') ? 'kid' : tags.includes('teen') ? 'teen' : tags.includes('elder') ? 'elder' : 'adult'; }
export function genderOf(tags) { return tags.includes('woman') || tags.includes('girl') ? 'f' : 'm'; }
export const roleLabel = (personaId, gender) => { const r = PERSONAS[personaId]?.role; return r ? r[gender === 'f' ? 1 : 0] : ''; };

/** "Don Hernando" / "Doña Rosa" in a lot name -> { honor, first, gender }. */
export function nameFromLot(lotName) {
  const m = /\b(Don|Doña)\s+([A-ZÁÉÍÓÚÑ][\p{L}]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}]+)?)/u.exec(lotName ?? '');
  return m ? { honor: m[1], first: m[2], gender: m[1] === 'Doña' ? 'f' : 'm' } : null;
}

/**
 * The gender of a first name the interiors' households draw (js/interiors/household.js NAMES, where a diary's "{K}" comes from: Santiago and Mateo are boys, Valentina and Camila
 * girls). The table is the lead's (js/interiors/content.js genderOf, the one the diaries' voices use); a name it does not know is judged by its ending.
 */
export const kidGender = (first) => householdNameGender(first) ?? poolNameGender(first) ?? (/a$/i.test(String(first ?? '').trim()) ? 'f' : 'm');

/**
 * Display name, e.g. { first:'Rosa', sur:'Restrepo', honor:'Doña', display:'Doña Rosa', full:'Rosa Restrepo' }. `fixed` = { honor, first } from a lot name; `from` = { first, sur }:
 * the name of the member of the interiors' household this person is (cast.js), which is never changed to make it unique (the diary says "Camila", so she is Camila).
 * `young`: the character looks young (a student, the library's 'young' tag): nobody calls them "Don" or "Doña".
 */
export function makeName(rng, gender, age, persona, fixed = null, taken = null, from = null, young = false) {
  const pool = poolFor(gender, age);
  let first = fixed?.first ?? from?.first ?? rng.pick(pool);
  const sur = from?.sur ?? rng.pick(SURNAMES);
  const wantsTitle = (age === 'adult' || age === 'elder') && PERSONAS[persona]?.title !== false && !young;
  let honor = fixed?.honor ?? (wantsTitle ? (age === 'elder' || rng.chance(0.55) ? (gender === 'f' ? 'Doña' : 'Don') : '') : '');
  if (taken && !fixed && !from) {                                  // no two neighbours with the same display name: the next free name of the list, so one is found while there is one
    const at = pool.indexOf(first);
    for (let k = 1; k < pool.length && taken.has(`${honor} ${first}`.trim()); k++) first = pool[(at + k) % pool.length];
  }
  const display = `${honor ? honor + ' ' : ''}${first}`;
  taken?.add(display);
  return { first, sur, honor, display, full: `${first} ${sur}` };
}

/**
 * Voice parameters (stable per NPC). `age` travels with them: speech.js pitchFor() lowers a man (not a boy) when the browser's voice is not a man's. `tone` (0 to 1) is the person's place in the
 * spread of their kind (the jitter below, scaled): pitchFor walks a grown-up through its band by it, so the people of one kind do not all land on the band's edge (R3-201).
 */
export function voiceFor(id, gender, age) {
  const a = AGE[age], h = hash(id);
  const j = ((h % 21) - 10) / 100;                              // +-0.10
  return { pitch: Math.max(0.6, a.pitch * (gender === 'm' ? 0.93 : 1.0) * (1 + j)), rate: Math.max(0.7, a.rate * (1 + ((h >> 8) % 11 - 5) / 100)), gender, age, seed: h % 997, tone: (h % 21) / 20 };
}
